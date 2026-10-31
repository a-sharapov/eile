<script lang="ts">
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type { Load } from '#lib/loading.svelte.ts';
import type {
  DiagnosticsGroup,
  DiagnosticsReport,
  Finding,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';

let {
  report,
  load,
  refresh,
  busy,
}: {
  report: DiagnosticsReport | null;
  load: Load;
  /** Посчитать отчёт заново, мимо кэша сервера. */
  refresh: () => void;
  busy: boolean;
} = $props();

const _GROUPS: readonly DiagnosticsGroup[] = [
  'links',
  'pages',
  'media',
  'settings',
  'server',
];

const groups = $derived(
  _GROUPS
    .map((id) => ({
      id,
      findings: (report?.findings ?? []).filter((_) => _.group === id),
    }))
    .filter((_) => _.findings.length > 0)
);

// Адреса исправлений — внутри менеджера: `/pages/12`, `/settings?tab=search`.
const href = (path: string): string => `/manager${path}`;

// Ошибки раскрыты сразу, пока их немного: их чинят первыми.
const opened = (finding: Finding): boolean =>
  finding.severity === 'error' && finding.count <= 5;
</script>

<section class="diagnostics" aria-labelledby="diagnostics-title">
  <header class="head">
    <div>
      <h2 id="diagnostics-title">{t('diagnostics.title')}</h2>
      {#if report}
        <p class="muted when">
          {t('diagnostics.checked')} <time datetime={report.generatedAt} title={moment(report.generatedAt)}>{ago(report.generatedAt)}</time>
          · {report.tookMs} {t('diagnostics.took')}
        </p>
      {/if}
    </div>
    <button type="button" class="button" aria-disabled={busy} onclick={refresh}>{@html icons.refresh}{t('diagnostics.refresh')}</button>
  </header>

  <LoadState {load}>
    {#if report && report.findings.length === 0}
      <div class="clean" role="status">
        <i class="status-node" data-status="published" aria-hidden="true"></i>
        <p class="clean-title">{t('diagnostics.none')}</p>
        <p class="muted">{t('diagnostics.noneHint')}</p>
      </div>
    {:else if report}
      {#each groups as group (group.id)}
        <section class="group" aria-labelledby={`diagnostics-${group.id}`}>
          <h3 id={`diagnostics-${group.id}`}>{t(`diagnostics.group.${group.id}` as MessageKey)}</h3>
          <ol class="findings">
            {#each group.findings as finding (finding.id)}
              <li data-severity={finding.severity}>
                <details open={opened(finding)}>
                  <summary>
                    <i class="mark" aria-hidden="true"></i>
                    <span class="sr-only">{t(`diagnostics.severity.${finding.severity}` as MessageKey)}:</span>
                    <span class="what">{finding.title}</span>
                    <span class="count" title={t('diagnostics.affected')}>{finding.count}</span>
                    <span class="chevron" aria-hidden="true">{@html icons.chevronDown}</span>
                  </summary>
                  <div class="body">
                    <p class="hint">{finding.hint}</p>
                    <ul class="items">
                      {#each finding.items as item, index (index)}
                        <li>
                          <span class="label">{item.label}</span>
                          {#if item.detail}<code class="detail">{item.detail}</code>{/if}
                          {#if item.fix ?? finding.fix}<a class="fix" href={href((item.fix ?? finding.fix)!.href)}>{t('diagnostics.fix')}</a>{/if}
                        </li>
                      {/each}
                    </ul>
                    {#if finding.count > finding.items.length}
                      <p class="muted more">{t('diagnostics.more')} {finding.count}</p>
                    {/if}
                  </div>
                </details>
              </li>
            {/each}
          </ol>
        </section>
      {/each}
    {/if}
  </LoadState>
</section>

<style>
  .diagnostics {
    max-width: 56rem;
    padding-top: 1.75rem;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem 1.5rem;
    margin-bottom: 1.75rem;
  }

  h2 {
    font-size: 1.625rem;
    font-weight: 650;
    letter-spacing: -0.025em;
  }

  .when {
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .clean {
    display: grid;
    justify-items: start;
    gap: 0.35rem;
    padding: 2rem 0;
  }

  .clean .status-node {
    width: 0.75rem;
    height: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .clean-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .clean p {
    margin: 0;
  }

  .group + .group {
    margin-top: 2rem;
  }

  h3 {
    margin: 0 0 0.6rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  /* Находки — в одной волосяной рамке, разделены линией: данные, а не карточки. */
  .findings {
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    list-style: none;
  }

  .findings > li + li {
    border-top: 0.0625rem solid var(--line);
  }

  summary {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3rem;
    padding: 0.5rem 1rem;
    cursor: pointer;
    list-style: none;
    transition: background 140ms var(--ease);
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: color-mix(in oklch, var(--sunken) 60%, transparent);
  }

  summary:focus-visible {
    outline: 0.125rem solid var(--accent);
    outline-offset: -0.125rem;
  }

  /* Метка важности — тот же язык узлов, что в дереве: ошибка закрашена, предупреждение — наполовину. */
  .mark {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border: 0.125rem solid var(--muted);
    border-radius: 50%;
  }

  [data-severity='error'] .mark {
    border-color: var(--danger);
    background: var(--danger);
  }

  [data-severity='warning'] .mark {
    border-color: var(--warn);
    background: linear-gradient(90deg, var(--warn) 50%, transparent 50%);
  }

  .what {
    flex: 1;
    min-width: 0;
    font-weight: 550;
  }

  [data-severity='info'] .what {
    color: var(--muted);
    font-weight: 500;
  }

  .count {
    flex: none;
    min-width: 1.75rem;
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    background: var(--hover);
    color: var(--text);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  [data-severity='error'] .count {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .chevron {
    display: inline-flex;
    color: var(--muted);
    transition: rotate 160ms var(--ease);
  }

  .chevron :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  details[open] .chevron {
    rotate: 180deg;
  }

  .body {
    padding: 0 1rem 1rem 2.375rem;
  }

  .hint {
    max-width: 44rem;
    margin: 0 0 0.75rem;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .items {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .items li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    padding: 0.45rem 0;
    border-top: 0.0625rem solid color-mix(in oklch, var(--line) 70%, transparent);
    font-size: 0.875rem;
  }

  .label {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .detail {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }

  .fix {
    margin-left: auto;
    font-size: 0.8125rem;
    font-weight: 550;
    white-space: nowrap;
  }

  .more {
    margin: 0.5rem 0 0;
    font-size: 0.8125rem;
  }

  @media (width < 40rem) {
    .body {
      padding-left: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
</style>
