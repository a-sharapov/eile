<script lang="ts">
import { number, t, tn } from '#lib/i18n.ts';
import type { SetPlanReport, SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import {
  fieldChanges,
  fieldText,
  groupText,
  planGroups,
  untouchedText,
  warningText,
} from './transfer.ts';

// Отчёт пробы и загрузки набора: «создастся» и «изменится» по группам — названия и поля «было → стало», «без
// изменений», «на сайте и не в файле — не тронуты», предупреждения, ошибки по путям, чего набор не меняет. Списками,
// а не таблицей: на телефоне читается так же. Поле — подписью из формы, имя из файла — в подсказке. Всё из файла —
// только текстом.
let {
  report,
  setup,
  file,
}: {
  report: SetPlanReport;
  setup: SetupView;
  /** Набор из файла — для «стало»; у образца — null. */
  file: Readonly<Record<string, unknown>> | null;
} = $props();

const groups = $derived(planGroups(report));
const errors = $derived(Object.entries(report.errors));
const kept = $derived(
  Object.entries(report.kept).filter(({ 1: n }) => (n ?? 0) > 0)
);
</script>

<div class="set-plan" aria-live="polite">
  <p class="counts">
    <span>{tn('transfer.created', report.created.length)}</span>
    <span>{tn('transfer.changed', report.changed.length)}</span>
    <span>{tn('transfer.unchanged', report.unchanged)}</span>
  </p>

  {#if errors.length > 0}
    <section class="errors" aria-labelledby="set-errors">
      <h4 id="set-errors">{tn('transfer.errors', errors.length)}</h4>
      <p class="help">{t('transfer.errorsHint')}</p>
      <ul>
        {#each errors as entry (entry[0])}
          <li><code>{entry[0] || '—'}</code> <span>{entry[1]}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if report.warnings.length > 0}
    <section class="warnings" aria-labelledby="set-warnings">
      <h4 id="set-warnings">{t('transfer.warnings')}</h4>
      <ul>
        {#each report.warnings as warning, index (index)}
          <li>{warningText(warning, report)}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#each groups as group (group.group)}
    <section class="group" aria-labelledby={`set-group-${group.group}`}>
      <h4 id={`set-group-${group.group}`}>{groupText(group.group)}</h4>
      {#if group.created.length > 0}
        <p class="sub">{tn('transfer.created', group.created.length)}</p>
        <ul class="items">
          {#each group.created as item (item.key)}
            <li><span class="name">{item.name || item.key}</span> <code class="muted">{item.key}</code>{#if item.archived}{' '}<Mark>{t('setupList.inArchive')}</Mark>{/if}</li>
          {/each}
        </ul>
      {/if}
      {#if group.changed.length > 0}
        <p class="sub">{tn('transfer.changed', group.changed.length)}</p>
        <ul class="items">
          {#each group.changed as item (item.key)}
            <li>
              <span class="name">{item.name || item.key}</span> <code class="muted">{item.key}</code>
              <ul class="fields">
                {#each fieldChanges(setup, file, group.group, item.key, item.fields) as change (change.field)}
                  {@const label = fieldText(group.group, change.field)}
                  <li>{#if label === change.field}<code>{label}</code>{:else}<span class="field" title={change.field}>{label}</span>{/if}{#if change.to !== null}: <span class="was">{change.from}</span> → <span>{change.to}</span>{/if}</li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}

  {#if kept.length > 0}
    <section class="kept" aria-labelledby="set-kept">
      <h4 id="set-kept">{t('transfer.kept')}</h4>
      <ul class="inline">
        {#each kept as entry (entry[0])}<li>{groupText(entry[0])}: {number(entry[1] ?? 0)}</li>{/each}
      </ul>
    </section>
  {/if}

  <p class="muted untouched">{t('transfer.untouched', { items: report.untouched.map(untouchedText).join(', ') })}</p>
</div>

<style>
  .set-plan {
    display: grid;
    gap: 0.9rem;
    min-width: 0;
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin: 0;
    font-weight: 600;
  }

  section {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  h4 {
    margin: 0;
    font-size: 0.9375rem;
  }

  .sub,
  .help,
  .untouched {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  ul {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }

  .items > li {
    padding: 0.3rem 0;
    border-bottom: 0.0625rem solid var(--line);
    overflow-wrap: anywhere;
  }

  .name {
    font-weight: 550;
  }

  .fields {
    margin: 0.25rem 0 0 0.75rem;
    font-size: 0.8125rem;
  }

  .field {
    font-weight: 550;
  }

  .was {
    color: var(--muted);
    text-decoration: line-through;
  }

  .errors {
    padding: 0.75rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--danger-soft);
  }

  .errors li {
    overflow-wrap: anywhere;
  }

  .warnings {
    padding: 0.75rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
  }

  .warnings li {
    overflow-wrap: anywhere;
  }

  .inline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }
</style>
