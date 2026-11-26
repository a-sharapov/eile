import { CHECK_CODE_LIMIT, isCheckCode, ROLES } from '#lib/analytics.ts';
import { addMonths, dayIn, isMonth } from '#lib/analytics-reports.ts';
import { currentLanguage, t } from '#lib/i18n.ts';
import { amountText, CURRENCIES, parseAmount } from '#lib/money.ts';
import type {
  CheckMetric,
  CheckNotify,
  CheckView,
  EventRole,
  SetupView,
  StatementView,
  ThresholdRule,
} from '#lib/types.ts';
import {
  BUILTIN_CHECKS,
  builtinCheck,
  fitsParam,
  PARAM_RANGES,
  QUALITY_LIMITS,
} from './quality.ts';

// Черновики форм «Качества»: поправка встроенной проверки, своя пороговая, выписка. Проверка до отправки — по
// правилам сервера (`analytics/domain/setup.ts`, `statements.ts`), тело запроса — только поля группы.

/** Числовое поле: строка у нового черновика, число или null — после ввода в input[type=number]. */
export type NumberText = string | number | null;

const _str = (raw: unknown): string =>
  raw === null || raw === undefined ? '' : String(raw).trim();

const _length = (text: string): number => [...text.trim()].length;

// --- Поправка встроенной -------------------------------------------------------------------------------------

export type CorrectionDraft = {
  code: string;
  enabled: boolean;
  notify: CheckNotify;
  note: string;
  params: Record<string, NumberText>;
};

export var correctionDraftOf = (view: CheckView): CorrectionDraft => ({
  code: view.code,
  enabled: view.enabled,
  notify: view.notify,
  note: view.note,
  params: Object.fromEntries(
    Object.entries(view.params as Record<string, number>).map(
      ({ 0: key, 1: value }) => [key, String(value)]
    )
  ),
});

/** Ошибки порогов: поле `params.<ключ>` → подсказка с пределами. */
export var correctionProblems = (
  draft: CorrectionDraft
): Record<string, string> =>
  ((spec) =>
    Object.fromEntries([
      ...Object.entries(spec?.params ?? {}).flatMap(({ 0: key, 1: kind }) =>
        ((text) =>
          text !== '' && fitsParam(Number(text.replace(',', '.')), kind)
            ? []
            : [
                [
                  `params.${key}`,
                  t(
                    PARAM_RANGES[kind].tenths
                      ? 'qualityForm.percentHint'
                      : 'qualityForm.rangeHint',
                    {
                      min: PARAM_RANGES[kind].min,
                      max: PARAM_RANGES[kind].max,
                    }
                  ),
                ],
              ])(_str(draft.params[key]))
      ),
      ...(_length(draft.note) > QUALITY_LIMITS.note
        ? [['note', t('setupForm.noteHint', { n: QUALITY_LIMITS.note })]]
        : []),
    ]))(builtinCheck(draft.code));

/**
 * Тело поправки: пороги — только те, что отличаются от ядра (остальные — значения ядра и на новом сайте), все
 * равны ядру — `params: null`; у «мало данных» нет «включена» и «уведомлять».
 */
export var correctionBody = (draft: CorrectionDraft): Record<string, unknown> =>
  ((spec) =>
    ((params) => ({
      code: draft.code,
      note: draft.note.trim(),
      ...(spec?.clock === null
        ? {}
        : { enabled: draft.enabled, notify: draft.notify }),
      params: Object.keys(params).length === 0 ? null : params,
    }))(
      Object.fromEntries(
        Object.keys(spec?.params ?? {})
          .map((key) => [
            key,
            Number(_str(draft.params[key]).replace(',', '.')),
          ])
          .filter(
            ({ 0: key, 1: value }) => value !== spec?.defaults[key as string]
          )
      )
    ))(builtinCheck(draft.code));

// --- Своя пороговая ------------------------------------------------------------------------------------------

/** Показатели своей проверки — как `CHECK_METRICS` сервера. */
export var CHECK_METRICS: readonly CheckMetric[] = [
  'events',
  'role',
  'people',
  'customers',
  'revenue',
  'visitors',
  'goal',
];

export type RuleParam = 'sender' | 'type' | 'role' | 'goal' | 'currency';

/** Поля показателя — как `METRIC_PARAMS` сервера: обязательные и необязательные, остальные — null. */
export var METRIC_PARAMS: Readonly<
  Record<
    CheckMetric,
    {
      readonly required: readonly RuleParam[];
      readonly optional: readonly RuleParam[];
    }
  >
> = {
  events: { required: ['sender', 'type'], optional: [] },
  role: { required: ['role'], optional: ['sender'] },
  people: { required: [], optional: [] },
  customers: { required: [], optional: [] },
  revenue: { required: ['currency'], optional: [] },
  visitors: { required: [], optional: [] },
  goal: { required: ['goal'], optional: [] },
};

