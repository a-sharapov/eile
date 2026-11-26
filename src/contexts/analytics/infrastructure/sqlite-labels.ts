import type { Database } from '../../../platform/database.ts';
import type { LabelRegistry, RegisteredLabel } from '../domain/ports.ts';
import type { Parts } from '../domain/setup.ts';

type LabelRow = {
  readonly sender: string;
  readonly label: string;
  readonly name: string;
  readonly parts: string;
  readonly link: string | null;
  readonly user_name: string | null;
  readonly agent: number;
  readonly created_at: string;
};

const _label = (_: LabelRow): RegisteredLabel => ({
  sender: _.sender,
  label: _.label,
  name: _.name,
  parts: JSON.parse(_.parts) as Parts,
  link: _.link,
  author:
    _.user_name === null ? null : { name: _.user_name, agent: _.agent === 1 },
  createdAt: _.created_at,
});

/** Реестр меток в базе: ключ — отправитель и метка. */
export var defineLabelRegistry = (db: Database): LabelRegistry => {
  const get = db.query<LabelRow, [string, string]>(
    'SELECT * FROM analytics_labels WHERE sender = ? AND label = ?'
  );
  const list = db.query<LabelRow, [string | null]>(`
    SELECT * FROM analytics_labels WHERE ?1 IS NULL OR sender = ?1
    ORDER BY created_at DESC, sender, label`);
  const count = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM analytics_labels'
  );
  const add = db.query<
    unknown,
    [
      string,
      string,
      string,
      string,
      string | null,
      string | null,
      number,
      string,
    ]
  >(`
    INSERT INTO analytics_labels (sender, label, name, parts, link, user_name, agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const rename = db.query<unknown, [string, string, string]>(
    'UPDATE analytics_labels SET name = ? WHERE sender = ? AND label = ?'
  );
  const remove = db.query<unknown, [string, string]>(
    'DELETE FROM analytics_labels WHERE sender = ? AND label = ?'
  );
  // Метки первых касаний — по людям: одинаковые метки сначала вместе, их сотни, а людей тысячи.
  const touches = db.query<
    { sender: string; label: string; count: number },
    []
  >(`
    SELECT first_touch_sender AS sender, first_touch_label AS label, count(*) AS count
    FROM analytics_people
    WHERE first_touch_sender IS NOT NULL AND first_touch_label IS NOT NULL AND first_touch_label <> ''
    GROUP BY first_touch_sender, first_touch_label`);
  return {
    get: (sender, label) =>
      ((row) => (row === null ? null : _label(row)))(get.get(sender, label)),
    list: (sender) => list.all(sender).map(_label),
    count: () => count.get()?.n ?? 0,
    add: (_) =>
      void add.run(
        _.sender,
        _.label,
        _.name,
        JSON.stringify(_.parts),
        _.link,
        _.author?.name ?? null,
        Number(_.author?.agent === true),
        _.createdAt
      ),
    rename: (sender, label, name) => void rename.run(name, sender, label),
    remove: (sender, label) => void remove.run(sender, label),
    touches: () => touches.all(),
  };
};
