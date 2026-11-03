import { chmodSync, rmSync } from 'node:fs';
import { type App, createApp } from '../app.ts';
import {
  latestCopy,
  type RemoteCopy,
  type RemoteStore,
} from '../contexts/upkeep/index.ts';
import { tempPath } from '../platform/archive.ts';
import { keyIdOf, parseRecoveryKey } from '../platform/seal.ts';
import {
  checkPassphrase,
  openServerSettings,
  type ServerSettings,
  type ServerSettingsReport,
  sealServerSettings,
} from '../server-settings.ts';
import { isDomainError } from '../shared/kernel/errors.ts';
import { pipe } from '../shared/kernel/pipe.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';
import { PROGRAM } from './program.ts';
import { promptHidden } from './prompt.ts';

// Копии вне сервера и файл настроек сервера (ADR 0045): `cms backup|restore --remote`, `--server` и
// `cms compact`.

const _SAY = {
  ru: {
    kb: 'КБ',
    mb: 'МБ',
    decimal: ',',
    noDb: (db: string) => `Нет базы ${db}. Укажите файл: --db site.db`,
    exists: (file: string) => `Файл ${file} уже есть — выберите другое имя.`,
    noFile: (file: string) => `Нет файла ${file}.`,
    passphrase: 'Пароль файла настроек: ',
    again: 'Ещё раз:               ',
    mismatch: 'Пароли не совпали.',
    cancelled: 'Отменено.',
    noPassphrase:
      'Нет терминала для пароля. Передайте его в CMS_SETTINGS_PASSPHRASE.',
    settingsWritten: 'Настройки сервера:',
    inside: 'В файле',
    nothing: 'ничего: на этом сервере ничего не настраивали',
    parts: {
      email: 'почта',
      telegram: 'Telegram',
      gateway: (n: number) => `почтовый шлюз (токенов: ${n})`,
      forms: 'секрет печатей форм',
      schedule: 'расписание копий',
      offsite: (id: string | null) =>
        id ? `хранилище копий (ключ ${id})` : 'хранилище копий',
      assistant: 'подключение ИИ',
      tokens: (n: number) => `ключи API (${n})`,
    },
    keepSafe:
      'Храните файл как пароль: в нём пароль почты, ключ ИИ и ключ копий. Без пароля файла его не открыть.',
    applyWith: 'На новом сервере:',
    needSettings:
      'Нужен файл настроек: cms restore --server <файл> --db site.db',
    applied: 'Настройки сервера применены к',
    notify: 'уведомления и почтовый шлюз',
    formsSecret: 'секрет печатей форм',
    assistant: 'подключение ИИ',
    schedule: 'расписание копий',
    offsite: 'хранилище копий и ключ копий',
    folderReset: (folder: string) =>
      `каталог копий ${folder} — путь другой машины: копии здесь ложатся в backups рядом с базой`,
    keyReplaced: (from: string, to: string) =>
      `ключ копий заменён: был ${from}, стал ${to} — копии, запечатанные прежним, открывает его ключ восстановления`,
    tokens: (added: number, present: number) =>
      `ключи API: добавлено ${added}, уже были ${present}`,
    skipped: (emails: string) =>
      `ключи API пропущены — нет пользователей с почтой ${emails}`,
    following:
      'Сервер на этой базе подхватит настройки сам, на ближайшем запросе. Служба: cms service restart — сразу.',
    offsiteOff:
      'Хранилище копий не включено. Включите его в менеджере («Настройки» → «Копии и обновления») или привезите настройки: cms restore --server <файл>.',
    copied: 'Копия сайта:',
    uploaded: 'В хранилище:',
    noCopies: 'В хранилище нет копий.',
    copiesTitle: 'Копии в хранилище',
    restoreHint: 'Восстановить: cms restore --remote <имя> или latest',
    secret: 'Секрет ключа доступа S3: ',
    recovery: 'Ключ восстановления: ',
    noRecovery: (id: string | null) =>
      `Копия запечатана ключом ${id}, а в этой базе его нет. Нужен ключ восстановления: CMS_RECOVERY_KEY или ввод на терминале.`,
    otherRecovery: (have: string, need: string | null) =>
      `Это ключ восстановления ключа ${have}, а копия запечатана ключом ${need}.`,
    restored: 'Сайт восстановлен из',
    into: 'в',
    pages: (n: number) => `страниц ${n}`,
    before: 'Прежнее состояние:',
    noOffsiteHere:
      'Хранилище и ключ копий в этой базе не настроены. Чтобы сервер продолжал отправлять копии, привезите настройки: cms restore --server <файл>.',
    compacted: (before: string, after: string, seconds: string) =>
      `База сжата: ${before} → ${after} за ${seconds} с`,
    nothingFree: 'Сжимать нечего: свободных страниц в базе нет.',
  },
  en: {
    kb: 'KB',
    mb: 'MB',
    decimal: '.',
    noDb: (db: string) => `No database ${db}. Name the file: --db site.db`,
    exists: (file: string) => `${file} already exists. Choose another name.`,
    noFile: (file: string) => `No file ${file}.`,
    passphrase: 'Settings file passphrase: ',
    again: 'Once more:                ',
    mismatch: 'The passphrases do not match.',
    cancelled: 'Cancelled.',
    noPassphrase:
      'No terminal for the passphrase. Pass it in CMS_SETTINGS_PASSPHRASE.',
    settingsWritten: 'Server settings:',
    inside: 'Inside',
    nothing: 'nothing: this server has no settings of its own yet',
    parts: {
      email: 'email',
      telegram: 'Telegram',
      gateway: (n: number) => `mail gateway (${n} tokens)`,
      forms: 'form stamp secret',
      schedule: 'backup schedule',
      offsite: (id: string | null) =>
        id ? `backup storage (key ${id})` : 'backup storage',
      assistant: 'AI connection',
      tokens: (n: number) => `API tokens (${n})`,
    },
    keepSafe:
      'Keep the file like a password: it holds the mail password, the AI key and the backup key. Without its passphrase it cannot be opened.',
    applyWith: 'On the new server:',
    needSettings:
      'A settings file is needed: cms restore --server <file> --db site.db',
    applied: 'Server settings applied to',
    notify: 'notifications and the mail gateway',
    formsSecret: 'form stamp secret',
    assistant: 'AI connection',
    schedule: 'backup schedule',
    offsite: 'backup storage and backup key',
    folderReset: (folder: string) =>
      `backup folder ${folder} is a path of the other machine: copies here go to backups next to the database`,
    keyReplaced: (from: string, to: string) =>
      `backup key replaced: was ${from}, now ${to}; copies sealed with the old one open with its recovery key`,
    tokens: (added: number, present: number) =>
      `API tokens: ${added} added, ${present} already there`,
    skipped: (emails: string) =>
      `API tokens skipped: no users with the email ${emails}`,
    following:
      'A server on this database picks the settings up by itself on its next request. For a service, cms service restart does it at once.',
    offsiteOff:
      'Backup storage is not on. Turn it on in the manager (Settings → Backups and updates) or bring the settings over: cms restore --server <file>.',
    copied: 'Site copy:',
    uploaded: 'In storage:',
    noCopies: 'There are no copies in storage.',
    copiesTitle: 'Copies in storage',
    restoreHint: 'Restore: cms restore --remote <name> or latest',
    secret: 'S3 secret access key: ',
    recovery: 'Recovery key: ',
    noRecovery: (id: string | null) =>
      `The copy is sealed with key ${id}, which this database does not have. A recovery key is needed: CMS_RECOVERY_KEY or type it in a terminal.`,
    otherRecovery: (have: string, need: string | null) =>
      `This recovery key belongs to key ${have}, and the copy is sealed with key ${need}.`,
    restored: 'Site restored from',
    into: 'into',
    pages: (n: number) => `${n} pages`,
    before: 'Previous state:',
    noOffsiteHere:
      'Backup storage and the backup key are not set up in this database. For this server to keep sending copies, bring the settings over: cms restore --server <file>.',
    compacted: (before: string, after: string, seconds: string) =>
      `Database compacted: ${before} → ${after} in ${seconds} s`,
    nothingFree: 'Nothing to compact: the database has no free pages.',
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _say = (ctx: Pick<Context, 'language'>): _Say => _SAY[ctx.language];

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(message));

const _size = (bytes: number, say: _Say): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} ${say.kb}`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', say.decimal)} ${say.mb}`;

