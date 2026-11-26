<script lang="ts">
import { untrack } from 'svelte';
import { ROLE_LABELS, ROLES } from '#lib/analytics.ts';
import { api } from '#lib/api.ts';
import { moment } from '#lib/format.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import type { EventsPage, SetupView } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import EventBody from '../EventBody.svelte';
import EventFields from '../EventFields.svelte';
import Mark from '../Mark.svelte';
import { senderName } from '../names.ts';
import { setQuery } from '../query.ts';

let { setup }: { setup: SetupView } = $props();

// Фильтры и страница — в адресе: ?tab=events&type=…&role=payment&from=2027-01-01&before=…
const query = $derived(page.url.searchParams);
const filter = $derived({
  sender: query.get('sender') ?? '',
  type: query.get('type') ?? '',
  role: query.get('role') ?? '',
  from: query.get('from') ?? '',
  to: query.get('to') ?? '',
  test: query.get('test') ?? '',
});
const before = $derived(query.get('before') ?? '');
const filtered = $derived(Object.values(filter).some((_) => _ !== ''));

let result = $state<EventsPage | null>(null);
let busy = $state(false);
let opened = $state<number | null>(null);

const request = $derived(
  `/analytics/events?${new URLSearchParams(
    Object.entries({ ...filter, before, limit: '50' }).filter(
      ({ 1: value }) => value !== ''
    )
  )}`
);

const list = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<EventsPage>(wanted)
      .then((_) => void (wanted === request && (result = _)))
      .finally(() => (busy = false))
  ))(request)
);

$effect(() => void ((_: string) => untrack(() => list.retry()))(request));

// Коды типов без повторов: у двух отправителей может быть свой тип с одним кодом.
const types = $derived(
  [...new Map(setup.types.map((_) => [_.code, _.name])).entries()].toSorted(
    (a, b) => a[1].localeCompare(b[1])
  )
);

const set = (name: string, value: string) =>
  setQuery({ [name]: value || null, before: null });

const reset = () =>
  setQuery({
    sender: null,
    type: null,
    role: null,
    from: null,
    to: null,
    test: null,
    before: null,
  });

const cardHref = (subject: string) =>
  resolve('/(app)/stats/people/[subject]', { subject });
</script>

