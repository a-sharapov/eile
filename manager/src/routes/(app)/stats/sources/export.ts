import { filterKeyOf, shareRate } from '#lib/analytics-reports.ts';
import {
  type CsvCell,
  type CsvRow,
  csvDecimal,
  csvMoney,
  csvPercent,
} from '#lib/csv.ts';
import { t } from '#lib/i18n.ts';
import type {
  AnswersReport,
  BaseSum,
  Ltv,
  ReturnRow,
  SetupView,
  Share,
  SourcesColumn,
  SourcesReport,
  SourcesRow,
} from '#lib/types.ts';
import { filterLabel, groupName, rowValueName } from '../names.ts';
import { columnName } from './columns.ts';

// Выгрузка «Источников» и «Метки и ответа» в CSV (ADR 0072, «Выгрузка CSV»): итог, при сравнении — итог прошлого
// периода, строки и открытые уровни с путём фильтров отдельным столбцом; числа — числами, доли — тремя столбцами
// и процентом, отметки — словами в своём столбце.

type Row = SourcesRow | ReturnRow;

/** Открытый уровень строк: путь фильтров до него, его группа и строки. */
export type Level = {
  readonly path: Readonly<Record<string, string | null>>;
  readonly group: string;
  readonly rows: readonly Row[];
};

/** Открытые уровни по пути: `part.source=ig&part.channel=paid`. */
export type Levels = Map<string, Level>;

export var pathKey = (path: Readonly<Record<string, string | null>>): string =>
  Object.entries(path)
    .flatMap(({ 0: key, 1: value }) =>
      value === null ? [] : [`${key}=${value}`]
    )
    .join('&');

/** Уровень свернули — уходят и уровни под ним. */
export var closeLevel = (levels: Levels, key: string): void =>
  [...levels.keys()]
    .filter((_) => _ === key || _.startsWith(`${key}&`))
    .forEach((_) => void levels.delete(_));

type Out = {
  readonly header: string;
  readonly cell: (row: Row) => CsvCell;
};

const _first = <T>(row: Row, pick: (row: SourcesRow) => T): T | null =>
  'people' in row ? pick(row) : null;

const _back = <T>(row: Row, pick: (row: ReturnRow) => T): T | null =>
  'returned' in row ? pick(row) : null;

const _share = (
  name: string,
  pick: (row: SourcesRow) => Share | null | undefined
): Out[] => [
  {
    header: t('csv.counted', { name }),
    cell: (row) => _first(row, (_) => pick(_)?.count) ?? null,
  },
  {
    header: t('csv.base', { name }),
    cell: (row) => _first(row, (_) => pick(_)?.base) ?? null,
  },
  {
    header: t('csv.open', { name }),
    cell: (row) => _first(row, (_) => pick(_)?.open) ?? null,
  },
  {
    header: t('csv.percent', { name }),
    cell: (row) =>
      csvPercent(
        _first(row, (_) =>
          ((share) => (share ? shareRate(share) : null))(pick(_))
        )
      ),
  },
];

// Отметки суммы словами: курс прошлого месяца, суммы без курса по валютам.
const _sumNotes = (sum: BaseSum | null | undefined): string[] =>
  sum
    ? [
        ...(sum.staleRate ? [t('csv.stale')] : []),
        ...(Object.keys(sum.unpriced).length > 0
          ? [
              t('csv.unpriced', {
                currencies: Object.keys(sum.unpriced).toSorted().join(', '),
              }),
            ]
          : []),
      ]
    : [];

const _notes = (name: string, notes: (row: Row) => string[]): Out => ({
  header: t('csv.notes', { name }),
  cell: (row) => notes(row).join('; ') || null,
});

const _ltv = (
  name: string,
  base: string,
  pick: (row: SourcesRow) => Ltv | null
): Out[] => [
  {
    header: t('csv.inCurrency', { name, currency: base }),
    cell: (row) =>
      csvMoney(
        _first(row, (_) => pick(_)?.value),
        base
      ),
  },
  {
    header: t('csv.lived', { name }),
    cell: (row) => _first(row, (_) => pick(_)?.base) ?? null,
  },
  {
    header: t('csv.living', { name }),
    cell: (row) => _first(row, (_) => pick(_)?.open) ?? null,
  },
  _notes(name, (row) =>
    ((ltv) =>
      ltv
        ? [...(ltv.low ? [t('report.lowData')] : []), ..._sumNotes(ltv.revenue)]
        : [])(_first(row, pick))
  ),
];

