<script lang="ts">
import { api, isApiError } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { downloadFile } from '#lib/download.ts';
import { quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { fileSize } from '#lib/media.ts';
import { describe, failed } from '#lib/notices.svelte.ts';
import type { SetPlanReport, SetupView } from '#lib/types.ts';
import Samples from './Samples.svelte';
import SetPlan from './SetPlan.svelte';
import {
  canApply,
  readSetFile,
  SET_FILE_LIMIT,
  type SetFile,
  UNTOUCHED_LABELS,
  untouchedText,
} from './transfer.ts';

// «Настройка → Перенос» (ADR 0072, «Перенос набора»): выгрузить набор файлом, загрузить набор из файла — сначала
// проба с отчётом, «Загрузить» — отдельной кнопкой с подтверждением и только без ошибок; образцы карточками.
let {
  setup,
  editable,
  onapplied,
}: {
  setup: SetupView;
  editable: boolean;
  onapplied: (report: SetPlanReport, sample: boolean) => void;
} = $props();

let name = $state('');
let file = $state<File | null>(null);
let read = $state<SetFile | null>(null);
let report = $state<SetPlanReport | null>(null);
let busy = $state(false);
let error = $state<string | null>(null);
let downloading = $state(false);

const download = () =>
  void (
    downloading ||
    ((downloading = true),
    downloadFile('/analytics/set', 'eile-analytics.json')
      .then(undefined, failed)
      .finally(() => (downloading = false)))
  );

const plan = (set: Readonly<Record<string, unknown>>) => (
  (busy = true),
  (error = null),
  api
    .send<SetPlanReport>('POST', '/analytics/set/plan', set)
    .then(
      (_) => void (report = _),
      (_) =>
        void (isApiError(_) && _.code === 'manager.too_large'
          ? (read = { kind: 'large' })
          : (error = describe(_)))
    )
    .finally(() => (busy = false))
);

// Файл выбран — читается в браузере: больше 2 МБ, не JSON или не набор — сразу словами, без запроса; набор — проба.
const pick = (event: Event) =>
  ((next) => (
    (file = next),
    (read = null),
    (report = null),
    (error = null),
    void (
      next &&
      readSetFile(next).then(
        (_) => ((read = _), _.kind === 'set' ? plan(_.set) : undefined)
      )
    )
  ))((event.currentTarget as HTMLInputElement).files?.[0] ?? null);

const apply = () =>
  void (
    read?.kind === 'set' &&
    report &&
    canApply(report) &&
    !busy &&
    ((set, planned) =>
      ask({
        title: t('transfer.applyTitle', { name: quoted(planned.name) }),
        body: `${tn('transfer.created', planned.created.length)}, ${tn('transfer.changed', planned.changed.length)}. ${t('transfer.applyBody')}`,
        confirm: t('transfer.apply'),
      }).then(
        (yes) =>
          void (
            yes &&
            ((busy = true),
            (error = null),
            api
              .send<SetPlanReport>('POST', '/analytics/set', set)
              .then(
                (_) => (
                  (report = null),
                  (read = null),
                  (file = null),
                  onapplied(_, false)
                ),
                (_) =>
                  void ((error = describe(_)),
                  isApiError(_) &&
                    _.code === 'analytics.invalid_set' &&
                    plan(set))
              )
              .finally(() => (busy = false)))
          )
      ))(read.set, report)
  );

const _PROBLEMS: Readonly<
  Record<
    Exclude<SetFile['kind'], 'set'>,
    'transfer.notJson' | 'transfer.foreign' | 'transfer.tooLarge'
  >
> = {
  json: 'transfer.notJson',
  foreign: 'transfer.foreign',
  large: 'transfer.tooLarge',
};
</script>

<div class="transfer">
  <section class="frame" aria-labelledby="transfer-export">
    <h3 id="transfer-export">{t('transfer.exportTitle')}</h3>
    <p>{t('transfer.exportHint')}</p>
    <p class="muted small">{t('transfer.untouched', { items: Object.keys(UNTOUCHED_LABELS).map(untouchedText).join(', ') })}</p>
    <div><button type="button" aria-disabled={downloading} onclick={download}>{@html icons.download}{t('transfer.export')}</button></div>
  </section>

  {#if editable}
    <section class="frame" aria-labelledby="transfer-import">
      <h3 id="transfer-import">{t('transfer.importTitle')}</h3>
      <p>{t('transfer.importHint')}</p>
      <label>
        <span>{t('transfer.file')}</span>
        <input type="file" accept=".json,application/json" aria-invalid={read !== null && read.kind !== 'set' ? 'true' : undefined} aria-describedby="transfer-file-hint" onchange={pick} />
        {#if read !== null && read.kind !== 'set'}
          <small id="transfer-file-hint" class="field-error">{t(_PROBLEMS[read.kind], { size: fileSize(file?.size ?? 0), limit: fileSize(SET_FILE_LIMIT) })}</small>
        {:else}
          <small id="transfer-file-hint">{file ? t('transfer.picked', { size: fileSize(file.size) }) : t('transfer.fileHint', { limit: fileSize(SET_FILE_LIMIT) })}</small>
        {/if}
      </label>
      {#if read?.kind === 'large'}
        <pre class="cli">cms analytics import {file?.name ?? 'analytics.json'} --dry-run --db site.db</pre>
      {/if}
      {#if error}<p class="field-error" role="alert">{error}</p>{/if}
      {#if busy && !report}<p class="muted">{t('transfer.planning')}</p>{/if}
      {#if report}
        <div class="report">
          <h4>{t('transfer.planTitle', { name: quoted(report.name) })}</h4>
          <SetPlan {report} {setup} file={read?.kind === 'set' ? read.set : null} />
          <div class="actions">
            <button type="button" class="primary" aria-disabled={busy || !canApply(report)} onclick={apply}>{@html icons.upload}{t('transfer.apply')}</button>
            {#if Object.keys(report.errors).length > 0}<small class="field-error">{t('transfer.cannotApply')}</small>{:else if !canApply(report)}<small class="muted">{t('transfer.nothing')}</small>{/if}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <section aria-labelledby="transfer-samples">
    <h3 id="transfer-samples">{t('transfer.samplesTitle')}</h3>
    <p class="muted small">{t('transfer.samplesHint')}</p>
    <Samples {setup} {editable} onapplied={(_) => onapplied(_, true)} />
  </section>
</div>

<style>
  .transfer {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
  }

  section {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .frame {
    padding: 1rem 1.1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  h4 {
    margin: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  p {
    max-width: 52rem;
    margin: 0;
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .small {
    font-size: 0.8125rem;
  }

  label {
    display: grid;
    gap: 0.3rem;
  }

  input[type='file'] {
    min-height: var(--control);
    padding: 0.25rem 0;
    border: 0;
    background: none;
    font-size: 0.875rem;
  }

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
    padding-top: 0.9rem;
    border-top: 0.0625rem solid var(--line);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
  }
</style>
