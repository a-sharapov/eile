import { Database } from 'bun:sqlite';
import {
  chmodSync,
  chownSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { networkInterfaces } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { prepareSite } from '../app.ts';
import { restorePrevious } from '../contexts/upkeep/index.ts';
import { isSqlite } from '../platform/archive.ts';
import { backupDatabase } from '../platform/database.ts';
import { PRODUCT, REPOSITORY } from '../product.ts';
import { attempt, fail, rethrow } from '../shared/kernel/errors.ts';
import { pipe } from '../shared/kernel/pipe.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';
import { named, PROGRAM } from './program.ts';
import {
  assess,
  blocking,
  type Concern,
  domainsOf,
  type HostFacts,
  holderOf,
  INSTALLED_BINARY,
  installCommand,
  listeningPorts,
  localUrl,
  parseMeminfo,
  parseShow,
  planService,
  readUnit,
  renderUnit,
  type ServicePlan,
  SWAP_COMMANDS,
  sameUnit,
  serviceDatabase,
  siteUrl,
  type UnitFacts,
  unitFile,
  unitName,
  unitOptions,
} from './systemd.ts';

/** Ответ команды: код выхода, stdout и stderr. */
export type Ran = {
  readonly code: number;
  readonly out: string;
  readonly err: string;
};

/** Машина для `cms service` и `cms update`: всё, что трогает систему, — здесь; тесты подменяют. */
export type Host = {
  readonly platform: string;
  readonly root: boolean;
  /** Система загружена systemd, и systemctl на месте. */
  readonly systemd: () => boolean;
  /** Этот бинарник: `process.execPath`. */
  readonly binary: string;
  /** Запущен бинарник, а не исходники. */
  readonly standalone: boolean;
  /** Путь без символьных ссылок; нет файла — как есть. */
  readonly real: (path: string) => string;
  /** Права файла; null — его нет. */
  readonly mode: (path: string) => number | null;
  readonly read: (path: string) => string | null;
  readonly write: (path: string, text: string) => void;
  readonly remove: (path: string) => void;
  /** Полные пути файлов каталога. */
  readonly list: (dir: string) => readonly string[];
  readonly run: (command: readonly string[]) => Promise<Ran>;
  /** Команда с выводом прямо в терминал; ответ — код выхода. */
  readonly attach: (command: readonly string[]) => Promise<number>;
  /** Отвечает ли адрес по HTTP — любым ответом. */
  readonly answers: (url: string) => Promise<boolean>;
  readonly wait: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly memory: () => HostFacts['memory'];
  readonly addresses: () => readonly string[];
  readonly resolve: (domain: string) => Promise<readonly string[]>;
  /** Кто держит порт: null — свободен. */
  readonly holder: (port: number) => Promise<string | null>;
  /** Откат обновления: прежний бинарник — на место. */
  readonly restore: (binary: string, previous: string) => void;
  /** Сайт из базы — в каталог службы; ответ — путь новой базы. */
  readonly place: (from: string, name: string) => Promise<string>;
  /** Снимок базы службы перед обновлением; не вышло — исключение. */
  readonly snapshot: (db: string, target: string) => void;
  /** Применённые миграции базы; null — её не прочесть. */
  readonly migrations: (db: string) => readonly string[] | null;
  /** База — снова снимок; та, что была, со своим WAL — в `aside`. */
  readonly putBack: (snapshot: string, db: string, aside: string) => void;
};

// --- база для --from ----------------------------------------------------------

/**
 * Каталог состояния службы. Есть /var/lib/<имя> (ссылка systemd на private/<имя> или старый каталог,
 * который systemd сам перенесёт в private при запуске) — он; нет — private/<имя> с правами 700, как его
 * создал бы systemd.
 */
export var stateDir = (root: string, name: string): string =>
  existsSync(join(root, name))
    ? realpathSync(join(root, name))
    : ((dir) => (
        mkdirSync(join(root, 'private'), { recursive: true, mode: 0o700 }),
        mkdirSync(dir, { recursive: true, mode: 0o700 }),
        dir
      ))(join(root, 'private', name));

// Снимок работающей базы — VACUUM INTO, как у cms backup: живой WAL копировать как файл нельзя.
const _snapshot = (from: string, part: string): void => {
  const source = new Database(from, { readwrite: true });
  try {
    rmSync(part, { force: true });
    backupDatabase(source, part);
  } finally {
    source.close();
  }
};

// systemd меняет владельца каталога службы на её пользователя, только если не совпадает владелец самого
// каталога. Каталог уже службы — новой базе нужен его владелец; каталог root — systemd поправит всё сам.
const _own = (target: string, dir: string): void =>
  ((owner) =>
    [target, `${target}-wal`, `${target}-shm`]
      .filter((_) => existsSync(_))
      .forEach((_) => void chownSync(_, owner.uid, owner.gid)))(statSync(dir));

/**
 * Сайт из базы `from` — в каталог службы `dir` как site.db: согласованный снимок (можно на работающем
 * сайте), проверка и схема этой версии, владелец — как у каталога. Своя база службы не заменяется.
 */
export var placeDatabase = (from: string, dir: string): Promise<string> =>
  ((target, part) =>
    Bun.file(from)
      .exists()
      .then((exists) =>
        exists
          ? Bun.file(from).slice(0, 16).bytes()
          : fail('service.no_source', `No database ${from}`)
      )
      .then(
        pipe(
          (head: Uint8Array) =>
            isSqlite(head)
              ? existsSync(target)
                ? fail('service.has_database', `${target} already exists`)
                : from
              : fail('service.not_database', `${from} is not an SQLite file`),
          (_) => _snapshot(_, part),
          () =>
            attempt(
              () => prepareSite(part),
              (error) => (rmSync(part, { force: true }), rethrow(error))
            ),
          () => renameSync(part, target),
          () => _own(target, dir),
          () => target
        )
      ))(join(dir, 'site.db'), join(dir, `.site.db.${process.pid}.part`));

// --- база при обновлении --------------------------------------------------------

// Рядом с базой — по одной копии каждого рода: снимок перед обновлением (before) и база, на которой новая
// версия не поднялась (failed).
const _drop = (db: string, kind: string, keep: string | null): void =>
  ((folder, prefix) =>
    readdirSync(folder)
      .filter((_) => _.startsWith(prefix) && join(folder, _) !== keep)
      .forEach((_) => void rmSync(join(folder, _), { force: true })))(
    dirname(db),
    `${basename(db)}.${kind}-`
  );

/** Снимок базы службы перед обновлением: VACUUM INTO, права 600, владелец — как у базы; прежний снимок уходит. */
export var snapshotDatabase = (db: string, target: string): void =>
  ((part) =>
    attempt(
      () => (
        _snapshot(db, part),
        ((owner) => chownSync(part, owner.uid, owner.gid))(statSync(db)),
        renameSync(part, target),
        _drop(db, 'before', target)
      ),
      (error) => (rmSync(part, { force: true }), rethrow(error))
    ))(`${target}.part`);

/** Применённые миграции базы; null — её не открыть или журнала миграций в ней нет. */
export var appliedMigrations = (db: string): readonly string[] | null =>
  attempt(
    () => {
      const sqlite = new Database(db, { readwrite: true });
      try {
        return sqlite
          .query<{ id: string }, []>('SELECT id FROM _migrations')
          .all()
          .map((_) => _.id);
      } finally {
        sqlite.close();
      }
    },
    () => null
  );

/**
 * База — снова снимок перед обновлением: подготовленная копия встаёт на место одним переименованием, с
 * владельцем и правами прежней. Прежняя — жёсткой ссылкой в `aside` вместе со своим WAL: записанное после
 * снимка не пропадает, а чужой WAL рядом с возвращённой базой не останется.
 */
export var putBackDatabase = (
  snapshot: string,
  db: string,
  aside: string
): void =>
  ((owner, part) =>
    attempt(
      () => (
        copyFileSync(snapshot, part),
        chownSync(part, owner.uid, owner.gid),
        chmodSync(part, owner.mode & 0o777),
        _drop(db, 'failed', null),
        linkSync(db, aside),
        ['-wal', '-shm'].forEach(
          (suffix) =>
            void (
              existsSync(`${db}${suffix}`) &&
              renameSync(`${db}${suffix}`, `${aside}${suffix}`)
            )
        ),
        rmSync(`${db}-journal`, { force: true }),
        renameSync(part, db)
      ),
      (error) => (rmSync(part, { force: true }), rethrow(error))
    ))(statSync(db), `${db}.back.${process.pid}`);

// --- настоящая машина -----------------------------------------------------------

const _run = (command: readonly string[]): Promise<Ran> =>
  Promise.resolve()
    .then(() => Bun.spawn([...command], { stdout: 'pipe', stderr: 'pipe' }))
    .then((proc) =>
      Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
    )
    .then(
      ({ 0: code, 1: out, 2: err }) => ({ code, out, err }),
      (error) => ({ code: 127, out: '', err: String(error) })
    );

// Порт свободен, если на нём встаёт сервер — тот же Bun.serve, что у сайта; занят — имя держателя от ss.
const _holder = (port: number): Promise<string | null> =>
  attempt(
    () => (
      void Bun.serve({ port, fetch: () => new Response() }).stop(true), true
    ),
    () => false
  )
    ? Promise.resolve(null)
    : _run(['ss', '-H', '-ltnp', `sport = :${port}`]).then((_) =>
        holderOf(_.out)
      );

/** Эта машина. */
export var defineHost = (): Host => ({
  platform: process.platform,
  root: process.getuid?.() === 0,
  systemd: () =>
    existsSync('/run/systemd/system') && Bun.which('systemctl') !== null,
  binary: process.execPath,
  standalone: Bun.isStandaloneExecutable,
  real: (path) =>
    attempt(
      () => realpathSync(path),
      () => path
    ),
  mode: (path) =>
    attempt(
      () => statSync(path).mode,
      () => null
    ),
  read: (path) =>
    attempt(
      () => readFileSync(path, 'utf8'),
      () => null
    ),
  write: (path, text) => writeFileSync(path, text, { mode: 0o644 }),
  remove: (path) => rmSync(path, { force: true }),
  list: (dir) =>
    attempt(
      () => readdirSync(dir).map((_) => join(dir, _)),
      () => []
    ),
  run: _run,
  attach: (command) =>
    Bun.spawn([...command], { stdio: ['inherit', 'inherit', 'inherit'] })
      .exited,
  answers: (url) =>
    fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) }).then(
      (response) => (void response.body?.cancel(), true),
      () => false
    ),
  wait: (ms) => Bun.sleep(ms),
  now: () => Date.now(),
  memory: () =>
    parseMeminfo(
      attempt(
        () => readFileSync('/proc/meminfo', 'utf8'),
        () => ''
      )
    ),
  addresses: () =>
    Object.values(networkInterfaces())
      .flat()
      .flatMap((_) => (_ ? [_.address] : [])),
  resolve: (domain) =>
    Bun.dns.lookup(domain, { family: 0 }).then(
      (_) => _.map((record) => record.address),
      () => []
    ),
  holder: _holder,
  restore: (binary, previous) => restorePrevious(binary, previous),
  place: (from, name) => placeDatabase(from, stateDir('/var/lib', name)),
  snapshot: snapshotDatabase,
  migrations: appliedMigrations,
  putBack: putBackDatabase,
});

