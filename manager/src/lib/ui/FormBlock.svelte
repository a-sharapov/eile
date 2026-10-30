<script lang="ts">
import type { Snippet } from 'svelte';
import { forms, loadForms } from '#lib/forms.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import { resolve } from '$app/paths';

let {
  name = $bindable(''),
  actions,
}: {
  name: string;
  actions?: Snippet;
} = $props();

const uid = $props.id();

$effect(
  () => void (forms.items === null && loadForms().then(undefined, failed))
);

const known = $derived(forms.items?.some((_) => _.name === name) ?? true);
</script>

<div class="form-block" role="group" aria-label={`${t('formsBlock.title')} ${name}`}>
  <div class="head">
    <span class="title">{@html icons.forms}<strong>{t('formsBlock.title')}</strong> <code>[#Form:{name}]</code></span>
    {@render actions?.()}
  </div>
  <div class="body">
    <label for="{uid}-form">{t('formsBlock.choose')}</label>
    <div class="row">
      <select id="{uid}-form" bind:value={name}>
        {#if !known}<option value={name}>{name} — {t('formsBlock.missing')}</option>{/if}
        {#each forms.items ?? [] as form (form.name)}
          <option value={form.name}>{form.title}</option>
        {/each}
      </select>
      {#if session.user?.role === 'admin' && known && name}
        <a class="button ghost" href={resolve('/(app)/forms/[name]', { name })}>{t('formsBlock.edit')}</a>
      {/if}
    </div>
    {#if forms.items !== null && forms.items.length === 0}
      <p class="muted">{t('formsBlock.none')}</p>
    {:else if !known}
      <p class="field-error">{t('formsBlock.missingHint')}</p>
    {/if}
  </div>
</div>

<style>
  .form-block {
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .head {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 0.0625rem solid var(--line);
    background: var(--sunken);
    border-radius: var(--radius-l) var(--radius-l) 0 0;
  }

  .title {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }

  .title :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--accent);
  }

  .body {
    display: grid;
    gap: 0.4rem;
    padding: 0.75rem;
  }

  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  select {
    flex: 1;
  }

  p {
    margin: 0;
    font-size: 0.875rem;
  }
</style>
