<script lang="ts">
import { t } from '#lib/i18n.ts';
import { describe } from '#lib/notices.svelte.ts';

let {
  label,
  oncreate,
  oncancel,
  existing,
}: {
  label: string;
  oncreate: (name: string) => Promise<unknown>;
  oncancel: () => void;
  /** Адрес элемента с таким именем или null: занятое имя не затирает чужой код. */
  existing: (name: string) => string | null;
} = $props();

let name = $state('');
let input = $state<HTMLInputElement>();

// autofocus Svelte срабатывает, только если фокус на body; форму открывают кнопкой — фокусируем сами.
$effect(() => input?.focus());
let busy = $state(false);
let error = $state<string | null>(null);

const taken = $derived(name ? existing(name) : null);

// Своя проверка имени вместо «пузыря» браузера: ошибка — под полем, текстом подсказки.
const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  input && !input.checkValidity()
    ? ((error = t('elements.nameHint')), input.focus())
    : taken === null &&
      ((busy = true),
      oncreate(name)
        .then(undefined, (_) => void (error = describe(_)))
        .finally(() => (busy = false)))
);
</script>

<form class="name-form" novalidate onsubmit={submit}>
  <label>
    {label}
    <input
      class="code"
      bind:this={input}
      required
      pattern="[A-Z][A-Za-z0-9]*"
      title={t('elements.nameHint')}
      bind:value={name}
      aria-invalid={taken || error ? 'true' : undefined}
      aria-describedby="name-form-help"
      oninput={() => (error = null)}
      onkeydown={(e) => void (e.key === 'Escape' && oncancel())}
    />
  </label>
  {#if taken}
    <small id="name-form-help" class="field-error">{t('elements.taken')} <a href={taken}>{t('elements.openExisting')}</a></small>
  {:else if error}
    <small id="name-form-help" class="field-error">{error}</small>
  {:else}
    <small id="name-form-help" class="muted">{t('elements.nameHint')}</small>
  {/if}
  <div class="actions">
    <button class="primary" aria-disabled={busy || taken !== null}>{t('elements.create')}</button>
    <button type="button" onclick={oncancel}>{t('common.cancel')}</button>
  </div>
</form>

<style>
  .name-form {
    display: grid;
    gap: 0.4rem;
    margin: 0.25rem 0.5rem 0.75rem;
    padding: 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  small {
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
</style>
