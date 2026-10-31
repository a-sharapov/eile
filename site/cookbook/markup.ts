// Разметка глав кукбука. Текст глав — HTML страниц сайта, его же правят в менеджере; здесь только
// помощники, чтобы главы читались как текст, а не как теги.

/** Глава: страница-ребёнок кукбука. `replay` повторяет то, что читатель делает в менеджере. */
export type Chapter = {
  readonly alias: string;
  readonly title: string;
  /** Короче заголовка: в оглавлении и в меню. */
  readonly menuTitle?: string;
  /** Абзац под заголовком главы. */
  readonly lead: string;
  readonly description: string;
  readonly content: string;
  readonly replay?: (_: Replay) => void;
  /** После главы: путь сайта и текст, который на нём есть. */
  readonly expect?: readonly (readonly [string, string])[];
};

/** Что делает читатель руками; тест и снимки делают то же через API. */
export type Replay = {
  /** Сохранить элементы из примеров главы, помеченные `save`, в порядке текста. */
  readonly code: () => void;
  readonly kit: (name: string) => void;
  readonly page: (input: ReplayPage) => number;
  readonly edit: (title: string, change: Partial<ReplayPage>) => void;
  readonly field: (input: ReplayField) => void;
  readonly form: (name: string, input: ReplayForm) => void;
  readonly setting: (key: string, value: string) => void;
  /** Название сайта в «Настройках». */
  readonly rename: (name: string) => void;
  /** Картинка в медиатеку с описанием. */
  readonly upload: (path: string, alt: string) => void;
};

export type ReplayPage = {
  readonly title: string;
  readonly parent?: string;
  readonly alias?: string;
  readonly template?: string;
  readonly content?: string;
  readonly introText?: string;
  readonly longTitle?: string;
  readonly menuTitle?: string;
  readonly hiddenFromMenu?: boolean;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
  readonly publish?: boolean;
};

export type ReplayField = {
  readonly name: string;
  readonly label: string;
  readonly type:
    | 'text'
    | 'richtext'
    | 'number'
    | 'boolean'
    | 'date'
    | 'select'
    | 'image';
  readonly templates: readonly string[];
  /** Варианты для «Выбора из списка». */
  readonly options?: readonly string[];
};

export type ReplayForm = {
  readonly title: string;
  readonly source: string;
  readonly submitLabel: string;
  readonly successText: string;
};

// В тексте страницы `[[…]]`, `[~…~]`, `[@…]`, `[#…]` и `{i18n.…}` — живые теги. В примерах их надо
// показать, а не выполнить: скобки уходят сущностями, браузер покажет их как есть.
const _ENTITY: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '[': '&#91;',
  ']': '&#93;',
  '{': '&#123;',
  '}': '&#125;',
};

export var literal = (text: string): string =>
  text.replace(/[&<>"'[\]{}]/g, (_) => _ENTITY[_] ?? _);

/** Пример кода. `save` — `template:Base` или `component:Header`: тест сохранит его, как читатель. */
export var code = (
  lang: 'svelte' | 'sh' | 'ini' | 'html' | 'ts',
  source: string,
  options: { readonly file?: string; readonly save?: string } = {}
): string =>
  [
    '<figure class="code">',
    options.file ? `<figcaption>${literal(options.file)}</figcaption>` : '',
    `<pre${options.save ? ` data-save="${options.save}"` : ''}><code class="language-${lang}">${literal(source.replace(/^\n/, '').trimEnd())}</code></pre>`,
    '</figure>',
  ].join('');

export var h2 = (id: string, text: string): string =>
  `<h2 id="${id}">${text}</h2>`;

export var h3 = (text: string): string => `<h3>${text}</h3>`;

export var p = (...lines: readonly string[]): string =>
  lines.map((_) => `<p>${_}</p>`).join('\n');

export var steps = (...items: readonly string[]): string =>
  `<ol class="steps">${items.map((_) => `<li>${_}</li>`).join('')}</ol>`;

export var list = (...items: readonly string[]): string =>
  `<ul>${items.map((_) => `<li>${_}</li>`).join('')}</ul>`;

/** Врезка: совет, предупреждение или «если что-то не так». Первое слово — заголовок врезки. */
export var aside = (
  kind: 'tip' | 'warn' | 'trouble' | 'goal' | 'check',
  title: string,
  ...body: readonly string[]
): string =>
  `<aside class="${kind}"><p class="aside-title">${literal(title)}</p>${body.join('')}</aside>`;

/** Подпись элемента интерфейса менеджера. */
export var ui = (label: string): string => `<b class="ui">${label}</b>`;

export var kbd = (...keys: readonly string[]): string =>
  keys.map((_) => `<kbd>${_}</kbd>`).join('+');

/** Код в строке: тоже с защитой тегов. */
export var c = (text: string): string => `<code>${literal(text)}</code>`;

export var shot = (name: string, caption: string): string =>
  `[[CookShot name="${name}" caption="${caption.replace(/"/g, '&quot;')}"]]`;

/** Примеры главы, которые читатель сохраняет как элементы: вид, имя и исходник. */
export var savedCode = (
  html: string
): {
  readonly kind: 'template' | 'component';
  readonly name: string;
  readonly source: string;
}[] =>
  [
    ...html.matchAll(
      /<pre data-save="(template|component):(\w+)"><code[^>]*>([\s\S]*?)<\/code><\/pre>/g
    ),
  ].map((_) => ({
    kind: _[1] as 'template' | 'component',
    name: _[2]!,
    source: _[3]!.replace(
      /&(?:amp|lt|gt|quot|#39|#91|#93|#123|#125);/g,
      (entity) =>
        Object.entries(_ENTITY).find(({ 1: value }) => value === entity)![0]
    ),
  }));
