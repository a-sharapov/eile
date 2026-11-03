import { parseDomains } from '../contexts/certificates/index.ts';
import { PRODUCT, REPOSITORY } from '../product.ts';
import { fail } from '../shared/kernel/errors.ts';
import { type Options, parseInvocation } from './args.ts';
import { httpsUrl } from './https.ts';
import type { Language } from './language.ts';

// Служба systemd без эффектов: план установки из параметров, текст юнита, разбор чужого юнита и оценка
// машины по собранным фактам. Эффекты — в service.ts (ADR 0042).

/** Как служба встречает посетителей: сама держит HTTPS или стоит за своим прокси. */
export type ServiceMode =
  | {
      readonly kind: 'domain';
      readonly domains: readonly string[];
      readonly email: string | null;
      readonly staging: boolean;
      readonly port: number;
      readonly httpsPort: number;
    }
  | { readonly kind: 'proxy'; readonly host: string; readonly port: number };

/** Что ставить: имя службы, бинарник, режим и сайт для переноса. */
export type ServicePlan = {
  readonly name: string;
  readonly binary: string;
  readonly mode: ServiceMode;
  /** База, из которой сайт переезжает в службу; null — служба начнёт со своей. */
  readonly from: string | null;
};

/** Куда install.sh под root кладёт бинарник: его путь показывает `--print`, запущенный из исходников. */
export var INSTALLED_BINARY = '/usr/local/bin/cms';

/** Документация юнита — по ней `uninstall` узнаёт свой юнит, даже если бинарник переехал. */
export var SERVICE_DOCS = `https://github.com/${REPOSITORY}/blob/main/docs/adr/0042-service-install.md`;

export var unitName = (name: string): string => `${name}.service`;

export var unitFile = (name: string): string =>
  `/etc/systemd/system/${unitName(name)}`;

/** База службы: StateDirectory, у DynamicUser — ссылка на /var/lib/private/<имя>. */
export var serviceDatabase = (name: string): string =>
  `/var/lib/${name}/site.db`;

export var serviceCache = (name: string): string => `/var/cache/${name}`;

// --- план ---------------------------------------------------------------------

const _NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const _EMAIL = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const _HOST = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F]*:[0-9a-fA-F:.]*)$/;
// Путь идёт в ExecStart как есть: без пробелов, кавычек и `%` — у systemd это спецификатор.
const _PATH = /^\/[\w./@+-]+$/;

const _port = (raw: string): number =>
  /^\d{1,5}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 65535
    ? Number(raw)
    : fail('service.invalid_port', `Not a TCP port: ${raw}`);

const _email = (raw: string): string =>
  _EMAIL.test(raw)
    ? raw
    : fail('service.invalid_email', `Not an email address: ${raw}`);

const _host = (raw: string): string =>
  _HOST.test(raw)
    ? raw
    : fail('service.invalid_host', `Not an IP address: ${raw}`);

const _domainMode = (options: Options): ServiceMode =>
  options.host === undefined
    ? {
        kind: 'domain',
        domains: parseDomains(options.domain ?? ''),
        email: options.email === undefined ? null : _email(options.email),
        staging: options.acmeStaging === true,
        port: _port(options.port),
        httpsPort: _port(options.httpsPort ?? '443'),
      }
    : fail('service.proxy_only', '--host goes with --trust-proxy');

const _proxyMode = (options: Options): ServiceMode =>
  options.email === undefined &&
  options.httpsPort === undefined &&
  options.acmeStaging !== true
    ? {
        kind: 'proxy',
        host: _host(options.host ?? '127.0.0.1'),
        port: _port(options.port),
      }
    : fail(
        'service.domain_only',
        '--email, --https-port and --acme-staging go with --domain'
      );

