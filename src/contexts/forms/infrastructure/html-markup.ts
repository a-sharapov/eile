import { HONEYPOT } from '../domain/form.ts';
import type { FormMarkup, FormView } from '../domain/ports.ts';
import { NO_SCRIPT_FIELD, PROOF_FIELD } from '../domain/proof.ts';
import {
  FILE_LIMITS,
  type FieldKind,
  type FieldSpec,
  type FormTexts,
  MIN_TODAY,
  type Option,
  parseLabels,
  parseShowIf,
} from '../domain/schema.ts';
import { ENHANCE_URL } from './enhance.ts';
import styles from './form.css' with { type: 'text' };

// HTMLRewriter отдаёт атрибуты и текст сырыми: сущности раскрываем сами.
const _ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export var decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) =>
    entity.startsWith('#x') || entity.startsWith('#X')
      ? String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
      : entity.startsWith('#')
        ? String.fromCodePoint(Number(entity.slice(1)))
        : (_ENTITIES[entity.toLowerCase()] ?? match)
  );

// setAttribute экранирует только кавычку: амперсанд и `<` — до записи.
const _attr = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

const _clean = (text: string): string =>
  decodeEntities(text).replace(/\s+/g, ' ').trim();

type Control = {
  readonly tag: 'input' | 'select' | 'textarea';
  readonly attributes: Readonly<Record<string, string>>;
  readonly wrapper: Wrapper | null;
  readonly label: Box | null;
  readonly options: Option[];
};

type Wrapper = {
  readonly kind: string;
  label: string;
  readonly message: string;
  readonly showIf: string;
};
type Box = { text: string; readonly target: string };

// Кнопки и пароли — не поля заявки.
const _SKIPPED = new Set(['submit', 'button', 'reset', 'image', 'password']);

const _INPUT_KINDS: Readonly<Record<string, FieldKind>> = {
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
  time: 'time',
  'datetime-local': 'datetime-local',
  range: 'range',
  hidden: 'hidden',
  file: 'file',
};

// Предел файла из data-max-size в мегабайтах; больше потолка не бывает, иначе заявка — склад.
const _maxSize = (value: string | undefined): number | null =>
  value !== undefined && /^\d+(?:\.\d+)?$/.test(value)
    ? Math.min(FILE_LIMITS.ceiling, Math.round(Number(value) * 1024 * 1024))
    : null;

const _number = (value: string | undefined): number | null =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : null;

/** Элементы формы в порядке исходника: поля, их подписи и варианты. */
const _scan = (source: string) => {
  const controls: Control[] = [];
  const labelsFor = new Map<string, string>();
  const wrappers: Wrapper[] = [];
  const boxes: Box[] = [];
  let select: Control | null = null;
  let option: { value: string | null; text: string } | null = null;
  let legend: Wrapper | null = null;

  new HTMLRewriter()
    .on('[data-field]', {
      element: (el) => {
        const wrapper: Wrapper = {
          kind: el.getAttribute('data-field') ?? '',
          label: _clean(el.getAttribute('data-label') ?? ''),
          message: _clean(el.getAttribute('data-message') ?? ''),
          showIf: decodeEntities(el.getAttribute('data-show-if') ?? ''),
        };
        wrappers.push(wrapper);
        el.onEndTag(() => void wrappers.pop());
      },
    })
    .on('legend', {
      element: (el) => {
        legend = wrappers.at(-1) ?? null;
        el.onEndTag(() => void (legend = null));
      },
      text: (chunk) =>
        void (
          legend &&
          !legend.label &&
          (legend.label = _clean(`${legend.label}${chunk.text}`))
        ),
    })
    .on('label', {
      element: (el) => {
        const box: Box = { text: '', target: el.getAttribute('for') ?? '' };
        boxes.push(box);
        el.onEndTag(
          () =>
            void (boxes.pop(),
            box.target && labelsFor.set(box.target, _clean(box.text)))
        );
      },
      text: (chunk) =>
        void (boxes.at(-1) && (boxes.at(-1)!.text += chunk.text)),
    })
    .on('input, select, textarea', {
      element: (el) => {
        const control: Control = {
          tag: el.tagName as Control['tag'],
          attributes: Object.fromEntries(
            [...el.attributes].map(({ 0: name, 1: value }) => [
              name,
              decodeEntities(value),
            ])
          ),
          wrapper: wrappers.at(-1) ?? null,
          label: boxes.at(-1) ?? null,
          options: [],
        };
        controls.push(control);
        void (
          control.tag === 'select' &&
          ((select = control), el.onEndTag(() => void (select = null)))
        );
      },
    })
    .on('option', {
      element: (el) => {
        option = { value: el.getAttribute('value'), text: '' };
        el.onEndTag(
          () =>
            void (select &&
              option &&
              select.options.push({
                value: decodeEntities(option.value ?? _clean(option.text)),
                label: _clean(option.text),
              }),
            (option = null))
        );
      },
      text: (chunk) => void (option && (option.text += chunk.text)),
    })
    .transform(source);

  return { controls, labelsFor };
};

