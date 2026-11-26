<script lang="ts">
import { tick, untrack } from 'svelte';
import { addMonths, dayIn, isMonth } from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, type MessageKey, quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { amounts, amountText, CURRENCIES, money } from '#lib/money.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type {
  BaseSum,
  RatesReport,
  SetupView,
  SpendHint,
  SpendReport,
  SpendView,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import CsvButton from '../CsvButton.svelte';
import Mark from '../Mark.svelte';
import { partName, partValueName } from '../names.ts';
import { setQuery } from '../query.ts';
import SpendForm from './SpendForm.svelte';
import {
  draftOf,
  monthName,
  monthTitle,
  nextDraftKey,
  orderedParts,
  type SpendDraft,
  spendCsv,
  spendKeyOf,
  spendPartsText,
} from './spend.ts';

// «Расходы» (ADR 0072, «Экраны этапа 3»): месяцы периода от новых к старым — строки расхода (части названиями,
// сумма, она же в базовой валюте, заметка, кто и когда) и итог месяца; подсказки «ждёт расхода» — над месяцем.
// Правка — на месте, новые строки месяца — одной пачкой; «Скопировать прошлый месяц» даёт черновики его строк.
let {
  setup,
  rates,
  zone,
  editable,
}: {
  setup: SetupView;
  /** Курсы: базовая валюта и валюты сайта — первыми в выборе валюты. */
  rates: RatesReport;
  /** Пояс отчётов — для моментов в CSV. */
  zone: string;
  editable: boolean;
} = $props();

const query = $derived(page.url.searchParams);
// Нынешний месяц браузера: до первого ответа и для «12 месяцев»; ответ сервера — в поясе отчётов.
const browserMonth = dayIn(Date.now(), '').slice(0, 7);

type Range = 'months6' | 'months12' | 'all' | 'custom';
const range = $derived<Range>(
  query.get('all') === '1'
    ? 'all'
    : isMonth(query.get('from')) || isMonth(query.get('to'))
      ? 'custom'
      : query.get('months') === '12'
        ? 'months12'
        : 'months6'
);

const request = $derived(
  `/analytics/spend${
    range === 'all'
      ? '?all=1'
      : range === 'months12'
        ? `?from=${addMonths(browserMonth, -11)}`
        : range === 'custom'
          ? `?${new URLSearchParams(
              [
                ['from', query.get('from') ?? ''],
                ['to', query.get('to') ?? ''],
              ].filter((_) => isMonth(_[1]))
            )}`
          : ''
  }`
);

let report = $state<SpendReport | null>(null);
let busy = $state(false);

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<SpendReport>(wanted)
      .then((_) => void (wanted === request && (report = _)))
      .finally(() => (busy = false))
  ))(request)
);
$effect(() => void ((_: string) => untrack(() => loading.retry()))(request));

// Свои месяцы: поля открыты, пока выбраны свои месяцы или человек их открыл.
let customOpen = $state(false);
let fromMonth = $state('');
let toMonth = $state('');
const custom = $derived(range === 'custom' || customOpen);

$effect(() => {
  const next = report;
  void (
    next &&
    range === 'custom' &&
    ((fromMonth = next.from), (toMonth = next.to))
  );
});

const openCustom = () =>
  void ((customOpen = true),
  range !== 'custom' &&
    ((fromMonth = report?.from ?? addMonths(browserMonth, -5)),
    (toMonth = report?.to ?? browserMonth)));

const _RANGES: Readonly<Record<Exclude<Range, 'custom'>, () => void>> = {
  months6: () =>
    void setQuery({ months: null, all: null, from: null, to: null }),
  months12: () =>
    void setQuery({ months: '12', all: null, from: null, to: null }),
  all: () => void setQuery({ months: null, all: '1', from: null, to: null }),
};

const choose = (next: Range) =>
  next === 'custom'
    ? openCustom()
    : void ((customOpen = false), _RANGES[next]());

const applyCustom = (event: SubmitEvent) => (
  event.preventDefault(),
  void (
    isMonth(fromMonth) &&
    isMonth(toMonth) &&
    (({ 0: from, 1: to }) =>
      setQuery({ months: null, all: null, from: from!, to: to! }))(
      [fromMonth, toMonth].toSorted()
    )
  )
);

const base = $derived(report?.baseCurrency ?? rates.baseCurrency);
// Валюты сайта — первыми в выборе: базовая, затем валюты денег, расходов и курсов.
const currencies = $derived({
  site: [
    ...new Set([
      ...(base === null ? [] : [base]),
      ...rates.currencies.map((_) => _.currency),
      ...(report?.months.flatMap((_) => _.rows.map((row) => row.currency)) ??
        []),
    ]),
  ],
  all: CURRENCIES,
});
const defaultCurrency = $derived(currencies.site[0] ?? '');

