import type { SiteSettings } from './site-settings.ts';

export type SettingsRepository = {
  readonly load: () => SiteSettings;
  readonly save: (settings: SiteSettings) => void;
};
