import {
  type Localized,
  localized,
  type ManagerLanguage,
} from '../../../shared/kernel/manager-language.ts';
import { addDays, type Day } from './days.ts';
import { MINOR_UNITS } from './money.ts';
import type { QualityNotice } from './ports.ts';
import type {
  CheckClock,
  CheckDay,
  CurrencyCount,
  QualityDecision,
  TypeCount,
} from './quality.ts';
import { isVersionText } from './summary.ts';

/** Названия встроенных проверок на языках менеджера: в уведомлении, на экране и у агента (по-английски). */
export var CHECK_NAMES: Readonly<Record<string, Localized>> = {
  summary_arrived: {
    en: 'Summary arrived',
    de: 'Zusammenfassung eingegangen',
    ru: 'Сводка пришла',
  },
  events_arrived: {
    en: 'Events arrived',
    de: 'Ereignisse angekommen',
    ru: 'События дошли',
  },
  revenue_matches: {
    en: 'Revenue matches',
    de: 'Umsatz stimmt',
    ru: 'Выручка сходится',
  },
  sender_delivered: {
    en: 'Sender delivered everything',
    de: 'Absender hat alles zugestellt',
    ru: 'Отправитель доставил всё',
  },
  sender_facts: {
    en: 'Sender’s own count',
    de: 'Zählung des Absenders',
    ru: 'Счёт отправителя',
  },
  labels_readable: {
    en: 'Labels are readable',
    de: 'Labels sind lesbar',
    ru: 'Метки читаются',
  },
  intake_refusals: {
    en: 'Intake refusals',
    de: 'Abgelehnte Ereignisse',
    ru: 'Отказы приёмника',
  },
  repeat_conflicts: {
    en: 'Repeat conflicts',
    de: 'Wiederholungskonflikte',
    ru: 'Конфликт повтора',
  },
  payment_duplicates: {
    en: 'No duplicate payments',
    de: 'Keine doppelten Zahlungen',
    ru: 'Нет дублей оплат',
  },
  first_touch_stable: {
    en: 'First touch is stable',
    de: 'Erster Kontakt unverändert',
    ru: 'Первое касание неизменно',
  },
  event_time: { en: 'Event time', de: 'Ereigniszeit', ru: 'Время события' },
  all_known: {
    en: 'Everything is known',
    de: 'Alles bekannt',
    ru: 'Всё знакомо',
  },
  links_arrive: {
    en: 'Links arrive',
    de: 'Weiterleitungen kommen an',
    ru: 'Переходы доходят',
  },
  rate_present: {
    en: 'Rates are entered',
    de: 'Kurse vorhanden',
    ru: 'Курс есть',
  },
  statement_matches: {
    en: 'Statement matches',
    de: 'Abgleich mit Kontoauszug',
    ru: 'Сверка с выпиской',
  },
  low_data: { en: 'Low data', de: 'Wenig Daten', ru: 'Мало данных' },
};

// Что случилось — заголовок уведомления об одной проверке.
const _PROBLEM: Readonly<Record<string, Localized>> = {
  summary_arrived: {
    en: 'the summary did not arrive',
    de: 'Tageszusammenfassung fehlt',
    ru: 'сводка не пришла',
  },
  events_arrived: {
    en: 'the event counts do not match',
    de: 'die Ereigniszahlen stimmen nicht',
    ru: 'счёт событий не сходится',
  },
  revenue_matches: {
    en: 'the revenue does not match',
    de: 'der Umsatz stimmt nicht',
    ru: 'выручка не сходится',
  },
  sender_delivered: {
    en: 'the sender did not deliver events',
    de: 'der Absender hat Ereignisse nicht zugestellt',
    ru: 'отправитель не доставил события',
  },
  sender_facts: {
    en: 'the sender’s own count differs',
    de: 'die Zählung des Absenders weicht ab',
    ru: 'счёт отправителя расходится',
  },
  labels_readable: {
    en: 'labels cannot be read',
    de: 'Labels sind nicht lesbar',
    ru: 'метки не читаются',
  },
  intake_refusals: {
    en: 'the intake refuses events',
    de: 'Ereignisse werden abgelehnt',
    ru: 'приёмник отказывает',
  },
  repeat_conflicts: {
    en: 'repeats with another body',
    de: 'Wiederholungen mit anderem Inhalt',
    ru: 'повторы с другим телом',
  },
  payment_duplicates: {
    en: 'payment numbers repeat',
    de: 'Zahlungsnummern doppelt',
    ru: 'номера оплат повторяются',
  },
  first_touch_stable: {
    en: 'the first touch changes',
    de: 'der erste Kontakt ändert sich',
    ru: 'первое касание меняется',
  },
  event_time: {
    en: 'events with an odd time',
    de: 'Ereignisse mit ungewöhnlicher Zeit',
    ru: 'события со странным временем',
  },
  all_known: {
    en: 'unknown values in events',
    de: 'Unbekanntes in Ereignissen',
    ru: 'в событиях незнакомое',
  },
  links_arrive: {
    en: 'links do not arrive',
    de: 'Weiterleitungen kommen nicht an',
    ru: 'переходы не доходят',
  },
  rate_present: {
    en: 'a rate is missing',
    de: 'ein Kurs fehlt',
    ru: 'нет курса',
  },
  statement_matches: {
    en: 'the revenue does not match the statement',
    de: 'der Umsatz stimmt nicht mit dem Kontoauszug',
    ru: 'выручка не сходится с выпиской',
  },
  'statement_matches:no_statement': {
    en: 'the statement of the month is not entered',
    de: 'der Kontoauszug des Monats fehlt',
    ru: 'нет выписки за месяц',
  },
};

