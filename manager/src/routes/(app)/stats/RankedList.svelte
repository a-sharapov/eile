<script lang="ts">
import { number, t } from '#lib/i18n.ts';
import type { StatsRow } from '#lib/types.ts';

let {
  rows,
  measure,
  head,
  label = (value: string) => value,
  code = false,
}: {
  rows: StatsRow[];
  /** По чему ранжированы строки: посетители у разрезов посещения, просмотры — у страниц. */
  measure: 'visitors' | 'views';
  /** Подпись столбца значений. */
  head: string;
  /** Как показать значение: пустой источник — «Прямой заход», устройство — словом. */
  label?: (value: string) => string;
  /** Значение — адрес или метка: моноширинным. */
  code?: boolean;
} = $props();

const _FIRST = 8;
let all = $state(false);

const max = $derived(Math.max(1, ...rows.map((_) => _[measure])));
const shown = $derived(all ? rows : rows.slice(0, _FIRST));
</script>

{#if rows.length === 0}
  <p class="muted none">{t('stats.none')}</p>
{:else}
  <!-- Одна мера и один цвет: длина полоски — доля от первой строки, число — справа. -->
  <table>
    <thead>
      <tr><th>{head}</th><th class="count">{t(measure === 'visitors' ? 'stats.visitors' : 'stats.views')}</th></tr>
    </thead>
    <tbody>
      {#each shown as row (row.value)}
        <tr>
          <td>
            <span class="name" class:code title={label(row.value)}>{label(row.value)}</span>
            <span class="share" aria-hidden="true"><span style:width={`${(row[measure] / max) * 100}%`}></span></span>
          </td>
          <td class="count">{number(row[measure])}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if rows.length > _FIRST}
    <button type="button" class="button ghost more" onclick={() => (all = !all)}>{all ? t('stats.less') : t('stats.more', { n: rows.length })}</button>
  {/if}
{/if}

<style>
  table {
    table-layout: fixed;
  }

  th,
  td {
    padding: 0.5rem 0.75rem;
  }

  .count {
    width: 6.5rem;
    text-align: right;
  }

  .name {
    display: block;
    overflow: hidden;
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name.code {
    font-family: var(--mono);
    font-size: 0.8125rem;
  }

  .share {
    display: block;
    height: 0.25rem;
    margin-top: 0.3rem;
    border-radius: 0.125rem;
    background: var(--sunken);
  }

  .share span {
    display: block;
    min-width: 0.125rem;
    height: 100%;
    border-radius: 0 0.125rem 0.125rem 0;
    background: color-mix(in oklch, var(--accent) 70%, var(--surface));
  }

  .none {
    margin: 0;
    padding: 0.75rem 0;
    font-size: 0.875rem;
  }

  .more {
    justify-self: start;
    margin-top: 0.25rem;
  }
</style>