// --- тексты ---------------------------------------------------------------------

const _SAY = {
  ru: {
    mb: 'МБ',
    unsupported:
      'cms service ставит сайт службой systemd, а здесь её нет: нужен Linux, загруженный systemd. Как запустить сервер иначе — README, раздел «На сервере».',
    fromSource:
      'Служба запускает установленный бинарник, а этот cms запущен из исходников. Посмотреть юнит можно и так: cms service install … --print',
    hiddenBinary: (path: string) =>
      `Службе не виден ${path}: она работает от своего пользователя, домашние и временные каталоги ей закрыты. Положите cms в /usr/local/bin: sudo install -m 755 ${path} /usr/local/bin/cms`,
    privateBinary: (path: string) =>
      `${path} может запустить только владелец, а служба работает от своего пользователя: sudo chmod 755 ${path}`,
    needRoot: (command: string) =>
      `Это меняет службы системы — нужен root. Запустите:\n  ${command}`,
    otherUnit: (path: string) =>
      `В ${path} уже другой юнит. Посмотреть новый — --print, заменить — --force.`,
    refused: 'Служба не установлена: сначала поправьте то, что выше.',
    portBusy: (port: number, holder: string) =>
      `Порт ${port} занят${holder ? `: ${holder}` : ''}.`,
    behindProxy: (holder: string) =>
      `Если ${holder} остаётся перед сайтом, поставьте ${PRODUCT} за ним: cms service install --trust-proxy, а в ${holder} — прокси на http://127.0.0.1:8080`,
    freePort: 'Освободите порт или займите другой: --port.',
    dnsMissing: (domain: string) =>
      `${domain} не находится в DNS: сертификат не выпустится, пока запись A или AAAA не укажет на этот сервер.`,
    dnsElsewhere: (domain: string, addresses: string) =>
      `${domain} указывает на ${addresses}, а у этой машины другие адреса. За NAT и с облачным адресом так бывает; иначе поправьте DNS — без него сертификата не будет.`,
    lowMemory: (size: string) =>
      `Памяти ${size}, а подкачки нет: под нагрузкой, например на загрузке большого файла, сайт может убить OOM. Файл подкачки на 1 ГиБ (при 512 МБ лучше на 2):`,
    moved: 'Сайт перенесён:',
    systemctlFailed: (command: string, error: string) =>
      `systemctl ${command} не удался: ${error.trim()}`,
    silent: (name: string, seconds: number) =>
      `Служба ${name} не ответила за ${seconds} с. Весь журнал — cms service logs`,
    journal: 'Журнал службы:',
    running: (name: string) => `Служба ${name} работает`,
    already: (name: string) => `Служба ${name} уже установлена и работает`,
    site: 'Сайт',
    manager: 'Менеджер',
    db: 'База',
    admin: 'Администратор',
    version: 'Версия',
    since: 'Запущена',
    memory: 'Память',
    restarts: 'Перезапуски',
    afterFailure: (n: number) => `${n} после сбоя`,
    certificate: (http: string) =>
      `Если сертификата HTTPS ещё нет, он придёт за минуту; до тех пор сайт открывается по ${http}`,
    proxyNext: (address: string) =>
      `Направьте прокси на ${address} и впишите адрес сайта в менеджере: «Настройки → Сайт».`,
    setupInJournal:
      'Администратора ещё нет? Ссылка для него — в журнале: cms service logs',
    next: 'Состояние — cms service status, журнал — cms service logs',
    noService: (name: string) =>
      `Службы ${name} нет. Поставить: sudo cms service install --domain example.com`,
    notRunning: (name: string, state: string) =>
      `Служба ${name} не работает: ${state}. Журнал — cms service logs`,
    fileVersion: (version: string) =>
      `файл уже ${version}: перезапустите — sudo cms service restart`,
    restarted: (name: string) => `Служба ${name} перезапущена`,
    nothing: (name: string) => `Службы ${name} нет — удалять нечего.`,
    foreignUnit: (path: string) =>
      `${path} запускает не этот cms — не трогаю. Удалить его: systemctl disable --now и rm.`,
    removed: (name: string) => `Служба ${name} остановлена и удалена`,
    kept: 'Данные',
    cache: 'Кэш',
    again: (command: string) => `Вернуть службу на этих данных: ${command}`,
    purge: (dirs: string) => `Удалить данные совсем: sudo rm -rf ${dirs}`,
    noLogs:
      'Журнал служб читает root или группа systemd-journal: sudo cms service logs',
    noSubcommand: (name: string | undefined) =>
      `Нет подкоманды service ${name}. Есть: install, status, logs, restart, uninstall — cms help service`,
    restartServer:
      'Перезапустите сервер: новая версия заработает после перезапуска.',
    serviceUpdated: (name: string, version: string) =>
      `Служба ${name} перезапущена на ${version}`,
    rolledBack: (version: string, current: string) =>
      `Новая версия ${version} не поднялась — вернул ${current}, службы работают на ней.`,
    broken: (current: string) =>
      `Новая версия не поднялась, и после отката на ${current} службы тоже молчат.`,
    silentAfter: (name: string, seconds: number) =>
      `${name}: не ответила за ${seconds} с`,
    wrongVersion: (name: string, running: string) =>
      `${name}: работает ${running}`,
    updateFailed: (names: string) =>
      `Обновление отменено. Журнал — cms service logs${names}`,
    snapshotFailed: (name: string, error: string) =>
      `Копия базы службы ${name} перед обновлением не снялась: ${error}`,
    untouched: (current: string) =>
      `Службы не перезапущены, на месте снова прежний cms — сайт работает на ${current}.`,
    notUpdated:
      'Обновление не применено: без копии базы служба не перезапускается. Устраните причину и повторите: sudo cms update',
    snapshotKept: (path: string) => `копия базы до обновления — ${path}`,
    dbRestored: (name: string, from: string, to: string, aside: string) =>
      `база ${name} — снова копия, снятая перед обновлением в ${from}; что сайт записал с ${from} по ${to}, лежит в ${aside}`,
    dbNotRestored: (name: string, error: string, snapshot: string) =>
      `базу ${name} вернуть к копии не удалось: ${error}; копия — ${snapshot}`,
  },
  en: {
    mb: 'MB',
    unsupported:
      'cms service installs the site as a systemd service, and there is no systemd here: it needs Linux booted with systemd. Other ways to run the server: README, “On a server”.',
    fromSource:
      'The service runs the installed binary, and this cms runs from source. The unit can still be shown: cms service install … --print',
    hiddenBinary: (path: string) =>
      `The service cannot see ${path}: it runs as its own user, and home and temporary directories are closed to it. Put cms into /usr/local/bin: sudo install -m 755 ${path} /usr/local/bin/cms`,
    privateBinary: (path: string) =>
      `Only the owner can run ${path}, and the service runs as its own user: sudo chmod 755 ${path}`,
    needRoot: (command: string) =>
      `This changes system services, root is needed. Run:\n  ${command}`,
    otherUnit: (path: string) =>
      `${path} holds another unit. See the new one with --print, replace it with --force.`,
    refused: 'The service is not installed: fix what is above first.',
    portBusy: (port: number, holder: string) =>
      `Port ${port} is taken${holder ? ` by ${holder}` : ''}.`,
    behindProxy: (holder: string) =>
      `If ${holder} stays in front of the site, put ${PRODUCT} behind it: cms service install --trust-proxy, and in ${holder} a proxy to http://127.0.0.1:8080`,
    freePort: 'Free the port or take another one: --port.',
    dnsMissing: (domain: string) =>
      `${domain} is not in DNS: no certificate until an A or AAAA record points at this server.`,
    dnsElsewhere: (domain: string, addresses: string) =>
      `${domain} points at ${addresses}, and this machine has other addresses. Behind NAT or with a cloud address that happens; otherwise fix the DNS, there is no certificate without it.`,
    lowMemory: (size: string) =>
      `${size} of memory and no swap: under load, for example on a large upload, the OOM killer can stop the site. A 1 GiB swap file (2 GiB with 512 MB):`,
    moved: 'Site moved:',
    systemctlFailed: (command: string, error: string) =>
      `systemctl ${command} failed: ${error.trim()}`,
    silent: (name: string, seconds: number) =>
      `The service ${name} did not answer in ${seconds} s. The whole log: cms service logs`,
    journal: 'Service log:',
    running: (name: string) => `The service ${name} is running`,
    already: (name: string) =>
      `The service ${name} is already installed and running`,
    site: 'Site',
    manager: 'Manager',
    db: 'Database',
    admin: 'Administrator',
    version: 'Version',
    since: 'Started',
    memory: 'Memory',
    restarts: 'Restarts',
    afterFailure: (n: number) => `${n} after a failure`,
    certificate: (http: string) =>
      `If there is no HTTPS certificate yet, it comes within a minute; until then the site opens at ${http}`,
    proxyNext: (address: string) =>
      `Point the proxy at ${address} and enter the site address in the manager: Settings → Site.`,
    setupInJournal:
      'No administrator yet? The link for one is in the log: cms service logs',
    next: 'State: cms service status, log: cms service logs',
    noService: (name: string) =>
      `There is no service ${name}. Install it: sudo cms service install --domain example.com`,
    notRunning: (name: string, state: string) =>
      `The service ${name} is not running: ${state}. Log: cms service logs`,
    fileVersion: (version: string) =>
      `the file is ${version} already: restart with sudo cms service restart`,
    restarted: (name: string) => `The service ${name} restarted`,
    nothing: (name: string) =>
      `There is no service ${name}, nothing to remove.`,
    foreignUnit: (path: string) =>
      `${path} does not run this cms, leaving it alone. To remove it: systemctl disable --now and rm.`,
    removed: (name: string) => `The service ${name} is stopped and removed`,
    kept: 'Data',
    cache: 'Cache',
    again: (command: string) =>
      `Bring the service back on this data: ${command}`,
    purge: (dirs: string) => `Delete the data for good: sudo rm -rf ${dirs}`,
    noLogs:
      'Service logs are for root or the systemd-journal group: sudo cms service logs',
    noSubcommand: (name: string | undefined) =>
      `No subcommand service ${name}. There are install, status, logs, restart, uninstall: cms help service`,
    restartServer: 'Restart the server: the new version runs after a restart.',
    serviceUpdated: (name: string, version: string) =>
      `The service ${name} restarted on ${version}`,
    rolledBack: (version: string, current: string) =>
      `The new version ${version} did not come up: ${current} is back, and the services run on it.`,
    broken: (current: string) =>
      `The new version did not come up, and after going back to ${current} the services are silent too.`,
    silentAfter: (name: string, seconds: number) =>
      `${name}: no answer in ${seconds} s`,
    wrongVersion: (name: string, running: string) => `${name}: runs ${running}`,
    updateFailed: (names: string) =>
      `The update is undone. Log: cms service logs${names}`,
    snapshotFailed: (name: string, error: string) =>
      `The copy of the ${name} database before the update failed: ${error}`,
    untouched: (current: string) =>
      `No service restarted, the previous cms is back in place: the site runs ${current}.`,
    notUpdated:
      'The update is not applied: no service restarts without a database copy. Fix the cause and run again: sudo cms update',
    snapshotKept: (path: string) =>
      `database copy from before the update: ${path}`,
    dbRestored: (name: string, from: string, to: string, aside: string) =>
      `the ${name} database is the copy taken before the update at ${from} again; what the site wrote from ${from} to ${to} is in ${aside}`,
    dbNotRestored: (name: string, error: string, snapshot: string) =>
      `the ${name} database could not go back to the copy: ${error}; the copy is ${snapshot}`,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _say = (ctx: Pick<Context, 'language'>): _Say => _SAY[ctx.language];

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(named(PROGRAM)(message)));

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 15)}${value}`;

const _mb = (bytes: number, say: _Say): string =>
  `${Math.max(1, Math.round(bytes / 1024 ** 2))} ${say.mb}`;

// Первая нарушенная проверка — отказ с её текстом.
const _first = (
  checks: readonly (readonly [boolean, () => string])[]
): Promise<void> =>
  ((found) => (found ? _reject(found[1]()) : Promise.resolve()))(
    checks.find(({ 0: failed }) => failed)
  );

const _systemdChecks = (
  host: Host,
  say: _Say
): (readonly [boolean, () => string])[] => [
  [host.platform !== 'linux' || !host.systemd(), () => say.unsupported],
];

const _rootChecks = (
  host: Host,
  say: _Say,
  command: string
): (readonly [boolean, () => string])[] => [
  ..._systemdChecks(host, say),
  [!host.root, () => say.needRoot(command)],
];

const _nameFlag = (name: string): string =>
  name === 'cms' ? '' : ` --name ${name}`;

const _sudo = (host: Host, subcommand: string, name: string): string =>
  `sudo ${host.binary} service ${subcommand}${_nameFlag(name)}`;

const _systemctl = (
  host: Host,
  say: _Say,
  ...args: string[]
): Promise<string> =>
  host
    .run(['systemctl', ...args])
    .then((_) =>
      _.code === 0
        ? _.out
        : _reject(say.systemctlFailed(args.join(' '), _.err || _.out))
    );

const _isActive = (host: Host, name: string): Promise<boolean> =>
  host
    .run(['systemctl', 'is-active', unitName(name)])
    .then((_) => _.out.trim() === 'active');

// --- здоровье -------------------------------------------------------------------

/** Сколько ждать ответа сайта после запуска: сервер встаёт за доли секунды, миграции большой базы — дольше. */
export var HEALTH_SECONDS = 30;

const _answering = (host: Host, url: string, until: number): Promise<boolean> =>
  host
    .answers(url)
    .then(
      (ok) =>
        ok ||
        (host.now() < until &&
          host.wait(250).then(() => _answering(host, url, until)))
    );

const _healthy = (host: Host, url: string): Promise<boolean> =>
  _answering(host, url, host.now() + HEALTH_SECONDS * 1000);

const _show = (
  host: Host,
  name: string,
  properties: readonly string[]
): Promise<Readonly<Record<string, string>>> =>
  host
    .run([
      'systemctl',
      'show',
      unitName(name),
      ...properties.map((_) => `--property=${_}`),
    ])
    .then((_) => parseShow(_.out));

// Версия процесса службы — запуском его же файла: /proc/<pid>/exe ведёт на тот файл, с которого
// процесс стартовал, даже если на диске его уже заменили. Читать чужой /proc/<pid>/exe может только root.
const _versionOf = (host: Host, executable: string): Promise<string | null> =>
  host
    .run([executable, 'version'])
    .then((_) => (_.code === 0 && _.out.trim() ? _.out.trim() : null));

const _running = (host: Host, name: string): Promise<string | null> =>
  _show(host, name, ['MainPID']).then((props) =>
    host.root && (props.MainPID ?? '0') !== '0'
      ? _versionOf(host, `/proc/${props.MainPID}/exe`)
      : null
  );

const _journal = (host: Host, name: string): Promise<string[]> =>
  host
    .run([
      'journalctl',
      '-u',
      unitName(name),
      '-n',
      '20',
      '--no-pager',
      '-o',
      'cat',
    ])
    .then((_) => _.out.split('\n').filter((line) => line.trim() !== ''));

// Нет ответа — последние строки журнала прямо здесь: в них видно, почему.
const _up = (
  ctx: Context,
  host: Host,
  name: string,
  url: string
): Promise<void> =>
  _healthy(host, url).then((ok) =>
    ok
      ? undefined
      : _journal(host, name).then(
          (lines) => (
            ctx.out(
              [
                ctx.paint.dim(_say(ctx).journal),
                ...lines.map((_) => `  ${ctx.paint.dim(_)}`),
              ].join('\n')
            ),
            _reject(_say(ctx).silent(name, HEALTH_SECONDS))
          )
        )
  );

// Ссылку первичной настройки сервер печатает в журнал при запуске; берём её из этого запуска.
// null — журнал прочитан, ссылки нет: администратор уже есть; undefined — журнал прочитать не удалось.
const _setupToken = (
  host: Host,
  name: string
): Promise<string | null | undefined> =>
  _show(host, name, ['InvocationID'])
    .then((props) =>
      props.InvocationID
        ? host.run([
            'journalctl',
            `_SYSTEMD_INVOCATION_ID=${props.InvocationID}`,
            '-o',
            'cat',
            '--no-pager',
          ])
        : { code: 1, out: '', err: '' }
    )
    .then((_) =>
      _.code === 0
        ? ([..._.out.matchAll(/\/manager\/setup\?token=([\w-]+)/g)].at(
            -1
          )?.[1] ?? null)
        : undefined
    );

// --- install --------------------------------------------------------------------

type _Current = {
  /** Юнита не было, он тот же или другой. */
  readonly state: 'new' | 'same' | 'changed';
  readonly active: boolean;
};

const _CONCERN: {
  readonly [K in Concern['kind']]: (
    say: _Say,
    paint: Paint,
    concern: Extract<Concern, { kind: K }>
  ) => string[];
} = {
  port_busy: (say, paint, _) => [
    `${paint.error('✗')} ${say.portBusy(_.port, _.holder)}`,
    `  ${_.proxy ? say.behindProxy(_.holder) : say.freePort}`,
  ],
  dns_missing: (say, paint, _) => [
    `${paint.warn('!')} ${say.dnsMissing(_.domain)}`,
  ],
  dns_elsewhere: (say, paint, _) => [
    `${paint.warn('!')} ${say.dnsElsewhere(_.domain, _.addresses.join(', '))}`,
  ],
  low_memory: (say, paint, _) => [
    `${paint.warn('!')} ${say.lowMemory(_mb(_.total, say))}`,
    ...SWAP_COMMANDS.map((line) => `    ${line}`),
  ],
};

const _concernLines = (ctx: Context, concern: Concern): string[] =>
  (
    _CONCERN[concern.kind] as (
      say: _Say,
      paint: Paint,
      concern: Concern
    ) => string[]
  )(_say(ctx), ctx.paint, concern);

const _current = (
  ctx: Context,
  host: Host,
  plan: ServicePlan,
  unit: string
): Promise<_Current> =>
  ((text) =>
    ((state) =>
      state === 'changed' && ctx.options.force !== true
        ? _reject(_say(ctx).otherUnit(unitFile(plan.name)))
        : _isActive(host, plan.name).then((active) => ({ state, active })))(
      (text === null
        ? 'new'
        : sameUnit(text, unit)
          ? 'same'
          : 'changed') as _Current['state']
    ))(host.read(unitFile(plan.name)));

// Порты работающей службы держит она сама — их не проверяем.
const _facts = (
  host: Host,
  plan: ServicePlan,
  active: boolean
): Promise<HostFacts> =>
  Promise.all([
    Promise.all(
      (active ? [] : listeningPorts(plan.mode)).map((port) =>
        host.holder(port).then((holder) => ({ port, holder }))
      )
    ),
    Promise.all(
      domainsOf(plan.mode).map((domain) =>
        host.resolve(domain).then((addresses) => ({ domain, addresses }))
      )
    ),
  ]).then(({ 0: ports, 1: domains }) => ({
    ports,
    domains,
    memory: host.memory(),
    local: host.addresses(),
  }));

const _checked = (
  ctx: Context,
  host: Host,
  plan: ServicePlan,
  current: _Current
): Promise<_Current> =>
  _facts(host, plan, current.active).then((facts) =>
    ((concerns) => (
      void (
        concerns.length > 0 &&
        ctx.out(
          named(PROGRAM)(
            concerns.flatMap((_) => _concernLines(ctx, _)).join('\n')
          )
        )
      ),
      concerns.some(blocking) ? _reject(_say(ctx).refused) : current
    ))(assess(facts))
  );

const _moved = (ctx: Context, host: Host, plan: ServicePlan): Promise<void> =>
  plan.from === null
    ? Promise.resolve()
    : host
        .place(plan.from, plan.name)
        .then((target) =>
          ctx.out(
            `${ctx.paint.ok('✓')} ${_say(ctx).moved} ${ctx.paint.path(plan.from!)} → ${ctx.paint.path(target)}`
          )
        );

// Юнит пишется, только если он новый или другой; перезапуск — если он менялся или служба стоит.
const _applied = (
  ctx: Context,
  host: Host,
  plan: ServicePlan,
  unit: string,
  current: _Current
): Promise<_Current> =>
  ((say, service) =>
    Promise.resolve().then(
      pipe(
        () =>
          current.state === 'same'
            ? undefined
            : (host.write(unitFile(plan.name), unit),
              _systemctl(host, say, 'daemon-reload')),
        () => _systemctl(host, say, 'enable', service),
        () =>
          current.state === 'same' && current.active
            ? undefined
            : host
                .run(['systemctl', 'reset-failed', service])
                .then(() => _systemctl(host, say, 'restart', service)),
        () => current
      )
    ))(_say(ctx), unitName(plan.name));

// Параметры сервера из плана — тем же разбором, что и у юнита.
const _planOptions = (plan: ServicePlan) =>
  unitOptions(readUnit(renderUnit(plan, 'en')))!;

const _summary = (
  ctx: Context,
  plan: ServicePlan,
  current: _Current,
  version: string | null,
  token: string | null | undefined
): string =>
  ((say, paint, options) =>
    ((site, setupBase) =>
      [
        `${paint.ok('✓')} ${(current.state === 'same' && current.active ? say.already : say.running)(plan.name)}${version ? `: ${version}` : ''}`,
        _row(paint, say.site, paint.path(site)),
        _row(paint, say.manager, paint.path(`${site}manager`)),
        _row(paint, say.db, paint.path(serviceDatabase(plan.name))),
        ...(token
          ? [
              _row(
                paint,
                say.admin,
                paint.path(`${setupBase}manager/setup?token=${token}`)
              ),
            ]
          : []),
        ...(plan.mode.kind === 'domain'
          ? [`  ${paint.warn('▸')} ${say.certificate(setupBase)}`]
          : [
              `  ${paint.warn('▸')} ${say.proxyNext(localUrl(options).replace(/^http:\/\/|\/$/g, ''))}`,
            ]),
        ...(token === undefined ? [`  ${paint.dim(say.setupInJournal)}`] : []),
        `  ${paint.dim(say.next)}`,
      ].join('\n'))(
      siteUrl(options),
      // Ссылка настройки — по HTTP: она открывается сразу, а с сертификатом HTTP сам ведёт на HTTPS.
      plan.mode.kind === 'domain'
        ? `http://${plan.mode.domains[0]}${plan.mode.port === 80 ? '' : `:${plan.mode.port}`}/`
        : localUrl(options)
    ))(_say(ctx), ctx.paint, _planOptions(plan));

