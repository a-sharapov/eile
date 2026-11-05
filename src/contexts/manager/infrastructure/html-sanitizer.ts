// HTML от тех, кому нельзя код: белый список тегов и атрибутов, безопасные адреса. Разбор — HTMLRewriter
// Bun (lol-html): без DOM и без зависимостей. Удаляется то, что исполняется или меняет разбор
// (скрипты, обработчики, `javascript:`, SVG и MathML, фреймы, стили), и служебные метки CMS.

const _TAGS: ReadonlySet<string> = new Set(
  (
    'p br hr h1 h2 h3 h4 h5 h6 strong b em i u s sub sup small mark code pre kbd samp var blockquote q cite ' +
    'ul ol li dl dt dd a img picture source figure figcaption table thead tbody tfoot tr th td caption ' +
    'colgroup col span div section article aside header footer nav main details summary abbr time address wbr'
  ).split(' ')
);

// С содержимым: исполняется сам элемент или его содержимое разбирается не как HTML.
const _DROPPED: ReadonlySet<string> = new Set(
  (
    'script style iframe frame frameset object embed applet svg math template noscript textarea select ' +
    'title xmp plaintext noembed noframes head meta link base'
  ).split(' ')
);

const _GLOBAL: ReadonlySet<string> = new Set([
  'class',
  'id',
  'title',
  'lang',
  'dir',
  'role',
]);

const _ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(['href', 'target', 'rel', 'name', 'hreflang']),
  img: new Set([
    'src',
    'srcset',
    'sizes',
    'alt',
    'width',
    'height',
    'loading',
    'decoding',
  ]),
  source: new Set(['srcset', 'sizes', 'media', 'type', 'width', 'height']),
  th: new Set(['colspan', 'rowspan', 'scope', 'headers', 'abbr']),
  td: new Set(['colspan', 'rowspan', 'headers']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  ol: new Set(['start', 'reversed', 'type']),
  li: new Set(['value']),
  time: new Set(['datetime']),
  blockquote: new Set(['cite']),
  q: new Set(['cite']),
  details: new Set(['open']),
};

const _URLS: ReadonlySet<string> = new Set(['href', 'src', 'cite']);

const _SCHEMES: ReadonlySet<string> = new Set([
  'http',
  'https',
  'mailto',
  'tel',
]);

// Атрибуты приходят нераскодированными: `jav&#x61;script:` надо раскодировать, иначе проверка схемы
// увидит безобидную строку, а браузер — `javascript:`. Буквы дают только числовые ссылки.
const _decoded = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16) % 0x110000)
    )
    .replace(/&#(\d+);?/g, (_m, dec: string) =>
      String.fromCodePoint(Number(dec) % 0x110000)
    )
    .replace(/&colon;/gi, ':')
    .replace(/&(?:tab|newline);/gi, '');

// Браузер выбрасывает из адреса пробелы по краям, табы и переводы строк внутри.
const _scheme = (url: string): string | null =>
  ((clean) =>
    ((colon) =>
      colon > 0 && !/[/?#]/.test(clean.slice(0, colon))
        ? clean.slice(0, colon).toLowerCase()
        : null)(clean.indexOf(':')))(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: адрес чистится от управляющих символов
    _decoded(url).replace(/[\u0000- \u007f-\u009f]/g, '')
  );

// Без схемы — относительный адрес, `[~5~]` или якорь; со схемой — только из списка.
const _safeUrl = (url: string): boolean =>
  ((scheme) => scheme === null || _SCHEMES.has(scheme))(_scheme(url));

const _safeSrcset = (value: string): boolean =>
  value
    .split(',')
    .map((_) => _.trim().split(/\s+/)[0] ?? '')
    .every(_safeUrl);

const _allowedAttribute = (tag: string, name: string): boolean =>
  _GLOBAL.has(name) ||
  name.startsWith('aria-') ||
  (_ATTRIBUTES[tag]?.has(name) ?? false);

// id и name служебных элементов (полоса правки, формы) в тексте страницы — подмена: getElementById вернул
// бы их, а не настоящие.
const _RESERVED = /^(?:eile|cms)[-_]/i;

const _safeValue = (name: string, value: string): boolean =>
  _URLS.has(name)
    ? _safeUrl(value)
    : name === 'srcset'
      ? _safeSrcset(value)
      : name === 'id' || name === 'name'
        ? !_RESERVED.test(value.trim())
        : true;

const _clean = (element: HTMLRewriterTypes.Element): void => {
  for (const { 0: name, 1: value } of [...element.attributes])
    if (!_allowedAttribute(element.tagName, name) || !_safeValue(name, value))
      element.removeAttribute(name);
  // Ссылка с target открывается в новой вкладке — навязываем rel=noopener noreferrer, чтобы чужая
  // страница не достала window.opener (обратный табнаббинг); свой rel ссылки сохраняется.
  if (element.tagName === 'a' && element.getAttribute('target') !== null) {
    const rel = new Set(
      (element.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean)
    );
    rel.add('noopener').add('noreferrer');
    element.setAttribute('rel', [...rel].join(' '));
  }
};

// `<!--noindex-->` нужен Яндексу; остальные комментарии — в том числе метки регионов — убираем.
const _KEPT_COMMENT = /^\s*\/?noindex\s*$/i;

const _rewriter = () =>
  new HTMLRewriter()
    .on('*', {
      element: (element) =>
        void (_DROPPED.has(element.tagName)
          ? element.remove()
          : _TAGS.has(element.tagName)
            ? _clean(element)
            : element.removeAndKeepContent()),
    })
    .onDocument({
      comments: (comment) =>
        void (_KEPT_COMMENT.test(comment.text) || comment.remove()),
      doctype: () => undefined,
    });

const _pass = (html: string): string => _rewriter().transform(html);

/** Безопасный HTML: проходы повторяются, пока результат не перестанет меняться (не больше трёх). */
export var sanitizeHtml = (html: string): string =>
  [1, 2, 3].reduce(
    (current) =>
      current.stable
        ? current
        : ((next) => ({ html: next, stable: next === current.html }))(
            _pass(current.html)
          ),
    { html, stable: false }
  ).html;
