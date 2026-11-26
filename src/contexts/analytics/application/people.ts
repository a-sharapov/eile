import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { CODE_LIMITS } from '../domain/codes.ts';
import { parseSubject, type Touch } from '../domain/envelope.ts';
import type { AnalyticsEvent, ErasureOrigin } from '../domain/events.ts';
import {
  type Acquisition,
  acquisitionOf,
  foldPerson,
  type HistoryEvent,
  type MilestoneState,
  milestoneStateOf,
  PERSON_STATES,
  type Person,
  type PersonFacts,
  type PersonState,
  stateOf,
} from '../domain/person.ts';
import type {
  AnalyticsCrypto,
  ConflictEntry,
  ErasedTally,
  Erasure,
  ErasureLog,
  EventJournal,
  EventStore,
  PeopleBuild,
  PeopleFilter,
  PeopleIndex,
  PeopleStore,
  SetupRepository,
  Transaction,
} from '../domain/ports.ts';
import { type AnalyticsSettings, retentionCutoff } from '../domain/settings.ts';
import type { Setup, SetupAuthor } from '../domain/setup.ts';
import { erasedSince } from '../domain/tally.ts';
import { cleanText, TEXT_LIMITS } from '../domain/text.ts';
import { defineEraser } from './erasure.ts';
import { ALL_EVENTS, type EventView, eventsPage } from './journal.ts';
import {
  queryChoice,
  queryCode,
  queryCursor,
  queryFlag,
  queryLimit,
  queryOffset,
} from './query.ts';

export type PeopleQuery = {
  readonly state?: string | null;
  readonly sender?: string | null;
  /** Начало псевдонима. */
  readonly q?: string | null;
  /** Показывать и людей из одних тестовых событий. */
  readonly test?: boolean;
  readonly offset?: number;
  readonly limit?: number;
  /** Период отчёта — по приходу (у `return` — по возвращению): `days`, `from`–`to` или `all`. */
  readonly days?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly all?: unknown;
  readonly attribution?: unknown;
  /** Фильтры отчёта: `part.<код>`, `trait.<код>`, `prop.<код>`, `answer.<вопрос>` → значение. */
  readonly filters?: Readonly<Record<string, unknown>>;
  /** Только достигшие вехи; с `reached=0` — не достигшие (окно кончилось, «ещё в окне» не в счёт). */
  readonly milestone?: unknown;
  readonly reached?: unknown;
  /** `payment` — период по первой оплате, только клиенты: люди когорты и «Новые клиенты» строки. */
  readonly by?: unknown;
  /** Шаг воронки (номер с нуля, шаг-человек): дошедшие до него или остановившиеся перед ним. */
  readonly funnel?: unknown;
  readonly step?: unknown;
  readonly stage?: unknown;
  /** Только люди, чьи события несут разные первые касания: окно дня «Первое касание неизменно». */
  readonly firstTouchConflict?: unknown;
};

/** Параметры отчёта в запросе списка: с ними список считается по строкам людей, а не по индексу. */
export var REPORT_PEOPLE_FIELDS = [
  'days',
  'from',
  'to',
  'all',
  'attribution',
  'filters',
  'milestone',
  'reached',
  'by',
  'funnel',
  'step',
  'stage',
] as const;

/** Веха у человека на момент чтения: состояние и окно. */
export type MilestoneView = {
  readonly state: MilestoneState;
  readonly reachedAt: string | null;
  /** Начало окна: приход или первое событие типа-начала; null — начала нет. */
  readonly from: string | null;
  /** Конец окна; null — окна нет или веха без срока. */
  readonly until: string | null;
};

/**
 * Человек для экрана и агента: чужой текст — после чистки, вехи — с состоянием на момент чтения, источник
 * привлечения — кодами: названия подставляет экран.
 */
export type PersonView = Omit<PersonFacts, 'milestones'> & {
  readonly milestones: Readonly<Record<string, MilestoneView>>;
  readonly acquisition: Acquisition;
};

