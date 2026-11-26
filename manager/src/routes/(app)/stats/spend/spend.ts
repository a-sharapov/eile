import { length } from '#lib/analytics.ts';
import { type CsvRow, csvMoment, csvMoney } from '#lib/csv.ts';
import { currentLanguage, t } from '#lib/i18n.ts';
import { minorUnits, parseAmount } from '#lib/money.ts';
import type {
  BaseSum,
  RatesReport,
  SetupView,
  SpendInput,
  SpendReport,
  SpendView,
} from '#lib/types.ts';
import { partName, partValueName } from '../names.ts';

// «Расходы» и «Курсы» (ADR 0072, «Экраны этапа 3»): черновики строк, проверка до отправки — те же правила, что у
// `parseSpend` и `parseRate` сервера, — и выгрузка обеих таблиц в CSV.

/** Заметка строки расхода — до 500 знаков, как `SPEND_LIMITS.note` сервера. */
export var NOTE_LIMIT = 500;

/** Черновик строки: новая (`id` null) или правка; сумма — текстом из поля, части — `{ часть: значение }`. */
export type SpendDraft = {
  readonly key: number;
  readonly id: number | null;
  readonly month: string;
  parts: Record<string, string>;
  currency: string;
  amount: string;
  note: string;
};

let _keys = 0;
/** Ключ черновика в форме: строки удаляют, фокус остаётся на своём поле. */
export var nextDraftKey = (): number => ++_keys;

/** Месяц словами: «ноябрь 2026 г.», „November 2026“. */
export var monthName = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

/** Заголовок месяца — с заглавной: «Ноябрь 2026 г.». */
export var monthTitle = (month: string): string =>
  ((name) =>
    `${name.charAt(0).toLocaleUpperCase(currentLanguage())}${name.slice(1)}`)(
    monthName(month)
  );

/**
 * Части метки по порядку схем (схемы не в архиве — раньше), затем остальные части по коду; в архиве — только
 * если стоят в строке.
 */
export var partsOrder = (
  setup: SetupView,
  used: ReadonlySet<string> = new Set()
): string[] =>
  ((parts) =>
    [
      ...new Set([
        ...setup.schemas
          .toSorted(
            (a, b) =>
              Number(a.archivedAt !== null) - Number(b.archivedAt !== null)
          )
          .flatMap((_) => _.parts),
        ...parts.map((_) => _.code).toSorted(),
      ]),
    ].filter((code) =>
      parts.some(
        (_) => _.code === code && (_.archivedAt === null || used.has(code))
      )
    ))(setup.dictionaries.filter((_) => _.purpose === 'parts'));

