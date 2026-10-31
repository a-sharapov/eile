import { fail } from '../../../shared/kernel/errors.ts';

/** Что генерируем: строку, абзацы, HTML текста страницы или код элемента. */
export type TargetKind =
  | 'text'
  | 'longtext'
  | 'richtext'
  | 'template'
  | 'component'
  | 'plugin';

/** Поле, которое заполняет человек, и где оно: всё это ИИ получает в системном промпте. */
export type Target = {
  readonly kind: TargetKind;
  /** Подпись поля: «Заголовок», «Описание картинки». */
  readonly label: string;
  /** Подсказка под полем: что в нём ожидается. */
  readonly hint: string;
  /** Текущее значение: его можно переписать, сократить, продолжить. */
  readonly value: string;
  readonly maxLength: number | null;
  /** Шаблон допустимого значения (`pattern` поля). */
  readonly pattern: string;
  /** Где поле: «страница», «шаблон Base» — и факты о месте: заголовок, путь, компоненты сайта. */
  readonly area: string;
  readonly facts: readonly string[];
};

/** Сведения о сайте для каждого запроса. */
export type SiteFacts = {
  readonly name: string;
  readonly language: string;
  readonly description: string;
  readonly url: string;
};

export type Prompt = {
  readonly system: string;
  readonly user: string;
  readonly temperature: number;
  readonly maxTokens: number;
};

const _KINDS: readonly TargetKind[] = [
  'text',
  'longtext',
  'richtext',
  'template',
  'component',
  'plugin',
];

/** Код элементов правят только те, кому можно править элементы. */
export var isCode = (kind: TargetKind): boolean =>
  kind === 'template' || kind === 'component' || kind === 'plugin';

const _LIMIT = {
  request: 4000,
  value: 60_000,
  label: 200,
  fact: 500,
  facts: 30,
};

const _string = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Поле из запроса менеджера — с проверкой вида и разумными пределами длины. */
export var parseTarget = (input: Record<string, unknown>): Target => ({
  kind: _KINDS.includes(input.kind as TargetKind)
    ? (input.kind as TargetKind)
    : fail('assistant.invalid_target', `Unknown target "${input.kind}"`),
  label: _string(input.label, _LIMIT.label).trim() || 'field',
  hint: _string(input.hint, _LIMIT.fact).trim(),
  value: _string(input.value, _LIMIT.value),
  maxLength:
    Number.isSafeInteger(input.maxLength) && Number(input.maxLength) > 0
      ? Number(input.maxLength)
      : null,
  pattern: _string(input.pattern, _LIMIT.label),
  area: _string(input.area, _LIMIT.label).trim(),
  facts: Array.isArray(input.facts)
    ? input.facts
        .slice(0, _LIMIT.facts)
        .map((_) => _string(_, _LIMIT.fact))
        .filter(Boolean)
    : [],
});

export var parseRequest = (input: unknown): string =>
  ((text) =>
    text === ''
      ? fail('assistant.empty_request', 'Describe what to generate')
      : text.slice(0, _LIMIT.request))(
    _string(input, _LIMIT.request * 2).trim()
  );

// Промпт — по-английски: модели точнее всего следуют английским указаниям, а пишут на языке сайта.
const _TEMPLATE = `This is a site template: a Svelte 5 component in runes mode (\`export let\` does not work) that renders the whole page.
- Props: \`let { page, site } = $props();\`
- page: title, longTitle, menuTitle, description, introText, content, path, kind, linkTo, language, publishedAt, createdAt, updatedAt, fields (the page's field values: \`page.fields.name\`).
- The page text is rendered with \`import Content from '$core/Content';\` and \`<Content of={page} />\`: it draws the components, forms and page links inside the text. \`{@html page.content}\` would show them as raw tags.
- site: name, language and the other settings; \`site.i18n.key\` is a translation into the page language, \`site.custom.key\` a custom site setting. The tags \`{i18n.key}\` and \`[@key]\` are not allowed in a template.
- As in Evo: \`<svelte:head><title>{page.longTitle || page.title} — {site.name}</title></svelte:head>\`; menu items show \`{item.menuTitle || item.title}\`.
- Site components are imported like \`import Menu from '$components/Menu';\`. The '$core' module: link(id), page(id), children(parentId), current(), ancestors(id), translations() → [{ language, url, title, current }] for a language switcher, site(), media(path), image(path) → { src, srcset, width, height, alt }, t(key), setting(key).
- Only $components/*, $core and svelte can be imported. Styles go in this file's <style>.`;

