import type { Field, FieldValue } from './field.ts';
import type { FieldValues, Moment, Page, PageChanges, PageId } from './page.ts';

/** Кто правил страницу; null — сам сайт: каркас, импорт, плагин, команда CLI. */
export type Author = { readonly id: number; readonly name: string };

export type RevisionAction = 'edited' | 'restored';

/** Что помнит история: текст и описание страницы, но не место в дереве, публикацию и расписание. */
export var REVISION_KEYS = [
  'kind',
  'title',
  'longTitle',
  'menuTitle',
  'description',
  'introText',
  'alias',
  'template',
  'contentType',
  'content',
  'linkTo',
  'socialImage',
  'language',
] as const;

export type Snapshot = Pick<Page, (typeof REVISION_KEYS)[number] | 'fields'>;

/**
 * Версия страницы: какой она была до правки. `at` — последняя правка, которая её сменила, `changed` —
 * что изменилось с тех пор: ключи страницы и `fields.имя`.
 */
export type Revision = {
  readonly id: number;
  readonly pageId: PageId;
  readonly action: RevisionAction;
  readonly author: Author | null;
  readonly at: Moment;
  readonly changed: readonly string[];
  /** Возврат: время версии, к которой вернулись. */
  readonly restoredFrom: Moment | null;
  readonly snapshot: Snapshot;
  /** Байт снимка в UTF-8 — из них складывается бюджет страницы. */
  readonly size: number;
};

export type NewRevision = Omit<Revision, 'id'>;

/** Правки одного человека подряд в пределах 10 минут — одна версия: частые Ctrl+S не вытесняют историю. */
export var MERGE_MS = 10 * 60_000;

/**
 * Сколько версий хранить у страницы (ADR 0026): не больше 30 и не больше 512 КБ снимков, но последние 5 —
 * всегда, даже у очень длинной страницы.
 */
export var RETENTION = { max: 30, budget: 512 * 1024, min: 5 } as const;

export type Retention = { max: number; budget: number; min: number };

export var snapshotOf = (page: Page): Snapshot =>
  Object.fromEntries([
    ...REVISION_KEYS.map((_) => [_, page[_]] as const),
    ['fields', page.fields],
  ]) as Snapshot;

const _sameValue = (
  a: FieldValue | undefined,
  b: FieldValue | undefined
): boolean => a === b;

/** Чем отличаются два снимка: ключи страницы и `fields.имя` в порядке REVISION_KEYS. */
export var changesBetween = (a: Snapshot, b: Snapshot): string[] => [
  ...REVISION_KEYS.filter((_) => a[_] !== b[_]),
  ...[...new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])]
    .sort()
    .filter((_) => !_sameValue(a.fields[_], b.fields[_]))
    .map((_) => `fields.${_}`),
];

const _encoder = new TextEncoder();

export var sizeOf = (snapshot: Snapshot): number =>
  _encoder.encode(JSON.stringify(snapshot)).length;

const _sameAuthor = (a: Author | null, b: Author | null): boolean =>
  a === null || b === null ? a === b : a.id === b.id;

// В обе стороны: время создания пишет база, время правки — часы сервиса, и они могут разойтись.
const _within = (from: Moment, to: Moment): boolean =>
  Math.abs(Date.parse(to) - Date.parse(from)) < MERGE_MS;

/** Что сделать с историей после правки страницы. */
export type RevisionPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'add'; readonly revision: NewRevision }
  | { readonly kind: 'merge'; readonly revision: Revision }
  | { readonly kind: 'drop'; readonly id: number };

export type Edit = {
  readonly before: Page;
  readonly after: Page;
  readonly action: RevisionAction;
  readonly author: Author | null;
  readonly at: Moment;
  readonly restoredFrom?: Moment | null;
  /** Когда страница создана: правки в первые 10 минут — продолжение создания, версии нет. */
  readonly createdAt: Moment | null;
};

const _NONE: RevisionPlan = { kind: 'none' };

/**
 * Правка страницы и последняя версия → что записать. Правка того же человека в пределах 10 минут
 * продолжает версию: снимок остаётся прежним, обновляются время и список изменений; вернул всё как было —
 * версия больше не нужна. Возврат к версии всегда начинает новую.
 */
export var planRevision = (latest: Revision | null, edit: Edit): RevisionPlan =>
  ((after) =>
    changesBetween(snapshotOf(edit.before), after).length === 0
      ? _NONE
      : latest === null &&
          edit.action === 'edited' &&
          edit.createdAt !== null &&
          _within(edit.createdAt, edit.at)
        ? _NONE
        : latest !== null &&
            latest.action === 'edited' &&
            edit.action === 'edited' &&
            _sameAuthor(latest.author, edit.author) &&
            _within(latest.at, edit.at)
          ? ((changed) =>
              changed.length === 0
                ? { kind: 'drop', id: latest.id }
                : {
                    kind: 'merge',
                    revision: { ...latest, at: edit.at, changed },
                  })(changesBetween(latest.snapshot, after))
          : ((snapshot) => ({
              kind: 'add',
              revision: {
                pageId: edit.before.id,
                action: edit.action,
                author: edit.author,
                at: edit.at,
                changed: changesBetween(snapshot, after),
                restoredFrom: edit.restoredFrom ?? null,
                snapshot,
                size: sizeOf(snapshot),
              },
            }))(snapshotOf(edit.before)))(snapshotOf(edit.after));

/** Какие версии оставить: новые первыми, пока влезают в число и бюджет; последние `min` — всегда. */
export var retained = (
  history: readonly { readonly id: number; readonly size: number }[],
  policy: Retention = RETENTION
): number[] =>
  history.reduce<{ keep: number[]; bytes: number }>(
    (acc, _, index) =>
      index < policy.max &&
      (index < policy.min || acc.bytes + _.size <= policy.budget)
        ? { keep: [...acc.keep, _.id], bytes: acc.bytes + _.size }
        : acc,
    { keep: [], bytes: 0 }
  ).keep;

/**
 * Возврат к версии: её поля страницы и значения полей. Поле, которого больше нет или которое не
 * назначено шаблону версии, пропускается; своё значение, которого в версии не было, снимается.
 */
export var restoreChanges = (
  snapshot: Snapshot,
  current: Page,
  fields: readonly Field[]
): { changes: PageChanges; fields: FieldValues } =>
  ((assigned) => ({
    changes: Object.fromEntries(
      REVISION_KEYS.map((_) => [_, snapshot[_]] as const)
    ) as PageChanges,
    fields: Object.fromEntries([
      ...Object.keys(current.fields)
        .filter((_) => assigned.has(_) && snapshot.fields[_] === undefined)
        .map((_) => [_, null] as const),
      ...Object.entries(snapshot.fields).filter(({ 0: name }) =>
        assigned.has(name)
      ),
    ]),
  }))(
    new Set(
      fields
        .filter((_) => _.templates.includes(snapshot.template))
        .map((_) => _.name as string)
    )
  );
