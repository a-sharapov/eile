import { ROLE_LABELS } from '#lib/analytics.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import type {
  CheckMetric,
  CheckNotify,
  SetupView,
  TallyOutcome,
  ThresholdRule,
} from '#lib/types.ts';

// Подписи «Качества»: исходы счёта приёма, виды незнакомого, пороги, показатели своей проверки, «уведомлять».

export var OUTCOME_LABELS: Readonly<Record<TallyOutcome, MessageKey>> = {
  accepted: 'intakeOutcome.accepted',
  duplicate: 'intakeOutcome.duplicate',
  conflict: 'intakeOutcome.conflict',
  erased: 'intakeOutcome.erased',
  erasure: 'intakeOutcome.erasure',
  future: 'intakeOutcome.future',
  late: 'intakeOutcome.late',
  invalid: 'intakeOutcome.invalid',
  unauthorized: 'intakeOutcome.unauthorized',
  throttled: 'intakeOutcome.throttled',
  disabled: 'intakeOutcome.disabled',
};

/** Исход словами; незнакомый (новый сервер) — кодом. */
export var outcomeText = (outcome: string): string =>
  Object.hasOwn(OUTCOME_LABELS, outcome)
    ? t(OUTCOME_LABELS[outcome as TallyOutcome])
    : outcome;

const _KINDS: Readonly<Record<string, MessageKey>> = {
  type: 'qualityKind.type',
  question: 'qualityKind.question',
  answer: 'qualityKind.answer',
  value: 'qualityKind.value',
  trait: 'qualityKind.trait',
  part: 'qualityKind.part',
};

/** Вид незнакомого у «Всё знакомо»: тип, вопрос, ответ, значение, признак, часть метки. */
export var kindText = (kind: string): string =>
  Object.hasOwn(_KINDS, kind) ? t(_KINDS[kind]!) : kind;

const _LABEL_NOTES: Readonly<Record<string, MessageKey>> = {
  invalid: 'quality.labelInvalid',
  extra: 'quality.labelExtra',
  length: 'quality.labelLength',
};

export var labelNoteText = (note: string): string =>
  Object.hasOwn(_LABEL_NOTES, note) ? t(_LABEL_NOTES[note]!) : note;

/** Подписи порогов встроенных проверок по ключу. */
export var PARAM_LABELS: Readonly<Record<string, MessageKey>> = {
  missing: 'qualityParam.missing',
  tolerance: 'qualityParam.tolerance',
  failed: 'qualityParam.failed',
  count: 'qualityParam.count',
  share: 'qualityParam.share',
  min: 'qualityParam.min',
  invalid: 'qualityParam.invalid',
  unauthorized: 'qualityParam.unauthorized',
  days: 'qualityParam.days',
  people: 'qualityParam.people',
  customers: 'qualityParam.customers',
};

export var paramText = (key: string): string =>
  Object.hasOwn(PARAM_LABELS, key) ? t(PARAM_LABELS[key]!) : key;

export var NOTIFY_LABELS: Readonly<Record<CheckNotify, MessageKey>> = {
  failure: 'qualityForm.notifyFailure',
  any: 'qualityForm.notifyAny',
  off: 'qualityForm.notifyOff',
};

export var METRIC_LABELS: Readonly<Record<CheckMetric, MessageKey>> = {
  events: 'qualityMetric.events',
  role: 'qualityMetric.role',
  people: 'qualityMetric.people',
  customers: 'qualityMetric.customers',
  revenue: 'qualityMetric.revenue',
  visitors: 'qualityMetric.visitors',
  goal: 'qualityMetric.goal',
};

export var SEVERITY_LABELS: Readonly<
  Record<ThresholdRule['severity'], MessageKey>
> = {
  warning: 'quality.stateWarning',
  failure: 'quality.stateFailure',
};

const _goalText = (goal: string, setup: Pick<SetupView, 'links'>): string =>
  goal === 'go:'
    ? t('qualityMetric.anyLink')
    : goal.startsWith('go:')
      ? t('qualityMetric.link', {
          name: quoted(
            setup.links.find((_) => _.code === goal.slice(3))?.name ??
              goal.slice(3)
          ),
        })
      : t('qualityMetric.form', { name: goal.slice(5) });

/** Показатель своей проверки словами: «события «Оплата» бота», «выручка в EUR», «цель: переход «trial»». */
export var metricText = (
  rule: ThresholdRule,
  setup: Pick<SetupView, 'senders' | 'types' | 'links'>
): string =>
  (
    ({
      events: () =>
        t('qualityMetric.eventsOf', {
          type: quoted(
            setup.types.find(
              (_) => _.sender === rule.sender && _.code === rule.type
            )?.name ??
              rule.type ??
              ''
          ),
          sender:
            setup.senders.find((_) => _.code === rule.sender)?.name ??
            rule.sender ??
            '',
        }),
      role: () =>
        rule.sender === null
          ? t('qualityMetric.roleOf', {
              role: rule.role === null ? '' : t(ROLE_LABELS[rule.role]),
            })
          : t('qualityMetric.roleOfSender', {
              role: rule.role === null ? '' : t(ROLE_LABELS[rule.role]),
              sender:
                setup.senders.find((_) => _.code === rule.sender)?.name ??
                rule.sender,
            }),
      people: () => t('qualityMetric.people'),
      customers: () => t('qualityMetric.customers'),
      revenue: () =>
        t('qualityMetric.revenueIn', { currency: rule.currency ?? '' }),
      visitors: () => t('qualityMetric.visitors'),
      goal: () => _goalText(rule.goal ?? 'go:', setup),
    }) satisfies Record<CheckMetric, () => string>
  )[rule.metric]();

/** Период своей словами: «за сутки», «за 7 суток», «за 30 суток». */
export var periodText = (days: ThresholdRule['days']): string =>
  days === 1 ? t('qualityForm.day1') : t('qualityForm.days', { n: days });
