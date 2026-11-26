// Ошибки полей формы: ошибка висит, пока значение её поля то же, что при проверке; поле изменили — она
// исчезает сразу и не возвращается до следующей отправки. Вызывать при создании компонента: нужен $effect.

type _Shown = { readonly message: string; readonly stamp: string };

export type FieldErrors = {
  /** Видимые ошибки: поле → текст. */
  readonly current: Readonly<Record<string, string>>;
  /** Ошибки проверки или отказа сервера: прежние заменяются. */
  readonly show: (found: Readonly<Record<string, string>>) => void;
  readonly clear: () => void;
};

/** `read` — значение поля, по которому видно, что его изменили (для составного поля — все его части). */
export var defineFieldErrors = (
  read: (field: string) => unknown
): FieldErrors => {
  let shown = $state<Record<string, _Shown>>({});
  const stamp = (field: string): string => JSON.stringify(read(field) ?? null);
  const kept = (all: Readonly<Record<string, _Shown>>) =>
    Object.entries(all).filter(
      ({ 0: field, 1: error }) => error.stamp === stamp(field)
    );
  const current = $derived(
    Object.fromEntries(
      kept(shown).map(({ 0: field, 1: error }) => [field, error.message])
    )
  );
  // Изменённое поле теряет ошибку насовсем: вернуть прежнее значение — не вернуть ошибку.
  $effect(() => {
    const left = kept(shown);
    void (
      left.length < Object.keys(shown).length &&
      (shown = Object.fromEntries(left))
    );
  });
  return {
    get current() {
      return current;
    },
    show: (found) =>
      void (shown = Object.fromEntries(
        Object.entries(found).map(({ 0: field, 1: message }) => [
          field,
          { message, stamp: stamp(field) },
        ])
      )),
    clear: () => void (shown = {}),
  };
};
