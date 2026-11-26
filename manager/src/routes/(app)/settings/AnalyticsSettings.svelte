<script lang="ts">
import { PRIVACY_SAMPLES } from '#lib/analytics-privacy.ts';
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { CURRENCIES, currencyName } from '#lib/money.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type { AnalyticsSettings, RatesReport, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';

// Приём событий и срок хранения истории — правовые выключатели сайта, рядом со счётом посещений (ADR 0072).
// Включить приём — решение человека: о сборе истории говорит политика сайта, образец абзаца — ниже. Есть у сайта
// переход (и в архиве — он работает) — образец говорит, что переход уносит источник посещения в ссылке.
// Базовая валюта отчётов — своей формой: её смена гасит курсы к прежней, экран говорит это до смены.
let saved = $state<AnalyticsSettings | null>(null);
let draft = $state<AnalyticsSettings>({
  enabled: false,
  retentionMonths: 0,
  baseCurrency: null,
});
let links = $state(false);
let busy = $state(false);
let rates = $state<RatesReport | null>(null);
let currency = $state('');
let currencyBusy = $state(false);

const loading = defineLoad(() =>
  Promise.all([
    api.get<AnalyticsSettings>('/analytics/settings'),
    api.get<SetupView>('/analytics/setup'),
    api.get<RatesReport>('/analytics/rates'),
  ]).then(
    ({ 0: settings, 1: setup, 2: report }) =>
      void ((saved = settings),
      (draft = { ...settings }),
      (links = setup.links.length > 0),
      (rates = report),
      (currency = settings.baseCurrency ?? ''))
  )
);

// Валюты сайта — по числу месяцев, где у сайта есть суммы в них: первая — самая частая; базовая — первой.
// Ответ курсов приходит после сохранения валюты: пока он старый, база могла бы встать дважды — без повторов.
const siteCurrencies = $derived(
  ((base) => [
    ...new Set([
      ...(base === null ? [] : [base]),
      ...(rates?.currencies ?? [])
        .toSorted(
          (a, b) =>
            b.months.length - a.months.length ||
            (a.currency < b.currency ? -1 : 1)
        )
        .map((_) => _.currency),
    ]),
  ])(saved?.baseCurrency ?? null)
);
const suggested = $derived(
  saved?.baseCurrency === null ? (siteCurrencies[0] ?? null) : null
);
// Курсы к нынешней базе: сменить базу — они перестанут действовать.
const ratesCount = $derived(
  (rates?.currencies ?? []).reduce((sum, _) => sum + _.rates.length, 0)
);
const currencyDirty = $derived(
  saved !== null && (saved.baseCurrency ?? '') !== currency
);
const nameOf = (code: string) =>
  ((name) => (name === code ? code : `${code} — ${name}`))(
    currencyName(code, currentLanguage())
  );

const saveCurrency = (event: SubmitEvent) => (
  event.preventDefault(),
  currencyBusy ||
    !currencyDirty ||
    saved === null ||
    void (
      saved.baseCurrency !== null && ratesCount > 0
        ? ask({
            title: t('analyticsSettings.baseChangeTitle'),
            body: t('analyticsSettings.baseChangeBody', {
              from: saved.baseCurrency,
              n: number(ratesCount),
            }),
            confirm: t('analyticsSettings.baseChangeConfirm'),
          })
        : Promise.resolve(true)
    ).then(
      (yes) =>
        void (
          yes &&
          ((currencyBusy = true),
          api
            .send<AnalyticsSettings>('PUT', '/analytics/settings', {
              baseCurrency: currency === '' ? null : currency,
            })
            .then(
              (_) => (
                (saved = _),
                (draft = { ...draft, baseCurrency: _.baseCurrency }),
                notify(t('analyticsSettings.baseSaved')),
                api
                  .get<RatesReport>('/analytics/rates')
                  .then((report) => void (rates = report))
              )
            )
            .then(undefined, failed)
            .finally(() => (currencyBusy = false)))
        )
    )
);
$effect(() => void loading.retry());

const editable = $derived(can('analytics.edit'));
const dirty = $derived(
  saved !== null &&
    (saved.enabled !== draft.enabled ||
      saved.retentionMonths !== Number(draft.retentionMonths))
);

const _RETENTION = [0, 1, 3, 6, 12, 18, 24, 36, 60, 120];
const choices = $derived(
  [...new Set([..._RETENTION, saved?.retentionMonths ?? 0])].toSorted(
    (a, b) => a - b
  )
);

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    !dirty ||
    ((busy = true),
    api
      .send<AnalyticsSettings>('PUT', '/analytics/settings', {
        enabled: draft.enabled,
        retentionMonths: Number(draft.retentionMonths),
      })
      .then(
        (_) => (
          (saved = _), (draft = { ..._ }), notify(t('analyticsSettings.saved'))
        )
      )
      .then(undefined, failed)
      .finally(() => (busy = false)))
);

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('common.copied')), failed);
</script>

