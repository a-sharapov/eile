<script lang="ts">
import { shareRate } from '#lib/analytics-reports.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { amounts, money } from '#lib/money.ts';
import type {
  BaseSum,
  Ltv,
  ReturnRow,
  Share,
  SourcesColumn,
  SourcesRow,
} from '#lib/types.ts';
import Change from '../Change.svelte';
import { changeOf, columnKey } from './columns.ts';

// Ячейки строки «Источников» по столбцам, которые есть у сайта: доля — «40 %» и под ней «2 из 5», люди «ещё в
// окне» — «+3 в окне», выручка — одной цифрой в базовой валюте и под ней по валютам, LTV — «2 из 4, +2 живут
// срок». Мало данных — приглушено цветом (подпись — в первой ячейке). У итога при сравнении — изменение под
// каждым числом, у строки «было» — числа прошлого периода без ссылок.
let {
  row,
  columns,
  base = null,
  before = null,
  compared = '',
  was = false,
  ratesHref = '',
  spendHref = '',
  customersHref = '',
}: {
  row: SourcesRow | ReturnRow;
  columns: readonly SourcesColumn[];
  /** Базовая валюта отчёта; null — денег одной цифрой нет. */
  base?: string | null;
  /** Итог прошлого периода: под числами итога — изменение. */
  before?: SourcesRow | ReturnRow | null;
  /** С чем сравнили — подсказка изменения. */
  compared?: string;
  /** Строка «было»: числа прошлого периода. */
  was?: boolean;
  ratesHref?: string;
  spendHref?: string;
  /** Новые клиенты — ссылкой на «Людей» с `by=payment`; пусто — без ссылки. */
  customersHref?: string;
} = $props();

const _percent = (rate: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    style: 'percent',
    maximumFractionDigits: rate > 0 && rate < 0.1 ? 1 : 0,
  }).format(rate);

const first = $derived('people' in row ? row : null);
const back = $derived('returned' in row ? row : null);

// Доли от людей приглушены при малом числе людей, оплат на клиента, продление, CAC, LTV / CAC и окупаемость — при
// малом числе клиентов; мало и тех и других — строка приглушена целиком.
const all = $derived(row.lowData.people && row.lowData.customers);
const dimPeople = $derived(row.lowData.people);
const dimCustomers = $derived(row.lowData.customers);

