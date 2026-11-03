import { chunksOf, joinChunks } from '../../../platform/chunks.ts';
import type { Database } from '../../../platform/database.ts';
import {
  type Form,
  type FormName,
  NO_CONFIRMATION,
  NO_WEBHOOK,
} from '../domain/form.ts';
import type {
  FileRepository,
  FormRepository,
  InboxStats,
  SubmissionFile,
  SubmissionRepository,
  UploadedFile,
  WebhookRepository,
} from '../domain/ports.ts';
import type { Value } from '../domain/schema.ts';
import type {
  Submission,
  SubmissionContext,
  SubmissionStatus,
} from '../domain/submission.ts';
import type { WebhookDelivery, WebhookStatus } from '../domain/webhook.ts';

type FormRow = {
  name: string;
  title: string;
  source: string;
  settings: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

// Настройки форм со старых версий — без письма отправителю и вебхука: у них умолчания.
const _form = (row: FormRow): Form => ({
  confirmation: NO_CONFIRMATION,
  webhook: NO_WEBHOOK,
  ...(JSON.parse(row.settings) as Omit<
    Form,
    | 'name'
    | 'title'
    | 'source'
    | 'revision'
    | 'createdAt'
    | 'updatedAt'
    | 'confirmation'
    | 'webhook'
  > &
    Partial<Pick<Form, 'confirmation' | 'webhook'>>),
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

// Поиск — по значениям полей без учёта регистра: строка в одной колонке. У скрытого поля с подписями
// находится и подпись, и ключ.
const _search = (values: readonly Value[], note = ''): string =>
  [
    ...values.flatMap((_) =>
      _.raw === undefined ? [_.value] : [_.value, _.raw]
    ),
    note,
  ]
    .join('\n')
    .toLowerCase();

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

type FileRow = {
  id: number;
  submission_id: number;
  field: string;
  name: string;
  type: string;
  size: number;
};

const _file = (row: FileRow): SubmissionFile => ({
  id: row.id,
  submissionId: row.submission_id,
  field: row.field,
  name: row.name,
  type: row.type,
  size: row.size,
});

// Имя файла — для подписи и скачивания: без путей и управляющих символов, разумной длины.
const _fileName = (name: string): string =>
  name
    .replace(/^.*[\\/]/, '')
    .replace(/[\p{Cc}]/gu, '')
    .trim()
    .slice(0, 200) || 'file';

export var defineFileRepository = (db: Database): FileRepository => {
  const insert = db.query<{ id: number }, Record<string, string | number>>(
    `INSERT INTO forms_files (submission_id, field, name, type, size)
     VALUES ($submission, $field, $name, $type, $size) RETURNING id`
  );
  const insertChunk = db.query<unknown, [number, number, Uint8Array]>(
    'INSERT INTO forms_file_chunks (file_id, n, data) VALUES (?, ?, ?)'
  );
  const list = db.query<FileRow, [number]>(
    'SELECT id, submission_id, field, name, type, size FROM forms_files WHERE submission_id = ? ORDER BY id'
  );
  const get = db.query<FileRow, [number]>(
    'SELECT id, submission_id, field, name, type, size FROM forms_files WHERE id = ?'
  );
  const chunks = db.query<{ data: Uint8Array }, [number]>(
    'SELECT data FROM forms_file_chunks WHERE file_id = ? ORDER BY n'
  );
  const orphans = db.query(
    'DELETE FROM forms_files WHERE submission_id NOT IN (SELECT id FROM forms_submissions)'
  );
  const orphanChunks = db.query(
    'DELETE FROM forms_file_chunks WHERE file_id NOT IN (SELECT id FROM forms_files)'
  );
  // Файл и его куски — вместе: недописанного файла в заявке не бывает.
  const add = db.transaction(
    (submission: number, field: string, file: UploadedFile): number =>
      ((id) => (
        chunksOf(file.bytes).forEach(
          (data, n) => void insertChunk.run(id, n, data)
        ),
        id
      ))(
        insert.get({
          submission,
          field,
          name: _fileName(file.name),
          type: file.type.slice(0, 100),
          size: file.bytes.byteLength,
        })!.id
      )
  );
  return {
    add: (submission, field, file) => add(submission, field, file),
    list: (submission) => list.all(submission).map(_file),
    get: (id) =>
      ((row) =>
        row
          ? {
              ..._file(row),
              bytes: joinChunks(
                chunks.all(id).map((_) => _.data),
                0,
                row.size
              ),
            }
          : null)(get.get(id)),
    removeOrphans: () =>
      ((removed) => (orphanChunks.run(), removed))(orphans.run().changes),
  };
};

type WebhookRow = {
  submission_id: number;
  form: string;
  url: string;
  status: string;
  attempts: number;
  next_at: string;
  last_error: string;
  created_at: string;
  delivered_at: string | null;
};

const _webhook = (row: WebhookRow): WebhookDelivery => ({
  submissionId: row.submission_id,
  form: row.form,
  url: row.url,
  status: row.status as WebhookStatus,
  attempts: row.attempts,
  nextAt: row.next_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  deliveredAt: row.delivered_at,
});

export var defineWebhookRepository = (db: Database): WebhookRepository => {
  const insert = db.query(`
    INSERT OR IGNORE INTO forms_webhooks (submission_id, form, url, next_at, created_at)
    VALUES ($submission, $form, $url, $now, $now)`);
  const due = db.query<WebhookRow, [string, number]>(
    "SELECT * FROM forms_webhooks WHERE status = 'pending' AND next_at <= ? ORDER BY next_at, submission_id LIMIT ?"
  );
  const get = db.query<WebhookRow, [number]>(
    'SELECT * FROM forms_webhooks WHERE submission_id = ?'
  );
  const mark = db.query(`
    UPDATE forms_webhooks SET url = $url, status = $status, attempts = $attempts, next_at = $nextAt,
      last_error = $lastError, delivered_at = $deliveredAt
    WHERE submission_id = $submission`);
  const orphans = db.query(
    'DELETE FROM forms_webhooks WHERE submission_id NOT IN (SELECT id FROM forms_submissions)'
  );
  return {
    add: (delivery, now) =>
      void insert.run({
        submission: delivery.submissionId,
        form: delivery.form,
        url: delivery.url,
        now,
      }),
    due: (now, limit) => due.all(now, limit).map(_webhook),
    get: (submissionId) =>
      ((row) => (row ? _webhook(row) : null))(get.get(submissionId)),
    mark: (submissionId, change) =>
      void mark.run({ submission: submissionId, ...change }),
    removeOrphans: () => orphans.run().changes,
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

/** Секрет печатей для файла настроек сервера: прочитать сохранённый и заменить на привезённый. */
export var defineSecretStore = (db: Database) => {
  const get = db.query<{ value: string }, []>(
    'SELECT value FROM forms_secret WHERE id = 1'
  );
  const put = db.query(
    'INSERT INTO forms_secret (id, value) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value'
  );
  return {
    read: (): string | null => get.get()?.value ?? null,
    write: (value: string): void => void put.run(value),
  };
};
