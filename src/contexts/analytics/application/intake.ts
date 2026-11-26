import { defineClientKey } from '../../../shared/kernel/client-key.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import {
  checkEvent,
  type Envelope,
  type EventOrigin,
  type FieldErrors,
  isEventId,
  readEventBody,
} from '../domain/envelope.ts';
import type { AnalyticsEvent } from '../domain/events.ts';
import { type SenderKey, staleUse } from '../domain/keys.ts';
import type {
  AnalyticsCrypto,
  ErasedTally,
  ErasureLog,
  EventStore,
  IntakeTally,
  PeopleIndex,
  RefusalTally,
  Transaction,
} from '../domain/ports.ts';
import type { AnalyticsSettings } from '../domain/settings.ts';
import type { Setup } from '../domain/setup.ts';
import {
  acceptedCounts,
  erasedSince,
  intakeRows,
  type TallyOutcome,
  utcDay,
} from '../domain/tally.ts';
import { defineEraser } from './erasure.ts';

/**
 * Чем кончился приём события: `accepted` — сохранено, `erasure` — событие удаления стёрло историю и не
 * хранится, `duplicate` — этот `id` у отправителя уже есть, `erased` — псевдоним стёрт не раньше события.
 */
export type IntakeOutcome =
  | { readonly kind: 'accepted'; readonly warnings: readonly string[] }
  | {
      readonly kind: 'erasure';
      readonly events: number;
      readonly warnings: readonly string[];
    }
  | { readonly kind: 'duplicate'; readonly conflict: boolean }
  | { readonly kind: 'erased' }
  | {
      readonly kind: 'invalid';
      /** `id` события, если он годится: найти событие у отправителя. */
      readonly id: string | null;
      readonly errors: FieldErrors;
    };

/** Отказ приёмника — в памяти, для экрана приёма: 400, 401 и 429. */
export type IntakeRefusal = {
  readonly at: string;
  readonly reason: 'invalid' | 'unauthorized' | 'throttled';
  /** null — ключ не проверяли или не узнали. */
  readonly sender: string | null;
  readonly id: string | null;
  readonly errors: FieldErrors;
};

export type IntakePorts = {
  readonly events: EventStore;
  readonly erasures: ErasureLog;
  readonly people: PeopleIndex;
  /** Счёт приёма: исходы событий — в транзакции события. */
  readonly tally: IntakeTally;
  /** Счёт стёртого: «стёрто», события удаления и то, что удаление стёрло. */
  readonly erased: ErasedTally;
  /** Счёт отказов в памяти процесса. */
  readonly refusals: RefusalTally;
  readonly crypto: AnalyticsCrypto;
  readonly transaction: Transaction;
  readonly bus: EventBus;
  readonly clock: () => Date;
  readonly settings: () => AnalyticsSettings;
  /** Снимок настройки: в памяти сервиса. */
  readonly setup: () => Setup;
  /** Ключи сайта в памяти и отметка «когда пользовались». */
  readonly keys: {
    readonly all: () => readonly SenderKey[];
    readonly touch: (id: number, at: string) => void;
  };
};

// Перебор ключа: 5 неверных с адреса за 15 минут, затем 429 до конца окна; записей не больше, чем у входа.
const _WINDOW_MS = 15 * 60_000;
const _MAX_FAILURES = 5;
const _TRACKED = 10_000;
const _REFUSALS = 50;
// Отказ с телом на 64 КБ ошибок не держит в памяти всё: путей и знаков в причине — с запасом для экрана.
const _REFUSAL_ERRORS = 20;
const _REFUSAL_TEXT = 200;

/**
 * Решение по событию, доменные события, которые публикуются после транзакции, и что прибавить в счёт приёма
 * за сутки UTC `receivedAt`.
 */
export type Receipt = {
  readonly outcome: IntakeOutcome;
  readonly events: readonly AnalyticsEvent[];
  readonly counts: readonly TallyOutcome[];
  readonly receivedAt: string;
};

export type ReceiverPorts = Pick<
  IntakePorts,
  'events' | 'erasures' | 'people' | 'crypto' | 'clock' | 'setup' | 'erased'
>;

// Исход в счёте — вид решения; повтор с другим телом — конфликт. Отметки принятого считает `store`.
const _quiet = (outcome: IntakeOutcome, now: string): Receipt => ({
  outcome,
  events: [],
  counts: [
    outcome.kind === 'duplicate' && outcome.conflict
      ? 'conflict'
      : (outcome.kind as TallyOutcome),
  ],
  receivedAt: now,
});

/** Отказ строки до приёма — тело не прочитать: в счёт он идёт как 400. */
export var refusedReceipt = (errors: FieldErrors, now: string): Receipt =>
  _quiet({ kind: 'invalid', id: null, errors }, now);

const _brief = (errors: FieldErrors): FieldErrors =>
  Object.fromEntries(
    Object.entries(errors)
      .slice(0, _REFUSAL_ERRORS)
      .map(({ 0: path, 1: message }) => [
        path.slice(0, _REFUSAL_TEXT),
        message.slice(0, _REFUSAL_TEXT),
      ])
  );

