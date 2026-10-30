export type SiteEvent = {
  readonly type:
    | 'site.settings_changed'
    | 'site.translations_changed'
    | 'site.custom_settings_changed';
};
