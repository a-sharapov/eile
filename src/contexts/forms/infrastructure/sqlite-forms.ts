import type { Database } from '../../../platform/database.ts';
import type { Form, FormName } from '../domain/form.ts';
import type {
  FormRepository,
  InboxStats,
  SubmissionRepository,
} from '../domain/ports.ts';
import type { Value } from '../domain/schema.ts';
import type {
  Submission,
  SubmissionContext,
  SubmissionStatus,
} from '../domain/submission.ts';

type FormRow = {
  name: string;
  title: string;
  source: string;
  settings: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

const _form = (row: FormRow): Form => ({
  ...(JSON.parse(row.settings) as Omit<
    Form,
    'name' | 'title' | 'source' | 'revision' | 'createdAt' | 'updatedAt'
  >),
  name: row.name as FormName,
  title: row.title,
  source: row.source,
  revision: row.revision,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export var defineFormRepository = (db: Database): FormRepository => {
  const get = db.query<FormRow, [string]>(
    'SELECT * FROM forms_forms WHERE name = ?'
  );
  const list = db.query<FormRow, []>(
    'SELECT * FROM forms_forms ORDER BY title COLLATE NOCASE, name'
  );
  const upsert = db.query(`
    INSERT INTO forms_forms (name, title, source, settings, revision, created_at, updated_at)
    VALUES ($name, $title, $source, $settings, $revision, $createdAt, $updatedAt)
    ON CONFLICT (name) DO UPDATE SET title = excluded.title, source = excluded.source,
      settings = excluded.settings, revision = excluded.revision, updated_at = excluded.updated_at`);
  const remove = db.query('DELETE FROM forms_forms WHERE name = ?');
  return {
    get: (name) => ((row) => (row ? _form(row) : null))(get.get(name)),
    list: () => list.all().map(_form),
    save: ({
      name,
      title,
      source,
      revision,
      createdAt,
      updatedAt,
      ...settings
    }) =>
      void upsert.run({
        name,
        title,
        source,
        settings: JSON.stringify(settings),
        revision,
        createdAt,
        updatedAt,
      }),
    remove: (name) => void remove.run(name),
  };
};

type SubmissionRow = {
  id: number;
  form: string;
  form_title: string;
  field_values: string;
  context: string;
  ip: string;
  user_agent: string;
  status: string;
  note: string;
  read_at: string | null;
  read_by: number | null;
  created_at: string;
  updated_at: string;
};

const _submission = (row: SubmissionRow): Submission => ({
  id: row.id,
  form: row.form,
  formTitle: row.form_title,
  values: JSON.parse(row.field_values) as Value[],
  context: JSON.parse(row.context) as SubmissionContext,
  ip: row.ip,
  userAgent: row.user_agent,
  status: row.status as SubmissionStatus,
  note: row.note,
  readAt: row.read_at,
  readBy: row.read_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Поиск — по значениям полей без учёта регистра: строка в одной колонке.
const _search = (values: readonly Value[], note = ''): string =>
  [...values.map((_) => _.value), note].join('\n').toLowerCase();

// Один запрос на все сочетания фильтров: пустой фильтр не сужает выборку, спам — только по просьбе.
const _LIST = `
  SELECT * FROM forms_submissions
  WHERE ($form IS NULL OR form = $form)
    AND (CASE WHEN $status IS NULL THEN status <> 'spam' ELSE status = $status END)
    AND ($unread = 0 OR read_at IS NULL)
    AND ($text IS NULL OR instr(search, $text) > 0)
    AND ($before IS NULL OR id < $before)
  ORDER BY id DESC LIMIT $limit`;

export var defineSubmissionRepository = (
  db: Database
): SubmissionRepository => {
  const insert = db.query<{ id: number }, Record<string, string | number>>(`
    INSERT INTO forms_submissions (form, form_title, field_values, context, search, ip, user_agent,
      status, created_at, updated_at)
    VALUES ($form, $formTitle, $values, $context, $search, $ip, $userAgent, $status, $createdAt,
      $createdAt)
    RETURNING id`);
  const get = db.query<SubmissionRow, [number]>(
    'SELECT * FROM forms_submissions WHERE id = ?'
  );
  const list = db.query<SubmissionRow, Record<string, string | number | null>>(
    _LIST
  );
  const update = db.query(`
    UPDATE forms_submissions SET status = $status, note = $note, read_at = $readAt,
      read_by = $readBy, search = $search, updated_at = $updatedAt
    WHERE id = $id`);
  const remove = db.query('DELETE FROM forms_submissions WHERE id = ?');
  const counts = db.query<
    { unread: number; today: number; week: number },
    [string, string]
  >(`
    SELECT count(*) FILTER (WHERE read_at IS NULL) AS unread,
           count(*) FILTER (WHERE created_at >= ?) AS today,
           count(*) FILTER (WHERE created_at >= ?) AS week
    FROM forms_submissions WHERE status <> 'spam'`);
  const byForm = db.query<
    { form: string; title: string; unread: number; total: number },
    []
  >(`
    SELECT form, max(form_title) AS title, count(*) FILTER (WHERE read_at IS NULL) AS unread,
           count(*) AS total
    FROM forms_submissions WHERE status <> 'spam' GROUP BY form ORDER BY max(id) DESC`);
  const daily = db.query<{ day: string; count: number }, [string]>(`
    SELECT substr(created_at, 1, 10) AS day, count(*) AS count
    FROM forms_submissions WHERE status <> 'spam' AND created_at >= ? GROUP BY day`);
  const purgeForm = db.query(
    'DELETE FROM forms_submissions WHERE form = ? AND created_at < ?'
  );
  const purgeOrphans = db.query(
    'DELETE FROM forms_submissions WHERE form NOT IN (SELECT value FROM json_each(?)) AND created_at < ?'
  );

  const days = (now: string): string[] =>
    Array.from({ length: 14 }, (_, back) =>
      new Date(Date.parse(now) - (13 - back) * 86_400_000)
        .toISOString()
        .slice(0, 10)
    );

  return {
    add: (submission) =>
      insert.get({
        form: submission.form,
        formTitle: submission.formTitle,
        values: JSON.stringify(submission.values),
        context: JSON.stringify(submission.context),
        search: _search(submission.values),
        ip: submission.ip,
        userAgent: submission.userAgent,
        status: submission.status,
        createdAt: submission.createdAt,
      })!.id,
    get: (id) => ((row) => (row ? _submission(row) : null))(get.get(id)),
    list: (query) =>
      list
        .all({
          form: query.form ?? null,
          status: query.status ?? null,
          unread: query.unread ? 1 : 0,
          text: query.text ? query.text.toLowerCase() : null,
          before: query.before ?? null,
          limit: query.limit,
        })
        .map(_submission),
    save: (submission) =>
      void update.run({
        id: submission.id,
        status: submission.status,
        note: submission.note,
        readAt: submission.readAt,
        readBy: submission.readBy,
        search: _search(submission.values, submission.note),
        updatedAt: submission.updatedAt,
      }),
    remove: (id) => void remove.run(id),
    stats: (now, dayStart): InboxStats => {
      const weekAgo = new Date(Date.parse(now) - 7 * 86_400_000).toISOString();
      const total = counts.get(dayStart, weekAgo) ?? {
        unread: 0,
        today: 0,
        week: 0,
      };
      const range = days(now);
      const perDay = new Map(
        daily.all(`${range[0]}T00:00:00.000Z`).map((_) => [_.day, _.count])
      );
      return {
        ...total,
        byForm: byForm.all(),
        daily: range.map((_) => perDay.get(_) ?? 0),
      };
    },
    purge: (form, before, keep) =>
      form === null
        ? purgeOrphans.run(JSON.stringify(keep), before).changes
        : purgeForm.run(form, before).changes,
  };
};

/** Секрет печатей: создаётся при первом обращении, живёт на этом сервере. */
export var defineSecret = (db: Database): (() => string) => {
  const get = db.query<{ value: string }, []>(
    'SELECT value FROM forms_secret WHERE id = 1'
  );
  const insert = db.query(
    'INSERT OR IGNORE INTO forms_secret (id, value) VALUES (1, ?)'
  );
  let secret: string | null = null;
  return () =>
    (secret ??=
      get.get()?.value ??
      (insert.run(
        crypto
          .getRandomValues(new Uint8Array(32))
          .toBase64({ alphabet: 'base64url' })
      ),
      get.get()!.value));
};
