import type { Database } from '../../../platform/database.ts';
import type { RuleRepository } from '../domain/ports.ts';
import type { RedirectRule, RedirectStatus } from '../domain/redirect.ts';

type RuleRow = {
  id: number;
  from_path: string;
  target: string;
  status: number;
  note: string;
  hits: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
};

const _rule = (row: RuleRow): RedirectRule => ({
  id: row.id,
  from: row.from_path,
  to: row.target,
  status: row.status as RedirectStatus,
  note: row.note,
  hits: row.hits,
  lastHitAt: row.last_hit_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export var defineRuleRepository = (db: Database): RuleRepository => {
  const all = db.query<RuleRow, []>(
    'SELECT * FROM redirects_rules ORDER BY from_path'
  );
  const byId = db.query<RuleRow, [number]>(
    'SELECT * FROM redirects_rules WHERE id = ?'
  );
  const byFrom = db.query<RuleRow, [string]>(
    'SELECT * FROM redirects_rules WHERE from_path = ?'
  );
  const insert = db.query<
    { id: number },
    [string, string, number, string, string, string]
  >(
    `INSERT INTO redirects_rules (from_path, target, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
  );
  const update = db.query(
    `UPDATE redirects_rules SET from_path = ?, target = ?, status = ?, note = ?, updated_at = ?
     WHERE id = ?`
  );
  const remove = db.query('DELETE FROM redirects_rules WHERE id = ?');
  const hit = db.query(
    'UPDATE redirects_rules SET hits = hits + 1, last_hit_at = ? WHERE id = ?'
  );
  return {
    all: () => all.all().map(_rule),
    get: (id) => ((row) => (row ? _rule(row) : null))(byId.get(id)),
    byFrom: (from) => ((row) => (row ? _rule(row) : null))(byFrom.get(from)),
    insert: (draft, at) =>
      insert.get(draft.from, draft.to, draft.status, draft.note, at, at)!.id,
    update: (id, draft, at) =>
      void update.run(draft.from, draft.to, draft.status, draft.note, at, id),
    remove: (id) => void remove.run(id),
    hit: (id, at) => void hit.run(at, id),
    transaction: (run) => db.transaction(run)(),
  };
};