/** Роли показателя `role`: без сводки и удаления — как `RULE_ROLES_EXCLUDED` сервера. */
export var RULE_ROLES: readonly EventRole[] = ROLES.filter(
  (_) => _ !== 'summary' && _ !== 'erasure'
);

export var RULE_DAYS: readonly ThresholdRule['days'][] = [1, 7, 30];

export type RuleDraft = {
  code: string;
  name: string;
  note: string;
  enabled: boolean;
  notify: CheckNotify;
  metric: CheckMetric | '';
  sender: string;
  type: string;
  role: EventRole | '';
  /** `go:` — любой переход, `go:<код>` — переход, `form` — форма с именем в `form`. */
  goal: string;
  form: string;
  currency: string;
  compare: 'lt' | 'gt';
  threshold: NumberText;
  days: ThresholdRule['days'];
  severity: 'warning' | 'failure';
};

export var FORM_GOAL_CHOICE = 'form';

export var EMPTY_RULE: RuleDraft = {
  code: '',
  name: '',
  note: '',
  enabled: true,
  notify: 'failure',
  metric: '',
  sender: '',
  type: '',
  role: '',
  goal: 'go:',
  form: '',
  currency: '',
  compare: 'lt',
  threshold: '1',
  days: 1,
  severity: 'warning',
};

/** Черновик своей проверки из списка; у выручки порог — суммой с десятичным знаком языка. */
export var ruleDraftOf = (view: CheckView | null): RuleDraft =>
  view === null
    ? { ...EMPTY_RULE }
    : ((rule) => ({
        code: view.code,
        name: view.name,
        note: view.note,
        enabled: view.enabled,
        notify: view.notify,
        metric: rule.metric,
        sender: rule.sender ?? '',
        type: rule.type ?? '',
        role: rule.role ?? '',
        goal: rule.goal?.startsWith('form:')
          ? FORM_GOAL_CHOICE
          : (rule.goal ?? 'go:'),
        form: rule.goal?.startsWith('form:') ? rule.goal.slice(5) : '',
        currency: rule.currency ?? '',
        compare: rule.compare,
        threshold:
          rule.metric === 'revenue' && rule.currency
            ? amountText(rule.threshold, rule.currency, currentLanguage())
            : String(rule.threshold),
        days: rule.days,
        severity: rule.severity,
      }))(view.params as ThresholdRule);

const _FORM = /^[a-z0-9][a-z0-9-]{0,63}$/;

const _goalOf = (draft: RuleDraft): string =>
  draft.goal === FORM_GOAL_CHOICE ? `form:${draft.form.trim()}` : draft.goal;

/** Что проверка знает о правке: настройка, все проверки и прежняя (null — новая). */
export type RuleContext = {
  readonly setup: SetupView;
  readonly checks: readonly CheckView[];
  readonly existing: CheckView | null;
};

/** Проверка своей до отправки — правила сервера: код, название, поля показателя, порог. */
export var ruleProblems = (
  draft: RuleDraft,
  { checks, existing }: RuleContext
): Record<string, string> =>
  ((wanted) =>
    Object.fromEntries(
      (
        [
          [
            'code',
            existing === null &&
              (!isCheckCode(draft.code)
                ? t('qualityForm.codeHint', { n: CHECK_CODE_LIMIT })
                : BUILTIN_CHECKS.some((_) => _.code === draft.code)
                  ? t('qualityForm.codeBuiltin')
                  : checks.some((_) => _.code === draft.code)
                    ? t('setupForm.codeTaken')
                    : false),
          ],
          [
            'name',
            (_length(draft.name) < 1 || _length(draft.name) > 100) &&
              t('setupForm.nameHint', { n: 100 }),
          ],
          [
            'note',
            _length(draft.note) > QUALITY_LIMITS.note &&
              t('setupForm.noteHint', { n: QUALITY_LIMITS.note }),
          ],
          ['metric', draft.metric === '' && t('qualityForm.metricRequired')],
          [
            'sender',
            wanted.includes('sender') &&
              draft.metric === 'events' &&
              draft.sender === '' &&
              t('qualityForm.senderRequired'),
          ],
          [
            'type',
            wanted.includes('type') &&
              draft.type === '' &&
              t('qualityForm.typeRequired'),
          ],
          [
            'role',
            wanted.includes('role') &&
              draft.role === '' &&
              t('qualityForm.roleRequired'),
          ],
          [
            'currency',
            wanted.includes('currency') &&
              !CURRENCIES.includes(draft.currency) &&
              t('qualityForm.currencyRequired'),
          ],
          [
            'goal',
            wanted.includes('goal') &&
              draft.goal === FORM_GOAL_CHOICE &&
              !_FORM.test(draft.form.trim()) &&
              t('funnels.formHint'),
          ],
          [
            'threshold',
            draft.metric === 'revenue'
              ? CURRENCIES.includes(draft.currency) &&
                parseAmount(_str(draft.threshold), draft.currency) === null &&
                t('qualityForm.moneyHint', { currency: draft.currency })
              : !/^\d+$/.test(_str(draft.threshold)) ||
                  Number(_str(draft.threshold)) > QUALITY_LIMITS.threshold
                ? t('qualityForm.thresholdHint', {
                    n: QUALITY_LIMITS.threshold,
                  })
                : false,
          ],
        ] as readonly (readonly [string, string | false])[]
      ).filter((_): _ is readonly [string, string] => typeof _[1] === 'string')
    ))(
    draft.metric === ''
      ? []
      : [
          ...METRIC_PARAMS[draft.metric].required,
          ...METRIC_PARAMS[draft.metric].optional,
        ]
  );

