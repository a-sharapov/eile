import type { Database } from '../../../platform/database.ts';
import { isManagerLanguage } from '../../../shared/kernel/manager-language.ts';
import type {
  Appearance,
  AppearanceRepository,
  ColorScheme,
} from '../domain/appearance.ts';

type Row = { accent: string; scheme: string; language: string | null };

export var defineAppearanceRepository = (
  db: Database
): AppearanceRepository => {
  const get = db.query<Row, [number]>(
    'SELECT accent, scheme, language FROM manager_appearance WHERE user_id = ?'
  );
  const upsert = db.query(`
    INSERT INTO manager_appearance (user_id, accent, scheme, language) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE
      SET accent = excluded.accent, scheme = excluded.scheme, language = excluded.language`);
  return {
    get: (userId) =>
      ((row): Appearance | null =>
        row && {
          accent: row.accent,
          scheme: row.scheme as ColorScheme,
          language: isManagerLanguage(row.language) ? row.language : null,
        })(get.get(userId)),
    save: (userId, appearance) =>
      void upsert.run(
        userId,
        appearance.accent,
        appearance.scheme,
        appearance.language
      ),
  };
};
