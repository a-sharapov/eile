<script lang="ts">
import { STATE_LABELS } from '#lib/analytics.ts';
import { dayIn } from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import {
  type CsvRow,
  csvMoment,
  csvMoney,
  csvName,
  csvText,
} from '#lib/csv.ts';
import { saveCsv } from '#lib/download.ts';
import { currentLanguage, number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  PeoplePage,
  PersonListed,
  SetupView,
  StatsSettings,
} from '#lib/types.ts';
import Modal from '../Modal.svelte';
import {
  acquisitionText,
  milestoneName,
  partName,
  partValueName,
} from '../names.ts';

// Выгрузка людей в CSV (ADR 0072, «Выгрузка CSV»): тот же список, что на экране, страницами по 200 через
// `GET /analytics/people`, до 10 000 строк, с ходом и отменой; больше — экран просит сузить фильтр. У кнопки —
// напоминание: в файле псевдонимы, метки и суммы, хранить его как копию сайта.
let {
  setup,
  search,
  total,
  period,
}: {
  setup: SetupView;
  /** Параметры списка без страницы: фильтры и параметры отчёта. */
  search: readonly [string, string][];
  total: number;
  /** Период из адреса для имени файла; нет — день выгрузки. */
  period: { readonly from: string; readonly to: string } | null;
} = $props();

const LIMIT = 10_000;
const PAGE = 200;

let open = $state(false);
let done = $state<number | null>(null);
let error = $state<string | null>(null);
let cancelled = false;

const pageOf = (offset: number): Promise<PeoplePage> =>
  api.get<PeoplePage>(
    `/analytics/people?${new URLSearchParams([
      ...search,
      ['offset', String(offset)],
      ['limit', String(PAGE)],
    ])}`
  );

// Страницы — по одной, пока не набрали всех или не отменили.
const collect = (people: PersonListed[]): Promise<PersonListed[] | null> =>
  cancelled
    ? Promise.resolve(null)
    : people.length >= Math.min(total, LIMIT)
      ? Promise.resolve(people.slice(0, LIMIT))
      : pageOf(people.length).then((page) =>
          page.people.length === 0
            ? people
            : ((next) => ((done = next.length), collect(next)))([
                ...people,
                ...page.people,
              ])
        );

const zone = (): Promise<string> =>
  can('site.edit')
    ? api.get<StatsSettings>('/stats/settings').then(
        (_) => _.timeZone,
        () => ''
      )
    : Promise.resolve('');

const rowsOf = (people: readonly PersonListed[], timeZone: string): CsvRow[] =>
  ((parts, currencies, milestones) => [
    [
      t('people.subject'),
      t('analytics.test'),
      t('people.state'),
      t('people.senders'),
      t('csv.arrived'),
      t('csv.firstLabel'),
      t('csv.firstAt'),
      t('people.acquisition'),
      ...parts.flatMap((part) => [
        t('csv.partCode', { part: partName(setup, part) }),
        partName(setup, part),
      ]),
      ...(milestones.length > 0 ? [t('people.milestones')] : []),
      t('people.payments'),
      t('csv.firstPaid'),
      t('csv.paidUntil'),
      ...currencies.map((currency) =>
        t('csv.inCurrency', { name: t('people.revenue'), currency })
      ),
      t('people.lastEvent'),
    ],
    ...people.map((person) => [
      person.subject,
      person.test ? t('analytics.testMark') : null,
      t(STATE_LABELS[person.state]),
      person.senders.join(', '),
      csvMoment(person.arrivedAt, timeZone),
      person.firstTouch?.label ?? null,
      csvMoment(person.firstTouch?.at, timeZone),
      acquisitionText(setup, person.acquisition),
      ...parts.flatMap((part) =>
        Object.hasOwn(person.firstParts, part)
          ? [
              person.firstParts[part]!,
              partValueName(setup, part, person.firstParts[part]!),
            ]
          : [null, null]
      ),
      ...(milestones.length > 0
        ? [
            milestones
              .filter((_) => person.milestones[_]?.state === 'reached')
              .map((_) => milestoneName(setup, _))
              .join(', ') || null,
          ]
        : []),
      person.payments,
      csvMoment(person.firstPaidAt, timeZone),
      csvMoment(person.paidUntil, timeZone),
      ...currencies.map((currency) =>
        csvMoney(person.revenue[currency], currency)
      ),
      csvMoment(person.lastAt, timeZone),
    ]),
  ])(
    [
      ...new Set(
        people.flatMap((_) =>
          Object.keys(_.firstParts).filter((part) => _.firstParts[part] !== '')
        )
      ),
    ].toSorted(),
    [...new Set(people.flatMap((_) => Object.keys(_.revenue)))].toSorted(),
    setup.milestones.filter((_) => _.archivedAt === null).map((_) => _.code)
  );

const start = () =>
  void ((cancelled = false),
  (error = null),
  (done = 0),
  Promise.all([collect([]), zone()])
    .then(({ 0: people, 1: timeZone }) =>
      people === null
        ? undefined
        : (saveCsv(
            period
              ? csvName('people', period.from, period.to)
              : `eile-people-${dayIn(Date.now(), timeZone)}.csv`,
            csvText(rowsOf(people, timeZone), currentLanguage())
          ),
          notify(t('csv.peopleSaved', { n: number(people.length) })),
          (open = false))
    )
    .then(
      () => void (done = null),
      (failure) => void ((error = describe(failure)), (done = null))
    ));

const cancel = () => void ((cancelled = true), (done = null), (open = false));
</script>

<button type="button" class="ghost csv" title={t('csv.buttonFor', { name: t('people.title') })} aria-label={t('csv.buttonFor', { name: t('people.title') })} onclick={() => (open = true)}>{@html icons.download}CSV</button>

<Modal open={open} title={t('csv.peopleTitle')} onclose={cancel}>
  {#if total > LIMIT}
    <p>{t('csv.peopleTooMany', { n: number(total), limit: number(LIMIT) })}</p>
  {:else}
    <p>{t('csv.peopleText', { n: number(total) })}</p>
    <p class="advice" role="note">{@html icons.alert}<span>{t('csv.peoplePrivacy')}</span></p>
    {#if done !== null}
      <div class="progress" role="status">
        <progress max={total} value={done}></progress>
        <span>{t('csv.peopleProgress', { n: number(done), total: number(total) })}</span>
      </div>
    {/if}
    {#if error}<p class="field-error" role="alert">{error}</p>{/if}
  {/if}
  {#snippet footer()}
    <button type="button" onclick={cancel}>{t('common.cancel')}</button>
    {#if total <= LIMIT}<button type="button" class="primary" aria-disabled={done !== null} onclick={() => done === null && start()}>{@html icons.download}{t('csv.peopleStart')}</button>{/if}
  {/snippet}
</Modal>

<style>
  .csv {
    min-height: 2rem;
    padding: 0 0.6rem;
    font-size: 0.8125rem;
  }

  .csv :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
  }

  p {
    margin: 0;
  }

  .advice {
    display: flex;
    gap: 0.5rem;
    align-items: start;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .advice :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-top: 0.15rem;
  }

  .progress {
    display: grid;
    gap: 0.35rem;
    font-size: 0.875rem;
  }

  progress {
    width: 100%;
  }
</style>
