<script lang="ts">
import { untrack } from 'svelte';
import { api } from '#lib/api.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, type MessageKey, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { money, rateText } from '#lib/money.ts';
import type {
  ErasureEntry,
  FunnelStep,
  LogPage,
  MilestoneCondition,
  Parts,
  SetupLogEntry,
  SetupView,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { page } from '$app/state';
import Mark from '../Mark.svelte';
import { conditionText, partName, partsText, stepName } from '../names.ts';
import { checkName } from '../quality/quality.ts';
import { setQuery } from '../query.ts';
import { monthName, spendPartsText } from '../spend/spend.ts';
import { LOG_ITEMS, resolutionText, setText, statementText } from './log.ts';

let { setup }: { setup: SetupView } = $props();

// Журнал настройки (кто, когда, что было и что стало) и журнал удалений (когда, чем, сколько — без
// псевдонимов). Вид и страница — в адресе: ?tab=log&kind=erasures&before=…
const kind = $derived(
  page.url.searchParams.get('kind') === 'erasures' ? 'erasures' : 'setup'
);
const before = $derived(page.url.searchParams.get('before') ?? '');

let setupPage = $state<LogPage<SetupLogEntry> | null>(null);
let erasurePage = $state<LogPage<ErasureEntry> | null>(null);

const request = $derived(
  `/analytics/log?${new URLSearchParams({
    kind,
    limit: '50',
    ...(before ? { before } : {}),
  })}`
);

const loading = defineLoad(() =>
  ((wanted, which) =>
    api
      .get<LogPage<SetupLogEntry> | LogPage<ErasureEntry>>(wanted)
      .then(
        (_) =>
          void (
            wanted === request &&
            (which === 'erasures'
              ? (erasurePage = _ as LogPage<ErasureEntry>)
              : (setupPage = _ as LogPage<SetupLogEntry>))
          )
      ))(request, kind)
);
$effect(() => void ((_: string) => untrack(() => loading.retry()))(request));

const current = $derived(kind === 'erasures' ? erasurePage : setupPage);

const _ITEMS = LOG_ITEMS;
const checks = $derived(setup.checks ?? []);

const _ACTIONS: Readonly<Record<SetupLogEntry['action'], MessageKey>> = {
  created: 'setupLog.created',
  changed: 'setupLog.changed',
  archived: 'setupLog.archivedAction',
  restored: 'setupLog.restoredAction',
  removed: 'setupLog.removedAction',
  applied: 'setupLog.applied',
};

const actionOf = (entry: SetupLogEntry): string =>
  entry.item === 'key'
    ? t(
        entry.action === 'created'
          ? 'setupLog.keyIssued'
          : 'setupLog.keyRevoked'
      )
    : t(_ACTIONS[entry.action] ?? 'setupLog.changed');

type Json = Readonly<Record<string, unknown>> | null;

// Значение поля для журнала: строки как есть (только текстом), да/нет, пусто — тире, списки — JSON.
const shown = (value: unknown): string =>
  value === null || value === undefined || value === ''
    ? '—'
    : typeof value === 'boolean'
      ? t(value ? 'common.yes' : 'common.no')
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);

// Списки частей и шагов, части парами и условие вехи — словами по нынешней настройке, а не JSON.
const _READABLE: Readonly<Record<string, (value: unknown) => string | null>> = {
  parts: (value) =>
    Array.isArray(value)
      ? value.map((_) => partName(setup, String(_))).join(' → ')
      : value !== null && typeof value === 'object'
        ? partsText(setup, value as Parts) || '—'
        : null,
  steps: (value) =>
    Array.isArray(value)
      ? (value as FunnelStep[]).map((_) => stepName(setup, _)).join(' → ')
      : null,
  condition: (value) =>
    value !== null && typeof value === 'object'
      ? conditionText(setup, value as MilestoneCondition)
      : null,
};

const shownField = (field: string, value: unknown): string =>
  (value === null || value === undefined ? null : _READABLE[field]?.(value)) ??
  shown(value);

const _QUIET = new Set(['archivedAt', 'createdAt', 'updatedAt', 'usedAt']);

