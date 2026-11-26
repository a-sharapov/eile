<script lang="ts">
import { api } from '#lib/api.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, number, t } from '#lib/i18n.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  IntakeDaily,
  IntakeRefusal,
  IntakeSummary,
  SetupView,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';
import Mark from '../Mark.svelte';
import { senderName } from '../names.ts';
import ScrollTable from '../ScrollTable.svelte';
import { outcomeText } from './labels.ts';
import { dayText, tallyColumns, tallyRows } from './quality.ts';

let { setup }: { setup: SetupView } = $props();

// «Качество → Приём» (было «Настройка → Приём»): включён ли приём, сколько принято с полуночи UTC, когда последнее,
// последние 50 отказов с ошибками по полям (они в памяти сервера до перезапуска) и счёт приёма по суткам UTC за
// 30 суток — по отправителю, пути и исходу.
let summary = $state<IntakeSummary | null>(null);
let daily = $state<IntakeDaily | null>(null);
const loading = defineLoad(() =>
  Promise.all([
    api.get<IntakeSummary>('/analytics/intake'),
    api.get<IntakeDaily>('/analytics/intake/daily?days=30'),
  ]).then(({ 0: next, 1: days }) => void ((summary = next), (daily = days)))
);
$effect(() => void loading.retry());

const rows = $derived(daily ? tallyRows(daily.days) : []);
const columns = $derived(daily ? tallyColumns(daily.days) : []);

const _REASONS: Readonly<Record<IntakeRefusal['reason'], MessageKey>> = {
  invalid: 'intake.reasonInvalid',
  unauthorized: 'intake.reasonUnauthorized',
  throttled: 'intake.reasonThrottled',
};

const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
</script>

<LoadState load={loading}>
  {#if summary}
    <div class="list">
      <header class="intro">
        <p>{t('intake.intro')}</p>
      </header>

      <dl class="tiles">
        <div>
          <dt>{t('intake.state')}</dt>
          <dd>{#if summary.enabled}<Mark tone="ok">{t('intake.on')}</Mark>{:else}<Mark tone="warn">{t('intake.off')}</Mark>{/if}</dd>
          <dd class="help">{t(summary.enabled ? 'intake.onHint' : 'intake.offHint')} {#if can('analytics.edit')}<a href={settingsHref}>{t('intake.toSwitch')}</a>{/if}</dd>
        </div>
        <div>
          <dt>{t('intake.today')}</dt>
          <dd class="big">{number(summary.today)}</dd>
        </div>
        <div>
          <dt>{t('intake.last')}</dt>
          <dd class="big">{#if summary.lastAt}<span title={moment(summary.lastAt)}>{ago(summary.lastAt)}</span>{:else}—{/if}</dd>
        </div>
      </dl>

      <section aria-labelledby="intake-refusals">
        <h3 id="intake-refusals">{t('intake.refusals')}</h3>
        <p class="help">{t('intake.refusalsHint')}</p>
        {#if summary.refusals.length === 0}
          <p class="muted none">{t('intake.noRefusals')}</p>
        {:else}
          <ScrollTable label={t('intake.refusals')}>
            <table class="refusals">
              <thead><tr><th scope="col">{t('intake.at')}</th><th scope="col">{t('intake.reason')}</th><th scope="col">{t('people.sender')}</th><th scope="col">id</th><th scope="col">{t('intake.errors')}</th></tr></thead>
              <tbody>
                {#each summary.refusals as refusal, index (index)}
                  <tr>
                    <td class="at"><span title={moment(refusal.at)}>{ago(refusal.at)}</span></td>
                    <td><Mark tone={refusal.reason === 'invalid' ? 'danger' : 'warn'}>{t(_REASONS[refusal.reason])}</Mark></td>
                    <td class="sender">{refusal.sender ? senderName(setup, refusal.sender) : '—'}</td>
                    <td class="code id">{refusal.id ?? '—'}</td>
                    <td class="problems">
                      {#if Object.keys(refusal.errors).length > 0}
                        <ul class="errors">
                          {#each Object.entries(refusal.errors) as entry (entry[0])}<li><code>{entry[0]}</code> — {entry[1]}</li>{/each}
                        </ul>
                      {:else}<span class="muted">—</span>{/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </ScrollTable>
        {/if}
      </section>

      <section aria-labelledby="intake-daily">
        <h3 id="intake-daily">{t('intake.daily')}</h3>
        <p class="help">{t('intake.dailyHint')}</p>
        {#if rows.length === 0}
          <p class="muted none">{t('intake.noDaily')}</p>
        {:else}
          <ScrollTable label={t('intake.daily')}>
            <table class="daily">
              <thead>
                <tr>
                  <th scope="col" class="pin">{t('intake.dayUtc')}</th>
                  <th scope="col">{t('people.sender')}</th>
                  <th scope="col">{t('intake.origin')}</th>
                  {#each columns as outcome (outcome)}<th scope="col" class="num">{outcomeText(outcome)}</th>{/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as row (`${row.day}/${row.sender}/${row.origin}`)}
                  <tr>
                    <th scope="row" class="pin">{dayText(row.day)}</th>
                    <td class="sender">{row.sender ? senderName(setup, row.sender) : t('intake.keyUnknown')}</td>
                    <td>{t(row.origin === 'http' ? 'intake.originHttp' : 'intake.originFile')}</td>
                    {#each columns as outcome (outcome)}<td class="num">{row.counts[outcome] ? number(row.counts[outcome]!) : '—'}</td>{/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </ScrollTable>
        {/if}
      </section>
    </div>
  {/if}
</LoadState>

<style>
  .list {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: start;
    justify-content: space-between;
  }

  .intro p {
    flex: 1 1 24rem;
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  .tiles > div {
    display: grid;
    gap: 0.35rem;
    align-content: start;
    padding: 0.9rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .tiles dt {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .tiles dd {
    margin: 0;
  }

  .tiles .big {
    font-size: 1.5rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  section {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  h3 {
    font-size: 1rem;
  }

  .help,
  .none {
    margin: 0;
  }

  .none {
    font-size: 0.875rem;
  }

  .refusals {
    min-width: 50rem;
  }

  th,
  td {
    padding: 0.5rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  .at {
    white-space: nowrap;
  }

  .id {
    min-width: 7rem;
    max-width: 12rem;
    overflow-wrap: break-word;
  }

  .sender {
    min-width: 9rem;
  }

  .problems {
    min-width: 16rem;
  }

  .daily {
    min-width: 100%;
  }

  .daily th,
  .daily td {
    white-space: nowrap;
  }

  .daily .num {
    min-width: 5.5rem;
    white-space: normal;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .daily thead .num {
    vertical-align: bottom;
  }

  .pin {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--surface);
    box-shadow: var(--pinned-shadow, none);
  }

  thead .pin {
    background: var(--sunken);
  }

  tbody .pin {
    font-weight: 500;
    text-align: left;
  }

  .errors {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-wrap: break-word;
  }
</style>