const _installed = (
  ctx: Context,
  host: Host,
  plan: ServicePlan
): Promise<void> =>
  ((unit, say) =>
    Promise.resolve().then(
      pipe(
        () =>
          _first([
            ..._systemdChecks(host, say),
            [!host.standalone, () => say.fromSource],
            [
              /^\/(home|root|tmp|var\/tmp|run\/user)\//.test(host.binary),
              () => say.hiddenBinary(host.binary),
            ],
            [
              ((host.mode(host.binary) ?? 0) & 0o005) !== 0o005,
              () => say.privateBinary(host.binary),
            ],
            [
              !host.root,
              () =>
                say.needRoot(installCommand(plan, ctx.options.force === true)),
            ],
          ]),
        () => _current(ctx, host, plan, unit),
        (current) => _checked(ctx, host, plan, current),
        (current) => _moved(ctx, host, plan).then(() => current),
        (current) => _applied(ctx, host, plan, unit, current),
        (current) =>
          _up(ctx, host, plan.name, localUrl(_planOptions(plan))).then(() =>
            Promise.all([
              _running(host, plan.name),
              _setupToken(host, plan.name),
            ]).then(({ 0: version, 1: token }) =>
              ctx.out(
                named(PROGRAM)(_summary(ctx, plan, current, version, token))
              )
            )
          )
      )
    ))(renderUnit(plan, ctx.language), _say(ctx));

