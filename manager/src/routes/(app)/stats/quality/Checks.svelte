<script lang="ts">
import { api, isApiError } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { currentLanguage, number, quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { money } from '#lib/money.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type {
  CheckView,
  QualityReport,
  SetupView,
  ThresholdRule,
} from '#lib/types.ts';
import Mark from '../Mark.svelte';
import ScrollTable from '../ScrollTable.svelte';
import CheckForm from './CheckForm.svelte';
import { customCount, type NumberText } from './drafts.ts';
import {
  metricText,
  NOTIFY_LABELS,
  paramText,
  periodText,
  SEVERITY_LABELS,
} from './labels.ts';
import {
  builtinCheck,
  CHECK_ABOUT_KEYS,
  checkName,
  dueRule,
  fitsParam,
  PARAM_RANGES,
  QUALITY_LIMITS,
  zoneText,
} from './quality.ts';
import RuleForm from './RuleForm.svelte';

// «Качество → Проверки» (ADR 0072, «Экраны этапа 4»): встроенные — что сравнивают, сутки и срок, пороги, когда
// уведомлять, включена ли, «Вернуть значения ядра»; пороги «мало данных» — двумя полями; свои — список и форма.
let {
  report,
  setup,
  editable,
  onchanged,
}: {
  report: QualityReport;
  setup: SetupView;
  editable: boolean;
  onchanged: () => Promise<unknown>;
} = $props();

const builtin = $derived(
  report.checks.filter((_) => _.builtin && _.code !== 'low_data')
);
const lowData = $derived(report.checks.find((_) => _.code === 'low_data'));
const custom = $derived(report.checks.filter((_) => !_.builtin));
const full = $derived(customCount(report.checks) >= QUALITY_LIMITS.custom);

let editing = $state<CheckView | null>(null);
let rule = $state<{ readonly check: CheckView | null } | null>(null);

const saved = () => ((editing = null), (rule = null), onchanged());

const restore = (check: CheckView) =>
  ask({
    title: t('qualityForm.restoreTitle', {
      name: quoted(checkName(check.code, report.checks)),
    }),
    body: t('qualityForm.restoreBody'),
    confirm: t('qualityForm.restore'),
  }).then(
    (yes) =>
      void (
        yes &&
        api
          .send('POST', '/analytics/setup/check/remove', { code: check.code })
          .then(() => (notify(t('qualityForm.restored')), onchanged()), failed)
      )
  );

const archive = (check: CheckView, archived: boolean) =>
  api
    .send('POST', '/analytics/setup/check/archive', {
      code: check.code,
      archived,
    })
    .then(
      () => (
        notify(
          t(archived ? 'setupList.archived' : 'setupList.restored', {
            name: quoted(check.name),
          })
        ),
        onchanged()
      ),
      failed
    );

// Своя с результатами дней не удаляется — сервер отвечает `in_use`, экран предлагает архив.
const remove = (check: CheckView) =>
  ask({
    title: t('setupList.removeTitle', { name: quoted(check.name) }),
    body: t('setupList.removeBody'),
    confirm: t('setupList.remove'),
    tone: 'danger',
  }).then(
    (yes) =>
      void (
        yes &&
        api
          .send('POST', '/analytics/setup/check/remove', { code: check.code })
          .then(
            () => (
              notify(t('setupList.removed', { name: quoted(check.name) })),
              onchanged()
            ),
            (error) =>
              isApiError(error) && error.code === 'analytics.in_use'
                ? ask({
                    title: t('setupList.inUseTitle', {
                      name: quoted(check.name),
                    }),
                    body: t('qualityForm.inUseResults'),
                    confirm: t('setupList.archiveInstead'),
                  }).then(
                    (again) =>
                      void (
                        again &&
                        check.archivedAt === null &&
                        archive(check, true)
                      )
                  )
                : failed(error)
          )
      )
  );

// Пороги «мало данных»: два поля, сохранение — поправкой `low_data`; равны ядру — поправка не нужна.
let low = $state<{ people: NumberText; customers: NumberText }>({
  people: '',
  customers: '',
});
let lowBusy = $state(false);
$effect(
  () =>
    void (
      lowData &&
      (low = {
        people: String((lowData.params as Record<string, number>).people),
        customers: String((lowData.params as Record<string, number>).customers),
      })
    )
);
const lowErrors = defineFieldErrors(
  (field) => low[field as 'people' | 'customers']
);

const saveLow = (event: SubmitEvent) => (
  event.preventDefault(),
  ((found) =>
    void (Object.keys(found).length > 0
      ? lowErrors.show(found)
      : lowBusy ||
        ((lowBusy = true),
        api
          .send('PUT', '/analytics/setup/check', {
            code: 'low_data',
            params: Object.fromEntries(
              (['people', 'customers'] as const)
                .map((key) => [key, Number(low[key])] as const)
                .filter(
                  ({ 0: key, 1: value }) =>
                    value !== builtinCheck('low_data')?.defaults[key]
                )
            ),
          })
          .then(
            () => (notify(t('setupForm.saved')), onchanged()),
            (_) => void lowErrors.show({ people: describe(_) })
          )
          .finally(() => (lowBusy = false)))))(
    Object.fromEntries(
      (['people', 'customers'] as const)
        .filter(
          (key) =>
            !/^\d+$/.test(String(low[key] ?? '').trim()) ||
            !fitsParam(Number(low[key]), 'low')
        )
        .map((key) => [
          key,
          t('qualityForm.rangeHint', {
            min: PARAM_RANGES.low.min,
            max: PARAM_RANGES.low.max,
          }),
        ])
    )
  )
);

