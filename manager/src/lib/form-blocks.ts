import { currentLanguage, type Language, type MessageKey, t } from './i18n.ts';
import { moveSpan } from './reorder.ts';
import type { FieldKind } from './types.ts';

/** Поле в редакторе формы: всё, что попадает в атрибуты HTML5 и подписи. */
export type FieldDraft = {
  kind: FieldKind;
  label: string;
  name: string;
  required: boolean;
  placeholder: string;
  hint: string;
  pattern: string;
  min: string;
  max: string;
  step: string;
  maxLength: string;
  /** Варианты по строке: «Подпись» или «значение | Подпись»; у скрытого поля — подписи значений, `data-labels`. */
  options: string;
  /** Свой текст ошибки — `data-message`. */
  message: string;
  /** Скрытое поле: источник `data-source` (page.title, query:ref…); пусто — постоянное значение. */
  source: string;
  value: string;
  /** Согласие: текст, `{слова}` в нём — ссылка на страницу политики. */
  consentPage: number | null;
  /** Показывать, только если поле с этим именем заполнено или равно одному из `showValues`; пусто — всегда. */
  showField: string;
  /** Значения через запятую; пусто — достаточно, что поле заполнено. */
  showValues: string;
  /** Файл: допустимые типы — `accept`: `.pdf, image/*`. */
  accept: string;
  /** Файл: предел размера в МБ — `data-max-size`; пусто — 10. */
  maxSize: string;
  /** Файл: можно несколько. */
  multiple: boolean;
};

/**
 * Блок формы: текст (заголовки, пояснения), поле или начало шага; нетронутое поле хранит исходную
 * разметку. Блоки после шага — до следующего шага — собираются в его `<fieldset data-step>`; шаг без
 * названия — конец шагов.
 */
export type FormBlock =
  | { readonly id: number; readonly kind: 'text'; html: string }
  | { readonly id: number; readonly kind: 'step'; title: string }
  | {
      readonly id: number;
      readonly kind: 'field';
      field: FieldDraft;
      original: string | null;
    };

let _next = 0;
export var formBlockId = (): number => ++_next;

/** Сколько блоков переезжает вместе с этим: шаг — со всем, что в нём, до следующего шага. */
export var blockSpan = (blocks: readonly FormBlock[], index: number): number =>
  blocks[index]?.kind === 'step'
    ? ((next) => (next < 0 ? blocks.length - index : next + 1))(
        blocks.slice(index + 1).findIndex((_) => _.kind === 'step')
      )
    : 1;

/**
 * Куда можно поставить блок: поле и текст — в любой промежуток, в том числе в другой шаг; шаг —
 * только на границу шагов или в конец, чтобы не разрезать чужой шаг и не забрать поля до шагов.
 */
export var blockGaps = (
  blocks: readonly FormBlock[],
  index: number
): number[] =>
  blocks[index]?.kind === 'step'
    ? [
        ...blocks.flatMap((block, i) => (block.kind === 'step' ? [i] : [])),
        blocks.length,
      ]
    : Array.from({ length: blocks.length + 1 }, (_, i) => i);

/** Блок — в промежуток `to` (0…length); недопустимое место ничего не меняет. */
export var moveBlock = (
  blocks: readonly FormBlock[],
  from: number,
  to: number
): FormBlock[] =>
  blockGaps(blocks, from).includes(to)
    ? moveSpan(blocks, from, blockSpan(blocks, from), to)
    : [...blocks];

/** Название шага, в котором стоит блок; null — до шагов или после их конца. */
export var stepOf = (
  blocks: readonly FormBlock[],
  index: number
): string | null =>
  blocks
    .slice(0, index + 1)
    .reduce<string | null>(
      (step, block) =>
        block.kind === 'step' ? block.title.trim() || null : step,
      null
    );

export var emptyField = (kind: FieldKind = 'text'): FieldDraft => ({
  kind,
  label: '',
  name: '',
  required: false,
  placeholder: '',
  hint: '',
  pattern: '',
  min: '',
  max: '',
  step: '',
  maxLength: '',
  options: '',
  message: '',
  source: kind === 'hidden' ? 'page.title' : '',
  value: '',
  consentPage: null,
  showField: '',
  showValues: '',
  accept: '',
  maxSize: '',
  multiple: false,
});

/** `data-show-if`: `поле` или `поле=значение|значение`. */
export var showIfOf = (field: FieldDraft): string =>
  field.showField === ''
    ? ''
    : ((values) =>
        values.length === 0
          ? field.showField
          : `${field.showField}=${values.join('|')}`)(
        field.showValues
          .split(',')
          .map((_) => _.trim())
          .filter(Boolean)
      );

const _attr = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

const _text = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** Варианты из строк: «Подпись» — значение то же, «значение | Подпись» — своё. */
export var optionsOf = (text: string): { value: string; label: string }[] =>
  text
    .split('\n')
    .map((_) => _.trim())
    .filter(Boolean)
    .map((line) =>
      ((at) =>
        at < 0
          ? { value: line, label: line }
          : {
              value: line.slice(0, at).trim(),
              label: line.slice(at + 1).trim(),
            })(line.indexOf('|'))
    );

