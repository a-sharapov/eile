// Папка-сайт (ADR 0068): связанная папка, которая отдаётся как статический сайт по `/<приставка>/…` — сборка
// Astro, старый лендинг. Файлы — не медиатека: строк в базе нет, файл ищется на диске на каждый запрос.

// Типы статического сайта: страницы, стили и скрипты (HTML — от администратора, как шаблоны), данные,
// шрифты, картинки, видео и звук, модели и HDR для сцен Three.js, WebAssembly. Остальное (PHP, .env,
// исходники) не отдаётся.
const _TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json',
  map: 'application/json',
  webmanifest: 'application/manifest+json',
  xml: 'application/xml',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  hdr: 'image/vnd.radiance',
  wasm: 'application/wasm',
};

// Текст сжимается (br/gzip): страницы, стили, скрипты, данные, SVG.
const _TEXT =
  /^(?:text\/|application\/(?:json|manifest\+json|xml)|image\/svg\+xml|model\/gltf\+json)/;

// Сборщики кладут файлы с хэшем в имени сюда: `_astro/index.BJPmg_gH.js` (Astro), `_app/immutable/` (SvelteKit).
const _HASHED = /(?:^|\/)(?:_astro|_app\/immutable)\//;

// Скрытое (`.env`, `.git/`) и следы архиваторов — не файлы сайта.
const _HIDDEN = /(?:^|\/)(?:\.|__MACOSX(?:\/|$))/;

/** Тип файла папки-сайта по расширению; null — такой файл не отдаётся. */
export var staticType = (file: string): string | null =>
  ((dot) =>
    dot < 0 || dot < file.lastIndexOf('/')
      ? null
      : (_TYPES[file.slice(dot + 1).toLowerCase()] ?? null))(
    file.lastIndexOf('.')
  );

/** Тип сжимается: текст, SVG, JSON. */
export var compressible = (contentType: string): boolean =>
  _TEXT.test(contentType);

/** Файл с хэшем в имени: кэш браузера навсегда; остальное — со сверкой по ETag. */
export var immutable = (file: string): boolean => _HASHED.test(file);

/** Скрытая часть пути или след архиватора: такого файла у папки-сайта нет. */
export var hiddenPart = (file: string): boolean => _HIDDEN.test(file);

/** Файл по пути внутри папки: адрес папки (`''`, `about/`) — её `index.html`. */
export var indexOf = (rest: string): string =>
  rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest;

/** Своя страница 404 папки-сайта — в её корне, как у Astro и большинства хостингов. */
export var NOT_FOUND_FILE = '404.html';
