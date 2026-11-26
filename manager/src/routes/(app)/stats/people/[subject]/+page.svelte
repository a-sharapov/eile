<script lang="ts">
import { untrack } from 'svelte';
import { ROLE_LABELS } from '#lib/analytics.ts';
import { api, isApiError } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { amounts } from '#lib/money.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import type {
  AnalyticsEvent,
  PeopleErased,
  PersonCard,
  SetupView,
} from '#lib/types.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import EventBody from '../../EventBody.svelte';
import EventFields from '../../EventFields.svelte';
import Mark from '../../Mark.svelte';
import {
  acquisitionText,
  dictionaryOf,
  dimValueText,
  milestoneName,
  partsText,
  propertyOf,
  senderName,
  valueIn,
} from '../../names.ts';
import StateMark from '../../StateMark.svelte';

// Карточка человека — всё, что сайт знает о псевдониме: сервер сворачивает его заново из событий. Метки,
// свои ответы и псевдоним пишут чужие системы — на экране они только текстом.
const subject = $derived(page.params.subject ?? '');

let card = $state<PersonCard | null>(null);
let setup = $state<SetupView | null>(null);
let feed = $state<AnalyticsEvent[]>([]);
let next = $state<number | null>(null);
let missing = $state(false);
let more = $state(false);
let opened = $state<number | null>(null);

const path = (before: number | null) =>
  `/analytics/people/${encodeURIComponent(subject)}?limit=50${before === null ? '' : `&before=${before}`}`;

const loading = defineLoad(() =>
  ((wanted) =>
    Promise.all([
      api.get<PersonCard>(path(null)),
      api.get<SetupView>('/analytics/setup'),
    ]).then(
      ({ 0: person, 1: snapshot }) =>
        void (
          wanted === subject &&
          ((card = person),
          (setup = snapshot),
          (feed = person.events),
          (next = person.next),
          (missing = false))
        ),
      // Человека нет (стёрт, опечатка в адресе) — так и говорим, а не «не загрузилось».
      (error) =>
        isApiError(error) && error.code === 'analytics.person_not_found'
          ? void ((missing = true), (card = null))
          : Promise.reject(error)
    ))(subject)
);

$effect(() => void ((_: string) => untrack(() => loading.retry()))(subject));

const loadMore = () =>
  void (
    next !== null &&
    !more &&
    ((more = true),
    api
      .get<PersonCard>(path(next))
      .then((_) => void ((feed = [...feed, ..._.events]), (next = _.next)))
      .then(undefined, failed)
      .finally(() => (more = false)))
  );

const peopleHref = resolve('/(app)/stats/people');
const crumbs = $derived([
  { label: t('stats.title'), href: resolve('/(app)/stats') },
  { label: t('people.title'), href: peopleHref },
]);

// Ответ опроса: вопрос — справочник ответов, ответ — его значение; вне справочника — код с отметкой.
const answers = $derived(
  card && setup
    ? Object.entries(card.person.answers).map(({ 0: question, 1: answer }) => ({
        question,
        title: dictionaryOf(setup, question)?.name ?? question,
        answer: answer.answer,
        name: valueIn(setup, question, answer.answer)?.name ?? null,
        text: answer.text,
        at: answer.at,
      }))
    : []
);

// Признак: название из справочника признаков, выбор — названием значения.
const traits = $derived(
  card && setup
    ? Object.entries(card.person.traits).map(({ 0: code, 1: value }) =>
        ((property) => ({
          code,
          title: property?.name ?? code,
          value:
            value === null
              ? '—'
              : typeof value === 'boolean'
                ? t(value ? 'common.yes' : 'common.no')
                : property?.kind === 'choice'
                  ? (valueIn(setup, property.dictionary, String(value))?.name ??
                    String(value))
                  : String(value),
        }))(propertyOf(setup, 'person', code))
      )
    : []
);

// Вехи: по каждой вехе настройки — достиг, ещё в окне, не достиг; веха в архиве — если о ней есть факт.
const milestones = $derived(
  card && setup
    ? setup.milestones
        .filter(
          (_) =>
            _.archivedAt === null ||
            Object.hasOwn(card!.person.milestones, _.code)
        )
        .map((_) => ({
          code: _.code,
          name: milestoneName(setup, _.code),
          archived: _.archivedAt !== null,
          view: card!.person.milestones[_.code] ?? null,
        }))
    : []
);

