import type { Database } from '../../../platform/database.ts';
import type {
  CustomSetting,
  DictionaryKey,
  DictionaryRepository,
  Translation,
} from '../domain/dictionary.ts';

type TranslationRow = { key: string; language: string; value: string };

export var defineDictionaryRepository = (
  db: Database
): DictionaryRepository => {
  const translations = db.query<TranslationRow, []>(
    'SELECT key, language, value FROM site_translations ORDER BY key, language'
  );
  const clearTranslation = db.query(
    'DELETE FROM site_translations WHERE key = ?'
  );
  const insertTranslation = db.query(
    'INSERT INTO site_translations (key, language, value) VALUES (?, ?, ?)'
  );
  const settings = db.query<{ key: string; value: string; note: string }, []>(
    'SELECT key, value, note FROM site_custom_settings ORDER BY key'
  );
  const upsertSetting = db.query(
    'INSERT INTO site_custom_settings (key, value, note) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, note = excluded.note'
  );
  const removeSetting = db.query(
    'DELETE FROM site_custom_settings WHERE key = ?'
  );

  return {
    translations: () =>
      [...Map.groupBy(translations.all(), (_) => _.key).entries()].map(
        ({ 0: key, 1: rows }) => ({
          key: key as DictionaryKey,
          values: Object.fromEntries(rows.map((_) => [_.language, _.value])),
        })
      ),
    saveTranslation: db.transaction((translation: Translation) => {
      clearTranslation.run(translation.key);
      Object.entries(translation.values).forEach(
        ({ 0: language, 1: value }) =>
          void insertTranslation.run(translation.key, language, value)
      );
    }),
    removeTranslation: (key) => void clearTranslation.run(key),
    settings: () =>
      settings.all().map(
        (_): CustomSetting => ({
          key: _.key as DictionaryKey,
          value: _.value,
          note: _.note,
        })
      ),
    saveSetting: (setting) =>
      void upsertSetting.run(setting.key, setting.value, setting.note),
    removeSetting: (key) => void removeSetting.run(key),
  };
};
