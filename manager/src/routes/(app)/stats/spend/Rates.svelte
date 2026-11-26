<script lang="ts">
import { tick } from 'svelte';
import { dayIn, isMonth } from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { currencyName, inverseRate, parseRate, rateText } from '#lib/money.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type { ExchangeRate, RatesReport, RatesSaved } from '#lib/types.ts';
import { resolve } from '$app/paths';
import CsvButton from '../CsvButton.svelte';
import Mark from '../Mark.svelte';
import { monthName, monthTitle, ratesCsv } from './spend.ts';

// «Расходы → Курсы» (ADR 0072, «Экраны этапа 3»): по валюте сайта — месяцы, где у сайта есть суммы в ней, и
// чем они переводятся: свой курс месяца, «по курсу за июнь» или «нет курса». Курс вводится на месяц (запись с
// первого дня месяца) десятичной строкой — точка или запятая — и проверяется до отправки; рядом — обратный курс.
let {
  rates,
  editable,
  onchanged,
}: {
  rates: RatesReport;
  editable: boolean;
  /** Курс сохранён или удалён: экран перечитывает курсы. */
  onchanged: () => void;
} = $props();

const base = $derived(rates.baseCurrency);
const thisMonth = dayIn(Date.now(), '').slice(0, 7);

type Row = {
  readonly month: string;
  /** Свои записи курса в этом месяце. */
  readonly own: readonly ExchangeRate[];
  /** Чем переводятся суммы месяца; undefined — сумм в этом месяце нет. */
  readonly sums:
    | RatesReport['currencies'][number]['months'][number]
    | undefined;
};

// Месяцы валюты — с суммами и со своими записями, от новых к старым.
const rowsOf = (currency: RatesReport['currencies'][number]): Row[] =>
  [
    ...new Set([
      ...currency.months.map((_) => _.month),
      ...currency.rates.map((_) => _.day.slice(0, 7)),
    ]),
  ]
    .toSorted()
    .toReversed()
    .map((month) => ({
      month,
      own: currency.rates.filter((_) => _.day.startsWith(month)),
      sums: currency.months.find((_) => _.month === month),
    }));

// Правка: валюта и день записи; новый курс месяца — день его первого числа.
type Editing = {
  readonly currency: string;
  readonly day: string;
  readonly fresh: boolean;
};
let editing = $state<Editing | null>(null);
let value = $state('');
let freshMonth = $state<Record<string, string>>({});
let freshValue = $state<Record<string, string>>({});
let busy = $state(false);
let formError = $state<string | null>(null);
let element = $state<HTMLElement>();

const fieldErrors = defineFieldErrors((field) =>
  field === 'rate'
    ? value
    : field.startsWith('fresh:')
      ? [freshMonth[field.slice(6)], freshValue[field.slice(6)]]
      : null
);
const errors = $derived(fieldErrors.current);

const open = (currency: string, day: string, rate: string, fresh: boolean) =>
  void ((editing = { currency, day, fresh }),
  (value = rate === '' ? '' : rateText(rate, currentLanguage())),
  (formError = null),
  fieldErrors.clear(),
  tick().then(() =>
    element?.querySelector<HTMLInputElement>('.rate-input')?.focus()
  ));

const send = (currency: string, day: string, raw: string, field: string) =>
  ((rate) =>
    rate === null
      ? tick().then(() => fieldErrors.show({ [field]: t('rates.rateHint') }))
      : busy
        ? Promise.resolve()
        : ((busy = true),
          (formError = null),
          api
            .send<RatesSaved>('PUT', '/analytics/rates', {
              rates: [{ currency, day, rate }],
            })
            .then(
              () => (
                notify(t('rates.saved')),
                (editing = null),
                (freshValue = { ...freshValue, [currency]: '' }),
                (freshMonth = { ...freshMonth, [currency]: '' }),
                onchanged()
              ),
              (error) => void (formError = describe(error))
            )
            .finally(() => (busy = false))))(parseRate(raw));

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  editing && void send(editing.currency, editing.day, value, 'rate')
);