// Режим по флагам: d — --domain, p — --trust-proxy.
const _MODES: Readonly<Record<string, (options: Options) => ServiceMode>> = {
  d: _domainMode,
  p: _proxyMode,
  dp: () =>
    fail('service.both_modes', '--domain and --trust-proxy exclude each other'),
  '': () =>
    fail('service.no_mode', 'Choose --domain <domains> or --trust-proxy'),
};

const _modeOf = (options: Options): string =>
  `${options.domain ? 'd' : ''}${options.trustProxy ? 'p' : ''}`;

/** План установки из параметров `cms service install`; нарушенное правило — отказ `service.*`. */
export var planService = (options: Options, binary: string): ServicePlan => ({
  name: _NAME.test(options.name ?? 'cms')
    ? (options.name ?? 'cms')
    : fail('service.invalid_name', `Not a service name: ${options.name}`),
  binary: _PATH.test(binary)
    ? binary
    : fail('service.invalid_binary', `The path does not fit a unit: ${binary}`),
  mode: _MODES[_modeOf(options)]!(options),
  from: options.from ?? null,
});

/** Порты, которые служба займёт. */
export var listeningPorts = (mode: ServiceMode): number[] =>
  mode.kind === 'domain' ? [mode.port, mode.httpsPort] : [mode.port];

export var domainsOf = (mode: ServiceMode): readonly string[] =>
  mode.kind === 'domain' ? mode.domains : [];

// --- юнит ---------------------------------------------------------------------

const _ARGS: {
  readonly [K in ServiceMode['kind']]: (
    mode: Extract<ServiceMode, { kind: K }>
  ) => string[];
} = {
  domain: (mode) => [
    '--domain',
    mode.domains.join(','),
    ...(mode.email ? ['--email', mode.email] : []),
    ...(mode.port === 80 ? [] : ['--port', String(mode.port)]),
    ...(mode.httpsPort === 443 ? [] : ['--https-port', String(mode.httpsPort)]),
    ...(mode.staging ? ['--acme-staging'] : []),
  ],
  proxy: (mode) => [
    '--trust-proxy',
    '--host',
    mode.host,
    '--port',
    String(mode.port),
  ],
};

/** Параметры сервера в ExecStart: режим и порты; база и кэш — в Environment. */
export var serveArgs = (mode: ServiceMode): string[] => [
  'serve',
  ...(_ARGS[mode.kind] as (mode: ServiceMode) => string[])(mode),
];

// Песочница не мешает сайту: пишет он только в StateDirectory (база, её WAL, копии рядом с базой;
// сертификаты HTTPS — в самой базе) и CacheDirectory (кэш медиатеки), временные файлы — в свой /tmp.
// MemoryDenyWriteExecute нет: JIT JavaScriptCore пишет исполняемый код. Запрещённый вызов — EPERM, а не
// SIGSYS: необязательные возможности рантайма (pkeys) так просто выключаются.
const _SANDBOX = [
  'NoNewPrivileges=yes',
  'ProtectSystem=strict',
  'ProtectHome=yes',
  'PrivateTmp=yes',
  'PrivateDevices=yes',
  'ProtectProc=invisible',
  'ProtectKernelTunables=yes',
  'ProtectKernelModules=yes',
  'ProtectKernelLogs=yes',
  'ProtectControlGroups=yes',
  'ProtectClock=yes',
  'ProtectHostname=yes',
  'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK',
  'RestrictNamespaces=yes',
  'RestrictRealtime=yes',
  'RestrictSUIDSGID=yes',
  'LockPersonality=yes',
  'RemoveIPC=yes',
  'SystemCallArchitectures=native',
  'SystemCallFilter=@system-service',
  'SystemCallErrorNumber=EPERM',
];