/** Тело своей: правило целиком, поля чужих показателей — null; порог выручки — строкой денег. */
export var ruleBody = (draft: RuleDraft): Record<string, unknown> =>
  ((metric, wanted) => ({
    code: draft.code,
    name: draft.name.trim(),
    note: draft.note.trim(),
    enabled: draft.enabled,
    notify: draft.notify,
    params: {
      metric,
      sender:
        wanted.includes('sender') && draft.sender !== '' ? draft.sender : null,
      type: wanted.includes('type') && draft.type !== '' ? draft.type : null,
      role: wanted.includes('role') && draft.role !== '' ? draft.role : null,
      goal: wanted.includes('goal') ? _goalOf(draft) : null,
      currency: wanted.includes('currency') ? draft.currency : null,
      compare: draft.compare,
      threshold:
        metric === 'revenue'
          ? parseAmount(_str(draft.threshold), draft.currency)
          : Number(_str(draft.threshold)),
      days: draft.days,
      severity: draft.severity,
    },
  }))(draft.metric as CheckMetric, [
    ...METRIC_PARAMS[draft.metric as CheckMetric].required,
    ...METRIC_PARAMS[draft.metric as CheckMetric].optional,
  ]);

/** Своих — до 20, в архиве тоже в счёте. */
export var customCount = (checks: readonly CheckView[]): number =>
  checks.filter((_) => !_.builtin).length;

// --- Выписка -------------------------------------------------------------------------------------------------

/** Сумма со знаком из поля: «-12,50» — минус; правила `signedMoney` сервера. Ответ — запись с точкой. */
export var parseSignedAmount = (raw: string, currency: string): string | null =>
  ((text) =>
    /^[-−]/.test(text)
      ? ((rest) => (rest === null ? null : `-${rest}`))(
          parseAmount(text.slice(1), currency)
        )
      : parseAmount(text, currency))(raw.trim());

/** Прошлый месяц в поясе отчётов: выписку за идущий месяц не сверить. */
export var lastMonth = (zone: string, now: number = Date.now()): string =>
  addMonths(dayIn(now, zone).slice(0, 7), -1);

export var FIRST_MONTH = '2000-01';

export type StatementDraft = {
  month: string;
  currency: string;
  amount: string;
  fees: 'gross' | 'net';
  note: string;
};

export var statementDraftOf = (
  view: StatementView | null,
  month: string
): StatementDraft =>
  view === null
    ? { month, currency: '', amount: '', fees: 'gross', note: '' }
    : {
        month: view.month,
        currency: view.currency,
        amount: amountText(view.amount, view.currency, currentLanguage()),
        fees: view.fees,
        note: view.note,
      };

/** Проверка выписки до отправки; `fresh` — новая: ключ «месяц, валюта» не должен совпасть с внесённой. */
export var statementProblems = (
  draft: StatementDraft,
  last: string,
  existing: readonly Pick<StatementView, 'month' | 'currency'>[],
  fresh: boolean
): Record<string, string> =>
  Object.fromEntries(
    (
      [
        [
          'month',
          !isMonth(draft.month) ||
          draft.month < FIRST_MONTH ||
          draft.month > last
            ? t('statements.monthHint')
            : fresh &&
              existing.some(
                (_) => _.month === draft.month && _.currency === draft.currency
              ) &&
              t('statements.exists'),
        ],
        [
          'currency',
          !CURRENCIES.includes(draft.currency) &&
            t('qualityForm.currencyRequired'),
        ],
        [
          'amount',
          CURRENCIES.includes(draft.currency) &&
            parseSignedAmount(draft.amount, draft.currency) === null &&
            t('statements.amountHint', { currency: draft.currency }),
        ],
        [
          'note',
          _length(draft.note) > QUALITY_LIMITS.note &&
            t('setupForm.noteHint', { n: QUALITY_LIMITS.note }),
        ],
      ] as readonly (readonly [string, string | false])[]
    ).filter((_): _ is readonly [string, string] => typeof _[1] === 'string')
  );

export var statementBody = (
  draft: StatementDraft
): Record<string, unknown> => ({
  month: draft.month,
  currency: draft.currency,
  amount: parseSignedAmount(draft.amount, draft.currency),
  fees: draft.fees,
  note: draft.note.trim(),
});