// Заголовок одной своей проверки — с её названием: его пишет владелец или агент с правом правки.
const _CUSTOM_PROBLEM: Readonly<
  Record<ManagerLanguage, (name: string) => string>
> = {
  en: (name) => `the check “${name}” fired`,
  de: (name) => `die Prüfung „${name}“ hat angeschlagen`,
  ru: (name) => `сработала проверка «${name}»`,
};

/** Что подставить в строку: названия из настройки, час сводки, пояс отчётов, сутки проверки. */
export type NoticeContext = {
  /** «Бот (bot)»: название отправителя из настройки и его код. */
  readonly sender: (code: string) => string;
  /** Название типа из настройки; null — тип незнаком, кода в уведомлении нет. */
  readonly type: (sender: string, code: string) => string | null;
  readonly summaryAt: (sender: string) => string | null;
  readonly clock: (check: string) => CheckClock | null;
  /** Название своей проверки из настройки; у встроенной — null: название ядра. */
  readonly check: (check: string) => string | null;
  readonly zone: string;
};

const _LOCALE: Readonly<Record<ManagerLanguage, string>> = {
  en: 'en-GB',
  de: 'de-DE',
  ru: 'ru-RU',
};

const _noon = (day: Day): number => Date.parse(`${day}T12:00:00Z`);

