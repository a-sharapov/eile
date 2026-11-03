import { domainError, fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Report } from '../../../shared/kernel/report.ts';
import {
  type CompactRun,
  compactNeeds,
  type DatabaseSpace,
  shouldCompact,
  worthCompacting,
} from '../domain/compaction.ts';
import {
  DEFAULT_OFFSITE,
  type OffsiteRun,
  type OffsiteSettings,
  type OffsiteState,
  offsiteSecret,
  outdatedCopies,
  parseOffsite,
  type RemoteCopy,
  remoteName,
} from '../domain/offsite.ts';
import type {
  BackupKeys,
  Compactor,
  Copier,
  OffsiteRepository,
  ReleaseSource,
  Remote,
  RemoteStore,
  UpkeepRepository,
  UpkeepState,
} from '../domain/ports.ts';
import {
  type BackupFailure,
  type BackupRun,
  type BackupSchedule,
  copyName,
  cronOf,
  DEFAULT_SCHEDULE,
  parseSchedule,
} from '../domain/schedule.ts';
import { newerRelease, type UpdateInfo } from '../domain/version.ts';

/** Автокопии для менеджера: расписание, куда ложатся, итог последней и когда следующая. */
export type BackupStatus = {
  readonly schedule: BackupSchedule;
  readonly folder: string;
  readonly last: BackupRun | null;
  readonly failure: BackupFailure | null;
  readonly next: string | null;
  readonly running: boolean;
};

/** Проверка обновлений: включена ли, кем выключена и что нашла. */
export type UpdateStatus = {
  readonly enabled: boolean;
  /** Выключена переменной окружения CMS_NO_UPDATE_CHECK=1: в менеджере не включить. */
  readonly locked: boolean;
  readonly current: string;
  readonly latest: UpdateInfo | null;
  readonly checkedAt: string | null;
};

/** Хранилище копий для менеджера: настройки без секрета, отпечаток ключа и итог последней отправки. */
export type OffsiteStatus = {
  readonly settings: OffsiteSettings;
  readonly hasSecret: boolean;
  /** Отпечаток ключа копий; null — ключа ещё нет. */
  readonly keyId: string | null;
  readonly keyCreatedAt: string | null;
  readonly last: OffsiteRun | null;
  readonly failure: BackupFailure | null;
};

/** Ответ правки, которая создала ключ копий: ключ восстановления виден здесь и больше нигде. */
export type OffsiteChange = OffsiteStatus & { readonly recoveryKey?: string };

/** Файл базы: размер, свободное, стоит ли сжимать, хватит ли диска и последнее сжатие. */
export type DatabaseStatus = DatabaseSpace & {
  readonly worth: boolean;
  /** Сколько свободного места на диске нужно сжатию. */
  readonly needs: number;
  readonly diskFree: number;
  readonly compacted: CompactRun | null;
};

/** Настройки обслуживания для файла настроек сервера: без итогов копий и сжатий — они этой машины. */
export type UpkeepServerSettings = {
  readonly schedule: BackupSchedule | null;
  readonly checkUpdates: boolean | null;
  readonly offsite: Pick<
    OffsiteState,
    'settings' | 'secret' | 'key' | 'keyCreatedAt'
  > | null;
};

/** Что применилось из файла настроек и что поправлено по правилам переезда. */
export type UpkeepApplied = {
  readonly schedule: boolean;
  readonly checkUpdates: boolean;
  /** Абсолютный каталог копий другой машины: здесь копии ложатся в `backups` рядом с базой. */
  readonly folderReset: string | null;
  readonly offsite: boolean;
  /** Отпечатки прежнего и нового ключа копий, если ключ сменился. */
  readonly keyReplaced: { readonly from: string; readonly to: string } | null;
};

