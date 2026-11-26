<script lang="ts">
import { api } from '#lib/api.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  AnalyticsSettings,
  IssuedSenderKey,
  SetPlanReport,
  SetupView,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { onlyQuery } from '../query.ts';
import StatsTabs from '../StatsTabs.svelte';
import Dictionaries from './Dictionaries.svelte';
import Funnels from './Funnels.svelte';
import ItemForm from './ItemForm.svelte';
import KeyDialog from './KeyDialog.svelte';
import Links from './Links.svelte';
import Milestones from './Milestones.svelte';
import Properties from './Properties.svelte';
import Referrers from './Referrers.svelte';
import Samples from './Samples.svelte';
import Schemas from './Schemas.svelte';
import Senders from './Senders.svelte';
import SetupLog from './SetupLog.svelte';
import type { EditRequest } from './setup.ts';
import Transfer from './Transfer.svelte';
import Types from './Types.svelte';
import { isEmptySetup } from './transfer.ts';
import Unknown from './Unknown.svelte';

// Настройка аналитики: отправители и ключи, справочники, метки и их источники, вехи и воронки, незнакомые,
// перенос набора и журналы («Приём» — в «Качестве», старый адрес переводит туда `+page.ts`). Подвкладка — в адресе
// (?tab=types), фильтры подвкладки — там же; смена подвкладки начинает её с чистыми фильтрами. Пустая настройка
// открывается выбором образца, а не пустыми «Отправителями».
type SetupTab =
  | 'senders'
  | 'types'
  | 'properties'
  | 'dictionaries'
  | 'schemas'
  | 'referrers'
  | 'links'
  | 'milestones'
  | 'funnels'
  | 'unknown'
  | 'transfer'
  | 'log';

// `help` — раздел главы «Аналитика» справки для ссылки «?»: отправители — памятка разработчику, метки и их
// источники — «Метки и переходы», перенос — свой раздел, остальное — «Настройка».
const _TABS: readonly { id: SetupTab; label: MessageKey; help: string }[] = [
  { id: 'senders', label: 'senders.title', help: 'analytics-sender' },
  { id: 'types', label: 'eventTypes.title', help: 'analytics-setup' },
  { id: 'properties', label: 'properties.title', help: 'analytics-setup' },
  { id: 'dictionaries', label: 'dictionaries.title', help: 'analytics-setup' },
  { id: 'schemas', label: 'schemas.title', help: 'analytics-labels' },
  { id: 'referrers', label: 'referrers.title', help: 'analytics-labels' },
  { id: 'links', label: 'links.title', help: 'analytics-labels' },
  { id: 'milestones', label: 'milestones.title', help: 'analytics-setup' },
  { id: 'funnels', label: 'funnels.title', help: 'analytics-setup' },
  { id: 'unknown', label: 'unknown.title', help: 'analytics-setup' },
  { id: 'transfer', label: 'transfer.title', help: 'analytics-transfer' },
  { id: 'log', label: 'setupLog.title', help: 'analytics-setup' },
];

// Выбранная подвкладка меняется сразу, адрес — следом: стрелки клавиатуры переводят фокус на новую вкладку.
let tab = $derived(
  ((wanted) =>
    _TABS.some((_) => _.id === wanted) ? (wanted as SetupTab) : 'senders')(
    page.url.searchParams.get('tab')
  )
);

const pickTab = (next: string) => (
  (tab = next as SetupTab),
  void onlyQuery({ tab: next === 'senders' ? null : next })
);

let setup = $state<SetupView | null>(null);
let settings = $state<AnalyticsSettings | null>(null);
let editing = $state<EditRequest | null>(null);
let issued = $state<{ key: IssuedSenderKey; sender: string } | null>(null);

const loading = defineLoad(() =>
  Promise.all([
    api.get<SetupView>('/analytics/setup'),
    api.get<AnalyticsSettings>('/analytics/settings'),
  ]).then(
    ({ 0: next, 1: current }) => void ((setup = next), (settings = current))
  )
);
$effect(() => void loading.retry());

const reload = () => void loading.retry();
const editable = $derived(can('analytics.edit'));

// Пустая настройка без подвкладки в адресе — выбор: образец, файл или с нуля.
let scratch = $state(false);
const start = $derived(
  setup !== null &&
    isEmptySetup(setup) &&
    !scratch &&
    page.url.searchParams.get('tab') === null
);

// Набор загружен: «Отправители» с подсказкой выпустить ключ, а у образца (переходов в нём нет) — завести переход.
let applied = $state<{ name: string; key: boolean; link: boolean } | null>(
  null
);
const loaded = (report: SetPlanReport, sample: boolean) => (
  (applied = {
    name: report.name,
    key:
      sample ||
      report.warnings.some((_) => _.code === 'sender_created') ||
      report.created.some((_) => _.group === 'sender'),
    link: sample || !report.created.some((_) => _.group === 'link'),
  }),
  (scratch = true),
  pickTab('senders'),
  reload()
);