// Комментарии юнита — на языке CLI; сравнение юнитов их не видит (`sameUnit`).
const _COMMENTS = {
  ru: {
    head: (name: string) => [
      `# ${PRODUCT}: сайт как служба systemd «${name}».`,
      '# Написан командой cms service install; тот же текст — cms service install … --print.',
    ],
    limit:
      '# Без лимита попыток: после любого сбоя служба поднимается через секунду.',
    user: (name: string) =>
      `# Свой временный пользователь. Пишет он только в /var/lib/${name} и /var/cache/${name}.`,
    ports: '# Порты ниже 1024 без root — и никаких других прав.',
    noPorts: '# Порт от 1024: особые права не нужны.',
    loopback:
      '# Слушает только этот адрес: посетители приходят через прокси, X-Forwarded-* мимо него не подделать.',
    sandbox:
      '# Песочница. MemoryDenyWriteExecute нет: JIT JavaScriptCore пишет исполняемый код.',
  },
  en: {
    head: (name: string) => [
      `# ${PRODUCT}: the site as the systemd service "${name}".`,
      '# Written by cms service install; the same text: cms service install … --print.',
    ],
    limit:
      '# No limit on attempts: after any failure the service is back in a second.',
    user: (name: string) =>
      `# A temporary user of its own. It writes only to /var/lib/${name} and /var/cache/${name}.`,
    ports: '# Ports below 1024 without root, and no other privileges.',
    noPorts: '# A port from 1024 up: no privileges needed.',
    loopback:
      '# Listens on this address only: visitors come through the proxy, X-Forwarded-* cannot be forged around it.',
    sandbox:
      '# Sandbox. No MemoryDenyWriteExecute: the JavaScriptCore JIT writes executable code.',
  },
} satisfies Record<Language, unknown>;

const _privileged = (mode: ServiceMode): boolean =>
  listeningPorts(mode).some((_) => _ < 1024);

/** Текст юнита systemd: DynamicUser, каталоги состояния и кэша, перезапуск, права на порты, песочница. */
export var renderUnit = (plan: ServicePlan, language: Language): string =>
  ((say, name) =>
    [
      ...say.head(name),
      '[Unit]',
      `Description=${PRODUCT} CMS (${name})`,
      `Documentation=${SERVICE_DOCS}`,
      'Wants=network-online.target',
      'After=network-online.target',
      say.limit,
      'StartLimitIntervalSec=0',
      '',
      '[Service]',
      'Type=exec',
      ...(plan.mode.kind === 'proxy' ? [say.loopback] : []),
      `ExecStart=${plan.binary} ${serveArgs(plan.mode).join(' ')}`,
      `Environment=CMS_DB=${serviceDatabase(name)}`,
      `Environment=CMS_MEDIA_CACHE=${serviceCache(name)}`,
      'Restart=always',
      'RestartSec=1',
      '',
      say.user(name),
      'DynamicUser=yes',
      `StateDirectory=${name}`,
      'StateDirectoryMode=0700',
      `CacheDirectory=${name}`,
      'CacheDirectoryMode=0700',
      'UMask=0077',
      '',
      ...(_privileged(plan.mode)
        ? [
            say.ports,
            'AmbientCapabilities=CAP_NET_BIND_SERVICE',
            'CapabilityBoundingSet=CAP_NET_BIND_SERVICE',
          ]
        : [say.noPorts, 'CapabilityBoundingSet=']),
      '',
      say.sandbox,
      ..._SANDBOX,
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      '',
    ].join('\n'))(_COMMENTS[language], plan.name);

const _essence = (text: string): string =>
  text
    .split('\n')
    .map((_) => _.trim())
    .filter((_) => _ !== '' && !_.startsWith('#') && !_.startsWith(';'))
    .join('\n');

/** Один и тот же юнит: без комментариев и пустых строк — их язык и правки руками не в счёт. */
export var sameUnit = (a: string, b: string): boolean =>
  _essence(a) === _essence(b);

// Аргумент командной строки — как есть, если в нём нет того, что оболочка поймёт иначе.
const _quote = (word: string): string =>
  /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;

