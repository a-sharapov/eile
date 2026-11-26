import { fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS, isCode } from '../domain/codes.ts';
import {
  EVENT_LIMITS,
  type EventOrigin,
  parseSubject,
} from '../domain/envelope.ts';
import type {
  ErasureEntry,
  ErasureLog,
  EventFilter,
  EventJournal,
  LabelRegistry,
  PeopleStore,
  StoredEvent,
  Tally,
} from '../domain/ports.ts';
import { labelKey } from '../domain/report.ts';
import { EVENT_ROLES, type EventRole, ROLES } from '../domain/roles.ts';
import type { Setup } from '../domain/setup.ts';
import { cleanText, TEXT_LIMITS } from '../domain/text.ts';
import {
  queryChoice,
  queryCode,
  queryCursor,
  queryLimit,
  queryMoment,
} from './query.ts';

/** Событие для экрана и агента: роль и название — из справочника, чужой текст — после чистки. */
export type EventView = {
  readonly seq: number;
  readonly sender: string;
  readonly id: string;
  readonly type: string;
  /** Название типа из справочника; null — незнакомый тип. */
  readonly name: string | null;
  readonly role: EventRole | null;
  readonly at: string;
  readonly receivedAt: string;
  readonly subject: string | null;
  readonly test: boolean;
  readonly origin: EventOrigin;
  /** Позже приёма больше чем на час. */
  readonly future: boolean;
  /** Поля роли из `data`, которые есть в событии: строки — после `cleanText`. */
  readonly fields: Readonly<Record<string, string | number | boolean>>;
};

export type EventsPage = {
  readonly events: readonly EventView[];
  /** `before` следующей страницы; null — дальше событий нет. */
  readonly next: number | null;
};

/** Фильтр журнала событий; `before` — номер приёма, после которого продолжить. */
export type EventQuery = {
  readonly type?: string | null;
  readonly role?: string | null;
  readonly sender?: string | null;
  /** День `ГГГГ-ММ-ДД` или момент, включительно. */
  readonly from?: string | null;
  readonly to?: string | null;
  /** true — только тестовые, false — без них; не задано — все. */
  readonly test?: boolean | null;
  readonly subject?: string | null;
  readonly before?: number | null;
  readonly limit?: number;
};

/** Исходное событие: тело как пришло — экран показывает его экранированным текстом. */
export type RawEvent = Omit<EventView, 'fields'> & { readonly body: string };

/** То, чего нет в справочниках, со счётчиками: одно действие делает из записи элемент. */
export type UnknownReport = {
  /** Типы событий, которых нет у отправителя. */
  readonly types: readonly Tally<{
    readonly sender: string;
    readonly type: string;
    readonly lastAt: string;
  }>[];
  /** Вопросы опроса без справочника ответов. */
  readonly questions: readonly Tally<{ readonly question: string }>[];
  /** Ответы вне справочника своего вопроса. */
  readonly answers: readonly Tally<{
    readonly question: string;
    readonly answer: string;
  }>[];
  /** Значения свойств-выборов вне их справочника — по событиям. */
  readonly values: readonly Tally<{
    readonly property: string;
    readonly value: string;
  }>[];
  /** Значения признаков-выборов вне справочника — по людям: счёт — люди с таким значением. */
  readonly traits: readonly Tally<{
    readonly trait: string;
    readonly value: string;
  }>[];
  /**
   * Значения частей меток вне справочника части — по касаниям людей, первым и последним: счёт — касания,
   * отправитель — того, чья схема разобрала метку. Архив — знакомый.
   */
  readonly parts: readonly Tally<{
    readonly sender: string;
    readonly part: string;
    readonly value: string;
  }>[];
  /**
   * Метки первых касаний не из реестра — по людям: счёт — люди, метка — после `cleanText`. До 1000 самых частых:
   * метка с псевдонимом внутри дала бы по строке на человека.
   */
  readonly labels: readonly Tally<{
    readonly sender: string;
    readonly label: string;
  }>[];
};

export type JournalPorts = {
  readonly journal: EventJournal;
  readonly people: PeopleStore;
  readonly registry: LabelRegistry;
  readonly erasures: ErasureLog;
  readonly setup: () => Setup;
  /** Люди посчитаны по нынешней настройке — «незнакомые» признаки читаются по ним. */
  readonly ensure: () => void;
};

const _keyOf = (sender: string, type: string): string => `${sender}/${type}`;

type _Field = readonly [string, string | number | boolean];

const _fields = (
  role: EventRole,
  data: unknown
): Readonly<Record<string, string | number | boolean>> =>
  data !== null && typeof data === 'object' && !Array.isArray(data)
    ? Object.fromEntries(
        ROLES[role].fields.flatMap((field): _Field[] =>
          ((value) =>
            typeof value === 'string'
              ? [
                  [
                    field.code,
                    cleanText(
                      value,
                      field.kind === 'label'
                        ? TEXT_LIMITS.label
                        : TEXT_LIMITS.text
                    ),
                  ],
                ]
              : typeof value === 'number' || typeof value === 'boolean'
                ? [[field.code, value]]
                : [])((data as Readonly<Record<string, unknown>>)[field.code])
        )
      )
    : {};

