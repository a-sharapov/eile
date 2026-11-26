<script lang="ts">
import {
  addDays,
  COMPARE_KINDS,
  clampRange,
  compareOf,
  DEFAULT_DAYS,
  feesOf,
  filtersOf,
  firstQuestion,
  isDay,
  LIFETIMES,
  lifeOf,
  PAYMENT_WINDOWS,
  PEOPLE_REPORT_KEYS,
  PERIOD_PRESETS,
  type PeriodChoice,
  periodOf,
  periodPatch,
} from '#lib/analytics-reports.ts';
import { currentLanguage, type MessageKey, quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { SetupView } from '#lib/types.ts';
import { page } from '$app/state';
import { filterLabel, milestoneName, stepName } from './names.ts';
import { type QueryPatch, setQuery } from './query.ts';

// Ряд управления отчётов (ADR 0072, «Экраны этапа 2» и «Экраны этапа 3»): период, атрибуция, группа, окно оплаты,
// срок жизни, комиссия, сравнение, тестовые и плашки фильтров. Всё — в адресе: ссылкой открывается тот же отчёт,
// вкладки переносят период, атрибуцию, фильтры, тестовых, комиссию и сравнение. Смена заменяет запись истории, как
// фильтр. У «Людей» — только плашки отчёта, из которого пришли; у «Когорт» период — месяцами (6, 12, 24) и
// комиссия, у «Сравнения вех» — окно оплаты.
let {
  mode,
  setup,
  today,
  group = null,
  payment = false,
  life = false,
  presets = PERIOD_PRESETS,
  fallback = DEFAULT_DAYS,
}: {
  mode: 'sources' | 'funnel' | 'people' | 'cohorts' | 'milestones';
  setup: SetupView;
  /** Сегодня в поясе отчёта: свои даты кончаются не позже него. */
  today: string;
  /** Группа строк, которую взял отчёт: без `group` в адресе — по умолчанию сервера. */
  group?: string | null;
  /** У сайта есть роль «оплата»: есть окно оплаты и выбор «до / после комиссии». */
  payment?: boolean;
  /** У отчёта есть LTV: есть и срок жизни. */
  life?: boolean;
  /** Готовые периоды днями: у «Когорт» — 6, 12 и 24 месяца. */
  presets?: readonly number[];
  /** Период без параметра в адресе: 30 дней, у «Когорт» — 12 месяцев. */
  fallback?: number;
} = $props();

const id = $props.id();
const query = $derived(page.url.searchParams);
const period = $derived(periodOf(query, today, fallback));
const attribution = $derived(
  query.get('attribution') === 'return' ? 'return' : 'first'
);
const chosenGroup = $derived(query.get('group') || group || '');
const question = $derived(firstQuestion(setup));
const filters = $derived(filtersOf(query));
const test = $derived(query.get('test') === '1');

// Свои даты: поля открыты, пока выбраны свои даты или человек их открыл; по умолчанию — период без параметра.
let customOpen = $state(false);
let range = $state({ from: '', to: '' });
const custom = $derived(period.kind === 'range' || customOpen);

$effect(() => {
  const next = period;
  void (
    next.kind === 'range' && ((range.from = next.from), (range.to = next.to))
  );
});

const openCustom = () =>
  void ((customOpen = true),
  period.kind !== 'range' &&
    ((range.from = addDays(today, 1 - fallback)), (range.to = today)));

const choose = (choice: PeriodChoice) => (
  (customOpen = false), setQuery(periodPatch(choice, fallback))
);

const applyRange = (event: SubmitEvent) => (
  event.preventDefault(),
  void (
    isDay(range.from) &&
    isDay(range.to) &&
    ((next) => (
      (range.from = next.from),
      (range.to = next.to),
      setQuery(periodPatch({ kind: 'range', ...next }, fallback))
    ))(clampRange(range.from, range.to, today))
  )
);

const _PRESET_LABELS: Readonly<Record<number, MessageKey>> = {
  7: 'stats.days7',
  30: 'stats.days30',
  90: 'stats.days90',
  183: 'report.months6',
  365: 'report.months12',
  730: 'report.months24',
};

// Выбор периода на узком экране — выпадающим списком: те же варианты, что у кнопок.
const periodValue = $derived(
  custom
    ? 'custom'
    : period.kind === 'all'
      ? 'all'
      : period.kind === 'days'
        ? String(period.days)
        : 'custom'
);

const pickPeriod = (value: string) =>
  value === 'custom'
    ? openCustom()
    : value === 'all'
      ? void choose({ kind: 'all' })
      : void choose({ kind: 'days', days: Number(value) });

const attributionValue = $derived(
  attribution === 'return'
    ? 'return'
    : chosenGroup.startsWith('answer:')
      ? 'answer'
      : 'first'
);

const _ATTRIBUTIONS: Readonly<Record<string, () => QueryPatch>> = {
  first: () => ({
    attribution: null,
    group: chosenGroup.startsWith('answer:') ? null : query.get('group'),
  }),
  return: () => ({ attribution: 'return' }),
  answer: () => ({
    attribution: null,
    group: question === null ? null : `answer:${question}`,
  }),
};

const pickAttribution = (value: string) =>
  void setQuery((_ATTRIBUTIONS[value] ?? _ATTRIBUTIONS.first!)());

// Группы — то, по чему делятся строки: части метки, признаки и свойства с отметкой «разрез», вопросы опроса,
// метка целиком и отправитель. Элемент в архиве — только если он уже выбран.
const kept = <T extends { archivedAt: string | null }>(
  items: readonly T[],
  value: (item: T) => string
): T[] =>
  items.filter((_) => _.archivedAt === null || value(_) === chosenGroup);

const groups = $derived([
  {
    label: t('report.groupParts'),
    options: kept(
      setup.dictionaries.filter((_) => _.purpose === 'parts'),
      (_) => `part:${_.code}`
    ).map((_) => ({ value: `part:${_.code}`, name: _.name })),
  },
  {
    label: t('report.groupTraits'),
    options: kept(
      setup.properties.filter((_) => _.scope === 'person' && _.dimension),
      (_) => `trait:${_.code}`
    ).map((_) => ({ value: `trait:${_.code}`, name: _.name })),
  },
  {
    label: t('report.groupProps'),
    options: kept(
      setup.properties.filter((_) => _.scope === 'event' && _.dimension),
      (_) => `prop:${_.code}`
    ).map((_) => ({ value: `prop:${_.code}`, name: _.name })),
  },
  {
    label: t('report.groupQuestions'),
    options: kept(
      setup.dictionaries.filter((_) => _.purpose === 'answers'),
      (_) => `answer:${_.code}`
    ).map((_) => ({ value: `answer:${_.code}`, name: _.name })),
  },
  {
    label: t('report.groupOther'),
    options: [
      { value: 'label', name: t('report.groupLabel') },
      { value: 'sender', name: t('report.groupSender') },
    ],
  },
]);

const windowValue = $derived(
  ((raw) => (raw === '0' || raw === '7' ? raw : '30'))(query.get('window'))
);

const _WINDOW_LABELS: Readonly<Record<string, MessageKey>> = {
  7: 'report.window7',
  30: 'report.window30',
  0: 'report.window0',
};

// Деньги этапа 3: срок жизни LTV, комиссия и сравнение — тоже в адресе; по умолчанию — без параметра.
const lifeValue = $derived(String(lifeOf(query)));
const feesValue = $derived(feesOf(query));
const compareValue = $derived(compareOf(query) ?? '');

const _LIFE_LABELS: Readonly<Record<string, MessageKey>> = {
  0: 'report.lifeAll',
  3: 'report.life3',
  6: 'report.life6',
  12: 'report.life12',
};

const _COMPARE_LABELS: Readonly<Record<string, MessageKey>> = {
  '': 'report.compareNone',
  previous: 'report.comparePrevious',
  year: 'report.compareYear',
};

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

/** Период словами для плашки «Людей»: «Последние 7 дней», «1 окт. 2026 г. — 31 окт. 2026 г.», «Всё время». */
const periodText = (choice: PeriodChoice): string =>
  choice.kind === 'all'
    ? t('report.allTime')
    : choice.kind === 'range'
      ? t('report.rangeText', {
          from: _date(choice.from),
          to: _date(choice.to),
        })
      : _PRESET_LABELS[choice.days] && choice.days >= 183
        ? t(_PRESET_LABELS[choice.days]!)
        : tn('report.lastDays', choice.days);

const funnelOf = (code: string) => setup.funnels.find((_) => _.code === code);

// Плашки «Людей»: период, атрибуция, фильтры, веха и шаг воронки — то, из чего собран список.
type Chip = { key: string; text: string; patch: QueryPatch };

const peopleChips = $derived<Chip[]>(
  mode !== 'people'
    ? []
    : [
        ...(query.get('days') ||
        query.get('from') ||
        query.get('to') ||
        query.get('all')
          ? [
              {
                key: 'period',
                text: t('report.chipPeriod', { period: periodText(period) }),
                patch: { days: null, from: null, to: null, all: null },
              },
            ]
          : []),
        ...(query.get('by') === 'payment'
          ? [
              {
                key: 'by',
                text: t('report.chipByPayment'),
                patch: { by: null },
              },
            ]
          : []),
        ...(attribution === 'return' && query.get('funnel') === null
          ? [
              {
                key: 'attribution',
                text: t('report.attributionReturn'),
                patch: { attribution: null },
              },
            ]
          : []),
        ...(query.get('milestone')
          ? [
              {
                key: 'milestone',
                text: t(
                  query.get('reached') === '0'
                    ? 'report.chipMissed'
                    : 'report.chipMilestone',
                  {
                    name: quoted(milestoneName(setup, query.get('milestone')!)),
                  }
                ),
                patch: { milestone: null, reached: null },
              },
            ]
          : []),
        ...(query.get('funnel')
          ? ((funnel, step) => [
              {
                key: 'funnel',
                text: t(
                  query.get('stage') === 'stopped'
                    ? 'report.chipStopped'
                    : 'report.chipReached',
                  {
                    funnel: quoted(funnel?.name ?? query.get('funnel')!),
                    n: step + 1,
                    step: quoted(
                      funnel?.steps[step]
                        ? stepName(setup, funnel.steps[step]!)
                        : String(step + 1)
                    ),
                  }
                ),
                patch: { funnel: null, step: null, stage: null },
              },
            ])(funnelOf(query.get('funnel')!), Number(query.get('step') ?? 0))
          : []),
      ]
);

// Фильтры отчёта; у «Людей» отправитель — их собственный фильтр, его плашкой не показываем.
const filterChips = $derived(
  filters
    .filter((_) => mode !== 'people' || _.key !== 'sender')
    .map((_) => ({
      key: _.key,
      text: filterLabel(setup, _.key, _.value),
      patch: { [_.key]: null } as QueryPatch,
    }))
);

const chips = $derived([...peopleChips, ...filterChips]);

const reset = () =>
  void setQuery(
    Object.fromEntries(
      (mode === 'people'
        ? [...PEOPLE_REPORT_KEYS, ...filterChips.map((_) => _.key)]
        : filters.map((_) => _.key)
      ).map((_) => [_, null])
    )
  );
</script>

{#snippet paymentWindow()}
  <label>
    <span>{t('report.window')}</span>
    <select value={windowValue} onchange={(e) => setQuery({ window: e.currentTarget.value === '30' ? null : e.currentTarget.value })}>
      {#each PAYMENT_WINDOWS as window (window)}<option value={String(window)}>{t(_WINDOW_LABELS[String(window)]!)}</option>{/each}
    </select>
  </label>
{/snippet}

<div class="report-bar">
  {#if mode !== 'people'}
    <div class="controls">
      <div class="segments period-buttons" role="group" aria-label={t('stats.period')}>
        {#each presets as days (days)}
          <button type="button" aria-pressed={!custom && period.kind === 'days' && period.days === days} onclick={() => choose({ kind: 'days', days })}>{t(_PRESET_LABELS[days]!)}</button>
        {/each}
        <button type="button" aria-pressed={!custom && period.kind === 'all'} onclick={() => choose({ kind: 'all' })}>{t('report.allTime')}</button>
        <button type="button" aria-pressed={custom} onclick={openCustom}>{t('stats.custom')}</button>
      </div>
      <label class="period-select">
        <span>{t('stats.period')}</span>
        <select value={periodValue} onchange={(e) => pickPeriod(e.currentTarget.value)}>
          {#each presets as days (days)}<option value={String(days)}>{t(_PRESET_LABELS[days]!)}</option>{/each}
          {#if period.kind === 'days' && !presets.includes(period.days)}<option value={String(period.days)}>{tn('report.lastDays', period.days)}</option>{/if}
          <option value="all">{t('report.allTime')}</option>
          <option value="custom">{t('stats.custom')}</option>
        </select>
      </label>

      {#if mode === 'sources'}
        <label>
          <span>{t('report.attribution')}</span>
          <select value={attributionValue} onchange={(e) => pickAttribution(e.currentTarget.value)}>
            <option value="first">{t('report.attributionFirst')}</option>
            <option value="return">{t('report.attributionReturn')}</option>
            {#if question !== null}<option value="answer">{t('report.attributionAnswer')}</option>{/if}
          </select>
        </label>
        <label>
          <span>{t('report.group')}</span>
          <select value={chosenGroup} onchange={(e) => setQuery({ group: e.currentTarget.value })}>
            {#each groups.filter((_) => _.options.length > 0) as item (item.label)}
              <optgroup label={item.label}>
                {#each item.options as option (option.value)}<option value={option.value}>{option.name}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </label>
        {#if payment && attribution === 'first'}
          {@render paymentWindow()}
        {/if}
        {#if life && attribution === 'first'}
          <label>
            <span>{t('report.life')}</span>
            <select value={lifeValue} onchange={(e) => setQuery({ life: e.currentTarget.value === '0' ? null : e.currentTarget.value })}>
              {#each LIFETIMES as months (months)}<option value={String(months)}>{t(_LIFE_LABELS[String(months)]!)}</option>{/each}
            </select>
          </label>
        {/if}
      {/if}
      {#if mode === 'milestones' && payment}
        {@render paymentWindow()}
      {/if}
      {#if (mode === 'sources' || mode === 'cohorts') && payment}
        <label>
          <span>{t('report.fees')}</span>
          <select value={feesValue} onchange={(e) => setQuery({ fees: e.currentTarget.value === 'net' ? 'net' : null })}>
            <option value="gross">{t('report.feesGross')}</option>
            <option value="net">{t('report.feesNet')}</option>
          </select>
        </label>
      {/if}

      {#if mode === 'sources' || mode === 'funnel'}
        <label>
          <span>{t('report.compare')}</span>
          <select value={compareValue} disabled={period.kind === 'all'} title={period.kind === 'all' ? t('report.compareAll') : undefined} onchange={(e) => setQuery({ compare: e.currentTarget.value || null })}>
            {#each ['', ...COMPARE_KINDS] as kind (kind)}<option value={kind}>{t(_COMPARE_LABELS[kind]!)}</option>{/each}
          </select>
        </label>
      {/if}

      <label class="check">
        <input type="checkbox" checked={test} onchange={(e) => setQuery({ test: e.currentTarget.checked ? '1' : null })} />
        {t('people.showTest')}
      </label>
    </div>

    {#if custom}
      <form class="range" novalidate onsubmit={applyRange} aria-label={t('stats.custom')}>
        <label><span>{t('stats.from')}</span><input id={`${id}-from`} type="date" required bind:value={range.from} max={range.to || today} /></label>
        <label><span>{t('stats.to')}</span><input id={`${id}-to`} type="date" required bind:value={range.to} min={range.from} max={today} /></label>
        <button class="button">{t('stats.show')}</button>
        <small class="muted">{t('report.rangeHint', { today: _date(today) })}</small>
      </form>
    {/if}
  {/if}

  {#if chips.length > 0}
    <div class="chips" role="group" aria-label={t(mode === 'people' ? 'report.fromReport' : 'report.filters')}>
      {#if mode === 'people'}<span class="lead">{t('report.fromReport')}</span>{/if}
      {#each chips as chip (chip.key)}
        <span class="chip">
          <span class="text">{chip.text}</span>
          <button type="button" class="ghost icon" aria-label={t('report.removeFilter', { name: chip.text })} title={t('report.removeFilter', { name: chip.text })} onclick={() => setQuery(chip.patch)}>{@html icons.close}</button>
        </span>
      {/each}
      <button type="button" class="ghost reset" onclick={reset}>{t(mode === 'people' ? 'report.resetReport' : 'report.resetFilters')}</button>
    </div>
  {/if}
</div>

<style>
  .report-bar {
    display: grid;
    gap: 0.75rem;
    container-type: inline-size;
    min-width: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: flex-end;
  }

  .controls label:not(.check) {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .controls label > span,
  .range label > span {
    font-size: 0.8125rem;
  }

  .controls select {
    max-width: 16rem;
  }

  .check {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    min-height: var(--control);
    font-size: 0.875rem;
  }

  .segments {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .segments button {
    min-height: 2rem;
    padding: 0 0.7rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    white-space: nowrap;
  }

  .segments button[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--surface);
    box-shadow: var(--shadow-s);
    color: var(--text);
    font-weight: 600;
  }

  .controls > label.period-select {
    display: none;
  }

  .range {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: flex-end;
  }

  .range label {
    display: grid;
    gap: 0.25rem;
  }

  .range small {
    flex-basis: 100%;
    font-size: 0.75rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .lead {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .chip {
    display: inline-flex;
    gap: 0.15rem;
    align-items: center;
    max-width: 100%;
    min-height: 1.875rem;
    padding: 0 0.15rem 0 0.6rem;
    border: 0.0625rem solid color-mix(in oklch, var(--accent) 35%, var(--line));
    border-radius: 999rem;
    background: var(--accent-soft);
    font-size: 0.8125rem;
  }

  .chip .text {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .chip button {
    flex: none;
    width: 1.5rem;
    min-width: 1.5rem;
    height: 1.5rem;
    min-height: 1.5rem;
    padding: 0;
    border-radius: 999rem;
  }

  .chip :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
  }

  .reset {
    min-height: 1.875rem;
    padding: 0 0.6rem;
    font-size: 0.8125rem;
  }

  /* Узкий экран: период — выпадающим списком, поля друг под другом во всю ширину. */
  @container (width < 48rem) {
    .period-buttons {
      display: none;
    }

    .controls > label.period-select {
      display: grid;
    }

    .controls label:not(.check) {
      flex: 1 1 12rem;
    }

    .controls select {
      width: 100%;
      max-width: none;
    }
  }
</style>
