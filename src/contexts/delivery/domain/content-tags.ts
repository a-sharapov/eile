/** Кусок контента: HTML как есть, вызов компонента `[[Name prop="x"]]` или модуля `[#Form:callback]`. */
export type ContentPart =
  | { readonly html: string }
  | {
      readonly component: string;
      readonly props: Readonly<Record<string, string | number | boolean>>;
    }
  | { readonly module: string; readonly name: string };

// [[Gallery folder="leto" columns=3 wide]] — как вызов сниппета в Evo, только без `?` и `&`.
const _TAG =
  /\[\[([A-Z][A-Za-z0-9]*)((?:\s+[a-zA-Z_][\w-]*(?:=(?:"[^"]*"|[^\s\]"]+))?)*)\s*\]\]/g;
const _PROP = /([a-zA-Z_][\w-]*)(?:=(?:"([^"]*)"|([^\s\]"]+)))?/g;
const _NUMBER = /^-?\d+(?:\.\d+)?$/;

// Без значения — флаг: `wide` значит `wide=true`.
const _BARE: Readonly<Record<string, boolean>> = { true: true, false: false };

const _value = (quoted?: string, bare?: string): string | number | boolean =>
  quoted !== undefined
    ? quoted
    : bare === undefined
      ? true
      : (_BARE[bare] ?? (_NUMBER.test(bare) ? Number(bare) : bare));

const _props = (raw: string): Record<string, string | number | boolean> =>
  [...raw.matchAll(_PROP)].reduce<Record<string, string | number | boolean>>(
    (props, { 1: name, 2: quoted, 3: bare }) => ({
      ...props,
      [name!]: _value(quoted, bare),
    }),
    {}
  );

// [#Form:callback] — модуль сайта и имя его записи: форма, а не компонент; тег переживает смену вида.
const _MODULE = /\[#([A-Z][A-Za-z0-9]*):([a-z0-9][a-z0-9-]{0,63})\]/g;

// Текст между тегами — HTML-частями, сами теги — частями по `toPart`.
const _split = (
  text: string,
  tag: RegExp,
  toPart: (match: RegExpExecArray) => ContentPart
): ContentPart[] =>
  ((acc) => [...acc.parts, { html: text.slice(acc.at) }])(
    [...text.matchAll(tag)].reduce<{ parts: ContentPart[]; at: number }>(
      (acc, match) => ({
        parts: [
          ...acc.parts,
          { html: text.slice(acc.at, match.index) },
          toPart(match),
        ],
        at: match.index + match[0].length,
      }),
      { parts: [], at: 0 }
    )
  );

export var parseContent = (content: string): ContentPart[] =>
  _split(content, _TAG, (match) => ({
    component: match[1]!,
    props: _props(match[2] ?? ''),
  }))
    .flatMap((part) =>
      'html' in part && part.html.includes('[#')
        ? _split(part.html, _MODULE, (match) => ({
            module: match[1]!,
            name: match[2]!,
          }))
        : [part]
    )
    .filter((_) => !('html' in _) || _.html !== '');

/** Компоненты, которые вызывает контент: их надо загрузить до синхронного рендера. */
export var contentComponents = (content: string): string[] => [
  ...new Set([...content.matchAll(_TAG)].map((_) => _[1]!)),
];

// [~5~] — ссылка на страницу по id, как в Evo: адрес подставляется при рендере, переименование её не ломает.
const _PAGE_LINK = /\[~(\d+)~\]/g;

const _attribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

/** Подставляет адреса страниц вместо `[~id~]`; страницы нет или она скрыта — `#`. */
export var resolvePageLinks = (
  html: string,
  link: (id: number) => string | null
): string =>
  html.includes('[~')
    ? html.replace(_PAGE_LINK, (_match, id: string) =>
        _attribute(link(Number(id)) ?? '#')
      )
    : html;

const _I18N = /\{i18n\.([A-Za-z_][A-Za-z0-9_]*)\}/g;
const _SETTING = /\[@([A-Za-z_][A-Za-z0-9_]*)\]/g;

const _html = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * `{i18n.key}` — перевод, `[@key]` — своя настройка; подставляются до разбора тегов, поэтому работают и
 * в параметрах `[[Name text="{i18n.hello}"]]`. В HTML значение экранируется, в простом тексте — нет.
 * Неизвестный ключ остаётся как есть: пропуск видно на странице.
 */
export var expandKeys = (
  text: string,
  lookup: {
    readonly text: (key: string) => string | null;
    readonly value: (key: string) => string | null;
  },
  html: boolean
): string =>
  text.includes('{i18n.') || text.includes('[@')
    ? text
        .replace(_I18N, (match, key: string) =>
          ((value) => (value === null ? match : html ? _html(value) : value))(
            lookup.text(key)
          )
        )
        .replace(_SETTING, (match, key: string) =>
          ((value) => (value === null ? match : html ? _html(value) : value))(
            lookup.value(key)
          )
        )
    : text;