const _active = (setup: Setup, code: string): boolean =>
  setup.senders.some(
    (_) => _.code === code && _.enabled && _.archivedAt === null
  );

/**
 * Решение по одному событию отправителя — тексту тела: повтор, проверка, отметка удаления, удаление событием
 * или запись со свёрткой человека. Транзакцию и выключатель держит вызывающий: приёмник — на событие,
 * загрузка файла — на пачку строк.
 */
export var defineReceiver = ({
  events,
  erasures,
  people,
  crypto,
  clock,
  setup,
  erased,
}: ReceiverPorts) => {
  // Повтор — до полной проверки: второй раз отправитель ничего нового не сообщает, даже если по нынешней
  // настройке событие уже не прошло бы.
  const repeated = (
    sender: string,
    id: string,
    text: string,
    hash: string,
    now: string
  ): Receipt | null =>
    ((found) =>
      found === null
        ? null
        : found.hash === hash
          ? _quiet({ kind: 'duplicate', conflict: false }, now)
          : (events.conflict({
              sender,
              id,
              subject: found.subject,
              body: text,
              hash,
              at: now,
            }),
            _quiet({ kind: 'duplicate', conflict: true }, now)))(
      events.find(sender, id)
    );

  const erasedBefore = (envelope: Envelope): boolean =>
    envelope.subject !== null &&
    ((until) => until !== null && envelope.at <= until)(
      erasures.until(crypto.hash(envelope.subject))
    );

  const eraser = defineEraser({ events, erasures, people, crypto, erased });

  // Событие, которого в таблице не будет: «стёрто» или само удаление, — в счёт стёртого, если оно не старше
  // его срока. Один раз: повтор с тем же телом узнаётся по отпечатку и счёта не меняет.
  const unkept = (
    sender: string,
    envelope: Envelope,
    hash: string,
    now: string
  ): void =>
    void (
      envelope.at >= erasedSince(now) &&
      erased.once(
        {
          day: utcDay(envelope.at),
          sender,
          type: envelope.type,
          test: envelope.test,
          events: 1,
        },
        hash
      )
    );

  // Удаление стирает события псевдонима от всех отправителей и само не хранится; у тестового — без отметки.
  const erase = (
    sender: string,
    envelope: Envelope,
    hash: string,
    warnings: readonly string[],
    now: string
  ): Receipt =>
    ((count) => (
      unkept(sender, envelope, hash, now),
      {
        outcome: { kind: 'erasure', events: count, warnings },
        events: [
          { type: 'analytics.person_erased', origin: 'event', events: count },
        ],
        counts: ['erasure'],
        receivedAt: now,
      }
    ))(
      eraser({
        subject: envelope.subject as string,
        before: envelope.at,
        test: envelope.test,
        origin: 'event',
        sender,
        userName: null,
        at: now,
      })
    );

  const store = (
    event: {
      readonly sender: string;
      readonly envelope: Envelope;
      readonly body: string;
      readonly hash: string;
      readonly origin: EventOrigin;
    },
    warnings: readonly string[],
    now: string
  ): Receipt => (
    events.add({ ...event, receivedAt: now }),
    void (
      event.envelope.subject !== null && people.fold(event.envelope.subject)
    ),
    {
      outcome: { kind: 'accepted', warnings },
      events: [],
      counts: acceptedCounts(event.envelope.at, now, event.origin, warnings),
      receivedAt: now,
    }
  );

  const admit = (
    sender: string,
    body: Readonly<Record<string, unknown>>,
    text: string,
    hash: string,
    origin: EventOrigin,
    now: string
  ): Receipt =>
    ((checked) =>
      !checked.ok
        ? _quiet(
            {
              kind: 'invalid',
              id: isEventId(body.id) ? body.id : null,
              errors: checked.errors,
            },
            now
          )
        : erasedBefore(checked.envelope)
          ? (unkept(sender, checked.envelope, hash, now),
            _quiet({ kind: 'erased' }, now))
          : checked.role === 'erasure'
            ? erase(sender, checked.envelope, hash, checked.warnings, now)
            : store(
                {
                  sender,
                  envelope: checked.envelope,
                  body: text,
                  hash,
                  origin,
                },
                checked.warnings,
                now
              ))(checkEvent(body, { setup: setup(), sender, now }));

  return (sender: string, text: string, origin: EventOrigin): Receipt =>
    ((read, now) =>
      read.ok
        ? ((hash) =>
            (isEventId(read.body.id)
              ? repeated(sender, read.body.id, text, hash, now)
              : null) ?? admit(sender, read.body, text, hash, origin, now))(
            crypto.fingerprint(read.canonical)
          )
        : refusedReceipt(read.errors, now))(
      readEventBody(text),
      clock().toISOString()
    );
};

/** Сообщение выключенного приёма: отказ один для приёмника и загрузки файла. */
export var intakeOff = (): never =>
  fail(
    'analytics.disabled',
    'Event intake is off: turn it on in the manager, Settings → Statistics'
  );

/**
 * Приём событий: выключатель, перебор ключа, сверка ключа, проверка и запись события со счётом приёма одной
 * транзакцией. Счётчики неудач и последние отказы — в памяти: пересборка контекстов их сбрасывает, как
 * счётчики входа; счёт отказов — в памяти процесса и пачкой в базе.
 */
