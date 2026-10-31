import { fail } from '../../../shared/kernel/errors.ts';
import { GUIDE, TEXT_RULES } from './guide.ts';

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
  /** Путь картинки медиатеки, которую описывают: модель, которая видит, получит её саму. */
  readonly image: string;
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
  image: _string(input.image, _LIMIT.label).trim(),
});

export var parseRequest = (input: unknown): string =>
  ((text) =>
    text === ''
      ? fail('assistant.empty_request', 'Describe what to generate')
      : text.slice(0, _LIMIT.request))(
    _string(input, _LIMIT.request * 2).trim()
  );

// Промпт — по-английски: модели точнее всего следуют английским указаниям, а пишут на языке сайта.
const _CODE_ANSWER =
  'Return the whole file: it replaces the current code. No ``` and no explanations, only code.';

const _KIND_RULES: Readonly<Record<TargetKind, string>> = {
  text: 'The answer is one line without line breaks. Titles have no full stop at the end.',
  longtext:
    'The answer is plain text without markup or markdown; separate paragraphs with an empty line.',
  richtext: TEXT_RULES,
  template: `${GUIDE.template}\n${_CODE_ANSWER}`,
  component: `${GUIDE.component}\n${_CODE_ANSWER}`,
  plugin: `${GUIDE.plugin}\n${_CODE_ANSWER}`,
};

const _TEMPERATURE: Readonly<Record<TargetKind, number>> = {
  text: 0.7,
  longtext: 0.7,
  richtext: 0.7,
  template: 0.2,
  component: 0.2,
  plugin: 0.2,
};

// С запасом: модели с рассуждением тратят токены до ответа, а длину значения держат maxLength и обрезка.
const _MAX_TOKENS: Readonly<Record<TargetKind, number>> = {
  text: 2000,
  longtext: 4000,
  richtext: 6000,
  template: 12_000,
  component: 8000,
  plugin: 6000,
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