const ruleText = (check: CheckView): string =>
  ((rule) =>
    t('qualityForm.ruleText', {
      metric: metricText(rule, setup),
      compare: t(rule.compare === 'lt' ? 'qualityForm.lt' : 'qualityForm.gt'),
      threshold:
        rule.metric === 'revenue' && rule.currency
          ? money(rule.threshold, rule.currency, currentLanguage())
          : number(rule.threshold),
      period: periodText(rule.days),
    }))(check.params as ThresholdRule);

const paramsOf = (check: CheckView) =>
  Object.entries(check.params as Record<string, number>).map(
    ({ 0: key, 1: value }) => ({
      key,
      value,
      core: check.defaults?.[key] ?? value,
      percent: builtinCheck(check.code)?.params[key] === 'percent',
    })
  );

// Подпись порога уже говорит «%»: в таблице — только число.
const shown = (value: number, _percent: boolean): string => number(value);
</script>

<div class="checks">
  <section aria-labelledby="checks-builtin">
    <header class="intro">
      <div>
        <h3 id="checks-builtin">{t('qualityChecks.builtin')}</h3>
        <p>{t('qualityChecks.builtinHint')}</p>
      </div>
    </header>
    <ScrollTable label={t('qualityChecks.builtin')}>
      <table class="builtin">
        <thead>
          <tr>
            <th scope="col" class="pin">{t('quality.gridCheck')}</th>
            <th scope="col">{t('qualityChecks.days')}</th>
            <th scope="col">{t('qualityChecks.thresholds')}</th>
            <th scope="col">{t('qualityForm.notify')}</th>
            <th scope="col">{t('qualityChecks.state')}</th>
            {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each builtin as check (check.code)}
            <tr class:off={!check.enabled}>
              <th scope="row" class="pin">
                <span class="name">{checkName(check.code, report.checks)}</span>
                <small>{t(CHECK_ABOUT_KEYS[check.code] ?? 'quality.aboutUnknown')}</small>
                {#if check.note}<small class="note">{check.note}</small>{/if}
              </th>
              <td class="days"><span>{zoneText(check.zone, report.timeZone)}</span><small>{dueRule(check.code, report.timeZone)}</small></td>
              <td class="params">
                {#each paramsOf(check) as param (param.key)}
                  <span>{paramText(param.key)}: <strong>{shown(param.value, param.percent)}</strong>{#if param.value !== param.core}{' '}<small>({t('qualityChecks.core', { value: shown(param.core, param.percent) })})</small>{/if}</span>
                {:else}
                  <span class="muted">—</span>
                {/each}
              </td>
              <td>{t(NOTIFY_LABELS[check.notify])}</td>
              <td>{#if check.enabled}<Mark tone="ok">{t('qualityChecks.on')}</Mark>{:else}<Mark>{t('qualityChecks.off')}</Mark>{/if}{#if check.corrected}{' '}<Mark tone="accent">{t('qualityChecks.corrected')}</Mark>{/if}</td>
              {#if editable}
                <td class="row-actions">
                  <button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${checkName(check.code, report.checks)}`} onclick={() => (editing = check)}>{@html icons.pencil}{t('setupList.edit')}</button>
                  {#if check.corrected}<button type="button" class="ghost icon" aria-label={`${t('qualityForm.restore')}: ${checkName(check.code, report.checks)}`} title={t('qualityForm.restore')} onclick={() => restore(check)}>{@html icons.restore}</button>{/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </ScrollTable>
  </section>

  {#if lowData}
    <section class="frame low" aria-labelledby="checks-low">
      <h3 id="checks-low">{t('qualityChecks.lowTitle')}</h3>
      <p class="help">{t('qualityChecks.lowHint')}</p>
      <form class="low-form" novalidate onsubmit={saveLow}>
        {#each ['people', 'customers'] as const as key (key)}
          <label>
            <span>{paramText(key)}</span>
            <input type="number" inputmode="numeric" min={PARAM_RANGES.low.min} max={PARAM_RANGES.low.max} step="1" bind:value={low[key]} readonly={!editable} aria-invalid={lowErrors.current[key] ? 'true' : undefined} aria-describedby={`low-${key}-hint`} />
            {#if lowErrors.current[key]}<small id={`low-${key}-hint`} class="field-error">{lowErrors.current[key]}</small>{:else}<small id={`low-${key}-hint`}>{t('qualityChecks.lowCore', { n: number(builtinCheck('low_data')?.defaults[key] ?? 0) })}</small>{/if}
          </label>
        {/each}
        {#if editable}
          <div class="low-actions">
            <button type="submit" class="primary" aria-disabled={lowBusy}>{t('setupForm.save')}</button>
            {#if lowData.corrected}<button type="button" onclick={() => restore(lowData!)}>{@html icons.restore}{t('qualityForm.restore')}</button>{/if}
          </div>
        {/if}
      </form>
    </section>
  {/if}

  <section aria-labelledby="checks-custom">
    <header class="intro">
      <div>
        <h3 id="checks-custom">{t('qualityChecks.custom')}</h3>
        <p>{t('qualityChecks.customHint', { n: QUALITY_LIMITS.custom })}</p>
      </div>
      {#if editable}<button type="button" class="primary" aria-disabled={full} title={full ? t('qualityChecks.full', { n: QUALITY_LIMITS.custom }) : undefined} onclick={() => full || (rule = { check: null })}>{@html icons.plus}{t('qualityChecks.add')}</button>{/if}
    </header>
    {#if full && editable}<p class="help">{t('qualityChecks.full', { n: QUALITY_LIMITS.custom })}</p>{/if}
    {#if custom.length === 0}
      <p class="muted none">{t('qualityChecks.noCustom')}</p>
    {:else}
      <ScrollTable label={t('qualityChecks.custom')}>
        <table class="custom">
          <thead>
            <tr>
              <th scope="col" class="pin">{t('setupList.name')}</th>
              <th scope="col">{t('qualityChecks.rule')}</th>
              <th scope="col">{t('qualityForm.severity')}</th>
              <th scope="col">{t('qualityForm.notify')}</th>
              <th scope="col">{t('qualityChecks.state')}</th>
              {#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each custom as check (check.code)}
              <tr class:off={!check.enabled || check.archivedAt !== null}>
                <th scope="row" class="pin"><span class="name">{check.name}</span> <code class="muted">{check.code}</code>{#if check.note}<small class="note">{check.note}</small>{/if}</th>
                <td class="rule">{ruleText(check)}</td>
                <td>{t(SEVERITY_LABELS[(check.params as ThresholdRule).severity])}</td>
                <td>{t(NOTIFY_LABELS[check.notify])}</td>
                <td>{#if check.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{:else if check.enabled}<Mark tone="ok">{t('qualityChecks.on')}</Mark>{:else}<Mark>{t('qualityChecks.off')}</Mark>{/if}</td>
                {#if editable}
                  <td class="row-actions">
                    {#if check.archivedAt === null}<button type="button" class="ghost" aria-label={`${t('setupList.edit')}: ${check.name}`} onclick={() => (rule = { check })}>{@html icons.pencil}{t('setupList.edit')}</button>{/if}
                    <button type="button" class="ghost icon" aria-label={`${t(check.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}: ${check.name}`} title={t(check.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')} onclick={() => archive(check, check.archivedAt === null)}>{@html icons.restore}</button>
                    <button type="button" class="ghost icon danger" aria-label={`${t('setupList.remove')}: ${check.name}`} title={t('setupList.remove')} onclick={() => remove(check)}>{@html icons.trash}</button>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </ScrollTable>
    {/if}
  </section>
</div>

<CheckForm check={editing} checks={report.checks} onclose={() => (editing = null)} onsaved={saved} />
<RuleForm request={rule} {setup} checks={report.checks} timeZone={report.timeZone} onclose={() => (rule = null)} onsaved={saved} />

<style>
  .checks {
    display: grid;
    gap: 1.75rem;
    min-width: 0;
  }

  section {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: end;
    justify-content: space-between;
  }

  .intro div {
    flex: 1 1 24rem;
    max-width: 52rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
  }

  .intro p,
  .help,
  .none {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  table {
    min-width: 100%;
  }

  th,
  td {
    padding: 0.55rem 0.75rem;
    font-size: 0.8125rem;
    vertical-align: top;
    text-align: left;
  }

  .pin {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 14rem;
    max-width: 20rem;
    background: var(--surface);
    box-shadow: var(--pinned-shadow, none);
    font-weight: 400;
    overflow-wrap: break-word;
  }

  thead .pin {
    background: var(--sunken);
  }

  .pin small,
  .days small,
  .params span {
    display: block;
  }

  .name {
    font-weight: 600;
    hyphens: auto;
  }

  .pin small,
  .days small,
  .params small {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .note {
    margin-top: 0.2rem;
    white-space: pre-wrap;
  }

  .days {
    min-width: 11rem;
  }

  .params,
  .rule {
    min-width: 12rem;
  }

  /* Узко: закреплённая колонка уже — рядом видно и сутки проверки. */
  @media (width < 48rem) {
    .pin {
      min-width: 9.5rem;
      max-width: 11rem;
    }
  }

  tr.off .name {
    color: var(--muted);
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

  .low {
    padding: 1rem 1.1rem;
  }

  .low-form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: flex-start;
  }

  .low-form label {
    display: grid;
    flex: 1 1 13rem;
    gap: 0.25rem;
    max-width: 18rem;
  }

  .low-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-self: center;
  }
</style>
