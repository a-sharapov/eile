import { resolve } from '$app/paths';

/** Генератор меток с разобранной меткой: из «Незнакомых меток» и «Настройка → Незнакомые». */
export var generatorHref = (sender: string, label: string): string =>
  `${resolve('/(app)/stats/labels')}?${new URLSearchParams({ tab: 'generator', sender, label })}`;