// Запущенный из исходников показывает юнит с путём, куда бинарник ставит install.sh.
const _install = (ctx: Context, host: Host): Promise<void> =>
  Promise.resolve(ctx.options)
    .then((options) =>
      planService(options, host.standalone ? host.binary : INSTALLED_BINARY)
    )
    .then((plan) =>
      ctx.options.print
        ? ctx.out(renderUnit(plan, ctx.language).trimEnd())
        : _installed(ctx, host, plan)
    );

// --- status, logs, restart, uninstall ---------------------------------------------

const _STATUS: Readonly<Record<string, (paint: Paint) => string>> = {
  active: (paint) => paint.ok('●'),
  failed: (paint) => paint.error('●'),
  activating: (paint) => paint.warn('●'),
  _: (paint) => paint.dim('●'),
};

const _unitOf = (host: Host, path: string | undefined): UnitFacts =>
  readUnit((path ? host.read(path) : null) ?? '');

const _versions = (
  host: Host,
  props: Readonly<Record<string, string>>,
  unit: UnitFacts
): Promise<{ running: string | null; file: string | null }> =>
  Promise.all([
    host.root && (props.MainPID ?? '0') !== '0'
      ? _versionOf(host, `/proc/${props.MainPID}/exe`)
      : null,
    unit.binary ? _versionOf(host, unit.binary) : null,
  ]).then(({ 0: running, 1: file }) => ({ running, file }));

