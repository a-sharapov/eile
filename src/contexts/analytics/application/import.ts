import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { CODE_LIMITS, parseCode } from '../domain/codes.ts';
import type { AnalyticsEvent } from '../domain/events.ts';
import type {
  AnalyticsCrypto,
  ErasedTally,
  ErasureLog,
  EventStore,
  FileLine,
  ImportLedger,
  IntakeTally,
  LineSource,
  PeopleIndex,
  Transaction,
} from '../domain/ports.ts';
import type { AnalyticsSettings } from '../domain/settings.ts';
import type { Sender, Setup } from '../domain/setup.ts';
import { type TallyOutcome, utcDay } from '../domain/tally.ts';
import { cleanText } from '../domain/text.ts';
import {
  defineReceiver,
  type IntakeOutcome,
  intakeOff,
  type Receipt,
  refusedReceipt,
} from './intake.ts';

export type ImportOptions = {
  /** Код отправителя файла; не задан — единственный действующий отправитель сайта. */
  readonly sender?: string | null;
  /** Проверить и посчитать, ничего не записывая. */
  readonly dryRun?: boolean;
};

/** Ошибка строки файла: номер строки с единицы, путь поля и причина — без значений из файла. */
export type ImportError = {
  readonly line: number;
  readonly path: string;
  readonly message: string;
};

/**
 * Итог загрузки файла; у `dryRun` — то, что сделала бы загрузка. Каждая строка попадает ровно в один счёт:
 * `lines = empty + accepted + erasures + duplicates + conflicts + erased + rejected`.
 */
export type ImportReport = {
  readonly sender: string;
  readonly dryRun: boolean;
  /** Строк в файле, вместе с пустыми. */
  readonly lines: number;
  /** Пустых строк: пропущены. */
  readonly empty: number;
  readonly accepted: number;
  /** Событий удаления: стёрли историю и сами не хранятся. */
  readonly erasures: number;
  /** Повторов того же тела под принятым `id`. */
  readonly duplicates: number;
  /** Повторов с другим телом: первое событие остаётся, конфликт записан. */
  readonly conflicts: number;
  /** «Стёрто»: псевдоним стёрт не раньше события, событие не хранится. */
  readonly erased: number;
  /** Строк с ошибками: пропущены. */
  readonly rejected: number;
  /** Первые 100 ошибок по строкам и полям. */
  readonly errors: readonly ImportError[];
  /** Предупреждения принятых строк по видам: `unknown_type`, `future`, `invalid_value:data.<код>` → строк. */
  readonly warnings: Readonly<Record<string, number>>;
  /** Людей, чьи события приняты или стёрты; null — больше 100 000, их не считали. */
  readonly people: number | null;
};

export type ImportPorts = {
  readonly events: EventStore;
  readonly erasures: ErasureLog;
  /** Свёртка человека: в конце пачки, по разу на человека. */
  readonly people: PeopleIndex;
  /** Счёт приёма: строки пачки — одной строкой на ключ в её транзакции. */
  readonly tally: IntakeTally;
  readonly erased: ErasedTally;
  readonly crypto: AnalyticsCrypto;
  readonly transaction: Transaction;
  readonly bus: EventBus;
  readonly clock: () => Date;
  readonly settings: () => AnalyticsSettings;
  readonly setup: () => Setup;
  /** Пауза между пачками: сервер на этой базе отвечает и получает блокировку записи. */
  readonly pause: () => Promise<void>;
  /** Новый учёт принятых строк для пробного прогона. */
  readonly ledger: () => ImportLedger;
};

export var IMPORT_LIMITS = {
  /** Строк файла в одной транзакции. */
  batch: 500,
  /** Ошибок в отчёте подробно; всего строк с ошибками — `rejected`. */
  errors: 100,
  /** Знаков пути и причины ошибки: путь бывает ключом из файла. */
  text: 200,
  /** Людей, которых отчёт считает поимённо в памяти. */
  people: 100_000,
} as const;

type _Tally = Omit<ImportReport, 'sender' | 'dryRun' | 'people'>;

const _START: _Tally = {
  lines: 0,
  empty: 0,
  accepted: 0,
  erasures: 0,
  duplicates: 0,
  conflicts: 0,
  erased: 0,
  rejected: 0,
  errors: [],
  warnings: {},
};

const _warned = (tally: _Tally, warnings: readonly string[]): _Tally =>
  warnings.length === 0
    ? tally
    : {
        ...tally,
        warnings: Object.fromEntries(
          [...new Set([...Object.keys(tally.warnings), ...warnings])].map(
            (kind) => [
              kind,
              (tally.warnings[kind] ?? 0) +
                warnings.filter((_) => _ === kind).length,
            ]
          )
        ),
      };

