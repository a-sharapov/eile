import type { CachedPage, PageCache } from '../application/ports.ts';

// Строки в памяти движка — по два байта на символ; теги и служебное — в запасе бюджета.
const _weight = ({ content }: CachedPage): number =>
  2 *
  ('html' in content
    ? content.html.length
    : content.snapshot.head.length + content.snapshot.body.length);

type Slot = { readonly page: CachedPage; used: boolean };

/**
 * Кэш готовых страниц с бюджетом в байтах, вытеснение — «второй шанс» (CLOCK): чтение только ставит
 * отметку, а не переставляет запись в Map, поэтому попадание в кэш ничего не перестраивает. Бюджет
 * читается при каждой записи: его задаёт настройка сайта (замер: 1000 страниц по 10 КБ — 24 МБ кучи).
 */
export var defineMemoryPageCache = (budget: () => number): PageCache => {
  const slots = new Map<string, Slot>();
  let used = 0;

  const drop = (path: string): void => {
    const slot = slots.get(path);
    void (slot && ((used -= _weight(slot.page)), slots.delete(path)));
  };

  // Старейшая запись с отметкой получает второй шанс в конце очереди, без отметки — уходит.
  const evict = (): void => {
    const oldest = slots.entries().next();
    void (
      used > budget() &&
      !oldest.done &&
      (oldest.value[1].used
        ? ((oldest.value[1].used = false),
          slots.delete(oldest.value[0]),
          slots.set(oldest.value[0], oldest.value[1]))
        : drop(oldest.value[0]),
      evict())
    );
  };

  return {
    get: (path) => {
      const slot = slots.get(path);
      return slot && ((slot.used = true), slot.page);
    },
    set: (path, page) => (
      drop(path),
      slots.set(path, { page, used: false }),
      (used += _weight(page)),
      evict()
    ),
    invalidate: (tags) =>
      [...slots]
        .filter(({ 1: slot }) => tags.some((_) => slot.page.tags.has(_)))
        .forEach(({ 0: path }) => void drop(path)),
    clear: () => (slots.clear(), (used = 0)),
    size: () => ({ pages: slots.size, bytes: used, budget: budget() }),
  };
};