const perCustomer = $derived(
  first?.perCustomer && first.perCustomer.customers > 0
    ? new Intl.NumberFormat(currentLanguage(), {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(first.perCustomer.payments / first.perCustomer.customers)
    : null
);

const ratio = (value: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const inBase = (minor: number): string =>
  base === null ? '' : money(minor, base, currentLanguage());

// Суммы без курса — «и 20,00 CHF без курса»: в цифру базовой валюты они не вошли.
const unpricedText = (sum: BaseSum): string =>
  ((lines) =>
    lines.length === 0
      ? ''
      : t('sources.unpriced', { amounts: lines.join(', ') }))(
    amounts(sum.unpriced, currentLanguage())
  );

// Выручка по валютам под цифрой базовой валюты: базовая — первой, затем по алфавиту; валюта, целиком без курса, —
// «20,00 CHF без курса», а если без курса только часть — она отдельной строкой ниже.
const currencyLines = (
  byCurrency: Readonly<Record<string, number>>,
  sum: BaseSum
): { currency: string; text: string; unpriced: boolean }[] =>
  Object.keys(byCurrency)
    .toSorted(
      (a, b) => Number(b === base) - Number(a === base) || (a < b ? -1 : 1)
    )
    .map((currency) =>
      ((text) =>
        sum.unpriced[currency] === byCurrency[currency]
          ? {
              currency,
              text: t('sources.unpricedLine', { amount: text }),
              unpriced: true,
            }
          : { currency, text, unpriced: false })(
        money(byCurrency[currency]!, currency, currentLanguage())
      )
    );

// Часть суммы валюты без курса — то, что не названо строкой «… без курса».
const partlyUnpriced = (
  byCurrency: Readonly<Record<string, number>>,
  sum: BaseSum
): BaseSum => ({
  ...sum,
  unpriced: Object.fromEntries(
    Object.entries(sum.unpriced).filter(
      ({ 0: currency, 1: value }) => byCurrency[currency] !== value
    )
  ),
});

const changeFor = (column: SourcesColumn) =>
  before === null ? null : changeOf(column, row, before);
</script>

{#snippet delta(column: SourcesColumn)}
  {@const found = changeFor(column)}
  {#if found}<Change change={found.change} lowerBetter={found.lowerBetter} neutral={found.neutral} title={compared} />{/if}
{/snippet}

{#snippet approx(sum: BaseSum | null | undefined)}
  {#if sum?.staleRate}<span class="approx" title={t('sources.staleHint')}>≈<span class="sr-only">{t('sources.staleShort')}</span></span>{/if}
{/snippet}

{#snippet unpriced(sum: BaseSum | null | undefined)}
  {#if sum && Object.keys(sum.unpriced).length > 0}
    {#if was || ratesHref === ''}<small class="note warn">{unpricedText(sum)}</small>{:else}<small class="note"><a class="warn" href={ratesHref} title={t('sources.unpricedHint')}>{unpricedText(sum)}</a></small>{/if}
  {/if}
{/snippet}

{#snippet share(column: SourcesColumn, value: Share | null | undefined, dim: boolean)}
  <td class="num share" class:dim>
    {#if value}
      {@const rate = shareRate(value)}
      <span class="rate">{rate === null ? '—' : _percent(rate)}</span>
      {#if value.base > 0}<small class="of">{t('report.ofBase', { count: number(value.count), base: number(value.base) })}</small>{/if}
      {#if value.open > 0}<small class="open">{t('report.inWindow', { n: number(value.open) })}</small>{/if}
    {:else}
      <span class="muted">—</span>
    {/if}
    {@render delta(column)}
  </td>
{/snippet}

{#snippet revenue(column: SourcesColumn, byCurrency: Readonly<Record<string, number>> | null, sum: BaseSum | null)}
  <td class="num money" class:dim={all}>
    {#if byCurrency === null || Object.keys(byCurrency).length === 0}
      <span class="muted">—</span>
    {:else if base !== null && sum !== null}
      <span class="main">{@render approx(sum)}{inBase(sum.value)}</span>
      {#if Object.keys(byCurrency).some((_) => _ !== base)}
        {#each currencyLines(byCurrency, sum) as line (line.currency)}
          {#if line.unpriced && !was && ratesHref !== ''}<small class="line"><a class="warn" href={ratesHref} title={t('sources.unpricedHint')}>{line.text}</a></small>{:else}<small class="line" class:warn={line.unpriced}>{line.text}</small>{/if}
        {/each}
      {/if}
      {@render unpriced(partlyUnpriced(byCurrency, sum))}
    {:else}
      {#each amounts(byCurrency, currentLanguage()) as line (line)}<span class="main">{line}</span>{/each}
    {/if}
    {@render delta(column)}
  </td>
{/snippet}

{#snippet ltv(column: SourcesColumn, value: Ltv | null | undefined)}
  <td class="num money" class:dim={all || value?.low}>
    {#if value}
      {#if value.value === null}<span class="muted">—</span>{:else}<span class="main">{@render approx(value.revenue)}{inBase(value.value)}</span>{/if}
      {#if value.open > 0}
        <small class="of">{t('report.ofBase', { count: number(value.base), base: number(value.base + value.open) })}</small>
        <small class="open">{tn('sources.livingTerm', value.open)}</small>
      {/if}
      {@render unpriced(value.revenue)}
    {:else}
      <span class="muted">—</span>
    {/if}
    {@render delta(column)}
  </td>
{/snippet}

{#snippet plainMoney(column: SourcesColumn, value: number | null | undefined, dim: boolean, empty: string)}
  <td class="num money" class:dim>
    {#if value === null || value === undefined}<span class="muted">{empty}</span>{:else}<span class="main">{inBase(value)}</span>{/if}
    {@render delta(column)}
  </td>
{/snippet}

{#each columns as column (columnKey(column))}
  {#if column.kind === 'people'}
    <td class="num strong" class:dim={all}>{number(first?.people ?? 0)}{@render delta(column)}</td>
  {:else if column.kind === 'milestone'}
    {@render share(column, first?.milestones[column.code], dimPeople)}
  {:else if column.kind === 'trial'}
    {@render share(column, first?.trial, dimPeople)}
  {:else if column.kind === 'payment'}
    {@render share(column, first?.payment, dimPeople)}
  {:else if column.kind === 'customers'}
    <td class="num" class:dim={all}>
      {#if first?.customers === null || first?.customers === undefined}—{:else if customersHref !== '' && !was && first.customers > 0}<a href={customersHref} title={t('sources.customersLink')}>{number(first.customers)}</a>{:else}{number(first.customers)}{/if}
      {@render delta(column)}
    </td>
  {:else if column.kind === 'revenue'}
    {@render revenue(column, first ? first.revenue : (back?.revenue ?? null), first ? first.revenueBase : (back?.revenueBase ?? null))}
  {:else if column.kind === 'perCustomer'}
    <td class="num" class:dim={dimCustomers}>{#if perCustomer === null}<span class="muted">—</span>{:else}{perCustomer}{/if}{@render delta(column)}</td>
  {:else if column.kind === 'renewal'}
    {@render share(column, first?.renewal, dimCustomers)}
  {:else if column.kind === 'ltvCustomer'}
    {@render ltv(column, first?.ltvCustomer)}
  {:else if column.kind === 'ltvPerson'}
    {@render ltv(column, first?.ltvPerson)}
  {:else if column.kind === 'spend'}
    <td class="num money" class:dim={all}>
      {#if first?.spend}
        <span class="main">{@render approx(first.spend)}{inBase(first.spend.value)}</span>
        {@render unpriced(first.spend)}
      {:else if first?.spendMissing}
        {#if was || spendHref === ''}<span class="missing">{t('sources.spendMissing')}</span>{:else}<a class="missing" href={spendHref} title={t('sources.spendMissingHint')}>{t('sources.spendMissing')}</a>{/if}
      {:else}
        <span class="muted">—</span>
      {/if}
      {@render delta(column)}
    </td>
  {:else if column.kind === 'cac'}
    {@render plainMoney(column, first?.cac, dimCustomers, first?.spend && first.customers === 0 ? t('sources.noCustomers') : '—')}
  {:else if column.kind === 'costPerPerson'}
    {@render plainMoney(column, first?.costPerPerson, dimPeople, '—')}
  {:else if column.kind === 'ltvCac'}
    <td class="num" class:dim={dimCustomers}>
      {#if first?.ltvCac !== null && first?.ltvCac !== undefined}<span class="main">{ratio(first.ltvCac)}</span>{:else if first?.cac === 0}<span>{t('sources.free')}</span>{:else}<span class="muted">—</span>{/if}
      {@render delta(column)}
    </td>
  {:else if column.kind === 'payback'}
    <td class="num payback" class:dim={dimCustomers}>
      {#if first?.payback}
        <span class="main">{first.payback.months === 0 ? t('sources.paybackNow') : first.payback.months === null ? first.payback.lived === 0 ? t('sources.paybackEarly') : tn('sources.paybackNot', first.payback.lived) : tn('sources.paybackMonths', first.payback.months)}</span>
      {:else}
        <span class="muted">—</span>
      {/if}
      {@render delta(column)}
    </td>
  {:else if column.kind === 'returned'}
    <td class="num strong" class:dim={all}>{number(back?.returned ?? 0)}{@render delta(column)}</td>
  {:else if column.kind === 'payments'}
    <td class="num" class:dim={all}>{number(back?.payments ?? 0)}{@render delta(column)}</td>
  {:else}
    <td class="num"><span class="muted">—</span></td>
  {/if}
{/each}

<style>
  td {
    padding: 0.55rem 0.6rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .strong {
    font-weight: 600;
  }

  .share .rate {
    display: block;
    font-weight: 600;
  }

  td small {
    display: block;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .open {
    color: color-mix(in oklch, var(--accent) 70%, var(--text));
  }

  .money .main,
  .money .line {
    display: block;
  }

  /* Заметки под цифрой переносятся по словам: «и 20,00 CHF без курса» не раздувает столбец; числа «4 716 из 10 051»
     и «+5 335 живут срок» — одной строкой. */
  .money .note,
  .money .line,
  .money .missing,
  .payback .main {
    max-width: 9.5rem;
    margin-left: auto;
    white-space: normal;
    overflow-wrap: break-word;
  }

  .approx {
    margin-right: 0.2rem;
    color: var(--warn-text);
    font-weight: 700;
    cursor: help;
  }

  .note.warn,
  .note .warn,
  .line.warn,
  .line .warn,
  .missing {
    color: var(--warn-text);
  }

  .missing {
    display: block;
    font-size: 0.8125rem;
  }

  .payback .main {
    display: block;
    max-width: 8.5rem;
  }

  /* Мало данных: числа приглушены цветом текста, а не прозрачностью — фон ячейки остаётся фоном строки (в тёмной
     теме прозрачная ячейка темнела пятном); словами это сказано в первой ячейке строки. */
  .dim,
  .dim .open {
    color: var(--muted);
  }

  .dim .rate {
    font-weight: 500;
  }
</style>
