// Деньги аналитики приходят целым в минимальных единицах валюты (центы, иены): знаков после точки — по
// ISO 4217, как у сервера (`analytics/domain/money.ts`). Совпадение таблицы, разбора суммы и курса с сервером
// проверяет tests/manager-analytics.test.ts.
const _BY_UNITS: Readonly<Record<number, string>> = {
  0: 'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF',
  2: 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CNY COP COU CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD USN UYU UZS VED VES WST XCD XCG YER ZAR ZMW ZWG',
  3: 'BHD IQD JOD KWD LYD OMR TND',
  4: 'CLF UYW',
};

const _UNITS: ReadonlyMap<string, number> = new Map(
  Object.entries(_BY_UNITS).flatMap(({ 0: units, 1: codes }) =>
    codes.split(' ').map((_): [string, number] => [_, Number(units)])
  )
);

/** Валюты, которые принимает сервер (`MINOR_UNITS`): коды ISO 4217 по алфавиту. */
export var CURRENCIES: readonly string[] = [..._UNITS.keys()].toSorted();

/** Знаков после точки у валюты: EUR — 2, JPY — 0, KWD — 3. */
export var minorUnits = (currency: string): number => _UNITS.get(currency) ?? 2;

/** Сумма из минимальных единиц по правилам языка: 10900 EUR → «109,00 €». */
export var money = (
  minor: number,
  currency: string,
  language: string
): string =>
  ((units) =>
    new Intl.NumberFormat(language, {
      style: 'currency',
      currency,
      minimumFractionDigits: units,
      maximumFractionDigits: units,
    }).format(minor / 10 ** units))(minorUnits(currency));

/** Суммы по валютам — каждая своей строкой, без сложения и пересчёта курса; валюты по алфавиту. */
export var amounts = (
  byCurrency: Readonly<Record<string, number>>,
  language: string
): string[] =>
  Object.keys(byCurrency)
    .toSorted()
    .map((_) => money(byCurrency[_]!, _, language));

/** Название валюты на языке менеджера: «евро», „Euro“; нет названия — код. */
export var currencyName = (currency: string, language: string): string =>
  new Intl.DisplayNames(language, { type: 'currency' }).of(currency) ??
  currency;

/** Десятичный знак языка: «,» у de и ru, «.» у en. */
export var decimalSign = (language: string): string =>
  new Intl.NumberFormat(language)
    .formatToParts(1.5)
    .find((_) => _.type === 'decimal')?.value ?? '.';

/** Минимальные единицы десятичной записью с точкой: 6000 EUR → «60.00», −2300 → «-23.00», 1500 JPY → «1500». */
export var decimalOf = (minor: number, currency: string): string =>
  ((units, digits) =>
    units === 0
      ? `${minor < 0 ? '-' : ''}${digits}`
      : ((padded) =>
          `${minor < 0 ? '-' : ''}${padded.slice(0, -units)}.${padded.slice(-units)}`)(
          digits.padStart(units + 1, '0')
        ))(minorUnits(currency), String(Math.abs(minor)));

/** Сумма для поля ввода — с десятичным знаком языка: «60,00». */
export var amountText = (
  minor: number,
  currency: string,
  language: string
): string => decimalOf(minor, currency).replace('.', decimalSign(language));

// Ввод человека: пробелы (и неразрывные) — разделители разрядов, одна запятая — десятичный знак.
const _typed = (raw: string): string =>
  ((compact) =>
    compact.includes('.')
      ? compact
      : compact.replace(/^(\d*),(\d*)$/, '$1.$2'))(raw.replace(/[\s  ]/g, ''));

const _AMOUNT = /^(\d{1,15})(?:\.(\d{1,4}))?$/;

/**
 * Сумма расхода из поля — правила `moneyOf` сервера: от нуля, до 15 знаков до точки, после — не больше, чем у
 * валюты; точка или запятая. Ответ — запись с точкой для запроса, null — не сумма в этой валюте.
 */
export var parseAmount = (raw: string, currency: string): string | null =>
  ((text) =>
    ((match) =>
      match !== null &&
      (match[2] ?? '').length <= minorUnits(currency) &&
      Number.isSafeInteger(
        Number(match[1]) * 10 ** minorUnits(currency) +
          Number((match[2] ?? '').padEnd(minorUnits(currency), '0') || '0')
      )
        ? text
        : null)(_AMOUNT.exec(text)))(_typed(raw));

const _RATE = /^(\d{1,9})(?:\.(\d{1,10}))?$/;

/** Курс из поля — правила `rateValue` сервера: больше нуля, до 9 знаков до точки и до 10 после; точка или запятая. */
export var parseRate = (raw: string): string | null =>
  ((text) => (_RATE.test(text) && /[1-9]/.test(text) ? text : null))(
    _typed(raw)
  );

/** Курс, как его прислали, с десятичным знаком языка: «0.2310» → «0,2310». */
export var rateText = (rate: string, language: string): string =>
  rate.replace('.', decimalSign(language));

/** Обратный курс для справки: «1 € = 4,33 PLN»; от единицы — до сотых, меньше — три значащие цифры. */
export var inverseRate = (rate: string, language: string): string =>
  ((inverse) =>
    new Intl.NumberFormat(
      language,
      inverse >= 1
        ? { maximumFractionDigits: 2 }
        : { maximumSignificantDigits: 3 }
    ).format(inverse))(1 / Number(rate));
