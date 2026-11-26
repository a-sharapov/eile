<script lang="ts">
import { quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';
import type { Milestone, SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { conditionText, typeName } from '../names.ts';
import { archive, type EditRequest, remove, swap } from './setup.ts';

// Вехи: на каком типе событий, сколько, с каким условием и в каком окне. Порядок — порядок столбцов в «Источниках».
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
      swap('milestone', item, other, step)
        .then(onchanged, failed)
        .finally(() => (moving = false)))
    ))(setup.milestones[index], setup.milestones[index + step]);

const windowOf = (milestone: Milestone): string =>
  ((from) =>
    milestone.days === null
      ? t('milestones.windowForever', { from })
      : tn('milestones.windowDays', milestone.days, { from }))(
    milestone.anchor === null
      ? t('milestones.fromArrival')
      : t('milestones.fromType', {
          name: quoted(typeName(setup, milestone.sender, milestone.anchor)),
        })
  );
</script>

<div class="list">
  <header class="intro">
    <p>{t('milestones.intro')}</p>
    {#if editable && setup.types.length > 0}<button type="button" class="primary" onclick={() => onedit({ group: 'milestone', item: null })}>{@html icons.plus}{t('milestones.new')}</button>{/if}
  </header>

  {#if setup.milestones.length === 0}
    <div class="frame empty">
      <p>{t(setup.types.length === 0 ? 'milestones.emptyNoTypes' : 'milestones.empty')}</p>
      {#if setup.types.length === 0}<a class="button" href="?tab=types">{t('setupList.toTypes')}</a>{/if}
    </div>
  {:else}
    <div class="scroll frame">
      <table>
        <thead>
          <tr>
            <th scope="col" class="num">{t('dictionaries.position')}</th>
            <th scope="col">{t('setupList.name')}</th>
            <th scope="col">{t('milestones.rule')}</th>
            <th scope="col">{t('milestones.window')}</th>
            <th scope="col">{t('milestones.columnShort')}</th>
            {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each setup.milestones as milestone, index (milestone.code)}
            <tr class:archived={milestone.archivedAt !== null}>
              <td class="num">{index + 1}</td>
              <td class="name">
                <span>{milestone.name} {#if milestone.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{/if}</span>
                <code class="muted">{milestone.code}</code>
                {#if milestone.note}<small class="muted">{milestone.note}</small>{/if}
              </td>
              <td class="rule">
                <span>{typeName(setup, milestone.sender, milestone.type)}</span>
                <small class="muted">{[tn('milestones.countText', milestone.count), ...(milestone.condition ? [conditionText(setup, milestone.condition)] : [])].join(' · ')}</small>
              </td>
              <td class="window">{windowOf(milestone)}</td>
              <td>{#if milestone.column}<Mark tone="accent">{t('milestones.shown')}</Mark>{:else}<span class="muted">{t('milestones.hidden')}</span>{/if}</td>
              {#if editable}
                <td class="row-actions">
                  <button type="button" class="ghost icon" aria-label={t('dictionaries.up', { name: quoted(milestone.name) })} title={t('dictionaries.upShort')} aria-disabled={index === 0 || moving} onclick={() => move(index, -1)}>{@html icons.arrowUp}</button>
                  <button type="button" class="ghost icon" aria-label={t('dictionaries.down', { name: quoted(milestone.name) })} title={t('dictionaries.downShort')} aria-disabled={index === setup.milestones.length - 1 || moving} onclick={() => move(index, 1)}>{@html icons.arrowDown}</button>
                  <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${milestone.name}`} onclick={() => onedit({ group: 'milestone', item: milestone })}>{@html icons.pencil}{t('setupList.edit')}</button>
                  <button type="button" class="ghost icon" aria-label={`${t(milestone.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${milestone.name}`} title={t(milestone.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive('milestone', milestone, milestone.archivedAt === null).then(done)}>{@html icons.restore}</button>
                  <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${milestone.name}`} title={t('setupList.remove')} onclick={() => remove(setup, 'milestone', milestone).then(done)}>{@html icons.trash}</button>
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

  .name small {
    max-width: 20rem;
  }

  .rule {
    min-width: 13rem;
  }

  .rule > * {
    display: block;
  }

  .window {
    min-width: 10rem;
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
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