// Что поменялось: поля, у которых было и стало расходятся.
const diffOf = (entry: SetupLogEntry) =>
  ((was, now) =>
    [...new Set([...Object.keys(was ?? {}), ...Object.keys(now ?? {})])]
      .filter(
        (_) =>
          !_QUIET.has(_) &&
          JSON.stringify(was?.[_]) !== JSON.stringify(now?.[_])
      )
      .map((_) => ({
        field: _,
        from: shownField(_, was?.[_]),
        to: shownField(_, now?.[_]),
        list: Array.isArray(was?.[_]) || Array.isArray(now?.[_]),
      })))(entry.before as Json, entry.after as Json);

// Курс и строка расхода — словами: «Курс PLN с 1 июн. 2026 г.: 0,2300 EUR», «Расход за октябрь 2026 г. ·
// Источник: Instagram: 0,00 €»; правка — «было → стало».
const _MONEY: Readonly<
  Record<string, (record: Readonly<Record<string, unknown>>) => string>
> = {
  rate: (_) =>
    t('setupLog.rateSummary', {
      currency: String(_.currency),
      day: new Date(`${String(_.day)}T00:00:00Z`).toLocaleDateString(
        currentLanguage(),
        { timeZone: 'UTC', dateStyle: 'medium' }
      ),
      rate: rateText(String(_.rate), currentLanguage()),
      base: String(_.base),
    }),
  spend: (_) =>
    t('setupLog.spendSummary', {
      month: monthName(String(_.month)),
      parts: spendPartsText(setup, (_.parts ?? {}) as Parts),
      amount: money(Number(_.amount), String(_.currency), currentLanguage()),
    }),
  statement: statementText,
};

const moneyOf = (entry: SetupLogEntry): string | null =>
  ((summary, was, now) =>
    summary === undefined
      ? null
      : [was, now]
          .filter((_): _ is Readonly<Record<string, unknown>> => _ !== null)
          .map(summary)
          .join(' → '))(
    _MONEY[entry.item],
    entry.before as Json,
    entry.after as Json
  );

// Кратко о строке, где «было — стало» не нужно: название элемента, подпись ключа, что изменил набор, снятие.
const summaryOf = (entry: SetupLogEntry): string =>
  ((item) =>
    entry.item === 'set'
      ? `${tn(
          'setupLog.setItems',
          Object.values((entry.after ?? {}) as Record<string, object>).reduce(
            (sum, _) => sum + Object.keys(_).length,
            0
          )
        )}: ${setText(entry)}`
      : entry.item === 'key'
        ? t('setupLog.keySummary', {
            label: shown(item?.label),
            hint: shown(item?.hint),
          })
        : entry.item === 'resolution'
          ? resolutionText(entry, checks, setup)
          : entry.item === 'check'
            ? item?.name
              ? shown(item.name)
              : checkName(entry.key, checks)
            : shown(item?.name))((entry.after ?? entry.before) as Json);

const _ORIGINS: Readonly<Record<ErasureEntry['origin'], MessageKey>> = {
  event: 'setupLog.originEvent',
  manager: 'setupLog.originManager',
  retention: 'setupLog.originRetention',
};
</script>

