<script lang="ts">
import { api, isApiError } from '#lib/api.ts';
import { quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe } from '#lib/notices.svelte.ts';
import type { SetPlanReport, SetSampleView, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import Modal from '../Modal.svelte';
import SetPlan from './SetPlan.svelte';
import { canApply, SAMPLE_COUNTS } from './transfer.ts';

// Образцы бинарника карточками: название, описание, что внутри. Карточка — проба и окно отчёта, «Создать» —
// загрузка тем же путём, что у файла; загружает только человек, вошедший в менеджер.
let {
  setup,
  editable,
  onapplied,
}: {
  setup: SetupView;
  editable: boolean;
  onapplied: (report: SetPlanReport, sample: true) => void;
} = $props();

let samples = $state<SetSampleView[]>([]);
const loading = defineLoad(() =>
  api
    .get<SetSampleView[]>('/analytics/set/samples')
    .then((_) => void (samples = _))
);
$effect(() => void loading.retry());

let chosen = $state<SetSampleView | null>(null);
let report = $state<SetPlanReport | null>(null);
let busy = $state(false);
let error = $state<string | null>(null);

const plan = (sample: SetSampleView) => (
  (chosen = sample),
  (report = null),
  (error = null),
  (busy = true),
  api
    .send<SetPlanReport>('POST', '/analytics/set/plan', { sample: sample.code })
    .then(
      (_) => void (report = _),
      (_) => void (error = describe(_))
    )
    .finally(() => (busy = false))
);

const apply = () =>
  void (
    chosen &&
    report &&
    canApply(report) &&
    !busy &&
    ((busy = true),
    (error = null),
    api
      .send<SetPlanReport>('POST', '/analytics/set', { sample: chosen.code })
      .then(
        (_) => ((chosen = null), (report = null), onapplied(_, true)),
        (_) =>
          void ((error = describe(_)),
          isApiError(_) &&
            _.code === 'analytics.invalid_set' &&
            chosen &&
            plan(chosen))
      )
      .finally(() => (busy = false)))
  );

const close = () => ((chosen = null), (report = null), (error = null));
</script>

<LoadState load={loading}>
  <ul class="cards">
    {#each samples as sample (sample.code)}
      <li class="card frame">
        <h4>{sample.title}</h4>
        <p>{sample.description}</p>
        <p class="muted inside">{SAMPLE_COUNTS.filter(({ 0: group }) => (sample.counts[group] ?? 0) > 0).map(({ 0: group, 1: key }) => tn(key, sample.counts[group] ?? 0)).join(' · ')}</p>
        {#if editable}<button type="button" aria-label={t('transfer.samplePlanNamed', { name: quoted(sample.title) })} onclick={() => plan(sample)}>{@html icons.eye}{t('transfer.samplePlan')}</button>{/if}
      </li>
    {/each}
  </ul>
</LoadState>

<Modal open={chosen !== null} wide full title={chosen ? t('transfer.sampleTitle', { name: quoted(chosen.title) }) : ''} onclose={close}>
  {#if error}<p class="field-error" role="alert">{error}</p>{/if}
  {#if report}
    <SetPlan {report} {setup} file={null} />
  {:else if busy}
    <p class="muted">{t('common.loading')}</p>
  {/if}
  {#snippet footer()}
    <button type="button" onclick={close}>{t('common.cancel')}</button>
    {#if report}<button type="button" class="primary" aria-disabled={busy || !canApply(report)} onclick={apply}>{t('transfer.create')}</button>{/if}
  {/snippet}
</Modal>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    gap: 0.5rem;
    align-content: start;
    justify-items: start;
    padding: 1rem 1.1rem;
  }

  h4 {
    margin: 0;
    font-size: 1rem;
  }

  .card p {
    margin: 0;
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .inside {
    font-size: 0.8125rem;
  }
</style>
