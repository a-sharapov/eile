<script lang="ts">
import { untrack } from 'svelte';
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import { loadTree } from '#lib/tree.svelte.ts';
import type {
  ChangeSetSummary,
  ChangeSetView,
  ReviewChange,
  ReviewItem,
  ReviewSettings,
  ReviewValue,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import ShareLinksDialog from '#lib/ui/ShareLinksDialog.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

// Свойства страницы в сравнении — подписями редактора страницы.
const _LABELS: Readonly<Record<string, MessageKey>> = {
  title: 'page.title',
  alias: 'page.address',
  template: 'page.template',
  linkTo: 'page.linkTo',
  menuTitle: 'page.menuTitle',
  introText: 'page.introText',
  longTitle: 'page.longTitle',
  description: 'seo.description',
  socialImage: 'seo.socialImage',
  kind: 'page.kind',
  contentType: 'page.contentType',
  language: 'page.language',
  publishAt: 'page.publishAt',
  unpublishAt: 'page.unpublishAt',
  menuIndex: 'page.menuIndex',
  hiddenFromMenu: 'page.hiddenFromMenu',
  cacheable: 'page.cacheable',
  searchable: 'seo.searchable',
  translationOf: 'page.translationOf',
  published: 'proposals.published',
  trashed: 'proposals.trashed',
};

const _OPERATIONS: Readonly<Record<string, MessageKey>> = {
  created: 'proposals.opCreated',
  edited: 'proposals.opEdited',
  fields: 'proposals.opFields',
  moved: 'proposals.opMoved',
  published: 'proposals.opPublished',
  unpublished: 'proposals.opUnpublished',
  trashed: 'proposals.opTrashed',
  restored: 'proposals.opRestored',
  changed: 'proposals.opChanged',
};

const _STATUS: Readonly<Record<ChangeSetSummary['status'], MessageKey>> = {
  open: 'proposals.statusOpen',
  ready: 'proposals.statusReady',
  closed: 'proposals.statusClosed',
};

const _ELEMENTS: Readonly<Record<string, MessageKey>> = {
  template: 'proposals.elementTemplate',
  component: 'proposals.elementComponent',
  script: 'proposals.elementScript',
};

let settings = $state<ReviewSettings | null>(null);
let closed = $state(false);
let sets = $state<ChangeSetSummary[] | null>(null);
let view = $state<ChangeSetView | null>(null);
let chosen = $state<number[]>([]);
let overridden = $state<number[]>([]);
let busy = $state(false);
let homePage = $state<number | null>(null);
let share = $state<{ page: number; title: string } | null>(null);
let shareOpen = $state(false);

const admin = $derived(session.user?.role === 'admin');
const selectedId = $derived(Number(page.url.searchParams.get('set')) || null);
const base = resolve('/(app)/proposals');

const list = defineLoad(() =>
  Promise.all([
    api.get<ReviewSettings>('/review/settings'),
    api.get<ChangeSetSummary[]>(`/review/sets${closed ? '?closed=1' : ''}`),
  ]).then(({ 0: next, 1: found }) => ((settings = next), (sets = found)))
);

const detail = defineLoad(() =>
  selectedId === null
    ? Promise.resolve()
    : api
        .get<ChangeSetView>(`/review/sets/${selectedId}`)
        .then(
          (_) => (
            (view = _),
            (chosen = _.items
              .filter((item) => item.status === 'pending')
              .map((item) => item.id)),
            (overridden = [])
          )
        )
);

$effect(() => void ((_: boolean) => untrack(() => list.retry()))(closed));
$effect(
  () =>
    void ((_: number | null) => untrack(() => ((view = null), detail.retry())))(
      selectedId
    )
);
$effect(() => {
  void api
    .get<{ homePageId: number | null }>('/settings')
    .then((_) => (homePage = _.homePageId), failed);
});

const saveSettings = (input: Partial<ReviewSettings>) =>
  api
    .send<ReviewSettings>('PUT', '/review/settings', input)
    .then((_) => ((settings = _), notify(t('proposals.settingsSaved'))))
    .then(undefined, failed);

const titleOf = (set: ChangeSetSummary): string =>
  set.title || t('proposals.setTitle', { n: set.id });

const agentOf = (set: ChangeSetSummary): string =>
  set.agent.tokenName
    ? t('proposals.agentKey', {
        user: set.agent.userName,
        key: quoted(set.agent.tokenName),
      })
    : t('proposals.agentLocal', { user: set.agent.userName });

const shown = (value: ReviewValue | undefined): string =>
  value === undefined || value === null || value === ''
    ? '—'
    : value === true
      ? t('proposals.yes')
      : value === false
        ? t('proposals.no')
        : String(value);

const labelOf = (change: ReviewChange): string =>
  change.label ?? (_LABELS[change.key] ? t(_LABELS[change.key]!) : change.key);

const conflictText = (item: ReviewItem): string =>
  item.conflicts
    .map((key) =>
      key === 'missing'
        ? t('proposals.conflictMissing')
        : key === 'source'
          ? t('proposals.source')
          : key.startsWith('fields.')
            ? (item.fields.find((_) => _.key === key.slice(7))?.label ??
              key.slice(7))
            : _LABELS[key]
              ? t(_LABELS[key]!)
              : key
    )
    .join(', ');

const statusText = (item: ReviewItem): string =>
  ({
    pending: () => t('proposals.statusPending'),
    accepted: () => t('proposals.statusAccepted', { who: item.decidedBy }),
    rejected: () => t('proposals.statusRejected', { who: item.decidedBy }),
    withdrawn: () => t('proposals.statusWithdrawn'),
  })[item.status]();

const pending = $derived(
  view?.items.filter((_) => _.status === 'pending') ?? []
);

const toggle = (list: number[], id: number, on: boolean): number[] =>
  on ? [...new Set([...list, id])] : list.filter((_) => _ !== id);

const previewUrl = (pageId: number): string =>
  api.url(`/review/sets/${view!.id}/preview/${pageId}`);

const decide = (action: 'accept' | 'reject', items: number[] | null) =>
  ask(
    action === 'accept'
      ? {
          title: t('proposals.acceptTitle'),
          body: t('proposals.acceptBody', { user: view!.agent.userName }),
          confirm: t('proposals.acceptConfirm'),
        }
      : {
          title: t('proposals.rejectTitle'),
          body: t('proposals.rejectBody'),
          confirm: t('proposals.rejectConfirm'),
          tone: 'danger',
        }
  ).then(
    (yes): unknown =>
      yes &&
      ((busy = true),
      api
        .send<ChangeSetView>('POST', `/review/sets/${view!.id}/${action}`, {
          ...(items ? { items } : {}),
          override: overridden,
        })
        .then(
          (_) => (
            (view = _),
            (chosen = []),
            (overridden = []),
            notify(
              t(
                action === 'accept'
                  ? 'proposals.acceptedNotice'
                  : 'proposals.rejectedNotice'
              )
            ),
            list.retry(),
            // Принятые страницы — в дереве сразу: новые, перенесённые, переименованные.
            void (action === 'accept' && loadTree().then(undefined, failed))
          )
        )
        .then(undefined, (error) => (failed(error), detail.retry()))
        .finally(() => (busy = false)))
  );

const openShare = (pageId: number, title: string) => (
  (share = { page: pageId, title }), (shareOpen = true)
);
</script>

<svelte:head><title>{t('proposals.title')} — {t('app.name')}</title></svelte:head>

{#snippet diff(lines: NonNullable<ReviewItem['content']>)}
  <div class="diff frame">
    <p class="legend" aria-hidden="true"><span class="key old">− {t('proposals.diffNow')}</span><span class="key new">+ {t('proposals.diffProposed')}</span></p>
    {#each lines as line, index (index)}
      {#if line.kind === 'skip'}
        <p class="line skip"><span></span><span>{t('proposals.unchanged')}: {line.count}</span></p>
      {:else}
        <p class="line {line.kind}">
          <span class="sign" aria-hidden="true">{line.kind === 'old' ? '−' : line.kind === 'new' ? '+' : ''}</span>
          <span class="sr-only">{line.kind === 'old' ? t('proposals.diffNow') : line.kind === 'new' ? t('proposals.diffProposed') : ''}</span>
          <span class="text">{#each line.pieces as piece, i (i)}{#if piece.changed && line.kind !== 'same'}<mark>{piece.text}</mark>{:else}{piece.text}{/if}{/each}</span>
        </p>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet changesTable(rows: ReviewChange[])}
  <div class="frame">
    <table>
      <thead>
        <tr><th scope="col">{t('proposals.what')}</th><th scope="col">{t('proposals.now')}</th><th scope="col">{t('proposals.proposed')}</th></tr>
      </thead>
      <tbody>
        {#each rows as row (row.key)}
          <tr>
            <th scope="row">{labelOf(row)}</th>
            <td class="old" data-label={t('proposals.now')}>{shown(row.before)}{#if row.was !== undefined}<small class="was">{t('proposals.was', { value: shown(row.was) })}</small>{/if}</td>
            <td class="new" data-label={t('proposals.proposed')}>{shown(row.after)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

{#snippet item(entry: ReviewItem)}
  {@const open = entry.status === 'pending' && view?.status !== 'closed'}
  <article class="item card" class:conflicted={entry.conflicts.length > 0} aria-labelledby={`item-${entry.id}`}>
    <header>
      {#if open}
        <input type="checkbox" checked={chosen.includes(entry.id)} aria-label={t('proposals.select', { name: entry.target.kind === 'page' ? entry.target.title : entry.target.name })} onchange={(e) => (chosen = toggle(chosen, entry.id, e.currentTarget.checked))} />
      {/if}
      <span class="glyph" aria-hidden="true">{@html entry.target.kind === 'page' ? icons.file : entry.target.element === 'template' ? icons.template : entry.target.element === 'script' ? icons.fileScript : icons.component}</span>
      <div class="what">
        <h3 id={`item-${entry.id}`}>
          {#if entry.target.kind === 'page'}
            {#if entry.target.exists}
              <a href={resolve('/(app)/pages/[id]', { id: String(entry.target.id) })}>{entry.target.title}</a>
            {:else}
              {entry.target.title}
            {/if}
          {:else}
            <span class="kind">{t(_ELEMENTS[entry.target.element]!)}</span>
            <a class="code" href={resolve('/(app)/elements/[kind]/[name]', { kind: entry.target.element, name: entry.target.name })}>{entry.target.name}</a>
          {/if}
        </h3>
        <p class="muted small">
          {#if entry.target.kind === 'page'}
            {entry.target.exists ? entry.target.path || `#${entry.target.id}` : `${t('proposals.newPage')} · #${entry.target.id}`}
          {/if}
        </p>
      </div>
      <ul class="chips" aria-label={t('proposals.what')}>
        {#each entry.operations as operation (operation)}
          <li class="chip">{_OPERATIONS[operation] ? t(_OPERATIONS[operation]!) : operation}</li>
        {/each}
        <li class="chip status" data-status={entry.status}>{statusText(entry)}</li>
      </ul>
    </header>

    {#if entry.conflicts.length > 0}
      <div class="conflict" role="note">
        {@html icons.alert}
        <p>{t('proposals.conflict', { what: conflictText(entry) })}</p>
        {#if open}
          <label class="override"><input type="checkbox" checked={overridden.includes(entry.id)} onchange={(e) => (overridden = toggle(overridden, entry.id, e.currentTarget.checked))} />{t('proposals.override')}</label>
        {/if}
      </div>
    {/if}
    {#if entry.error}
      <p class="error" role="note">{t('proposals.failed', { detail: entry.error })}</p>
    {/if}

    {#if entry.changes.length > 0}{@render changesTable(entry.changes)}{/if}
    {#if entry.fields.length > 0}
      <h4>{t('page.fields')}</h4>
      {@render changesTable(entry.fields)}
    {/if}
    {#if entry.tree}
      <p class="tree">
        <span class="muted">{t('proposals.tree')}:</span>
        <span class="old">{entry.tree.before?.title ?? t('proposals.topLevel')}</span>
        <span aria-hidden="true">→</span>
        <span class="new">{entry.tree.after?.title ?? t('proposals.topLevel')}</span>
      </p>
    {/if}
    {#if entry.content}
      <h4>{t('page.content')}</h4>
      {@render diff(entry.content)}
    {/if}
    {#if entry.source}
      <h4>{t('proposals.source')}</h4>
      {#if entry.source.length === 0}
        <p class="muted">{t('proposals.sameSource')}</p>
      {:else}
        {@render diff(entry.source)}
      {/if}
    {/if}

    {#if open}
      <div class="item-actions">
        {#if entry.target.kind === 'page'}
          <a class="button" href={previewUrl(entry.target.id)} target="_blank" rel="noopener">{@html icons.eye}{t('proposals.preview')}</a>
          <button type="button" onclick={() => entry.target.kind === 'page' && openShare(entry.target.id, entry.target.title)}>{@html icons.share}{t('proposals.share')}</button>
        {:else if entry.target.element !== 'script' && view && view.pages.length === 0 && homePage !== null}
          <a class="button" href={previewUrl(homePage)} target="_blank" rel="noopener">{@html icons.eye}{t('proposals.previewOn')} #{homePage}</a>
          <button type="button" onclick={() => openShare(homePage!, `#${homePage}`)}>{@html icons.share}{t('proposals.share')}</button>
        {/if}
      </div>
    {/if}
  </article>
{/snippet}

{#if selectedId === null}
  {#snippet listActions()}
    <button type="button" class="button" onclick={() => list.retry()}>{@html icons.refresh}{t('stats.refresh')}</button>
  {/snippet}
  <PageHeader title={t('proposals.title')} crumbs={[]} actions={listActions} />
  <div class="page">
    <p class="intro help">{t('proposals.intro')}</p>

    {#if settings}
      <section class="card settings" aria-labelledby="review-settings">
        <h2 id="review-settings">{t('proposals.settings')}</h2>
        <label class="switch">
          <input type="checkbox" checked={settings.agents} disabled={!admin} onchange={(e) => saveSettings({ agents: e.currentTarget.checked })} />
          <span>
            <strong>{t('proposals.allAgents')}</strong>
            <small class="muted">{t('proposals.allAgentsHint')}</small>
          </span>
        </label>
        <label class="days">
          <span>{t('proposals.linkDays')}</span>
          <input type="number" min="1" max="90" value={settings.linkDays} disabled={!admin} onchange={(e) => saveSettings({ linkDays: Number(e.currentTarget.value) })} />
        </label>
      </section>
    {/if}

    <div class="segments" role="group" aria-label={t('proposals.title')}>
      <button type="button" aria-pressed={!closed} onclick={() => (closed = false)}>{t('proposals.pendingTab')}</button>
      <button type="button" aria-pressed={closed} onclick={() => (closed = true)}>{t('proposals.closedTab')}</button>
    </div>

    <LoadState load={list}>
      {#if sets !== null}
        {#if sets.length === 0}
          <p class="muted empty">{closed ? t('proposals.emptyClosed') : settings?.agents === false ? `${t('proposals.empty')} ${t('proposals.emptyOff')}` : t('proposals.empty')}</p>
        {:else}
          <ul class="sets">
            {#each sets as set (set.id)}
              <li>
                <a class="set card" href={`${base}?set=${set.id}`}>
                  <span class="set-head">
                    <strong>{titleOf(set)}</strong>
                    <span class="chip status" data-status={set.status}>{t(_STATUS[set.status])}</span>
                  </span>
                  <span class="muted small">{agentOf(set)} · {t('proposals.updated', { when: ago(set.updatedAt) })}</span>
                  <span class="counts small">
                    {#if set.counts.pending > 0}<span>{tn('proposals.pendingCount', set.counts.pending)}</span>{/if}
                    {#if set.counts.accepted > 0}<span>{tn('proposals.acceptedCount', set.counts.accepted)}</span>{/if}
                    {#if set.counts.rejected > 0}<span>{tn('proposals.rejectedCount', set.counts.rejected)}</span>{/if}
                    {#if set.counts.withdrawn > 0}<span>{tn('proposals.withdrawnCount', set.counts.withdrawn)}</span>{/if}
                    {#if set.conflicts > 0}<span class="warn">{@html icons.alert}{tn('proposals.conflictCount', set.conflicts)}</span>{/if}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </LoadState>
  </div>
{:else}
  {#snippet detailActions()}
    {#if view && pending.length > 0}
      <button type="button" class="danger" disabled={busy || chosen.length === 0} onclick={() => decide('reject', chosen)}>{t('proposals.rejectSelected')}</button>
      <button type="button" disabled={busy || chosen.length === 0} onclick={() => decide('accept', chosen)}>{t('proposals.acceptSelected')}</button>
      <button type="button" class="primary" disabled={busy} onclick={() => decide('accept', null)}>{@html icons.check}{t('proposals.acceptAll')}</button>
    {/if}
  {/snippet}
  <PageHeader title={view ? titleOf(view) : t('proposals.title')} crumbs={[{ label: t('proposals.title'), href: base }]} actions={detailActions} />
  <div class="page">
    <LoadState load={detail}>
      {#if view}
        <section class="summary card" aria-label={t('proposals.description')}>
          <p class="facts">
            <span class="chip status" data-status={view.status}>{t(_STATUS[view.status])}</span>
            <span>{agentOf(view)}</span>
            <span class="muted">{t('proposals.updated', { when: moment(view.updatedAt) })}</span>
            {#if view.conflicts > 0}<span class="warn">{@html icons.alert}{tn('proposals.conflictCount', view.conflicts)}</span>{/if}
          </p>
          {#if view.description}
            <blockquote class="description">{view.description}</blockquote>
            <p class="muted small">{t('proposals.untrusted')}</p>
          {:else}
            <p class="muted">{t('proposals.noDescription')}</p>
          {/if}
          {#if pending.length > 0}
            <div class="bulk">
              <label><input type="checkbox" checked={chosen.length === pending.length} onchange={(e) => (chosen = e.currentTarget.checked ? pending.map((_) => _.id) : [])} />{t('proposals.selectAll')}</label>
              <button type="button" class="danger" disabled={busy} onclick={() => decide('reject', null)}>{t('proposals.rejectAll')}</button>
            </div>
            <p class="help small">{t('proposals.previewLimits')}</p>
          {/if}
        </section>
        <div class="items">
          {#each view.items as entry (entry.id)}
            {@render item(entry)}
          {/each}
        </div>
      {/if}
    </LoadState>
  </div>
  {#if share && view}
    <ShareLinksDialog bind:open={shareOpen} page={share.page} changeSet={view.id} title={share.title} days={settings?.linkDays ?? 7} />
  {/if}
{/if}

<style>
  .page {
    display: grid;
    gap: 1.25rem;
    container-type: inline-size;
    max-width: 64rem;
  }

  .intro {
    max-width: 46rem;
    margin: 0;
  }

  .card {
    padding: 1rem 1.25rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .settings {
    display: grid;
    gap: 0.9rem;
  }

  .settings h2 {
    font-size: 1rem;
  }

  .switch {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .switch input {
    margin-top: 0.2rem;
  }

  .switch span {
    display: grid;
    gap: 0.15rem;
  }

  .days {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .days input {
    width: 5rem;
  }

  .segments {
    display: inline-flex;
    justify-self: start;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .segments button {
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .segments button[aria-pressed='true'] {
    background: var(--surface);
    box-shadow: var(--shadow-s);
  }

  .empty {
    margin: 0;
  }

  .sets {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .set {
    display: grid;
    gap: 0.3rem;
    color: var(--text);
    text-decoration: none;
  }

  .set:hover {
    background: var(--hover);
  }

  .set-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }

  .counts,
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.9rem;
    align-items: center;
    margin: 0;
  }

  .warn {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
    color: var(--warn);
  }

  .warn :global(svg),
  .conflict :global(svg) {
    width: 1rem;
    height: 1rem;
    flex: none;
  }

  .small {
    font-size: 0.875rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.05rem 0.5rem;
    border: 0.0625rem solid var(--line);
    border-radius: 999rem;
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 550;
    white-space: nowrap;
  }

  .chip.status[data-status='ready'],
  .chip.status[data-status='pending'] {
    border-color: color-mix(in oklch, var(--accent) 40%, var(--line));
    background: color-mix(in oklch, var(--accent-soft) 60%, var(--surface));
    color: var(--text);
  }

  .chip.status[data-status='accepted'] {
    border-color: color-mix(in oklch, var(--ok) 35%, var(--line));
    background: var(--ok-soft);
    color: var(--text);
  }

  .chip.status[data-status='rejected'] {
    border-color: color-mix(in oklch, var(--danger) 35%, var(--line));
    background: var(--danger-soft);
    color: var(--text);
  }

  .summary {
    display: grid;
    gap: 0.75rem;
  }

  .summary p,
  .item p {
    margin: 0;
  }

  .description {
    margin: 0;
    padding: 0.5rem 0.9rem;
    border-left: 0.2rem solid var(--line);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .bulk label {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
  }

  .help {
    margin: 0;
  }

  .items {
    display: grid;
    gap: 1rem;
  }

  .item {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
  }

  .item.conflicted {
    border-color: color-mix(in oklch, var(--warn) 45%, var(--line));
  }

  .item header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: flex-start;
  }

  .item header > input {
    margin-top: 0.3rem;
  }

  .glyph :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.1rem;
    color: var(--muted);
  }

  .what {
    flex: 1;
    min-width: 12rem;
  }

  .what h3 {
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .what p {
    margin: 0.1rem 0 0;
    overflow-wrap: anywhere;
  }

  .kind {
    margin-right: 0.4rem;
    color: var(--muted);
    font-weight: 450;
  }

  .code {
    font-family: var(--mono);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .conflict {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: flex-start;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklch, var(--warn) 35%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--text);
    font-size: 0.875rem;
  }

  .conflict p {
    flex: 1;
    min-width: 14rem;
    margin: 0;
  }

  .override {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    font-weight: 550;
  }

  .error {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    background: var(--danger-soft);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  h4 {
    margin: 0;
    font-size: 0.875rem;
  }

  .frame {
    overflow: hidden;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: 0.5rem 0.9rem;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  thead th {
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  tbody tr + tr {
    border-top: 0.0625rem solid var(--line);
  }

  tbody th {
    width: 28%;
    font-weight: 550;
  }

  td.old {
    color: var(--muted);
  }

  .was {
    display: block;
    margin-top: 0.2rem;
    color: var(--warn);
  }

  .tree {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.875rem;
  }

  .tree .old {
    color: var(--muted);
    text-decoration: line-through;
  }

  .tree .new {
    font-weight: 550;
  }

  .diff {
    max-height: 32rem;
    overflow: auto;
    padding: 0.35rem 0;
    font-family: var(--mono);
    font-size: 0.8125rem;
    line-height: 1.55;
  }

  .line {
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr);
    margin: 0;
    padding: 0.1rem 0.9rem 0.1rem 0;
  }

  .legend {
    display: flex;
    gap: 1rem;
    margin: 0;
    padding: 0.25rem 0.9rem 0.5rem 1.75rem;
    color: var(--muted);
    font-family: var(--font);
    font-size: 0.75rem;
  }

  .key.old {
    color: var(--danger);
  }

  .key.new {
    color: var(--ok);
  }

  .sign {
    color: var(--muted);
    text-align: center;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .line.old {
    background: color-mix(in oklch, var(--danger) 7%, var(--surface));
  }

  .line.new {
    background: color-mix(in oklch, var(--ok) 8%, var(--surface));
  }

  .line.old .sign {
    color: var(--danger);
  }

  .line.new .sign {
    color: var(--ok);
  }

  mark {
    border-radius: 0.2rem;
    color: inherit;
  }

  .line.old mark {
    background: color-mix(in oklch, var(--danger) 22%, transparent);
    text-decoration: line-through;
    text-decoration-color: color-mix(in oklch, var(--danger) 60%, transparent);
  }

  .line.new mark {
    background: color-mix(in oklch, var(--ok) 24%, transparent);
  }

  .skip {
    color: var(--muted);
    font-family: var(--font);
    font-size: 0.75rem;
  }

  .item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  @container (width < 34rem) {
    thead {
      display: none;
    }

    tr,
    th,
    td {
      display: block;
    }

    tbody th {
      width: auto;
      padding-bottom: 0.15rem;
    }

    td {
      padding-top: 0.15rem;
    }

    td::before {
      display: block;
      color: var(--muted);
      font-size: 0.75rem;
      content: attr(data-label);
    }
  }
</style>