<LoadState load={loading}>
  {#if saved}
    <section class="form-section">
      <header>
        <h2>{t('analyticsSettings.title')}</h2>
        <p>{t('analyticsSettings.intro')}</p>
      </header>
      <form class="fields" novalidate onsubmit={save}>
        <label class="option">
          <input type="checkbox" bind:checked={draft.enabled} disabled={!editable} />
          <span><strong>{t('analyticsSettings.enabled')}</strong><small class="help">{t('analyticsSettings.enabledHint')}</small></span>
        </label>
        <label>
          {t('analyticsSettings.retention')}
          <select bind:value={draft.retentionMonths} disabled={!editable}>
            {#each choices as months (months)}<option value={months}>{months === 0 ? t('analyticsSettings.forever') : tn('analyticsSettings.months', months)}</option>{/each}
          </select>
          <small>{t('analyticsSettings.retentionHint')}</small>
        </label>
        {#if Number(draft.retentionMonths) === 0}
          <p class="advice" role="note">{@html icons.alert}<span>{t('analyticsSettings.setRetention')}</span></p>
        {/if}
        <div class="row">
          {#if editable}<button class="button primary" aria-disabled={busy || !dirty}>{t('analyticsSettings.save')}</button>{/if}
          <a class="button ghost" href={resolve('/(app)/stats/people')}>{@html icons.users}{t('analyticsSettings.view')}</a>
        </div>
      </form>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('analyticsSettings.baseTitle')}</h2>
        <p>{t('analyticsSettings.baseIntro')}</p>
      </header>
      <form class="fields" novalidate onsubmit={saveCurrency}>
        <label>
          {t('analyticsSettings.base')}
          <select bind:value={currency} disabled={!editable} aria-describedby="base-currency-hint">
            <option value="">{t('analyticsSettings.baseNone')}</option>
            {#if siteCurrencies.length > 0}
              <optgroup label={t('analyticsSettings.baseSite')}>
                {#each siteCurrencies as code (code)}<option value={code}>{code === suggested ? t('analyticsSettings.baseFrequent', { name: nameOf(code) }) : nameOf(code)}</option>{/each}
              </optgroup>
            {/if}
            <optgroup label={t('analyticsSettings.baseAll')}>
              {#each CURRENCIES.filter((_) => !siteCurrencies.includes(_)) as code (code)}<option value={code}>{nameOf(code)}</option>{/each}
            </optgroup>
          </select>
          <small id="base-currency-hint">{t('analyticsSettings.baseHint')}</small>
        </label>
        {#if suggested !== null && currency === '' && editable}
          <p class="suggest">
            <span>{t('analyticsSettings.baseSuggest', { name: nameOf(suggested) })}</span>
            <button type="button" class="ghost" onclick={() => (currency = suggested ?? '')}>{t('analyticsSettings.basePick', { currency: suggested })}</button>
          </p>
        {/if}
        {#if currencyDirty && saved?.baseCurrency && ratesCount > 0}
          <p class="advice" role="note">{@html icons.alert}<span>{t('analyticsSettings.baseWarning', { from: saved.baseCurrency, n: number(ratesCount) })}</span></p>
        {/if}
        {#if rates && rates.other.length > 0}
          <p class="muted other">{t('analyticsSettings.baseOther', { list: rates.other.map((_) => `${_.base}: ${number(_.count)}`).join(', ') })}</p>
        {/if}
        <div class="row">
          {#if editable}<button class="button primary" aria-disabled={currencyBusy || !currencyDirty}>{t('analyticsSettings.baseSave')}</button>{/if}
          <a class="button ghost" href={resolve('/(app)/stats/spend')}>{@html icons.coins}{t('analyticsSettings.toSpend')}</a>
        </div>
      </form>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('analyticsSettings.privacyTitle')}</h2>
        <p>{t('analyticsSettings.privacyIntro')}</p>
      </header>
      <div class="fields">
        {#each PRIVACY_SAMPLES as sample (sample.lang)}
          <details class="sample">
            <summary>{sample.language}</summary>
            <p lang={sample.lang}>{sample.text({ months: saved.retentionMonths, links })}</p>
            <button type="button" class="button ghost" onclick={() => copy(sample.text({ months: saved?.retentionMonths ?? 0, links }))}>{@html icons.copy}{t('common.copy')}</button>
          </details>
        {/each}
      </div>
    </section>
  {/if}
</LoadState>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .advice {
    display: flex;
    gap: 0.5rem;
    align-items: start;
    margin: 0;
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
    color: var(--warn-text);
  }

  .suggest {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
    margin: 0;
    font-size: 0.875rem;
  }

  .other {
    margin: 0;
    font-size: 0.8125rem;
  }

  .sample {
    padding: 0.75rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .sample summary {
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .sample p {
    margin: 0.75rem 0;
    font-size: 0.875rem;
    line-height: 1.55;
    text-wrap: pretty;
  }
</style>
