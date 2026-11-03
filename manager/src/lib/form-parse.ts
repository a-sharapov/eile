import {
  emptyField,
  type FieldDraft,
  type FormBlock,
  formBlockId,
  labelLines,
} from './form-blocks.ts';
import type { FieldKind } from './types.ts';

// Разбор HTML формы на блоки — в браузере, через DOM: сервер разбирает ту же разметку HTMLRewriter.

const _text = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const _attrOf = (element: Element | null, name: string): string =>
  element?.getAttribute(name) ?? '';

const _labelText = (element: Element | null): string =>
  (element?.textContent ?? '')
    .replace(/\*\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

// Текст согласия обратно: ссылка — в фигурных скобках, как её пишут в редакторе.
const _consentText = (label: Element | null): string =>
  ((copy) => (
    copy
      ?.querySelectorAll('a')
      .forEach((_) => void (_.textContent = `{${_.textContent}}`)),
    _labelText(copy)
  ))(label?.cloneNode(true) as Element | null);

// Поле из разметки: то, что умеет форма поля; остальное остаётся в `original`.
const _draftOf = (wrapper: Element): FieldDraft => {
  const kind = (wrapper.getAttribute('data-field') || 'text') as FieldKind;
  const controls = [...wrapper.querySelectorAll('input, select, textarea')];
  const control = controls[0] ?? null;
  const consentLink = wrapper.querySelector('a[href^="[~"]');
  return {
    ...emptyField(kind),
    label:
      kind === 'consent'
        ? _consentText(wrapper.querySelector('label'))
        : wrapper.getAttribute('data-label') ||
          _labelText(wrapper.querySelector('legend, label')),
    name: _attrOf(control, 'name'),
    required: controls.some((_) => _.hasAttribute('required')),
    placeholder:
      control?.tagName === 'SELECT'
        ? (control.querySelector('option[value=""]')?.textContent ?? '')
        : _attrOf(control, 'placeholder'),
    hint: wrapper.querySelector('.hint')?.textContent?.trim() ?? '',
    pattern: _attrOf(control, 'pattern'),
    min: _attrOf(control, 'min'),
    max: _attrOf(control, 'max'),
    step: _attrOf(control, 'step'),
    maxLength: _attrOf(control, 'maxlength'),
    message: wrapper.getAttribute('data-message') ?? '',
    options:
      kind === 'select'
        ? [...(control?.querySelectorAll('option') ?? [])]
            .filter((_) => _.value !== '')
            .map((_) =>
              _.value === _.textContent
                ? _.value
                : `${_.value} | ${_.textContent}`
            )
            .join('\n')
        : kind === 'radio' || kind === 'checkbox'
          ? controls
              .map((input) =>
                ((label) =>
                  label === (input as HTMLInputElement).value
                    ? label
                    : `${(input as HTMLInputElement).value} | ${label}`)(
                  _labelText(input.closest('label'))
                )
              )
              .join('\n')
          : '',
    consentPage: consentLink
      ? Number(
          /\[~(\d+)~\]/.exec(consentLink.getAttribute('href') ?? '')?.[1]
        ) || null
      : null,
    ..._showIf(wrapper.getAttribute('data-show-if') ?? ''),
    accept: kind === 'file' ? _attrOf(control, 'accept') : '',
    maxSize: kind === 'file' ? _attrOf(control, 'data-max-size') : '',
    multiple: kind === 'file' && (control?.hasAttribute('multiple') ?? false),
  };
};

// `поле=а|б` → поле и значения через запятую, как их пишут в редакторе.
const _showIf = (raw: string): Pick<FieldDraft, 'showField' | 'showValues'> =>
  ((at) =>
    at < 0
      ? { showField: raw.trim(), showValues: '' }
      : {
          showField: raw.slice(0, at).trim(),
          showValues: raw
            .slice(at + 1)
            .split('|')
            .map((_) => _.trim())
            .filter(Boolean)
            .join(', '),
        })(raw.indexOf('='));

const _hiddenOf = (input: Element): FieldDraft => ({
  ...emptyField('hidden'),
  name: _attrOf(input, 'name'),
  label: _attrOf(input, 'data-label'),
  source: _attrOf(input, 'data-source'),
  value: _attrOf(input, 'value'),
  options: labelLines(_attrOf(input, 'data-labels')),
});

// Подряд идущий текст и неполевая разметка — один текстовый блок.
const _merge = (blocks: FormBlock[], html: string): FormBlock[] =>
  ((last) =>
    last?.kind === 'text'
      ? [...blocks.slice(0, -1), { ...last, html: `${last.html}${html}` }]
      : [...blocks, { id: formBlockId(), kind: 'text', html }])(blocks.at(-1));

// Узлы по порядку: шаг — блок шага и его содержимое без <legend>, поле — блоком, остальное — текстом.
const _nodes = (nodes: readonly ChildNode[], start: FormBlock[]): FormBlock[] =>
  nodes.reduce<FormBlock[]>((blocks, node) => {
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    return element?.matches('fieldset[data-step]')
      ? _nodes(
          [...element.childNodes].filter(
            (_) => !(_ instanceof Element && _.tagName === 'LEGEND')
          ),
          [
            ...blocks,
            {
              id: formBlockId(),
              kind: 'step',
              title:
                element.getAttribute('data-step') ||
                _labelText(element.querySelector(':scope > legend')),
            },
          ]
        )
      : _node(blocks, node, element);
  }, start);

const _node = (
  blocks: FormBlock[],
  node: ChildNode,
  element: Element | null
): FormBlock[] => {
  const field = element?.hasAttribute('data-field')
    ? _draftOf(element)
    : element?.matches('input[type="hidden"]')
      ? _hiddenOf(element)
      : null;
  return field
    ? [
        ...blocks,
        {
          id: formBlockId(),
          kind: 'field',
          field,
          original: element!.outerHTML,
        },
      ]
    : node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
      ? blocks
      : _merge(
          blocks,
          element ? element.outerHTML : _text(node.textContent ?? '')
        );
};

/** HTML формы → блоки: обёртки data-field и скрытые поля — полями, шаги — блоком шага, остальное — текстом. */
export var parseForm = (source: string): FormBlock[] => {
  const template = document.createElement('template');
  template.innerHTML = source;
  return [...template.content.childNodes].reduce<{
    blocks: FormBlock[];
    inStep: boolean;
  }>(
    (acc, node) =>
      ((step, blank) =>
        step || blank
          ? { blocks: _nodes([node], acc.blocks), inStep: acc.inStep || step }
          : {
              // Что стоит после шагов, не входит ни в один: перед ним — конец шагов.
              blocks: _nodes(
                [node],
                acc.inStep
                  ? [
                      ...acc.blocks,
                      { id: formBlockId(), kind: 'step', title: '' },
                    ]
                  : acc.blocks
              ),
              inStep: false,
            })(
        node instanceof Element && node.matches('fieldset[data-step]'),
        node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()
      ),
    { blocks: [], inStep: false }
  ).blocks;
};