const _memory = (raw: string | undefined, say: _Say): string | null =>
  raw && /^\d+$/.test(raw) && Number(raw) < 2 ** 60
    ? _mb(Number(raw), say)
    : null;

const _name = (ctx: Context): string => ctx.options.name ?? 'cms';

const _loaded = (
  ctx: Context,
  host: Host,
  name: string,
  properties: readonly string[]
): Promise<Readonly<Record<string, string>>> =>
  _show(host, name, ['LoadState', 'FragmentPath', ...properties]).then(
    (props) =>
      props.LoadState === 'loaded' ? props : _reject(_say(ctx).noService(name))
  );

const _status = (ctx: Context, host: Host): Promise<void> =>
  ((say, paint, name) =>
    _first(_systemdChecks(host, say))
      .then(() =>
        _loaded(ctx, host, name, [
          'ActiveState',
          'SubState',
          'ActiveEnterTimestamp',
          'MainPID',
          'MemoryCurrent',
          'NRestarts',
        ])
      )
      .then((props) =>
        ((unit) =>
          _versions(host, props, unit).then((versions) =>
            ((options, memory) => (
              ctx.out(
                named(PROGRAM)(
                  [
                    `${(_STATUS[props.ActiveState ?? ''] ?? _STATUS._!)(paint)} ${paint.bold(name)}  ${props.ActiveState} (${props.SubState})`,
                    ...(props.ActiveEnterTimestamp
                      ? [_row(paint, say.since, props.ActiveEnterTimestamp)]
                      : []),
                    ...((versions.running ?? versions.file)
                      ? [
                          _row(
                            paint,
                            say.version,
                            `${versions.running ?? versions.file}${
                              versions.running &&
                              versions.file &&
                              versions.running !== versions.file
                                ? paint.warn(
                                    ` · ${say.fileVersion(versions.file)}`
                                  )
                                : ''
                            }`
                          ),
                        ]
                      : []),
                    ...(options
                      ? [
                          _row(paint, say.site, paint.path(siteUrl(options))),
                          _row(paint, say.db, paint.path(options.db)),
                        ]
                      : []),
                    ...(memory ? [_row(paint, say.memory, memory)] : []),
                    ...(Number(props.NRestarts ?? 0) > 0
                      ? [
                          _row(
                            paint,
                            say.restarts,
                            say.afterFailure(Number(props.NRestarts))
                          ),
                        ]
                      : []),
                  ].join('\n')
                )
              ),
              props.ActiveState === 'active'
                ? undefined
                : _reject(say.notRunning(name, props.ActiveState ?? '?'))
            ))(unitOptions(unit), _memory(props.MemoryCurrent, say))
          ))(_unitOf(host, props.FragmentPath))
      ))(_say(ctx), ctx.paint, _name(ctx));

