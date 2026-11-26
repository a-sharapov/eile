<script lang="ts">
import { untrack } from 'svelte';
import { STATE_LABELS, statesOf } from '#lib/analytics.ts';
import {
  dayIn,
  fromReport,
  PEOPLE_REPORT_KEYS,
  peopleReportEntries,
} from '#lib/analytics-reports.ts';
import { api } from '#lib/api.ts';
import { ago, moment } from '#lib/format.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { amounts } from '#lib/money.ts';
import { definePager, type Pager as PagerState } from '#lib/pager.svelte.ts';
import { pageOfIndex } from '#lib/pager.ts';
import type {
  IntakeSummary,
  PeoplePage,
  PersonListed,
  SetupView,
} from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import Pager from '#lib/ui/Pager.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import Mark from '../Mark.svelte';
import { acquisitionText, milestoneName, senderName } from '../names.ts';
import { setQuery } from '../query.ts';
import ReportBar from '../ReportBar.svelte';
import StateMark from '../StateMark.svelte';
import PeopleExport from './PeopleExport.svelte';

let {
  setup,
  intake,
  editable,
}: {
  setup: SetupView;
  intake: IntakeSummary;
  /** Есть право analytics.edit: пустой экран ведёт к выключателю и отправителям. */
  editable: boolean;
} = $props();

// Фильтры и страница — в адресе: ?state=customer&sender=…&q=u_1&test=1&page=3. Пришли из отчёта или воронки —
// там же его период, фильтры, веха или шаг воронки: список — те же люди, что в строке отчёта.
const query = $derived(page.url.searchParams);
const reported = $derived(fromReport(query));
const chosen = $derived(query.get('state') ?? '');
const sender = $derived(query.get('sender') ?? '');
const q = $derived(query.get('q') ?? '');
const test = $derived(query.get('test') === '1');
// Люди, чьи события несли разные первые касания (из окна «Первое касание неизменно» в «Качестве»).
const conflict = $derived(query.get('firstTouchConflict') === '1');
const pageNo = $derived(
  Math.max(1, Math.trunc(Number(query.get('page'))) || 1)
);
const filtered = $derived(
  chosen !== '' || sender !== '' || q !== '' || conflict || reported
);

// Сколько строк показывать, помнит браузер; номер страницы — адрес.
const sizes = definePager('analytics.people', 50, [25, 50, 100, 200]);
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

let result = $state<PeoplePage | null>(null);
let busy = $state(false);
let search = $state(untrack(() => q));
let listTop = $state<HTMLElement>();

// Фильтры списка и параметры отчёта без страницы: их же берёт выгрузка CSV.
const searchEntries = $derived(
  Object.entries({
    state: chosen,
    sender,
    q,
    test: test ? '1' : '',
    firstTouchConflict: conflict ? '1' : '',
  })
    .filter(({ 1: value }) => value !== '')
    .concat(peopleReportEntries(query))
);
const request = $derived(
  `/analytics/people?${new URLSearchParams([
    ...searchEntries,
    ['offset', String((pageNo - 1) * sizes.size)],
    ['limit', String(sizes.size)],
  ])}`
);
const exportPeriod = $derived(
  query.get('from') && query.get('to')
    ? { from: query.get('from')!, to: query.get('to')! }
    : null
);

const list = defineLoad(() =>
  ((wanted) => (
    (busy = true),
    api
      .get<PeoplePage>(wanted)
      .then((_) => void (wanted === request && (result = _)))
      .finally(() => (busy = false))
  ))(request)
);

$effect(() => void ((_: string) => untrack(() => list.retry()))(request));

// Пока люди пересчитываются по новой настройке, список сам обновляется раз в три секунды.
$effect(() => {
  const waiting = (result?.stale ?? 0) > 0;
  const timer = waiting ? setTimeout(() => void list.retry(), 3000) : 0;
  return () => clearTimeout(timer);
});

// Поиск по началу псевдонима — с паузой, с первой страницы.
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

const states = $derived(statesOf(setup));

// Сбросить — и фильтры списка, и параметры отчёта, из которого пришли.
const reset = () => (
  (search = ''),
  setQuery({
    state: null,
    sender: null,
    q: null,
    firstTouchConflict: null,
    page: null,
    ...Object.fromEntries(
      [
        ...PEOPLE_REPORT_KEYS,
        ...peopleReportEntries(query).map((_) => _[0]),
      ].map((_) => [_, null])
    ),
  })
);

// Вехи сайта — столбцом: достигнутые названиями и «2 из 3» по вехам не в архиве.
const milestones = $derived(
  setup.milestones.filter((_) => _.archivedAt === null)
);
const reachedOf = (person: PersonListed) =>
  milestones.filter((_) => person.milestones[_.code]?.state === 'reached');