type _Context = {
  readonly name: string;
  /** Базовая валюта; без неё столбцов денег одной цифрой нет. */
  readonly base: string | null;
  readonly rows: readonly Row[];
};

const _count =
  (pick: (row: Row) => number | null) =>
  (context: _Context): Out[] => [{ header: context.name, cell: pick }];

// Деньги одной цифрой — только с базовой валютой.
const _based =
  (outputs: (name: string, base: string) => Out[]) =>
  (context: _Context): Out[] =>
    context.base === null ? [] : outputs(context.name, context.base);

const _OUTPUTS: Readonly<
  Record<
    Exclude<SourcesColumn['kind'], 'milestone'>,
    (context: _Context) => Out[]
  >
> = {
  people: _count((row) => _first(row, (_) => _.people)),
  customers: _count((row) => _first(row, (_) => _.customers)),
  returned: _count((row) => _back(row, (_) => _.returned)),
  payments: _count((row) => _back(row, (_) => _.payments)),
  trial: ({ name }) => _share(name, (_) => _.trial),
  payment: ({ name }) => _share(name, (_) => _.payment),
  renewal: ({ name }) => _share(name, (_) => _.renewal),
  payment7: () => [],
  payment30: () => [],
  perCustomer: ({ name }) => [
    {
      header: name,
      cell: (row) =>
        csvDecimal(
          _first(row, (_) =>
            _.perCustomer && _.perCustomer.customers > 0
              ? _.perCustomer.payments / _.perCustomer.customers
              : null
          ),
          2
        ),
    },
  ],
  revenue: ({ name, base, rows }) => [
    ...[...new Set(rows.flatMap((_) => Object.keys(_.revenue ?? {})))]
      .toSorted()
      .map(
        (currency): Out => ({
          header: t('csv.inCurrency', { name, currency }),
          cell: (row) => csvMoney(row.revenue?.[currency], currency),
        })
      ),
    ...(base === null
      ? []
      : [
          {
            header: t('csv.inBase', { name, currency: base }),
            cell: (row: Row) =>
              Object.keys(row.revenue ?? {}).length === 0
                ? null
                : csvMoney(row.revenueBase?.value, base),
          },
          _notes(name, (row) => _sumNotes(row.revenueBase)),
        ]),
  ],
  ltvCustomer: _based((name, base) => _ltv(name, base, (_) => _.ltvCustomer)),
  ltvPerson: _based((name, base) => _ltv(name, base, (_) => _.ltvPerson)),
  spend: _based((name, base) => [
    {
      header: t('csv.inCurrency', { name, currency: base }),
      cell: (row) =>
        csvMoney(
          _first(row, (_) => _.spend?.value),
          base
        ),
    },
    _notes(name, (row) => [
      ...(_first(row, (_) => _.spendMissing)
        ? [t('sources.spendMissing')]
        : []),
      ..._sumNotes(_first(row, (_) => _.spend)),
    ]),
  ]),
  cac: _based((name, base) => [
    {
      header: t('csv.inCurrency', { name, currency: base }),
      cell: (row) =>
        csvMoney(
          _first(row, (_) => _.cac),
          base
        ),
    },
    _notes(name, (row) =>
      _first(
        row,
        (_) => _.cac === null && _.spend !== null && _.customers === 0
      )
        ? [t('sources.noCustomers')]
        : []
    ),
  ]),
  costPerPerson: _based((name, base) => [
    {
      header: t('csv.inCurrency', { name, currency: base }),
      cell: (row) =>
        csvMoney(
          _first(row, (_) => _.costPerPerson),
          base
        ),
    },
  ]),
  ltvCac: _based((name) => [
    {
      header: name,
      cell: (row) =>
        csvDecimal(
          _first(row, (_) => _.ltvCac),
          2
        ),
    },
    _notes(name, (row) =>
      _first(row, (_) => _.cac === 0) ? [t('sources.free')] : []
    ),
  ]),
  payback: _based((name) => [
    {
      header: t('csv.months', { name }),
      cell: (row) => _first(row, (_) => _.payback?.months) ?? null,
    },
    {
      header: t('csv.lived', { name }),
      cell: (row) => _first(row, (_) => _.payback?.lived) ?? null,
    },
    _notes(name, (row) =>
      ((payback) =>
        payback === null || payback === undefined
          ? []
          : payback.months === 0
            ? [t('sources.paybackNow')]
            : payback.months === null
              ? [
                  t(
                    payback.lived === 0
                      ? 'sources.paybackEarly'
                      : 'csv.paybackNot'
                  ),
                ]
              : [])(_first(row, (_) => _.payback))
    ),
  ]),
};