const _labelOf = (
  control: Control,
  labelsFor: ReadonlyMap<string, string>
): string =>
  control.wrapper?.label ||
  control.attributes['data-label'] ||
  labelsFor.get(control.attributes.id ?? '') ||
  (control.label ? _clean(control.label.text) : '') ||
  control.attributes['aria-label'] ||
  control.attributes.placeholder ||
  control.attributes.name ||
  '';

// Вариант галочки или переключателя: значение и подпись из окружающего <label>.
const _choice = (
  control: Control,
  labelsFor: ReadonlyMap<string, string>
): Option => ({
  value: control.attributes.value ?? 'on',
  label:
    (control.label ? _clean(control.label.text) : '') ||
    labelsFor.get(control.attributes.id ?? '') ||
    control.attributes.value ||
    'on',
});

const _kindOf = (first: Control, group: readonly Control[]): FieldKind => {
  const type = (first.attributes.type ?? 'text').toLowerCase();
  const wanted = first.wrapper?.kind ?? '';
  return first.tag === 'select'
    ? 'select'
    : first.tag === 'textarea'
      ? 'textarea'
      : type === 'radio'
        ? 'radio'
        : type === 'checkbox'
          ? wanted === 'consent' ||
            (group.length === 1 && wanted !== 'checkbox')
            ? 'consent'
            : 'checkbox'
          : (_INPUT_KINDS[type] ?? 'text');
};

const _field = (
  group: readonly Control[],
  labelsFor: ReadonlyMap<string, string>
): FieldSpec => {
  const first = group[0]!;
  const kind = _kindOf(first, group);
  const attributes = first.attributes;
  const labels = attributes['data-labels']?.trim() || null;
  return {
    name: attributes.name!,
    kind,
    label:
      kind === 'radio' || kind === 'checkbox'
        ? first.wrapper?.label || attributes.name!
        : _labelOf(first, labelsFor),
    required: group.some((_) => 'required' in _.attributes),
    pattern: attributes.pattern ?? null,
    // data-min="today" у даты: «не раньше сегодня» считается при каждой проверке, а не при сохранении формы.
    min:
      kind === 'date' && attributes['data-min'] === 'today'
        ? MIN_TODAY
        : (attributes.min ?? null),
    max: attributes.max ?? null,
    step: attributes.step ?? null,
    minLength: _number(attributes.minlength),
    maxLength: _number(attributes.maxlength),
    multiple: kind === 'checkbox' || 'multiple' in attributes,
    options:
      kind === 'select'
        ? first.options.filter((_) => _.value !== '')
        : kind === 'radio' || kind === 'checkbox' || kind === 'consent'
          ? group.map((_) => _choice(_, labelsFor))
          : kind === 'hidden'
            ? parseLabels(labels ?? '')
            : [],
    source: attributes['data-source'] ?? null,
    labels,
    message: first.wrapper?.message || attributes['data-message'] || null,
    showIf: parseShowIf(
      first.wrapper?.showIf || attributes['data-show-if'] || ''
    ),
    accept:
      kind === 'file'
        ? (attributes.accept ?? '')
            .split(',')
            .map((_) => _.trim().toLowerCase())
            .filter(Boolean)
        : [],
    maxSize: kind === 'file' ? _maxSize(attributes['data-max-size']) : null,
  };
};

/** Поля формы по её HTML: одно имя — одно поле, группа галочек или переключателей — с вариантами. */
export var fieldsOf = (source: string): FieldSpec[] =>
  ((scanned) =>
    [
      ...scanned.controls
        .filter(
          (_) =>
            _.attributes.name &&
            !_SKIPPED.has((_.attributes.type ?? '').toLowerCase())
        )
        .reduce(
          (groups, control) =>
            groups.set(control.attributes.name!, [
              ...(groups.get(control.attributes.name!) ?? []),
              control,
            ]),
          new Map<string, Control[]>()
        )
        .values(),
    ].map((_) => _field(_, scanned.labelsFor)))(_scan(source));

const _errorHtml = (prefix: string, name: string, text: string): string =>
  `<p class="field-error" id="${Bun.escapeHTML(`${prefix}err-${name}`)}">${Bun.escapeHTML(text)}</p>`;

const _hidden = (name: string, value: string): string =>
  `<input type="hidden" name="${Bun.escapeHTML(name)}" value="${Bun.escapeHTML(value)}">`;