/**
 * Человек в списке: факты из таблицы людей и состояние на момент чтения. Деньги и комиссии по времени, отрезки
 * доступа и первые события типов — вход отчётов: их отдаёт карточка.
 */
export type PersonListed = Omit<
  PersonView,
  'money' | 'feeMoney' | 'access' | 'firsts'
> & {
  readonly state: PersonState;
};

export type PeoplePage = {
  readonly people: readonly PersonListed[];
  /** Всего людей под фильтром. */
  readonly total: number;
  /** Людей, которых фон ещё пересчитывает по новой настройке; 0 — список свежий. */
  readonly stale: number;
};

export type CardQuery = {
  /** Номер приёма события, после которого продолжить ленту. */
  readonly before?: number | null;
  readonly limit?: number;
};

/** Карточка: человек, свёрнутый заново, лента его событий от новых к старым и конфликты повтора. */
export type PersonCard = {
  readonly person: PersonView & Pick<Person, 'unmatched'>;
  readonly state: PersonState;
  readonly events: readonly EventView[];
  readonly next: number | null;
  readonly conflicts: readonly ConflictEntry[];
};

export type PeopleErased = {
  readonly people: number;
  readonly events: number;
};

export type PeoplePorts = {
  readonly events: EventStore;
  readonly journal: EventJournal;
  readonly erasures: ErasureLog;
  readonly people: PeopleStore;
  /** Счёт стёртого: удаление, ждавшее справочника, и повторное стирание после восстановления копии. */
  readonly erased: ErasedTally;
  /** Настройка из базы: пересборка не верит снимку — его мог обогнать другой процесс. */
  readonly setups: SetupRepository;
  /** Снимок настройки в памяти сервиса. */
  readonly setup: () => Setup;
  readonly settings: () => AnalyticsSettings;
  readonly crypto: AnalyticsCrypto;
  readonly transaction: Transaction;
  readonly bus: EventBus;
  readonly clock: () => Date;
  /** Идёт ли фон сервера: без него список пересчитывает отставших сам. */
  readonly running: () => boolean;
};

// Пачка пересборки — около 20 мс на быстром ядре (замер ADR): приёмник между пачками отвечает как обычно.
const _BATCH = 500;
const _EXPIRE_BATCH = 500;

type _Advanced = {
  readonly more: boolean;
  readonly events: readonly AnalyticsEvent[];
};

type _Pass = PeopleErased & {
  readonly cutoff: string;
  readonly done: boolean;
};

const _erased = (origin: ErasureOrigin, events: number): AnalyticsEvent => ({
  type: 'analytics.person_erased',
  origin,
  events,
});

const _complete = (build: PeopleBuild | null, revision: number): boolean =>
  build !== null && build.revision === revision && build.cursor === null;

const _touch = <T extends Touch>(touch: T | null): T | null =>
  touch === null
    ? null
    : { ...touch, label: cleanText(touch.label, TEXT_LIMITS.label) };

// Метки, ответы и строки признаков пишут люди и чужие системы: наружу — после чистки. Части меток — коды
// разбора: чистить в них нечего.
const _clean = <T extends PersonFacts>(person: T): T => ({
  ...person,
  firstTouch: _touch(person.firstTouch),
  lastTouch: _touch(person.lastTouch),
  returns: person.returns.map((_) => ({ ..._, touch: _touch(_.touch) })),
  answers: Object.fromEntries(
    Object.entries(person.answers).map(({ 0: question, 1: answer }) => [
      question,
      {
        ...answer,
        text:
          answer.text === null
            ? null
            : cleanText(answer.text, TEXT_LIMITS.text),
      },
    ])
  ),
  traits: Object.fromEntries(
    Object.entries(person.traits).map(({ 0: code, 1: value }) => [
      code,
      typeof value === 'string' ? cleanText(value, TEXT_LIMITS.text) : value,
    ])
  ),
});

