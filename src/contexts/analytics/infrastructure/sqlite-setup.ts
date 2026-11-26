import type { Database } from '../../../platform/database.ts';
import type {
  AnalyticsSettingsRepository,
  EventReferences,
  SetupLog,
  SetupLogEntry,
  SetupRepository,
} from '../domain/ports.ts';
import type {
  CheckNotify,
  QualityCheck,
  ReconcileMark,
  ThresholdRule,
} from '../domain/quality.ts';
import type { EventRole } from '../domain/roles.ts';
import {
  type AnalyticsSettings,
  DEFAULT_ANALYTICS_SETTINGS,
} from '../domain/settings.ts';
import type {
  Dictionary,
  DictionaryPurpose,
  DictionaryValue,
  EventType,
  Funnel,
  FunnelStep,
  GoLink,
  ItemChange,
  LabelSchema,
  LabelSeparator,
  Milestone,
  MilestoneCondition,
  Parts,
  Property,
  PropertyKind,
  PropertyScope,
  ReferrerKind,
  ReferrerRule,
  Sender,
  SetupAction,
  SetupGroup,
  SetupItem,
  TypeProperty,
  UtmParameter,
} from '../domain/setup.ts';

// Настройки читаются на каждом событии приёма: в памяти, база — после записи и при сборке контекстов.
export var defineAnalyticsSettingsRepository = (
  db: Database
): AnalyticsSettingsRepository => {
  const read = db.query<{ value: string }, []>(
    'SELECT value FROM analytics_settings WHERE id = 1'
  );
  const write = db.query<unknown, [string, string]>(`
    INSERT INTO analytics_settings (id, value, revision, updated_at) VALUES (1, ?, 0, ?)
    ON CONFLICT (id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  let cached: AnalyticsSettings | null = null;
  return {
    get: () =>
      cached ??
      (cached = ((row) =>
        row
          ? {
              ...DEFAULT_ANALYTICS_SETTINGS,
              ...(JSON.parse(row.value) as Partial<AnalyticsSettings>),
            }
          : DEFAULT_ANALYTICS_SETTINGS)(read.get())),
    // Запись идёт в транзакции вместе с журналом: при откате прочитается то, что осталось в базе.
    save: (settings, at) => (
      write.run(JSON.stringify(settings), at), void (cached = null)
    ),
  };
};

type ItemRow = {
  readonly code: string;
  readonly name: string;
  readonly note: string;
  readonly archived_at: string | null;
};

type SenderRow = ItemRow & {
  readonly enabled: number;
  readonly summary_at: string | null;
};
type TypeRow = ItemRow & {
  readonly sender: string;
  readonly role: string;
  readonly properties: string;
};
type PropertyRow = ItemRow & {
  readonly scope: string;
  readonly kind: string;
  readonly dictionary: string | null;
  readonly dimension: number;
  readonly untrusted: number;
  readonly reconcile: string | null;
};
type DictionaryRow = ItemRow & {
  readonly purpose: string;
  readonly utm: string | null;
  readonly length: number | null;
};
type ValueRow = ItemRow & {
  readonly dictionary: string;
  readonly position: number;
  readonly awaits_spend: number | null;
};
type SchemaRow = Omit<ItemRow, 'code'> & {
  readonly sender: string;
  readonly separator: string;
  readonly length: number;
  readonly parts: string;
};
type ReferrerRow = ItemRow & {
  readonly kind: string;
  readonly host: string | null;
  readonly parts: string;
};
type LinkRow = ItemRow & {
  readonly sender: string;
  readonly target: string;
  readonly parts: string;
};
type MilestoneRow = ItemRow & {
  readonly sender: string;
  readonly type: string;
  readonly count: number;
  readonly condition: string | null;
  readonly days: number | null;
  readonly anchor: string | null;
  readonly shown: number;
  readonly position: number;
};
type FunnelRow = ItemRow & {
  readonly strict: number;
  readonly main: number;
  readonly steps: string;
  readonly position: number;
};
type CheckRow = ItemRow & {
  readonly enabled: number;
  readonly notify: string;
  readonly params: string;
};

// Столбцы группы в порядке запроса записи: сначала ключ, затем поля; за ними archived_at и время.
const _COLUMNS: Readonly<
  Record<SetupGroup, (item: SetupItem) => readonly (string | number | null)[]>
> = {
  sender: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      Number(item.enabled),
      item.summaryAt,
    ])(_ as Sender),
  type: (_) =>
    ((item) => [
      item.sender,
      item.code,
      item.name,
      item.note,
      item.role,
      JSON.stringify(item.properties),
    ])(_ as EventType),
  property: (_) =>
    ((item) => [
      item.scope,
      item.code,
      item.name,
      item.note,
      item.kind,
      item.dictionary,
      Number(item.dimension),
      Number(item.untrusted),
      item.reconcile,
    ])(_ as Property),
  dictionary: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      item.purpose,
      item.utm,
      item.length,
    ])(_ as Dictionary),
  value: (_) =>
    ((item) => [
      item.dictionary,
      item.code,
      item.name,
      item.note,
      item.position,
      item.awaitsSpend === null ? null : Number(item.awaitsSpend),
    ])(_ as DictionaryValue),
  schema: (_) =>
    ((item) => [
      item.sender,
      item.name,
      item.note,
      item.separator,
      item.length,
      JSON.stringify(item.parts),
    ])(_ as LabelSchema),
  referrer: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      item.kind,
      item.host,
      JSON.stringify(item.parts),
    ])(_ as ReferrerRule),
  link: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      item.sender,
      item.target,
      JSON.stringify(item.parts),
    ])(_ as GoLink),
  milestone: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      item.sender,
      item.type,
      item.count,
      item.condition === null ? null : JSON.stringify(item.condition),
      item.days,
      item.anchor,
      Number(item.column),
      item.position,
    ])(_ as Milestone),
  funnel: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      Number(item.strict),
      Number(item.main),
      JSON.stringify(item.steps),
      item.position,
    ])(_ as Funnel),
  check: (_) =>
    ((item) => [
      item.code,
      item.name,
      item.note,
      Number(item.enabled),
      item.notify,
      JSON.stringify(item.params),
    ])(_ as QualityCheck),
};

const _upsert = (
  table: string,
  key: readonly string[],
  fields: readonly string[]
): string => `
  INSERT INTO ${table} (${[...key, ...fields, 'archived_at', 'created_at', 'updated_at'].join(', ')})
  VALUES (${[...key, ...fields, 'archived_at', 'created_at', 'updated_at'].map(() => '?').join(', ')})
  ON CONFLICT (${key.join(', ')}) DO UPDATE SET
    ${[...fields, 'archived_at', 'updated_at'].map((_) => `${_} = excluded.${_}`).join(', ')}`;

const _delete = (table: string, key: readonly string[]): string =>
  `DELETE FROM ${table} WHERE ${key.map((_) => `${_} = ?`).join(' AND ')}`;

const _TABLES: Readonly<
  Record<
    SetupGroup,
    {
      readonly table: string;
      readonly key: readonly string[];
      readonly fields: readonly string[];
    }
  >
> = {
  sender: {
    table: 'analytics_senders',
    key: ['code'],
    fields: ['name', 'note', 'enabled', 'summary_at'],
  },
  type: {
    table: 'analytics_types',
    key: ['sender', 'code'],
    fields: ['name', 'note', 'role', 'properties'],
  },
  property: {
    table: 'analytics_properties',
    key: ['scope', 'code'],
    fields: [
      'name',
      'note',
      'kind',
      'dictionary',
      'dimension',
      'untrusted',
      'reconcile',
    ],
  },
  dictionary: {
    table: 'analytics_dictionaries',
    key: ['code'],
    fields: ['name', 'note', 'purpose', 'utm', 'length'],
  },
  value: {
    table: 'analytics_values',
    key: ['dictionary', 'code'],
    fields: ['name', 'note', 'position', 'awaits_spend'],
  },
  schema: {
    table: 'analytics_schemas',
    key: ['sender'],
    fields: ['name', 'note', 'separator', 'length', 'parts'],
  },
  referrer: {
    table: 'analytics_referrers',
    key: ['code'],
    fields: ['name', 'note', 'kind', 'host', 'parts'],
  },
  link: {
    table: 'analytics_links',
    key: ['code'],
    fields: ['name', 'note', 'sender', 'target', 'parts'],
  },
  milestone: {
    table: 'analytics_milestones',
    key: ['code'],
    // shown — поле column вехи: «column» в SQL — слово языка.
    fields: [
      'name',
      'note',
      'sender',
      'type',
      'count',
      'condition',
      'days',
      'anchor',
      'shown',
      'position',
    ],
  },
  funnel: {
    table: 'analytics_funnels',
    key: ['code'],
    fields: ['name', 'note', 'strict', 'main', 'steps', 'position'],
  },
  check: {
    table: 'analytics_checks',
    key: ['code'],
    fields: ['name', 'note', 'enabled', 'notify', 'params'],
  },
};

const _GROUPS = Object.keys(_TABLES) as SetupGroup[];

export var defineSetupRepository = (db: Database): SetupRepository => {
  const revision = db.query<{ revision: number }, []>(
    'SELECT revision FROM analytics_settings WHERE id = 1'
  );
  const senders = db.query<SenderRow, []>(
    'SELECT code, name, note, enabled, summary_at, archived_at FROM analytics_senders ORDER BY code'
  );
  const types = db.query<TypeRow, []>(
    'SELECT sender, code, name, note, role, properties, archived_at FROM analytics_types ORDER BY sender, code'
  );
  const properties = db.query<PropertyRow, []>(
    'SELECT scope, code, name, note, kind, dictionary, dimension, untrusted, reconcile, archived_at FROM analytics_properties ORDER BY scope, code'
  );
  const dictionaries = db.query<DictionaryRow, []>(
    'SELECT code, name, note, purpose, utm, length, archived_at FROM analytics_dictionaries ORDER BY code'
  );
  const values = db.query<ValueRow, []>(
    'SELECT dictionary, code, name, note, position, awaits_spend, archived_at FROM analytics_values ORDER BY dictionary, position, code'
  );
  const schemas = db.query<SchemaRow, []>(
    'SELECT sender, name, note, separator, length, parts, archived_at FROM analytics_schemas ORDER BY sender'
  );
  const referrers = db.query<ReferrerRow, []>(
    'SELECT code, name, note, kind, host, parts, archived_at FROM analytics_referrers ORDER BY code'
  );
  const links = db.query<LinkRow, []>(
    'SELECT code, name, note, sender, target, parts, archived_at FROM analytics_links ORDER BY code'
  );
  const milestones = db.query<MilestoneRow, []>(
    'SELECT code, name, note, sender, type, count, condition, days, anchor, shown, position, archived_at FROM analytics_milestones ORDER BY position, code'
  );
  const funnels = db.query<FunnelRow, []>(
    'SELECT code, name, note, strict, main, steps, position, archived_at FROM analytics_funnels ORDER BY position, code'
  );
  const checks = db.query<CheckRow, []>(
    'SELECT code, name, note, enabled, notify, params, archived_at FROM analytics_checks ORDER BY code'
  );
  const setRevision = db.query<unknown, [number, string]>(`
    INSERT INTO analytics_settings (id, value, revision, updated_at) VALUES (1, '{}', ?, ?)
    ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at`);
  // query, а не prepare: запросы query база закрывает вместе с собой, а незакрытый prepare держал бы
  // соединение и его -shm открытыми после close.
  const put = Object.fromEntries(
    _GROUPS.map((_) => [
      _,
      db.query(_upsert(_TABLES[_].table, _TABLES[_].key, _TABLES[_].fields)),
    ])
  ) as Record<SetupGroup, ReturnType<Database['query']>>;
  const drop = Object.fromEntries(
    _GROUPS.map((_) => [_, db.query(_delete(_TABLES[_].table, _TABLES[_].key))])
  ) as Record<SetupGroup, ReturnType<Database['query']>>;
  // Ключи удалённого отправителя не должны подписывать нового с тем же кодом.
  const dropKeys = db.query<unknown, [string]>(
    'DELETE FROM analytics_sender_keys WHERE sender = ?'
  );
  const commit = db.transaction(
    (next: number, changes: readonly ItemChange[], at: string) => {
      changes.forEach(
        (_) =>
          void (_.after === null
            ? (drop[_.group].run(
                ..._COLUMNS[_.group](_.before!).slice(
                  0,
                  _TABLES[_.group].key.length
                )
              ),
              _.group === 'sender' && dropKeys.run((_.before as Sender).code))
            : put[_.group].run(
                ...([
                  ..._COLUMNS[_.group](_.after),
                  _.after.archivedAt,
                  at,
                  at,
                ] as (string | number | null)[])
              ))
      );
      setRevision.run(next, at);
    }
  );
  return {
    load: () => ({
      revision: revision.get()?.revision ?? 0,
      senders: senders.all().map(
        (_): Sender => ({
          code: _.code,
          name: _.name,
          note: _.note,
          enabled: _.enabled === 1,
          summaryAt: _.summary_at,
          archivedAt: _.archived_at,
        })
      ),
      types: types.all().map(
        (_): EventType => ({
          sender: _.sender,
          code: _.code,
          name: _.name,
          note: _.note,
          role: _.role as EventRole,
          properties: JSON.parse(_.properties) as TypeProperty[],
          archivedAt: _.archived_at,
        })
      ),
      properties: properties.all().map(
        (_): Property => ({
          scope: _.scope as PropertyScope,
          code: _.code,
          name: _.name,
          note: _.note,
          kind: _.kind as PropertyKind,
          dictionary: _.dictionary,
          dimension: _.dimension === 1,
          untrusted: _.untrusted === 1,
          reconcile: _.reconcile as ReconcileMark | null,
          archivedAt: _.archived_at,
        })
      ),
      dictionaries: dictionaries.all().map(
        (_): Dictionary => ({
          code: _.code,
          name: _.name,
          note: _.note,
          purpose: _.purpose as DictionaryPurpose,
          utm: _.utm as UtmParameter | null,
          length: _.length,
          archivedAt: _.archived_at,
        })
      ),
      values: values.all().map(
        (_): DictionaryValue => ({
          dictionary: _.dictionary,
          code: _.code,
          name: _.name,
          note: _.note,
          position: _.position,
          awaitsSpend: _.awaits_spend === null ? null : _.awaits_spend === 1,
          archivedAt: _.archived_at,
        })
      ),
      schemas: schemas.all().map(
        (_): LabelSchema => ({
          sender: _.sender,
          name: _.name,
          note: _.note,
          separator: _.separator as LabelSeparator,
          length: _.length,
          parts: JSON.parse(_.parts) as string[],
          archivedAt: _.archived_at,
        })
      ),
      referrers: referrers.all().map(
        (_): ReferrerRule => ({
          code: _.code,
          name: _.name,
          note: _.note,
          kind: _.kind as ReferrerKind,
          host: _.host,
          parts: JSON.parse(_.parts) as Parts,
          archivedAt: _.archived_at,
        })
      ),
      links: links.all().map(
        (_): GoLink => ({
          code: _.code,
          name: _.name,
          note: _.note,
          sender: _.sender,
          target: _.target,
          parts: JSON.parse(_.parts) as Parts,
          archivedAt: _.archived_at,
        })
      ),
      milestones: milestones.all().map(
        (_): Milestone => ({
          code: _.code,
          name: _.name,
          note: _.note,
          sender: _.sender,
          type: _.type,
          count: _.count,
          condition:
            _.condition === null
              ? null
              : (JSON.parse(_.condition) as MilestoneCondition),
          days: _.days,
          anchor: _.anchor,
          column: _.shown === 1,
          position: _.position,
          archivedAt: _.archived_at,
        })
      ),
      funnels: funnels.all().map(
        (_): Funnel => ({
          code: _.code,
          name: _.name,
          note: _.note,
          strict: _.strict === 1,
          main: _.main === 1,
          steps: JSON.parse(_.steps) as FunnelStep[],
          position: _.position,
          archivedAt: _.archived_at,
        })
      ),
      checks: checks.all().map(
        (_): QualityCheck => ({
          code: _.code,
          name: _.name,
          note: _.note,
          enabled: _.enabled === 1,
          notify: _.notify as CheckNotify,
          params: JSON.parse(_.params) as
            | Record<string, number>
            | ThresholdRule,
          archivedAt: _.archived_at,
        })
      ),
    }),
    commit: (next, changes, at) => void commit(next, changes, at),
  };
};

type LogRow = {
  readonly id: number;
  readonly at: string;
  readonly user_id: number | null;
  readonly user_name: string;
  readonly agent: number;
  readonly item: string;
  readonly key: string;
  readonly action: string;
  readonly before: string | null;
  readonly after: string | null;
};

const _json = (value: unknown): string | null =>
  value === null || value === undefined ? null : JSON.stringify(value);

const _parsed = (text: string | null): unknown =>
  text === null ? null : JSON.parse(text);

export var defineSetupLog = (db: Database): SetupLog => {
  const insert = db.query<
    unknown,
    [
      string,
      number | null,
      string,
      number,
      string,
      string,
      string,
      string | null,
      string | null,
    ]
  >(`
    INSERT INTO analytics_setup_log (at, user_id, user_name, agent, item, key, action, before, after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const page = db.query<LogRow, [number, number]>(`
    SELECT id, at, user_id, user_name, agent, item, key, action, before, after
    FROM analytics_setup_log WHERE id < ? ORDER BY id DESC LIMIT ?`);
  return {
    append: (entries) =>
      entries.forEach(
        (_) =>
          void insert.run(
            _.at,
            _.author?.id ?? null,
            _.author?.name ?? '',
            Number(_.author?.agent === true),
            _.item,
            _.key,
            _.action,
            _json(_.before),
            _json(_.after)
          )
      ),
    list: (before, limit) =>
      page.all(before ?? Number.MAX_SAFE_INTEGER, limit).map(
        (_): SetupLogEntry => ({
          id: _.id,
          at: _.at,
          author:
            _.user_id === null
              ? null
              : { id: _.user_id, name: _.user_name, agent: _.agent === 1 },
          item: _.item as SetupLogEntry['item'],
          key: _.key,
          action: _.action as SetupAction,
          before: _parsed(_.before),
          after: _parsed(_.after),
        })
      ),
  };
};

export var defineEventReferences = (db: Database): EventReferences => {
  const bySender = db.query<{ found: number }, [string]>(
    'SELECT 1 AS found FROM analytics_events WHERE sender = ? LIMIT 1'
  );
  const byType = db.query<{ found: number }, [string, string]>(
    'SELECT 1 AS found FROM analytics_events WHERE sender = ? AND type = ? LIMIT 1'
  );
  // Часть и значение строки расхода — ключом и значением её JSON: код части в путь JSON не подставляется.
  const bySpend = db.query<
    { found: number },
    { readonly part: string; readonly value: string | null }
  >(`
    SELECT 1 AS found FROM analytics_spend AS s, json_each(s.parts) AS p
    WHERE p.key = $part AND ($value IS NULL OR p.value = $value) LIMIT 1`);
  const byCheck = db.query<{ found: number }, [string]>(
    'SELECT 1 AS found FROM analytics_check_days WHERE check_code = ? LIMIT 1'
  );
  return {
    sender: (code) => bySender.get(code) !== null,
    type: (sender, code) => byType.get(sender, code) !== null,
    spend: (part, value) => bySpend.get({ part, value }) !== null,
    results: (check) => byCheck.get(check) !== null,
  };
};