const _logs = (ctx: Context, host: Host): Promise<void> =>
  _first(_systemdChecks(host, _say(ctx)))
    .then(() =>
      host.attach([
        'journalctl',
        '-u',
        unitName(_name(ctx)),
        ...(ctx.options.follow
          ? ['-f', '-n', '50']
          : ['-n', '200', '--no-pager']),
      ])
    )
    .then((code) => (code === 0 ? undefined : _reject(_say(ctx).noLogs)));

const _restart = (ctx: Context, host: Host): Promise<void> =>
  ((say, name) =>
    _first(_rootChecks(host, say, _sudo(host, 'restart', name)))
      .then(() => _loaded(ctx, host, name, []))
      .then(
        pipe(
          (props: Readonly<Record<string, string>>) =>
            unitOptions(_unitOf(host, props.FragmentPath)),
          (options) =>
            host
              .run(['systemctl', 'reset-failed', unitName(name)])
              .then(() => _systemctl(host, say, 'restart', unitName(name)))
              .then(() =>
                options ? _up(ctx, host, name, localUrl(options)) : undefined
              ),
          () => _running(host, name),
          (version) =>
            ctx.out(
              `${ctx.paint.ok('✓')} ${say.restarted(name)}${version ? `: ${version}` : ''}`
            )
        )
      ))(_say(ctx), _name(ctx));

// Свой юнит — тот, что запускает этот бинарник или написан cms service install (ссылка на ADR в Documentation).
const _ours = (host: Host, unit: UnitFacts): boolean =>
  (unit.binary !== null && host.real(unit.binary) === host.binary) ||
  unit.documentation.includes(REPOSITORY);