const _dot = (paint: Paint): string => paint.dim(' · ');

const _today = (): string => new Date().toISOString().slice(0, 10);

const _mediaCache = (ctx: Context): { mediaCache?: string } =>
  ctx.options.mediaCache ? { mediaCache: ctx.options.mediaCache } : {};

const _withApp = <T>(
  ctx: Context,
  run: (app: App) => T | Promise<T>
): Promise<T> =>
  Bun.file(ctx.options.db)
    .exists()
    .then((exists) =>
      exists
        ? ((app) =>
            Promise.resolve()
              .then(() => run(app))
              .finally(() => app.close()))(
            createApp({ databasePath: ctx.options.db, ..._mediaCache(ctx) })
          )
        : _reject(_say(ctx).noDb(ctx.options.db))
    );

const _hidden = (ctx: Context, question: string): Promise<string> =>
  promptHidden(question, _say(ctx).cancelled);

// Пароль файла: из окружения — для скриптов, иначе скрытый ввод; при записи — дважды.
const _passphrase = (ctx: Context, twice: boolean): Promise<string> =>
  ctx.options.passphrase
    ? Promise.resolve(ctx.options.passphrase)
    : !ctx.tty
      ? _reject(_say(ctx).noPassphrase)
      : _hidden(ctx, _say(ctx).passphrase).then((first) =>
          twice
            ? _hidden(ctx, _say(ctx).again).then((second) =>
                second === first ? first : _reject(_say(ctx).mismatch)
              )
            : first
        );

