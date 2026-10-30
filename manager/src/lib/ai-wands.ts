import { type AiTarget, askAi } from './ai.svelte.ts';
import { t } from './i18n.ts';
import { icons } from './icons.ts';
import { notify } from './notices.svelte.ts';

type Field = HTMLInputElement | HTMLTextAreaElement;

// Палочка — у текстовых полей с подписью и у ячеек таблиц (переводы, свои настройки). Не у поиска,
// паролей, адресов страниц и полей внутри окон: там генерировать нечего или некуда.
const _FIELDS =
  'input:not([type]), input[type="text"], textarea:not(#ai-request)';
const _SKIP = 'dialog, .palette, .ai-prompt, [data-ai="off"]';

const _eligible = (field: Field): boolean =>
  !field.readOnly &&
  !field.disabled &&
  !field.closest(_SKIP) &&
  (field.closest('label') !== null || field.closest('td') !== null);

/** Подпись поля без подсказки, звёздочки и самой палочки: «Заголовок», «Описание сайта». */
const _caption = (field: Field): string =>
  ((label) =>
    label
      ? [...label.childNodes]
          .filter(
            (_) =>
              _.nodeType === Node.TEXT_NODE ||
              (_ instanceof HTMLElement &&
                !_.matches(
                  'small, input, textarea, select, button, .ai-wand, .required'
                ))
          )
          .map((_) => _.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .replace(/\*/g, '')
          .trim()
      : (field.getAttribute('aria-label') ?? ''))(field.closest('label'));

const _hint = (field: Field): string =>
  (
    field.closest('label')?.querySelector('small:not(.invalid-message)')
      ?.textContent ?? ''
  ).trim();

export var targetOf = (field: Field): AiTarget => ({
  kind: field instanceof HTMLTextAreaElement ? 'longtext' : 'text',
  label: _caption(field) || t('ai.field'),
  hint: _hint(field),
  value: field.value,
  maxLength: field.maxLength > 0 ? field.maxLength : null,
  pattern: field.getAttribute('pattern') ?? '',
});

// Значение — как набранное: input для привязок Svelte, change для полей, что сохраняются сразу.
const _write = (field: Field, value: string): void => {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
};

/** Окошко ИИ для поля; вставка — с «Вернуть» в уведомлении. */
export var askAiFor = (field: Field, anchor: HTMLElement = field): void =>
  askAi({
    target: targetOf(field),
    anchor,
    apply: (text) => {
      const previous = field.value;
      _write(field, text);
      field.focus();
      notify(t('ai.inserted'), 'ok', {
        label: t('common.undo'),
        run: () => _write(field, previous),
      });
    },
  });

const _wand = (field: Field): HTMLButtonElement =>
  Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'ai-wand',
    tabIndex: -1,
    title: `${t('ai.title')} (Alt+I)`,
    innerHTML: icons.wand,
    onclick: (event: MouseEvent) => (
      event.preventDefault(),
      askAiFor(field, event.currentTarget as HTMLElement)
    ),
  });

const _HINT_ID = 'ai-shortcut-hint';

// Подсказка о клавише — описание поля для читалки; сама палочка от читалки скрыта.
const _describe = (field: Field): void =>
  ((described) =>
    void (
      described.includes(_HINT_ID) ||
      field.setAttribute('aria-describedby', [...described, _HINT_ID].join(' '))
    ))(
    (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  );

const _decorate = (root: HTMLElement): void =>
  root
    .querySelectorAll<Field>(_FIELDS)
    .forEach(
      (field) =>
        void (
          _eligible(field) &&
          !field.dataset.aiWand &&
          ((holder) => (
            (field.dataset.aiWand = '1'),
            holder.append(Object.assign(_wand(field), { ariaHidden: 'true' })),
            _describe(field)
          ))(field.closest('label') ?? field.closest('td')!)
        )
    );

/**
 * Палочки «Сгенерировать с ИИ» у полей раздела — и у тех, что появятся позже. Alt+I в поле открывает
 * то же окошко с клавиатуры. Возвращает уборку: палочки исчезают, если ИИ отключили.
 */
export var aiWands = (root: HTMLElement): (() => void) => {
  const hint = Object.assign(document.createElement('span'), {
    id: _HINT_ID,
    className: 'sr-only',
    textContent: t('ai.shortcutHint'),
  });
  document.body.append(hint);
  const observer = new MutationObserver(() => _decorate(root));
  const onKey = (event: KeyboardEvent) =>
    void (
      event.altKey &&
      event.code === 'KeyI' &&
      event.target instanceof HTMLElement &&
      event.target.matches(_FIELDS) &&
      _eligible(event.target as Field) &&
      (event.preventDefault(), askAiFor(event.target as Field))
    );
  _decorate(root);
  observer.observe(root, { subtree: true, childList: true });
  root.addEventListener('keydown', onKey);
  return () => {
    observer.disconnect();
    root.removeEventListener('keydown', onKey);
    hint.remove();
    root.querySelectorAll('.ai-wand').forEach((_) => void _.remove());
    root
      .querySelectorAll<Field>('[data-ai-wand]')
      .forEach((_) => void delete _.dataset.aiWand);
  };
};