const _COMPONENT = `This is a site component: Svelte 5 in runes mode. Editors insert it into the page text as a block and fill in a form of its parameters.
- The file starts with a description: \`<!-- @component\nWhat it is, in one line.\n-->\`.
- Parameters are \`$props()\` with TypeScript types; above each one, a JSDoc with the form label: \`/** Title */\`. Options of a string union are labelled like this: \`/** Tone: note=Note, success=Success */\`. Optional parameters have a default value. Write the labels in the site language.
- Site data comes from '$core': link(id), page(id), children(parentId), current(), translations(), site(), media(path), image(path) → { src, srcset, width, height, alt }, t(key), setting(key).
- Only $components/*, $core and svelte can be imported. Styles go in this file's <style>.`;

const _PLUGIN = `This is a site plugin, a TypeScript module:
\`export default { render?(html: string, { path, status }): string, notFound?(path: string): string | null, on?: { [event type]: (event) => void } }\`.
- render changes the finished HTML of a page, notFound returns a redirect address or null, on listens to site events.
- Only '$core' can be imported.`;

const _CODE_ANSWER =
  'Return the whole file: it replaces the current code. No ``` and no explanations, only code.';

const _RICHTEXT = `This is the page text: return an HTML fragment. Allowed: <p>, <h2>–<h4>, <ul>/<ol>/<li>, <blockquote>, <strong>, <em>, <a href>. Not allowed: <html>, <body>, <h1> (the template prints the title), styles, scripts, classes, images.
A link to a page of the site is written as [~id~]; substitutions: {i18n.key} is a translation, [@key] a custom site setting.`;

const _KIND_RULES: Readonly<Record<TargetKind, string>> = {
  text: 'The answer is one line without line breaks. Titles have no full stop at the end.',
  longtext:
    'The answer is plain text without markup or markdown; separate paragraphs with an empty line.',
  richtext: _RICHTEXT,
  template: `${_TEMPLATE}\n${_CODE_ANSWER}`,
  component: `${_COMPONENT}\n${_CODE_ANSWER}`,
  plugin: `${_PLUGIN}\n${_CODE_ANSWER}`,
};

const _TEMPERATURE: Readonly<Record<TargetKind, number>> = {
  text: 0.7,
  longtext: 0.7,
  richtext: 0.7,
  template: 0.2,
  component: 0.2,
  plugin: 0.2,
};

const _MAX_TOKENS: Readonly<Record<TargetKind, number>> = {
  text: 300,
  longtext: 1500,
  richtext: 3000,
  template: 6000,
  component: 4000,
  plugin: 3000,
};

const _lines = (lines: readonly (string | false)[]): string =>
  lines.filter((_): _ is string => Boolean(_)).join('\n');

/** Системный промпт: кто ты, какой сайт, какое поле и по каким правилам его заполнять. */
export var buildPrompt = (
  target: Target,
  request: string,
  site: SiteFacts,
  instructions: string
): Prompt => ({
  system: _lines([
    'You are an assistant in a website manager. You fill in one field that a person is editing right now, following their short request.',
    `Site: "${site.name || 'untitled'}"${site.url ? `, ${site.url}` : ''}.${site.description ? ` About the site: ${site.description}` : ''}`,
    `Write in the site language (${site.language}) unless the request says otherwise.`,
    'Answer with the field value only: no explanations, greetings, surrounding quotes or markdown wrapping.',
    instructions && `The site owner's instructions: ${instructions}`,
    '',
    `Field: "${target.label}".`,
    target.hint && `Hint under the field: ${target.hint}`,
    target.maxLength !== null && `At most ${target.maxLength} characters.`,
    target.pattern && `The value must match the pattern: ${target.pattern}`,
    target.area && `Where: ${target.area}.`,
    ...target.facts.map((_) => `- ${_}`),
    '',
    _KIND_RULES[target.kind],
  ]),
  user: _lines([
    `Request: ${request}`,
    target.value.trim() !== '' && `\nCurrent field value:\n${target.value}`,
  ]),
  temperature: _TEMPERATURE[target.kind],
  maxTokens: _MAX_TOKENS[target.kind],
});

const _FENCE = /^\s*```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/;

// Короткое значение обрезается по слову, чтобы не оборвать на полуслове.
const _clip = (text: string, max: number | null): string =>
  max === null || text.length <= max
    ? text
    : ((cut) =>
        cut.lastIndexOf(' ') > max * 0.6
          ? cut.slice(0, cut.lastIndexOf(' '))
          : cut)(text.slice(0, max));

/** Ответ модели — в значение поля: без обёртки ```, лишних кавычек и переносов у строки. */
export var cleanOutput = (target: Target, raw: string): string =>
  ((text) =>
    target.kind === 'text'
      ? _clip(
          text
            .replace(/\s*\n\s*/g, ' ')
            .replace(/^["«„“'](.*)["»“”']$/s, '$1')
            .trim(),
          target.maxLength
        )
      : target.kind === 'longtext'
        ? _clip(text, target.maxLength)
        : text)(raw.replace(_FENCE, '$1').trim());
