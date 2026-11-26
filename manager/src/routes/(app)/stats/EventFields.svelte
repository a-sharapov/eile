<script lang="ts">
import { t } from '#lib/i18n.ts';

// Главные поля роли события: сумма и валюта оплаты, вопрос и ответ опроса, метка касания. Строки пришли от
// отправителя (метка и свой ответ — чужой текст, сервер их уже почистил) и выводятся только текстом.
let {
  fields,
}: { fields: Readonly<Record<string, string | number | boolean>> } = $props();

const shown = $derived(
  Object.entries(fields).map(({ 0: code, 1: value }) => ({
    code,
    value:
      typeof value === 'boolean'
        ? t(value ? 'common.yes' : 'common.no')
        : String(value),
  }))
);
</script>

{#if shown.length > 0}
  <dl class="fields">
    {#each shown as field (field.code)}
      <div><dt>{field.code}</dt><dd>{field.value === '' ? '—' : field.value}</dd></div>
    {/each}
  </dl>
{:else}
  <span class="muted">—</span>
{/if}

<style>
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.75rem;
    margin: 0;
  }

  .fields div {
    display: flex;
    gap: 0.3rem;
    min-width: 0;
    max-width: 100%;
  }

  dt {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.75rem;
    line-height: 1.6;
  }

  /* Значение рвётся только длинное и без пробелов: таблица вокруг держит ширину столбца. */
  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: break-word;
  }
</style>