/** Подписи скрытого поля из строк «значение | Подпись» — в `data-labels="значение=Подпись|…"`. */
export var labelsAttr = (text: string): string =>
  optionsOf(text)
    .map((_) => `${_.value}=${_.label}`)
    .join('|');

/** `data-labels` — обратно в строки «значение | Подпись», как варианты списка в редакторе. */
export var labelLines = (raw: string): string =>
  raw
    .split('|')
    .map((_) => _.trim())
    .filter(Boolean)
    .map((entry) =>
      ((at) =>
        at < 0
          ? entry
          : `${entry.slice(0, at).trim()} | ${entry.slice(at + 1).trim()}`)(
        entry.indexOf('=')
      )
    )
    .join('\n');

const _INPUT: Partial<Record<FieldKind, string>> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
  time: 'time',
  'datetime-local': 'datetime-local',
  range: 'range',
};

const _a = (name: string, value: string): string =>
  value === '' ? '' : ` ${name}="${_attr(value)}"`;

const _rules = (field: FieldDraft): string =>
  [
    field.required ? ' required' : '',
    _a('placeholder', field.placeholder),
    _a('pattern', field.pattern),
    _a('min', field.min),
    _a('max', field.max),
    _a('step', field.step),
    _a('maxlength', field.maxLength),
  ].join('');

const _star = (field: FieldDraft): string =>
  field.required ? ' <span class="required" aria-hidden="true">*</span>' : '';

const _hint = (field: FieldDraft): string =>
  field.hint ? `\n  <small class="hint">${_text(field.hint)}</small>` : '';

// Подпись для заявки — без фигурных скобок ссылки в согласии.
const _open = (field: FieldDraft, tag = 'div', extra = ''): string =>
  `<${tag} class="field${extra}" data-field="${field.kind}"${_a('data-label', field.label.replace(/[{}]/g, ''))}${_a('data-message', field.message)}${_a('data-show-if', showIfOf(field))}>`;

// Ссылка в согласии: `{слова}` → <a href="[~id~]">слова</a>; адрес подставит сайт.
const _consent = (field: FieldDraft): string =>
  _text(field.label).replace(/\{([^}]+)\}/, (_match, words: string) =>
    field.consentPage === null
      ? words
      : `<a href="[~${field.consentPage}~]" target="_blank">${words}</a>`
  );

const _CANONICAL: Readonly<
  Partial<Record<FieldKind, (field: FieldDraft, id: string) => string>>
> = {
  textarea: (field, id) =>
    `${_open(field)}\n  <label for="${id}">${_text(field.label)}${_star(field)}</label>\n  <textarea id="${id}" name="${_attr(field.name)}" rows="4"${_rules(field)}></textarea>${_hint(field)}\n</div>`,
  select: (field, id) =>
    `${_open(field)}\n  <label for="${id}">${_text(field.label)}${_star(field)}</label>\n  <select id="${id}" name="${_attr(field.name)}"${field.required ? ' required' : ''}><option value="">${_text(field.placeholder || t('formStarter.choose'))}</option>${optionsOf(
      field.options
    )
      .map(
        (_) => `<option value="${_attr(_.value)}">${_text(_.label)}</option>`
      )
      .join('')}</select>${_hint(field)}\n</div>`,
  radio: (field) => _group(field, 'radio'),
  checkbox: (field) => _group(field, 'checkbox'),
  consent: (field) =>
    `${_open(field, 'div', ' field-consent')}\n  <label><input type="checkbox" name="${_attr(field.name)}" value="yes"${field.required ? ' required' : ''}> ${_consent(field)}</label>\n</div>`,
  hidden: (field) =>
    `<input type="hidden" name="${_attr(field.name)}"${field.source ? _a('data-source', field.source) : _a('value', field.value)}${_a('data-label', field.label)}${_a('data-labels', labelsAttr(field.options))}>`,
  file: (field, id) =>
    `${_open(field)}\n  <label for="${id}">${_text(field.label)}${_star(field)}</label>\n  <input id="${id}" name="${_attr(field.name)}" type="file"${field.required ? ' required' : ''}${_a('accept', field.accept)}${field.multiple ? ' multiple' : ''}${_a('data-max-size', field.maxSize)}>${_hint(field)}\n</div>`,
};

// Группа вариантов: обязательность у переключателей — на каждом, у галочек — только подпись.
const _group = (field: FieldDraft, type: 'radio' | 'checkbox'): string =>
  `${_open(field, 'fieldset')}\n  <legend>${_text(field.label)}${_star(field)}</legend>\n${optionsOf(
    field.options
  )
    .map(
      (_) =>
        `  <label><input type="${type}" name="${_attr(field.name)}" value="${_attr(_.value)}"${type === 'radio' && field.required ? ' required' : ''}> ${_text(_.label)}</label>`
    )
    .join('\n')}${_hint(field)}\n</fieldset>`;

