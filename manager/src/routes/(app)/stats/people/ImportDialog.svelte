<script lang="ts">
import { untrack } from 'svelte';
import { IMPORT_LIMIT } from '#lib/analytics.ts';
import { api } from '#lib/api.ts';
import { number, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { fileSize } from '#lib/media.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type { ImportReport, SetupView } from '#lib/types.ts';
import { resolve } from '$app/paths';
import Modal from '../Modal.svelte';

// Загрузка истории из файла JSON Lines: сначала проверка без записи (dry-run) с итогом, потом загрузка тем же
// приёмом, что у `cms events import`. Повторная загрузка безопасна: повторы не считаются второй раз.
let {
  open,
  setup,
  enabled,
  preset = null,
  hint = null,
  onclose,
  onimported,
}: {
  open: boolean;
  setup: SetupView;
  /** Включён ли приём: выключен — файл не примут ни проверкой, ни загрузкой. */
  enabled: boolean;
  /** Отправитель, выбранный заранее: досылка из окна дня проверки. */
  preset?: string | null;
  /** Что выгрузить у отправителя: «события за 24 ноября по UTC». */
  hint?: string | null;
  onclose: () => void;
  onimported: () => void;
} = $props();

// Действующий отправитель — не выключен и не в архиве: события других сайт не принимает ни по сети, ни из файла.
const active = $derived(
  setup.senders.filter((_) => _.enabled && _.archivedAt === null)
);

let sender = $state('');
let file = $state<File | null>(null);
let report = $state<ImportReport | null>(null);
let busy = $state(false);
let error = $state<string | null>(null);

// Окно открыли — оно начинается с чистого листа. Только по открытию: загрузка перечитывает настройку
// экрана, и итог не должен пропасть вместе с ней.
$effect(() => {
  void (
    open &&
    untrack(
      () => (
        (sender =
          preset !== null && active.some((_) => _.code === preset)
            ? preset
            : active.length === 1
              ? active[0]!.code
              : ''),
        (file = null),
        (report = null),
        (error = null)
      )
    )
  );
});

const tooLarge = $derived(file !== null && file.size > IMPORT_LIMIT);
const ready = $derived(
  enabled && !busy && file !== null && !tooLarge && sender !== ''
);
// Загрузить можно то, что только что проверили: тот же файл и тот же отправитель.
const checked = $derived(report?.dryRun === true && report.sender === sender);

const pick = (event: Event) => (
  (file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null),
  (report = null),
  (error = null)
);

const run = (dryRun: boolean) =>
  void (
    ready &&
    ((busy = true),
    (error = null),
    api
      .upload<ImportReport>(
        `/analytics/events/import?${new URLSearchParams({
          ...(sender ? { sender } : {}),
          ...(dryRun ? { dryRun: '1' } : {}),
        })}`,
        file!
      )
      .then(
        (_) => (
          (report = _),
          void (
            dryRun || (notify(tn('eventImport.done', _.accepted)), onimported())
          )
        ),
        (_) => void (error = describe(_))
      )
      .finally(() => (busy = false)))
  );

const _WARNINGS: Readonly<
  Record<string, 'eventImport.warnUnknownType' | 'eventImport.warnFuture'>
> = {
  unknown_type: 'eventImport.warnUnknownType',
  future: 'eventImport.warnFuture',
};

// Предупреждение по виду: `invalid_value:data.<код>` и `unknown_value:<путь>` — с путём поля.
const warningText = (kind: string): string =>
  _WARNINGS[kind]
    ? t(_WARNINGS[kind])
    : kind.startsWith('invalid_value:')
      ? t('eventImport.warnInvalidValue', { path: kind.slice(14) })
      : kind.startsWith('unknown_value:')
        ? t('eventImport.warnUnknownValue', { path: kind.slice(14) })
        : kind;

const facts = $derived(
  report
    ? [
        { label: t('eventImport.lines'), value: report.lines, bad: false },
        {
          label: t('eventImport.accepted'),
          value: report.accepted,
          bad: false,
        },
        {
          label: t('eventImport.duplicates'),
          value: report.duplicates,
          bad: false,
        },
        {
          label: t('eventImport.conflicts'),
          value: report.conflicts,
          bad: false,
        },
        {
          label: t('eventImport.erasures'),
          value: report.erasures,
          bad: false,
        },
        { label: t('eventImport.erased'), value: report.erased, bad: false },
        {
          label: t('eventImport.rejected'),
          value: report.rejected,
          bad: report.rejected > 0,
        },
        { label: t('eventImport.empty'), value: report.empty, bad: false },
      ]
    : []
);

const sendersHref = `${resolve('/(app)/stats/setup')}?tab=senders`;
const settingsHref = `${resolve('/(app)/settings')}?tab=stats`;
</script>

<Modal {open} wide title={t('eventImport.title')} {onclose}>
  <p class="muted intro">{t('eventImport.intro')}</p>
  {#if hint}<p class="hint" role="note">{hint}</p>{/if}
  {#if !enabled}
    <p class="off" role="note">{t('eventImport.off')} <a href={settingsHref}>{t('people.toSwitch')}</a></p>
  {/if}
  {#if active.length === 0}
    <p class="off" role="note">{t('eventImport.noSender')} <a href={sendersHref}>{t('eventImport.toSenders')}</a></p>
  {:else}
    <div class="form">
      {#if active.length > 1}
        <label>
          <span>{t('people.sender')}</span>
          <select bind:value={sender} onchange={() => (report = null)} required>
            <option value="" disabled>{t('eventImport.pickSender')}</option>
            {#each active as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
          </select>
          <small>{t('eventImport.senderHint')}</small>
        </label>
      {:else}
        <p class="one">{t('eventImport.oneSender', { name: active[0]!.name })}</p>
      {/if}
      <label>
        <span>{t('eventImport.file')}</span>
        <input type="file" accept=".jsonl,.ndjson,.json,.txt,application/x-ndjson,application/json,text/plain" aria-invalid={tooLarge ? 'true' : undefined} aria-describedby="import-file-hint" onchange={pick} />
        {#if tooLarge}
          <small id="import-file-hint" class="field-error">{t('eventImport.tooLarge', { size: fileSize(file!.size) })}</small>
        {:else}
          <small id="import-file-hint">{file ? t('eventImport.picked', { size: fileSize(file.size) }) : t('eventImport.fileHint')}</small>
        {/if}
      </label>
      {#if tooLarge}
        <pre class="cli">cms events import {file!.name} --db site.db{sender ? ` --sender ${sender}` : ''}</pre>
      {/if}
    </div>
  {/if}

  {#if error}<p class="field-error" role="alert">{error}</p>{/if}

  {#if report}
    <section class="report" aria-labelledby="import-report" aria-live="polite">
      <h3 id="import-report">{t(report.dryRun ? 'eventImport.checkedTitle' : 'eventImport.loadedTitle')}</h3>
      <p class="muted">{report.dryRun ? t('eventImport.checkedText') : t('eventImport.loadedText')}</p>
      {#if report.people !== null}<p class="muted">{tn('eventImport.people', report.people)}</p>{/if}
      <dl class="facts">
        {#each facts as fact (fact.label)}
          <div class:bad={fact.bad}><dt>{fact.label}</dt><dd>{number(fact.value)}</dd></div>
        {/each}
      </dl>
      {#if report.errors.length > 0}
        <h4>{t('eventImport.errors')}</h4>
        <div class="scroll frame">
          <table>
            <thead><tr><th scope="col" class="num">{t('eventImport.line')}</th><th scope="col">{t('eventImport.path')}</th><th scope="col">{t('eventImport.reason')}</th></tr></thead>
            <tbody>
              {#each report.errors as row, index (index)}
                <tr><td class="num">{number(row.line)}</td><td class="code">{row.path}</td><td>{row.message}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if report.rejected > report.errors.length}<p class="help">{t('eventImport.moreErrors', { shown: number(report.errors.length), total: number(report.rejected) })}</p>{/if}
      {/if}
      {#if Object.keys(report.warnings).length > 0}
        <h4>{t('eventImport.warnings')}</h4>
        <ul class="warnings">
          {#each Object.entries(report.warnings) as entry (entry[0])}
            <li><span>{warningText(entry[0])}</span><span class="num">{number(entry[1])}</span></li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#snippet footer()}
    <button type="button" onclick={onclose}>{report && !report.dryRun ? t('common.close') : t('common.cancel')}</button>
    {#if active.length > 0 && !(report && !report.dryRun)}
      <button type="button" class={checked ? '' : 'primary'} aria-disabled={!ready} onclick={() => run(true)}>{@html icons.checks}{checked ? t('eventImport.checkAgain') : t('eventImport.check')}</button>
      {#if checked}
        <button type="button" class="primary" aria-disabled={!ready} onclick={() => run(false)}>{@html icons.upload}{t('eventImport.load')}</button>
      {/if}
    {/if}
  {/snippet}
</Modal>

<style>
  .intro {
    margin: -0.5rem 0 0;
    font-size: 0.875rem;
  }

  .hint {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.875rem;
  }

  .off {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .form {
    display: grid;
    gap: 1rem;
  }

  .one {
    margin: 0;
    font-size: 0.875rem;
  }

  input[type='file'] {
    min-height: var(--control);
    padding: 0.25rem 0;
    border: 0;
    background: none;
    font-size: 0.875rem;
  }

  /* Кнопка выбора файла — как обычная кнопка менеджера, а не системная. */
  input[type='file']::file-selector-button {
    min-height: 2.25rem;
    margin-right: 0.75rem;
    padding: 0 0.85rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-s);
    color: var(--text);
    font: inherit;
    font-weight: 550;
    cursor: pointer;
  }

  input[type='file']::file-selector-button:hover {
    background: var(--control-hover);
  }

  .cli {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    background: var(--sunken);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .report {
    display: grid;
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 0.0625rem solid var(--line);
  }

  .report h3 {
    font-size: 1rem;
  }

  .report h4 {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
  }

  .report p {
    margin: 0;
    font-size: 0.875rem;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.5rem;
    margin: 0;
  }

  .facts div {
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
  }

  .facts .bad {
    border-color: color-mix(in oklch, var(--danger) 40%, var(--line));
    background: var(--danger-soft);
  }

  .facts dt {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .facts dd {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .scroll {
    max-height: 16rem;
    overflow: auto;
  }

  th,
  td {
    padding: 0.45rem 0.7rem;
    font-size: 0.8125rem;
    vertical-align: top;
  }

  td.code {
    overflow-wrap: anywhere;
  }

  .num {
    width: 5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .warnings {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }

  .warnings li {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.35rem 0;
    border-bottom: 0.0625rem solid var(--line);
  }

  .warnings li span:first-child {
    overflow-wrap: anywhere;
  }
</style>