const _uninstall = (ctx: Context, host: Host): Promise<void> =>
  ((say, paint, name) =>
    _first(_rootChecks(host, say, _sudo(host, 'uninstall', name))).then(() =>
      ((text) =>
        text === null
          ? ctx.out(named(PROGRAM)(say.nothing(name)))
          : ((unit) =>
              _ours(host, unit)
                ? Promise.resolve().then(
                    pipe(
                      () =>
                        _systemctl(
                          host,
                          say,
                          'disable',
                          '--now',
                          unitName(name)
                        ),
                      () => host.remove(unitFile(name)),
                      () => _systemctl(host, say, 'daemon-reload'),
                      () =>
                        host.run(['systemctl', 'reset-failed', unitName(name)]),
                      () =>
                        ((options) =>
                          ((data, cache) =>
                            ctx.out(
                              named(PROGRAM)(
                                [
                                  `${paint.ok('✓')} ${say.removed(name)}`,
                                  _row(paint, say.kept, paint.path(data)),
                                  ...(cache
                                    ? [
                                        _row(
                                          paint,
                                          say.cache,
                                          paint.path(cache)
                                        ),
                                      ]
                                    : []),
                                  `  ${paint.dim(say.again(`sudo cms service install …${_nameFlag(name)}`))}`,
                                  `  ${paint.dim(say.purge([data, ...(cache ? [cache] : [])].join(' ')))}`,
                                ].join('\n')
                              )
                            ))(
                            host.real(
                              dirname(options?.db ?? serviceDatabase(name))
                            ),
                            options?.mediaCache
                              ? host.real(options.mediaCache)
                              : null
                          ))(unitOptions(unit))
                    )
                  )
                : _reject(say.foreignUnit(unitFile(name))))(readUnit(text)))(
        host.read(unitFile(name))
      )
    ))(_say(ctx), ctx.paint, _name(ctx));

const _SERVICE: Readonly<
  Record<string, (ctx: Context, host: Host) => Promise<void>>
> = {
  install: _install,
  status: _status,
  logs: _logs,
  restart: _restart,
  uninstall: _uninstall,
};

/** `cms service <подкоманда>`: без подкоманды — status. */
export var runService = (
  ctx: Context,
  host: Host = defineHost()
): Promise<void> =>
  (
    _SERVICE[ctx.args[0] ?? 'status'] ??
    (() => _reject(_say(ctx).noSubcommand(ctx.args[0])))
  )(ctx, host);

// --- после cms update -------------------------------------------------------------

/** Служба, которая не поднялась на нужной версии: молчит (null) или работает на другой. */
export type ServiceFailure = {
  readonly name: string;
  readonly running: string | null;
};

/** База службы, возвращённая к снимку перед обновлением: новая версия успела перевести её на свою схему. */
export type DatabaseBack = {
  readonly name: string;
  readonly snapshot: string;
  /** Куда отложена база, на которой новая версия не поднялась, со своим WAL. */
  readonly aside: string;
  /** Окно, записи которого в возвращённую базу не вошли: от снимка до возврата, мс. */
  readonly from: number;
  readonly to: number;
  /** Вернуть не вышло — почему. */
  readonly error: string | null;
};

/** Что стало со службами после замены бинарника. */
export type ServiceRestart =
  | { readonly status: 'none' }
  | {
      /** Снимок базы не снялся: службы не тронуты, прежний бинарник снова на месте. */
      readonly status: 'unsafe';
      readonly name: string;
      readonly error: string;
    }
  | {
      readonly status: 'restarted';
      readonly services: readonly string[];
      /** Снимки баз перед обновлением, в порядке служб. */
      readonly snapshots: readonly string[];
    }
  | {
      /** Новая версия не поднялась; прежняя вернулась и работает или тоже молчит. */
      readonly status: 'rolled_back' | 'broken';
      readonly services: readonly string[];
      readonly failed: readonly ServiceFailure[];
      readonly restored: readonly DatabaseBack[];
    };

type _Service = {
  readonly name: string;
  readonly url: string;
  readonly db: string;
};

type _Guarded = _Service & {
  readonly snapshot: string;
  /** Миграции снимка: с ними откат сравнит базу. */
  readonly migrations: readonly string[];
  readonly at: number;
};

type _Update = {
  readonly host: Host;
  readonly binary: string;
  readonly previous: string;
  /** Новая версия — на ней службы должны ответить. */
  readonly version: string;
  /** Прежняя — для отката. */
  readonly current: string;
};

// Службы этого бинарника: юниты в /etc/systemd/system, чей ExecStart запускает его.
const _candidates = (host: Host, binary: string): _Service[] =>
  host
    .list('/etc/systemd/system')
    .filter((_) => _.endsWith('.service'))
    .flatMap((path) =>
      ((unit) =>
        ((options) =>
          unit.binary !== null &&
          host.real(unit.binary) === binary &&
          options !== null
            ? [
                {
                  name: basename(path, '.service'),
                  url: localUrl(options),
                  db: options.db,
                },
              ]
            : [])(unitOptions(unit)))(readUnit(host.read(path) ?? ''))
    );

const _message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Снимок — рядом с базой, путь без ссылок: /var/lib/<имя> у DynamicUser ведёт в /var/lib/private/<имя>.
const _guarded = (host: Host, service: _Service, current: string): _Guarded =>
  ((db) =>
    ((snapshot) => (
      host.snapshot(db, snapshot),
      {
        ...service,
        db,
        snapshot,
        migrations:
          host.migrations(snapshot) ??
          fail('service.snapshot_unreadable', `${snapshot} cannot be read`),
        at: host.now(),
      }
    ))(`${db}.before-${current}`))(
    isAbsolute(service.db)
      ? host.real(service.db)
      : fail(
          'service.database_unknown',
          `The unit ${service.name} does not say where its database is: set CMS_DB`
        )
  );

type _Guard = {
  readonly guarded: readonly _Guarded[];
  readonly failure: { readonly name: string; readonly error: string } | null;
};

// Снимки всех баз — до первого перезапуска: не снялся хоть один — не перезапускается ни одна служба.
const _guard = (
  host: Host,
  services: readonly _Service[],
  current: string
): _Guard =>
  services.reduce<_Guard>(
    (done, service) =>
      done.failure
        ? done
        : attempt<_Guard>(
            () => ({
              guarded: [...done.guarded, _guarded(host, service, current)],
              failure: null,
            }),
            (error) => ({
              ...done,
              failure: { name: service.name, error: _message(error) },
            })
          ),
    { guarded: [], failure: null }
  );

const _restartOne = (
  host: Host,
  service: _Service,
  expected: string
): Promise<ServiceFailure | null> =>
  host
    .run(['systemctl', 'reset-failed', unitName(service.name)])
    .then(() => host.run(['systemctl', 'restart', unitName(service.name)]))
    .then((restart) =>
      restart.code === 0 ? _healthy(host, service.url) : false
    )
    .then((ok) =>
      ok
        ? _running(host, service.name).then((running) =>
            running === `${PRODUCT} ${expected}`
              ? null
              : { name: service.name, running: running ?? '?' }
          )
        : { name: service.name, running: null }
    );