export type UpkeepPorts = {
  readonly repository: UpkeepRepository;
  readonly offsite: OffsiteRepository;
  readonly copier: Copier;
  readonly remote: Remote;
  readonly keys: BackupKeys;
  readonly compactor: Compactor;
  readonly clock: () => Date;
  readonly report: Report;
  /** Следующий запуск по выражению cron; null — не будет. */
  readonly nextRun: (cron: string, after: Date) => Date | null;
  readonly releases: ReleaseSource;
  readonly version: string;
  /** Имя файла базы без `.db`: начало имён автокопий. */
  readonly database: string;
  /** Проверку обновлений не выключили переменной окружения. */
  readonly updateCheck: boolean;
  /** Расписание сменилось: фону — перезапустить задачу. */
  readonly rescheduled: (schedule: BackupSchedule) => void;
};

const _message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const _isAbsolute = (folder: string): boolean =>
  folder.startsWith('/') || /^[A-Za-z]:[\\/]/.test(folder);

const _object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail('upkeep.invalid_settings', 'The upkeep settings are not an object');

const _present = (value: unknown): boolean =>
  value !== null && value !== undefined;

// Ключ из файла настроек — те же 32 байта в base64, что и в базе.
const _key = (raw: unknown): string =>
  typeof raw === 'string' &&
  /^[A-Za-z0-9+/]{43}=$/.test(raw) &&
  Uint8Array.fromBase64(raw).byteLength === 32
    ? raw
    : fail('upkeep.invalid_settings', 'The backup key is not 32 bytes');

const _newestFirst = (copies: readonly RemoteCopy[]): RemoteCopy[] =>
  copies.toSorted(
    (a, b) =>
      (b.at ?? '').localeCompare(a.at ?? '') || b.name.localeCompare(a.name)
  );

