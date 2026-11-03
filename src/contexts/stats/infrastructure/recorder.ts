import { attempt } from '../../../shared/kernel/errors.ts';
import type { Recorder } from '../domain/ports.ts';
import {
  DEFAULT_STATS_SETTINGS,
  type StatsSettings,
} from '../domain/settings.ts';
import {
  type GoalIncrement,
  goalTally,
  type Increment,
  type Visitor,
  viewTally,
} from '../domain/tally.ts';
import { addDays, type Day, dayOf, networkOf } from '../domain/visit.ts';
import type { StatsStore } from './sqlite-stats.ts';

// Буфер — не больше стольких строк: дальше он уходит в базу сразу, не дожидаясь таймера. Строка — около
// 200 байт, предел — около мегабайта при любом потоке ботов с новыми User-Agent.
const _PENDING_LIMIT = 5000;

// Хэш посетителя — 72 бита в base64url: на сотню тысяч посетителей в день совпадений нет, а по хэшу без
// соли адреса не восстановить.
const _ID_LENGTH = 12;

const _log = (error: unknown): void => console.error(error);

/**
 * Счётчик процесса: соль дня живёт только в памяти и меняется в полночь пояса статистики; с ней уходят
 * и посетители дня. Прибавки копятся в памяти и пишутся в базу пачкой: по таймеру сервера, при отчёте,
 * при остановке и когда буфер полон.
 */
export var defineRecorder = ({
  store,
  clock,
  random = () => crypto.getRandomValues(new Uint8Array(32)),
  soon = (run) => void setTimeout(run, 0),
}: {
  store: StatsStore;
  clock: () => Date;
  random?: () => Uint8Array;
  /** Записать буфер вскоре, вне текущего ответа. */
  soon?: (run: () => void) => void;
}): Recorder & {
  /** Сменить день, если наступил новый: таймер сервера зовёт его и без посетителей. */
  readonly tick: () => void;
} => {
  let settings: StatsSettings = DEFAULT_STATS_SETTINGS;
  let day: Day | null = null;
  let salt: Uint8Array = new Uint8Array(0);
  let queued = false;
  const traffic = new Map<string, Increment>();
  const goals = new Map<string, GoalIncrement>();
  const visitors = new Map<string, Visitor>();

  const today = (): Day => dayOf(clock(), settings.timeZone);

  const pending = (): number => traffic.size + goals.size + visitors.size;

  const clear = (): void => (traffic.clear(), goals.clear(), visitors.clear());

  // Сбой записи не должен копить буфер без конца: прибавки теряются, сайт отвечает дальше.
  const flush = (): void =>
    void (
      day !== null &&
      pending() > 0 &&
      ((written) => (
        attempt(
          () =>
            store.write(
              written,
              [...traffic.values()],
              [...goals.values()],
              [...visitors]
            ),
          _log
        ),
        clear()
      ))(day)
    );

  // Новые сутки: буфер прошлых — в базу, посетители и соль прошлых — забыть, старые сводки — по сроку.
  const roll = (): Day =>
    ((now) => (
      day !== now &&
        (flush(),
        attempt(store.forgetVisitors, _log),
        (salt = random()),
        (day = now),
        settings.retentionDays > 0 &&
          attempt(
            () => store.purgeBefore(addDays(now, -settings.retentionDays)),
            _log
          )),
      now
    ))(today());

  const idOf = (client: string, userAgent: string): string =>
    new Bun.CryptoHasher('sha256', salt)
      .update(networkOf(client))
      .update('\n')
      .update(userAgent)
      .digest('base64url')
      .slice(0, _ID_LENGTH);

  const known = (now: Day, id: string): Visitor | null =>
    visitors.get(id) ?? store.visitor(now, id);

  const add = (increment: Increment): void =>
    ((key) =>
      ((before) =>
        void traffic.set(
          key,
          before
            ? {
                ...before,
                visitors: before.visitors + increment.visitors,
                views: before.views + increment.views,
              }
            : increment
        ))(traffic.get(key)))(`${increment.dimension}\u0000${increment.value}`);

  const addGoal = (increment: GoalIncrement): void =>
    ((key) =>
      ((before) =>
        void goals.set(
          key,
          before
            ? {
                ...before,
                visitors: before.visitors + increment.visitors,
                events: before.events + increment.events,
              }
            : increment
        ))(goals.get(key)))(
      `${increment.goal}\u0000${increment.dimension}\u0000${increment.value}`
    );

  const bound = (): void =>
    void (
      pending() >= _PENDING_LIMIT &&
      !queued &&
      ((queued = true), soon(() => ((queued = false), flush())))
    );

  return {
    configure: (next) =>
      ((was) => (
        (settings = next),
        // Счёт выключили — посетители и соль дня уходят сразу, а не в полночь.
        void (
          was &&
          !next.enabled &&
          (flush(), attempt(store.forgetVisitors, _log), (day = null))
        )
      ))(settings.enabled),
    view: (client, userAgent, visit, page) =>
      attempt(
        () =>
          ((now) =>
            ((id) =>
              ((found) =>
                ((visitor) => (
                  found === null && visitors.set(id, visitor),
                  viewTally(visitor, found === null, page).forEach(add),
                  bound()
                ))(found ?? { ...visit(), goals: {} }))(known(now, id)))(
              idOf(client, userAgent)
            ))(roll()),
        _log
      ),
    goal: (client, userAgent, goal) =>
      attempt(
        () =>
          ((now) =>
            ((id) =>
              ((found) =>
                ((next) =>
                  next === null
                    ? false
                    : (visitors.set(id, next.visitor),
                      next.increments.forEach(addGoal),
                      bound(),
                      true))(found && goalTally(found, goal)))(known(now, id)))(
              idOf(client, userAgent)
            ))(roll()),
        (error) => (_log(error), false)
      ),
    flush,
    today,
    tick: () => void attempt(() => (roll(), flush()), _log),
  };
};