const toTop = () =>
  void (
    listTop &&
    listTop.getBoundingClientRect().top < 0 &&
    listTop.scrollIntoView({ block: 'start' })
  );

const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
const sendersHref = `${resolve('/(app)/stats/setup')}?tab=senders`;
const cardHref = (subject: string) =>
  resolve('/(app)/stats/people/[subject]', { subject });

// Почему пусто: приём выключен, событий ещё не было, люди пересчитываются, под фильтр никто не подошёл или
// есть только тестовые.
const empty = $derived(
  result === null || result.people.length > 0
    ? null
    : intake.lastAt === null
      ? intake.enabled
        ? 'noEvents'
        : 'off'
      : result.stale > 0
        ? 'stale'
        : filtered
          ? 'filtered'
          : 'testOnly'
);
</script>

<div class="people">
  <div class="filters" role="group" aria-label={t('people.filters')}>
    <label>
      <span>{t('people.state')}</span>
      <select value={chosen} onchange={(e) => setQuery({ state: e.currentTarget.value || null, page: null })}>
        <option value="">{t('people.allStates')}</option>
        {#each states as item (item)}<option value={item}>{t(STATE_LABELS[item])}</option>{/each}
      </select>
    </label>
    <label>
      <span>{t('people.sender')}</span>
      <select value={sender} onchange={(e) => setQuery({ sender: e.currentTarget.value || null, page: null })}>
        <option value="">{t('people.allSenders')}</option>
        {#each setup.senders as item (item.code)}<option value={item.code}>{item.name}</option>{/each}
      </select>
    </label>
    <label class="grow">
      <span>{t('people.subjectStart')}</span>
      <input type="text" role="searchbox" class="code" bind:value={search} oninput={typed} placeholder="u_3b9e" spellcheck="false" autocomplete="off" />
    </label>
    <label class="check">
      <input type="checkbox" checked={test} onchange={(e) => setQuery({ test: e.currentTarget.checked ? '1' : null, page: null })} />
      {t('people.showTest')}
    </label>
    <label class="check">
      <input type="checkbox" checked={conflict} onchange={(e) => setQuery({ firstTouchConflict: e.currentTarget.checked ? '1' : null, page: null })} />
      {t('people.touchConflicts')}
    </label>
    {#if filtered}
      <button type="button" class="ghost" onclick={reset}>{@html icons.close}{t('people.resetFilters')}</button>
    {/if}
  </div>

  {#if reported}<ReportBar mode="people" {setup} today={dayIn(Date.now(), '')} />{/if}

  {#if !intake.enabled && intake.lastAt !== null}
    <p class="notice">{t('people.offWithData')} {#if editable}<a href={settingsHref}>{t('people.toSwitch')}</a>{/if}</p>
  {/if}
  {#if result && result.stale > 0}
    <p class="notice" role="status">{@html icons.refresh}<span>{tn('people.stale', result.stale)}</span></p>
  {/if}

  <LoadState load={list}>
    {#if result}
      {#if empty === 'off'}
        {#snippet offActions()}
          {#if editable}<a class="button primary" href={settingsHref}>{t('people.turnOn')}</a>{/if}
        {/snippet}
        <EdgeState kind="missing" heading="h2" title={t('people.offTitle')} text={t(editable ? 'people.offText' : 'people.offTextReader')} actions={offActions} />
      {:else if empty === 'noEvents'}
        {#snippet noEventsActions()}
          {#if editable}<a class="button primary" href={sendersHref}>{t('people.toSenders')}</a>{/if}
        {/snippet}
        <EdgeState kind="missing" heading="h2" title={t('people.noEventsTitle')} text={t('people.noEventsText')} actions={noEventsActions} />
      {:else if empty === 'stale'}
        <EdgeState kind="missing" heading="h2" title={t('people.staleTitle')} text={t('people.staleText')} />
      {:else if empty === 'filtered'}
        <div class="none">
          <p>{t('people.nobody')}</p>
          <button type="button" onclick={reset}>{t('people.resetFilters')}</button>
        </div>
      {:else if empty === 'testOnly'}
        <div class="none">
          <p>{test ? t('people.noneYet') : t('people.testOnly')}</p>
          {#if !test}<button type="button" onclick={() => setQuery({ test: '1', page: null })}>{t('people.showTest')}</button>{/if}
        </div>
      {:else}
        <div class="count-row">
          <p class="count" aria-live="polite">{tn('people.total', result.total)}</p>
          <PeopleExport {setup} search={searchEntries} total={result.total} period={exportPeriod} />
        </div>
        <div class="scroll frame" class:busy bind:this={listTop}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('people.subject')}</th>
                <th scope="col">{t('people.state')}</th>
                <th scope="col">{t('people.senders')}</th>
                <th scope="col">{t('people.firstTouch')}</th>
                <th scope="col">{t('people.acquisition')}</th>
                {#if milestones.length > 0}<th scope="col">{t('people.milestones')}</th>{/if}
                <th scope="col" class="num">{t('people.payments')}</th>
                <th scope="col" class="num">{t('people.revenue')}</th>
                <th scope="col">{t('people.lastEvent')}</th>
              </tr>
            </thead>
            <tbody>
              {#each result.people as person (person.subject)}
                <tr>
                  <td class="subject">
                    <a class="code" href={cardHref(person.subject)}>{person.subject}</a>
                    {#if person.test}<Mark>{t('analytics.testMark')}</Mark>{/if}
                  </td>
                  <td><StateMark state={person.state} /></td>
                  <td class="senders">{person.senders.map((_) => senderName(setup, _)).join(', ')}</td>
                  <td class="first">
                    {#if person.firstTouch}
                      <div class="touch">
                        <span class="label" class:muted={person.firstTouch.label === ''}>{person.firstTouch.label || t('people.noLabel')}</span>
                        <small class="muted">{moment(person.firstTouch.at)}{#if person.firstTouchConflict}{' · '}<span class="conflict">{@html icons.alert}{t('people.touchConflict')}</span>{/if}</small>
                      </div>
                    {:else}
                      <span class="muted">—</span>
                    {/if}
                  </td>
                  <td class="acquisition" class:muted={person.acquisition.kind === 'unknown'}>{acquisitionText(setup, person.acquisition)}</td>
                  {#if milestones.length > 0}
                    {@const reached = reachedOf(person)}
                    <td class="milestones">
                      {#if reached.length > 0}<span>{reached.map((_) => milestoneName(setup, _.code)).join(', ')}</span>{/if}
                      <small class="muted">{t('people.milestonesOf', { n: number(reached.length), total: number(milestones.length) })}</small>
                    </td>
                  {/if}
                  <td class="num">{number(person.payments)}</td>
                  <td class="num money">
                    {#each amounts(person.revenue, currentLanguage()) as line (line)}<span>{line}</span>{:else}<span class="muted">—</span>{/each}
                  </td>
                  <td class="last">{#if Date.parse(person.lastAt) > Date.now()}{moment(person.lastAt)}{:else}<span title={moment(person.lastAt)}>{ago(person.lastAt)}</span>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pager {pager} total={result.total} onpage={toTop} />
      {/if}
    {/if}
  </LoadState>
</div>

<style>
  .people {
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

  .filters label:not(.check) {
    flex: 1 1 10rem;
    min-width: 9rem;
    max-width: 14rem;
  }

  .filters .grow {
    flex: 1 1 14rem;
    max-width: 22rem;
  }

  .filters span {
    font-size: 0.8125rem;
  }

  .filters .check {
    min-height: var(--control);
    font-size: 0.875rem;
  }

  .notice {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .notice :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
  }

  .count {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .count-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  /* Таблица шире узкого экрана прокручивается в своей рамке, а не растягивает страницу. */
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

  /* Столбцы держат ширину, слова не рвутся: строка — в одну-две строки текста, лишнее — прокруткой рамки. */
  table {
    min-width: 84rem;
  }

  th,
  td {
    padding: 0.6rem 0.85rem;
    vertical-align: top;
  }

  td {
    font-size: 0.875rem;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .subject {
    min-width: 9rem;
    max-width: 14rem;
  }

  .subject a {
    overflow-wrap: anywhere;
  }

  .subject :global(.mark) {
    margin-left: 0.35rem;
  }

  .senders {
    min-width: 11.5rem;
    max-width: 14rem;
  }

  .first {
    min-width: 16rem;
  }

  .acquisition {
    min-width: 11rem;
    max-width: 16rem;
    overflow-wrap: break-word;
  }

  .milestones {
    min-width: 9rem;
    max-width: 14rem;
    overflow-wrap: break-word;
  }

  .milestones small {
    display: block;
    font-size: 0.75rem;
  }

  .touch {
    display: grid;
    gap: 0.1rem;
    max-width: 20rem;
  }

  /* Метка рвётся только длинная и без пробелов — когда иначе не помещается. */
  .touch .label {
    overflow-wrap: break-word;
  }

  .touch small {
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .conflict {
    display: inline-flex;
    gap: 0.2rem;
    align-items: center;
    color: var(--warn-text);
  }

  .conflict :global(svg) {
    width: 0.8rem;
    height: 0.8rem;
  }

  .money {
    white-space: nowrap;
  }

  .money span {
    display: block;
  }

  .last {
    white-space: nowrap;
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