const milestoneText = (view: (typeof milestones)[number]['view']): string =>
  view === null
    ? t('person.milestonePending')
    : view.state === 'reached' && view.reachedAt
      ? t('person.milestoneReached', { when: moment(view.reachedAt) })
      : view.state === 'open'
        ? view.until
          ? t('person.milestoneOpenUntil', { when: moment(view.until) })
          : t('person.milestoneOpen')
        : view.from === null
          ? t('person.milestoneNoStart')
          : view.until
            ? t('person.milestoneMissedUntil', { when: moment(view.until) })
            : t('person.milestoneMissed');

// Значения разрезов: свойство-разрез → значение самого раннего события, тип которого его объявляет.
const dims = $derived(
  card && setup
    ? Object.entries(card.person.dims).map(({ 0: code, 1: value }) => ({
        code,
        title: propertyOf(setup, 'event', code)?.name ?? code,
        value: dimValueText(setup, code, value),
      }))
    : []
);

const money = (byCurrency: Readonly<Record<string, number>>): string =>
  amounts(byCurrency, currentLanguage()).join(' · ') || '—';

const when = (iso: string | null): string => (iso === null ? '—' : moment(iso));

const erase = () =>
  ask({
    title: t('person.eraseTitle'),
    body: t('person.eraseBody'),
    items: [subject],
    confirm: t('person.erase'),
    tone: 'danger',
  }).then(
    (yes): unknown =>
      yes &&
      api
        .send<PeopleErased>(
          'DELETE',
          `/analytics/people/${encodeURIComponent(subject)}`
        )
        .then(
          (_) => (
            notify(tn('person.erased', _.events)),
            goto(peopleHref, { replace: true })
          )
        )
        .then(undefined, failed)
  );
</script>

<svelte:head><title>{subject} — {t('people.title')} — {t('app.name')}</title></svelte:head>

<PageHeader title={subject} {crumbs} />

