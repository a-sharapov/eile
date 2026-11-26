import type { Changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { CODE_LIMITS, parseCode } from '../domain/codes.ts';
import type { AnalyticsEvent } from '../domain/events.ts';
import {
  type CarriedSenderKey,
  KEY_LIMITS,
  keyLabel,
  keyLog,
  keyView,
  readCarriedKeys,
  type SenderKey,
  type SenderKeyView,
} from '../domain/keys.ts';
import type {
  AnalyticsCrypto,
  AnalyticsSettingsRepository,
  ErasedTally,
  ErasureEntry,
  ErasureLog,
  EventJournal,
  EventReferences,
  EventStore,
  ImportLedger,
  IntakeTally,
  LabelRegistry,
  MoneyStore,
  PeopleStore,
  QualityAlerts,
  QualityStore,
  RefusalTally,
  ReportStore,
  SenderKeyRepository,
  SetSample,
  SetupLog,
  SetupLogEntry,
  SetupRepository,
  SiteVisits,
  SummaryStore,
  Transaction,
} from '../domain/ports.ts';
import { builtinCheck } from '../domain/quality.ts';
import { EVENT_ROLES, ROLES, type RoleSpec } from '../domain/roles.ts';
import {
  type AnalyticsSettings,
  changeAnalyticsSettings,
} from '../domain/settings.ts';
import {
  applySet,
  archiveItem,
  changesOf,
  findItem,
  type ItemChange,
  type ItemRef,
  itemLog,
  parseRef,
  readSet,
  removeItem,
  type Sender,
  type Setup,
  type SetupAuthor,
  type SetupGroup,
  type SetupHolds,
  type SetupItem,
  type SetupLogDraft,
  saveItem,
  setLog,
} from '../domain/setup.ts';
import {
  type IntakeDay,
  keptSince,
  sumIntake,
  TALLY_LIMITS,
} from '../domain/tally.ts';
import { defineImport } from './import.ts';
import { defineIntake, type IntakeRefusal } from './intake.ts';
import { defineJournal } from './journal.ts';
import { defineLabels } from './labels.ts';
import { defineMoney } from './money.ts';
import {
  definePeople,
  type PeoplePage,
  type PeopleQuery,
  REPORT_PEOPLE_FIELDS,
} from './people.ts';
import { defineQuality } from './quality.ts';
import { queryCursor, type UtcQuery, utcPeriod } from './query.ts';
import { defineReports } from './reports.ts';
import { defineSets } from './sets.ts';
import { defineSummaries } from './summaries.ts';

export type AnalyticsPorts = {
  readonly settings: AnalyticsSettingsRepository;
  readonly setup: SetupRepository;
  readonly log: SetupLog;
  readonly references: EventReferences;
  readonly keys: SenderKeyRepository;
  readonly events: EventStore;
  readonly journal: EventJournal;
  readonly erasures: ErasureLog;
  readonly people: PeopleStore;
  readonly crypto: AnalyticsCrypto;
  readonly transaction: Transaction;
  readonly bus: EventBus;
  readonly clock: () => Date;
  /** Идёт ли фон сервера: пересчёт людей и срок хранения. */
  readonly running: () => boolean;
  /** Пауза между пачками загрузки файла. */
  readonly pause: () => Promise<void>;
  /** Учёт принятых строк пробного прогона загрузки — новый на прогон. */
  readonly ledger: () => ImportLedger;
  /** Люди для отчётов: постоянные запросы нужных столбцов. */
  readonly reports: ReportStore;
  /** Реестр меток — данные сайта, не настройка. */
  readonly registry: LabelRegistry;
  /** Статистика посещений: пояс суток, счёт, суммы посетителей и с какого дня они есть. */
  readonly visits: SiteVisits;
  /** Адрес сайта из настроек. */
  readonly siteUrl: () => string;
  /** Курсы и строки расхода — данные сайта, не настройка. */
  readonly money: MoneyStore;
  /** Счёт приёма и стёртого по суткам UTC — данные сайта. */
  readonly tally: IntakeTally;
  readonly erased: ErasedTally;
  /** Счёт отказов приёмника в памяти процесса: пересборка контекстов его не теряет. */
  readonly refusals: RefusalTally;
  /** События типов с ролью «сводка». */
  readonly summaries: SummaryStore;
  /** Строки дней проверок, курсор такта и чтения для проверок. */
  readonly quality: QualityStore;
  /** Уведомления о проверках: каналы сбоев сайта, их собирает корень. */
  readonly alerts: QualityAlerts;
  /** Ошибка шага фона — в журнал сервера. */
  readonly failed: (error: unknown) => void;
  /** Наборы-образцы бинарника: их собирает корень. */
  readonly samples: readonly SetSample[];
  /** Версия Eile: в выгрузке набора и в сверке с версией файла. */
  readonly version: string;
  /** Название сайта: имя выгрузки набора по умолчанию. */
  readonly siteName: () => string;
};

/** Состояние приёма для экрана «Приём»: сутки — по UTC, как хранятся события. */
export type IntakeSummary = {
  readonly enabled: boolean;
  /** Принято событий с полуночи UTC. */
  readonly today: number;
  /** Когда принято последнее событие; null — событий нет. */
  readonly lastAt: string | null;
  readonly refusals: readonly IntakeRefusal[];
};

/** Счёт приёма за сутки UTC: вместе с отказами, которые ещё в памяти. */
export type IntakeDaily = {
  readonly from: string;
  readonly to: string;
  readonly days: readonly IntakeDay[];
};

/** Что стёр срок хранения счёта приёма и строк дней проверок (старше 400 суток) и стёртого (старше 40). */
export type TalliesExpired = {
  readonly intake: number;
  readonly erased: number;
  readonly checks: number;
};

/** Ключ, как его выдают: сам ключ — только в этом ответе, на сервере остаётся хэш. */
export type IssuedSenderKey = SenderKeyView & { readonly key: string };

/** Отправитель с ключами — без хэшей. */
export type SenderView = Sender & { readonly keys: readonly SenderKeyView[] };

/** Сохранённый отправитель; ключ — только у нового. */
export type SenderSaved = {
  readonly sender: Sender;
  readonly key: IssuedSenderKey | null;
};

/** Что стало с привезёнными ключами: добавлены, уже были, отправителя с таким кодом нет. */
export type SenderKeysApplied = {
  readonly added: number;
  readonly present: number;
  readonly skipped: readonly string[];
};

/** Итог применения набора: ничего не изменилось — ревизия прежняя, в журнале пусто. */
export type SetApplied = {
  readonly name: string;
  readonly revision: number;
  readonly created: number;
  readonly changed: number;
};

export type LogQuery = {
  readonly before?: number | null;
  readonly limit?: number;
};

const _LOG_LIMIT = 50;
const _MAX_LOG_LIMIT = 200;

// События ссылаются только на отправителя и тип, строки дней — на свою проверку (поправка встроенной ими не
// держится: её удаление возвращает значения ядра); на остальное ссылаются элементы, это проверяет домен.
const _EVENTS: Readonly<
  Record<SetupGroup, (references: EventReferences, ref: ItemRef) => boolean>
> = {
  sender: (_, ref) => _.sender(ref.code),
  type: (_, ref) => _.type(ref.owner ?? '', ref.code),
  property: () => false,
  dictionary: () => false,
  value: () => false,
  schema: () => false,
  referrer: () => false,
  link: () => false,
  milestone: () => false,
  funnel: () => false,
  check: (_, ref) => builtinCheck(ref.code) === null && _.results(ref.code),
};

// Строки расхода ссылаются на часть метки и её значение: пока ссылаются, удалить их нельзя.
const _SPEND: Readonly<
  Record<SetupGroup, (references: EventReferences, ref: ItemRef) => boolean>
> = {
  sender: () => false,
  type: () => false,
  property: () => false,
  dictionary: (_, ref) => _.spend(ref.code, null),
  value: (_, ref) => _.spend(ref.owner ?? '', ref.code),
  schema: () => false,
  referrer: () => false,
  link: () => false,
  milestone: () => false,
  funnel: () => false,
  check: () => false,
};

// Пробел меньше любого знака кода: строки сравниваются по суткам, отправителю, пути, исходу.
const _sortKey = (_: IntakeDay): string =>
  `${_.day} ${_.sender} ${_.origin} ${_.outcome}`;

const _byKey = (a: IntakeDay, b: IntakeDay): number =>
  _sortKey(a) < _sortKey(b) ? -1 : _sortKey(a) > _sortKey(b) ? 1 : 0;

const _limitOf = (limit: number | undefined): number =>
  limit !== undefined && Number.isInteger(limit) && limit > 0
    ? Math.min(limit, _MAX_LOG_LIMIT)
    : _LOG_LIMIT;

export var defineAnalyticsService = ({
  settings,
  setup,
  log,
  references,
  keys,
  events,
  journal,
  erasures,
  people,
  crypto,
  transaction,
  bus,
  clock,
  running,
  pause,
  ledger,
  reports,
  registry,
  visits,
  siteUrl,
  money,
  tally,
  erased,
  refusals,
  summaries,
  quality: checks,
  alerts,
  failed,
  samples,
  version,
  siteName,
}: AnalyticsPorts) => {
  let cached: Setup | null = null;
  // Ключи сайта — в памяти: сверка на каждом событии не ходит в базу; база — после своей записи.
  let ring: readonly SenderKey[] | null = null;
  const current = (): Setup => (cached ??= setup.load());
  const keyring = (): readonly SenderKey[] => (ring ??= keys.all());
  const now = (): string => clock().toISOString();
  // Назначение части с расходами не сменить: расходы проверяются до перехода, как события у типа.
  const holds: SetupHolds = {
    spend: (dictionary) => references.spend(dictionary, null),
  };

  // Правка читает настройку из базы в своей транзакции: в ту же базу мог записать другой процесс (cms mcp).
  const commit = (
    transition: (setup: Setup) => Changed<Setup, AnalyticsEvent>,
    journal: (
      changes: readonly ItemChange[],
      at: string
    ) => readonly SetupLogDraft[]
  ): readonly ItemChange[] =>
    pipe(
      () =>
        transaction(() => {
          const before = setup.load();
          const change = transition(before);
          const changes = changesOf(before, change.state);
          const at = now();
          void (
            changes.length > 0 &&
            (setup.commit(change.state.revision, changes, at),
            log.append(journal(changes, at)))
          );
          return { events: change.events, changes };
        }),
      // Удалённый отправитель уносит свои ключи: их список перечитывается.
      (_) => (
        (cached = null), (ring = null), _.events.forEach(bus.publish), _.changes
      )
    )();

  const itemOf = (ref: ItemRef): SetupItem =>
    findItem(current(), ref) as SetupItem;

  // Выпуск внутри транзакции: отправитель и число его ключей — из базы, а не из снимка. Журнал настройки
  // называет, кто выпустил ключ, — с подписью и последними знаками, без самого ключа.
  const addKey = (
    code: string,
    label: unknown,
    author: SetupAuthor | null
  ): IssuedSenderKey =>
    ((sender, held, secret) =>
      sender === undefined
        ? fail('analytics.item_not_found', `Sender ${code} does not exist`)
        : sender.archivedAt !== null
          ? fail(
              'analytics.invalid_reference',
              `Sender ${code} is archived: bring it back to issue a key`
            )
          : held >= KEY_LIMITS.perSender
            ? fail(
                'analytics.too_many',
                `Sender ${code} has ${KEY_LIMITS.perSender} keys: revoke one first`
              )
            : ((view) => (
                log.append([keyLog('created', view, author, view.createdAt)]),
                { ...view, key: secret }
              ))(
                keyView(
                  keys.add({
                    sender: code,
                    label: keyLabel(label, sender.name),
                    hash: crypto.hash(secret),
                    hint: secret.slice(-4),
                    createdAt: now(),
                    usedAt: null,
                  })
                )
              ))(
      setup.load().senders.find((_) => _.code === code),
      keys.all().filter((_) => _.sender === code).length,
      crypto.issue()
    );

  const issuedEvent = (
    issued: IssuedSenderKey,
    author: SetupAuthor | null
  ): AnalyticsEvent => ({
    type: 'analytics.sender_key_issued',
    sender: issued.sender,
    userId: author?.id ?? null,
  });

  const announce = (
    issued: IssuedSenderKey | null,
    author: SetupAuthor | null
  ): IssuedSenderKey | null => (
    (ring = null),
    void (issued && bus.publish(issuedEvent(issued, author))),
    issued
  );

  const senderCode = (raw: unknown): string =>
    parseCode(raw, CODE_LIMITS.sender, 'Sender');

  const persons = definePeople({
    events,
    journal,
    erasures,
    people,
    erased,
    setups: setup,
    setup: current,
    settings: settings.get,
    crypto,
    transaction,
    bus,
    clock,
    running,
  });

  const reading = defineJournal({
    journal,
    people,
    registry,
    erasures,
    setup: current,
    ensure: persons.ensure,
  });

  const intake = defineIntake({
    events,
    erasures,
    people: persons.index,
    tally,
    erased,
    refusals,
    crypto,
    transaction,
    bus,
    clock,
    settings: settings.get,
    setup: current,
    keys: {
      all: keyring,
      touch: (id, at) => (
        keys.touch(id, at),
        void (ring = keyring().map((_) =>
          _.id === id ? { ..._, usedAt: at } : _
        ))
      ),
    },
  });

  const upload = defineImport({
    events,
    erasures,
    people: persons.index,
    tally,
    erased,
    crypto,
    transaction,
    bus,
    clock,
    settings: settings.get,
    setup: current,
    pause,
    ledger,
  });

  const quality = defineQuality({
    store: checks,
    summaries,
    tally,
    erased,
    refusals,
    reports,
    money,
    visits,
    setup: current,
    settings: settings.get,
    log,
    alerts,
    transaction,
    clock,
    stale: persons.people.stale,
    failed,
  });

  const days = defineSummaries({
    store: summaries,
    setup: current,
    clock,
    matched: quality.matched,
  });

  const report = defineReports({
    store: reports,
    registry,
    visits,
    money,
    settings: settings.get,
    setup: current,
    clock,
    ensure: persons.ensure,
    stale: persons.people.stale,
    versions: days.versions,
  });

  // Срок хранения служебных цифр: счёт приёма и строки дней проверок — 400 суток, стёртого — 40; одной записью.
  const expireTallies = (): TalliesExpired =>
    ((at) =>
      transaction(() => ({
        intake: tally.expire(keptSince(at, TALLY_LIMITS.intakeDays)),
        erased: erased.expire(keptSince(at, TALLY_LIMITS.erasedDays)),
        checks: quality.expire(),
      })))(now());

  const finances = defineMoney({
    money,
    reports,
    setup: current,
    setups: setup,
    settings: settings.get,
    log,
    transaction,
    clock,
    zone: visits.timeZone,
    ensure: persons.ensure,
  });

  const keepSettings = (
    before: AnalyticsSettings,
    after: AnalyticsSettings,
    author: SetupAuthor | null
  ): void =>
    ((at) => (
      transaction(
        () => (
          settings.save(after, at),
          log.append([
            {
              at,
              author,
              item: 'settings',
              key: '',
              action: 'changed',
              before,
              after,
            },
          ])
        )
      ),
      bus.publish({
        type: 'analytics.settings_changed',
      } satisfies AnalyticsEvent)
    ))(now());

  const sets = defineSets({
    setup,
    current,
    log,
    references,
    holds,
    transaction,
    clock,
    samples,
    version,
    siteName,
    // Набор записан: снимок настройки и ключи — заново (отправители могли появиться), события — в шину.
    applied: (events) => (
      (cached = null), (ring = null), events.forEach(bus.publish)
    ),
  });

  return {
    settings: {
      get: (): AnalyticsSettings => settings.get(),
      /** Выключатель, срок хранения и базовая валюта; смену пишет журнал настройки, ревизия прежняя. */
      save: (
        patch: Readonly<Record<string, unknown>>,
        author: SetupAuthor | null = null
      ): AnalyticsSettings =>
        pipe(
          (_: Readonly<Record<string, unknown>>) => ({
            before: settings.get(),
            after: changeAnalyticsSettings(settings.get(), _),
          }),
          (_) => (
            void (
              JSON.stringify(_.after) !== JSON.stringify(_.before) &&
              keepSettings(_.before, _.after, author)
            ),
            _.after
          )
        )(patch),
    },
    setup: {
      /** Вся настройка снимком: в памяти, из базы — после своей правки и при сборке контекстов. */
      get: current,
      /** Роли ядра с полями — в порядке экранов. */
      roles: (): readonly RoleSpec[] => EVENT_ROLES.map((_) => ROLES[_]),
      /** Создать или изменить элемент группы; поля, которых нет во входе, остаются прежними. */
      save: (
        group: string,
        item: unknown,
        author: SetupAuthor | null = null
      ): SetupItem =>
        pipe(
          () =>
            commit(saveItem(group, item, holds), (changes, at) =>
              itemLog(changes, author, at)
            ),
          () => itemOf(parseRef(group, item))
        )(),
      archive: (
        group: string,
        key: unknown,
        archived: boolean,
        author: SetupAuthor | null = null
      ): SetupItem =>
        ((ref) => (
          commit(archiveItem(ref, archived === true, now()), (changes, at) =>
            itemLog(changes, author, at)
          ),
          itemOf(ref)
        ))(parseRef(group, key)),
      /** Удалить элемент без ссылок: ни событий, ни расходов, ни других элементов — иначе `analytics.in_use`. */
      remove: (
        group: string,
        key: unknown,
        author: SetupAuthor | null = null
      ): void =>
        ((ref) =>
          void commit(
            (_) =>
              removeItem(
                ref,
                _EVENTS[ref.group](references, ref),
                _SPEND[ref.group](references, ref)
              )(_),
            (changes, at) => itemLog(changes, author, at)
          ))(parseRef(group, key)),
      /** Набор целиком или никак: одной транзакцией, одной ревизией и одной строкой журнала. */
      apply: (set: unknown, author: SetupAuthor | null = null): SetApplied =>
        ((plan) =>
          ((changes) => ({
            name: plan.name,
            revision: current().revision,
            created: changes.filter((_) => _.before === null).length,
            changed: changes.filter((_) => _.before !== null).length,
          }))(
            commit(applySet(plan, holds, now()), (changes, at) =>
              setLog(plan.name, changes, author, at)
            )
          ))(readSet(set)),
    },
    /**
     * Перенос набора: выгрузка, проба без записи, загрузка целиком и образцы бинарника. Загрузка меняет
     * отправителей и роли разом — только человек в менеджере или владелец командой на сервере.
     */
    sets,
    /** Отправители и их ключи: создаёт и меняет их только человек, вошедший в менеджер. */
    senders: {
      list: (): SenderView[] =>
        current().senders.map((sender) => ({
          ...sender,
          keys: keyring()
            .filter((_) => _.sender === sender.code)
            .map(keyView),
        })),
      /** Создать или изменить отправителя; новый получает ключ — в ответе один раз, подпись — его название. */
      save: (input: unknown, author: SetupAuthor | null = null): SenderSaved =>
        ((ref) =>
          pipe(
            () =>
              transaction(() =>
                commit(saveItem('sender', input), (changes, at) =>
                  itemLog(changes, author, at)
                ).some((_) => _.before === null)
                  ? addKey(ref.code, null, author)
                  : null
              ),
            (_) => ({
              sender: itemOf(ref) as Sender,
              key: announce(_, author),
            })
          )())(parseRef('sender', input)),
      /** В архив и обратно: ключи отправителя в архиве не подписывают событий, но остаются. */
      archive: (
        code: unknown,
        archived: boolean,
        author: SetupAuthor | null = null
      ): Sender =>
        ((ref) => (
          commit(archiveItem(ref, archived === true, now()), (changes, at) =>
            itemLog(changes, author, at)
          ),
          itemOf(ref) as Sender
        ))(parseRef('sender', { code })),
      /** Новый ключ, до трёх у отправителя: новый выпускают до того, как отзывают старый. */
      issue: (
        code: unknown,
        label: unknown = null,
        author: SetupAuthor | null = null
      ): IssuedSenderKey =>
        announce(
          transaction(() => addKey(senderCode(code), label, author)),
          author
        ) as IssuedSenderKey,
      /** Отозвать ключ: события им больше не подписать; журнал настройки называет, кто отозвал. */
      revoke: (
        code: unknown,
        id: number,
        author: SetupAuthor | null = null
      ): void =>
        ((sender) => (
          transaction(() =>
            ((key) =>
              key === undefined || !keys.remove(sender, id)
                ? fail(
                    'analytics.key_not_found',
                    `Sender ${sender} has no key ${id}`
                  )
                : log.append([keyLog('removed', key, author, now())]))(
              keys.all().find((_) => _.sender === sender && _.id === id)
            )
          ),
          void (ring = null)
        ))(senderCode(code)),
    },
    intake: {
      ...intake,
      /** Включён ли приём, сколько принято с полуночи UTC, когда последнее и последние отказы. */
      summary: (): IntakeSummary =>
        ((received) => ({
          enabled: settings.get().enabled,
          today: received.count,
          lastAt: received.last,
          refusals: intake.refusals(),
        }))(journal.received(`${now().slice(0, 10)}T00:00:00.000Z`)),
      /**
       * Счёт приёма за сутки UTC (`days` до 400, `from`, `to`; по умолчанию 30 суток): исходы событий из базы и
       * отказы, которые ещё в памяти, — одной строкой на ключ.
       */
      daily: (query: UtcQuery = {}): IntakeDaily =>
        ((period) => ({
          from: period.from,
          to: period.to,
          days: sumIntake([
            ...tally.daily(period.from, period.to),
            ...refusals
              .pending()
              .filter((_) => _.day >= period.from && _.day <= period.to),
          ]).toSorted(_byKey),
        }))(utcPeriod(query, now(), TALLY_LIMITS.intakeDays)),
      /** Счёт отказов из памяти — в базу: фон раз в минуту, закрытие приложения, восстановление копии. */
      flush: refusals.flush,
      /** Срок хранения счёта приёма и стёртого: фон — ночью вместе со сроком хранения людей. */
      expire: expireTallies,
    },
    /** Сводки отправителей по суткам UTC и смены версий. */
    summaries: { list: days.list },
    /**
     * Проверки данных: такт (у сервера — фоном, без фона — `tick()`), сетка, день, статус, снятие вручную и
     * перепроверка выбранных суток без уведомлений.
     */
    quality: {
      tick: quality.tick,
      report: quality.report,
      day: quality.day,
      status: quality.status,
      checks: quality.checks,
      resolve: quality.resolve,
      reopen: quality.reopen,
      run: quality.run,
    },
    people: {
      ...persons.people,
      /**
       * Список: новые по последнему событию сверху, состояние — на момент чтения. С параметрами отчёта (период,
       * атрибуция, фильтры, веха, шаг воронки) — по строкам людей, иначе по узкому индексу списка.
       */
      list: (query: PeopleQuery = {}): PeoplePage =>
        REPORT_PEOPLE_FIELDS.some(
          (_) => query[_] !== undefined && query[_] !== null && query[_] !== ''
        )
          ? report.people(query)
          : persons.people.list(query),
    },
    /** Отчёты: «Источники», воронка, «Метка и ответ», «Обзор», когорты, «Сравнение вех». */
    reports: {
      sources: report.sources,
      funnel: report.funnel,
      answers: report.answers,
      overview: report.overview,
      cohorts: report.cohorts,
      milestones: report.milestones,
    },
    /** Курсы к базовой валюте: экран курсов, запись пачкой, удаление; у агента курсов нет. */
    rates: finances.rates,
    /** Выписки месяцев рядом с выручкой сайта: вносит человек или скрипт владельца ключом API, агент — нет. */
    statements: finances.statements,
    /** Строки расхода: месяцы с итогами и подсказками, запись пачкой по ключу, удаление. */
    spend: finances.spend,
    /** Метки: куда ведёт переход (настройка и выключатель — из памяти), реестр и проверка метки. */
    labels: defineLabels({
      setup: current,
      enabled: () => settings.get().enabled,
      registry,
      log,
      transaction,
      clock,
      siteUrl,
    }),
    events: {
      ...reading.events,
      /**
       * Загрузка строк файла JSON Lines тем же приёмом, что у HTTP: пачками в транзакции, с паузой между
       * ними; `dryRun` ничего не пишет. Приём выключен — `analytics.disabled`.
       */
      import: upload,
    },
    unknown: reading.unknown,
    erasures: persons.erasures,
    /**
     * Шаги фона сервера: пересчёт людей, срок хранения, счёт отказов в базу, срок хранения счёта и строк
     * дней, шаг такта проверок.
     */
    background: {
      ...persons.background,
      refusals: refusals.flush,
      tallies: (): void => void expireTallies(),
      quality: quality.step,
    },
    log: {
      /** Журнал настройки страницами, новые сверху; `before` — номер строки, иначе `analytics.invalid_query`. */
      setup: (query: LogQuery = {}): SetupLogEntry[] =>
        log.list(queryCursor(query.before), _limitOf(query.limit)),
      /** Журнал удалений страницами, новые сверху: дата, источник, кто, сколько; псевдонимов в нём нет. */
      erasures: (query: LogQuery = {}): ErasureEntry[] =>
        reading.erasures(queryCursor(query.before), query.limit),
    },
    /**
     * Хэши ключей отправителей — для файла настроек сервера, как токены почтового шлюза. На новой машине ключ
     * достаётся отправителю с тем же кодом; нет такого — ключ пропускается. Вызывать внутри транзакции.
     */
    serverSettings: {
      read: (): CarriedSenderKey[] =>
        keys.all().map((_) => ({
          sender: _.sender,
          label: _.label,
          keyHash: _.hash,
          hint: _.hint,
          createdAt: _.createdAt,
        })),
      apply: (raw: unknown): SenderKeysApplied =>
        pipe(
          readCarriedKeys,
          (carried) =>
            ((codes) =>
              carried.map((key) =>
                !codes.has(key.sender)
                  ? { outcome: 'skipped' as const, sender: key.sender }
                  : keys.has(key.keyHash)
                    ? { outcome: 'present' as const, sender: key.sender }
                    : (keys.add({
                        sender: key.sender,
                        label: key.label,
                        hash: key.keyHash,
                        hint: key.hint,
                        createdAt: key.createdAt,
                        usedAt: null,
                      }),
                      { outcome: 'added' as const, sender: key.sender })
              ))(new Set(setup.load().senders.map((_) => _.code))),
          (outcomes) => (
            (ring = null),
            {
              added: outcomes.filter((_) => _.outcome === 'added').length,
              present: outcomes.filter((_) => _.outcome === 'present').length,
              skipped: [
                ...new Set(
                  outcomes
                    .filter((_) => _.outcome === 'skipped')
                    .map((_) => _.sender)
                ),
              ],
            }
          )
        )(raw),
    },
  };
};

export type AnalyticsService = ReturnType<typeof defineAnalyticsService>;