/** Человек для экрана и агента: чистка чужого текста, вехи с состоянием, источник привлечения. */
export var personView = (
  person: PersonFacts,
  setup: Setup,
  now: string
): PersonView => ({
  ..._clean(person),
  milestones: Object.fromEntries(
    Object.entries(person.milestones).map(({ 0: code, 1: fact }) => [
      code,
      {
        state: milestoneStateOf(fact, now),
        reachedAt: fact[0],
        from: fact[2],
        until: fact[1],
      },
    ])
  ),
  acquisition: acquisitionOf(setup, person),
});

/** Человек в списке: без денег и комиссий по времени, отрезков доступа и первых событий типов. */
export var listedView = (
  { money, feeMoney, access, firsts, ...person }: PersonView,
  state: PersonState
): PersonListed => ({ ...person, state });

/** Фильтры списка: состояние, отправитель, начало псевдонима, разные первые касания, тестовые, страница. */
export var peopleFilter = (query: PeopleQuery, now: string): PeopleFilter => ({
  state: queryChoice(query.state, PERSON_STATES, 'state'),
  sender: queryCode(query.sender, CODE_LIMITS.sender, 'sender'),
  prefix:
    typeof query.q === 'string' && query.q.trim() !== ''
      ? query.q.trim()
      : null,
  conflict: queryFlag(query.firstTouchConflict, 'firstTouchConflict'),
  test: query.test === true,
  now,
  offset: queryOffset(query.offset),
  limit: queryLimit(query.limit),
});

/**
 * Люди из событий: свёртка при приёме, пересборка отставших по ревизии настройки пачками, список и карточка,
 * удаление кнопкой, срок хранения и перенос отметок удалений через восстановление копии.
 */