<LoadState load={loading}>
  {#if missing}
    {#snippet backActions()}
      <a class="button primary" href={peopleHref}>{t('person.toPeople')}</a>
    {/snippet}
    <EdgeState kind="missing" heading="h2" title={t('person.missingTitle')} text={t('person.missingText')} actions={backActions} />
  {:else if card && setup}
    {@const person = card.person}
    <div class="card">
      <div class="headline">
        <StateMark state={card.state} />
        {#if person.test}<Mark>{t('person.testOnly')}</Mark>{/if}
        <span class="muted">{tn('person.eventsCount', person.events)} · {t('person.span', { from: moment(person.firstAt), to: moment(person.lastAt) })}</span>
      </div>

      {#if person.firstTouchConflict || card.conflicts.length > 0 || person.invalid > 0}
        <ul class="warnings" role="list">
          {#if person.firstTouchConflict}<li>{@html icons.alert}<span>{t('person.touchConflict')}</span></li>{/if}
          {#if card.conflicts.length > 0}<li>{@html icons.alert}<span>{tn('person.repeatConflicts', card.conflicts.length)}</span></li>{/if}
          {#if person.invalid > 0}<li>{@html icons.alert}<span>{tn('person.invalid', person.invalid)}</span></li>{/if}
        </ul>
      {/if}

      <div class="facts">
        <section aria-labelledby="person-origin">
          <h2 id="person-origin">{t('person.origin')}</h2>
          <dl>
            <div><dt>{t('people.senders')}</dt><dd>{person.senders.map((_) => senderName(setup, _)).join(', ')}</dd></div>
            <div><dt>{t('person.arrivedAt')}</dt><dd>{moment(person.arrivedAt)}</dd></div>
            <div><dt>{t('people.acquisition')}</dt><dd class:muted={person.acquisition.kind === 'unknown'}>{acquisitionText(setup, person.acquisition)}</dd></div>
            <div>
              <dt>{t('people.firstTouch')}</dt>
              <dd>
                {#if person.firstTouch}
                  <span class="text">{person.firstTouch.label || t('people.noLabel')}</span> <small class="muted">{moment(person.firstTouch.at)}</small>
                  {#if Object.keys(person.firstParts).length > 0}<span class="parts">{partsText(setup, person.firstParts)}</span>{/if}
                {:else}—{/if}
              </dd>
            </div>
            <div>
              <dt>{t('person.lastTouch')}</dt>
              <dd>
                {#if person.lastTouch}
                  <span class="text">{person.lastTouch.label || t('people.noLabel')}</span> <small class="muted">{moment(person.lastTouch.at)}</small>
                  {#if Object.keys(person.lastParts).length > 0}<span class="parts">{partsText(setup, person.lastParts)}</span>{/if}
                {:else}—{/if}
              </dd>
            </div>
          </dl>
          {#if person.returns.length > 0}
            <h3>{t('person.returns')}</h3>
            <ol class="returns">
              {#each person.returns as back (back.at)}
                <li>
                  <span>{t('person.returnAt', { when: moment(back.at) })}</span>
                  {#if back.touch}
                    <small class="muted"><span class="text">{t('person.returnTouch', { label: back.touch.label || t('people.noLabel'), when: moment(back.touch.at) })}</span></small>
                    {#if Object.keys(back.parts).length > 0}<span class="parts">{partsText(setup, back.parts)}</span>{/if}
                  {:else}
                    <small class="muted">{t('person.returnNoTouch')}</small>
                  {/if}
                </li>
              {/each}
            </ol>
          {/if}
        </section>

        <section aria-labelledby="person-money">
          <h2 id="person-money">{t('person.payments')}</h2>
          <dl>
            <div><dt>{t('people.payments')}</dt><dd>{number(person.payments)}</dd></div>
            <div><dt>{t('people.revenue')}</dt><dd>{money(person.revenue)}</dd></div>
            <div><dt>{t('person.fees')}</dt><dd>{money(person.fees)}</dd></div>
            {#if person.payments > 0}
              <div><dt>{t('person.firstPaid')}</dt><dd>{when(person.firstPaidAt)}</dd></div>
              <div><dt>{t('person.lastPaid')}</dt><dd>{when(person.lastPaidAt)}</dd></div>
            {/if}
            {#if person.paidUntil}<div><dt>{t('person.paidUntil')}</dt><dd>{moment(person.paidUntil)}</dd></div>{/if}
            {#if person.lapsedAt}<div><dt>{t('person.lapsedAt')}</dt><dd>{moment(person.lapsedAt)}</dd></div>{/if}
            {#if person.returnedAt}<div><dt>{t('person.returnedAt')}</dt><dd>{moment(person.returnedAt)}</dd></div>{/if}
            {#if person.trialAt}<div><dt>{t('person.trial')}</dt><dd>{person.trialEndsAt ? t('person.span', { from: moment(person.trialAt), to: moment(person.trialEndsAt) }) : moment(person.trialAt)}</dd></div>{/if}
            {#if person.unmatched > 0}<div><dt>{t('person.unmatched')}</dt><dd>{number(person.unmatched)} <small class="muted">{t('person.unmatchedHint')}</small></dd></div>{/if}
          </dl>
        </section>

        <section aria-labelledby="person-answers">
          <h2 id="person-answers">{t('person.answers')}</h2>
          {#if answers.length === 0}
            <p class="muted">{t('person.noAnswers')}</p>
          {:else}
            <dl>
              {#each answers as item (item.question)}
                <div>
                  <dt>{item.title}</dt>
                  <dd>
                    {#if item.name}{item.name}{:else}<code>{item.answer}</code> <Mark tone="warn">{t('person.outside')}</Mark>{/if}
                    {#if item.text}<span class="quote text">{t('common.quoted', { text: item.text })}</span>{/if}
                    <small class="muted">{moment(item.at)}</small>
                  </dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>

        <section aria-labelledby="person-milestones">
          <h2 id="person-milestones">{t('person.milestones')}</h2>
          {#if milestones.length === 0}
            <p class="muted">{t('person.noMilestones')}</p>
          {:else}
            <dl>
              {#each milestones as item (item.code)}
                <div>
                  <dt>{item.name}{#if item.archived}{' '}<Mark>{t('setupList.inArchive')}</Mark>{/if}</dt>
                  <dd class:reached={item.view?.state === 'reached'}>{milestoneText(item.view)}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </section>

        <section aria-labelledby="person-dims">
          <h2 id="person-dims">{t('person.dims')}</h2>
          {#if dims.length === 0}
            <p class="muted">{t('person.noDims')}</p>
          {:else}
            <dl>
              {#each dims as item (item.code)}
                <div><dt>{item.title}</dt><dd>{item.value}</dd></div>
              {/each}
            </dl>
          {/if}
        </section>

        <section aria-labelledby="person-traits">
          <h2 id="person-traits">{t('person.traits')}</h2>
          {#if traits.length === 0}
            <p class="muted">{t('person.noTraits')}</p>
          {:else}
            <dl>
              {#each traits as item (item.code)}
                <div><dt>{item.title}</dt><dd class="text">{item.value}</dd></div>
              {/each}
            </dl>
          {/if}
        </section>
      </div>

      {#if card.conflicts.length > 0}
        <section class="block" aria-labelledby="person-conflicts">
          <h2 id="person-conflicts">{t('person.conflicts')}</h2>
          <p class="help">{t('person.conflictsHint')}</p>
          <div class="scroll frame">
            <table>
              <thead><tr><th scope="col">{t('people.sender')}</th><th scope="col">id</th><th scope="col" class="num">{t('person.conflictCount')}</th><th scope="col">{t('person.conflictLast')}</th></tr></thead>
              <tbody>
                {#each card.conflicts as item (`${item.sender}/${item.id}`)}
                  <tr><td>{senderName(setup, item.sender)}</td><td class="code">{item.id}</td><td class="num">{number(item.count)}</td><td>{moment(item.lastAt)}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      <section class="block" aria-labelledby="person-feed">
        <h2 id="person-feed">{t('person.feed')}</h2>
        <div class="scroll frame">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('eventLog.at')}</th>
                <th scope="col">{t('eventLog.type')}</th>
                <th scope="col">{t('analytics.role')}</th>
                <th scope="col">{t('eventLog.fields')}</th>
                <th scope="col"><span class="sr-only">{t('analytics.body')}</span></th>
              </tr>
            </thead>
            <tbody>
              {#each feed as event (event.seq)}
                <tr>
                  <td class="at">
                    {moment(event.at)}
                    {#if event.test || event.future}
                      <span class="marks">
                        {#if event.test}<Mark>{t('analytics.testMark')}</Mark>{/if}
                        {#if event.future}<Mark tone="warn" title={t('analytics.futureHint')}>{t('analytics.future')}</Mark>{/if}
                      </span>
                    {/if}
                  </td>
                  <td class="type">{#if event.name !== null}{event.name}{:else}<span class="unknown">{t('analytics.unknownType', { code: event.type })}</span>{/if}<small class="muted">{senderName(setup, event.sender)}</small></td>
                  <td class="role">{event.role ? t(ROLE_LABELS[event.role]) : '—'}</td>
                  <td class="fields"><EventFields fields={event.fields} /></td>
                  <td class="open"><button type="button" class="ghost" onclick={() => (opened = event.seq)}>{@html icons.code}{t('analytics.showBody')}</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if next !== null}
          <button type="button" class="more" aria-disabled={more} onclick={loadMore}>{t('person.more')}</button>
        {/if}
      </section>

      {#if can('analytics.edit')}
        <section class="block erase" aria-labelledby="person-erase">
          <h2 id="person-erase">{t('person.eraseHeading')}</h2>
          <p>{t('person.eraseIntro')}</p>
          <button type="button" class="danger" onclick={erase}>{@html icons.trash}{t('person.erase')}</button>
        </section>
      {/if}
    </div>
  {/if}
</LoadState>

<EventBody seq={opened} onclose={() => (opened = null)} />

<style>
  .card {
    display: grid;
    gap: 1.75rem;
    min-width: 0;
    max-width: 72rem;
  }

  .headline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
    margin-top: -0.5rem;
    font-size: 0.875rem;
  }

  .warnings {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0.7rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
    list-style: none;
  }

  .warnings li {
    display: flex;
    gap: 0.5rem;
    align-items: start;
  }

  .warnings :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-top: 0.15rem;
    color: var(--warn-text);
  }

  /* Факты — две колонки на широкой холстине, одна на узкой; разделы — через линию, без карточек. */
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 1.5rem 2.5rem;
  }

  .facts section {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    min-width: 0;
    padding-top: 1rem;
    border-top: 0.0625rem solid var(--line);
  }

  h2 {
    font-size: 1rem;
  }

  dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(7rem, 11rem) minmax(0, 1fr);
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .quote {
    display: block;
    color: var(--muted);
  }

  .parts {
    display: block;
    font-size: 0.8125rem;
  }

  .facts h3 {
    margin: 0.35rem 0 0;
    font-size: 0.875rem;
  }

  .returns {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.875rem;
  }

  .returns small {
    display: block;
  }

  .reached {
    color: color-mix(in oklch, var(--ok) 65%, var(--text));
  }

  .facts p,
  .block p {
    margin: 0;
    font-size: 0.875rem;
  }

  .block {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
  }

  /* На узком экране таблица шире рамки и прокручивается в ней: столбцы держат ширину, слова не рвутся. */
  table {
    min-width: 52rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
  }

  .at {
    white-space: nowrap;
  }

  .marks {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.2rem;
  }

  .type {
    min-width: 11rem;
    max-width: 18rem;
    overflow-wrap: break-word;
  }

  .role {
    min-width: 8rem;
  }

  .fields {
    min-width: 20rem;
  }

  .type small {
    display: block;
  }

  .unknown {
    color: var(--warn-text);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
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

  .more {
    justify-self: start;
  }

  .erase {
    justify-items: start;
    padding-top: 1.5rem;
    border-top: 0.0625rem solid var(--line);
  }

  .erase p {
    max-width: 42rem;
    color: var(--muted);
    text-wrap: pretty;
  }
</style>
