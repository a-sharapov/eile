<script lang="ts">
import { untrack } from 'svelte';
import { ITEM_LIMITS, length } from '#lib/analytics.ts';
import { api } from '#lib/api.ts';
import { ask, askValue } from '#lib/dialog.svelte.ts';
import { moment } from '#lib/format.ts';
import { number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { definePager, type Pager as PagerState } from '#lib/pager.svelte.ts';
import { pageOfIndex } from '#lib/pager.ts';
import type { LabelsPage, RegisteredLabel, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import Pager from '#lib/ui/Pager.svelte';
import { page } from '$app/state';
import Mark from '../Mark.svelte';
import { linkName, partsText, senderName } from '../names.ts';
import { setQuery } from '../query.ts';

// Реестр выданных меток: метка, название, части, переход, кто и когда. Поиск — по началу метки или слова
// названия; переименовать, удалить с подтверждением. Удалённая метка в ссылках работает, в отчётах станет
// «не из реестра».
let { setup, editable }: { setup: SetupView; editable: boolean } = $props();

const query = $derived(page.url.searchParams);
const q = $derived(query.get('q') ?? '');
const sender = $derived(query.get('sender') ?? '');
const pageNo = $derived(
  Math.max(1, Math.trunc(Number(query.get('page'))) || 1)
);

const sizes = definePager('analytics.labels', 50, [25, 50, 100, 200]);
const pager: PagerState = {
  sizes: sizes.sizes,
  get page() {
    return pageNo;
  },
  set page(next: number) {
    void setQuery({ page: next > 1 ? String(next) : null }, true);
  },
  get size() {
    return sizes.size;
  },
  set size(next: number) {
    const first = (pageNo - 1) * sizes.size;
    sizes.size = next;
    void setQuery({
      page: ((n) => (n > 1 ? String(n) : null))(pageOfIndex(first, next)),
    });
  },
};

let result = $state<LabelsPage | null>(null);
let busy = $state(false);
let search = $state(untrack(() => q));

const request = $derived(
  `/analytics/labels?${new URLSearchParams(
    Object.entries({
      q,
      sender,
      offset: String((pageNo - 1) * sizes.size),
      limit: String(sizes.size),
    }).filter(({ 1: value }) => value !== '')
  )}`
);

const list = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<LabelsPage>(wanted)
      .then((_) => void (wanted === request && (result = _)))
      .finally(() => (busy = false))
  ))(request)
);
$effect(() => void ((_: string) => untrack(() => list.retry()))(request));

let timer = 0;
const typed = () => {
  clearTimeout(timer);
  timer = window.setTimeout(
    () => void setQuery({ q: search.trim() || null, page: null }),
    300
  );
};

// Адрес сменился снаружи («Назад», ссылка) — поле поиска следует за ним.
$effect(() => {
  const wanted = q;
  untrack(() => void (search.trim() !== wanted && (search = wanted)));
});

const senders = $derived(
  [...new Set(setup.schemas.map((_) => _.sender))].map((code) => ({
    code,
    name: senderName(setup, code),
  }))
);

const path = (label: RegisteredLabel) =>
  `/analytics/labels/${encodeURIComponent(label.sender)}/${encodeURIComponent(label.label)}`;

const rename = (label: RegisteredLabel) =>
  askValue({
    title: t('labels.renameTitle'),
    confirm: t('labels.rename'),
    items: [label.label],
    input: {
      label: t('labels.name'),
      type: 'text',
      value: label.name,
      validate: (value) =>
        length(value) < 1 || length(value) > ITEM_LIMITS.name
          ? t('setupForm.nameHint', { n: ITEM_LIMITS.name })
          : null,
    },
  }).then(
    (name) =>
      void (
        name !== null &&
        name.trim() !== label.name &&
        api
          .send('PUT', path(label), { name: name.trim() })
          .then(() => (notify(t('labels.renamed')), list.retry()))
          .then(undefined, failed)
      )
  );

const remove = (label: RegisteredLabel) =>
  ask({
    title: t('labels.removeTitle'),
    body: t('labels.removeBody'),
    items: [`${label.label} — ${label.name}`],
    confirm: t('labels.remove'),
    tone: 'danger',
  }).then(
    (yes) =>
      void (
        yes &&
        api
          .send('DELETE', path(label))
          .then(() => (notify(t('labels.removed')), list.retry()))
          .then(undefined, failed)
      )
  );

