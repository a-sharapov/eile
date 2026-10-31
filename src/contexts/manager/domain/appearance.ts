import { fail } from '../../../shared/kernel/errors.ts';
import {
  isManagerLanguage,
  type ManagerLanguage,
} from '../../../shared/kernel/manager-language.ts';

/** Схема менеджера: по системе, всегда светлая или всегда тёмная. */
export type ColorScheme = 'system' | 'light' | 'dark';

/** Оформление менеджера у пользователя: акцент, от которого по триаде строится палитра, схема и язык. */
export type Appearance = {
  /** `#rrggbb`; менеджер берёт из него оттенок, светлоту подбирает сам ради контраста. */
  readonly accent: string;
  readonly scheme: ColorScheme;
  /** null — язык, о котором просит браузер. */
  readonly language: ManagerLanguage | null;
};

// Оттенок синего MODX: в триаде с ним зелёная главная кнопка, как в оригинале.
export var DEFAULT_APPEARANCE: Appearance = {
  accent: '#2f5c96',
  scheme: 'system',
  language: null,
};

const _ACCENT = /^#[0-9a-f]{6}$/;
const _SCHEMES: readonly ColorScheme[] = ['system', 'light', 'dark'];

export var parseAppearance = (input: {
  readonly accent?: unknown;
  readonly scheme?: unknown;
  readonly language?: unknown;
}): Appearance => {
  const accent = String(
    input.accent ?? DEFAULT_APPEARANCE.accent
  ).toLowerCase();
  const scheme = String(input.scheme ?? DEFAULT_APPEARANCE.scheme);
  const language = input.language ?? null;
  return _ACCENT.test(accent) &&
    _SCHEMES.includes(scheme as ColorScheme) &&
    (language === null || isManagerLanguage(language))
    ? { accent, scheme: scheme as ColorScheme, language }
    : fail(
        'manager.invalid_appearance',
        'Accent must be #rrggbb, scheme — system, light or dark, language — en, de or ru'
      );
};

/** Хранилище оформления по id пользователя. */
export type AppearanceRepository = {
  readonly get: (userId: number) => Appearance | null;
  readonly save: (userId: number, appearance: Appearance) => void;
};
