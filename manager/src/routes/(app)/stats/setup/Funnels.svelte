<script lang="ts">
import { api } from '#lib/api.ts';
import { quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { Funnel, SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { stepName } from '../names.ts';
import { archive, type EditRequest, remove, swap } from './setup.ts';

// Воронки: шаги по порядку, строгий или свободный порядок, основная — та, что экран и агент открывают первой.
let {
  setup,
  editable,
  onedit,
  onchanged,
}: {
  setup: SetupView;
  editable: boolean;
  onedit: (request: EditRequest) => void;
  onchanged: () => void;
} = $props();

const done = (changed: boolean) => void (changed && onchanged());
let moving = $state(false);

const move = (index: number, step: -1 | 1) =>
  ((item, other) =>
    void (
      item &&
      other &&
      !moving &&
      ((moving = true),
      swap('funnel', item, other, step)
        .then(onchanged, failed)
        .finally(() => (moving = false)))
    ))(setup.funnels[index], setup.funnels[index + step]);

// Не отмечена ни одна — основная первая по порядку не из архива.
const main = $derived(
  setup.funnels.find((_) => _.main) ??
    setup.funnels.find((_) => _.archivedAt === null)
);

// Сервер сам снимает отметку с прежней основной той же правкой.
const makeMain = (funnel: Funnel) =>
  api
    .send('PUT', '/analytics/setup/funnel', { code: funnel.code, main: true })
    .then(
      () => (
        notify(t('funnels.madeMain', { name: quoted(funnel.name) })),
        onchanged()
      ),
      failed
    );
</script>

<div class="list">
  <header class="intro">
    <p>{t('funnels.intro')}</p>
    {#if editable}<button type="button" class="primary" onclick={() => onedit({ group: 'funnel', item: null })}>{@html icons.plus}{t('funnels.new')}</button>{/if}
  </header>

  {#if setup.funnels.length === 0}
    <div class="frame empty"><p>{t('funnels.empty')}</p></div>
  {:else}
    <div class="scroll frame">
      <table>
        <thead>
          <tr>
            <th scope="col" class="num">{t('dictionaries.position')}</th>
            <th scope="col">{t('setupList.name')}</th>
            <th scope="col">{t('funnels.steps')}</th>
            <th scope="col">{t('funnels.order')}</th>
            {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each setup.funnels as funnel, index (funnel.code)}
            <tr class:archived={funnel.archivedAt !== null}>
              <td class="num">{index + 1}</td>
              <td class="name">
                <span>{funnel.name}</span>
                <code class="muted">{funnel.code}</code>
                <span class="marks">
                  {#if funnel.main}<Mark tone="accent">{t('funnels.mainMark')}</Mark>{:else if main?.code === funnel.code}<Mark title={t('funnels.mainByOrderHint')}>{t('funnels.mainByOrder')}</Mark>{/if}
                  {#if funnel.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}
                </span>
              </td>
              <td class="steps">
                <ol>
                  {#each funnel.steps as step, at (at)}<li>{stepName(setup, step)}</li>{/each}
                </ol>
                <small class="muted">{tn('funnels.stepsCount', funnel.steps.length)}</small>
              </td>
              <td class="order">{t(funnel.strict ? 'funnels.strictShort' : 'funnels.freeShort')}</td>
              {#if editable}
                <td class="row-actions">
                  <button type="button" class="ghost icon" aria-label={t('dictionaries.up', { name: quoted(funnel.name) })} title={t('dictionaries.upShort')} aria-disabled={index === 0 || moving} onclick={() => move(index, -1)}>{@html icons.arrowUp}</button>
                  <button type="button" class="ghost icon" aria-label={t('dictionaries.down', { name: quoted(funnel.name) })} title={t('dictionaries.downShort')} aria-disabled={index === setup.funnels.length - 1 || moving} onclick={() => move(index, 1)}>{@html icons.arrowDown}</button>
                  {#if !funnel.main && funnel.archivedAt === null}<button type="button" class="ghost" onclick={() => makeMain(funnel)}>{t('funnels.makeMain')}<span class="sr-only">: {funnel.name}</span></button>{/if}
                  <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${funnel.name}`} onclick={() => onedit({ group: 'funnel', item: funnel })}>{@html icons.pencil}{t('setupList.edit')}</button>
                  <button type="button" class="ghost icon" aria-label={`${t(funnel.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${funnel.name}`} title={t(funnel.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('funnel', funnel, funnel.archivedAt === null).then(done)}>{@html icons.restore}</button>
                  <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${funnel.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'funnel', funnel).then(done)}>{@html icons.trash}</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
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

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
  }

  table {
    min-width: 54rem;
  }

  th,
  td {
    padding: 0.55rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: top;
    overflow-wrap: break-word;
  }

  .archived td {
    color: var(--muted);
  }

  .num {
    width: 2.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .name {
    min-width: 11rem;
  }

  .name > * {
    display: block;
  }

  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.2rem;
  }

  .steps {
    min-width: 18rem;
  }

  .steps ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .steps li + li::before {
    margin-right: 0.35rem;
    color: var(--muted);
    content: '→';
  }

  .steps small {
    display: block;
    margin-top: 0.2rem;
  }

  .order {
    min-width: 7rem;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions button {
    min-height: 2rem;
    padding: 0 0.55rem;
    font-size: 0.8125rem;
  }

  .row-actions button.icon {
    width: 2rem;
    padding: 0;
  }

  .row-actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .empty {
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