<div class="list">
  <header class="intro">
    <div class="segmented" role="group" aria-label={t('setupLog.kind')}>
      <button type="button" aria-pressed={kind === 'setup'} onclick={() => setQuery({ kind: null, before: null })}>{t('setupLog.kindSetup')}</button>
      <button type="button" aria-pressed={kind === 'erasures'} onclick={() => setQuery({ kind: 'erasures', before: null })}>{t('setupLog.kindErasures')}</button>
    </div>
    <p>{t(kind === 'erasures' ? 'setupLog.erasuresHint' : 'setupLog.setupHint')}</p>
  </header>

  <LoadState load={loading}>
    {#if current}
      {#if current.entries.length === 0}
        <div class="none">
          <p>{before ? t('setupLog.noOlder') : t(kind === 'erasures' ? 'setupLog.noErasures' : 'setupLog.empty')}</p>
          {#if before}<button type="button" onclick={() => setQuery({ before: null })}>{t('eventLog.newest')}</button>{/if}
        </div>
      {:else if kind === 'setup' && setupPage}
        <div class="scroll frame">
          <table>
            <thead><tr><th scope="col">{t('intake.at')}</th><th scope="col">{t('setupLog.who')}</th><th scope="col">{t('setupLog.what')}</th><th scope="col">{t('setupLog.action')}</th><th scope="col">{t('setupLog.details')}</th></tr></thead>
            <tbody>
              {#each setupPage.entries as entry (entry.id)}
                {@const words = moneyOf(entry)}
                {@const diff = entry.action === 'changed' && words === null ? diffOf(entry) : []}
                <tr>
                  <td class="at">{moment(entry.at)}</td>
                  <td>{#if entry.author}{entry.author.name} {#if entry.author.agent}<Mark tone="accent">{t('setupLog.agent')}</Mark>{/if}{:else}<span class="muted">{t('setupLog.nobody')}</span>{/if}</td>
                  <td class="what">{t(_ITEMS[entry.item] ?? 'setupLog.itemSet')} {#if entry.key && entry.item !== 'settings'}<code class="muted">{entry.key}</code>{/if}</td>
                  <td>{actionOf(entry)}</td>
                  <td class="details">
                    {#if diff.length > 0}
                      <ul>
                        {#each diff as change (change.field)}
                          {#if change.list}
                            <li class="list"><code>{change.field}</code><span>{t('setupLog.was', { value: change.from })}</span><span>{t('setupLog.became', { value: change.to })}</span></li>
                          {:else}
                            <li><code>{change.field}</code>: {change.from} → {change.to}</li>
                          {/if}
                        {/each}
                      </ul>
                    {:else}
                      {words ?? summaryOf(entry)}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if erasurePage}
        <div class="scroll frame">
          <table>
            <thead><tr><th scope="col">{t('intake.at')}</th><th scope="col">{t('setupLog.origin')}</th><th scope="col">{t('setupLog.moment')}</th><th scope="col" class="num">{t('setupLog.events')}</th><th scope="col" class="num">{t('setupLog.people')}</th><th scope="col">{t('setupLog.mark')}</th></tr></thead>
            <tbody>
              {#each erasurePage.entries as entry (entry.id)}
                <tr>
                  <td class="at">{moment(entry.at)}</td>
                  <td class="what">{t(_ORIGINS[entry.origin])} {#if entry.sender}<code class="muted">{entry.sender}</code>{/if} {#if entry.userName}<span class="muted">{entry.userName}</span>{/if}</td>
                  <td class="at">{moment(entry.before)}</td>
                  <td class="num">{number(entry.events)}</td>
                  <td class="num">{number(entry.people)}</td>
                  <td>{t(entry.marked ? 'setupLog.marked' : 'setupLog.unmarked')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if before || current.next !== null}
        <nav class="steps" aria-label={t('eventLog.pages')}>
          {#if before}<button type="button" onclick={() => setQuery({ before: null })}>{t('eventLog.newest')}</button>{/if}
          {#if current.next !== null}<button type="button" onclick={() => setQuery({ before: String(current!.next) }, true)}>{t('eventLog.older')}{@html icons.chevron}</button>{/if}
        </nav>
      {/if}
    {/if}
  </LoadState>
</div>

<style>
  .list {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: center;
  }

  .intro p {
    flex: 1 1 20rem;
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .segmented {
    display: inline-flex;
    gap: 0.125rem;
    padding: 0.1875rem;
    border-radius: calc(var(--radius) + 0.1875rem);
    background: var(--hover);
  }

  .segmented button {
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 550;
  }

  .segmented button:hover:not([aria-pressed='true']) {
    background: var(--hover);
    color: var(--text);
  }

  .segmented [aria-pressed='true'] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    color: var(--text);
    font-weight: 600;
  }

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
  }

  table {
    min-width: 52rem;
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

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .what {
    min-width: 12rem;
  }

  .details {
    min-width: 14rem;
    max-width: 28rem;
    overflow-wrap: break-word;
  }

  .details ul {
    display: grid;
    gap: 0.2rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .details .list {
    display: grid;
    gap: 0.1rem;
  }

  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .steps :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .none {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1rem 0;
  }

  .none p {
    margin: 0;
    color: var(--muted);
  }
</style>
