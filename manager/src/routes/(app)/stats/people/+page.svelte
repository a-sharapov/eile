<script lang="ts">
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type { IntakeSummary, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { page } from '$app/state';
import { onlyQuery } from '../query.ts';
import StatsTabs from '../StatsTabs.svelte';
import EventJournal from './EventJournal.svelte';
import ImportDialog from './ImportDialog.svelte';
import MilestoneComparison from './MilestoneComparison.svelte';
import PeopleList from './PeopleList.svelte';

// «Люди», «Сравнение вех» и «Журнал событий»: подвкладка — в адресе (?tab=milestones, ?tab=events), у каждой свои
// фильтры там же. Выбранная подвкладка меняется сразу, адрес — следом: стрелки клавиатуры переводят фокус на новую
// вкладку.
type Tab = 'people' | 'milestones' | 'events';

const _tabOf = (raw: string | null): Tab =>
  raw === 'events' || raw === 'milestones' ? raw : 'people';

let tab = $derived(_tabOf(page.url.searchParams.get('tab')));
const pickTab = (next: string) => (
  (tab = _tabOf(next)),
  void onlyQuery({ tab: _tabOf(next) === 'people' ? null : _tabOf(next) })
);

let setup = $state<SetupView | null>(null);
let intake = $state<IntakeSummary | null>(null);
let importing = $state(false);
// Загрузили файл — списки перечитываются: ключ меняется, вкладки монтируются заново.
let round = $state(0);

const loading = defineLoad(() =>
  Promise.all([
    api.get<SetupView>('/analytics/setup'),
    api.get<IntakeSummary>('/analytics/intake'),
  ]).then(
    ({ 0: next, 1: summary }) => void ((setup = next), (intake = summary))
  )
);
$effect(() => void loading.retry());

const editable = $derived(can('analytics.edit'));

const refresh = () => loading.retry().then(() => void (round += 1));
</script>

<svelte:head><title>{t(tab === 'events' ? 'eventLog.title' : tab === 'milestones' ? 'milestoneComparison.title' : 'people.title')} — {t('stats.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  {#if editable}
    <button type="button" class="button" aria-disabled={setup === null} onclick={() => setup && (importing = true)}>{@html icons.upload}{t('eventImport.open')}</button>
  {/if}
  <button type="button" class="button ghost" onclick={refresh}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

{#snippet peopleTab()}
  {#if tab === 'people' && setup && intake}
    {#key round}<PeopleList {setup} {intake} {editable} />{/key}
  {/if}
{/snippet}

{#snippet milestonesTab()}
  {#if tab === 'milestones' && setup && intake}
    {#key round}<MilestoneComparison {setup} {intake} {editable} />{/key}
  {/if}
{/snippet}

{#snippet eventsTab()}
  {#if tab === 'events' && setup}
    {#key round}<EventJournal {setup} />{/key}
  {/if}
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs />

<LoadState load={loading}>
  <Tabs
    label={t('analytics.people')}
    bind:current={() => tab, pickTab}
    tabs={[
      { id: 'people', label: t('people.title'), content: peopleTab },
      { id: 'milestones', label: t('milestoneComparison.title'), content: milestonesTab },
      { id: 'events', label: t('eventLog.title'), content: eventsTab },
    ]}
  />
</LoadState>

{#if setup}
  <ImportDialog open={importing} {setup} enabled={intake?.enabled ?? false} onclose={() => (importing = false)} onimported={refresh} />
{/if}
