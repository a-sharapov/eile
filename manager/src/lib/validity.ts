export type Invalid = {
  /** Вкладка поля (`panel-<id>` у Tabs) или null, если поле не на вкладке. */
  readonly tab: string | null;
  /** Показать ошибку под полем и перевести на него фокус. */
  readonly report: () => void;
};

let _nextMessage = 0;

const _described = (
  control: Element,
  add: string | null,
  drop: string | null
) =>
  control.setAttribute(
    'aria-describedby',
    [
      ...(control.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((_) => _ !== '' && _ !== drop),
      ...(add ? [add] : []),
    ].join(' ')
  );

/**
 * Ошибка у поля вместо «пузыря» браузера. Есть подсказка под полем — она краснеет: она и говорит,
 * что ожидается; нет — под полем появляется сообщение браузера. Поле помечается и получает фокус;
 * первая правка снимает отметку.
 */
export var reportInline = (control: HTMLInputElement): void => {
  const holder = control.closest('label') ?? control.parentElement;
  const hint = holder?.querySelector<HTMLElement>(
    'small:not(.invalid-message)'
  );
  const message =
    hint ??
    Object.assign(document.createElement('small'), {
      className: 'invalid-message',
      id: `invalid-${++_nextMessage}`,
      // Не тот формат — подсказка из title поля («Латиница, цифры и _»), а не общее «в указанном формате».
      textContent:
        control.validity.patternMismatch && control.title
          ? control.title
          : control.validationMessage,
    });
  void (hint || holder?.append(message));
  message.classList.add('field-error');
  control.setAttribute('aria-invalid', 'true');
  void (hint || _described(control, message.id, null));
  control.focus();
  control.addEventListener(
    'input',
    () => (
      control.removeAttribute('aria-invalid'),
      hint
        ? hint.classList.remove('field-error')
        : (message.remove(), _described(control, null, message.id))
    ),
    { once: true }
  );
};

/**
 * Первое неверное поле как ошибка у поля, а не системный «пузырь» браузера: текст — свой по id поля
 * (подсказка, что ожидается), иначе сообщение браузера. Форма — с novalidate, проверяет обработчик.
 */
export var invalidField = (
  form: HTMLFormElement,
  texts: Readonly<Record<string, string>> = {}
): { field: string; text: string } | null =>
  ((control) =>
    control
      ? {
          field: control.id,
          text: texts[control.id] ?? control.validationMessage,
        }
      : null)(
    Array.from(form.elements).find(
      (_) => !(_ as HTMLInputElement).checkValidity()
    ) as HTMLInputElement | undefined
  );

/**
 * Чистая форма после успеха: сброс снимает «тронутость» (иначе пустые обязательные поля горят
 * :user-invalid), потом задаётся состояние. Svelte после сброса синхронизирует bind с DOM в
 * микрозадаче — список при этом встал бы на первый вариант (например, «Администратор»), — поэтому
 * apply идёт следующей микрозадачей и выигрывает.
 */
export var freshForm = (
  form: HTMLFormElement,
  apply: () => void
): Promise<void> => (form.reset(), Promise.resolve().then(apply));

/**
 * Первое неверное поле формы, включая связанные с ней атрибутом form.
 * Браузер сам не покажет поле на скрытой вкладке — её надо открыть, а потом вызвать report.
 */
export var firstInvalid = (form: HTMLFormElement | undefined): Invalid | null =>
  ((control) =>
    control
      ? {
          tab:
            control.closest('[role=tabpanel]')?.id.replace(/^panel-/, '') ??
            null,
          report: () => reportInline(control as HTMLInputElement),
        }
      : null)(
    Array.from(form?.elements ?? []).find(
      (_) => !(_ as HTMLInputElement).checkValidity()
    )
  );
