import type { MessageKey } from './i18n.ts';
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
  /** Варианты по строке: «Подпись» или «значение | Подпись». */
  options: string;
  /** Свой текст ошибки — `data-message`. */
  message: string;
  /** Скрытое поле: источник `data-source` (page.title, query:ref…); пусто — постоянное значение. */
  source: string;
  value: string;
  /** Согласие: текст, `{слова}` в нём — ссылка на страницу политики. */
  consentPage: number | null;
};

/** Блок формы: текст (заголовки, пояснения) или поле; нетронутое поле хранит исходную разметку. */
export type FormBlock =
  | { readonly id: number; readonly kind: 'text'; html: string }
  | {
      readonly id: number;
      readonly kind: 'field';
      field: FieldDraft;
      original: string | null;
    };

let _next = 0;
export var formBlockId = (): number => ++_next;

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
});

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
  `<${tag} class="field${extra}" data-field="${field.kind}"${_a('data-label', field.label.replace(/[{}]/g, ''))}${_a('data-message', field.message)}>`;

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
    `${_open(field)}\n  <label for="${id}">${_text(field.label)}${_star(field)}</label>\n  <select id="${id}" name="${_attr(field.name)}"${field.required ? ' required' : ''}><option value="">${_text(field.placeholder || 'Выберите…')}</option>${optionsOf(
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
    `<input type="hidden" name="${_attr(field.name)}"${field.source ? _a('data-source', field.source) : _a('value', field.value)}${_a('data-label', field.label)}>`,
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

/** Блоки → HTML формы: нетронутые поля — как были, правленые — в каноническом виде. */
export var serializeForm = (blocks: readonly FormBlock[]): string =>
  blocks
    .map((_) =>
      _.kind === 'text' ? _.html.trim() : (_.original ?? fieldHtml(_.field))
    )
    .filter(Boolean)
    .join('\n');

/** Стартовая форма: имя, телефон, комментарий и согласие — правится, а не пишется с нуля. */
export var STARTER: readonly FieldDraft[] = [
  {
    ...emptyField('text'),
    label: 'Имя',
    name: 'name',
    required: true,
    maxLength: '100',
  },
  {
    ...emptyField('tel'),
    label: 'Телефон',
    name: 'phone',
    required: true,
    placeholder: '+7 900 000-00-00',
    pattern: '\\+?[0-9 \\(\\)\\-]{10,}',
    message: 'Нужен телефон: +7 900 000-00-00',
  },
  {
    ...emptyField('textarea'),
    label: 'Комментарий',
    name: 'comment',
    maxLength: '2000',
  },
  {
    ...emptyField('consent'),
    label: 'Согласен на {обработку персональных данных}',
    name: 'consent',
    required: true,
  },
];

/** Шаблоны для поля «Шаблон»: под флагом v скобки и дефис в классе экранируются. */
export var PATTERNS: readonly { label: string; value: string }[] = [
  { label: 'Телефон', value: '\\+?[0-9 \\(\\)\\-]{10,}' },
  { label: 'Только цифры', value: '[0-9]+' },
  { label: 'Почтовый индекс РФ', value: '[0-9]{6}' },
  { label: 'ИНН', value: '[0-9]{10}|[0-9]{12}' },
];

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
  { id: 'hidden', label: 'formEditor.kindHidden' },
];
