<script lang="ts">
import { untrack } from 'svelte';
import { type QueryParams, reportSearch } from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { csvName } from '#lib/csv.ts';
import { number, quoted, t } from '#lib/i18n.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import type { AnswersReport, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import CsvButton from '../CsvButton.svelte';
import { dictionaryOf, groupName, rowValueName } from '../names.ts';
import { answersCsv } from './export.ts';

// «Метка и ответ»: новые люди периода по значениям группы (строки) и ответам на вопрос опроса (столбцы) —
// видно, сколько людей пришли без метки, но назвали источник сами.
let {
  setup,
  params,
  questions,
}: {
  setup: SetupView;
  params: QueryParams;
  /** Вопросы опроса: первый — по умолчанию. */
  questions: readonly string[];
} = $props();

let question = $state(untrack(() => questions[0] ?? ''));
let report = $state<AnswersReport | null>(null);
let busy = $state(false);

const request = $derived(
  `/analytics/answers${reportSearch(params, {
    question,
    attribution: null,
    life: null,
    fees: null,
    compare: null,
  })}`
);

const loading = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<AnswersReport>(wanted)
      .then((_) => void (wanted === request && (report = _)))
      .finally(() => (busy = false))
  ))(request)
);

$effect(() => void ((_: string) => untrack(() => loading.retry()))(request));

const answerGroup = $derived(`answer:${report?.question ?? question}`);
</script>

<section class="card" aria-labelledby="answers-title">
  <header>
    <h2 id="answers-title">{t('sources.answersTitle')}</h2>
    <div class="tools">
      {#if questions.length > 1}
        <label>
          <span>{t('sources.question')}</span>
          <select bind:value={question}>
            {#each questions as item (item)}<option value={item}>{dictionaryOf(setup, item)?.name ?? item}</option>{/each}
          </select>
        </label>
      {/if}
      {#if report && report.total.people > 0}
        <CsvButton name={csvName('answers', report.from, report.to)} rows={() => (report ? answersCsv(report, setup) : [])} label={t('sources.answersTitle')} />
      {/if}
    </div>
  </header>
  <p class="help">{t('sources.answersHint', { question: quoted(dictionaryOf(setup, report?.question ?? question)?.name ?? question) })}</p>
  <LoadState load={loading}>
    {#if report}
      {#if report.total.people === 0}
        <p class="muted none">{t('sources.answersEmpty')}</p>
      {:else}
        <div class="scroll frame" class:busy>
          <table>
            <thead>
              <tr>
                <th scope="col" class="value">{groupName(setup, report.group)}</th>
                {#each report.columns as column (column.value)}
                  <th scope="col" class="num">{rowValueName(setup, answerGroup, column.value, column.name)}</th>
                {/each}
                <th scope="col" class="num">{t('sources.colPeople')}</th>
              </tr>
            </thead>
            <tbody>
              {#each [report.total, ...report.rows] as row, index (index === 0 ? '' : row.value)}
                <tr class:total={index === 0}>
                  <th scope="row" class="value">{index === 0 ? t('sources.total') : rowValueName(setup, report.group, row.value, row.name)}</th>
                  {#each report.columns as column (column.value)}
                    {@const cell = row.cells[column.value] ?? 0}
                    <td class="num" class:zero={cell === 0}>{number(cell)}</td>
                  {/each}
                  <td class="num strong">{number(row.people)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </LoadState>
</section>

<style>
  .card {
    display: grid;
    gap: 0.75rem;
    align-content: start;
    min-width: 0;
    padding: 1rem 1.1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: end;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: end;
  }

  header label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.8125rem;
  }

  .help,
  .none {
    margin: 0;
  }

  .none {
    font-size: 0.875rem;
  }

  .scroll {
    position: relative;
    overflow-x: auto;
    transition: opacity 150ms var(--ease);
  }

  .scroll.busy {
    opacity: 0.6;
  }

  table {
    min-width: 32rem;
  }

  th,
  td {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  thead th {
    min-width: 6rem;
    font-size: 0.75rem;
    vertical-align: bottom;
    overflow-wrap: break-word;
  }

  .value {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 11rem;
    max-width: 18rem;
    text-align: left;
    overflow-wrap: break-word;
  }

  tbody tr:last-child th {
    border-bottom: 0;
  }

  tbody .value {
    background: var(--surface);
    color: var(--text);
    font-weight: 400;
  }

  .total th,
  .total td {
    border-bottom: 0.125rem solid color-mix(in oklch, var(--line), var(--text) 12%);
    font-weight: 600;
  }

  @media (max-width: 34rem) {
    .value {
      min-width: 8.5rem;
      max-width: 10rem;
    }
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .strong {
    font-weight: 600;
  }

  .zero {
    color: var(--muted);
  }
</style>