export var definePeople = ({
  events,
  journal,
  erasures,
  people,
  erased,
  setups,
  setup,
  settings,
  crypto,
  transaction,
  bus,
  clock,
  running,
}: PeoplePorts) => {
  // Свёртка готовит справочник ролей и признаков по снимку настройки: один раз на снимок.
  let folder: {
    readonly setup: Setup;
    readonly fold: ReturnType<typeof foldPerson>;
  } | null = null;
  // Проход срока хранения в фоне: пачка за пачкой, строка журнала — в конце прохода.
  let expiring: _Pass | null = null;
  const now = (): string => clock().toISOString();
  const foldOf = (snapshot: Setup): ReturnType<typeof foldPerson> =>
    (folder !== null && folder.setup === snapshot
      ? folder
      : (folder = { setup: snapshot, fold: foldPerson(snapshot) })
    ).fold;

  const keep = (
    subject: string,
    history: readonly HistoryEvent[],
    snapshot: Setup
  ): void =>
    ((person) =>
      void (person === null
        ? people.remove(subject)
        : people.put(person, snapshot.revision)))(
      foldOf(snapshot)(subject, history)
    );

  const refold = (subject: string, snapshot: Setup): void =>
    keep(subject, journal.history(subject), snapshot);

  const index: PeopleIndex = { fold: (subject) => refold(subject, setup()) };
  const eraser = defineEraser({
    events,
    erasures,
    people: index,
    crypto,
    erased,
  });

  // Удаление, которое ждало своей роли: тип получил роль «удаление» — стереть, как стёр бы приём. Каждое
  // исполненное удаление стирает и само событие, поэтому самое раннее из оставшихся — следующее.
  const pending = (
    sender: string,
    type: string,
    at: string,
    done: readonly AnalyticsEvent[]
  ): readonly AnalyticsEvent[] =>
    ((event) =>
      event === null
        ? done
        : pending(sender, type, at, [
            ...done,
            _erased(
              'event',
              eraser({
                subject: event.subject,
                before: event.at,
                test: event.test,
                origin: 'event',
                sender,
                userName: null,
                at,
              })
            ),
          ]))(journal.earliest(sender, type));

  const rebuild = (
    batch: readonly {
      readonly subject: string;
      readonly revision: number | null;
    }[],
    snapshot: Setup
  ): void =>
    ((stale) =>
      ((histories) =>
        stale.forEach((_) => void keep(_, histories.get(_) ?? [], snapshot)))(
        stale.length === 0
          ? new Map<string, HistoryEvent[]>()
          : journal.histories(stale[0] as string, stale.at(-1) as string)
      ))(
      batch
        .filter((_) => _.revision !== snapshot.revision)
        .map((_) => _.subject)
    );

  const advance = (snapshot: Setup, cursor: string): _Advanced =>
    ((erased) =>
      ((batch) =>
        ((done) => (
          rebuild(batch, snapshot),
          people.mark({
            revision: snapshot.revision,
            cursor: done ? null : (batch.at(-1)?.subject ?? null),
          }),
          { more: !done, events: erased }
        ))(batch.length < _BATCH))(people.batch(cursor, _BATCH)))(
      cursor === ''
        ? snapshot.types
            .filter((_) => _.role === 'erasure')
            .flatMap((_) => pending(_.sender, _.code, now(), []))
        : []
    );

  /** Одна пачка пересборки; true — работа осталась. Новая ревизия начинает проход сначала. */
  const step = (): boolean =>
    pipe(
      () =>
        transaction(() =>
          ((snapshot, build) =>
            _complete(build, snapshot.revision)
              ? { more: false, events: [] }
              : advance(
                  snapshot,
                  build?.revision === snapshot.revision
                    ? (build.cursor ?? '')
                    : ''
                ))(setups.load(), people.build())
        ),
      (_: _Advanced) => (_.events.forEach(bus.publish), _.more)
    )();

  const refresh = (): void => void (step() && refresh());

  const stale = (): number =>
    ((snapshot) =>
      _complete(people.build(), snapshot.revision)
        ? 0
        : Math.max(0, journal.subjects() - people.fresh(snapshot.revision)))(
      setup()
    );

  const ensure = (): void => void (running() || refresh());

  const expireBatch = (pass: _Pass): _Pass =>
    pipe(
      () =>
        transaction(() =>
          ((subjects) =>
            ((next) => (
              void (
                next.done &&
                next.people > 0 &&
                erasures.add({
                  at: now(),
                  before: next.cutoff,
                  origin: 'retention',
                  sender: null,
                  userName: null,
                  events: next.events,
                  people: next.people,
                  subjectHash: null,
                })
              ),
              next
            ))({
              cutoff: pass.cutoff,
              people: pass.people + subjects.length,
              events:
                pass.events +
                subjects.reduce(
                  (sum, _) => sum + events.erase(_, pass.cutoff, false),
                  0
                ),
              done: subjects.length < _EXPIRE_BATCH,
            }))(journal.expired(pass.cutoff, _EXPIRE_BATCH))
        ),
      (_: _Pass) => (
        void (
          _.done &&
          _.people > 0 &&
          bus.publish(_erased('retention', _.events))
        ),
        _
      )
    )();

  const passOf = (): _Pass | null =>
    ((months) =>
      months === 0
        ? null
        : {
            cutoff: retentionCutoff(now(), months),
            people: 0,
            events: 0,
            done: false,
          })(settings().retentionMonths);

  const drain = (pass: _Pass): _Pass =>
    pass.done ? pass : drain(expireBatch(pass));

  return {
    /** Шов свёртки для приёма: человек псевдонима заново в транзакции приёма. */
    index,
    ensure,
    people: {
      /**
       * Список: новые по последнему событию сверху, состояние — на момент чтения. Без фона сервера отставших
       * по ревизии настройки сначала пересчитывает сам; с фоном — отвечает сразу, и `stale` говорит, сколько
       * людей ещё в пересчёте.
       */
      list: (query: PeopleQuery = {}): PeoplePage =>
        ((filter) => (
          ensure(),
          ((page, snapshot) => ({
            people: page.people.map((_) =>
              listedView(
                personView(_, snapshot, filter.now),
                stateOf(_, filter.now)
              )
            ),
            total: page.total,
            stale: stale(),
          }))(people.page(filter), setup())
        ))(peopleFilter(query, now())),
      /** Карточка: человек сворачивается заново, события — страницами; псевдонима без событий нет. */
      get: (raw: unknown, query: CardQuery = {}): PersonCard =>
        ((subject, at, snapshot) =>
          ((person) =>
            person === null
              ? fail('analytics.person_not_found', 'The person has no events')
              : ((page) => ({
                  person: {
                    ...personView(person, snapshot, at),
                    unmatched: person.unmatched,
                  },
                  state: stateOf(person, at),
                  events: page.events,
                  next: page.next,
                  conflicts: journal.conflicts(subject),
                }))(
                  eventsPage(journal, snapshot, {
                    ...ALL_EVENTS,
                    subject,
                    before: queryCursor(query.before),
                    limit: queryLimit(query.limit),
                  })
                ))(foldOf(snapshot)(subject, journal.history(subject))))(
          parseSubject(raw),
          now(),
          setup()
        ),
      /**
       * Стереть историю человека кнопкой: все события от всех отправителей, строку в людях, конфликты; остаётся
       * отметка удаления. Момент — время кнопки, а если у человека есть события позже, — самое позднее из них.
       */
      erase: (raw: unknown, author: SetupAuthor | null = null): PeopleErased =>
        ((subject) =>
          pipe(
            () =>
              transaction(() =>
                ((latest, at) =>
                  latest === null
                    ? fail(
                        'analytics.person_not_found',
                        'The person has no events'
                      )
                    : eraser({
                        subject,
                        before: [latest, at].toSorted().at(-1) ?? at,
                        test: false,
                        origin: 'manager',
                        sender: null,
                        userName: author?.name ?? null,
                        at,
                      }))(journal.latest(subject), now())
              ),
            (erased: number) => (
              bus.publish(_erased('manager', erased)),
              { people: 1, events: erased }
            )
          )())(parseSubject(raw)),
      /** Пересобрать отставших по ревизии настройки до конца, без пауз. */
      refresh,
      /** Сколько людей ещё не пересчитано по нынешней настройке. */
      stale,
      /**
       * Срок хранения: стереть людей, чьё последнее событие старше срока, без отметок удаления; одна строка
       * журнала на проход, если стёрт хоть кто-то. Срок «бессрочно» — ничего.
       */
      expire: (): PeopleErased =>
        ((pass) =>
          pass === null
            ? { people: 0, events: 0 }
            : ((_) => ({ people: _.people, events: _.events }))(drain(pass)))(
          passOf()
        ),
    },
    /** Отметки удалений через восстановление копии: копия, сделанная до удаления, не воскрешает стёртых. */
    erasures: {
      /** До восстановления: строки журнала удалений с отметкой. */
      carry: (): Erasure[] => erasures.marks(),
      /**
       * После восстановления: дописать недостающие строки и стереть по отметкам события восстановленной базы, с
       * прибавкой в счёт стёртого. Ответ — сколько событий стёрто.
       */
      reapply: (carried: readonly Erasure[]): number =>
        transaction(
          () => (
            carried.forEach((_) => void (erasures.has(_) || erasures.add(_))),
            ((moments, since) =>
              moments.size === 0
                ? 0
                : journal
                    .pseudonyms()
                    .reduce(
                      (sum, subject) =>
                        ((before) =>
                          before === undefined
                            ? sum
                            : (erased.erasing(subject, before, false, since),
                              sum + events.erase(subject, before, false)))(
                          moments.get(crypto.hash(subject))
                        ),
                      0
                    ))(erasures.moments(), erasedSince(now()))
          )
        ),
    },
    /** Пачки фона сервера; true — работа осталась. */
    background: {
      people: step,
      retention: (): boolean =>
        ((pass) =>
          pass === null
            ? false
            : ((next) => ((expiring = next.done ? null : next), !next.done))(
                expireBatch(pass)
              ))(expiring ?? passOf()),
    },
  };
};

export type People = ReturnType<typeof definePeople>;
