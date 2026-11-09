<script lang="ts">
import { ACTION_LABEL } from '#lib/activity.ts';
import { api } from '#lib/api.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import {
  childrenOf,
  descendantsOf,
  inTrash,
  statusOf,
  trail,
  trashed,
  tree,
  treeLoad,
} from '#lib/tree.svelte.ts';
import type { Activity, DiagnosticsReport, PageNode } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';
import Diagnostics from './Diagnostics.svelte';
import Journal from './Journal.svelte';
import PageTable from './PageTable.svelte';

type Status = 'published' | 'draft' | 'scheduled';

// Обзор — первый экран после входа: сайт целиком картой, что менялось и что ждёт внимания.
// Страница из раздела в корзине на сайте не видна — не считаем её ни опубликованной, ни черновиком.
const live = $derived(tree.nodes.filter((_) => !inTrash(_)));
const roots = $derived(childrenOf(null));
const counts = $derived({
  published: live.filter((_) => statusOf(_) === 'published').length,
  draft: live.filter((_) => statusOf(_) === 'draft').length,
  scheduled: live.filter((_) => statusOf(_) === 'scheduled').length,
});
const drafts = $derived(live.filter((_) => statusOf(_) === 'draft'));
const scheduled = $derived(
  live
    .filter((_) => statusOf(_) === 'scheduled')
    .toSorted((a, b) => (a.publishAt ?? '').localeCompare(b.publishAt ?? ''))
);
// Как в дереве: сколько записей в корзине, ветка — одна запись.
const bin = $derived(trashed().length);

const _LEGEND: readonly {
  readonly status: Status;
  readonly label: MessageKey;
}[] = [
  { status: 'published', label: 'overview.published' },
  { status: 'draft', label: 'overview.draftsCount' },
  { status: 'scheduled', label: 'overview.scheduledCount' },
];

// Фильтр карты: выбранные статусы видны ярко, остальное приглушено, но структура остаётся.
let only = $state<ReadonlySet<Status>>(new Set());

const toggle = (status: Status) =>
  void (only = only.has(status)
    ? new Set([...only].filter((_) => _ !== status))
    : new Set([...only, status]));

const dimmed = (node: PageNode): boolean =>
  only.size > 0 && !only.has(statusOf(node) as Status);

// Карта показывает три уровня: глубже — счётчик, ведущий на страницу ветки.
const _DEPTH = 3;

const href = (node: PageNode) =>
  resolve('/(app)/pages/[id]', { id: String(node.id) });

let feed = $state<Activity[]>([]);

const feedLoad = defineLoad(() =>
  api.get<Activity[]>('/activity?limit=12').then((_) => (feed = _))
);

$effect(() => void feedLoad.retry());

// Удалённые навсегда страницы из журнала не показываем: ссылке некуда вести.
const recent = $derived(
  feed
    .map((entry) => ({
      entry,
      node: tree.nodes.find((_) => _.id === entry.pageId),
    }))
    .filter(
      (_): _ is { entry: Activity; node: PageNode } => _.node !== undefined
    )
);

