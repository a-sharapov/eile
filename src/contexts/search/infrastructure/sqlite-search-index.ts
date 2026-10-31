import type { Database } from '../../../platform/database.ts';
import { attempt } from '../../../shared/kernel/errors.ts';
import type { IndexRow, SearchIndex } from '../domain/ports.ts';

// Заголовок весит впятеро больше текста: слово в заголовке — почти всегда то, что ищут.
const _RANK = 'bm25(search_terms, 5.0, 1.0)';

// Раздел — подстрока `/id/` в ветке; без раздела — `/`, она есть в любой ветке.
const _WHERE = `search_terms MATCH $match
  AND p.language = $language
  AND instr(p.lineage, $branch) > 0
  AND p.page_id <> $parent`;

export var defineSearchIndex = (db: Database): SearchIndex => {
  const upsertPage = db.query(
    `INSERT INTO search_pages (page_id, language, lineage, title, body)
     VALUES ($id, $language, $lineage, $title, $body)
     ON CONFLICT (page_id) DO UPDATE SET language = excluded.language, lineage = excluded.lineage,
       title = excluded.title, body = excluded.body`
  );
  const removeTerms = db.query('DELETE FROM search_terms WHERE rowid = ?');
  const insertTerms = db.query(
    'INSERT INTO search_terms (rowid, title, body) VALUES (?, ?, ?)'
  );
  const branchTerms = db.query(
    'DELETE FROM search_terms WHERE rowid IN (SELECT page_id FROM search_pages WHERE instr(lineage, ?) > 0)'
  );
  const branchPages = db.query(
    'DELETE FROM search_pages WHERE instr(lineage, ?) > 0'
  );
  const found = db.query<
    IndexRow,
    {
      match: string;
      language: string;
      branch: string;
      parent: number;
      limit: number;
      offset: number;
    }
  >(
    `SELECT p.page_id AS id, p.title AS title, p.body AS text
     FROM search_terms JOIN search_pages p ON p.page_id = search_terms.rowid
     WHERE ${_WHERE}
     ORDER BY ${_RANK}, p.page_id
     LIMIT $limit OFFSET $offset`
  );
  const counted = db.query<
    { total: number },
    { match: string; language: string; branch: string; parent: number }
  >(
    `SELECT count(*) AS total
     FROM search_terms JOIN search_pages p ON p.page_id = search_terms.rowid
     WHERE ${_WHERE}`
  );
  const format = db.query<{ value: string }, []>(
    "SELECT value FROM search_meta WHERE key = 'format'"
  );
  const setFormat = db.query(
    "INSERT INTO search_meta (key, value) VALUES ('format', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
  );

  return {
    put: (document) => (
      upsertPage.run({
        id: document.id,
        language: document.language,
        lineage: document.lineage,
        title: document.title,
        body: document.text,
      }),
      removeTerms.run(document.id),
      void insertTerms.run(document.id, document.titleTerms, document.textTerms)
    ),
    removeBranch: (id) =>
      void (branchTerms.run(`/${id}/`), branchPages.run(`/${id}/`)),
    clear: () =>
      void (db.run('DELETE FROM search_terms'),
      db.run('DELETE FROM search_pages'),
      db.run('DELETE FROM search_meta')),
    // Выражение строит parseQuery из одних букв и цифр; если FTS5 всё же откажет — пустая выдача.
    query: (match, filter) =>
      ((where) =>
        attempt(
          () => ({
            rows: found.all({
              ...where,
              limit: filter.limit,
              offset: filter.offset,
            }),
            total: counted.get(where)?.total ?? 0,
          }),
          () => ({ rows: [], total: 0 })
        ))({
        match,
        language: filter.language,
        branch: filter.parent === null ? '/' : `/${filter.parent}/`,
        parent: filter.parent ?? -1,
      }),
    format: () => ((row) => (row ? Number(row.value) : null))(format.get()),
    setFormat: (value) => void setFormat.run(String(value)),
    transaction: (run) => db.transaction(run)(),
  };
};

/** После восстановления копии индекс принадлежит прежнему сайту: стереть, чтобы построился заново. */
export var clearSearchIndex = (db: Database): void =>
  defineSearchIndex(db).clear();
