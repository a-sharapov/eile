import { FORM_GOAL, GO_GOAL, HOST_TOKEN } from '#lib/analytics.ts';
import { NONE, REST, UNKNOWN } from '#lib/analytics-reports.ts';
import { number, quoted, t } from '#lib/i18n.ts';
import type {
  Acquisition,
  AnalyticsDictionary,
  AnalyticsProperty,
  DictionaryValue,
  EventType,
  FunnelStep,
  MilestoneCondition,
  Parts,
  PropertyScope,
  SetupView,
} from '#lib/types.ts';

// Названия элементов настройки для экранов: код — запасное имя, если элемента нет (удалили, не завели).

export var senderName = (setup: SetupView | null, code: string): string =>
  setup?.senders.find((_) => _.code === code)?.name ?? code;

export var dictionaryOf = (
  setup: SetupView | null,
  code: string | null
): (AnalyticsDictionary & { values: DictionaryValue[] }) | undefined =>
  setup?.dictionaries.find((_) => _.code === code);

export var propertyOf = (
  setup: SetupView | null,
  scope: PropertyScope,
  code: string
): AnalyticsProperty | undefined =>
  setup?.properties.find((_) => _.scope === scope && _.code === code);

/** Значение справочника по коду; нет — undefined: значение вне справочника. */
export var valueIn = (
  setup: SetupView | null,
  dictionary: string | null,
  code: string
): DictionaryValue | undefined =>
  dictionaryOf(setup, dictionary)?.values.find((_) => _.code === code);

/** Часть метки: справочник с назначением «Часть метки». */
export var partOf = (
  setup: SetupView | null,
  code: string
): (AnalyticsDictionary & { values: DictionaryValue[] }) | undefined =>
  setup?.dictionaries.find((_) => _.code === code && _.purpose === 'parts');

export var partName = (setup: SetupView | null, code: string): string =>
  partOf(setup, code)?.name ?? code;

/** Значение части названием; `{host}` — словами, вне справочника — кодом. */
export var partValueName = (
  setup: SetupView | null,
  part: string,
  value: string
): string =>
  value === HOST_TOKEN
    ? t('analytics.hostValue')
    : (valueIn(setup, part, value)?.name ?? value);

/** Части словами: «Источник: Instagram · Тип: Органика». */
export var partsText = (setup: SetupView | null, parts: Parts): string =>
  Object.entries(parts)
    .map(
      ({ 0: part, 1: value }) =>
        `${partName(setup, part)}: ${partValueName(setup, part, value)}`
    )
    .join(' · ');

export var typeOf = (
  setup: SetupView | null,
  sender: string,
  code: string
): EventType | undefined =>
  setup?.types.find((_) => _.sender === sender && _.code === code);

export var typeName = (
  setup: SetupView | null,
  sender: string,
  code: string
): string => typeOf(setup, sender, code)?.name ?? code;

export var linkName = (setup: SetupView | null, code: string): string =>
  setup?.links.find((_) => _.code === code)?.name ?? code;

export var milestoneName = (setup: SetupView | null, code: string): string =>
  setup?.milestones.find((_) => _.code === code)?.name ?? code;

/** Условие вехи словами: «Шагов ≥ 2», «Тариф = годовой», «Повторно = да». */
export var conditionText = (
  setup: SetupView | null,
  condition: MilestoneCondition
): string =>
  ((property) =>
    'gte' in condition
      ? t('milestones.conditionGte', {
          property: property?.name ?? condition.property,
          value: number(condition.gte),
        })
      : t('milestones.conditionEq', {
          property: property?.name ?? condition.property,
          value:
            typeof condition.eq === 'boolean'
              ? t(condition.eq ? 'common.yes' : 'common.no')
              : typeof condition.eq === 'string'
                ? (valueIn(setup, property?.dictionary ?? null, condition.eq)
                    ?.name ?? condition.eq)
                : number(condition.eq),
        }))(propertyOf(setup, 'event', condition.property));

const _goalName = (setup: SetupView | null, goal: string): string =>
  goal === GO_GOAL
    ? t('funnels.stepAnyLink')
    : goal.startsWith(GO_GOAL)
      ? t('funnels.stepLinkNamed', {
          name: quoted(linkName(setup, goal.slice(GO_GOAL.length))),
        })
      : t('funnels.stepFormNamed', { name: goal.slice(FORM_GOAL.length) });