const _listed = (
  tally: _Tally,
  line: number,
  errors: Readonly<Record<string, string>>
): readonly ImportError[] =>
  tally.errors.length >= IMPORT_LIMITS.errors
    ? tally.errors
    : [
        ...tally.errors,
        ...Object.entries(errors).map(({ 0: path, 1: message }) => ({
          line,
          path: cleanText(path, IMPORT_LIMITS.text),
          message: cleanText(message, IMPORT_LIMITS.text),
        })),
      ].slice(0, IMPORT_LIMITS.errors);

const _COUNT: {
  readonly [K in IntakeOutcome['kind']]: (
    tally: _Tally,
    outcome: Extract<IntakeOutcome, { kind: K }>,
    line: number
  ) => _Tally;
} = {
  accepted: (tally, _) => ({
    ..._warned(tally, _.warnings),
    accepted: tally.accepted + 1,
  }),
  erasure: (tally, _) => ({
    ..._warned(tally, _.warnings),
    erasures: tally.erasures + 1,
  }),
  duplicate: (tally, _) =>
    _.conflict
      ? { ...tally, conflicts: tally.conflicts + 1 }
      : { ...tally, duplicates: tally.duplicates + 1 },
  erased: (tally) => ({ ...tally, erased: tally.erased + 1 }),
  invalid: (tally, _, line) => ({
    ...tally,
    rejected: tally.rejected + 1,
    errors: _listed(tally, line, _.errors),
  }),
};

const _counted = (
  tally: _Tally,
  outcome: IntakeOutcome,
  line: number
): _Tally =>
  (
    _COUNT[outcome.kind] as (
      tally: _Tally,
      outcome: IntakeOutcome,
      line: number
    ) => _Tally
  )({ ...tally, lines: tally.lines + 1 }, outcome, line);

const _active = (sender: Sender): boolean =>
  sender.enabled && sender.archivedAt === null;

const _named = (setup: Setup, raw: unknown): string =>
  ((code) =>
    ((sender) =>
      sender === undefined
        ? fail('analytics.sender_not_found', `Sender ${code} does not exist`)
        : _active(sender)
          ? code
          : fail(
              'analytics.sender_inactive',
              `Sender ${code} is archived or turned off: its events are not accepted`
            ))(setup.senders.find((_) => _.code === code)))(
    parseCode(raw, CODE_LIMITS.sender, 'Sender')
  );

// В конверте отправителя нет: у HTTP его называет ключ, у файла — флаг; на сайте один — флаг не нужен.
const _only = (setup: Setup): string =>
  ((active) =>
    active.length === 1
      ? (active[0] as Sender).code
      : active.length === 0
        ? fail(
            'analytics.no_sender',
            'The site has no active sender: create one in the manager first'
          )
        : fail(
            'analytics.sender_required',
            `The site has ${active.length} active senders: name the sender of the file`
          ))(setup.senders.filter(_active));

const _senderOf = (setup: Setup, raw: unknown): string =>
  raw === undefined || raw === null || raw === ''
    ? _only(setup)
    : _named(setup, raw);

const _later = (
  a: string | null | undefined,
  b: string | null
): string | null =>
  a === null || a === undefined ? b : b === null || a > b ? a : b;

/**
 * Пробный прогон ничего не пишет в базу сайта: повторы ищутся в ней и среди принятых строк файла (учёт —
 * вне памяти), а удаления из файла действуют на строки после них, как при загрузке, — отметками в памяти.
 */
const _dry = (
  events: EventStore,
  erasures: ErasureLog,
  ledger: ImportLedger
) => {
  const marks = new Map<string, string>();
  return {
    events: {
      find: (sender, id) =>
        ((hash) =>
          hash === null ? events.find(sender, id) : { hash, subject: null })(
          ledger.find(id)
        ),
      add: (event) => (ledger.add(event.envelope.id, event.hash), 0),
      conflict: () => undefined,
      erase: () => 0,
    } satisfies EventStore,
    // Проба не считает ничего: ни приёма, ни стёртого.
    erased: {
      add: () => undefined,
      erasing: () => undefined,
      once: () => undefined,
      daily: () => [],
      expire: () => 0,
    } satisfies ErasedTally,
    erasures: {
      ...erasures,
      add: (_) =>
        void (
          _.subjectHash !== null &&
          marks.set(
            _.subjectHash,
            _later(marks.get(_.subjectHash), _.before) as string
          )
        ),
      until: (hash) => _later(marks.get(hash), erasures.until(hash)),
    } satisfies ErasureLog,
  };
};

type _Batch = {
  readonly tally: _Tally;
  readonly events: readonly AnalyticsEvent[];
};