const months = $derived((report?.months ?? []).toReversed());
const hintsOf = (month: string): SpendHint[] =>
  report?.hints.filter((_) => _.month === month) ?? [];
const anyRows = $derived(months.some((_) => _.rows.length > 0));
const noParts = $derived(
  !setup.dictionaries.some((_) => _.purpose === 'parts')
);

// Черновики новых строк по месяцам и правка на месте — одна строка за раз.
let drafts = $state<Record<string, SpendDraft[]>>({});
let editing = $state<SpendDraft[]>([]);
const editingId = $derived(editing[0]?.id ?? null);

const emptyDraft = (
  month: string,
  parts: Record<string, string> = {}
): SpendDraft => ({
  key: nextDraftKey(),
  id: null,
  month,
  parts,
  currency: defaultCurrency,
  amount: '',
  note: '',
});

const addDraft = (month: string, parts: Record<string, string> = {}) =>
  void (drafts = {
    ...drafts,
    [month]: [...(drafts[month] ?? []), emptyDraft(month, parts)],
  });

const dropDrafts = (month: string) =>
  void (drafts = Object.fromEntries(
    Object.entries(drafts).filter(({ 0: key }) => key !== month)
  ));

const rowsOf = (month: string): SpendView[] =>
  report?.months.find((_) => _.month === month)?.rows ?? [];

// Строки прошлого месяца: он в периоде — из ответа, иначе — отдельным запросом за один месяц.
const previousRows = (month: string): Promise<SpendView[]> =>
  ((previous) =>
    report?.months.some((_) => _.month === previous)
      ? Promise.resolve(rowsOf(previous))
      : api
          .get<SpendReport>(`/analytics/spend?from=${previous}&to=${previous}`)
          .then((_) => _.months.flatMap((m) => m.rows)))(addMonths(month, -1));

// Ключи строк месяца — сохранённых и черновиков: копия их не повторяет.
const keysOf = (month: string): Set<string> =>
  new Set([
    ...rowsOf(month).map((_) => spendKeyOf(month, _.parts, _.currency)),
    ...(drafts[month] ?? []).map((_) => spendKeyOf(month, _.parts, _.currency)),
  ]);

// Копия прошлого месяца: строки, которых в месяце ещё нет; значение в архиве или удалённое новой строке не взять.
const copyPrevious = (month: string) =>
  previousRows(month).then(
    (rows) =>
      ((fresh) =>
        ((copied) =>
          rows.length === 0
            ? notify(
                t('spend.copyNone', { month: monthName(addMonths(month, -1)) })
              )
            : fresh.length === 0
              ? notify(t('spend.copyDone'))
              : void (copied.length > 0 &&
                  (drafts = {
                    ...drafts,
                    [month]: [...(drafts[month] ?? []), ...copied],
                  }),
                copied.length < fresh.length &&
                  notify(
                    tn('spend.copySkipped', fresh.length - copied.length)
                  )))(
          fresh
            .filter((_) =>
              Object.values(_.states).every((state) => state === 'known')
            )
            .map((_) =>
              draftOf(
                _,
                amountText(_.amount, _.currency, currentLanguage()),
                month
              )
            )
        ))(
        rows.filter(
          (_) => !keysOf(month).has(spendKeyOf(month, _.parts, _.currency))
        )
      ),
    failed
  );

const edit = (row: SpendView) =>
  void (editing = [
    draftOf(row, amountText(row.amount, row.currency, currentLanguage())),
  ]);

// Правку закрыли — фокус обратно на карандаш этой строки, а не в начало страницы.
const closeEdit = () =>
  ((id) =>
    void ((editing = []),
    tick().then(() =>
      document
        .querySelector<HTMLElement>(`main button[data-edit="${id}"]`)
        ?.focus()
    )))(editingId);

const saved = (month: string | null) =>
  void (month === null ? closeEdit() : dropDrafts(month), loading.retry());

const remove = (row: SpendView) =>
  ask({
    title: t('spend.removeTitle'),
    body: t('spend.removeBody', {
      parts: spendPartsText(setup, row.parts),
      amount: money(row.amount, row.currency, currentLanguage()),
      month: monthName(row.month),
    }),
    confirm: t('spend.remove'),
    tone: 'danger',
  }).then(
    (yes) =>
      void (
        yes &&
        api
          .send('DELETE', `/analytics/spend/${row.id}`)
          .then(() => (notify(t('spend.removed')), loading.retry()), failed)
      )
  );

