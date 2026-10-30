import type { Database } from '../../../platform/database.ts';
import type { OldPathRepository } from '../domain/old-path-repository.ts';
import { parsePageId } from '../domain/page.ts';

export var defineOldPathRepository = (db: Database): OldPathRepository => {
  const byPath = db.query<{ page_id: number }, [string]>(
    'SELECT page_id FROM content_old_paths WHERE path = ?'
  );
  const byPage = db.query<{ path: string }, [number]>(
    'SELECT path FROM content_old_paths WHERE page_id = ? ORDER BY moved_at DESC'
  );
  const upsert = db.query(
    `INSERT INTO content_old_paths (path, page_id, moved_at) VALUES (?, ?, ?)
     ON CONFLICT (path) DO UPDATE SET page_id = excluded.page_id, moved_at = excluded.moved_at`
  );
  const remove = db.query('DELETE FROM content_old_paths WHERE path = ?');
  const removeOf = db.query('DELETE FROM content_old_paths WHERE page_id = ?');
  return {
    pageFor: (path) =>
      ((row) => (row ? parsePageId(row.page_id) : null))(byPath.get(path)),
    of: (pageId) => byPage.all(pageId).map((_) => _.path),
    save: (path, pageId, at) => void upsert.run(path, pageId, at),
    remove: (path) => void remove.run(path),
    removeOf: (pageId) => void removeOf.run(pageId),
  };
};
