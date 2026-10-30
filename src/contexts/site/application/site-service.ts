import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  type CustomSetting,
  createCustomSetting,
  createTranslation,
  type DictionaryRepository,
  parseKey,
  type Translation,
  translate,
} from '../domain/dictionary.ts';
import type { SiteEvent } from '../domain/events.ts';
import type { SettingsRepository } from '../domain/settings-repository.ts';
import { changeSettings, type SiteSettings } from '../domain/site-settings.ts';

export var defineSiteService = ({
  settings,
  dictionary,
  bus,
}: {
  settings: SettingsRepository;
  dictionary: DictionaryRepository;
  bus: EventBus;
}) => {
  // Настройки читаются на каждом запросе: держим в памяти до изменения.
  let current: SiteSettings | null = null;

  const get = (): SiteSettings => (current ??= settings.load());

  const update = (patch: Partial<SiteSettings>): void =>
    pipe<Partial<SiteSettings>, void>(
      (_: Partial<SiteSettings>) => changeSettings(get(), _),
      (_: SiteSettings) => (settings.save(_), (current = _)),
      () => bus.publish({ type: 'site.settings_changed' } satisfies SiteEvent)
    )(patch);

  // Переводы и свои настройки читает каждый рендер: держим в памяти до правки.
  let translations: ReadonlyMap<string, Translation> | null = null;
  let custom: ReadonlyMap<string, string> | null = null;

  const translationMap = () =>
    (translations ??= new Map(
      dictionary.translations().map((_) => [_.key, _])
    ));
  const customMap = () =>
    (custom ??= new Map(dictionary.settings().map((_) => [_.key, _.value])));

  const changed = (type: SiteEvent['type']) => (
    (translations = null),
    (custom = null),
    bus.publish({ type } satisfies SiteEvent)
  );

  return {
    settings: { get, update },
    translations: {
      list: (): Translation[] => [...translationMap().values()],
      save: (key: string, values: Readonly<Record<string, unknown>>): void => (
        dictionary.saveTranslation(createTranslation(key, values)),
        changed('site.translations_changed')
      ),
      remove: (key: string): void => (
        dictionary.removeTranslation(parseKey(key)),
        changed('site.translations_changed')
      ),
      /** Текст ключа на языке; null — ключа или текста нет. */
      text: (key: string, language: string): string | null =>
        translate(translationMap().get(key), language, get().language),
    },
    customSettings: {
      list: (): CustomSetting[] =>
        [...customMap()].map(({ 0: key, 1: value }) => ({
          key: parseKey(key),
          value,
        })),
      save: (key: string, value: unknown): void => (
        dictionary.saveSetting(createCustomSetting(key, value)),
        changed('site.custom_settings_changed')
      ),
      remove: (key: string): void => (
        dictionary.removeSetting(parseKey(key)),
        changed('site.custom_settings_changed')
      ),
      value: (key: string): string | null => customMap().get(key) ?? null,
    },
  };
};

export type SiteService = ReturnType<typeof defineSiteService>;