/** Та же установка от root: строка, которую человеку остаётся скопировать. */
export var installCommand = (plan: ServicePlan, force: boolean): string =>
  [
    'sudo',
    plan.binary,
    'service',
    'install',
    ...(plan.mode.kind === 'domain'
      ? _ARGS.domain(plan.mode)
      : [
          '--trust-proxy',
          ...(plan.mode.host === '127.0.0.1' ? [] : ['--host', plan.mode.host]),
          ...(plan.mode.port === 8080
            ? []
            : ['--port', String(plan.mode.port)]),
        ]),
    ...(plan.from ? ['--from', plan.from] : []),
    ...(plan.name === 'cms' ? [] : ['--name', plan.name]),
    ...(force ? ['--force'] : []),
  ]
    .map(_quote)
    .join(' ');

// --- разбор юнита ---------------------------------------------------------------

/** Что юнит запускает: бинарник, аргументы ExecStart и Environment. */
export type UnitFacts = {
  readonly binary: string | null;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly documentation: string;
};

const _WORDS = /"([^"]*)"|'([^']*)'|(\S+)/g;

const _words = (line: string): string[] =>
  [...line.matchAll(_WORDS)].map((_) => _[1] ?? _[2] ?? _[3] ?? '');

const _values = (text: string, key: string): string[] =>
  text
    .split('\n')
    .map((_) => _.trim())
    .filter((_) => _.startsWith(`${key}=`))
    .map((_) => _.slice(key.length + 1));

/** Разбор юнита: последний ExecStart (у systemd пустой сбрасывает прежние), все Environment. */
export var readUnit = (text: string): UnitFacts =>
  ((exec) => ({
    // Приставки ExecStart (`-`, `+`, `!`, `@`, `:`) — не часть пути.
    binary: exec[0]?.replace(/^[-@:+!]+/, '') ?? null,
    args: exec.slice(1),
    env: Object.fromEntries(
      _values(text, 'Environment')
        .flatMap(_words)
        .filter((_) => _.includes('='))
        .map((_) => [_.slice(0, _.indexOf('=')), _.slice(_.indexOf('=') + 1)])
    ),
    documentation: _values(text, 'Documentation').join(' '),
  }))(_words(_values(text, 'ExecStart').at(-1) ?? ''));

/** Параметры сервера в юните — так, как их разберёт сам cms при запуске; null — не разобрать. */
export var unitOptions = (unit: UnitFacts): Options | null =>
  ((invocation) => ('options' in invocation ? invocation.options : null))(
    parseInvocation(unit.args, unit.env)
  );

const _ANY = new Set(['0.0.0.0', '::']);

/** Куда стучаться с этой же машины: адрес, на котором служба слушает HTTP. */
export var localUrl = (options: Options): string =>
  ((host) =>
    `http://${host.includes(':') ? `[${host}]` : host}:${options.port}/`)(
    options.host === undefined || _ANY.has(options.host)
      ? '127.0.0.1'
      : options.host
  );

/** Адрес сайта для людей: с доменом — HTTPS на нём, за прокси — адрес на этой машине. */
export var siteUrl = (options: Options): string =>
  options.domain
    ? httpsUrl(parseDomains(options.domain), Number(options.httpsPort ?? '443'))
    : localUrl(options);

/** Вывод `systemctl show`: строки `Ключ=значение`. */
export var parseShow = (text: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    text
      .split('\n')
      .filter((_) => _.includes('='))
      .map((_) => [_.slice(0, _.indexOf('=')), _.slice(_.indexOf('=') + 1)])
  );

// --- оценка машины ---------------------------------------------------------------

/** Что известно о машине перед установкой. */
export type HostFacts = {
  /** Байты: память и подкачка из /proc/meminfo. */
  readonly memory: { readonly total: number; readonly swap: number };
  /** Адреса сетевых интерфейсов этой машины. */
  readonly local: readonly string[];
  /** Кто держит порт: null — свободен, '' — занят, но кем — неизвестно. */
  readonly ports: readonly {
    readonly port: number;
    readonly holder: string | null;
  }[];
  /** Адреса доменов в DNS; пусто — имя не находится. */
  readonly domains: readonly {
    readonly domain: string;
    readonly addresses: readonly string[];
  }[];
};