const _empty = (all: _Batch): _Batch => ({
  ...all,
  tally: {
    ...all.tally,
    lines: all.tally.lines + 1,
    empty: all.tally.empty + 1,
  },
});

const _receipt = (all: _Batch, receipt: Receipt, line: number): _Batch => ({
  tally: _counted(all.tally, receipt.outcome, line),
  events:
    receipt.events.length === 0
      ? all.events
      : [...all.events, ...receipt.events],
});

/**
 * Загрузка файла JSON Lines: каждая строка проходит приём, как событие по HTTP, с происхождением `file`.
 * Запись — пачками по 500 строк в транзакции, люди пачки сворачиваются в её конце, между пачками — пауза.
 */
export var defineImport = ({
  events,
  erasures,
  people,
  tally: daily,
  erased,
  crypto,
  transaction,
  bus,
  clock,
  settings,
  setup,
  pause,
  ledger,
}: ImportPorts) => {
  // Один прогон: люди пачки сворачиваются раз на человека в её конце, а не на каждое его событие.
  const session = (sender: string, dryRun: boolean) => {
    const seen = dryRun ? ledger() : null;
    const pending = new Set<string>();
    const touched = new Set<string>();
    let uncounted = false;
    // Счёт приёма пачки: сутки и исход → число; в базу — строкой на ключ в транзакции пачки.
    const counts = new Map<string, number>();
    const index: PeopleIndex = {
      fold: (subject) =>
        void (dryRun || pending.add(subject),
        touched.has(subject) || touched.size < IMPORT_LIMITS.people
          ? touched.add(subject)
          : (uncounted = true)),
    };
    const receive = defineReceiver({
      ...(seen === null
        ? { events, erasures, erased }
        : _dry(events, erasures, seen)),
      people: index,
      crypto,
      clock,
      setup,
    });

    const count = (receipt: Receipt): Receipt => (
      void (
        seen === null &&
        ((day) =>
          receipt.counts.forEach(
            (outcome) =>
              void ((key) => counts.set(key, (counts.get(key) ?? 0) + 1))(
                `${day}/${outcome}`
              )
          ))(utcDay(receipt.receivedAt))
      ),
      receipt
    );

    const counted = () =>
      [...counts].map(({ 0: key, 1: count }) => ({
        day: key.slice(0, 10),
        sender,
        origin: 'file' as const,
        outcome: key.slice(11) as TallyOutcome,
        count,
      }));

    const read = (all: _Batch, line: FileLine): _Batch =>
      'error' in line
        ? _receipt(
            all,
            count(refusedReceipt({ body: line.error }, clock().toISOString())),
            line.line
          )
        : line.text.trim() === ''
          ? _empty(all)
          : _receipt(all, count(receive(sender, line.text, 'file')), line.line);

    const write = (report: _Tally, lines: readonly FileLine[]): _Batch =>
      transaction(
        () => (
          pending.clear(),
          counts.clear(),
          ((batch) => (
            pending.forEach((_) => void people.fold(_)),
            daily.add(counted()),
            batch
          ))(lines.reduce(read, { tally: report, events: [] }))
        )
      );

    return {
      /** Пачка строк; приём выключили посреди загрузки — отказ, загруженные пачки остаются. */
      store: (tally: _Tally, lines: readonly FileLine[]): _Tally =>
        !settings().enabled
          ? intakeOff()
          : seen !== null
            ? seen.batch(() => lines.reduce(read, { tally, events: [] })).tally
            : pipe(
                () => write(tally, lines),
                (_) => (_.events.forEach(bus.publish), _.tally)
              )(),
      report: (tally: _Tally): ImportReport => ({
        sender,
        dryRun,
        ...tally,
        people: uncounted ? null : touched.size,
      }),
      close: (): void => seen?.close(),
    };
  };

  const drain = (
    source: LineSource,
    store: (tally: _Tally, lines: readonly FileLine[]) => _Tally,
    tally: _Tally
  ): Promise<_Tally> =>
    source
      .next(IMPORT_LIMITS.batch)
      .then((lines) =>
        lines.length === 0
          ? tally
          : ((next) => pause().then(() => drain(source, store, next)))(
              store(tally, lines)
            )
      );

  return (
    source: LineSource,
    options: ImportOptions = {}
  ): Promise<ImportReport> =>
    Promise.resolve(options)
      .then(
        pipe(
          (_: ImportOptions) =>
            session(
              settings().enabled ? _senderOf(setup(), _.sender) : intakeOff(),
              _.dryRun === true
            ),
          (run) =>
            drain(source, run.store, _START).then(run.report).finally(run.close)
        )
      )
      .finally(() => source.close());
};
