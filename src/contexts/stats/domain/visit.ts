/** Заголовок запроса по имени; нет — null. */
export type Header = (name: string) => string | null;

export type Device = 'mobile' | 'tablet' | 'desktop';

/** День в часовом поясе статистики: `2026-11-03`. */
export type Day = string;

/**
 * Посещение за день: откуда и куда человек пришёл первым просмотром дня. Всё, что статистика знает о
 * посетителе, кроме короткого хэша; ни адреса, ни строки браузера тут нет.
 */
export type Visit = {
  /** Страница первого просмотра дня. */
  readonly entry: string;
  /** utm_source, иначе хост чужого сайта, с которого пришли; пусто — прямой заход. */
  readonly source: string;
  readonly referrer: string;
  readonly utmSource: string;
  readonly utmMedium: string;
  readonly utmCampaign: string;
  readonly device: Device;
  /** Первый язык из Accept-Language, без региона: `de`. */
  readonly browserLanguage: string;
};

// Боты, проверки, превью ссылок и HTTP-библиотеки. Браузер их слов в User-Agent не пишет; встроенные
// браузеры приложений (Telegram, Pinterest, Facebook) — люди, их названий тут нет. Cubot — марка телефонов.
const _BOT =
  /(?<!cu)bot\b|crawl|spider|slurp|archiver|facebookexternalhit|meta-externalagent|embedly|preview|vkshare|curl|wget|python|httpx|aiohttp|go-http|java\/|okhttp|libwww|perl|ruby|php\/|node-fetch|axios|undici|\bbun\/|deno|headless|phantom|selenium|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|scanner|validator|feedfetcher|scrapy|ahrefs|semrush|mj12|petalsearch|bytespider|chatgpt|claude|anthropic|perplexity|ccbot|google-|mediapartners|adsbot/i;

/** Бот или программа, а не браузер: у браузера User-Agent начинается с `Mozilla/`. */
export var isBot = (userAgent: string): boolean =>
  !userAgent.startsWith('Mozilla/') || _BOT.test(userAgent);

/** Предзагрузка и пререндер: человек страницу ещё не открыл и может не открыть. */
export var isPrefetch = (header: Header): boolean =>
  /prefetch|prerender/i.test(header('sec-purpose') ?? '') ||
  /prefetch|preview/i.test(header('purpose') ?? '') ||
  /prefetch|preview/i.test(header('x-purpose') ?? '') ||
  /prefetch/i.test(header('x-moz') ?? '');

// Переход браузера: документ, а не fetch из скрипта или фрейм; браузер всегда шлёт Accept-Language.
const _navigation = (header: Header): boolean =>
  (header('sec-fetch-mode') ?? 'navigate') === 'navigate' &&
  (header('sec-fetch-dest') ?? 'document') === 'document' &&
  (header('accept') ?? '').includes('text/html') &&
  (header('accept-language') ?? '') !== '';

/** Запрос страницы, который можно считать просмотром: браузер, переход, не предзагрузка. */
export var countableView = (header: Header): boolean =>
  !isBot(header('user-agent') ?? '') &&
  !isPrefetch(header) &&
  _navigation(header);

/** Запрос маячка цели: браузер, а не бот; режим fetch у маячка свой, переходом он не бывает. */
export var countableBeacon = (header: Header): boolean =>
  !isBot(header('user-agent') ?? '') &&
  !isPrefetch(header) &&
  (header('accept-language') ?? '') !== '';

const _DEVICES: readonly (readonly [RegExp, Device])[] = [
  [/iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i, 'tablet'],
  [/Mobi|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry/i, 'mobile'],
];

/**
 * Класс устройства по User-Agent; `Sec-CH-UA-Mobile: ?1` у Chromium — телефон. iPad с iPadOS 13+
 * называет себя Mac и считается компьютером: без скрипта его не отличить.
 */