/** Части строки без пустых, ключи — по алфавиту, как их хранит сервер (`sortedParts`). */
export var cleanParts = (
  parts: Readonly<Record<string, string>>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(parts)
      .filter(({ 1: value }) => value !== '')
      .toSorted((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );

/** Ключ строки — месяц, части и валюта, как `spendKey` сервера. */
export var spendKeyOf = (
  month: string,
  parts: Readonly<Record<string, string>>,
  currency: string
): string => `${month}|${JSON.stringify(cleanParts(parts))}|${currency}`;

/**
 * Черновик из строки. Без `month` — правка этой строки на месте (с её номером); с другим месяцем — копия: новая
 * строка без номера, иначе сохранение перенесло бы прежнюю строку в этот месяц.
 */
export var draftOf = (
  row: Pick<
    SpendView,
    'id' | 'month' | 'parts' | 'currency' | 'amount' | 'note'
  >,
  amountText: string,
  month: string | null = null
): SpendDraft => ({
  key: nextDraftKey(),
  id: month === null ? row.id : null,
  month: month ?? row.month,
  parts: { ...row.parts },
  currency: row.currency,
  amount: amountText,
  note: row.note,
});

/** Проверка черновиков до отправки: поле `<ключ>.<поле>` → что не так. */
export var checkDrafts = (
  drafts: readonly SpendDraft[],
  existing: readonly SpendView[]
): Record<string, string> =>
  Object.fromEntries(
    drafts.flatMap((draft, index) =>
      ((key) =>
        [
          [
            'currency',
            draft.currency === '' ? t('spend.currencyRequired') : null,
          ],
          [
            'amount',
            draft.currency !== '' &&
            parseAmount(draft.amount, draft.currency) === null
              ? t('spend.amountHint', { n: minorUnits(draft.currency) })
              : null,
          ],
          [
            'note',
            length(draft.note) > NOTE_LIMIT
              ? t('spend.noteHint', { n: NOTE_LIMIT })
              : null,
          ],
          [
            'parts',
            drafts
              .slice(0, index)
              .some((_) => spendKeyOf(_.month, _.parts, _.currency) === key)
              ? t('spend.repeatDraft')
              : existing.some(
                    (_) =>
                      _.id !== draft.id &&
                      spendKeyOf(_.month, _.parts, _.currency) === key
                  )
                ? t('spend.repeatRow')
                : null,
          ],
        ]
          .filter((_) => _[1] !== null)
          .map(({ 0: field, 1: message }) => [
            `${draft.key}.${field}`,
            message as string,
          ]))(spendKeyOf(draft.month, draft.parts, draft.currency))
    )
  );

/** Тело строки для `PUT /analytics/spend`: сумма — записью с точкой, заметка — без пробелов по краям. */
export var inputOf = (draft: SpendDraft): SpendInput => ({
  ...(draft.id === null ? {} : { id: draft.id }),
  month: draft.month,
  parts: cleanParts(draft.parts),
  currency: draft.currency,
  amount: parseAmount(draft.amount, draft.currency) ?? draft.amount,
  note: draft.note.trim(),
});

/** Части строки по порядку схем; части, которых нет в справочниках (удалили мимо расхода), — в конце. */
export var orderedParts = (
  setup: SetupView,
  parts: Readonly<Record<string, string>>
): string[] =>
  ((order) => [
    ...order.filter((_) => Object.hasOwn(parts, _)),
    ...Object.keys(parts)
      .filter((_) => !order.includes(_))
      .toSorted(),
  ])(partsOrder(setup, new Set(Object.keys(parts))));

/** Части строки словами для подтверждения: «Источник: Instagram · Тип: Платная», {} — «весь сайт». */
export var spendPartsText = (
  setup: SetupView,
  parts: Readonly<Record<string, string>>
): string =>
  Object.keys(parts).length === 0
    ? t('spend.wholeSite')
    : orderedParts(setup, parts)
        .map(
          (_) => `${partName(setup, _)}: ${partValueName(setup, _, parts[_]!)}`
        )
        .join(' · ');

const _sumNotes = (
  sum: Pick<BaseSum, 'staleRate' | 'unpriced'> | null
): string[] =>
  sum === null
    ? []
    : [
        ...(sum.staleRate ? [t('csv.stale')] : []),
        ...(Object.keys(sum.unpriced).length > 0
          ? [
              t('csv.unpriced', {
                currencies: Object.keys(sum.unpriced).toSorted().join(', '),
              }),
            ]
          : []),
      ];

/** Строки CSV «Расходов»: строка расхода на строку, части — кодом и названием, сумма и она же в базовой валюте. */
export var spendCsv = (
  report: SpendReport,
  setup: SetupView,
  zone: string
): CsvRow[] =>
  ((rows, base) =>
    ((parts) => [
      [
        t('csv.month'),
        ...parts.flatMap((part) => [
          t('csv.partCode', { part: partName(setup, part) }),
          partName(setup, part),
        ]),
        t('csv.currency'),
        t('csv.amount'),
        ...(base === null ? [] : [t('csv.inBaseShort', { currency: base })]),
        t('csv.notes', { name: t('csv.amount') }),
        t('csv.note'),
        t('csv.author'),
        t('csv.updated'),
      ],
      ...rows.map((row) => [
        row.month,
        ...parts.flatMap((part) =>
          Object.hasOwn(row.parts, part)
            ? [row.parts[part]!, partValueName(setup, part, row.parts[part]!)]
            : [null, null]
        ),
        row.currency,
        csvMoney(row.amount, row.currency),
        ...(base === null ? [] : [csvMoney(row.base, base)]),
        [
          ...(Object.keys(row.parts).length === 0
            ? [t('spend.wholeSite')]
            : []),
          ...(base !== null && row.base === null ? [t('csv.noRate')] : []),
          ...(row.staleRate ? [t('csv.stale')] : []),
          ...Object.entries(row.states).flatMap(({ 0: part, 1: state }) =>
            state === 'archived'
              ? [t('spend.archivedValue', { part: partName(setup, part) })]
              : state === 'unknown'
                ? [t('spend.unknownValue', { part: partName(setup, part) })]
                : []
          ),
        ].join('; ') || null,
        row.note || null,
        row.author?.name ?? null,
        csvMoment(row.updatedAt, zone),
      ]),
      ...(base === null
        ? []
        : report.months
            .filter((_) => _.total !== null)
            .map((month) => [
              month.month,
              ...parts.flatMap(() => [null, null]),
              null,
              null,
              csvMoney(month.total!.value, base),
              [t('csv.monthTotal'), ..._sumNotes(month.total)].join('; '),
              null,
              null,
              null,
            ])),
    ])(
      orderedParts(
        setup,
        Object.fromEntries(rows.flatMap((_) => Object.entries(_.parts)))
      )
    ))(
    report.months.flatMap((_) => _.rows),
    report.baseCurrency
  );

/** Строки CSV «Курсов»: валюта и месяц — чем переводятся суммы месяца; ниже — все записи курсов. */
export var ratesCsv = (report: RatesReport): CsvRow[] =>
  report.baseCurrency === null
    ? []
    : ((base) => [
        [
          t('csv.currency'),
          t('csv.month'),
          t('csv.rateDay'),
          t('csv.rateIn', { currency: base }),
          t('csv.notes', { name: t('csv.rate') }),
        ],
        ...report.currencies.flatMap((currency) =>
          [
            ...new Set([
              ...currency.months.map((_) => _.month),
              ...currency.rates.map((_) => _.day.slice(0, 7)),
            ]),
          ]
            .toSorted()
            .flatMap((month) =>
              ((sums, own) =>
                own.length > 0
                  ? own.map((rate) => [
                      currency.currency,
                      month,
                      rate.day,
                      { number: rate.rate },
                      sums === undefined ? t('rates.noSums') : null,
                    ])
                  : [
                      [
                        currency.currency,
                        month,
                        sums?.day ?? null,
                        sums?.rate === null || sums?.rate === undefined
                          ? null
                          : { number: sums.rate },
                        sums?.day === null || sums?.day === undefined
                          ? t('rates.none')
                          : sums.stale
                            ? t('csv.stale')
                            : null,
                      ],
                    ])(
                currency.months.find((_) => _.month === month),
                currency.rates.filter((_) => _.day.startsWith(month))
              )
            )
        ),
      ])(report.baseCurrency);
