import { attempt } from '../../../shared/kernel/errors.ts';

/** Что поиску нужно знать о поле страницы, чтобы решить, искать ли по его значению. */
export type FieldMeta = {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: unknown;
};

// Слова есть только в текстовых полях: у выбора, флага, числа, даты и картинки значение — служебное.
const _TEXT_TYPES = new Set(['text', 'richtext']);
// Пути файлов медиатеки и адреса — тоже не слова для поиска.
const _FILE = /\.(?:jpe?g|png|webp|gif|svg|avif|pdf|mp4|webm|mp3)$/i;
const _URL = /^(?:https?:\/\/|\/)\S*$/;

// Без единой буквы значение — служебное: списки id (`175,||145`), коды, числа.
const _wordy = (value: string): boolean =>
  ((_) => /\p{L}/u.test(_) && !_FILE.test(_) && !_URL.test(_))(value.trim());

// Объект или массив JSON, иначе undefined: строка, похожая на JSON, но битая, остаётся текстом.
const _json = (value: string): unknown =>
  /^\s*[[{]/.test(value)
    ? ((parsed) =>
        parsed !== null && typeof parsed === 'object' ? parsed : undefined)(
        attempt(
          () => JSON.parse(value) as unknown,
          () => undefined
        )
      )
    : undefined;

// Строки внутри JSON (строки multiTV из Evo: `{"fieldValue":[{"name":"Камень:","value":"Габбро"}]}`) — без ключей и
// скобок: в отрывке выдачи должен быть текст, а не разметка данных.
const _leaves = (data: unknown): string[] =>
  typeof data === 'string'
    ? [data]
    : data !== null && typeof data === 'object'
      ? Object.values(data).flatMap(_leaves)
      : [];

/**
 * Тексты полей страницы для индекса: только текстовые поля; значение, равное умолчанию поля, пропускается — оно
 * одинаково на всех страницах и о странице ничего не говорит; JSON — строками своих значений; пути файлов и адреса —
 * мимо.
 */
export var fieldTexts = (
  values: Readonly<Record<string, unknown>>,
  fields: readonly FieldMeta[]
): string[] =>
  fields
    .filter((field) => _TEXT_TYPES.has(field.type))
    .flatMap((field) =>
      ((value) =>
        typeof value === 'string' && value !== field.defaultValue
          ? ((data) => (data === undefined ? [value] : _leaves(data)))(
              _json(value)
            )
          : [])(values[field.name])
    )
    .filter(_wordy);