/** Шаг воронки словами: «Посетители сайта», «Нажали переход „Попробовать“», «Оплата № 2». */
export var stepName = (setup: SetupView | null, step: FunnelStep): string =>
  (
    ({
      visits: () =>
        step.kind === 'visits' && step.page !== null
          ? t('funnels.stepPageNamed', { page: step.page })
          : t('funnels.stepVisits'),
      goal: () => (step.kind === 'goal' ? _goalName(setup, step.goal) : ''),
      arrival: () => t('funnels.stepArrival'),
      trial: () => t('funnels.stepTrial'),
      payment: () =>
        t('funnels.stepPaymentNamed', {
          n: step.kind === 'payment' ? step.number : 1,
        }),
      milestone: () =>
        step.kind === 'milestone'
          ? t('funnels.stepMilestoneNamed', {
              name: quoted(milestoneName(setup, step.milestone)),
            })
          : '',
      type: () =>
        step.kind === 'type'
          ? t('funnels.stepTypeNamed', {
              name: quoted(typeName(setup, step.sender, step.type)),
            })
          : '',
    }) satisfies Record<FunnelStep['kind'], () => string>
  )[step.kind]();

/** Значение строки отчёта, которого нет в настройке: «не указано», «не из справочника» (у метки — «не из реестра»), «остальные». */
export var specialName = (group: string, value: string): string | null =>
  value === NONE
    ? t('report.none')
    : value === UNKNOWN
      ? t(group === 'label' ? 'report.unknownLabel' : 'report.unknown')
      : value === REST
        ? t('report.rest')
        : null;

// Значение свойства или признака словами: выбор — названием из справочника, «да или нет» — словом, число — как есть.
const _propertyValue = (
  setup: SetupView | null,
  property: AnalyticsProperty | undefined,
  value: string
): string =>
  value === 'true' || value === 'false'
    ? t(value === 'true' ? 'common.yes' : 'common.no')
    : property?.kind === 'choice'
      ? (valueIn(setup, property.dictionary, value)?.name ?? value)
      : value;

/**
 * Значение строки отчёта словами: название от сервера; у чисел и «да или нет» его нет — значение словами; у
 * `~…` — «не указано» и другие.
 */
export var rowValueName = (
  setup: SetupView | null,
  group: string,
  value: string,
  name: string | null
): string =>
  specialName(group, value) ??
  name ??
  ((kind, code) =>
    kind === 'trait' || kind === 'prop'
      ? _propertyValue(
          setup,
          propertyOf(setup, kind === 'trait' ? 'person' : 'event', code),
          value
        )
      : value)(
    group.slice(0, group.indexOf(':')),
    group.slice(group.indexOf(':') + 1)
  );

/** Группа строк словами: «Источник», «Тариф», «Откуда узнали», «Метка целиком», «Отправитель». */
export var groupName = (setup: SetupView | null, group: string): string =>
  ((kind, code) =>
    (
      ({
        part: () => partName(setup, code),
        trait: () => propertyOf(setup, 'person', code)?.name ?? code,
        prop: () => propertyOf(setup, 'event', code)?.name ?? code,
        answer: () => dictionaryOf(setup, code)?.name ?? code,
        label: () => t('report.groupLabel'),
        sender: () => t('report.groupSender'),
      }) as Readonly<Record<string, () => string>>
    )[kind]?.() ?? group)(
    group.includes(':') ? group.slice(0, group.indexOf(':')) : group,
    group.slice(group.indexOf(':') + 1)
  );

/** Фильтр отчёта словами для плашки: «Источник: Instagram», «Тип: не указано», «Отправитель: Бот». */
export var filterLabel = (
  setup: SetupView | null,
  key: string,
  value: string
): string =>
  key === 'sender'
    ? t('report.filterNamed', {
        name: t('report.groupSender'),
        value: senderName(setup, value),
      })
    : ((group) =>
        t('report.filterNamed', {
          name: groupName(setup, group),
          value:
            specialName(group, value) ??
            ((kind, code) =>
              kind === 'part' || kind === 'answer'
                ? (valueIn(setup, code, value)?.name ?? value)
                : _propertyValue(
                    setup,
                    propertyOf(
                      setup,
                      kind === 'trait' ? 'person' : 'event',
                      code
                    ),
                    value
                  ))(
              group.slice(0, group.indexOf(':')),
              group.slice(group.indexOf(':') + 1)
            ),
        }))(key.replace('.', ':'));

/** Значения частей названиями по порядку: «Instagram · Платная · Осень». */
export var partValuesText = (setup: SetupView | null, parts: Parts): string =>
  Object.entries(parts)
    .map(({ 0: part, 1: value }) => partValueName(setup, part, value))
    .join(' · ');

/** Источник привлечения словами: части первого касания, иначе ответ опроса, иначе «неизвестно». */
export var acquisitionText = (
  setup: SetupView | null,
  acquisition: Acquisition
): string =>
  acquisition.kind === 'parts'
    ? partValuesText(setup, acquisition.parts)
    : acquisition.kind === 'answer'
      ? t('people.acquisitionAnswer', {
          answer:
            valueIn(setup, acquisition.question, acquisition.answer)?.name ??
            acquisition.answer,
        })
      : t('people.acquisitionUnknown');

/** Значение разреза человека словами: выбор — названием, «да или нет» — словом, число — как есть. */
export var dimValueText = (
  setup: SetupView | null,
  code: string,
  value: string | number | boolean
): string =>
  _propertyValue(setup, propertyOf(setup, 'event', code), String(value));