/** Поле → разметка HTML5, какую разберёт сервер: обёртка data-field, подпись, правила атрибутами. */
export var fieldHtml = (field: FieldDraft): string =>
  (
    _CANONICAL[field.kind] ??
    ((_field: FieldDraft, id: string) =>
      `${_open(field)}\n  <label for="${id}">${_text(field.label)}${_star(field)}</label>\n  <input id="${id}" name="${_attr(field.name)}" type="${_INPUT[field.kind] ?? 'text'}"${_rules(field)}>${_hint(field)}\n</div>`)
  )(field, `f-${field.name}`);

const _step = (title: string, inner: readonly string[]): string =>
  `<fieldset class="form-step" data-step="${_attr(title)}">\n<legend>${_text(title)}</legend>\n${inner.join('\n')}\n</fieldset>`;

/** Блоки → HTML формы: нетронутые поля — как были, правленые — в каноническом виде, шаги — в fieldset. */
export var serializeForm = (blocks: readonly FormBlock[]): string =>
  ((built) =>
    [
      ...built.html,
      ...(built.step ? [_step(built.step.title, built.step.inner)] : []),
    ]
      .filter(Boolean)
      .join('\n'))(
    blocks.reduce<{
      html: string[];
      step: { title: string; inner: string[] } | null;
    }>(
      (acc, block) =>
        // Шаг без названия — конец шагов: всё ниже снова вне fieldset.
        block.kind === 'step'
          ? {
              html: acc.step
                ? [...acc.html, _step(acc.step.title, acc.step.inner)]
                : acc.html,
              step:
                block.title.trim() === ''
                  ? null
                  : { title: block.title.trim(), inner: [] },
            }
          : ((html) =>
              html === ''
                ? acc
                : acc.step
                  ? {
                      ...acc,
                      step: { ...acc.step, inner: [...acc.step.inner, html] },
                    }
                  : { ...acc, html: [...acc.html, html] })(
              block.kind === 'text'
                ? block.html.trim()
                : (block.original ?? fieldHtml(block.field))
            ),
      { html: [], step: null }
    )
  );

const _PHONE = '\\+?[0-9 \\(\\)\\-]{10,}';

/** Стартовая форма: имя, телефон, комментарий и согласие — правится, а не пишется с нуля. Подписи — на языке менеджера. */
export var starterFields = (): readonly FieldDraft[] => [
  {
    ...emptyField('text'),
    label: t('formStarter.name'),
    name: 'name',
    required: true,
    maxLength: '100',
  },
  {
    ...emptyField('tel'),
    label: t('formStarter.phone'),
    name: 'phone',
    required: true,
    placeholder: t('formStarter.phonePlaceholder'),
    pattern: _PHONE,
    message: t('formStarter.phoneMessage'),
  },
  {
    ...emptyField('textarea'),
    label: t('formStarter.comment'),
    name: 'comment',
    maxLength: '2000',
  },
  {
    ...emptyField('consent'),
    label: t('formStarter.consent'),
    name: 'consent',
    required: true,
  },
];

// Индексы и номера — те, что приняты в стране языка менеджера.
const _LOCAL_PATTERNS: Readonly<
  Record<Language, readonly { label: MessageKey; value: string }[]>
> = {
  en: [{ label: 'formPattern.zipUs', value: '[0-9]{5}(-[0-9]{4})?' }],
  de: [{ label: 'formPattern.postcodeDe', value: '[0-9]{5}' }],
  ru: [
    { label: 'formPattern.postcodeRu', value: '[0-9]{6}' },
    { label: 'formPattern.innRu', value: '[0-9]{10}|[0-9]{12}' },
  ],
};

/** Шаблоны для поля «Шаблон»: под флагом v скобки и дефис в классе экранируются. */
export var patterns = (
  language: Language = currentLanguage()
): readonly { label: string; value: string }[] =>
  [
    { label: 'formPattern.phone' as const, value: _PHONE },
    { label: 'formPattern.digits' as const, value: '[0-9]+' },
    ..._LOCAL_PATTERNS[language],
  ].map((_) => ({ label: t(_.label), value: _.value }));

/** Виды полей для меню и редактора поля, по группам: ввод, выбор, прочее. */
export var FIELD_KINDS: readonly { id: FieldKind; label: MessageKey }[] = [
  { id: 'text', label: 'formEditor.kindText' },
  { id: 'email', label: 'formEditor.kindEmail' },
  { id: 'tel', label: 'formEditor.kindTel' },
  { id: 'url', label: 'formEditor.kindUrl' },
  { id: 'number', label: 'formEditor.kindNumber' },
  { id: 'date', label: 'formEditor.kindDate' },
  { id: 'time', label: 'formEditor.kindTime' },
  { id: 'datetime-local', label: 'formEditor.kindDateTime' },
  { id: 'range', label: 'formEditor.kindRange' },
  { id: 'textarea', label: 'formEditor.kindTextarea' },
  { id: 'select', label: 'formEditor.kindSelect' },
  { id: 'radio', label: 'formEditor.kindRadio' },
  { id: 'checkbox', label: 'formEditor.kindCheckbox' },
  { id: 'consent', label: 'formEditor.kindConsent' },
  { id: 'file', label: 'formEditor.kindFile' },
  { id: 'hidden', label: 'formEditor.kindHidden' },
];