export var deviceOf = (userAgent: string, mobileHint: string | null): Device =>
  _DEVICES.find(({ 0: pattern }) => pattern.test(userAgent))?.[1] ??
  (mobileHint === '?1' ? 'mobile' : 'desktop');

const _host = (host: string): string =>
  host.toLowerCase().replace(/^www\./, '');

// android-app://com.google.android.gm/ — переход из приложения: хост — имя пакета.
const _REFERRER_PROTOCOLS = ['http:', 'https:', 'android-app:'];

/** Хост сайта, с которого пришли, без `www.`; свой сайт и мусор — пусто. */
export var referrerHost = (
  referer: string | null,
  own: readonly string[]
): string =>
  ((url) =>
    url && _REFERRER_PROTOCOLS.includes(url.protocol) && url.hostname !== ''
      ? ((host) => (own.map(_host).includes(host) ? '' : host.slice(0, 100)))(
          _host(url.hostname)
        )
      : '')(URL.parse(referer ?? ''));

// Метка — строка посетителя: без управляющих символов, пробелы схлопнуты, до 100 знаков.
const _label = (value: string | null): string =>
  (value ?? '')
    .replace(/\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

/** Метки UTM адреса: source и medium — строчными, их сравнивают с хостами; campaign — как есть. */
export var utmOf = (
  query: URLSearchParams
): {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
} => ({
  source: _label(query.get('utm_source')).toLowerCase(),
  medium: _label(query.get('utm_medium')).toLowerCase(),
  campaign: _label(query.get('utm_campaign')),
});

/** Первый язык браузера без региона: `de-DE,de;q=0.9` → `de`; мусор — пусто. */
export var browserLanguageOf = (acceptLanguage: string | null): string =>
  ((tag) => (/^[a-z]{2,3}$/.test(tag) ? tag : ''))(
    (acceptLanguage ?? '')
      .split(',')[0]!
      .split(';')[0]!
      .split('-')[0]!
      .trim()
      .toLowerCase()
  );

// Восемь групп IPv6 по 16 бит: `2001:db8::1` → [2001, db8, 0, 0, 0, 0, 0, 1].
const _groups = (address: string): readonly string[] =>
  ((halves) =>
    halves.length === 1
      ? halves[0]!.split(':')
      : ((head, tail) => [
          ...head,
          ...Array.from({ length: 8 - head.length - tail.length }, () => '0'),
          ...tail,
        ])(
          halves[0] ? halves[0].split(':') : [],
          halves[1] ? halves[1].split(':') : []
        ))(address.split('::'));

/**
 * Адрес посетителя для хэша: IPv4 как есть (и из `::ffff:1.2.3.4`), у IPv6 — сеть /64. Временные адреса
 * IPv6 меняются у одного устройства в течение дня, а сеть /64 у дома или телефона — та же.
 */
export var networkOf = (address: string): string =>
  ((plain) =>
    plain.includes(':')
      ? _groups(plain.split('%')[0]!)
          .slice(0, 4)
          .map((_) => _.replace(/^0+(?=.)/, ''))
          .join(':')
      : plain)(
    address
      .trim()
      .toLowerCase()
      .replace(/^::ffff:(?=\d)/, '')
  );

// Известные сервисы — под одним именем: google.de, google.com и utm_source=google — это Google. Иначе
// одна и та же поисковая система или соцсеть расползается на несколько строк. Порядок важен: Gemini
// раньше Google, Gmail раньше Google.
const _SERVICES: readonly (readonly [RegExp, string])[] = [
  [/^gemini\.google\.com$/, 'Gemini'],
  [/^(mail\.google\.com|com\.google\.android\.gm)$/, 'Gmail'],
  [
    /^(news\.google\.[a-z.]+|com\.google\.android\.apps\.magazines)$/,
    'Google News',
  ],
  [
    /^((\w+\.)?google\.[a-z.]+|com\.google\.android\.googlequicksearchbox)$/,
    'Google',
  ],
  [/^(\w+\.)?bing\.com$/, 'Bing'],
  [/^duckduckgo\.com$/, 'DuckDuckGo'],
  [/^ecosia\.org$/, 'Ecosia'],
  [/^((\w+\.)?search\.yahoo\.com|yahoo\.com)$/, 'Yahoo'],
  [/^(\w+\.)?qwant\.com$/, 'Qwant'],
  [/^(\w+\.)?startpage\.com$/, 'Startpage'],
  [/^yandex\.[a-z.]+$/, 'Yandex'],
  [/^(\w+\.)?instagram\.com$/, 'Instagram'],
  [/^((\w+\.)?facebook\.com|fb\.me)$/, 'Facebook'],
  [/^(\w+\.)?pinterest\.[a-z.]+$|^pin\.it$/, 'Pinterest'],
  [/^((\w+\.)?youtube\.com|youtu\.be)$/, 'YouTube'],
  [/^((\w+\.)?linkedin\.com|lnkd\.in)$/, 'LinkedIn'],
  [/^(t\.co|x\.com|(\w+\.)?twitter\.com)$/, 'X'],
  [/^(\w+\.)?reddit\.com$/, 'Reddit'],
  [/^(\w+\.)?tiktok\.com$/, 'TikTok'],
  [/^(wa\.me|(\w+\.)?whatsapp\.com)$/, 'WhatsApp'],
  [/^(t\.me|(\w+\.)?telegram\.org)$/, 'Telegram'],
  [/^(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'],
  [/^(\w+\.)?perplexity\.ai$/, 'Perplexity'],
  [/^claude\.ai$/, 'Claude'],
  [/^copilot\.microsoft\.com$/, 'Copilot'],
];

// Метки utm_source, которыми обычно подписывают ссылки тех же сервисов.
const _UTM_SERVICES: Readonly<Record<string, string>> = {
  google: 'Google',
  adwords: 'Google',
  googleads: 'Google',
  bing: 'Bing',
  facebook: 'Facebook',
  fb: 'Facebook',
  instagram: 'Instagram',
  ig: 'Instagram',
  pinterest: 'Pinterest',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'X',
  x: 'X',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
};

/** Источник для разреза «Все»: имя известного сервиса, иначе utm_source, иначе хост реферера. */
export var sourceOf = (utmSource: string, referrer: string): string =>
  utmSource
    ? (_UTM_SERVICES[utmSource] ??
      _SERVICES.find(({ 0: host }) => host.test(utmSource))?.[1] ??
      utmSource)
    : (_SERVICES.find(({ 0: host }) => host.test(referrer))?.[1] ?? referrer);

/** Посещение по первому просмотру дня. `own` — хосты самого сайта: переход по своим ссылкам — не источник. */
export var visitOf = (
  header: Header,
  query: URLSearchParams,
  entry: string,
  own: readonly string[]
): Visit => {
  const utm = utmOf(query);
  const referrer = referrerHost(header('referer'), own);
  return {
    entry,
    source: sourceOf(utm.source, referrer),
    referrer,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: utm.campaign,
    device: deviceOf(header('user-agent') ?? '', header('sec-ch-ua-mobile')),
    browserLanguage: browserLanguageOf(header('accept-language')),
  };
};

const _FORMATS = new Map<string, Intl.DateTimeFormat>();

// en-CA пишет дату как ISO: 2026-11-03. Пустой пояс — пояс сервера.
const _format = (timeZone: string): Intl.DateTimeFormat =>
  _FORMATS.get(timeZone) ??
  ((format) => (_FORMATS.set(timeZone, format), format))(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  );

/** День момента в часовом поясе: `''` — пояс сервера. */
export var dayOf = (moment: Date, timeZone: string): Day =>
  _format(timeZone).format(moment);

/** День через `n` дней: `addDays('2026-11-03', -6)` → `2026-10-28`. */
export var addDays = (day: Day, n: number): Day =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Число дней от `from` до `to` включительно. */
export var daysBetween = (from: Day, to: Day): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  ) + 1;

export var isDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