const siteHost = $derived(session.site.url.replace(/^https?:\/\//, ''));

// Таблица или карта: выбор помнит браузер; по умолчанию и без хранилища — таблица.
const _VIEW_KEY = 'cms.pagesView';
const _stored = (): string | null => {
  try {
    return localStorage.getItem(_VIEW_KEY);
  } catch {
    return null;
  }
};

type View = 'map' | 'table' | 'journal' | 'diagnostics';

// Диагностика — администратору: она про настройки, медиатеку и формы.
const admin = $derived(session.user?.role === 'admin');

let view = $state<View>(
  ((stored) =>
    stored === 'map' || stored === 'journal' || stored === 'diagnostics'
      ? stored
      : 'table')(_stored())
);
const shown = $derived<View>(view === 'diagnostics' && !admin ? 'table' : view);

let report = $state<DiagnosticsReport | null>(null);
let checking = $state(false);
const diagnosticsLoad = defineLoad(() =>
  api.get<DiagnosticsReport>('/diagnostics').then((_) => (report = _))
);
// Число проблем на вкладке видно сразу, а не только на самой диагностике.
$effect(() => void (admin && diagnosticsLoad.retry()));

const recheck = () =>
  checking ||
  ((checking = true),
  api
    .get<DiagnosticsReport>('/diagnostics?fresh=1')
    .then((_) => void (report = _), failed)
    .finally(() => (checking = false)));

const pick = (next: View) => {
  view = next;
  try {
    localStorage.setItem(_VIEW_KEY, next);
  } catch {}
};
</script>

<svelte:head><title>{t('nav.pages')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <div class="views" role="group" aria-label={t('overview.view')}>
    <button type="button" aria-pressed={shown === 'table'} title={t('overview.viewTable')} onclick={() => pick('table')}>{@html icons.list}<span class="label">{t('overview.viewTable')}</span></button>
    <button type="button" aria-pressed={shown === 'map'} title={t('overview.viewMap')} onclick={() => pick('map')}>{@html icons.tree}<span class="label">{t('overview.viewMap')}</span></button>
    <button type="button" aria-pressed={shown === 'journal'} title={t('overview.viewJournal')} onclick={() => pick('journal')}>{@html icons.clock}<span class="label">{t('overview.viewJournal')}</span></button>
    {#if admin}
      <button type="button" aria-pressed={shown === 'diagnostics'} title={t('overview.viewDiagnostics')} onclick={() => pick('diagnostics')}>
        {@html icons.activity}<span class="label">{t('overview.viewDiagnostics')}</span>
        {#if report && report.problems > 0}<span class="problems" title={t('overview.problems')}><span class="sr-only">{t('overview.problems')}: </span>{report.problems}</span>{/if}
      </button>
    {/if}
  </div>
  <a class="button primary" href={resolve('/(app)/pages/[id]', { id: 'new' })}>{@html icons.plus}{t('pages.new')}</a>
{/snippet}

{#snippet branch(node: PageNode, depth: number)}
  <a class="node" href={href(node)} data-status={statusOf(node)} data-dim={dimmed(node) || undefined}>
    <i class="status-node" aria-hidden="true"></i>
    <span class="title">{node.title}</span>
    <span class="sr-only">({t(`pages.${statusOf(node)}` as MessageKey)})</span>
    <span class="id">{node.id}</span>
  </a>
  {#if childrenOf(node.id).length > 0}
    {#if depth < _DEPTH}
      <ol>
        {#each childrenOf(node.id) as child (child.id)}
          <li>{@render branch(child, depth + 1)}</li>
        {/each}
      </ol>
    {:else}
      <a class="hidden-count" href={href(node)}>{t('overview.hidden', { n: descendantsOf(node.id).filter((_) => !inTrash(_)).length })}</a>
    {/if}
  {/if}
{/snippet}

{#snippet mapHead()}
<header class="map-head">
  <div class="trunk">
    <h2 id="map-title">{session.site.name || t('overview.map')}</h2>
    {#if siteHost}<span class="host">{siteHost}</span>{/if}
  </div>
  <div class="legend" role="group" aria-label={t('overview.filter')}>
    {#each _LEGEND as item (item.status)}
      <button type="button" data-status={item.status} aria-pressed={only.has(item.status)} onclick={() => toggle(item.status)}>
        <i class="status-node" aria-hidden="true"></i>{t(item.label)}<span class="num">{counts[item.status]}</span>
      </button>
    {/each}
    {#if bin > 0}<span class="bin" data-status="trashed"><i class="status-node" aria-hidden="true"></i>{t('overview.trashed')}<span class="num">{bin}</span></span>{/if}
  </div>
</header>
{/snippet}

<!-- Видимый заголовок экрана — сам сайт (ствол карты); «Обзор сайта» — для читалки и в пути. -->
<PageHeader title={t('overview.title')} crumbs={[{ label: t('nav.pages') }]} {actions} titleHidden />

{#if shown === 'diagnostics'}
  <Diagnostics {report} load={diagnosticsLoad} refresh={recheck} busy={checking} />
{:else if shown === 'journal'}
  <Journal />
{:else if shown === 'table'}
  <section class="table-view" aria-labelledby="map-title">
    {@render mapHead()}
    <p class="muted table-hint">{t('table.hint')}</p>
    <LoadState load={treeLoad}>
      <PageTable {dimmed} />
    </LoadState>
  </section>
{:else}
<div class="overview">
  <section class="map" aria-labelledby="map-title">
    {@render mapHead()}

    <LoadState load={treeLoad}>
      {#if roots.length === 0}
        <div class="empty">
          <p>{t('overview.emptyMap')}</p>
          <a class="button primary" href={resolve('/(app)/pages/[id]', { id: 'new' })}>{@html icons.plus}{t('overview.firstPage')}</a>
        </div>
      {:else}
        <ol class="branches" aria-label={t('overview.map')}>
          {#each roots as node (node.id)}
            <li class="branch">{@render branch(node, 1)}</li>
          {/each}
        </ol>
      {/if}
    </LoadState>
  </section>

  <aside class="side">
    <section aria-labelledby="recent-title">
      <h2 id="recent-title">{t('overview.recent')}</h2>
      <LoadState load={feedLoad} compact>
        {#if recent.length === 0}
          <p class="muted note">{t('overview.noRecent')}</p>
        {:else}
          <ol class="feed">
            {#each recent as item (`${item.entry.pageId}:${item.entry.action}:${item.entry.at}`)}
              <li data-status={statusOf(item.node)}>
                <i class="status-node" aria-hidden="true"></i>
                <div>
                  <a href={href(item.node)}>{item.node.title}</a>
                  <p class="muted">{t(ACTION_LABEL[item.entry.action])} · {item.entry.userName} · <time datetime={item.entry.at} title={moment(item.entry.at)}>{ago(item.entry.at)}</time></p>
                </div>
              </li>
            {/each}
          </ol>
        {/if}
      </LoadState>
    </section>

    <section aria-labelledby="attention-title">
      <h2 id="attention-title">{t('overview.attention')}</h2>
      {#if scheduled.length === 0 && drafts.length === 0}
        <p class="muted note">{t('overview.allPublished')}</p>
      {:else}
        <ol class="feed">
          {#each scheduled as node (node.id)}
            <li data-status="scheduled">
              <i class="status-node" aria-hidden="true"></i>
              <div>
                <a href={href(node)}>{node.title}</a>
                <p class="muted">{t('page.scheduledFor', { when: moment(node.publishAt!) })}</p>
              </div>
            </li>
          {/each}
          {#each drafts.slice(0, 6) as node (node.id)}
            <li data-status="draft">
              <i class="status-node" aria-hidden="true"></i>
              <div>
                <a href={href(node)}>{node.title}</a>
                <p class="muted">{t('pages.draft')}{#if trail(node.id).length > 0}{' · '}{trail(node.id).at(-1)}{/if}</p>
              </div>
            </li>
          {/each}
        </ol>
        {#if drafts.length > 0}
          <button type="button" class="link" aria-pressed={only.size === 1 && only.has('draft')} onclick={() => (only = new Set(['draft']))}>{t('overview.allDrafts')} ({drafts.length})</button>
        {/if}
      {/if}
    </section>
  </aside>
</div>
{/if}

<style>
  .views {
    display: inline-flex;
    gap: 0.125rem;
    padding: 0.1875rem;
    border-radius: calc(var(--radius) + 0.1875rem);
    background: var(--hover);
  }

  .views button {
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .views button:hover:not(:disabled, [aria-pressed='true']) {
    border: 0;
    background: var(--hover);
    box-shadow: none;
    color: var(--text);
  }

  .views button[aria-pressed='true'] {
    background: var(--selected);
    box-shadow: var(--shadow-s);
    color: var(--text);
  }

  .views :global(svg) {
    width: 0.95rem;
    height: 0.95rem;
  }

  /* Телефон: три вида и «Новая страница» не помещаются в строку — у видов остаются значки. */
  @media (width < 40rem) {
    .views .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* Сколько проблем нашла диагностика: тихий тёплый счётчик рядом с подписью вкладки. */
  .problems {
    min-width: 1.25rem;
    margin-left: 0.15rem;
    padding: 0 0.35rem;
    border-radius: 1rem;
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.6875rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    line-height: 1.25rem;
    text-align: center;
  }

  .table-view {
    padding-top: 1.75rem;
  }

  .table-view .map-head {
    margin-bottom: 1rem;
  }

  .table-hint {
    margin: 0 0 1rem;
    font-size: 0.8125rem;
  }

  /* Карта слева, справа — что менялось и что ждёт; узкая холстина — одной колонкой. */
  .overview {
    container: overview / inline-size;
    display: grid;
    padding-top: 1.75rem;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 21rem);
    gap: 2.5rem 3rem;
    align-items: start;
  }

  h2 {
    font-size: 1rem;
    font-weight: 650;
  }

  .map-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 2rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.75rem;
    padding-bottom: 1.25rem;
    border-bottom: 0.0625rem solid var(--line);
  }

  /* Ствол карты — сам сайт: его название и адрес. */
  .trunk {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: baseline;
    min-width: 0;
  }

  .trunk h2 {
    font-size: 1.625rem;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }

  .host {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.8125rem;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }

  .legend button,
  .bin {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: 999px;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .legend button:hover {
    background: var(--hover);
    color: var(--text);
  }

  .legend button[aria-pressed='true'] {
    border-color: color-mix(in oklab, var(--accent) 45%, var(--line));
    background: var(--accent-soft);
    color: var(--text);
  }

  .bin {
    border-style: dashed;
  }

  .num {
    color: var(--text);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }

  /* Ветки текут колонками, как карта сайта на листе: верхний уровень крупно, ниже — тише. */
  .branches {
    columns: 15rem;
    column-gap: 2.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Ветка с вложенными — отдельный абзац карты; одиночные страницы идут плотнее. */
  .branch {
    padding-bottom: 0.5rem;
    break-inside: avoid;
  }

  .branch:has(ol, .hidden-count) {
    padding: 0.5rem 0 1.25rem;
  }

  .branch ol {
    margin: 0.125rem 0 0 0.55rem;
    padding: 0 0 0 0.75rem;
    border-left: 0.0625rem solid var(--line);
    list-style: none;
  }

  .node {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    min-height: 2rem;
    margin-left: -0.5rem;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.9375rem;
    text-decoration: none;
    transition:
      background-color 120ms var(--ease),
      opacity 160ms var(--ease);
  }

  .node:hover {
    background: var(--hover);
  }

  .branch > .node {
    min-height: 2.5rem;
    font-size: 1.0625rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .branch > .node .status-node {
    width: 0.75rem;
    height: 0.75rem;
  }

  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .node[data-status='draft'] .title {
    color: var(--muted);
    font-style: italic;
  }

  .node[data-status='scheduled'] .title {
    color: var(--warn);
    font-style: italic;
  }

  .id {
    flex: none;
    margin-left: auto;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-weight: 400;
  }

  .node[data-dim] {
    opacity: 0.3;
  }

  .hidden-count {
    display: inline-block;
    margin: 0.125rem 0 0 1.3rem;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .empty {
    display: grid;
    gap: 1rem;
    justify-items: start;
    max-width: 32rem;
    padding: 1rem 0;
  }

  .empty p {
    margin: 0;
  }

  /* Правая колонка — не карточка: отделена линией и воздухом. */
  .side {
    display: grid;
    gap: 2.25rem;
    padding-left: 2rem;
    border-left: 0.0625rem solid var(--line);
  }

  /* Свой контейнер сетка запросить не может — обе части растягиваются на всю ширину. */
  @container overview (width < 56rem) {
    .map {
      grid-column: 1 / -1;
    }

    .side {
      grid-column: 1 / -1;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      padding-left: 0;
      border-left: 0;
    }
  }

  .side h2 {
    margin-bottom: 0.875rem;
  }

  .feed {
    display: grid;
    gap: 0.875rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .feed li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.65rem;
    align-items: start;
  }

  .feed .status-node {
    margin-top: 0.4rem;
  }

  .feed a {
    display: block;
    overflow: hidden;
    color: var(--text);
    font-weight: 550;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .feed a:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .feed p {
    margin: 0.1rem 0 0;
    font-size: 0.8125rem;
  }

  .note {
    margin: 0;
    font-size: 0.875rem;
  }

  .side .link {
    margin-top: 0.75rem;
  }
</style>