const _dates = (language: ManagerLanguage) =>
  new Intl.DateTimeFormat(_LOCALE[language], {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

const _date = (day: Day, language: ManagerLanguage): string =>
  _dates(language).format(_noon(day));

const _range = (from: Day, to: Day, language: ManagerLanguage): string =>
  from === to
    ? _date(to, language)
    : _dates(language).formatRange(_noon(from), _noon(to));

const _month = (month: string, language: ManagerLanguage): string =>
  new Intl.DateTimeFormat(_LOCALE[language], {
    month: 'long',
    timeZone: 'UTC',
  }).format(_noon(`${month}-15`));

// Месяц с годом в именительном: «октябрь 2026 г.», «October 2026».
const _monthYear = (day: Day, language: ManagerLanguage): string =>
  new Intl.DateTimeFormat(_LOCALE[language], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(_noon(`${day.slice(0, 7)}-15`));

const _number = (value: number, language: ManagerLanguage): string =>
  new Intl.NumberFormat(_LOCALE[language], {
    maximumFractionDigits: 1,
  }).format(value);

const _money = (minor: number, currency: string, language: ManagerLanguage) =>
  ((digits) =>
    `${new Intl.NumberFormat(_LOCALE[language], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(minor / 10 ** digits)} ${currency}`)(MINOR_UNITS[currency] ?? 2);

type _Forms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  readonly other: string;
};

const _plural = (n: number, language: ManagerLanguage, forms: _Forms): string =>
  forms[new Intl.PluralRules(_LOCALE[language]).select(n)] ?? forms.other;

/** Что строке нужно на языке: сутки словами (у месячной — месяц с годом), числа, деньги, названия. */
type _Facts = {
  readonly language: ManagerLanguage;
  readonly row: CheckDay;
  readonly day: string;
  readonly n: (value: number) => string;
  readonly money: (minor: number, currency: string) => string;
  readonly context: NoticeContext;
  readonly episode: Day;
};

type _Texts = Readonly<Record<ManagerLanguage, (facts: _Facts) => string>>;

const _detail = <T>(row: CheckDay, key: string): T => row.detail[key] as T;

const _value = (row: CheckDay): number => row.value ?? 0;

const _QUOTES: Readonly<Record<ManagerLanguage, (name: string) => string>> = {
  en: (name) => `“${name}”`,
  de: (name) => `„${name}“`,
  ru: (name) => `«${name}»`,
};

const _UNKNOWN_TYPES: Readonly<Record<ManagerLanguage, string>> = {
  en: 'unknown types',
  de: 'unbekannte Typen',
  ru: 'незнакомых типов',
};

const _ITEM: Readonly<
  Record<ManagerLanguage, (name: string, count: string) => string>
> = {
  en: (name, count) => `${name} ${count}`,
  de: (name, count) => `${name} ${count}`,
  ru: (name, count) => `${name} — ${count}`,
};

// Недостающие по названиям типов; незнакомые — только числом: код незнакомого типа — текст отправителя.
const _missingList = (facts: _Facts): string =>
  ((types) =>
    [
      ...types
        .filter((_) => _.known)
        .map((_) =>
          _ITEM[facts.language](
            _QUOTES[facts.language](
              facts.context.type(facts.row.scope, _.type) ?? ''
            ),
            facts.n(_.missing)
          )
        ),
      ...((unknown) =>
        unknown === 0
          ? []
          : [`${_UNKNOWN_TYPES[facts.language]}: ${facts.n(unknown)}`])(
        types.filter((_) => !_.known).length
      ),
    ].join(', '))(
    (_detail<readonly TypeCount[]>(facts.row, 'types') ?? []).filter(
      (_) => _.missing > 0
    )
  );

const _CURRENCY: Readonly<
  Record<ManagerLanguage, (summary: string, site: string) => string>
> = {
  en: (summary, site) => `${summary} in the summary, ${site} on the site`,
  de: (summary, site) =>
    `${summary} laut Zusammenfassung, ${site} auf der Website`,
  ru: (summary, site) => `в сводке ${summary}, на сайте ${site}`,
};

// Валюты, где сводка и сайт расходятся: суммы — по ISO 4217, как в менеджере.
const _differences = (facts: _Facts): string =>
  (_detail<readonly CurrencyCount[]>(facts.row, 'currencies') ?? [])
    .filter((_) => _.site !== _.summary)
    .map((_) =>
      _CURRENCY[facts.language](
        facts.money(_.summary, _.currency),
        facts.money(_.site, _.currency)
      )
    )
    .join('; ');

const _expected = (facts: _Facts): string =>
  facts.context.summaryAt(facts.row.scope) ?? '06:00';

const _from = (facts: _Facts): string =>
  _date(
    addDays(facts.row.day, 1 - Math.max(1, _value(facts.row))),
    facts.language
  );

const _days = (facts: _Facts): string =>
  _range(
    addDays(facts.row.day, 1 - Math.max(1, _value(facts.row))),
    facts.row.day,
    facts.language
  );

const _DAYS: Readonly<Record<ManagerLanguage, _Forms>> = {
  en: { one: 'day', other: 'days' },
  de: { one: 'Tag', other: 'Tage' },
  ru: { one: 'день', few: 'дня', many: 'дней', other: 'дня' },
};

const _EVENTS_GENITIVE: Readonly<Record<ManagerLanguage, _Forms>> = {
  en: { one: 'event', other: 'events' },
  de: { one: 'Ereignis', other: 'Ereignisse' },
  ru: { one: 'события', other: 'событий' },
};

const _EVENTS: Readonly<Record<ManagerLanguage, _Forms>> = {
  en: { one: 'event', other: 'events' },
  de: { one: 'Ereignis', other: 'Ereignisse' },
  ru: { one: 'событие', few: 'события', many: 'событий', other: 'события' },
};

const _words = (
  forms: Readonly<Record<ManagerLanguage, _Forms>>,
  facts: _Facts,
  n: number
) => _plural(n, facts.language, forms[facts.language]);

// Строки «что случилось» по проверке: сбой и замечание, по причине строки.
const _ALERT: Readonly<Record<string, _Texts>> = {
  summary_arrived: {
    en: (_) =>
      _value(_.row) > 1
        ? `no summary for ${_.n(_value(_.row))} days in a row (${_days(_)})`
        : `no summary for ${_.day} (UTC), expected by ${_expected(_)} UTC`,
    de: (_) =>
      _value(_.row) > 1
        ? `keine Zusammenfassung ${_.n(_value(_.row))} Tage in Folge (${_days(_)})`
        : `keine Zusammenfassung für den ${_.day} (UTC), erwartet bis ${_expected(_)} UTC`,
    ru: (_) =>
      _value(_.row) > 1
        ? `нет сводки ${_.n(_value(_.row))} ${_words(_DAYS, _, _value(_.row))} подряд (${_days(_)})`
        : `нет сводки за ${_.day} (UTC), ждали к ${_expected(_)} UTC`,
  },
  events_arrived: {
    en: (_) =>
      _.row.reason === 'extra'
        ? `${_.n(_value(_.row))} more ${_words(_EVENTS, _, _value(_.row))} on the site than in the summary for ${_.day}`
        : `${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))} missing for ${_.day}: ${_missingList(_)}`,
    de: (_) =>
      _.row.reason === 'extra'
        ? `für den ${_.day} ${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))} mehr auf der Website als in der Zusammenfassung`
        : `für den ${_.day} ${_value(_.row) === 1 ? 'fehlt' : 'fehlen'} ${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))}: ${_missingList(_)}`,
    ru: (_) =>
      _.row.reason === 'extra'
        ? `за ${_.day} на сайте на ${_.n(_value(_.row))} ${_words(_EVENTS_GENITIVE, _, _value(_.row))} больше, чем в сводке`
        : `за ${_.day} недостаёт ${_.n(_value(_.row))} ${_words(_EVENTS_GENITIVE, _, _value(_.row))}: ${_missingList(_)}`,
  },
  revenue_matches: {
    en: (_) => `${_.day} — ${_differences(_)}`,
    de: (_) => `${_.day} — ${_differences(_)}`,
    ru: (_) => `${_.day} ${_differences(_)}`,
  },
  sender_delivered: {
    en: (_) =>
      `${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))} for ${_.day} not delivered after all retries — upload them as a file`,
    de: (_) =>
      `${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))} für den ${_.day} nach allen Wiederholungen nicht zugestellt — laden Sie sie als Datei hoch`,
    ru: (_) =>
      `за ${_.day} не доставлено после всех повторов: ${_.n(_value(_.row))} — дошлите их файлом`,
  },
  sender_facts: {
    en: (_) =>
      `payments for ${_.day} (UTC) whose properties for reconciling do not match the count of the site: ${_.n(_value(_.row))} of ${_.n(_detail<number>(_.row, 'checked') ?? 0)}`,
    de: (_) =>
      `Zahlungen am ${_.day} (UTC), deren Abgleich-Eigenschaften nicht zur Zählung der Website passen: ${_.n(_value(_.row))} von ${_.n(_detail<number>(_.row, 'checked') ?? 0)}`,
    ru: (_) =>
      `за ${_.day} (UTC) оплат, чьи свойства сверки не сошлись со счётом сайта: ${_.n(_value(_.row))} из ${_.n(_detail<number>(_.row, 'checked') ?? 0)}`,
  },
  labels_readable: {
    en: (_) =>
      `${_.n(_value(_.row))}% of labels for ${_.day} (UTC) cannot be read (${_.n(_detail<number>(_.row, 'unreadable') ?? 0)} of ${_.n(_detail<number>(_.row, 'total') ?? 0)})`,
    de: (_) =>
      `für den ${_.day} (UTC) sind ${_.n(_value(_.row))} % der Labels nicht lesbar (${_.n(_detail<number>(_.row, 'unreadable') ?? 0)} von ${_.n(_detail<number>(_.row, 'total') ?? 0)})`,
    ru: (_) =>
      `за ${_.day} (UTC) не читаются ${_.n(_value(_.row))} % меток (${_.n(_detail<number>(_.row, 'unreadable') ?? 0)} из ${_.n(_detail<number>(_.row, 'total') ?? 0)})`,
  },
  intake_refusals: {
    en: (_) =>
      _.row.reason === 'invalid'
        ? `the intake refused ${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))} of known senders for ${_.day} (UTC) with 400: fix and resend them`
        : `${_.n(_value(_.row))} requests with a wrong key or over the limit for ${_.day} (UTC): 401, 429`,
    de: (_) =>
      _.row.reason === 'invalid'
        ? `am ${_.day} (UTC) wurden ${_.n(_value(_.row))} ${_words(_EVENTS, _, _value(_.row))} bekannter Absender mit 400 abgelehnt: korrigieren und erneut senden`
        : `${_.n(_value(_.row))} Anfragen mit falschem Schlüssel oder über dem Limit am ${_.day} (UTC): 401, 429`,
    ru: (_) =>
      _.row.reason === 'invalid'
        ? `за ${_.day} (UTC) приёмник отказал известным отправителям (400): ${_.n(_value(_.row))} — исправьте и дошлите`
        : `за ${_.day} (UTC) запросов с чужим ключом или сверх предела (401, 429): ${_.n(_value(_.row))}`,
  },
  repeat_conflicts: {
    en: (_) =>
      `repeats with another body for ${_.day} (UTC): ${_.n(_value(_.row))}`,
    de: (_) =>
      `Wiederholungen mit anderem Inhalt am ${_.day} (UTC): ${_.n(_value(_.row))}`,
    ru: (_) =>
      `за ${_.day} (UTC) повторов с другим телом: ${_.n(_value(_.row))}`,
  },
  payment_duplicates: {
    en: (_) =>
      `payment numbers used twice for ${_.day} (UTC): ${_.n(_value(_.row))}`,
    de: (_) =>
      `doppelte Zahlungsnummern am ${_.day} (UTC): ${_.n(_value(_.row))}`,
    ru: (_) =>
      `за ${_.day} (UTC) номеров оплат с повтором: ${_.n(_value(_.row))}`,
  },
  first_touch_stable: {
    en: (_) =>
      `people with another first touch for ${_.day} (UTC): ${_.n(_value(_.row))}`,
    de: (_) =>
      `Personen mit anderem erstem Kontakt am ${_.day} (UTC): ${_.n(_value(_.row))}`,
    ru: (_) =>
      `за ${_.day} (UTC) людей с другим первым касанием: ${_.n(_value(_.row))}`,
  },
  event_time: {
    en: (_) =>
      `events from the future for ${_.day} (UTC): ${_.n(_detail<number>(_.row, 'future') ?? 0)}, late by more than a day: ${_.n(_detail<number>(_.row, 'late') ?? 0)}`,
    de: (_) =>
      `Ereignisse aus der Zukunft am ${_.day} (UTC): ${_.n(_detail<number>(_.row, 'future') ?? 0)}, mehr als einen Tag verspätet: ${_.n(_detail<number>(_.row, 'late') ?? 0)}`,
    ru: (_) =>
      `за ${_.day} (UTC) событий из будущего: ${_.n(_detail<number>(_.row, 'future') ?? 0)}, опоздавших больше чем на сутки: ${_.n(_detail<number>(_.row, 'late') ?? 0)}`,
  },
  all_known: {
    en: (_) =>
      `events with unknown values for ${_.day} (UTC): ${_.n(_value(_.row))} — create them in the setup`,
    de: (_) =>
      `Ereignisse mit Unbekanntem am ${_.day} (UTC): ${_.n(_value(_.row))} — legen Sie es in der Einrichtung an`,
    ru: (_) =>
      `за ${_.day} (UTC) событий с незнакомым: ${_.n(_value(_.row))} — создайте его в настройке`,
  },
  links_arrive: {
    en: (_) =>
      `links whose visitors did not reach the sender for ${_.day} (${_.context.zone || 'UTC'}): ${_.n(_value(_.row))}`,
    de: (_) =>
      `Weiterleitungen, deren Besucher den Absender nicht erreicht haben, am ${_.day} (${_.context.zone || 'UTC'}): ${_.n(_value(_.row))}`,
    ru: (_) =>
      `за ${_.day} (${_.context.zone || 'UTC'}) переходов, по которым люди не дошли до отправителя: ${_.n(_value(_.row))}`,
  },
  rate_present: {
    en: (_) =>
      _.row.reason === 'no_rate'
        ? `no rate to the base currency: ${(_detail<readonly string[]>(_.row, 'missing') ?? []).join(', ')} — these sums are not converted`
        : `enter the rate for the month: ${_staleList(_)}`,
    de: (_) =>
      _.row.reason === 'no_rate'
        ? `kein Kurs zur Basiswährung: ${(_detail<readonly string[]>(_.row, 'missing') ?? []).join(', ')} — diese Beträge sind nicht umgerechnet`
        : `Kurs für den Monat eintragen: ${_staleList(_)}`,
    ru: (_) =>
      _.row.reason === 'no_rate'
        ? `нет курса к базовой валюте: ${(_detail<readonly string[]>(_.row, 'missing') ?? []).join(', ')} — эти суммы не переведены`
        : `введите курс за месяц: ${_staleList(_)}`,
  },
  statement_matches: {
    en: (_) =>
      _.row.reason === 'no_statement'
        ? `no statement for ${_.day} — enter it: Statistics → Quality → Statements`
        : `${_.day} — ${_statementList(_)}`,
    de: (_) =>
      _.row.reason === 'no_statement'
        ? `kein Kontoauszug für ${_.day} — tragen Sie ihn ein: Statistik → Qualität → Auszüge`
        : `${_.day} — ${_statementList(_)}`,
    ru: (_) =>
      _.row.reason === 'no_statement'
        ? `выписки за ${_.day} нет — внесите её: «Статистика → Качество → Выписки»`
        : `за ${_.day}: ${_statementList(_)}`,
  },
};

// Своя пороговая: период и значение против порога; у выручки — деньгами валюты правила.
const _period = (facts: _Facts): string =>
  ((from) =>
    from === undefined || from === facts.row.day
      ? facts.day
      : _range(from, facts.row.day, facts.language))(
    _detail<Day | undefined>(facts.row, 'from')
  );

const _amount = (facts: _Facts, value: number): string =>
  ((currency) =>
    currency === null || currency === undefined
      ? facts.n(value)
      : facts.money(value, currency))(
    _detail<string | null | undefined>(facts.row, 'currency')
  );

const _COMPARE: Readonly<Record<ManagerLanguage, Record<string, string>>> = {
  en: { lt: 'below', gt: 'above' },
  de: { lt: 'unter', gt: 'über' },
  ru: { lt: 'меньше', gt: 'больше' },
};

const _CUSTOM: _Texts = {
  en: (_) =>
    `${_period(_)} (${_.context.zone || 'UTC'}) — ${_amount(_, _value(_.row))}, threshold: ${_COMPARE.en[_detail<string>(_.row, 'compare')] ?? ''} ${_amount(_, _detail<number>(_.row, 'threshold') ?? 0)}`,
  de: (_) =>
    `${_period(_)} (${_.context.zone || 'UTC'}) — ${_amount(_, _value(_.row))}, Schwelle: ${_COMPARE.de[_detail<string>(_.row, 'compare')] ?? ''} ${_amount(_, _detail<number>(_.row, 'threshold') ?? 0)}`,
  ru: (_) =>
    `за ${_period(_)} (${_.context.zone || 'UTC'}) — ${_amount(_, _value(_.row))}, порог: ${_COMPARE.ru[_detail<string>(_.row, 'compare')] ?? ''} ${_amount(_, _detail<number>(_.row, 'threshold') ?? 0)}`,
};

const _STATEMENT: Readonly<
  Record<
    ManagerLanguage,
    (currency: string, statement: string, site: string, share: string) => string
  >
> = {
  en: (currency, statement, site, share) =>
    `${currency}: ${statement} in the statement, ${site} on the site (${share}%)`,
  de: (currency, statement, site, share) =>
    `${currency}: ${statement} laut Auszug, ${site} auf der Website (${share} %)`,
  ru: (currency, statement, site, share) =>
    `${currency} — по выписке ${statement}, на сайте ${site} (${share} %)`,
};

// Валюты выписки, где сайт расходится сверх допуска: суммы — по ISO 4217.
const _statementList = (facts: _Facts): string =>
  (
    _detail<
      readonly {
        currency: string;
        statement: number;
        site: number;
        share: number;
      }[]
    >(facts.row, 'currencies') ?? []
  )
    .filter((_) => _.share > (_detail<number>(facts.row, 'tolerance') ?? 0))
    .map((_) =>
      _STATEMENT[facts.language](
        _.currency,
        facts.money(_.statement, _.currency),
        facts.money(_.site, _.currency),
        facts.n(_.share)
      )
    )
    .join('; ');

const _staleList = (facts: _Facts): string =>
  (
    _detail<readonly { currency: string; month: string }[]>(
      facts.row,
      'stale'
    ) ?? []
  )
    .map((_) => `${_.currency} — ${_month(_.month, facts.language)}`)
    .join(', ');

// Напоминание: та же строка и сколько суток идёт эпизод; у сводки — своими словами.
const _SINCE: Readonly<Record<ManagerLanguage, (day: string) => string>> = {
  en: (day) => `since ${day}`,
  de: (day) => `seit dem ${day}`,
  ru: (day) => `с ${day}`,
};

const _REMINDED: Localized = {
  en: 'a reminder',
  de: 'Erinnerung',
  ru: 'напоминание',
};

// С какого дня эпизод; у месячной — просто «напоминание»: месяц в строке уже есть.
const _since = (facts: _Facts): string =>
  facts.context.clock(facts.row.check) === 'month'
    ? _REMINDED[facts.language]
    : _SINCE[facts.language](_date(facts.episode, facts.language));

const _REMIND: _Texts = {
  en: (_) =>
    _.row.check === 'summary_arrived'
      ? `no summaries since ${_from(_)} — ${_.n(_value(_.row))} days in a row`
      : `${_alert(_)} — ${_since(_)}`,
  de: (_) =>
    _.row.check === 'summary_arrived'
      ? `keine Zusammenfassungen seit dem ${_from(_)} — ${_.n(_value(_.row))} Tage in Folge`
      : `${_alert(_)} — ${_since(_)}`,
  ru: (_) =>
    _.row.check === 'summary_arrived'
      ? `сводок нет с ${_from(_)} — ${_.n(_value(_.row))} ${_words(_DAYS, _, _value(_.row))} подряд`
      : `${_alert(_)} — ${_since(_)}`,
};

// Своя проверка — по названию из настройки; встроенная без своей строки — общей.
const _alert = (facts: _Facts): string =>
  (_ALERT[facts.row.check] ??
    (facts.context.check(facts.row.check) === null ? _GENERIC : _CUSTOM))[
    facts.language
  ](facts);

const _GENERIC: _Texts = {
  en: (_) => `the check did not pass for ${_.day}`,
  de: (_) => `die Prüfung für den ${_.day} ist nicht bestanden`,
  ru: (_) => `за ${_.day} проверка не прошла`,
};

const _RECOVERED: Readonly<Record<string, _Texts>> = {
  summary_arrived: {
    en: (_) =>
      ((at) =>
        at
          ? `the summary for ${_.day} came at ${at.slice(11, 16)} UTC`
          : `the summary for ${_.day} came`)(
        _detail<string | undefined>(_.row, 'receivedAt')
      ),
    de: (_) =>
      ((at) =>
        at
          ? `die Zusammenfassung für den ${_.day} kam um ${at.slice(11, 16)} UTC`
          : `die Zusammenfassung für den ${_.day} ist eingegangen`)(
        _detail<string | undefined>(_.row, 'receivedAt')
      ),
    ru: (_) =>
      ((at) =>
        at
          ? `сводка за ${_.day} пришла в ${at.slice(11, 16)} UTC`
          : `сводка за ${_.day} пришла`)(
        _detail<string | undefined>(_.row, 'receivedAt')
      ),
  },
  events_arrived: {
    en: (_) => `the event counts for ${_.day} match`,
    de: (_) => `die Ereigniszahlen für den ${_.day} stimmen`,
    ru: (_) => `за ${_.day} счёт событий сошёлся`,
  },
  revenue_matches: {
    en: (_) => `the revenue for ${_.day} matches`,
    de: (_) => `der Umsatz für den ${_.day} stimmt`,
    ru: (_) => `за ${_.day} выручка сошлась`,
  },
  statement_matches: {
    en: (_) => `the revenue of ${_.day} matches the statement`,
    de: (_) => `der Umsatz für ${_.day} stimmt mit dem Kontoauszug`,
    ru: (_) => `за ${_.day} выручка сошлась с выпиской`,
  },
};

const _BACK: _Texts = {
  en: (_) => `back to normal for ${_.day}`,
  de: (_) => `für den ${_.day} wieder in Ordnung`,
  ru: (_) => `за ${_.day} снова в порядке`,
};

const _VERSION: Readonly<Record<ManagerLanguage, (version: string) => string>> =
  {
    en: (_) => `, version ${_}`,
    de: (_) => `, Version ${_}`,
    ru: (_) => `, версия ${_}`,
  };

const _FAILED: Readonly<Record<ManagerLanguage, _Forms>> = {
  en: { one: 'check failed', other: 'checks failed' },
  de: { one: 'Prüfung fehlgeschlagen', other: 'Prüfungen fehlgeschlagen' },
  ru: {
    one: 'проверка не прошла',
    few: 'проверки не прошли',
    many: 'проверок не прошли',
    other: 'проверки не прошли',
  },
};

const _TITLES = {
  back: {
    en: 'Data quality: back to normal',
    de: 'Datenqualität: wieder in Ordnung',
    ru: 'Качество данных: снова в порядке',
  },
  prefix: { en: 'Data quality', de: 'Datenqualität', ru: 'Качество данных' },
} as const;

const _many = (n: number, language: ManagerLanguage): string =>
  `${_TITLES.prefix[language]}: ${n} ${_plural(n, language, _FAILED[language])}`;

const _SUMMARY_TEXT: Localized = {
  en: 'If the sender works, wait for the summary or upload the day’s events as a file: Statistics → People → Upload file. The check closes by itself once the counts match.',
  de: 'Wenn der Absender läuft, warten Sie auf die Zusammenfassung oder laden Sie die Ereignisse des Tages als Datei hoch: Statistik → Personen → Datei hochladen. Die Prüfung schließt sich selbst, sobald die Zahlen stimmen.',
  ru: 'Если отправитель работает, дождитесь сводки или загрузите события дня файлом: «Статистика → Люди → Загрузить файл». Проверка закроется сама, когда счёт сойдётся.',
};

const _OTHER_TEXT: Localized = {
  en: 'What was compared and what to do next is on the Data quality screen of the manager.',
  de: 'Was verglichen wurde und was zu tun ist, steht im Manager unter „Datenqualität“.',
  ru: 'Что сравнивалось и что делать дальше — на экране «Качество данных» в менеджере.',
};

const _BACK_TEXT: Localized = {
  en: 'The check closed by itself: what was resent or came late has arrived.',
  de: 'Die Prüfung hat sich selbst geschlossen: Nachgesendetes oder Verspätetes ist angekommen.',
  ru: 'Проверка закрылась сама: досланное или опоздавшее дошло.',
};

const _LINK: Localized = {
  en: 'Open Data quality',
  de: '„Datenqualität“ öffnen',
  ru: 'Открыть «Качество данных»',
};

const _facts = (
  decision: QualityDecision,
  context: NoticeContext,
  language: ManagerLanguage
): _Facts =>
  ((when) => ({
    language,
    row: decision.row,
    day: when(decision.row.day),
    n: (value) => _number(value, language),
    money: (minor, currency) => _money(minor, currency, language),
    context,
    episode: decision.episode,
  }))((day: Day) =>
    context.clock(decision.row.check) === 'month'
      ? _monthYear(day, language)
      : _date(day, language)
  );

// Название проверки на языке: встроенной — ядра, своей — из настройки.
const _nameOf = (
  check: string,
  context: NoticeContext,
  language: ManagerLanguage
): string =>
  CHECK_NAMES[check]?.[language] ??
  context.check(check) ??
  _TITLES.prefix[language];

const _labelOf = (
  decision: QualityDecision,
  context: NoticeContext
): Localized =>
  localized(
    (language) =>
      `${_nameOf(decision.row.check, context, language)}${decision.row.scope === '' ? '' : ` · ${context.sender(decision.row.scope)}`}`
  );

// Что случилось — в заголовке одной проверки: по причине, иначе по проверке; у своей — с её названием.
const _problemOf = (
  row: CheckDay,
  context: NoticeContext,
  language: ManagerLanguage
): string | null =>
  _PROBLEM[`${row.check}:${row.reason}`]?.[language] ??
  _PROBLEM[row.check]?.[language] ??
  ((name) => (name === null ? null : _CUSTOM_PROBLEM[language](name)))(
    context.check(row.check)
  );

const _lineOf = (
  decision: QualityDecision,
  context: NoticeContext
): Localized =>
  localized((language) =>
    ((facts) =>
      `${
        decision.kind === 'recovered'
          ? (_RECOVERED[decision.row.check] ?? _BACK)[language](facts)
          : decision.kind === 'remind'
            ? _REMIND[language](facts)
            : _alert(facts)
      }${
        decision.kind !== 'recovered' &&
        context.clock(decision.row.check) === 'summary' &&
        isVersionText(decision.row.version)
          ? _VERSION[language](decision.row.version)
          : ''
      }`)(_facts(decision, context, language))
  );

const _ORDER: Readonly<Record<string, number>> = { failure: 0, warning: 1 };

/**
 * Одно сообщение на такт: заголовок по самому тяжёлому, строка на проверку — «проверка · отправитель: что
 * случилось». Названия типов и отправителя — из настройки; незнакомые коды, метки, тела и псевдонимы сюда не
 * попадают. `at` — момент такта: ключ отправки в журнале уведомлений.
 */
export var qualityNotice = (
  decisions: readonly QualityDecision[],
  context: NoticeContext,
  at: string
): QualityNotice =>
  ((alerts, recovered) =>
    ((ordered) => ({
      severity: alerts.some((_) => _.row.state === 'failure')
        ? 'error'
        : alerts.length > 0
          ? 'warning'
          : 'info',
      title: localized((language) =>
        alerts.length === 0
          ? _TITLES.back[language]
          : alerts.length === 1
            ? ((problem) =>
                problem === null
                  ? _many(1, language)
                  : `${_TITLES.prefix[language]}: ${problem}`)(
                _problemOf(
                  (alerts[0] as QualityDecision).row,
                  context,
                  language
                )
              )
            : _many(alerts.length, language)
      ),
      lines: ordered.map((_) => ({
        label: _labelOf(_, context),
        value: _lineOf(_, context),
      })),
      text:
        alerts.length === 0
          ? _BACK_TEXT
          : alerts.some((_) => context.clock(_.row.check) === 'summary')
            ? _SUMMARY_TEXT
            : _OTHER_TEXT,
      link: _LINK,
      path: `/stats/quality?day=${
        decisions
          .map((_) => _.row.day)
          .toSorted()
          .at(-1) ?? ''
      }`,
      source: `analytics.quality:${at}`,
    }))([
      ...alerts.toSorted(
        (a, b) => (_ORDER[a.row.state] ?? 2) - (_ORDER[b.row.state] ?? 2)
      ),
      ...recovered,
    ]))(
    decisions.filter((_) => _.kind !== 'recovered'),
    decisions.filter((_) => _.kind === 'recovered')
  );
