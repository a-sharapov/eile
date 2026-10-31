<script lang="ts">
import { ago } from '#lib/format.ts';
import { currentLanguage, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { inbox, watchInbox } from '#lib/inbox.svelte.ts';
import { resolve } from '$app/paths';

let open = $state(false);
let button: HTMLButtonElement;
let panel = $state<HTMLDivElement>();

$effect(() => watchInbox());

const summary = $derived(inbox.summary);
const unread = $derived(summary?.unread ?? 0);
const peak = $derived(Math.max(1, ...(summary?.daily ?? [0])));

// Конверт ведёт в заявки: вкладка «Заявки» раздела «Формы».
const inboxHref = (query = '') =>
  `${resolve('/(app)/forms')}?tab=inbox${query}`;

// Подпись дня столбца: «30 окт.»; последний столбец — сегодня.
const dayOf = (back: number): string =>
  new Date(Date.now() - back * 86_400_000).toLocaleDateString(
    currentLanguage(),
    {
      day: 'numeric',
      month: 'short',
    }
  );

const close = (event: Event) =>
  void (
    open &&
    (event.type === 'keydown'
      ? (event as KeyboardEvent).key === 'Escape' &&
        ((open = false), button.focus())
      : !button.contains(event.target as Node) &&
        !panel?.contains(event.target as Node) &&
        (open = false))
  );
</script>

<svelte:window onpointerdown={close} onkeydown={close} />

<div class="bell">
  <button type="button" class="button ghost icon" bind:this={button} aria-expanded={open} aria-label={unread > 0 ? `${t('inbox.title')}: ${t('inbox.unread')} ${unread}` : t('inbox.title')} title={t('inbox.title')} onclick={() => (open = !open)}>
    {@html icons.mail}
    {#if unread > 0}<span class="badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>{/if}
  </button>
  {#if open}
    <div class="panel" bind:this={panel} role="dialog" aria-label={t('inbox.title')}>
      <header>
        <strong>{t('inbox.title')}</strong>
        <a href={inboxHref()} onclick={() => (open = false)}>{t('inbox.all')}</a>
      </header>
      {#if summary === null}
        <p class="muted">{t('common.loading')}</p>
      {:else if summary.week === 0 && summary.latest.length === 0}
        <p class="muted empty">{t('inbox.emptyBell')}</p>
      {:else}
        <dl class="stats">
          <div><dt>{t('inbox.unread')}</dt><dd>{summary.unread}</dd></div>
          <div><dt>{t('inbox.today')}</dt><dd>{summary.today}</dd></div>
          <div><dt>{t('inbox.week')}</dt><dd>{summary.week}</dd></div>
        </dl>
        <figure class="spark">
          <svg viewBox="0 0 140 32" role="img" aria-label={`${t('inbox.daily')}: ${summary.daily.join(', ')}`} preserveAspectRatio="none">
            {#each summary.daily as count, index (index)}
              <g>
                <title>{dayOf(summary.daily.length - 1 - index)}: {count}</title>
                <rect class="hit" x={index * 10} y="0" width="10" height="32" />
                {#if count > 0}
                  <rect class="bar" class:today={index === summary.daily.length - 1} x={index * 10 + 1} y={32 - Math.max(2, (count / peak) * 30)} width="8" height={Math.max(2, (count / peak) * 30)} rx="2" />
                {/if}
              </g>
            {/each}
            <line x1="0" y1="31.5" x2="140" y2="31.5" />
          </svg>
          <figcaption class="muted">{t('inbox.daily')}</figcaption>
        </figure>
        {#if summary.byForm.length > 0}
          <ul class="forms">
            {#each summary.byForm as form (form.form)}
              <li>
                <a href={inboxHref(`&form=${form.form}`)} onclick={() => (open = false)}>
                  <span>{form.title}</span>
                  {#if form.unread > 0}<span class="count">{form.unread}</span>{/if}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
        <ul class="latest">
          {#each summary.latest as row (row.id)}
            <li>
              <a href={inboxHref(`&id=${row.id}`)} onclick={() => (open = false)}>
                {#if !row.read}<span class="dot" aria-label={t('inbox.new')}></span>{/if}
                <span class="preview">{row.preview || row.formTitle}</span>
                <span class="muted meta">{row.formTitle} · {ago(row.createdAt)}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .bell {
    position: relative;
  }

  .bell > button {
    position: relative;
  }

  .badge {
    position: absolute;
    top: 0.1rem;
    right: 0.05rem;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 0.3rem;
    border-radius: 1rem;
    background: var(--accent);
    color: var(--primary-text);
    font-size: 0.6875rem;
    font-weight: 700;
    line-height: 1.1rem;
    text-align: center;
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 30;
    display: grid;
    gap: 0.85rem;
    width: min(22rem, calc(100vw - 2rem));
    padding: 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow-big);
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .empty {
    margin: 0;
    font-size: 0.875rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin: 0;
  }

  .stats div {
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius);
    background: var(--sunken);
  }

  dt {
    color: var(--muted);
    font-size: 0.75rem;
  }

  dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .spark {
    margin: 0;
  }

  .spark svg {
    display: block;
    width: 100%;
    height: 2.5rem;
  }

  .hit {
    fill: transparent;
  }

  .bar {
    fill: color-mix(in oklch, var(--accent) 55%, var(--surface));
  }

  .bar.today {
    fill: var(--accent);
  }

  g:hover .bar {
    fill: var(--accent);
  }

  line {
    stroke: var(--line);
    stroke-width: 1;
  }

  figcaption {
    margin-top: 0.25rem;
    font-size: 0.75rem;
  }

  ul {
    display: grid;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .forms a,
  .latest a {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
  }

  .forms a:hover,
  .latest a:hover {
    background: var(--hover);
  }

  .forms a span:first-child {
    flex: 1;
  }

  .count {
    min-width: 1.4rem;
    padding: 0 0.4rem;
    border-radius: 1rem;
    background: var(--accent);
    color: var(--primary-text);
    font-size: 0.75rem;
    font-weight: 700;
    text-align: center;
  }

  .latest {
    padding-top: 0.5rem;
    border-top: 0.0625rem solid var(--line);
  }

  .latest a {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: baseline;
    column-gap: 0.5rem;
  }

  .dot {
    grid-row: 1 / span 2;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .preview {
    grid-column: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    grid-column: 2;
    font-size: 0.75rem;
  }
</style>
