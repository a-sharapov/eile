import { api } from './api.ts';
import {
  currentLanguage,
  FALLBACK_LANGUAGE,
  isLanguage,
  type Language,
  loadLanguage,
  type MessageKey,
} from './i18n.ts';
import type { Appearance } from './types.ts';

// Как на сервере (src/contexts/manager/domain/appearance.ts): синий MODX, зелёный — по триаде.
export var DEFAULT_APPEARANCE: Appearance = {
  accent: '#2f5c96',
  scheme: 'system',
  language: null,
};

/** Готовые акценты: оттенки, у которых триада даёт различимые цвета действий и отметок. */
export var PRESETS: readonly {
  readonly label: MessageKey;
  readonly accent: string;
}[] = [
  { label: 'appearance.presetModx', accent: '#2f5c96' },
  { label: 'appearance.presetTeal', accent: '#16807a' },
  { label: 'appearance.presetGreen', accent: '#3f8a3a' },
  { label: 'appearance.presetAmber', accent: '#a86a12' },
  { label: 'appearance.presetTerracotta', accent: '#b5492c' },
  { label: 'appearance.presetRaspberry', accent: '#b0305f' },
  { label: 'appearance.presetViolet', accent: '#6d4bb3' },
  { label: 'appearance.presetGraphite', accent: '#55606e' },
];

const _KEY = 'cms.appearance';

// sRGB → OKLab → LCh: из выбранного цвета нужны только оттенок и насыщенность.
const _linear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export var hueOf = (hex: string): { hue: number; chroma: number } => {
  const {
    0: r,
    1: g,
    2: b,
  } = [1, 3, 5].map((_) =>
    _linear(Number.parseInt(hex.slice(_, _ + 2), 16) / 255)
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
    chroma: Math.hypot(a, bb),
  };
};

const _stored = (): Appearance | null => {
  try {
    return JSON.parse(localStorage.getItem(_KEY) ?? 'null');
  } catch {
    return null;
  }
};

export var appearance = $state<{ current: Appearance }>({
  current: DEFAULT_APPEARANCE,
});

/** Палитра — из одного оттенка (theme.css); насыщенность — по выбранному цвету: серый даёт сдержанную. */
export var applyAppearance = (next: Appearance): void => {
  const { hue, chroma } = hueOf(next.accent);
  const root = document.documentElement;
  appearance.current = next;
  // У совсем серого цвета оттенка нет (atan2 даёт 0 — красный): сигналы тогда синие, как по умолчанию.
  root.style.setProperty('--hue', (chroma < 0.012 ? 258 : hue).toFixed(1));
  root.style.setProperty(
    '--sat',
    Math.min(1, Math.max(0.25, chroma / 0.12)).toFixed(2)
  );
  void (next.scheme === 'system'
    ? delete root.dataset.theme
    : (root.dataset.theme = next.scheme));
  // Копия в браузере — чтобы вход и первая отрисовка были уже в своих цветах.
  try {
    localStorage.setItem(_KEY, JSON.stringify(next));
  } catch {}
};

/** До ответа сервера: последнее оформление из браузера. */
export var restoreAppearance = (): void =>
  applyAppearance(_stored() ?? DEFAULT_APPEARANCE);

export var saveAppearance = (next: Appearance): Promise<Appearance> => (
  applyAppearance(next), api.send<Appearance>('PUT', '/appearance', next)
);

// Схема и язык, выбранные на входе, до сеанса; после входа они становятся оформлением пользователя.
let _picked: Appearance['scheme'] | null = null;
let _pickedLanguage: Language | null = null;

export var pickScheme = (scheme: Appearance['scheme']): void => (
  (_picked = scheme), applyAppearance({ ...appearance.current, scheme })
);

/** После входа: схему и язык с экрана входа — в оформление на сервере, иначе вход бы их сбросил. */
export var keepPicked = (): Promise<unknown> =>
  ((next) =>
    next.scheme !== appearance.current.scheme ||
    next.language !== appearance.current.language
      ? saveAppearance(next)
      : Promise.resolve())({
    ...appearance.current,
    scheme: _picked ?? appearance.current.scheme,
    language: _pickedLanguage ?? appearance.current.language,
  });

const _LANGUAGE_KEY = 'cms.language';

/** Язык, на котором нарисован менеджер: корневой макет перерисовывает всё, когда он меняется. */
export var shown = $state({ language: FALLBACK_LANGUAGE });

// `lang` у страницы — для читалки, переносов и проверки орфографии в полях.
const _showLanguage = (language: Language): Promise<void> =>
  loadLanguage(language).then(() => {
    document.documentElement.lang = language;
    shown.language = language;
    try {
      localStorage.setItem(_LANGUAGE_KEY, language);
    } catch {}
  });

const _storedLanguage = (): string | null => {
  try {
    return localStorage.getItem(_LANGUAGE_KEY);
  } catch {
    return null;
  }
};

/** До сеанса: язык из этого браузера, иначе первый подходящий из языков браузера, иначе английский. */
export var startLanguage = (): Promise<void> =>
  _showLanguage(
    ((stored) =>
      isLanguage(stored)
        ? stored
        : (navigator.languages
            .map((_) => _.slice(0, 2).toLowerCase())
            .find(isLanguage) ?? FALLBACK_LANGUAGE))(_storedLanguage())
  );

/** На экране входа: сразу, а после входа он станет языком пользователя. */
export var pickLanguage = (language: Language): Promise<void> => (
  (_pickedLanguage = language), _showLanguage(language)
);

/** Из меню профиля: сразу и в оформление на сервере. */
export var chooseLanguage = (language: Language): Promise<unknown> =>
  _showLanguage(language).then(() =>
    saveAppearance({ ...appearance.current, language })
  );

/** Пришёл сеанс: язык пользователя, если он его выбирал, а на входе не выбрали другой. */
export var adoptLanguage = (language: Language | null): Promise<void> =>
  language && !_pickedLanguage && language !== currentLanguage()
    ? _showLanguage(language)
    : Promise.resolve();
