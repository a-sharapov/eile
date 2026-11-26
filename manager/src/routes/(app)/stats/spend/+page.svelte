<script lang="ts">
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type { RatesReport, SetupView, StatsSettings } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { page } from '$app/state';
import { onlyQuery } from '../query.ts';
import StatsTabs from '../StatsTabs.svelte';
import Rates from './Rates.svelte';
import SpendList from './SpendList.svelte';

// «Расходы» и «Курсы» (ADR 0072, «Экраны этапа 3»): подвкладка — в адресе (`?tab=rates`), у «Расходов» там же
// месяцы. Курсы нужны обеим: «Расходам» — базовая валюта и валюты сайта первыми в выборе.
let tab = $derived(
  page.url.searchParams.get('tab') === 'rates' ? 'rates' : 'spend'
);
const pickTab = (next: string) => (
  (tab = next === 'rates' ? 'rates' : 'spend'),
  void onlyQuery({ tab: next === 'rates' ? 'rates' : null })
);

let setup = $state<SetupView | null>(null);
let rates = $state<RatesReport | null>(null);
let zone = $state('');
// «Обновить» — подвкладки монтируются заново и перечитывают свои данные.
let round = $state(0);

const loadRates = () =>
  api.get<RatesReport>('/analytics/rates').then((_) => void (rates = _));

// Пояс отчётов — для моментов в CSV; без права на настройки сайта — пояс браузера.
const loading = defineLoad(() =>
  Promise.all([
    api.get<SetupView>('/analytics/setup'),
    loadRates(),
    can('site.edit')
      ? api.get<StatsSettings>('/stats/settings').then(
          (_) => _.timeZone,
          () => ''
        )
      : Promise.resolve(''),
  ]).then(
    ({ 0: next, 2: timeZone }) => void ((setup = next), (zone = timeZone))
  )
);
$effect(() => void loading.retry());

const editable = $derived(can('analytics.edit'));
const refresh = () => loading.retry().then(() => void (round += 1));
</script>

<svelte:head><title>{t(tab === 'rates' ? 'rates.title' : 'spend.title')} — {t('stats.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" onclick={refresh}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

{#snippet spendTab()}
  {#if tab === 'spend' && setup && rates}
    {#key round}<SpendList {setup} {rates} {zone} {editable} />{/key}
  {/if}
{/snippet}

{#snippet ratesTab()}
  {#if tab === 'rates' && rates}
    <Rates {rates} {editable} onchanged={() => void loadRates()} />
  {/if}
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs />

<LoadState load={loading}>
  <div class="page">
    <Tabs
      label={t('analytics.spend')}
      bind:current={() => tab, pickTab}
      tabs={[
        { id: 'spend', label: t('spend.title'), content: spendTab },
        { id: 'rates', label: t('rates.title'), content: ratesTab },
      ]}
    />
  </div>
</LoadState>

<style>
  .page {
    min-width: 0;
    max-width: 72rem;
  }
</style>
