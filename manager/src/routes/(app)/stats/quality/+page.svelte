<script lang="ts">
import { untrack } from 'svelte';
import { api } from '#lib/api.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { refreshQuality } from '#lib/quality-status.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type { IntakeSummary, QualityReport, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { page } from '$app/state';
import { onlyQuery } from '../query.ts';
import StatsTabs from '../StatsTabs.svelte';
import Checks from './Checks.svelte';
import Intake from './Intake.svelte';
import Statements from './Statements.svelte';
import Summary from './Summary.svelte';

// «Качество данных» (ADR 0072, «Экраны этапа 4»): сводка проверок с сеткой «проверка × сутки» и окном дня, приём
// (переехал из «Настройки»), пороги встроенных и свои проверки, выписки. Подвкладка — в адресе
// (`?tab=intake|checks|statements`), открытый день — `&day=&check=&scope=`; ссылка из уведомления — `?day=`.
type QualityTab = 'summary' | 'intake' | 'checks' | 'statements';

const _TABS: readonly { id: QualityTab; label: MessageKey; help: string }[] = [
  { id: 'summary', label: 'quality.tabSummary', help: 'analytics-quality' },
  { id: 'intake', label: 'intake.title', help: 'analytics-sender' },
  { id: 'checks', label: 'quality.tabChecks', help: 'analytics-quality' },
  {
    id: 'statements',
    label: 'quality.tabStatements',
    help: 'analytics-quality',
  },
];

let tab = $derived(
  ((wanted) =>
    _TABS.some((_) => _.id === wanted) ? (wanted as QualityTab) : 'summary')(
    page.url.searchParams.get('tab')
  )
);

const pickTab = (next: string) => (
  (tab = next as QualityTab),
  void onlyQuery({ tab: next === 'summary' ? null : next })
);

const test = $derived(page.url.searchParams.get('test') === '1');

let report = $state<QualityReport | null>(null);
let setup = $state<SetupView | null>(null);
let intake = $state<IntakeSummary | null>(null);
let busy = $state(false);
// «Обновить» — подвкладки монтируются заново и перечитывают свои данные.
let round = $state(0);

const request = $derived(
  `/analytics/quality?${new URLSearchParams({ days: '30', detail: '1', ...(test ? { test: '1' } : {}) })}`
);

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    Promise.all([
      api.get<QualityReport>(wanted),
      api.get<SetupView>('/analytics/setup'),
      api.get<IntakeSummary>('/analytics/intake'),
    ])
      .then(
        ({ 0: next, 1: current, 2: summary }) =>
          void (
            wanted === request &&
            ((report = next), (setup = current), (intake = summary))
          )
      )
      .finally(() => (busy = false))
  ))(request)
);
$effect(() => void ((_: string) => untrack(() => loading.retry()))(request));

// Перечитать сетку, настройку и отметку в меню: после снятия, перепроверки, правки проверки или выписки.
const reload = () => (refreshQuality(), loading.retry());
const refresh = () => reload().then(() => void (round += 1));
const editable = $derived(can('analytics.edit'));
</script>

<svelte:head><title>{t(_TABS.find((_) => _.id === tab)!.label)} — {t('quality.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" aria-disabled={busy} onclick={refresh}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

{#snippet summaryTab()}
  {#if tab === 'summary' && report && setup && intake}
    <Summary {report} {setup} {intake} {editable} {busy} onchanged={reload} />
  {/if}
{/snippet}
{#snippet intakeTab()}
  {#if tab === 'intake' && setup}
    {#key round}<Intake {setup} />{/key}
  {/if}
{/snippet}
{#snippet checksTab()}
  {#if tab === 'checks' && report && setup}
    <Checks {report} {setup} {editable} onchanged={reload} />
  {/if}
{/snippet}
{#snippet statementsTab()}
  {#if tab === 'statements' && report && setup}
    {#key round}<Statements {report} {editable} onopen={() => pickTab('checks')} onchanged={reload} />{/key}
  {/if}
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs help={_TABS.find((_) => _.id === tab)!.help} />

<LoadState load={loading}>
  <div class="page">
    <h2 class="title">{t('quality.title')}</h2>
    <Tabs
      label={t('quality.title')}
      bind:current={() => tab, pickTab}
      tabs={[
        { id: 'summary', label: t('quality.tabSummary'), content: summaryTab },
        { id: 'intake', label: t('intake.title'), content: intakeTab },
        { id: 'checks', label: t('quality.tabChecks'), content: checksTab },
        { id: 'statements', label: t('quality.tabStatements'), content: statementsTab },
      ]}
    />
  </div>
</LoadState>

<style>
  .page {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    max-width: 80rem;
  }

  .title {
    margin: 0;
    font-size: 1.125rem;
  }
</style>