export var defineIntake = ({
  events,
  erasures,
  people,
  tally,
  erased,
  refusals: counter,
  crypto,
  transaction,
  bus,
  clock,
  settings,
  setup,
  keys,
}: IntakePorts) => {
  const clientKey = defineClientKey();
  const failures = new Map<string, { count: number; since: number }>();
  let refusals: readonly IntakeRefusal[] = [];
  const receive = defineReceiver({
    events,
    erasures,
    people,
    crypto,
    clock,
    setup,
    erased,
  });

  // Отказ 400 пишет память, а не транзакция события: отправитель с ошибкой в коде шлёт их тысячами.
  const counted = (
    receipt: Receipt,
    sender: string,
    origin: EventOrigin
  ): Receipt => (
    tally.add(
      intakeRows(
        receipt.counts.filter((_) => _ !== 'invalid'),
        utcDay(receipt.receivedAt),
        sender,
        origin
      )
    ),
    receipt
  );

  const refused = (outcome: TallyOutcome, sender: string | null): void =>
    counter.add({
      day: utcDay(clock().toISOString()),
      sender: sender ?? '',
      origin: 'http',
      outcome,
      count: 1,
    });

  const fresh = (key: string, at: number) =>
    ((entry) => (entry && at - entry.since < _WINDOW_MS ? entry : null))(
      failures.get(key)
    );

  // Таблица не растёт без конца: сначала уходят устаревшие записи, потом самые старые.
  const prune = (at: number): void =>
    void (
      failures.size > _TRACKED &&
      ([...failures].forEach(
        ({ 0: key, 1: entry }) =>
          void (at - entry.since >= _WINDOW_MS && failures.delete(key))
      ),
      [...failures.keys()]
        .slice(0, Math.max(0, failures.size - _TRACKED))
        .forEach((key) => void failures.delete(key)))
    );

  const failed = (client: string): void =>
    ((key, at) => (
      failures.set(
        key,
        ((entry) =>
          entry
            ? { ...entry, count: entry.count + 1 }
            : { count: 1, since: at })(fresh(key, at))
      ),
      prune(at)
    ))(clientKey(client), clock().getTime());

  // Сверка с каждым ключом сайта, без выхода на первом совпадении: время не выдаёт, какой ключ совпал.
  const keyOf = (presented: string): SenderKey | null =>
    ((hash) =>
      keys
        .all()
        .reduce<SenderKey | null>(
          (match, key) => (crypto.same(key.hash, hash) ? key : match),
          null
        ))(crypto.hash(presented));

  const touched = (key: SenderKey): string =>
    ((now) => (
      void (staleUse(key, now) && keys.touch(key.id, now)), key.sender
    ))(clock().toISOString());

  return {
    /** Принимает ли сайт события; выключен — никаким путём. */
    enabled: (): boolean => settings().enabled,
    /** Секунд до конца окна, если с адреса уже было 5 неверных ключей за 15 минут; null — не заперт. */
    throttled: (client: string): number | null =>
      ((at) =>
        ((entry) =>
          entry !== null && entry.count >= _MAX_FAILURES
            ? Math.max(1, Math.ceil((entry.since + _WINDOW_MS - at) / 1000))
            : null)(fresh(clientKey(client), at)))(clock().getTime()),
    /**
     * Код отправителя по ключу из `Authorization: Bearer …`; ключа нет, он чужой, отправитель выключен или в
     * архиве — null, и неудача засчитывается адресу.
     */
    authorize: (presented: string | null, client: string): string | null =>
      ((key) =>
        key !== null && _active(setup(), key.sender)
          ? touched(key)
          : (failed(client), null))(
        presented === null ? null : keyOf(presented)
      ),
    /**
     * Событие отправителя — текст тела: повтор, проверка, отметка удаления, запись и свёртка человека — одной
     * транзакцией. Приём выключен — `analytics.disabled`.
     */
    accept: (
      sender: string,
      text: string,
      origin: EventOrigin
    ): IntakeOutcome =>
      settings().enabled
        ? pipe(
            () =>
              transaction(() =>
                counted(receive(sender, text, origin), sender, origin)
              ),
            (_) => (_.events.forEach(bus.publish), _.outcome)
          )()
        : intakeOff(),
    /** Отказ 400, 401 или 429: в последние 50 и в счёт отказов. */
    refuse: (refusal: Omit<IntakeRefusal, 'at'>): void =>
      void (refused(refusal.reason, refusal.sender),
      (refusals = [
        {
          ...refusal,
          at: clock().toISOString(),
          errors: _brief(refusal.errors),
        },
        ...refusals,
      ].slice(0, _REFUSALS))),
    /** Ответ 503 при выключенном приёме: в счёт отказов, ключ ещё не проверяли. */
    unavailable: (): void => refused('disabled', null),
    /** Последние 50 отказов, новые сверху. */
    refusals: (): readonly IntakeRefusal[] => refusals,
  };
};

export type Intake = ReturnType<typeof defineIntake>;