<div class="journal">
  <div class="filters" role="group" aria-label={t('eventLog.filters')}>
    <label>
      <span>{t('people.sender')}</span>
      <select value={filter.sender} onchange={(e) => set('sender', e.currentTarget.value)}>
        <option value="">{t('people.allSenders')}</option>
        {#each setup.senders as item (item.code)}<option value={item.code}>{item.name}</option>{/each}
      </select>
    </label>
    <label>
      <span>{t('eventLog.type')}</span>
      <select value={filter.type} onchange={(e) => set('type', e.currentTarget.value)}>
        <option value="">{t('eventLog.allTypes')}</option>
        {#each types as item (item[0])}<option value={item[0]}>{item[1]} · {item[0]}</option>{/each}
        {#if filter.type && !types.some((_) => _[0] === filter.type)}<option value={filter.type}>{filter.type}</option>{/if}
      </select>
    </label>
    <label>
      <span>{t('analytics.role')}</span>
      <select value={filter.role} onchange={(e) => set('role', e.currentTarget.value)}>
        <option value="">{t('eventLog.allRoles')}</option>
        {#each ROLES as role (role)}<option value={role}>{t(ROLE_LABELS[role])}</option>{/each}
      </select>
    </label>
    <label class="date">
      <span>{t('eventLog.from')}</span>
      <input type="date" value={filter.from} max={filter.to || undefined} onchange={(e) => set('from', e.currentTarget.value)} />
    </label>
    <label class="date">
      <span>{t('eventLog.to')}</span>
      <input type="date" value={filter.to} min={filter.from || undefined} onchange={(e) => set('to', e.currentTarget.value)} />
    </label>
    <label>
      <span>{t('eventLog.testFilter')}</span>
      <select value={filter.test} onchange={(e) => set('test', e.currentTarget.value)}>
        <option value="">{t('eventLog.testAll')}</option>
        <option value="0">{t('eventLog.testNo')}</option>
        <option value="1">{t('eventLog.testOnly')}</option>
      </select>
    </label>
    {#if filtered}
      <button type="button" class="ghost" onclick={reset}>{@html icons.close}{t('people.resetFilters')}</button>
    {/if}
  </div>
  <p class="help">{t('eventLog.hint')}</p>

  <LoadState load={list}>
    {#if result}
      {#if result.events.length === 0}
        <div class="none">
          <p>{before ? t('eventLog.noOlder') : filtered ? t('eventLog.nothing') : t('eventLog.empty')}</p>
          {#if before}<button type="button" onclick={() => setQuery({ before: null })}>{t('eventLog.newest')}</button>{/if}
        </div>
      {:else}
        <div class="scroll frame" class:busy>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('eventLog.at')}</th>
                <th scope="col">{t('eventLog.type')}</th>
                <th scope="col">{t('analytics.role')}</th>
                <th scope="col">{t('people.sender')}</th>
                <th scope="col">{t('people.subject')}</th>
                <th scope="col">{t('eventLog.fields')}</th>
                <th scope="col"><span class="sr-only">{t('analytics.body')}</span></th>
              </tr>
            </thead>
            <tbody>
              {#each result.events as event (event.seq)}
                <tr>
                  <td class="at">
                    {moment(event.at)}
                    <span class="marks">
                      {#if event.test}<Mark>{t('analytics.testMark')}</Mark>{/if}
                      {#if event.future}<Mark tone="warn" title={t('analytics.futureHint')}>{t('analytics.future')}</Mark>{/if}
                    </span>
                  </td>
                  <td class="type">
                    {#if event.name !== null}
                      {event.name} <small class="code muted">{event.type}</small>
                    {:else}
                      <span class="unknown">{t('analytics.unknownType', { code: event.type })}</span>
                    {/if}
                  </td>
                  <td class="role">{event.role ? t(ROLE_LABELS[event.role]) : '—'}</td>
                  <td class="sender">{senderName(setup, event.sender)}</td>
                  <td class="subject">{#if event.subject}<a class="code" href={cardHref(event.subject)}>{event.subject}</a>{:else}<span class="muted">—</span>{/if}</td>
                  <td class="fields"><EventFields fields={event.fields} /></td>
                  <td class="open"><button type="button" class="ghost" onclick={() => (opened = event.seq)}>{@html icons.code}{t('analytics.showBody')}</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if before || result.next !== null}
        <nav class="steps" aria-label={t('eventLog.pages')}>
          {#if before}<button type="button" onclick={() => setQuery({ before: null })}>{t('eventLog.newest')}</button>{/if}
          {#if result.next !== null}<button type="button" onclick={() => setQuery({ before: String(result!.next) }, true)}>{t('eventLog.older')}{@html icons.chevron}</button>{/if}
        </nav>
      {/if}
    {/if}
  </LoadState>
</div>

<EventBody seq={opened} onclose={() => (opened = null)} />

<style>
  .journal {
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

  /* Шесть фильтров — одной строкой на обычной холстине, на узкой переносятся. */
  .filters label {
    flex: 1 1 10rem;
    min-width: 10rem;
    max-width: 13rem;
  }

  /* «Все отправители» — самая длинная подпись выбора; даты уже других полей. */
  .filters label:first-child {
    flex-basis: 11.5rem;
    min-width: 11.5rem;
    max-width: 15rem;
  }

  .filters .date {
    flex-basis: 9rem;
    min-width: 9rem;
  }

  .filters span {
    font-size: 0.8125rem;
  }

  .help {
    margin: -0.25rem 0 0;
  }

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
    transition: opacity 150ms var(--ease);
  }

  .scroll.busy {
    opacity: 0.6;
  }

  table {
    min-width: 78rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    vertical-align: top;
  }

  td {
    font-size: 0.875rem;
  }

  .at {
    white-space: nowrap;
  }

  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.2rem;
  }

  .marks:empty {
    display: none;
  }

  /* Код типа и псевдоним не рвутся посреди слова, пока хватает места: колонки держат ширину. */
  .type {
    min-width: 10rem;
    max-width: 16rem;
    overflow-wrap: break-word;
  }

  .type small {
    display: block;
  }

  .unknown {
    color: var(--warn-text);
  }

  .subject {
    min-width: 9rem;
    max-width: 14rem;
    overflow-wrap: anywhere;
  }

  .role {
    min-width: 8rem;
  }

  .sender {
    min-width: 11.5rem;
  }

  .fields {
    min-width: 18rem;
  }

  .open {
    width: 1%;
    white-space: nowrap;
  }

  .open button {
    min-height: 2rem;
    padding: 0 0.6rem;
    font-size: 0.8125rem;
  }

  .open :global(svg) {
    width: 1rem;
    height: 1rem;
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
    padding: 1.25rem 0;
  }

  .none p {
    margin: 0;
    color: var(--muted);
  }
</style>
