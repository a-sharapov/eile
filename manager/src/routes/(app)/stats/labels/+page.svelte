<script lang="ts">
import { api } from '#lib/api.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type { SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { page } from '$app/state';
import { onlyQuery } from '../query.ts';
import StatsTabs from '../StatsTabs.svelte';
import Check from './Check.svelte';
import Generator from './Generator.svelte';
import Registry from './Registry.svelte';
import UnknownLabels from './UnknownLabels.svelte';

// «Метки» (ADR 0072): генератор меток по схеме отправителя, проверка метки или адреса, реестр выданных меток и
// незнакомые метки первых касаний. Подвкладка — в адресе (?tab=check); смена подвкладки начинает её заново.
type LabelsTab = 'generator' | 'check' | 'registry' | 'unknown';

const _TABS: readonly { id: LabelsTab; label: MessageKey }[] = [
  { id: 'generator', label: 'labels.generator' },
  { id: 'check', label: 'labels.check' },
  { id: 'registry', label: 'labels.registry' },
  { id: 'unknown', label: 'labels.unknown' },
];

let tab = $derived(
  ((wanted) =>
    _TABS.some((_) => _.id === wanted) ? (wanted as LabelsTab) : 'generator')(
    page.url.searchParams.get('tab')
  )
);

const pickTab = (next: string) => (
  (tab = next as LabelsTab),
  void onlyQuery({ tab: next === 'generator' ? null : next })
);

let setup = $state<SetupView | null>(null);
const loading = defineLoad(() =>
  api.get<SetupView>('/analytics/setup').then((_) => void (setup = _))
);
$effect(() => void loading.retry());

const reload = () => loading.retry();
const editable = $derived(can('analytics.edit'));
</script>

<svelte:head><title>{t(_TABS.find((_) => _.id === tab)!.label)} — {t('analytics.labels')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" onclick={reload}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

{#snippet generator()}
  {#if tab === 'generator' && setup}<Generator {setup} {editable} onreload={reload} />{/if}
{/snippet}
{#snippet check()}
  {#if tab === 'check' && setup}<Check {setup} />{/if}
{/snippet}
{#snippet registry()}
  {#if tab === 'registry' && setup}<Registry {setup} {editable} />{/if}
{/snippet}
{#snippet unknown()}
  {#if tab === 'unknown' && setup}<UnknownLabels {setup} {editable} />{/if}
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<StatsTabs />

<LoadState load={loading}>
  <Tabs
    label={t('analytics.labels')}
    bind:current={() => tab, pickTab}
    tabs={[
      { id: 'generator', label: t('labels.generator'), content: generator },
      { id: 'check', label: t('labels.check'), content: check },
      { id: 'registry', label: t('labels.registry'), content: registry },
      { id: 'unknown', label: t('labels.unknown'), content: unknown },
    ]}
  />
</LoadState>