// Подсказка поля (`.hint` в обёртке [data-field]) связана с ним всегда, а не только при ошибке: экранный
// диктор читает её вместе с полем. Подсказка обычно стоит после поля, а HTMLRewriter идёт потоком, поэтому
// id подсказки каждой обёртки (по порядку обёрток) находит первый проход.
const _hintsOf = (
  source: string,
  prefix: string
): readonly (string | null)[] => {
  const found: (string | null)[] = [];
  const open: { index: number; name: string | null; id: string | null }[] = [];
  new HTMLRewriter()
    .on('[data-field]', {
      element: (el) => {
        open.push({ index: found.length, name: null, id: null });
        found.push(null);
        el.onEndTag(() => {
          const done = open.pop()!;
          found[done.index] = done.name ? done.id : null;
        });
      },
    })
    .on('input[name], select[name], textarea[name]', {
      element: (el) => {
        const wrapper = open.at(-1);
        const type = (el.getAttribute('type') ?? '').toLowerCase();
        void (
          wrapper &&
          wrapper.name === null &&
          type !== 'hidden' &&
          (wrapper.name = decodeEntities(el.getAttribute('name')!))
        );
      },
    })
    .on('.hint', {
      element: (el) => {
        const wrapper = open.at(-1);
        void (
          wrapper &&
          wrapper.id === null &&
          (wrapper.id = el.getAttribute('id')
            ? prefix + el.getAttribute('id')
            : `${prefix}hint-${found.length - 1}`)
        );
      },
    })
    .transform(source);
  return found;
};

// Исходник с состоянием: значения после неудачной отправки, ошибки у полей, скрытые поля, id с префиксом.
const _filled = (view: FormView, prefix: string): string => {
  const flash = Object.keys(view.values).length > 0;
  const hints = _hintsOf(view.source, prefix);
  let wrapperCount = 0;
  const wrappers: {
    names: Set<string>;
    hint: string | null;
    placed: boolean;
  }[] = [];
  // Выбранные значения текущего <select> при повторном показе формы.
  let select: readonly string[] | null = null;
  const postedOf = (name: string): readonly string[] => view.values[name] ?? [];
  const describe = (el: HTMLRewriterTypes.Element, name: string): void =>
    ((hint, error) => {
      void (error && el.setAttribute('aria-invalid', 'true'));
      const ids = [el.getAttribute('aria-describedby'), hint, error].filter(
        Boolean
      );
      void (
        ids.length > 0 && el.setAttribute('aria-describedby', ids.join(' '))
      );
      void (
        error &&
        wrappers.length === 0 &&
        el.after(_errorHtml(prefix, name, view.errors[name]!), { html: true })
      );
    })(
      (el.getAttribute('type') ?? '').toLowerCase() === 'hidden'
        ? null
        : (wrappers.at(-1)?.hint ?? null),
      view.errors[name] ? `${prefix}err-${name}` : null
    );
  return (
    new HTMLRewriter()
      .on('form', { element: (el) => void el.removeAndKeepContent() })
      // Значение атрибута сырое — дописываем префикс как есть, без второго экранирования.
      .on('[id]', {
        element: (el) =>
          void el.setAttribute('id', prefix + el.getAttribute('id')),
      })
      .on('label[for]', {
        element: (el) =>
          void el.setAttribute('for', prefix + el.getAttribute('for')),
      })
      .on('[data-field]', {
        element: (el) => {
          const wrapper = {
            names: new Set<string>(),
            hint: hints[wrapperCount++] ?? null,
            placed: false,
          };
          wrappers.push(wrapper);
          el.onEndTag((end) => {
            wrappers.pop();
            [...wrapper.names]
              .filter((_) => view.errors[_])
              .forEach(
                (_) =>
                  void end.before(_errorHtml(prefix, _, view.errors[_]!), {
                    html: true,
                  })
              );
          });
        },
      })
      // Первая подсказка обёртки получает id, на который ссылаются её поля (свой id уже с префиксом).
      .on('.hint', {
        element: (el) => {
          const wrapper = wrappers.at(-1);
          void (
            wrapper?.hint &&
            !wrapper.placed &&
            ((wrapper.placed = true),
            el.getAttribute('id') || el.setAttribute('id', wrapper.hint))
          );
        },
      })
      .on('input[name], select[name], textarea[name]', {
        element: (el) => {
          const name = decodeEntities(el.getAttribute('name')!);
          const type = (el.getAttribute('type') ?? '').toLowerCase();
          const source = el.getAttribute('data-source');
          wrappers.at(-1)?.names.add(name);
          describe(el, name);
          void (
            type === 'hidden' &&
            source &&
            el.setAttribute('value', _attr(view.hidden[source] ?? ''))
          );
          void (
            flash &&
            (type === 'checkbox' || type === 'radio'
              ? postedOf(name).includes(
                  decodeEntities(el.getAttribute('value') ?? 'on')
                )
                ? el.setAttribute('checked', '')
                : el.removeAttribute('checked')
              : el.tagName === 'textarea'
                ? el.setInnerContent(postedOf(name)[0] ?? '')
                : el.tagName === 'input' &&
                  type !== 'hidden' &&
                  type !== 'file' &&
                  el.setAttribute('value', _attr(postedOf(name)[0] ?? '')),
            el.tagName === 'select' &&
              ((select = postedOf(name)),
              el.onEndTag(() => void (select = null))))
          );
        },
      })
      .on('option[value]', {
        element: (el) =>
          void (
            select &&
            (select.includes(decodeEntities(el.getAttribute('value')!))
              ? el.setAttribute('selected', '')
              : el.removeAttribute('selected'))
          ),
      })
      .transform(view.source)
  );
};