const _restartAll = (
  host: Host,
  services: readonly _Service[],
  expected: string
): Promise<ServiceFailure[]> =>
  Promise.all(services.map((_) => _restartOne(host, _, expected))).then(
    (results) => results.flatMap((_) => (_ ? [_] : []))
  );

// Новая версия перевела базу на свою схему: в ней миграции, которых нет в снимке. Не прочесть — тоже:
// прежней версии такая база не годится.
const _grew = (host: Host, service: _Guarded): boolean =>
  ((applied) =>
    applied === null || applied.some((id) => !service.migrations.includes(id)))(
    host.migrations(service.db)
  );

const _putBack = (
  host: Host,
  service: _Guarded,
  version: string
): DatabaseBack =>
  ((back: DatabaseBack) =>
    attempt<DatabaseBack>(
      () => (host.putBack(service.snapshot, service.db, back.aside), back),
      (error) => ({ ...back, error: _message(error) })
    ))({
    name: service.name,
    snapshot: service.snapshot,
    aside: `${service.db}.failed-${version}`,
    from: service.at,
    to: host.now(),
    error: null,
  });

// Откат: все службы стоят; базы, которые новая версия успела перевести на свою схему, — снова снимки;
// прежний бинарник — на место; службы запускаются на нём. Нетронутую базу откат не трогает.
const _rollBack = (
  update: _Update,
  services: readonly _Guarded[]
): Promise<{ again: ServiceFailure[]; restored: DatabaseBack[] }> =>
  Promise.all(
    services.map((_) =>
      update.host.run(['systemctl', 'stop', unitName(_.name)])
    )
  ).then(
    pipe(
      () =>
        services
          .filter((_) => _grew(update.host, _))
          .map((_) => _putBack(update.host, _, update.version)),
      (restored) => (
        update.host.restore(update.binary, update.previous), restored
      ),
      (restored) =>
        _restartAll(update.host, services, update.current).then((again) => ({
          again,
          restored,
        }))
    )
  );

const _guardedRestart = (
  update: _Update,
  services: readonly _Service[]
): ServiceRestart | Promise<ServiceRestart> =>
  ((guard, names) =>
    guard.failure
      ? (update.host.restore(update.binary, update.previous),
        { status: 'unsafe', ...guard.failure })
      : _restartAll(update.host, guard.guarded, update.version).then(
          (failed): ServiceRestart | Promise<ServiceRestart> =>
            failed.length === 0
              ? {
                  status: 'restarted',
                  services: names,
                  snapshots: guard.guarded.map((_) => _.snapshot),
                }
              : _rollBack(update, guard.guarded).then(
                  ({ again, restored }): ServiceRestart => ({
                    status: again.length === 0 ? 'rolled_back' : 'broken',
                    services: names,
                    failed,
                    restored,
                  })
                )
        ))(
    _guard(update.host, services, update.current),
    services.map((_) => _.name)
  );

/**
 * После замены бинарника `cms update` под root перезапускает его работающие службы. Перед этим — снимок базы
 * каждой рядом с ней; не снялся — служб не трогает и возвращает прежний бинарник. Службы должны ответить на
 * новой версии; не вышло — откат: базы, которые новая версия успела перевести на свою схему, снова снимки,
 * прежний бинарник (`cms.old`) на месте, службы перезапускаются на нём.
 */
export var restartServices = (update: _Update): Promise<ServiceRestart> =>
  update.host.root && update.host.platform === 'linux' && update.host.systemd()
    ? Promise.all(
        _candidates(update.host, update.binary).map((service) =>
          _isActive(update.host, service.name).then((active) =>
            active ? [service] : []
          )
        )
      )
        .then((_) => _.flat())
        .then((services) =>
          services.length === 0
            ? { status: 'none' as const }
            : _guardedRestart(update, services)
        )
    : Promise.resolve({ status: 'none' });

const _clock = (ms: number): string => new Date(ms).toTimeString().slice(0, 8);

type _Report = {
  readonly lines: readonly string[];
  readonly error: string | null;
};

type _Versions = { readonly version: string; readonly current: string };

const _failedLines = (
  say: _Say,
  paint: Paint,
  restart: Extract<ServiceRestart, { status: 'rolled_back' | 'broken' }>
): string[] => [
  ...restart.failed.map(
    (_) =>
      `    ${paint.dim(_.running === null ? say.silentAfter(_.name, HEALTH_SECONDS) : say.wrongVersion(_.name, _.running))}`
  ),
  ...restart.restored.map((_) =>
    _.error === null
      ? `    ${paint.warn(say.dbRestored(_.name, _clock(_.from), _clock(_.to), _.aside))}`
      : `    ${paint.error(say.dbNotRestored(_.name, _.error, _.snapshot))}`
  ),
];

const _rolledBack = (
  say: _Say,
  paint: Paint,
  restart: Extract<ServiceRestart, { status: 'rolled_back' | 'broken' }>,
  versions: _Versions
): _Report => ({
  lines: [
    `  ${paint.error('✗')} ${restart.status === 'rolled_back' ? say.rolledBack(versions.version, versions.current) : say.broken(versions.current)}`,
    ..._failedLines(say, paint, restart),
  ],
  error: say.updateFailed(
    restart.failed[0] ? _nameFlag(restart.failed[0].name) : ''
  ),
});

const _REPORT: {
  readonly [K in ServiceRestart['status']]: (
    say: _Say,
    paint: Paint,
    restart: Extract<ServiceRestart, { status: K }>,
    versions: _Versions
  ) => _Report;
} = {
  none: (say, paint) => ({
    lines: [`  ${paint.warn('▸')} ${say.restartServer}`],
    error: null,
  }),
  unsafe: (say, paint, restart, versions) => ({
    lines: [
      `  ${paint.error('✗')} ${say.snapshotFailed(restart.name, restart.error)}`,
      `    ${paint.dim(say.untouched(versions.current))}`,
    ],
    error: say.notUpdated,
  }),
  restarted: (say, paint, restart, versions) => ({
    lines: restart.services.flatMap((name, index) => [
      `  ${paint.ok('✓')} ${say.serviceUpdated(name, versions.version)}`,
      `    ${paint.dim(say.snapshotKept(restart.snapshots[index] ?? ''))}`,
    ]),
    error: null,
  }),
  rolled_back: _rolledBack,
  broken: _rolledBack,
};

/** Строки итога `cms update` о службах; error — обновление отменено, код выхода 1. */
export var restartReport = (
  paint: Paint,
  language: Language,
  restart: ServiceRestart,
  versions: _Versions
): _Report =>
  ((report) => ({
    lines: report.lines.map(named(PROGRAM)),
    error: report.error === null ? null : named(PROGRAM)(report.error),
  }))(
    (
      _REPORT[restart.status] as (
        say: _Say,
        paint: Paint,
        restart: ServiceRestart,
        versions: _Versions
      ) => _Report
    )(_SAY[language], paint, restart, versions)
  );