const _contents = (settings: ServerSettings, say: _Say): string[] =>
  [
    settings.notify?.email ? say.parts.email : null,
    settings.notify?.telegram ? say.parts.telegram : null,
    settings.notify && settings.notify.gateway.tokens.length > 0
      ? say.parts.gateway(settings.notify.gateway.tokens.length)
      : null,
    settings.forms ? say.parts.forms : null,
    settings.upkeep.schedule ? say.parts.schedule : null,
    settings.upkeep.offsite
      ? say.parts.offsite(
          settings.upkeep.offsite.key
            ? keyIdOf(Uint8Array.fromBase64(settings.upkeep.offsite.key))
            : null
        )
      : null,
    settings.assistant ? say.parts.assistant : null,
    settings.tokens.length > 0
      ? say.parts.tokens(settings.tokens.length)
      : null,
  ].filter((_) => _ !== null);

/** `cms backup --server [<файл>]`: настройки этого сервера в файл, запечатанный паролем. */
export var backupServer = (ctx: Context): Promise<void> =>
  ((target, say) =>
    Bun.file(target)
      .exists()
      .then((exists) =>
        exists
          ? _reject(say.exists(target))
          : _passphrase(ctx, true).then((passphrase) =>
              Promise.resolve(passphrase)
                .then(checkPassphrase)
                .then(() => _withApp(ctx, (app) => app.serverSettings.read()))
                .then((settings) =>
                  sealServerSettings(settings, passphrase)
                    .then((bytes) => Bun.write(target, bytes))
                    .then(() => (chmodSync(target, 0o600), settings))
                )
            )
      )
      .then((settings) =>
        ((contents) =>
          ctx.out(
            [
              `${ctx.paint.ok('✓')} ${say.settingsWritten} ${ctx.paint.path(target)}${_dot(ctx.paint)}${_size(Bun.file(target).size, say)}`,
              `  ${padEnd(ctx.paint.dim(say.inside), 10)}${contents.length > 0 ? contents.join(', ') : say.nothing}`,
              `  ${ctx.paint.dim(say.keepSafe)}`,
              `  ${say.applyWith} ${ctx.paint.bold(PROGRAM)} ${ctx.paint.command('restore')} ${ctx.paint.flag('--server')} ${target} ${ctx.paint.flag('--db')} site.db`,
            ].join('\n')
          ))(_contents(settings, say))
      ))(ctx.args[0] ?? `cms-server-${_today()}.enc`, _say(ctx));

