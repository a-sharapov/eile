<script lang="ts">
import {
  hostPattern,
  LABEL_LIMITS,
  REFERRER_KIND_LABELS,
  REFERRER_KINDS,
} from '#lib/analytics.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import type { ReferrerRule, SetupView } from '#lib/types.ts';
import { type Draft, describedBy } from './drafts.ts';
import PartPairs from './PartPairs.svelte';
import type { SetupRow } from './setup.ts';

// Соответствие реферера: вид (хост, любой другой сайт, прямой заход), шаблон хоста и значения частей посещения.
let {
  draft = $bindable(),
  setup,
  existing,
  errors,
  id,
}: {
  draft: Draft;
  setup: SetupView;
  existing: SetupRow | null;
  errors: Readonly<Record<string, string>>;
  id: string;
} = $props();

const _HINTS: Readonly<Record<ReferrerRule['kind'], MessageKey>> = {
  host: 'referrers.kindHostHint',
  any: 'referrers.kindAnyHint',
  none: 'referrers.kindNoneHint',
};

// «Любой другой сайт» и «прямой заход» — по одному на сайт: занятый вид назван, но не выбирается.
const holder = (kind: ReferrerRule['kind']) =>
  kind === 'host'
    ? undefined
    : setup.referrers.find((_) => _.kind === kind && _.code !== draft.code);

const parts = $derived(
  setup.dictionaries.filter(
    (_) =>
      _.purpose === 'parts' &&
      (_.archivedAt === null ||
        Object.hasOwn((existing?.parts ?? {}) as object, _.code))
  )
);
const normalized = $derived(
  draft.host.trim() === '' ? null : hostPattern(draft.host)
);
</script>

<fieldset aria-describedby={describedBy(id, errors, 'rule', false)}>
  <legend>{t('referrers.kind')}</legend>
  {#each REFERRER_KINDS as kind (kind)}
    {@const other = holder(kind)}
    <label class="option" class:off={other !== undefined}>
      <input type="radio" name={`${id}-rule`} value={kind} bind:group={draft.rule} disabled={other !== undefined} />
      <span>
        <strong>{t(REFERRER_KIND_LABELS[kind])}</strong>
        <small class="help">{other ? t('referrers.kindTaken', { name: quoted(other.name) }) : t(_HINTS[kind])}</small>
      </span>
    </label>
  {/each}
  {#if errors.rule}<small id={`${id}-rule-error`} class="field-error" data-error tabindex="-1">{errors.rule}</small>{/if}
</fieldset>

{#if draft.rule === 'host'}
  <label>
    <span>{t('referrers.host')}</span>
    <input class="code" bind:value={draft.host} maxlength={LABEL_LIMITS.host + 4} spellcheck="false" autocomplete="off" autocapitalize="none" placeholder="example.com" aria-invalid={errors.host ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'host')} />
    {#if errors.host}<small id={`${id}-host-error`} class="field-error">{errors.host}</small>{/if}
    <small id={`${id}-host-hint`}>
      {t('referrers.hostHelp')}
      {#if normalized !== null && normalized !== draft.host.trim()}<span class="block">{t('referrers.hostSaved')} <code>{normalized}</code></span>{/if}
    </small>
  </label>
{/if}

<PartPairs bind:draft {setup} {parts} previous={(existing?.parts ?? {}) as Record<string, string>} host={draft.rule === 'any'} {errors} {id} legend={t('referrers.parts')} hint={t(draft.rule === 'any' ? 'referrers.partsAnyHint' : 'referrers.partsHint')} empty={t('referrers.noParts')} />

<style>
  .option.off {
    opacity: 0.6;
    cursor: default;
  }

  .block {
    display: block;
    margin-top: 0.2rem;
  }
</style>
