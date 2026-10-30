// Разметка полей формы — та же, что пишет редактор форм менеджера (manager/src/lib/form-blocks.ts):
// форма каркаса открывается там блоками, а не голым HTML.

export type FieldRules = {
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly pattern?: string;
  readonly maxLength?: number;
  /** Свой текст ошибки. */
  readonly message?: string;
  readonly hint?: string;
};

const _attr = (name: string, value: string | number | undefined): string =>
  value === undefined || value === ''
    ? ''
    : ` ${name}="${Bun.escapeHTML(String(value))}"`;

const _rules = (rules: FieldRules): string =>
  [
    rules.required ? ' required' : '',
    _attr('placeholder', rules.placeholder),
    _attr('pattern', rules.pattern),
    _attr('maxlength', rules.maxLength),
  ].join('');

const _star = (rules: FieldRules): string =>
  rules.required ? ' <span class="required" aria-hidden="true">*</span>' : '';

const _hint = (rules: FieldRules): string =>
  rules.hint
    ? `\n  <small class="hint">${Bun.escapeHTML(rules.hint)}</small>`
    : '';

const _open = (kind: string, label: string, rules: FieldRules, extra = '') =>
  `<div class="field${extra}" data-field="${kind}"${_attr('data-label', label)}${_attr('data-message', rules.message)}>`;

const _label = (name: string, label: string, rules: FieldRules): string =>
  `<label for="f-${name}">${Bun.escapeHTML(label)}${_star(rules)}</label>`;

export var input = (
  kind: 'text' | 'email' | 'tel' | 'url' | 'number' | 'date',
  name: string,
  label: string,
  rules: FieldRules = {}
): string =>
  `${_open(kind, label, rules)}\n  ${_label(name, label, rules)}\n  <input id="f-${name}" name="${name}" type="${kind}"${_rules(rules)}>${_hint(rules)}\n</div>`;

export var textarea = (
  name: string,
  label: string,
  rules: FieldRules = {}
): string =>
  `${_open('textarea', label, rules)}\n  ${_label(name, label, rules)}\n  <textarea id="f-${name}" name="${name}" rows="4"${_rules(rules)}></textarea>${_hint(rules)}\n</div>`;

export var select = (
  name: string,
  label: string,
  options: readonly string[],
  rules: FieldRules = {}
): string =>
  `${_open('select', label, rules)}\n  ${_label(name, label, rules)}\n  <select id="f-${name}" name="${name}"${rules.required ? ' required' : ''}><option value="">${Bun.escapeHTML(rules.placeholder ?? 'Выберите…')}</option>${options
    .map(
      (_) =>
        `<option value="${Bun.escapeHTML(_)}">${Bun.escapeHTML(_)}</option>`
    )
    .join('')}</select>${_hint(rules)}\n</div>`;

/** Согласие: `{слова}` в подписи — ссылка на страницу `@{key}` каркаса. */
export var consent = (name: string, label: string, page: string): string =>
  `${_open('consent', label.replace(/[{}]/g, ''), {}, ' field-consent')}\n  <label><input type="checkbox" name="${name}" value="yes" required> ${Bun.escapeHTML(
    label
  ).replace(
    /\{([^}]+)\}/,
    (_match, words: string) =>
      `<a href="[~@{${page}}~]" target="_blank">${words}</a>`
  )}</label>\n</div>`;

/** Скрытое поле: значение — из источника (`page.title`, `utm`…), сервер подставит сам. */
export var hidden = (name: string, label: string, source: string): string =>
  `<input type="hidden" name="${name}" data-source="${source}"${_attr('data-label', label)}>`;

/** Поля → исходник формы. */
export var formSource = (...fields: readonly string[]): string =>
  fields.join('\n');