const authorOf = (label: RegisteredLabel): string =>
  label.author === null ? t('labels.authorUnknown') : label.author.name;
</script>

<div class="registry">
  <div class="filters">
    <label class="grow">
      <span>{t('labels.search')}</span>
      <input type="text" role="searchbox" bind:value={search} oninput={typed} placeholder={t('labels.searchPlaceholder')} spellcheck="false" autocomplete="off" />
    </label>
    {#if senders.length > 1}
      <label>
        <span>{t('people.sender')}</span>
        <select value={sender} onchange={(e) => setQuery({ sender: e.currentTarget.value || null, page: null })}>
          <option value="">{t('people.allSenders')}</option>
          {#each senders as item (item.code)}<option value={item.code}>{item.name}</option>{/each}
        </select>
      </label>
    {/if}
  </div>

  <LoadState load={list}>
    {#if result}
      {#if result.total === 0}
        <div class="frame empty">
          <p>{q || sender ? t('labels.registryNone') : t('labels.registryEmpty')}</p>
          {#if !q && !sender}<a class="button" href="?tab=generator">{t('labels.toGenerator')}</a>{/if}
        </div>
      {:else}
        <p class="count" aria-live="polite">{tn('labels.total', result.total)}</p>
        <div class="scroll frame" class:busy>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('labels.label')}</th>
                <th scope="col">{t('labels.name')}</th>
                <th scope="col">{t('labels.parts')}</th>
                <th scope="col">{t('labels.link')}</th>
                <th scope="col">{t('labels.issuedBy')}</th>
                {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
              </tr>
            </thead>
            <tbody>
              {#each result.labels as label (`${label.sender}/${label.label}`)}
                <tr>
                  <td class="label">
                    <code>{label.label}</code>
                    {#if senders.length > 1}<small class="muted">{senderName(setup, label.sender)}</small>{/if}
                  </td>
                  <td class="name">{label.name}</td>
                  <td class="parts">{partsText(setup, label.parts)}</td>
                  <td>{label.link === null ? '—' : linkName(setup, label.link)}</td>
                  <td class="who">
                    <span>{authorOf(label)}</span>
                    {#if label.author?.agent}<Mark>{t('labels.agentMark')}</Mark>{/if}
                    <small class="muted">{moment(label.createdAt)}</small>
                  </td>
                  {#if editable}
                    <td class="row-actions">
                      <!-- Значками с подписью для читалки и подсказкой: таблица меток широкая и на 1440. -->
                      <button type="button" class="ghost icon" title={t('labels.rename')} onclick={() => rename(label)}>{@html icons.pencil}<span class="sr-only">{t('labels.rename')}: {label.label}</span></button>
                      <button type="button" class="ghost icon danger" title={t('labels.remove')} onclick={() => remove(label)}>{@html icons.trash}<span class="sr-only">{t('labels.remove')}: {label.label}</span></button>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pager {pager} total={result.total} />
        <p class="help">{t('labels.registryHint', { n: number(10_000) })}</p>
      {/if}
    {/if}
  </LoadState>
</div>

<style>
  .registry {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: end;
  }

  .filters label {
    flex: 0 1 14rem;
    min-width: 9rem;
  }

  .filters .grow {
    flex: 1 1 16rem;
    max-width: 26rem;
  }

  .filters span {
    font-size: 0.8125rem;
  }

  .count {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
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
    min-width: 54rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  .label {
    min-width: 14rem;
    max-width: 22rem;
  }

  .label code {
    display: block;
    overflow-wrap: anywhere;
  }

  .name {
    min-width: 10rem;
    overflow-wrap: break-word;
  }

  .parts {
    min-width: 14rem;
    overflow-wrap: break-word;
  }

  .who {
    min-width: 10rem;
  }

  .who small,
  .label small {
    display: block;
    font-size: 0.75rem;
  }

  .who :global(.mark) {
    margin-left: 0.3rem;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions button {
    width: 2rem;
    min-height: 2rem;
    padding: 0;
  }

  .row-actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .empty {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }

  .help {
    margin: 0;
  }
</style>
