import type { Database } from '../../../platform/database.ts';
import {
  type Activity,
  type ActivityLog,
  continues,
  type PageAction,
} from '../domain/activity.ts';

type Row = {
  id: number;
  page_id: number;
  action: string;
  user_id: number;
  user_name: string;
  at: string;
};

// Журнал — для «Обзора», не архив: хватает последней тысячи правок.
const _KEEP = 1000;

const _activity = (row: Row): Activity => ({
  pageId: row.page_id,
  action: row.action as PageAction,
  userId: row.user_id,
  userName: row.user_name,
  at: row.at,
});

export var defineActivityLog = (db: Database): ActivityLog => {
  const last = db.query<Row, []>(
    'SELECT * FROM manager_activity ORDER BY id DESC LIMIT 1'
  );
  const touch = db.query('UPDATE manager_activity SET at = ? WHERE id = ?');
  const insert = db.query(
    'INSERT INTO manager_activity (page_id, action, user_id, user_name, at) VALUES (?, ?, ?, ?, ?)'
  );
  const prune = db.query(
    'DELETE FROM manager_activity WHERE id <= (SELECT MAX(id) FROM manager_activity) - ?'
  );
  const recent = db.query<Row, [number]>(
    'SELECT * FROM manager_activity ORDER BY at DESC, id DESC LIMIT ?'
  );
  const page = db.query<Row, [number, number]>(
    'SELECT * FROM manager_activity ORDER BY at DESC, id DESC LIMIT ? OFFSET ?'
  );
  const count = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM manager_activity'
  );
  return {
    record: (entry) =>
      ((previous) =>
        void (previous && continues(_activity(previous), entry)
          ? touch.run(entry.at, previous.id)
          : (insert.run(
              entry.pageId,
              entry.action,
              entry.userId,
              entry.userName,
              entry.at
            ),
            prune.run(_KEEP))))(last.get()),
    recent: (limit) => recent.all(limit).map(_activity),
    page: (offset, limit) => page.all(limit, offset).map(_activity),
    count: () => count.get()!.n,
  };
};
