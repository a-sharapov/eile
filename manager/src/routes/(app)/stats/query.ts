import { goto } from '$app/navigation';
import { page } from '$app/state';

// Фильтры, страница и подвкладка экранов аналитики живут в адресе: ссылкой можно открыть тот же вид, «Назад»
// возвращает прежний. Пустое значение убирает параметр.

export type QueryPatch = Readonly<Record<string, string | null>>;

/** Нынешний адрес с изменёнными параметрами. */
export var withQuery = (patch: QueryPatch, base = page.url.href): URL =>
  Object.entries(patch).reduce(
    (url, { 0: name, 1: value }) => (
      value === null || value === ''
        ? url.searchParams.delete(name)
        : url.searchParams.set(name, value),
      url
    ),
    new URL(base)
  );

/**
 * Сменить параметры адреса. Фильтр заменяет запись истории, шаг по страницам (`push`) — добавляет: «Назад»
 * ведёт на прежнюю страницу. Фокус и прокрутка остаются на месте.
 */
export var setQuery = (patch: QueryPatch, push = false): Promise<void> =>
  goto(withQuery(patch), { replace: !push, reset: false });

/** Только эти параметры, остальные сброшены: смена подвкладки начинает её с чистыми фильтрами. */
export var onlyQuery = (patch: QueryPatch): Promise<void> =>
  goto(withQuery(patch, `${page.url.origin}${page.url.pathname}`), {
    replace: true,
    reset: false,
  });
