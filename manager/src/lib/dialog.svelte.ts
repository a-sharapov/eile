export type Ask = {
  readonly title: string;
  readonly body?: string;
  /** Что именно затронет действие: названия страниц, имена файлов. */
  readonly items?: readonly string[];
  readonly confirm: string;
  readonly tone?: 'danger' | 'default';
  /** Поле ввода — например, новый пароль. */
  readonly input?: {
    readonly label: string;
    readonly type: 'password' | 'text';
    readonly minlength?: number;
    /** Начальное значение: например, адрес ссылки, которую правят. */
    readonly value?: string;
    /** Пустое значение допустимо: например, чтобы убрать ссылку. */
    readonly optional?: boolean;
    readonly hint?: string;
    /** Подсказки при вводе (datalist): значение и подпись, например `[~5~]` и «Контакты». */
    readonly suggestions?: readonly Choice[];
    /** Выбор из списка вместо поля ввода. */
    readonly options?: readonly Choice[];
    /** Пояснение к введённому значению под полем: «ссылка на страницу «Контакты»». */
    readonly explain?: (value: string) => string;
    /** Своя проверка перед подтверждением: текст ошибки под полем или null — значение подходит. */
    readonly validate?: (value: string) => string | null;
  };
};

export type Choice = { readonly value: string; readonly label: string };

type Pending = Ask & { readonly resolve: (value: string | null) => void };

export var dialog = $state<{ current: Pending | null }>({ current: null });

const _open = (options: Ask): Promise<string | null> =>
  new Promise((resolve) => (dialog.current = { ...options, resolve }));

/** Открыт модальный диалог: горячие клавиши страницы под ним не срабатывают. */
export var modalOpen = (): boolean =>
  document.querySelector('dialog[open]') !== null;

/** Подтверждение действия: true — подтвердили. */
export var ask = (options: Ask): Promise<boolean> =>
  _open(options).then((_) => _ !== null);

/** Значение из поля диалога или null, если отменили. */
export var askValue = (
  options: Ask & Required<Pick<Ask, 'input'>>
): Promise<string | null> => _open(options);

export var settle = (value: string | null): void => {
  const current = dialog.current;
  dialog.current = null;
  current?.resolve(value);
};
