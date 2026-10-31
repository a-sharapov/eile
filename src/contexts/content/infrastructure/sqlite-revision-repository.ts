import type { Database } from '../../../platform/database.ts';
import { parsePageId } from '../domain/page.ts';
import type {
  NewRevision,
  Revision,
  RevisionAction,
  Snapshot,
} from '../domain/revision.ts';
import type {
  RevisionRepository,
  RevisionSummary,
} from '../domain/revision-repository.ts';

type SummaryRow = {
  id: number;
  page_id: number;
  action: string;
  author_id: number | null;
  author_name: string;
  at: string;
  changed: string;
  restored_from: string | null;
  size: number;
};

type RevisionRow = SummaryRow & { snapshot: string };

const _SUMMARY =
  'id, page_id, action, author_id, author_name, at, changed, restored_from, size';

const _summary = (row: SummaryRow): RevisionSummary => ({
  id: row.id,
  pageId: parsePageId(row.page_id),
  action: row.action as RevisionAction,
  author:
    row.author_id === null
      ? null
      : { id: row.author_id, name: row.author_name },
  at: row.at,
  changed: JSON.parse(row.changed),
  restoredFrom: row.restored_from,
  size: row.size,
});

const _revision = (row: RevisionRow | null): Revision | null =>
  row && { ..._summary(row), snapshot: JSON.parse(row.snapshot) as Snapshot };

const _params = (revision: NewRevision) => ({
  page: revision.pageId,
  action: revision.action,
  authorId: revision.author?.id ?? null,
  authorName: revision.author?.name ?? '',
  at: revision.at,
  changed: JSON.stringify(revision.changed),
  restoredFrom: revision.restoredFrom,
  snapshot: JSON.stringify(revision.snapshot),
  size: revision.size,
});

export var defineRevisionRepository = (db: Database): RevisionRepository => {
  const latest = db.query<RevisionRow, [number]>(
    'SELECT * FROM content_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 1'
  );
  const list = db.query<SummaryRow, [number]>(
    `SELECT ${_SUMMARY} FROM content_revisions WHERE page_id = ? ORDER BY id DESC`
  );
  const byId = db.query<RevisionRow, [number]>(
    'SELECT * FROM content_revisions WHERE id = ?'
  );
  const insert = db.query<{ id: number }, [ReturnType<typeof _params>]>(
    `INSERT INTO content_revisions
       (page_id, action, author_id, author_name, at, changed, restored_from, snapshot, size)
     VALUES ($page, $action, $authorId, $authorName, $at, $changed, $restoredFrom, $snapshot, $size)
     RETURNING id`
  );
  const update = db.query(
    'UPDATE content_revisions SET at = $at, changed = $changed WHERE id = $id'
  );
  const remove = db.query('DELETE FROM content_revisions WHERE id = ?');
  const keepOnly = db.query(
    `DELETE FROM content_revisions
     WHERE page_id = $page AND id NOT IN (SELECT value FROM json_each($keep))`
  );
  return {
    latest: (pageId) => _revision(latest.get(pageId)),
    list: (pageId) => list.all(pageId).map(_summary),
    get: (id) => _revision(byId.get(id)),
    add: (revision) => insert.get(_params(revision))!.id,
    update: (revision) =>
      void update.run({
        id: revision.id,
        at: revision.at,
        changed: JSON.stringify(revision.changed),
      } as never),
    remove: (id) => void remove.run(id),
    keepOnly: (pageId, ids) =>
      void keepOnly.run({ page: pageId, keep: JSON.stringify(ids) } as never),
  };
};