/** Что не так с машиной: занятый порт останавливает установку, остальное — предупреждение. */
export type Concern =
  | {
      readonly kind: 'port_busy';
      readonly port: number;
      readonly holder: string;
      /** Порт держит веб-сервер — сайт можно поставить за ним. */
      readonly proxy: boolean;
    }
  | { readonly kind: 'dns_missing'; readonly domain: string }
  | {
      readonly kind: 'dns_elsewhere';
      readonly domain: string;
      readonly addresses: readonly string[];
    }
  | { readonly kind: 'low_memory'; readonly total: number };

const _BLOCKING: Readonly<Record<Concern['kind'], boolean>> = {
  port_busy: true,
  dns_missing: false,
  dns_elsewhere: false,
  low_memory: false,
};

export var blocking = (concern: Concern): boolean => _BLOCKING[concern.kind];

const _PROXIES = new Set([
  'nginx',
  'caddy',
  'apache2',
  'httpd',
  'haproxy',
  'traefik',
  'lighttpd',
  'envoy',
]);

/**
 * Меньше 1 ГиБ без подкачки — предупреждение: на дроплете в 512 МБ сайту остаётся около 330 МБ, и без
 * подкачки OOM убивал его на загрузке файла в 21 МБ под нагрузкой; с подкачкой в 1 ГиБ он выжил.
 */
export var LOW_MEMORY = 1024 ** 3;

// Петля и link-local снаружи не видны: домен, указывающий на них, сертификата не получит.
const _public = (address: string): boolean =>
  !/^(127\.|::1$|fe80:|169\.254\.)/i.test(address);

const _bare = (address: string): string =>
  address.replace(/^::ffff:/i, '').replace(/%.*$/, '');

const _dns = (
  local: ReadonlySet<string>,
  domain: string,
  addresses: readonly string[]
): Concern[] =>
  addresses.length === 0
    ? [{ kind: 'dns_missing', domain }]
    : addresses.some((_) => local.has(_bare(_)))
      ? []
      : [{ kind: 'dns_elsewhere', domain, addresses }];

/** Оценка машины перед установкой: порты, DNS доменов, память. */
export var assess = (facts: HostFacts): Concern[] =>
  ((local) => [
    ...facts.ports.flatMap(({ port, holder }): Concern[] =>
      holder === null
        ? []
        : [{ kind: 'port_busy', port, holder, proxy: _PROXIES.has(holder) }]
    ),
    ...facts.domains.flatMap((_) => _dns(local, _.domain, _.addresses)),
    ...(facts.memory.total < LOW_MEMORY && facts.memory.swap === 0
      ? [{ kind: 'low_memory', total: facts.memory.total } as const]
      : []),
  ])(new Set(facts.local.map(_bare).filter(_public)));

/** Файл подкачки на 1 ГиБ: команды для человека, сама установка подкачку не создаёт. */
export var SWAP_COMMANDS: readonly string[] = [
  'sudo fallocate -l 1G /swapfile',
  'sudo chmod 600 /swapfile',
  'sudo mkswap /swapfile',
  'sudo swapon /swapfile',
  "echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab",
];

/** /proc/meminfo → байты памяти и подкачки. */
export var parseMeminfo = (text: string): HostFacts['memory'] =>
  ((kb) => ({ total: kb('MemTotal'), swap: kb('SwapTotal') }))(
    (key: string) =>
      Number(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text)?.[1] ?? 0) *
      1024
  );

/** Имя процесса из `ss -ltnp`: `users:(("nginx",pid=1,fd=6))` → nginx; '' — ss его не назвал. */
export var holderOf = (ss: string): string =>
  /users:\(\("([^"]+)"/.exec(ss)?.[1] ?? '';