const _applied = (report: ServerSettingsReport, say: _Say): string[] =>
  [
    report.notify ? say.notify : null,
    report.forms ? say.formsSecret : null,
    report.assistant ? say.assistant : null,
    report.upkeep.schedule ? say.schedule : null,
    report.upkeep.offsite ? say.offsite : null,
    report.upkeep.folderReset
      ? say.folderReset(report.upkeep.folderReset)
      : null,
    report.upkeep.keyReplaced
      ? say.keyReplaced(
          report.upkeep.keyReplaced.from,
          report.upkeep.keyReplaced.to
        )
      : null,
    report.tokens.added + report.tokens.present > 0
      ? say.tokens(report.tokens.added, report.tokens.present)
      : null,
    report.tokens.skipped.length > 0
      ? say.skipped(report.tokens.skipped.join(', '))
      : null,
  ].filter((_) => _ !== null);

/** `cms restore --server <файл>`: привезённые настройки сервера — в базу `--db`. */
export var restoreServer = (ctx: Context): Promise<void> =>
  ((say) =>
    (ctx.args[0] ? Promise.resolve(ctx.args[0]) : _reject(say.needSettings))
      .then((file) =>
        Bun.file(file)
          .exists()
          .then((exists) =>
            exists ? Bun.file(file).bytes() : _reject(say.noFile(file))
          )
      )
      .then((bytes) =>
        Bun.file(ctx.options.db)
          .exists()
          .then((exists) =>
            exists ? _passphrase(ctx, false) : _reject(say.noDb(ctx.options.db))
          )
          .then((passphrase) => openServerSettings(bytes, passphrase))
      )
      .then((settings) =>
        _withApp(ctx, (app) => app.serverSettings.apply(settings))
      )
      .then((report) =>
        ctx.out(
          [
            `${ctx.paint.ok('✓')} ${say.applied} ${ctx.paint.path(ctx.options.db)}`,
            ..._applied(report, say).map((_) => `  ${ctx.paint.dim('•')} ${_}`),
            `  ${ctx.paint.dim(say.following)}`,
          ].join('\n')
        )
      ))(_say(ctx));

/** `cms backup --remote`: копия сайта сейчас — в каталог копий и в хранилище, как кнопкой в менеджере. */
export var backupRemote = (ctx: Context): Promise<void> =>
  ((say) =>
    _withApp(ctx, (app) =>
      app.upkeep.offsite.status().settings.enabled
        ? app.upkeep.backups
            .run(true)
            .then((run) => ({ run, offsite: app.upkeep.offsite.status() }))
        : _reject(say.offsiteOff)
    ).then(({ run, offsite }) =>
      ctx.out(
        [
          `${ctx.paint.ok('✓')} ${say.copied} ${ctx.paint.path(run.file)}${_dot(ctx.paint)}${_size(run.size, say)}`,
          `  ${padEnd(ctx.paint.dim(say.uploaded), 14)}${offsite.last?.name ?? '—'}${_dot(ctx.paint)}${_size(offsite.last?.size ?? 0, say)}`,
        ].join('\n')
      )
    ))(_say(ctx));

const _overrides = (ctx: Context, secret?: string): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries({
      endpoint: ctx.options.endpoint,
      region: ctx.options.region,
      bucket: ctx.options.bucket,
      prefix: ctx.options.prefix,
      accessKey: ctx.options.accessKey,
      secret: secret ?? ctx.options.secretKey,
    }).filter(({ 1: value }) => value !== undefined)
  );

// Хранилище: сохранённое в базе, поверх — флаги и окружение; секрета нигде нет — спросим на терминале.
const _store = (ctx: Context, app: App): Promise<RemoteStore> =>
  Promise.resolve()
    .then(() => app.upkeep.offsite.store(_overrides(ctx)))
    .then(undefined, (error) =>
      isDomainError(error) &&
      error.code === 'upkeep.offsite_not_configured' &&
      ctx.tty &&
      (ctx.options.bucket || app.upkeep.offsite.status().settings.bucket)
        ? _hidden(ctx, _say(ctx).secret).then((secret) =>
            app.upkeep.offsite.store(_overrides(ctx, secret))
          )
        : Promise.reject(error)
    );

