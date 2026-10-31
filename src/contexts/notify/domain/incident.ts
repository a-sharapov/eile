import type { Alert } from '../../../shared/kernel/report.ts';
import type { ChannelKind } from './message.ts';

/** Сбой сайта или критическое событие: что случилось и насколько это важно. */
export type Incident = Alert & {
  /** Каналы, которыми о сбое не сообщать: о сбое Telegram — не через Telegram. */
  readonly avoid?: readonly ChannelKind[];
};

export var fingerprintOf = (incident: Incident): string =>
  (incident.key ?? `${incident.kind}:${incident.title.en}`).slice(0, 300);

/** Одинаковые сбои за окно склеиваются: первый уходит сразу, повторы — счётчиком в следующем. */
export var REPEAT_WINDOW_MS = 15 * 60 * 1000;

/** Уведомлений о сбоях в час — не больше: дальше одно «сбоев слишком много» и тишина до конца часа. */
export var HOURLY_CAP = 20;

const _HOUR_MS = 60 * 60 * 1000;
const _MAX_TRACKED = 1000;

type Window = { readonly since: number; readonly repeats: number };

export type Throttle = {
  readonly windows: ReadonlyMap<string, Window>;
  readonly hour: {
    readonly start: number;
    readonly sent: number;
    readonly flooded: boolean;
  };
};

export var EMPTY_THROTTLE: Throttle = {
  windows: new Map(),
  hour: { start: 0, sent: 0, flooded: false },
};

/** send — отправить (repeats — сколько раз повторялся с прошлого уведомления), hold — только журнал, flood — одно «слишком много». */
export type Verdict =
  | { readonly kind: 'send'; readonly repeats: number }
  | { readonly kind: 'hold' }
  | { readonly kind: 'flood' };

// Окна живут сутки — счётчик повторов доходит до следующего уведомления; память ограничена числом окон.
const _fresh = (
  windows: ReadonlyMap<string, Window>,
  now: number
): Map<string, Window> =>
  new Map(
    [...windows]
      .filter(({ 1: _ }) => now - _.since < 24 * _HOUR_MS)
      .slice(-_MAX_TRACKED)
  );

/** Решение по одному сбою и новое состояние окна повторов и часового потолка. */
export var admit = (
  state: Throttle,
  fingerprint: string,
  now: number
): { readonly state: Throttle; readonly verdict: Verdict } => {
  const hour =
    now - state.hour.start >= _HOUR_MS
      ? { start: now, sent: 0, flooded: false }
      : state.hour;
  const open = state.windows.get(fingerprint);
  const repeating = open !== undefined && now - open.since < REPEAT_WINDOW_MS;
  const windows = _fresh(state.windows, now);
  const verdict: Verdict = repeating
    ? { kind: 'hold' }
    : hour.sent < HOURLY_CAP
      ? { kind: 'send', repeats: open?.repeats ?? 0 }
      : hour.flooded
        ? { kind: 'hold' }
        : { kind: 'flood' };
  return {
    verdict,
    state: {
      windows: windows.set(
        fingerprint,
        repeating
          ? { since: open.since, repeats: open.repeats + 1 }
          : { since: now, repeats: 0 }
      ),
      hour: {
        start: hour.start,
        sent: hour.sent + (verdict.kind === 'send' ? 1 : 0),
        flooded: hour.flooded || verdict.kind === 'flood',
      },
    },
  };
};
