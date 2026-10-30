import type { ElementName } from './element.ts';

const _first = <T, R>(
  items: readonly T[],
  find: (item: T) => R | null
): R | null =>
  items.reduce<R | null>((found, item) => found ?? find(item), null);

/**
 * Цикл, который замкнёт `start`: `Card → Price → Card`; null, если цикла нет.
 * У ещё не созданных компонентов зависимостей нет: о пропавшем импорте скажет загрузка вида.
 */
export var findImportCycle = (
  start: ElementName,
  startDependencies: readonly ElementName[],
  dependenciesOf: (name: ElementName) => readonly ElementName[]
): ElementName[] | null => {
  const visit =
    (trail: readonly ElementName[]) =>
    (name: ElementName): ElementName[] | null =>
      name === start
        ? [...trail, name]
        : trail.includes(name)
          ? null
          : _first(dependenciesOf(name), visit([...trail, name]));
  return _first(startDependencies, visit([start]));
};
