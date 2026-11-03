import { attempt, fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';

/** Настройки статистики сайта: идут в копию сайта вместе с ним. */
export type StatsSettings = {
  /** Считать просмотры. Выключено, пока владелец не включит: о счёте нужно сказать в политике сайта. */
  readonly enabled: boolean;
  /** Маячок целей: крохотный скрипт на страницах сообщает о переходе по ссылкам-целям. */
  readonly beacon: boolean;
  /** Ссылки-цели — начала адресов: `https://app.example.com/signup`, `/kontakt`, `tel:`, `mailto:`. */
  readonly goalLinks: readonly string[];
  /** Сколько дней хранить сводки; 0 — всегда. */
  readonly retentionDays: number;
  /** Часовой пояс суток статистики (IANA); пусто — пояс сервера. */
  readonly timeZone: string;
};

export var DEFAULT_STATS_SETTINGS: StatsSettings = {
  enabled: false,
  beacon: false,
  goalLinks: [],
  retentionDays: 0,
  timeZone: '',
};

const _MAX_LINKS = 20;
const _GOAL_LINK =
  /^(?:https?:\/\/[^\s/?#<>"']+[^\s<>"']*|\/[^\s<>"']*|mailto:[^\s<>"']*|tel:[^\s<>"']*)$/;

const _links = (settings: StatsSettings): StatsSettings =>
  ((links) =>
    links.length > _MAX_LINKS
      ? fail('stats.too_many_links', `At most ${_MAX_LINKS} goal links`)
      : ((bad) =>
          bad === undefined
            ? { ...settings, goalLinks: links }
            : fail(
                'stats.invalid_link',
                `"${bad}" is not a link start like https://example.com/signup, /contact, tel: or mailto:`
              ))(links.find((_) => _.length > 300 || !_GOAL_LINK.test(_))))([
    ...new Set(settings.goalLinks.map((_) => String(_).trim()).filter(Boolean)),
  ]);

// Меньше месяца хранить нельзя: отчёт за 30 дней показывал бы дыру.
const _retention = (settings: StatsSettings): StatsSettings =>
  Number.isInteger(settings.retentionDays) &&
  (settings.retentionDays === 0 ||
    (settings.retentionDays >= 30 && settings.retentionDays <= 3650))
    ? settings
    : fail(
        'stats.invalid_retention',
        `Keep statistics 30 to 3650 days or always (0), not "${settings.retentionDays}"`
      );

const _zone = (settings: StatsSettings): StatsSettings =>
  ((zone) =>
    zone === '' ||
    (/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zone) &&
      attempt(
        () => (new Intl.DateTimeFormat('en', { timeZone: zone }), true),
        () => false
      ))
      ? { ...settings, timeZone: zone }
      : fail(
          'stats.invalid_time_zone',
          `"${zone}" is not a time zone like Europe/Berlin`
        ))(String(settings.timeZone).trim());

const _flags = (settings: StatsSettings): StatsSettings => ({
  ...settings,
  enabled: settings.enabled === true,
  beacon: settings.beacon === true,
});

/** Новые настройки поверх нынешних: неизвестные ключи не берутся, нарушенное правило — отказ. */
export var changeStatsSettings = (
  current: StatsSettings,
  patch: Readonly<Record<string, unknown>>
): StatsSettings =>
  pipe(
    (_: Readonly<Record<string, unknown>>) =>
      Object.fromEntries(
        Object.keys(DEFAULT_STATS_SETTINGS)
          .filter((key) => _[key] !== undefined)
          .map((key) => [key, _[key]])
      ),
    (_) =>
      ({
        ...current,
        ..._,
        goalLinks: Array.isArray(_.goalLinks)
          ? (_.goalLinks as unknown[]).map(String)
          : current.goalLinks,
        retentionDays:
          _.retentionDays === undefined
            ? current.retentionDays
            : Number(_.retentionDays),
      }) as StatsSettings,
    _flags,
    _links,
    _retention,
    _zone
  )(patch);

/** Цель по ссылке: начало адреса, с которого считается переход. */
export var linkGoal = (prefix: string): string => `link:${prefix}`;

/** Цель по форме: каждая принятая заявка, кроме спама. */
export var formGoal = (name: string): string => `form:${name}`;