const saveFresh = (event: SubmitEvent, currency: string) => (
  event.preventDefault(),
  ((month) =>
    !isMonth(month) || month > thisMonth || month < '2000-01'
      ? void fieldErrors.show({ [`fresh:${currency}`]: t('rates.monthHint') })
      : void send(
          currency,
          `${month}-01`,
          freshValue[currency] ?? '',
          `fresh:${currency}`
        ))(freshMonth[currency] ?? '')
);

const remove = (rate: ExchangeRate) =>
  ask({
    title: t('rates.removeTitle', {
      currency: rate.currency,
      day: _date(rate.day),
    }),
    body: t('rates.removeBody'),
    confirm: t('rates.remove'),
    tone: 'danger',
  }).then(
    (yes) =>
      void (
        yes &&
        api
          .send('DELETE', `/analytics/rates/${rate.currency}/${rate.day}`)
          .then(() => (notify(t('rates.removed')), onchanged()), failed)
      )
  );

const keydown = (event: KeyboardEvent) =>
  void (event.key === 'Escape' && (event.preventDefault(), (editing = null)));

const _date = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(currentLanguage(), {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

// «1 PLN = 0,2310 €» и обратный «1 € = 4,33 PLN»: курс — как его ввели.
const pair = (currency: string, rate: string): string =>
  t('rates.pair', {
    currency,
    rate: rateText(rate, currentLanguage()),
    base: base ?? '',
  });
const inverse = (currency: string, rate: string): string =>
  t('rates.inverse', {
    currency,
    rate: inverseRate(rate, currentLanguage()),
    base: base ?? '',
  });

const typedInverse = (currency: string, raw: string): string =>
  ((rate) => (rate === null ? '' : inverse(currency, rate)))(parseRate(raw));

const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
const csvRows = () => ratesCsv(rates);
</script>

{#snippet rateForm(currency: string)}
  <!-- Esc — отмена: клавиша приходит от поля курса, сама форма фокуса не берёт. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form class="rate-form" novalidate onsubmit={save} onkeydown={keydown} bind:this={element}>
    <label>
      <span class="sr-only">{t('rates.rateFor', { currency })}</span>
      <span aria-hidden="true">{t('rates.one', { currency })}</span>
      <input class="rate-input" type="text" inputmode="decimal" autocomplete="off" bind:value aria-invalid={errors.rate ? 'true' : undefined} aria-describedby={errors.rate ? 'rate-error' : 'rate-hint'} />
      <span aria-hidden="true">{base}</span>
    </label>
    <button type="submit" class="primary" aria-disabled={busy}>{t('rates.save')}</button>
    <button type="button" onclick={() => (editing = null)}>{t('common.cancel')}</button>
    {#if errors.rate}<small id="rate-error" class="field-error">{errors.rate}</small>{:else}<small id="rate-hint" class="muted">{typedInverse(currency, value) || t('rates.rateHelp')}</small>{/if}
    {#if formError}<p class="field-error" role="alert">{formError}</p>{/if}
  </form>
{/snippet}

<div class="rates">
  {#if base === null}
    <div class="empty frame">
      <p><strong>{t('rates.noBaseTitle')}</strong></p>
      <p class="muted">{t('rates.noBase')}</p>
      {#if editable}<a class="button primary" href={settingsHref}>{t('sources.setBase')}</a>{/if}
    </div>
  {:else}
    <div class="head">
      <p class="base">{t('rates.base', { currency: base, name: currencyName(base, currentLanguage()) })} <a href={settingsHref}>{t('rates.changeBase')}</a></p>
      {#if rates.currencies.length > 0}<CsvButton name={csvName('rates', rates.currencies.flatMap((_) => _.months.map((m) => m.month)).toSorted()[0] ?? thisMonth, thisMonth)} rows={csvRows} label={t('rates.title')} />{/if}
    </div>
    <p class="help intro">{t('rates.intro')}</p>
    {#each rates.other as other (other.base)}
      <p class="muted other">{t('rates.other', { currency: other.base, n: number(other.count) })}</p>
    {/each}

    {#if rates.currencies.length === 0}
      <div class="empty frame"><p>{t('rates.noCurrencies', { currency: base })}</p></div>
    {/if}

    {#each rates.currencies as currency (currency.currency)}
      {@const rows = rowsOf(currency)}
      <section class="currency frame" aria-labelledby={`rates-${currency.currency}`}>
        <header>
          <h2 id={`rates-${currency.currency}`}>{currency.currency} <span class="muted">{currencyName(currency.currency, currentLanguage())}</span></h2>
          {#if currency.months.some((_) => _.day === null)}<Mark tone="warn">{t('rates.missingMark')}</Mark>{/if}
        </header>
        {#if rows.length > 0}
          <div class="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('rates.month')}</th>
                  <th scope="col">{t('rates.rate')}</th>
                  {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each rows as row (row.month)}
                  <tr class:missing={row.sums?.day === null} class:stale={row.sums?.stale}>
                    <th scope="row">{monthTitle(row.month)}</th>
                    <td>
                      {#each row.own as rate (rate.day)}
                        {#if editing?.currency === currency.currency && editing.day === rate.day}
                          {@render rateForm(currency.currency)}
                        {:else}
                          <div class="own">
                            <span class="pair">{pair(currency.currency, rate.rate)}</span>
                            <small class="muted">{inverse(currency.currency, rate.rate)}{rate.day.endsWith('-01') ? '' : ` · ${t('rates.since', { day: _date(rate.day) })}`}</small>
                            <small class="muted">{rate.author ? `${rate.author.name}, ` : ''}{moment(rate.updatedAt)}</small>
                          </div>
                        {/if}
                      {/each}
                      {#if row.sums === undefined}
                        <small class="muted">{t('rates.noSums')}</small>
                      {:else if row.sums.day === null}
                        <p class="state"><Mark tone="warn">{t('rates.none')}</Mark> <span>{t('rates.noneText')}</span></p>
                      {:else if row.sums.stale}
                        <p class="state"><Mark tone="accent">≈ {t('rates.staleMark', { month: monthName(row.sums.day.slice(0, 7)) })}</Mark> {#if row.sums.rate}<span>{pair(currency.currency, row.sums.rate)}</span>{/if}</p>
                      {/if}
                      {#if editing?.currency === currency.currency && editing.fresh && editing.day === `${row.month}-01`}
                        {@render rateForm(currency.currency)}
                      {/if}
                    </td>
                    {#if editable}
                      <td class="row-actions">
                        {#each row.own as rate (rate.day)}
                          <span class="pair-actions">
                            <button type="button" class="ghost icon" aria-label={t('rates.editNamed', { currency: currency.currency, day: _date(rate.day) })} title={t('setupList.edit')} onclick={() => open(currency.currency, rate.day, rate.rate, false)}>{@html icons.pencil}</button>
                            <button type="button" class="ghost icon danger" aria-label={t('rates.removeNamed', { currency: currency.currency, day: _date(rate.day) })} title={t('rates.remove')} onclick={() => remove(rate)}>{@html icons.trash}</button>
                          </span>
                        {/each}
                        {#if row.own.length === 0 && row.month <= thisMonth}
                          <button type="button" class="enter" onclick={() => open(currency.currency, `${row.month}-01`, '', true)}>{@html icons.plus}{t('rates.enter')}</button>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        {#if editable}
          <form class="fresh" novalidate onsubmit={(e) => saveFresh(e, currency.currency)} aria-label={t('rates.freshFor', { currency: currency.currency })}>
            <label><span>{t('rates.freshMonth')}</span><input type="month" min="2000-01" max={thisMonth} bind:value={freshMonth[currency.currency]} aria-invalid={errors[`fresh:${currency.currency}`] ? 'true' : undefined} /></label>
            <label><span>{t('rates.one', { currency: currency.currency })} … {base}</span><input type="text" inputmode="decimal" autocomplete="off" bind:value={freshValue[currency.currency]} aria-invalid={errors[`fresh:${currency.currency}`] ? 'true' : undefined} aria-describedby={`fresh-${currency.currency}-hint`} /></label>
            <button type="submit" aria-disabled={busy}>{t('rates.save')}</button>
            {#if errors[`fresh:${currency.currency}`]}<small id={`fresh-${currency.currency}-hint`} class="field-error">{errors[`fresh:${currency.currency}`]}</small>{:else}<small id={`fresh-${currency.currency}-hint`} class="muted">{typedInverse(currency.currency, freshValue[currency.currency] ?? '') || t('rates.freshHint')}</small>{/if}
          </form>
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .rates {
    display: grid;
    gap: 1rem;
    container-type: inline-size;
    min-width: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .base,
  .intro,
  .other {
    max-width: 52rem;
    margin: 0;
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

  .currency {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.9rem 1.1rem;
  }

  .currency header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: baseline;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  h2 .muted {
    margin-left: 0.35rem;
    font-size: 0.875rem;
    font-weight: 400;
  }

  .scroll {
    position: relative;
    overflow-x: auto;
  }

  table {
    width: 100%;
  }

  th,
  td {
    padding: 0.5rem 0.65rem;
    font-size: 0.875rem;
    vertical-align: top;
    text-align: left;
  }

  tbody th {
    width: 11rem;
    background: transparent;
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: normal;
    white-space: nowrap;
  }

  tbody tr:last-child > * {
    border-bottom: 0;
  }

  /* Нет курса — строка подсвечена, и отметка говорит это словами. */
  tr.missing > * {
    background: color-mix(in oklab, var(--surface), var(--warn-soft) 70%);
  }

  .own {
    display: grid;
    gap: 0.05rem;
  }

  .own + .own {
    margin-top: 0.4rem;
  }

  .pair {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .own small,
  td > small {
    display: block;
    font-size: 0.75rem;
  }

  .state {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    align-items: baseline;
    margin: 0.2rem 0 0;
    font-size: 0.8125rem;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .pair-actions {
    display: inline-flex;
  }

  .enter {
    min-height: 2rem;
    font-size: 0.8125rem;
  }

  .rate-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.5rem;
    align-items: center;
    margin: 0.25rem 0;
  }

  .rate-form label {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    white-space: nowrap;
  }

  .rate-input {
    width: 9rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .rate-form small {
    flex-basis: 100%;
    font-size: 0.75rem;
  }

  .rate-form p {
    flex-basis: 100%;
    margin: 0;
  }

  .fresh {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: flex-end;
    padding-top: 0.75rem;
    border-top: 0.0625rem dashed var(--line);
  }

  .fresh label {
    display: grid;
    gap: 0.25rem;
  }

  .fresh label > span {
    font-size: 0.8125rem;
  }

  .fresh input[type='text'] {
    width: 9rem;
    text-align: right;
  }

  .fresh small {
    flex-basis: 100%;
    font-size: 0.75rem;
  }

  /* Узкий экран: месяц над курсом, кнопки — под ним. */
  @container (width < 36rem) {
    table,
    tbody,
    tr,
    th,
    td {
      display: block;
      width: auto;
    }

    /* Карточками: шапка не нужна — месяц и курс говорят сами за себя. */
    thead {
      display: none;
    }

    tbody tr {
      padding: 0.4rem 0;
      border-bottom: 0.0625rem solid var(--line);
    }

    tbody th,
    td {
      padding: 0.15rem 0.5rem;
      border-bottom: 0;
    }

    .row-actions {
      text-align: left;
    }
  }
</style>