const _future = (at: string, receivedAt: string): boolean =>
  Date.parse(at) - Date.parse(receivedAt) > EVENT_LIMITS.futureMs;

/** Вид события по снимку настройки: тип из справочника даёт название и роль. */
export var eventViews = (setup: Setup) =>
  (
    (types) =>
    (event: StoredEvent): EventView =>
      ((type) => ({
        seq: event.seq,
        sender: event.sender,
        id: event.id,
        type: event.type,
        name: type?.name ?? null,
        role: type?.role ?? null,
        at: event.at,
        receivedAt: event.receivedAt,
        subject: event.subject,
        test: event.test,
        origin: event.origin,
        future: _future(event.at, event.receivedAt),
        fields: type === undefined ? {} : _fields(type.role, event.body.data),
      }))(types.get(_keyOf(event.sender, event.type)))
  )(new Map(setup.types.map((_) => [_keyOf(_.sender, _.code), _])));

/** Пустой фильтр журнала: без условий, с начала. */
export var ALL_EVENTS: EventFilter = {
  sender: null,
  type: null,
  types: null,
  subject: null,
  from: null,
  to: null,
  test: null,
  before: null,
  limit: 50,
};

/** Страница журнала: на одно событие больше, чтобы знать, есть ли следующая. */
export var eventsPage = (
  journal: EventJournal,
  setup: Setup,
  filter: EventFilter
): EventsPage =>
  ((rows) =>
    ((shown) => ({
      events: shown.map(eventViews(setup)),
      next: rows.length > filter.limit ? (shown.at(-1)?.seq ?? null) : null,
    }))(rows.slice(0, filter.limit)))(
    journal.page({ ...filter, limit: filter.limit + 1 })
  );

const _filterOf = (query: EventQuery, setup: Setup): EventFilter =>
  ((role) => ({
    sender: queryCode(query.sender, CODE_LIMITS.sender, 'sender'),
    type: queryCode(query.type, CODE_LIMITS.type, 'type'),
    types:
      role === null
        ? null
        : setup.types
            .filter((_) => _.role === role)
            .map((_) => _keyOf(_.sender, _.code)),
    subject:
      query.subject === undefined ||
      query.subject === null ||
      query.subject === ''
        ? null
        : parseSubject(query.subject),
    from: queryMoment(query.from, 'from', false),
    to: queryMoment(query.to, 'to', true),
    test: typeof query.test === 'boolean' ? query.test : null,
    before: queryCursor(query.before),
    limit: queryLimit(query.limit),
  }))(queryChoice(query.role, EVENT_ROLES, 'role'));

// Счётчики одной записи из разных типов складываются; частые — сверху.
const _sum = <T extends object>(
  rows: readonly Tally<T>[],
  key: (row: Tally<T>) => string
): Tally<T>[] =>
  Object.values(
    rows.reduce<Readonly<Record<string, Tally<T>>>>(
      (all, row) =>
        ((k) => ({
          ...all,
          [k]: { ...row, count: (all[k]?.count ?? 0) + row.count },
        }))(key(row)),
      {}
    )
  ).toSorted((a, b) => b.count - a.count);

const _isValue = (code: unknown): code is string =>
  isCode(code, CODE_LIMITS.value);

const _known = (setup: Setup): ReadonlySet<string> =>
  new Set(setup.values.map((_) => _keyOf(_.dictionary, _.code)));

const _survey = (
  journal: EventJournal,
  setup: Setup,
  known: ReadonlySet<string>
): Pick<UnknownReport, 'questions' | 'answers'> =>
  ((rows, asked) => ({
    questions: _sum(
      rows
        .filter((_) => !asked.has(_.question))
        .map((_) => ({ question: _.question, count: _.count })),
      (_) => _.question
    ),
    answers: _sum(
      rows.filter((_) => !known.has(_keyOf(_.question, _.answer))),
      (_) => _keyOf(_.question, _.answer)
    ),
  }))(
    setup.types
      .filter((_) => _.role === 'survey')
      .flatMap((_) => journal.answers(_.sender, _.code))
      .flatMap((_) =>
        _isValue(_.question) && _isValue(_.answer)
          ? [{ question: _.question, answer: _.answer, count: _.count }]
          : []
      ),
    new Set(
      setup.dictionaries
        .filter((_) => _.purpose === 'answers')
        .map((_) => _.code)
    )
  );

const _choices = (
  setup: Setup,
  scope: 'event' | 'person'
): ReadonlyMap<string, string | null> =>
  new Map(
    setup.properties
      .filter((_) => _.scope === scope && _.kind === 'choice')
      .map((_) => [_.code, _.dictionary])
  );