// Файлы уходят только в multipart: без него браузер пришлёт одно имя файла.
const _hasFiles = (source: string): boolean =>
  /<input\b[^>]*\btype\s*=\s*["']?file\b/i.test(source);

const _hasSteps = (source: string): boolean => /\bdata-step\s*=/i.test(source);

// Тексты для скрипта — атрибутами формы: ошибки отправки всегда, кнопки шагов — если шаги есть, задача
// защиты и её строка — если защита включена.
const _data = (
  texts: FormTexts,
  steps: boolean,
  proof: string | null
): string =>
  [
    ['failed', texts.failed],
    ['offline', texts.offline],
    ['too-large', texts.tooLarge],
    ...(steps
      ? [
          ['next', texts.next],
          ['back', texts.back],
          ['progress', texts.progress],
        ]
      : []),
    ...(proof === null
      ? []
      : [
          ['proof', proof],
          ['proof-working', texts.proofWorking],
          ['proof-done', texts.proofDone],
        ]),
  ]
    .map(({ 0: name, 1: value }) => ` data-${name}="${Bun.escapeHTML(value!)}"`)
    .join('');

// Стили форм встраиваются в каждую страницу с формой: без комментариев — короче и без чужого языка.
const _STYLES = (styles as unknown as string).replace(/\/\*[\s\S]*?\*\//g, '');

// Строка защиты — в конце формы, место под неё занято сразу: текст появится без сдвига вёрстки. Без JS
// вместо неё — честная строка и метка `_nojs`, которую браузер со скриптами не пришлёт.
const _proofStatus = (view: FormView): string =>
  view.proof === null
    ? ''
    : `<p class="cms-form-proof" role="status" aria-live="polite"><noscript>${_hidden(NO_SCRIPT_FIELD, '1')}${Bun.escapeHTML(view.texts.proofNoScript)}</noscript></p>`;

const _hasSubmit = (source: string): boolean =>
  /<button\b(?![^>]*\btype\s*=\s*["']?(?:button|reset)\b)|<input\b[^>]*\btype\s*=\s*["']?submit\b/i.test(
    source
  );

/** Разметка форм на HTMLRewriter: поля — по атрибутам HTML5, вывод — исходник с состоянием. */
export var htmlMarkup: FormMarkup = {
  fields: fieldsOf,
  render: (view) => {
    const body = _filled(view, `${view.name}-`);
    return [
      `<form class="cms-form" id="form-${Bun.escapeHTML(view.name)}" data-cms-form="${Bun.escapeHTML(view.name)}" data-goal="${Bun.escapeHTML(view.goal)}" method="post" action="${Bun.escapeHTML(view.action)}"${_hasFiles(view.source) ? ' enctype="multipart/form-data"' : ''}${_data(view.texts, _hasSteps(view.source), view.proof)}>`,
      _hidden('_page', view.pageId === null ? '' : String(view.pageId)),
      _hidden('_stamp', view.stamp.token),
      _hidden('_iat', String(view.stamp.iat)),
      _hidden('_utm', view.utm),
      _hidden('_ref', view.referrer),
      view.proof === null ? '' : _hidden(PROOF_FIELD, ''),
      `<div class="cms-trap" aria-hidden="true"><label>${Bun.escapeHTML(view.texts.trap)} <input name="${HONEYPOT}" tabindex="-1" autocomplete="off"></label></div>`,
      view.message
        ? `<p class="cms-form-message" role="alert">${Bun.escapeHTML(view.message)}</p>`
        : '',
      body,
      _hasSubmit(view.source)
        ? ''
        : `<div class="field field-submit"><button type="submit">${Bun.escapeHTML(view.submitLabel)}</button></div>`,
      _proofStatus(view),
      '</form>',
    ].join('');
  },
  sent: (name, text) =>
    `<div class="cms-form cms-form-sent" id="form-${Bun.escapeHTML(name)}" role="status"><p>${Bun.escapeHTML(text)}</p></div>`,
  head: `<style data-cms-form>${_STYLES}</style><script type="module" src="${ENHANCE_URL}"></script>`,
};
