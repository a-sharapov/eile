import type { ElementName } from './element.ts';

/** Тип параметра: по нему менеджер выбирает поле формы, а тег контента — запись значения. */
export type PropType = 'string' | 'number' | 'boolean';

export type PropValue = string | number | boolean;

export type PropSignature = {
  readonly name: string;
  readonly type: PropType;
  /** Комментарий над параметром в `$props()`, иначе имя. */
  readonly label: string;
  readonly defaultValue: PropValue | null;
  readonly required: boolean;
  /** Допустимые строки, если тип — объединение литералов: `'info' | 'warning'`. */
  readonly options: readonly PropOption[];
};

/** Вариант с подписью из комментария: `/** Оттенок: note=Заметка, warning=Внимание *\/`. */
export type PropOption = { readonly value: string; readonly label: string };

/** Что компонент обещает вызывающему: описание из `<!-- @component -->` и параметры `$props()`. */
export type ComponentSignature = {
  readonly name: ElementName;
  readonly description: string;
  readonly props: readonly PropSignature[];
};
