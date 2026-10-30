/** Быстрый переход: окно открывается из любого места по Ctrl+K или кнопкой в шапке. */
export var palette = $state<{ open: boolean }>({ open: false });

export var openPalette = (): void => void (palette.open = true);

const _RECENT_KEY = 'cms.recentPages';
const _RECENT_LIMIT = 6;

/** Недавно открытые страницы — первыми в пустом окне перехода. Живут в браузере. */
export var recentPages = (): readonly number[] => {
  try {
    return JSON.parse(localStorage.getItem(_RECENT_KEY) ?? '[]') as number[];
  } catch {
    return [];
  }
};

export var rememberPage = (id: number): void => {
  try {
    localStorage.setItem(
      _RECENT_KEY,
      JSON.stringify(
        [id, ...recentPages().filter((_) => _ !== id)].slice(0, _RECENT_LIMIT)
      )
    );
  } catch {}
};
