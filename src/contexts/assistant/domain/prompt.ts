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
  label: _string(input.label, _LIMIT.label).trim() || 'поле',
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

const _TEMPLATE = `Это шаблон сайта — компонент Svelte 5 в режиме runes (\`export let\` не работает), он рисует страницу целиком.
- Props: \`let { page, site } = $props();\`
- page: title, longTitle, menuTitle, description, introText, content (HTML — выводить \`{@html page.content}\`), path, kind, linkTo, publishedAt, createdAt, updatedAt, fields (значения полей страницы: \`page.fields.имя\`).
- site: name, language и остальные настройки; \`site.i18n.ключ\` — перевод на языке страницы, \`site.custom.ключ\` — своя настройка сайта. Теги \`{i18n.ключ}\` и \`[@ключ]\` в шаблоне запрещены.
- По обычаю Evo: \`<svelte:head><title>{page.longTitle || page.title} — {site.name}</title></svelte:head>\`, в меню — \`{item.menuTitle || item.title}\`.
- Компоненты сайта подключаются так: \`import Menu from '$components/Menu';\`. Модуль '$core': link(id), page(id), children(parentId), site(), media(path), image(path) → { src, srcset, width, height, alt }, t(key), setting(key).
- Импортировать можно только $components/*, $core и svelte. Стили — в <style> этого файла.`;

const _COMPONENT = `Это компонент сайта — Svelte 5 в режиме runes; редакторы вставляют его в текст страницы блоком и заполняют форму параметров.
- Файл начинается с описания: \`<!-- @component\\nЧто это, одной строкой.\\n-->\`.
- Параметры — \`$props()\` с типами TypeScript; над каждым — JSDoc с подписью для формы: \`/** Заголовок */\`. Варианты строкового union подписываются так: \`/** Оттенок: note=Заметка, success=Успех */\`. Необязательные параметры — со значением по умолчанию.
- Данные сайта — из '$core': link(id), page(id), children(parentId), site(), media(path), image(path) → { src, srcset, width, height, alt }, t(key), setting(key).
- Импортировать можно только $components/*, $core и svelte. Стили — в <style> этого файла.`;

const _PLUGIN = `Это плагин сайта — модуль TypeScript:
\`export default { render?(html: string, { path, status }): string, notFound?(path: string): string | null, on?: { [тип события]: (event) => void } }\`.
- render меняет готовый HTML страницы, notFound возвращает адрес переадресации или null, on слушает события сайта.
- Импортировать можно только '$core'.`;

const _CODE_ANSWER =
  'Верни файл целиком — он заменит текущий код. Без ``` и пояснений: только код.';

const _RICHTEXT = `Это текст страницы: верни HTML-фрагмент. Можно: <p>, <h2>–<h4>, <ul>/<ol>/<li>, <blockquote>, <strong>, <em>, <a href>. Нельзя: <html>, <body>, <h1> (заголовок выводит шаблон), стили, скрипты, классы, картинки.
Ссылка на страницу сайта пишется как [~id~]; подстановки: {i18n.ключ} — перевод, [@ключ] — своя настройка сайта.`;

const _KIND_RULES: Readonly<Record<TargetKind, string>> = {
  text: 'Ответ — одна строка без переносов. У заголовков нет точки в конце.',
  longtext:
    'Ответ — обычный текст без разметки и markdown; абзацы разделяй пустой строкой.',
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
    'Ты — помощник в менеджере сайта. Ты заполняешь одно поле, которое сейчас правит человек, по его короткому запросу.',
    `Сайт: «${site.name || 'без названия'}»${site.url ? `, ${site.url}` : ''}.${site.description ? ` О сайте: ${site.description}` : ''}`,
    `Пиши на языке сайта (${site.language}), если в запросе не сказано другое.`,
    'Отвечай только значением поля: без пояснений, приветствий, кавычек вокруг и markdown-обёртки.',
    instructions && `Указания владельца сайта: ${instructions}`,
    '',
    `Поле: «${target.label}».`,
    target.hint && `Подсказка у поля: ${target.hint}`,
    target.maxLength !== null && `Не длиннее ${target.maxLength} знаков.`,
    target.pattern && `Значение должно подходить под шаблон: ${target.pattern}`,
    target.area && `Где: ${target.area}.`,
    ...target.facts.map((_) => `- ${_}`),
    '',
    _KIND_RULES[target.kind],
  ]),
  user: _lines([
    `Запрос: ${request}`,
    target.value.trim() !== '' && `\nТекущее значение поля:\n${target.value}`,
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