// Ключ нового отправителя подписан его названием: окно ключа открывается сразу после формы.
const saved = (key: IssuedSenderKey | null) => (
  void (key && (issued = { key, sender: key.label })),
  (editing = null),
  reload()
);
</script>

<svelte:head><title>{t(_TABS.find((_) => _.id === tab)!.label)} — {t('analytics.setup')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" onclick={reload}>{@html icons.refresh}{t('stats.refresh')}</button>
{/snippet}

<!-- Смонтирована только открытая подвкладка: её данные грузятся, когда её открыли. -->
{#snippet senders()}
  {#if tab === 'senders' && applied}
    <div class="applied" role="status">
      <p><strong>{t('transfer.applied', { name: quoted(applied.name) })}</strong></p>
      {#if applied.key}<p>{t('transfer.appliedKey')}</p>{/if}
      {#if applied.link}<p>{t('transfer.appliedLink')} <a href={`${resolve('/(app)/stats/setup')}?tab=links`}>{t('links.title')}</a></p>{/if}
    </div>
  {/if}
  {#if tab === 'senders' && setup}<Senders {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} onissued={(key, sender) => (issued = { key, sender })} />{/if}
{/snippet}
{#snippet types()}
  {#if tab === 'types' && setup}<Types {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet properties()}
  {#if tab === 'properties' && setup}<Properties {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet dictionaries()}
  {#if tab === 'dictionaries' && setup}<Dictionaries {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet schemas()}
  {#if tab === 'schemas' && setup}<Schemas {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet referrers()}
  {#if tab === 'referrers' && setup}<Referrers {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet links()}
  {#if tab === 'links' && setup}<Links {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet milestones()}
  {#if tab === 'milestones' && setup}<Milestones {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet funnels()}
  {#if tab === 'funnels' && setup}<Funnels {setup} {editable} onedit={(_) => (editing = _)} onchanged={reload} />{/if}
{/snippet}
{#snippet unknown()}
  {#if tab === 'unknown' && setup}<Unknown {setup} {editable} onedit={(_) => (editing = _)} />{/if}
{/snippet}
{#snippet transfer()}
  {#if tab === 'transfer' && setup}<Transfer {setup} {editable} onapplied={loaded} />{/if}
{/snippet}
{#snippet log()}
  {#if tab === 'log' && setup}<SetupLog {setup} />{/if}
{/snippet}

<PageHeader title={t('stats.title')} crumbs={[]} {actions} />
<!-- Пустая настройка открывается выбором образца — «?» ведёт в «С чего начать». -->
<StatsTabs help={start ? 'analytics-start' : _TABS.find((_) => _.id === tab)!.help} />

<LoadState load={loading}>
  {#if start && setup}
    <section class="start" aria-labelledby="setup-start">
      <h2 id="setup-start">{t('transfer.startTitle')}</h2>
      <p class="muted">{t('transfer.startText')}</p>
      <Samples {setup} {editable} onapplied={loaded} />
      <div class="start-actions">
        {#if editable}<button type="button" onclick={() => ((scratch = true), pickTab('transfer'))}>{@html icons.upload}{t('transfer.startFile')}</button>{/if}
        <button type="button" class="ghost" onclick={() => (scratch = true)}>{t('transfer.startScratch')}</button>
      </div>
    </section>
  {:else}
  <Tabs
    label={t('analytics.setup')}
    bind:current={() => tab, pickTab}
    tabs={[
      { id: 'senders', label: t('senders.title'), content: senders },
      { id: 'types', label: t('eventTypes.title'), content: types },
      { id: 'properties', label: t('properties.title'), content: properties },
      { id: 'dictionaries', label: t('dictionaries.title'), content: dictionaries },
      { id: 'schemas', label: t('schemas.title'), content: schemas },
      { id: 'referrers', label: t('referrers.title'), content: referrers },
      { id: 'links', label: t('links.title'), content: links },
      { id: 'milestones', label: t('milestones.title'), content: milestones },
      { id: 'funnels', label: t('funnels.title'), content: funnels },
      { id: 'unknown', label: t('unknown.title'), content: unknown },
      { id: 'transfer', label: t('transfer.title'), content: transfer },
      { id: 'log', label: t('setupLog.title'), content: log },
    ]}
  />
  {/if}
</LoadState>

{#if setup}
  <ItemForm request={editing} {setup} onclose={() => (editing = null)} onsaved={saved} />
  <KeyDialog issued={issued?.key ?? null} sender={issued?.sender ?? ''} enabled={settings?.enabled ?? false} onclose={() => (issued = null)} />
{/if}

<style>
  .start {
    display: grid;
    gap: 0.9rem;
    max-width: 60rem;
  }

  .start h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  .start p {
    max-width: 46rem;
    margin: 0;
    text-wrap: pretty;
  }

  .start-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .applied {
    display: grid;
    gap: 0.3rem;
    padding: 0.75rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklch, var(--ok) 35%, var(--line));
    border-radius: var(--radius);
    background: var(--ok-soft);
    font-size: 0.875rem;
  }

  .applied p {
    margin: 0;
  }
</style>