export var defineUpkeepService = ({
  repository,
  offsite,
  copier,
  remote,
  keys,
  compactor,
  clock,
  report,
  nextRun,
  releases,
  version,
  database,
  updateCheck,
  rescheduled,
}: UpkeepPorts) => {
  let running = false;
  let latest: UpdateInfo | null = null;
  let checkedAt: string | null = null;

  const save = (change: Partial<UpkeepState>): UpkeepState =>
    ((next) => (repository.save(next), next))({
      ...repository.get(),
      ...change,
    });

  const saveOffsite = (change: Partial<OffsiteState>): OffsiteState =>
    ((next) => (offsite.save(next), next))({ ...offsite.get(), ...change });

  // Копия пишется синхронно (VACUUM INTO), но очередь Promise не даёт двум запускам наложиться.
  const copy = (manual: boolean): BackupRun =>
    ((at, schedule) => ({
      at: at.toISOString(),
      ...copier.copy(schedule, copyName(database, at)),
      manual,
    }))(clock(), repository.get().schedule);

  const failed = (error: unknown): never => {
    const message = _message(error);
    save({ failure: { at: clock().toISOString(), message } });
    report({
      kind: 'upkeep.backup_failed',
      severity: 'error',
      title: {
        en: 'The automatic site backup failed',
        de: 'Die automatische Sicherung der Website ist fehlgeschlagen',
        ru: 'Не сделалась автоматическая копия сайта',
      },
      detail: ((folder) => ({
        en: `${message}\nBackup folder: ${folder}`,
        de: `${message}\nOrdner der Sicherungen: ${folder}`,
        ru: `${message}\nКаталог копий: ${folder}`,
      }))(copier.folder(repository.get().schedule)),
      key: 'upkeep.backup_failed',
    });
    throw domainError('upkeep.backup_failed', message);
  };

  const keyOf = (state: OffsiteState): Uint8Array<ArrayBuffer> | null =>
    state.key === null ? null : Uint8Array.fromBase64(state.key);

  const offsiteStatus = (
    state: OffsiteState = offsite.get()
  ): OffsiteStatus => ({
    settings: state.settings,
    hasSecret: state.secret !== '',
    keyId: ((key) => (key ? keys.id(key) : null))(keyOf(state)),
    keyCreatedAt: state.keyCreatedAt,
    last: state.last,
    failure: state.failure,
  });

  const storeOf = (state: OffsiteState): RemoteStore =>
    state.settings.bucket === '' || state.secret === ''
      ? fail(
          'upkeep.offsite_not_configured',
          'Storage for copies is not set up'
        )
      : remote({ ...state.settings, secret: state.secret });

  // Новый ключ копий: в базу — сам ключ, владельцу — ключ восстановления, один раз.
  const issueKey = () =>
    ((key) => ({
      stored: { key: key.toBase64(), keyCreatedAt: clock().toISOString() },
      recoveryKey: keys.recovery(key),
    }))(keys.generate());

  const offsiteFailed = (error: unknown): never => {
    const message = _message(error);
    const state = saveOffsite({
      failure: { at: clock().toISOString(), message },
    });
    report({
      kind: 'upkeep.offsite_failed',
      severity: 'error',
      title: {
        en: 'The site copy did not reach the storage',
        de: 'Die Sicherung hat den Speicher nicht erreicht',
        ru: 'Копия сайта не дошла до хранилища',
      },
      detail: ((where) => ({
        en: `${message}\nStorage: ${where}\nThe copy on the server itself is fine.`,
        de: `${message}\nSpeicher: ${where}\nDie Kopie auf dem Server selbst ist in Ordnung.`,
        ru: `${message}\nХранилище: ${where}\nКопия на самом сервере в порядке.`,
      }))(
        `${state.settings.endpoint || 'AWS S3'} · ${state.settings.bucket}/${state.settings.prefix}`
      ),
      key: 'upkeep.offsite_failed',
    });
    throw domainError('upkeep.offsite_failed', message);
  };

  // Старые копии этой базы сверх `keep` — по одной, по порядку.
  const prune = (store: RemoteStore, keep: number): Promise<void> =>
    store.list().then((copies) =>
      outdatedCopies(
        copies.map((_) => _.name),
        database,
        keep
      ).reduce<Promise<void>>(
        (previous, name) => previous.then(() => store.remove(name)),
        Promise.resolve()
      )
    );

  const send = (state: OffsiteState, run: BackupRun): Promise<BackupRun> =>
    Promise.resolve(remoteName(run.file)).then((name) =>
      Promise.resolve()
        .then(() => storeOf(state))
        .then((store) =>
          store
            .upload(run.file, name, keyOf(state)!)
            .then((size) => prune(store, state.settings.keep).then(() => size))
        )
        .then(
          (size) => (
            saveOffsite({
              last: { at: clock().toISOString(), name, size },
              failure: null,
            }),
            run
          ),
          offsiteFailed
        )
    );

  const upload = (run: BackupRun): Promise<BackupRun> =>
    ((state) =>
      state.settings.enabled && state.key !== null && state.secret !== ''
        ? send(state, run)
        : Promise.resolve(run))(offsite.get());

  const run = (manual: boolean): Promise<BackupRun> =>
    running
      ? Promise.reject(
          domainError('upkeep.backup_running', 'A backup is already running')
        )
      : ((running = true),
        Promise.resolve(manual)
          .then(copy)
          .then((last) => (save({ last, failure: null }), last), failed)
          .then(upload)
          .finally(() => void (running = false)));

  const status = (): BackupStatus =>
    ((state) => ({
      schedule: state.schedule,
      folder: copier.folder(state.schedule),
      last: state.last,
      failure: state.failure,
      next: state.schedule.enabled
        ? (nextRun(cronOf(state.schedule), clock())?.toISOString() ?? null)
        : null,
      running,
    }))(repository.get());

  const updatesEnabled = (): boolean =>
    updateCheck && repository.get().checkUpdates;

  const updateStatus = (): UpdateStatus => ({
    enabled: updatesEnabled(),
    locked: !updateCheck,
    current: version,
    latest,
    checkedAt,
  });

  const databaseStatus = (): DatabaseStatus =>
    ((space) => ({
      ...space,
      worth: worthCompacting(space),
      needs: compactNeeds(space),
      diskFree: compactor.diskFree(),
      compacted: repository.get().compacted,
    }))(compactor.space());

  const compact = (): CompactRun =>
    ((space) =>
      compactor.diskFree() < compactNeeds(space)
        ? fail(
            'upkeep.no_disk_space',
            `Compacting needs ${compactNeeds(space)} bytes free on the disk`
          )
        : ((compacted) => (save({ compacted }), compacted))({
            at: clock().toISOString(),
            before: space.size,
            ms: compactor.compact(),
            after: compactor.space().size,
          }))(compactor.space());

  const storeWith = (patch: Record<string, unknown>): RemoteStore =>
    ((previous) =>
      ((settings) =>
        storeOf({
          ...previous,
          settings,
          secret: offsiteSecret(patch.secret, settings, previous),
        }))(parseOffsite({ ...patch, enabled: false }, previous.settings)))(
      offsite.get()
    );

  const configureOffsite = (patch: Record<string, unknown>): OffsiteChange => {
    const previous = offsite.get();
    const settings = parseOffsite(patch, previous.settings);
    const secret = offsiteSecret(patch.secret, settings, previous);
    const fresh =
      settings.enabled && secret === ''
        ? fail('upkeep.offsite_no_secret', 'The secret key is required')
        : settings.enabled && previous.key === null
          ? issueKey()
          : null;
    return {
      ...offsiteStatus(
        saveOffsite({ settings, secret, ...(fresh?.stored ?? {}) })
      ),
      ...(fresh ? { recoveryKey: fresh.recoveryKey } : {}),
    };
  };

  const applyOffsite = (
    raw: unknown,
    previous: OffsiteState
  ): UpkeepApplied['keyReplaced'] => {
    const value = _object(raw);
    const key = _present(value.key) ? _key(value.key) : null;
    saveOffsite({
      settings: parseOffsite(
        _object(value.settings) as Partial<OffsiteSettings>,
        DEFAULT_OFFSITE
      ),
      secret: typeof value.secret === 'string' ? value.secret : '',
      key,
      keyCreatedAt:
        key === null
          ? null
          : typeof value.keyCreatedAt === 'string'
            ? value.keyCreatedAt
            : clock().toISOString(),
      failure: null,
    });
    return previous.key !== null && key !== null && previous.key !== key
      ? {
          from: keys.id(Uint8Array.fromBase64(previous.key)),
          to: keys.id(Uint8Array.fromBase64(key)),
        }
      : null;
  };

  const applySchedule = (raw: unknown): string | null => {
    const schedule = parseSchedule(
      _object(raw) as Partial<BackupSchedule>,
      DEFAULT_SCHEDULE
    );
    const reset = _isAbsolute(schedule.folder) ? schedule.folder : null;
    save({ schedule: reset ? { ...schedule, folder: '' } : schedule });
    rescheduled(repository.get().schedule);
    return reset;
  };

  return {
    backups: {
      schedule: (): BackupSchedule => repository.get().schedule,
      /** Правка расписания; фоновая задача сразу переходит на новое. */
      configure: (patch: Record<string, unknown>): BackupStatus =>
        ((schedule) => (save({ schedule }), rescheduled(schedule), status()))(
          parseSchedule(patch, repository.get().schedule)
        ),
      /** По расписанию — `manual: false`, кнопкой — `true`; с хранилищем — ещё и отправка туда. */
      run,
      status,
    },
    offsite: {
      status: (): OffsiteStatus => offsiteStatus(),
      /**
       * Правка хранилища. Пустой секрет — прежний, если хранилище то же. Первое включение создаёт
       * ключ копий: ключ восстановления — в ответе, и больше его не узнать.
       */
      configure: configureOffsite,
      /**
       * Новый ключ копий. Новые копии — им; прежние в хранилище открывает только прежний ключ
       * восстановления, пока их не вытеснят новые.
       */
      rotate: (): OffsiteChange =>
        ((fresh) => ({
          ...offsiteStatus(saveOffsite(fresh.stored)),
          recoveryKey: fresh.recoveryKey,
        }))(issueKey()),
      /** Проверить хранилище: сохранённое или то, что в форме, — ничего не сохраняя. */
      check: (patch: Record<string, unknown> = {}): Promise<void> =>
        Promise.resolve(patch).then((_) => storeWith(_).check()),
      /**
       * Хранилище по сохранённым здесь настройкам, поверх — заданное явно (флаги и окружение
       * `cms restore --remote`); секрет — заданный или свой, если хранилище то же.
       */
      store: (overrides: Record<string, unknown> = {}): RemoteStore =>
        storeWith(overrides),
      /** Копии в хранилище, новые первыми. */
      copies: (): Promise<RemoteCopy[]> =>
        Promise.resolve()
          .then(() => storeOf(offsite.get()).list())
          .then(_newestFirst),
      /** Скачать копию и распечатать своим ключом в файл `target`; чужой ключ — отказ с отпечатком. */
      fetch: (name: string, target: string): Promise<void> =>
        Promise.resolve(offsite.get()).then((state) =>
          ((store, key) =>
            store
              .header(name)
              .then((header) =>
                key !== null && header.keyId === keys.id(key)
                  ? store.download(name, target, key)
                  : fail(
                      'upkeep.offsite_other_key',
                      `The copy was sealed with another backup key (${header.keyId ?? 'none'}); restore it with its recovery key: cms restore --remote ${name}`
                    )
              ))(storeOf(state), keyOf(state))
        ),
      /** Ключ копий этого сервера: восстановление с командной строки открывает им свои копии. */
      key: (): Uint8Array<ArrayBuffer> | null => keyOf(offsite.get()),
    },
    database: {
      status: databaseStatus,
      /** Сжать базу сейчас: доли секунды на десятки мегабайт, запись других процессов ждёт. */
      compact,
      /** Ночная уборка: сжать, если свободного много и на диске есть место. */
      tidy: (): CompactRun | null =>
        shouldCompact(compactor.space(), compactor.diskFree())
          ? compact()
          : null,
    },
    serverSettings: {
      /** Настройки, которые владелец сохранял на этом сервере; чего не сохранял — null. */
      read: (): UpkeepServerSettings =>
        ((state, stored) => ({
          schedule: repository.exists() ? state.schedule : null,
          checkUpdates: repository.exists() ? state.checkUpdates : null,
          offsite: offsite.exists()
            ? {
                settings: stored.settings,
                secret: stored.secret,
                key: stored.key,
                keyCreatedAt: stored.keyCreatedAt,
              }
            : null,
        }))(repository.get(), offsite.get()),
      /**
       * Настройки из файла другой машины. Итоги копий остаются свои; абсолютный каталог копий — чужой
       * путь, копии ложатся в `backups` рядом с базой.
       */
      apply: (raw: unknown): UpkeepApplied =>
        pipe(
          (_: unknown) => _object(_),
          (value) => ({
            schedule: _present(value.schedule),
            folderReset: _present(value.schedule)
              ? applySchedule(value.schedule)
              : null,
            checkUpdates:
              typeof value.checkUpdates === 'boolean' &&
              (save({ checkUpdates: value.checkUpdates }), true),
            offsite: _present(value.offsite),
            keyReplaced: _present(value.offsite)
              ? applyOffsite(value.offsite, offsite.get())
              : null,
          })
        )(raw),
    },
    updates: {
      enabled: updatesEnabled,
      configure: (enabled: boolean): UpdateStatus => (
        save({ checkUpdates: enabled }), updateStatus()
      ),
      /** Спросить страницу релизов; найденное — в памяти до следующей проверки. */
      check: (): Promise<UpdateStatus> =>
        releases()
          .then((list) => newerRelease(version, list))
          .then(
            (found) => (
              (latest = found
                ? { current: version, latest: found.version, url: found.url }
                : null),
              (checkedAt = clock().toISOString()),
              updateStatus()
            )
          ),
      /** Что нашла последняя проверка; null — новее нет или проверка выключена. */
      latest: (): UpdateInfo | null => (updatesEnabled() ? latest : null),
      status: updateStatus,
    },
  };
};

export type UpkeepService = ReturnType<typeof defineUpkeepService>;