const baseText = (sum: Pick<BaseSum, 'value'>): string =>
  base === null ? '' : money(sum.value, base, currentLanguage());

const ratesHref = `${resolve('/(app)/stats/spend')}?tab=rates`;
const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
const dictionariesHref = `${resolve('/(app)/stats/setup')}?tab=dictionaries`;

const csvRows = () => (report ? spendCsv(report, setup, zone) : []);

const _RANGE_LABELS: Readonly<Record<Range, MessageKey>> = {
  months6: 'spend.months6',
  months12: 'report.months12',
  all: 'report.allTime',
  custom: 'spend.customMonths',
};
const _RANGES_ORDER: readonly Range[] = [
  'months6',
  'months12',
  'all',
  'custom',
];
</script>

{#snippet sum(total: BaseSum)}
  <span class="total-value">{#if total.staleRate}<span class="approx" title={t('sources.staleHint')}>≈<span class="sr-only">{t('sources.staleShort')}</span></span>{/if}{baseText(total)}</span>
  {#if Object.keys(total.unpriced).length > 0}<a class="warn" href={ratesHref}>{t('sources.unpriced', { amounts: amounts(total.unpriced, currentLanguage()).join(', ') })}</a>{/if}
{/snippet}

{#snippet partsCell(row: SpendView)}
  {#if Object.keys(row.parts).length === 0}
    <span class="whole">{t('spend.wholeSite')}</span>
  {:else}
    <ul class="parts">
      {#each orderedParts(setup, row.parts) as part (part)}
        <li>
          <span class="part">{partName(setup, part)}:</span>
          {#if row.states[part] === 'unknown'}
            <code>{row.parts[part]}</code> <Mark tone="warn">{t('spend.notInDictionary')}</Mark>
          {:else}
            <span>{partValueName(setup, part, row.parts[part]!)}</span>
            {#if row.states[part] === 'archived'}<Mark>{t('setupList.inArchive')}</Mark>{/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<div class="spend">
  <div class="controls">
    <div class="segments range-buttons" role="group" aria-label={t('spend.period')}>
      {#each _RANGES_ORDER as item (item)}
        <button type="button" aria-pressed={item === 'custom' ? custom : !custom && range === item} onclick={() => choose(item)}>{t(_RANGE_LABELS[item])}</button>
      {/each}
    </div>
    <label class="range-select">
      <span>{t('spend.period')}</span>
      <select value={custom ? 'custom' : range} onchange={(e) => choose(e.currentTarget.value as Range)}>
        {#each _RANGES_ORDER as item (item)}<option value={item}>{t(_RANGE_LABELS[item])}</option>{/each}
      </select>
    </label>
    {#if report && anyRows}<CsvButton name={csvName('spend', report.from, report.to)} rows={csvRows} label={t('spend.title')} />{/if}
  </div>

  {#if custom}
    <form class="months" novalidate onsubmit={applyCustom} aria-label={t('spend.customMonths')}>
      <label><span>{t('spend.fromMonth')}</span><input type="month" bind:value={fromMonth} min="2000-01" max={report?.to ?? browserMonth} /></label>
      <label><span>{t('spend.toMonth')}</span><input type="month" bind:value={toMonth} min="2000-01" max={report?.to ?? browserMonth} /></label>
      <button class="button">{t('stats.show')}</button>
    </form>
  {/if}

  <p class="help intro">{t('spend.intro')}</p>

  {#if base === null}
    <p class="notice">
      <span>{t('spend.noBase')}</span>
      {#if editable}<a href={settingsHref}>{t('sources.setBase')}</a>{/if}
    </p>
  {/if}
  {#if noParts}
    <p class="notice plain">
      <span>{t('spend.noParts')}</span>
      {#if editable}<a href={dictionariesHref}>{t('spend.toDictionaries')}</a>{/if}
    </p>
  {/if}

  <LoadState load={loading}>
    {#if report}
      <div class="report" class:busy>
        {#if !anyRows && report.hints.length === 0}
          <div class="empty frame">
            <p><strong>{t('spend.emptyTitle')}</strong></p>
            <p class="muted">{t('spend.emptyText')}</p>
            {#if editable && months[0]}
              <button type="button" class="primary" onclick={() => addDraft(months[0]!.month)}>{@html icons.plus}{t('spend.addFor', { month: monthName(months[0]!.month) })}</button>
            {/if}
          </div>
        {/if}

        {#each months as month (month.month)}
          {@const hints = hintsOf(month.month)}
          {@const monthDrafts = drafts[month.month] ?? []}
          <section class="month frame" class:quiet={month.rows.length === 0 && hints.length === 0 && monthDrafts.length === 0} aria-labelledby={`month-${month.month}`}>
            <header>
              <div class="title">
                <h2 id={`month-${month.month}`}>{monthTitle(month.month)}</h2>
                {#if month.total}
                  <p class="total"><span class="muted">{t('spend.total')}</span> {@render sum(month.total)}</p>
                {:else if month.rows.length === 0}
                  <p class="total muted">{t('spend.noRows')}</p>
                {/if}
              </div>
              {#if editable}
                <div class="actions">
                  <button type="button" class="ghost" onclick={() => addDraft(month.month)}>{@html icons.plus}{t('spend.add')}</button>
                  <button type="button" class="ghost" onclick={() => copyPrevious(month.month)}>{@html icons.copy}{t('spend.copyPrevious')}</button>
                </div>
              {/if}
            </header>

            {#each hints as hint (`${hint.part}/${hint.value}`)}
              <p class="hint" role="note">
                {@html icons.alert}
                <span>{tn('spend.hint', hint.people, { month: monthName(hint.month), name: quoted(hint.name) })}</span>
                {#if editable}<button type="button" class="link" onclick={() => addDraft(month.month, { [hint.part]: hint.value })}>{t('spend.addHint')}</button>{/if}
              </p>
            {/each}

            {#if month.rows.length > 0}
              <div class="scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" class="col-source">{t('spend.source')}</th>
                      <th scope="col" class="num col-amount">{t('spend.amount')}</th>
                      {#if base !== null}<th scope="col" class="num col-base">{t('spend.inBase', { currency: base })}</th>{/if}
                      <th scope="col">{t('spend.note')}</th>
                      <th scope="col" class="col-author">{t('spend.author')}</th>
                      {#if editable}<th scope="col" class="col-actions"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
                    </tr>
                  </thead>
                  <tbody>
                    {#each month.rows as row (row.id)}
                      {#if editingId === row.id}
                        <tr class="editing">
                          <td colspan={base !== null ? (editable ? 6 : 5) : editable ? 5 : 4}>
                            <SpendForm bind:drafts={editing} {setup} {currencies} existing={month.rows} mode="edit" onsaved={() => saved(null)} oncancel={closeEdit} />
                          </td>
                        </tr>
                      {:else}
                        <tr>
                          <td data-label={t('spend.source')} class="parts-cell">{@render partsCell(row)}</td>
                          <td data-label={t('spend.amount')} class="num">{money(row.amount, row.currency, currentLanguage())}</td>
                          {#if base !== null}
                            <td data-label={t('spend.inBase', { currency: base })} class="num">
                              {#if row.base === null}
                                <a class="warn" href={ratesHref}>{t('spend.noRate')}</a>
                              {:else if row.currency === base}
                                <span class="muted">{baseText({ value: row.base })}</span>
                              {:else}
                                {#if row.staleRate}<span class="approx" title={t('sources.staleHint')}>≈<span class="sr-only">{t('sources.staleShort')}</span></span>{/if}{baseText({ value: row.base })}
                              {/if}
                            </td>
                          {/if}
                          <td data-label={t('spend.note')} class="note-cell">{#if row.note}{row.note}{:else}<span class="muted">—</span>{/if}</td>
                          <td data-label={t('spend.author')} class="author">
                            {#if row.author}<span>{row.author.name}</span>{#if row.author.agent}{' '}<Mark tone="accent">{t('setupLog.agent')}</Mark>{/if}{:else}<span class="muted">{t('setupLog.nobody')}</span>{/if}
                            <small class="muted">{moment(row.updatedAt)}</small>
                          </td>
                          {#if editable}
                            <td class="row-actions">
                              <button type="button" class="ghost icon" data-edit={row.id} aria-label={t('spend.editNamed', { name: spendPartsText(setup, row.parts) })} title={t('setupList.edit')} onclick={() => edit(row)}>{@html icons.pencil}</button>
                              <button type="button" class="ghost icon danger" aria-label={t('spend.removeNamed', { name: spendPartsText(setup, row.parts) })} title={t('spend.remove')} onclick={() => remove(row)}>{@html icons.trash}</button>
                            </td>
                          {/if}
                        </tr>
                      {/if}
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}

            {#if monthDrafts.length > 0}
              <SpendForm bind:drafts={drafts[month.month]!} {setup} {currencies} existing={month.rows} mode="new" onsaved={() => saved(month.month)} oncancel={() => dropDrafts(month.month)} />
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </LoadState>
</div>

<style>
  .spend {
    display: grid;
    gap: 1rem;
    container-type: inline-size;
    min-width: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: flex-end;
  }

  .controls :global(.csv) {
    margin-left: auto;
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

  .range-select {
    display: none;
  }

  .range-select,
  .months label {
    gap: 0.25rem;
  }

  .range-select > span,
  .months label > span {
    font-size: 0.8125rem;
  }

  .months {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: flex-end;
  }

  .months label {
    display: grid;
  }

  .intro {
    max-width: 52rem;
    margin: 0;
  }

  .notice {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    align-items: center;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .notice.plain {
    border-color: var(--line);
    background: var(--sunken);
  }

  .report {
    display: grid;
    gap: 1rem;
    min-width: 0;
    transition: opacity 150ms var(--ease);
  }

  .report.busy {
    opacity: 0.6;
  }

  .empty {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    padding: 1.1rem 1.25rem;
  }

  .empty p {
    max-width: 44rem;
    margin: 0;
  }

  .month {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.9rem 1.1rem;
  }

  .month header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: baseline;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .total {
    margin: 0;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .total-value {
    font-weight: 650;
  }

  .total .warn {
    margin-left: 0.5rem;
    font-size: 0.8125rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .actions button {
    min-height: 2rem;
    font-size: 0.8125rem;
  }

  .hint {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    align-items: center;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .hint :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    color: var(--warn-text);
  }

  .scroll {
    position: relative;
    overflow-x: auto;
  }

  /* Столбцы одной ширины во всех месяцах: таблицы месяцев идут одна под другой и читаются как одна. */
  table {
    width: 100%;
    table-layout: fixed;
  }

  .col-source {
    width: 28%;
  }

  .col-amount,
  .col-base {
    width: 8.5rem;
  }

  .col-author {
    width: 11rem;
  }

  .col-actions {
    width: 5.5rem;
  }

  th,
  td {
    padding: 0.5rem 0.65rem;
    overflow-wrap: break-word;
    font-size: 0.875rem;
    vertical-align: top;
    text-align: left;
  }

  thead th {
    font-size: 0.8125rem;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .parts-cell {
    min-width: 0;
  }

  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .parts li {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.3rem;
    align-items: baseline;
  }

  .part {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .whole {
    font-style: italic;
  }

  .note-cell {
    color: var(--muted);
  }


  .author small {
    display: block;
    font-size: 0.75rem;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
  }

  .editing td {
    padding: 0.4rem 0;
  }

  .approx {
    margin-right: 0.2rem;
    color: var(--warn-text);
    font-weight: 700;
    cursor: help;
  }

  .warn {
    color: var(--warn-text);
  }

  /* Месяц без строк, подсказок и черновиков — одной строкой: пустые месяцы не растягивают экран. */
  .month.quiet {
    padding-block: 0.6rem;
  }

  /* Узкий экран: период — выпадающим списком, строки расхода — карточками с подписями полей. */
  @container (width < 48rem) {
    .range-buttons {
      display: none;
    }

    .range-select {
      display: grid;
      flex: 1 1 12rem;
    }

    .range-select select {
      width: 100%;
    }

    /* Карточками: подписи полей — у ячеек (data-label), шапка не нужна. */
    thead {
      display: none;
    }

    table,
    tbody,
    tr,
    td {
      display: block;
      width: auto;
      table-layout: auto;
    }

    tbody tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
      gap: 0.25rem 0.75rem;
      padding: 0.6rem 0;
      border-bottom: 0.0625rem solid var(--line);
    }

    tbody tr:last-child {
      border-bottom: 0;
    }

    td {
      grid-column: 1 / -1;
      padding: 0;
      border-bottom: 0;
      text-align: left;
    }

    td[data-label]::before {
      content: attr(data-label);
      display: block;
      color: var(--muted);
      font-size: 0.75rem;
    }

    td.parts-cell::before {
      display: none;
    }

    td.parts-cell {
      grid-column: 1 / 3;
      min-width: 0;
    }

    td.row-actions {
      grid-row: 1;
      grid-column: 3;
      width: auto;
    }

    /* Сумма и она же в базовой валюте — рядом. */
    td.num {
      grid-column: auto;
    }

    .num {
      text-align: left;
    }

    .note-cell {
      max-width: none;
    }

    .editing {
      display: block;
    }
  }
</style>
