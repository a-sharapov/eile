<script lang="ts">
import {
  GO_PREFIX,
  isCode,
  LABEL_LIMITS,
  LABEL_TOKEN,
} from '#lib/analytics.ts';
import { goUrl } from '#lib/analytics-urls.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { SetupView } from '#lib/types.ts';
import { partOf } from '../names.ts';
import { type Draft, describedBy } from './drafts.ts';
import PartPairs from './PartPairs.svelte';
import type { SetupRow } from './setup.ts';

// Переход: отправитель со схемой, адрес назначения с {label}, заданные заранее части, его адрес на сайте и
// пример ссылки для шаблона — оба с «Скопировать».
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

// Отправитель перехода — со схемой метки; в архиве — только прежний.
const senders = $derived(
  setup.senders.filter(
    (sender) =>
      setup.schemas.some(
        (_) =>
          _.sender === sender.code &&
          (_.archivedAt === null || existing?.sender === sender.code)
      ) &&
      (sender.archivedAt === null || existing?.sender === sender.code)
  )
);
const schema = $derived(setup.schemas.find((_) => _.sender === draft.sender));
const previous = $derived((existing?.parts ?? {}) as Record<string, string>);
const parts = $derived(
  (schema?.parts ?? []).flatMap((code) =>
    ((part) =>
      part && (part.archivedAt === null || Object.hasOwn(previous, code))
        ? [part]
        : [])(partOf(setup, code))
  )
);
const ready = $derived(isCode(draft.code, 'link'));
const address = $derived(goUrl(session.site.url, ready ? draft.code : ''));
// Ссылка для шаблона — путь сайта: так она работает и на копии сайта по другому адресу.
const tag = $derived(
  `<a href="${GO_PREFIX}${ready ? draft.code : ''}">${(draft.name.trim() || t('links.tagText')).replace(/[&<>"]/g, (_) => `&#${_.charCodeAt(0)};`)}</a>`
);

// Отправитель сменился — части прежней схемы ему не годятся.
const pickSender = (sender: string) => (
  (draft.sender = sender),
  (draft.pairs = draft.pairs.filter((_) =>
    setup.schemas.find((s) => s.sender === sender)?.parts.includes(_.part)
  ))
);

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('common.copied')), failed);
</script>

<label>
  <span>{t('links.sender')}</span>
  <select value={draft.sender} onchange={(e) => pickSender(e.currentTarget.value)} aria-invalid={errors.sender ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'sender')}>
    <option value="" disabled>{t('setupForm.pick')}</option>
    {#each senders as sender (sender.code)}<option value={sender.code}>{sender.name} · {sender.code}</option>{/each}
  </select>
  {#if errors.sender}<small id={`${id}-sender-error`} class="field-error">{errors.sender}</small>{/if}
  <small id={`${id}-sender-hint`}>{t(senders.length === 0 ? 'links.noSchemas' : 'links.senderHint')}</small>
</label>

<label>
  <span>{t('links.target')}</span>
  <input class="code" inputmode="url" bind:value={draft.target} maxlength={LABEL_LIMITS.target + 20} spellcheck="false" autocomplete="off" autocapitalize="none" placeholder={`https://t.me/YourBot?start=${LABEL_TOKEN}`} aria-invalid={errors.target ? 'true' : undefined} aria-describedby={describedBy(id, errors, 'target')} />
  {#if errors.target}<small id={`${id}-target-error`} class="field-error">{errors.target}</small>{/if}
  <small id={`${id}-target-hint`}>{t('links.targetHelp', { n: LABEL_LIMITS.target })}</small>
</label>

<PartPairs bind:draft {setup} {parts} {previous} {errors} {id} legend={t('links.parts')} hint={t('links.partsHint')} empty={t(draft.sender === '' ? 'links.pickSenderFirst' : 'links.noSchemaParts')} />

<div class="copies">
  <div class="copy">
    <span class="label" id={`${id}-go`}>{t('links.address')}</span>
    <div class="row">
      <code aria-labelledby={`${id}-go`} class:pending={!ready}>{address}{#if !ready}<span class="muted">{t('links.codePlaceholder')}</span>{/if}</code>
      <button type="button" class="ghost icon" aria-label={t('links.copyAddress')} title={t('links.copyAddress')} aria-disabled={!ready} onclick={() => ready && copy(address)}>{@html icons.copy}</button>
    </div>
    <small class="help">{t('links.addressHint')}</small>
  </div>
  <div class="copy">
    <span class="label" id={`${id}-tag`}>{t('links.tag')}</span>
    <div class="row">
      <code aria-labelledby={`${id}-tag`}>{tag}</code>
      <button type="button" class="ghost icon" aria-label={t('links.copyTag')} title={t('links.copyTag')} aria-disabled={!ready} onclick={() => ready && copy(tag)}>{@html icons.copy}</button>
    </div>
    <small class="help">{t('links.tagHint')}</small>
  </div>
</div>

<style>
  .copies {
    display: grid;
    gap: 0.85rem;
    padding-top: 0.25rem;
  }

  .copy {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 550;
  }

  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  code {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    overflow-wrap: anywhere;
  }

  .row button {
    flex: none;
  }

  .row :global(svg) {
    width: 1rem;
    height: 1rem;
  }
</style>