const _listCopies = (ctx: Context, copies: readonly RemoteCopy[]): void =>
  ((say) =>
    ctx.out(
      copies.length === 0
        ? say.noCopies
        : [
            ctx.paint.bold(say.copiesTitle),
            ...copies.map(
              (_) =>
                `  ${padEnd(_.name, 44)}${padEnd(_size(_.size, say), 10)}${ctx.paint.dim((_.at ?? '').slice(0, 16).replace('T', ' '))}`
            ),
            '',
            ctx.paint.dim(say.restoreHint),
          ].join('\n')
    ))(_say(ctx));

// Ключ копии: свой, если отпечаток тот же, иначе ключ восстановления из окружения или с терминала.
const _keyFor = (
  ctx: Context,
  app: App,
  keyId: string | null
): Promise<Uint8Array<ArrayBuffer>> =>
  ((own, say) =>
    own && keyIdOf(own) === keyId
      ? Promise.resolve(own)
      : (ctx.options.recoveryKey
          ? Promise.resolve(ctx.options.recoveryKey)
          : ctx.tty
            ? _hidden(ctx, say.recovery)
            : _reject(say.noRecovery(keyId))
        )
          .then(parseRecoveryKey)
          .then((key) =>
            keyIdOf(key) === keyId
              ? key
              : _reject(say.otherRecovery(keyIdOf(key), keyId))
          ))(app.upkeep.offsite.key(), _say(ctx));

const _restoreCopy = (
  ctx: Context,
  app: App,
  store: RemoteStore,
  name: string
): Promise<void> =>
  ((say, temp) =>
    store
      .header(name)
      .then((header) => _keyFor(ctx, app, header.keyId))
      .then((key) => store.download(name, temp, key))
      .then(() => app.restoreFile(temp))
      .then(
        (report) =>
          ctx.out(
            [
              `${ctx.paint.ok('✓')} ${say.restored} ${name} ${say.into} ${ctx.paint.path(ctx.options.db)}${_dot(ctx.paint)}${say.pages(report.pages)}`,
              ...(report.savedTo
                ? [
                    `  ${ctx.paint.dim(say.before)} ${ctx.paint.path(report.savedTo)}`,
                  ]
                : []),
              ...(app.upkeep.offsite.key()
                ? []
                : [`  ${ctx.paint.dim(say.noOffsiteHere)}`]),
            ].join('\n')
          ),
        (error) => (rmSync(temp, { force: true }), Promise.reject(error))
      ))(_say(ctx), tempPath());

/**
 * `cms restore --remote [<имя>|latest]`: без имени — список копий в хранилище; с именем — скачать,
 * распечатать и восстановить в `--db`. База может быть новой: так сайт переезжает на чистую машину.
 */
export var restoreRemote = (ctx: Context): Promise<void> =>
  Bun.file(ctx.options.db)
    .exists()
    .then((exists) => _remote(ctx, _target(ctx, exists)));

// Только список на машине без базы — в памяти: заглянуть в хранилище не значит создать пустую базу.
const _target = (ctx: Context, exists: boolean): App =>
  createApp(
    exists || ctx.args[0] !== undefined
      ? { databasePath: ctx.options.db, ..._mediaCache(ctx) }
      : {}
  );

const _remote = (ctx: Context, app: App): Promise<void> =>
  _store(ctx, app)
    .then((store) =>
      ctx.args[0] === undefined
        ? store.list().then((copies) =>
            _listCopies(
              ctx,
              copies.toSorted((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
            )
          )
        : (ctx.args[0] === 'latest'
            ? store
                .list()
                .then((copies) =>
                  pipe(latestCopy, (_) =>
                    _ ? _.name : _reject(_say(ctx).noCopies)
                  )(copies)
                )
            : Promise.resolve(ctx.args[0])
          ).then((name) => _restoreCopy(ctx, app, store, name))
    )
    .finally(() => app.close());

/** `cms compact`: сжать базу на месте, можно на работающем сайте. */
export var compact = (ctx: Context): Promise<void> =>
  ((say) =>
    _withApp(ctx, (app) =>
      app.upkeep.database.status().free === 0
        ? null
        : app.upkeep.database.compact()
    ).then((run) =>
      ctx.out(
        run
          ? `${ctx.paint.ok('✓')} ${say.compacted(_size(run.before, say), _size(run.after, say), (run.ms / 1000).toFixed(2).replace('.', say.decimal))}`
          : say.nothingFree
      )
    ))(_say(ctx));