const _values = (
  journal: EventJournal,
  setup: Setup,
  known: ReadonlySet<string>
): UnknownReport['values'] =>
  ((choices) =>
    _sum(
      setup.types
        .flatMap((type) =>
          ((codes) =>
            codes.length === 0
              ? []
              : journal.values(type.sender, type.code, codes))(
            type.properties.map((_) => _.code).filter((_) => choices.has(_))
          )
        )
        .flatMap((_) =>
          _isValue(_.value) &&
          !known.has(_keyOf(choices.get(_.property) ?? '', _.value))
            ? [{ property: _.property, value: _.value, count: _.count }]
            : []
        ),
      (_) => _keyOf(_.property, _.value)
    ))(_choices(setup, 'event'));

const _traits = (
  people: PeopleStore,
  setup: Setup,
  known: ReadonlySet<string>
): UnknownReport['traits'] =>
  ((choices) =>
    choices.size === 0
      ? []
      : _sum(
          people
            .traits([...choices.keys()])
            .flatMap((_) =>
              _isValue(_.value) &&
              !known.has(_keyOf(choices.get(_.trait) ?? '', _.value))
                ? [{ trait: _.trait, value: _.value, count: _.count }]
                : []
            ),
          (_) => _keyOf(_.trait, _.value)
        ))(_choices(setup, 'person'));

const _parts = (
  people: PeopleStore,
  known: ReadonlySet<string>
): UnknownReport['parts'] =>
  people
    .parts()
    .flatMap((_) =>
      typeof _.value === 'string' && !known.has(_keyOf(_.part, _.value))
        ? [{ sender: _.sender, part: _.part, value: _.value, count: _.count }]
        : []
    )
    .toSorted((a, b) => b.count - a.count);

const _UNKNOWN_LABELS = 1000;

// Метка из реестра — по ключу реестра (строчными, без краёв); незнакомая — после чистки, одинаковые после неё
// складываются.
const _labels = (registry: LabelRegistry): UnknownReport['labels'] =>
  ((known) =>
    Array.from(
      Map.groupBy(
        registry
          .touches()
          .filter((_) => !known.has(`${_.sender}/${labelKey(_.label)}`))
          .map((_) => ({
            sender: _.sender,
            label: cleanText(_.label, TEXT_LIMITS.label),
            count: _.count,
          }))
          .filter((_) => _.label !== ''),
        (_) => `${_.sender}/${_.label}`
      ).values(),
      (group) => ({
        sender: (group[0] as { readonly sender: string }).sender,
        label: (group[0] as { readonly label: string }).label,
        count: group.reduce((sum, _) => sum + _.count, 0),
      })
    )
      .toSorted((a, b) => b.count - a.count)
      .slice(0, _UNKNOWN_LABELS))(
    new Set(registry.list(null).map((_) => `${_.sender}/${_.label}`))
  );

/** Чтение событий: журнал страницами, исходное тело, «незнакомые», журнал удалений. */
export var defineJournal = ({
  journal,
  people,
  registry,
  erasures,
  setup,
  ensure,
}: JournalPorts) => ({
  events: {
    /** Журнал событий: новые сверху; роль — по нынешнему справочнику типов. */
    list: (query: EventQuery = {}): EventsPage =>
      ((snapshot) => eventsPage(journal, snapshot, _filterOf(query, snapshot)))(
        setup()
      ),
    /** Событие с телом как пришло — для «показать тело»; нет такого — `analytics.event_not_found`. */
    body: (seq: number): RawEvent =>
      ((event) =>
        event === null
          ? fail('analytics.event_not_found', `There is no event ${seq}`)
          : ((view) => ({
              seq: view.seq,
              sender: view.sender,
              id: view.id,
              type: view.type,
              name: view.name,
              role: view.role,
              at: view.at,
              receivedAt: view.receivedAt,
              subject: view.subject,
              test: view.test,
              origin: view.origin,
              future: view.future,
              body: event.body,
            }))(eventViews(setup())({ ...event, body: {} })))(
        Number.isInteger(seq) ? journal.one(seq) : null
      ),
  },
  /**
   * Типы, вопросы, ответы, значения и значения частей не из справочника со счётчиками (архив — знакомый); метки
   * первых касаний не из реестра.
   */
  unknown: (): UnknownReport => (
    ensure(),
    ((snapshot, known) => ({
      types: journal
        .types()
        .filter(
          (_) =>
            !snapshot.types.some(
              (type) => type.sender === _.sender && type.code === _.type
            )
        )
        .toSorted((a, b) => b.count - a.count),
      ..._survey(journal, snapshot, known),
      values: _values(journal, snapshot, known),
      traits: _traits(people, snapshot, known),
      parts: _parts(people, known),
      labels: _labels(registry),
    }))(setup(), _known(setup()))
  ),
  /** Журнал удалений страницами, новые сверху: псевдонимов в нём нет. */
  erasures: (before: number | null, limit: unknown): ErasureEntry[] =>
    erasures.list(before, queryLimit(limit)),
});

export type Journal = ReturnType<typeof defineJournal>;