const _outputs = (
  report: SourcesReport,
  rows: readonly Row[],
  column: SourcesColumn
): Out[] =>
  column.kind === 'milestone'
    ? _share(column.name, (_) => _.milestones[column.code])
    : _OUTPUTS[column.kind]({
        name: columnName(report, column),
        base: report.baseCurrency,
        rows,
      });

const _low = (row: Row): string | null =>
  row.lowData.people && row.lowData.customers
    ? t('report.lowData')
    : row.lowData.people
      ? t('report.lowPeople')
      : row.lowData.customers
        ? t('report.lowCustomers')
        : null;

type Line = {
  readonly path: string;
  readonly group: string;
  readonly code: string | null;
  readonly name: string;
  readonly row: Row;
};

// Строки уровня и под каждой — её открытый уровень, по порядку таблицы.
const _lines = (
  setup: SetupView,
  levels: Levels,
  group: string,
  rows: readonly Row[],
  path: Readonly<Record<string, string | null>>
): Line[] =>
  rows.flatMap((row) =>
    ((key) =>
      ((child) => [
        {
          path: Object.entries(path)
            .flatMap(({ 0: filter, 1: value }) =>
              value === null ? [] : [filterLabel(setup, filter, value)]
            )
            .join(' · '),
          group: groupName(setup, group),
          code: row.value,
          name: rowValueName(setup, group, row.value, row.name),
          row,
        },
        ...(child === undefined || key === null
          ? []
          : _lines(setup, levels, child.group, child.rows, child.path)),
      ])(
        key === null
          ? undefined
          : levels.get(pathKey({ ...path, [key]: row.value }))
      ))(filterKeyOf(group))
  );

/** Строки CSV «Источников»: заголовок, итог, «было», строки с открытыми уровнями. */
export var sourcesCsv = (
  report: SourcesReport,
  setup: SetupView,
  levels: Levels
): CsvRow[] =>
  ((lines) =>
    ((outputs) => [
      [
        t('csv.path'),
        t('csv.group'),
        t('csv.code'),
        t('csv.name'),
        t('csv.lowData'),
        ...outputs.map((_) => _.header),
      ],
      ...lines.map((line) => [
        line.path,
        line.group,
        line.code,
        line.name,
        _low(line.row),
        ...outputs.map((_) => _.cell(line.row)),
      ]),
    ])(
      report.columns.flatMap((column) =>
        _outputs(
          report,
          lines.map((_) => _.row),
          column
        )
      )
    ))([
    {
      path: '',
      group: groupName(setup, report.group),
      code: null,
      name: t('sources.total'),
      row: report.total as Row,
    },
    ...(report.compare
      ? [
          {
            path: t('csv.previous', {
              from: report.compare.from,
              to: report.compare.to,
            }),
            group: groupName(setup, report.group),
            code: null,
            name: t('sources.was'),
            row: report.compare.total as Row,
          },
        ]
      : []),
    ..._lines(setup, levels, report.group, report.rows as readonly Row[], {}),
  ]);

/** Строки CSV «Метки и ответа»: строки — значения группы, столбцы — ответы и новые люди. */
export var answersCsv = (report: AnswersReport, setup: SetupView): CsvRow[] =>
  ((answerGroup) => [
    [
      t('csv.code'),
      groupName(setup, report.group),
      ...report.columns.flatMap((column) => [
        rowValueName(setup, answerGroup, column.value, column.name),
      ]),
      t('sources.colPeople'),
    ],
    [t('csv.answerCodes'), null, ...report.columns.map((_) => _.value), null],
    ...[report.total, ...report.rows].map((row, index) => [
      index === 0 ? null : row.value,
      index === 0
        ? t('sources.total')
        : rowValueName(setup, report.group, row.value, row.name),
      ...report.columns.map((column) => row.cells[column.value] ?? 0),
      row.people,
    ]),
  ])(`answer:${report.question}`);
