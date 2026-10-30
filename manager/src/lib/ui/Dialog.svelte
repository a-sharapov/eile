<script lang="ts">
import { dialog, settle } from '#lib/dialog.svelte.ts';
import { t } from '#lib/i18n.ts';
import PasswordInput from '#lib/ui/PasswordInput.svelte';

let element: HTMLDialogElement;
let value = $state('');
// Ошибка поля — под ним, текстом подсказки, а не системным «пузырём» поверх кнопок.
let invalid = $state<string | null>(null);

const current = $derived(dialog.current);

$effect(() => {
  void (current
    ? ((value = current.input?.value ?? ''),
      (invalid = null),
      element.open || element.showModal())
    : element.open && element.close());
});

const submit = (event: SubmitEvent) =>
  ((field) =>
    ((problem) =>
      problem && field
        ? ((invalid = problem), field.focus())
        : settle(current?.input ? value : 'ok'))(
      field && !field.checkValidity()
        ? (current?.input?.hint ?? field.validationMessage)
        : (current?.input?.validate?.(value) ?? null)
    ))(
    (event.preventDefault(),
    (event.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>(
      'input'
    ))
  );
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), settle(null))} aria-labelledby="dialog-title">
  {#if current}
    <form novalidate onsubmit={submit} oninput={() => (invalid = null)}>
      <h2 id="dialog-title">{current.title}</h2>
      {#if current.body}<p>{current.body}</p>{/if}
      {#if current.items?.length}
        <ul>
          {#each current.items as item (item)}<li>{item}</li>{/each}
        </ul>
      {/if}
      {#if current.input}
        <label>
          <span id="dialog-label">{current.input.label}</span>
          {#if current.input.options}
            <!-- svelte-ignore a11y_autofocus -->
            <select autofocus bind:value aria-describedby={current.input.hint ? 'dialog-hint' : undefined}>
              {#each current.input.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
            </select>
          {:else if current.input.type === 'password'}
            <!-- svelte-ignore a11y_autofocus -->
            <PasswordInput
              labelledby="dialog-label"
              minlength={current.input.minlength}
              autocomplete="new-password"
              required={!current.input.optional}
              autofocus
              aria-invalid={invalid ? 'true' : undefined}
              aria-describedby={current.input.hint || invalid ? 'dialog-hint' : undefined}
              bind:value
            />
          {:else}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type={current.input.type}
              aria-invalid={invalid ? 'true' : undefined}
              minlength={current.input.minlength}
              autocomplete="off"
              required={!current.input.optional}
              autofocus
              list={current.input.suggestions ? 'dialog-suggestions' : undefined}
              aria-describedby={[current.input.hint || invalid ? 'dialog-hint' : '', current.input.explain ? 'dialog-explain' : ''].filter(Boolean).join(' ') || undefined}
              bind:value
            />
            {#if current.input.suggestions}
              <datalist id="dialog-suggestions">
                {#each current.input.suggestions as suggestion (suggestion.value)}<option value={suggestion.value}>{suggestion.label}</option>{/each}
              </datalist>
            {/if}
          {/if}
          {#if current.input.explain}<small id="dialog-explain" class="explain" aria-live="polite">{invalid ? '' : current.input.explain(value)}</small>{/if}
          {#if invalid}<small id="dialog-hint" class="field-error">{invalid}</small>{:else if current.input.hint}<small id="dialog-hint">{current.input.hint}</small>{/if}
        </label>
      {/if}
      <div class="actions">
        <button type="button" onclick={() => settle(null)}>{t('common.cancel')}</button>
        <button class={current.tone === 'danger' ? 'primary destructive' : 'primary'}>{current.confirm}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 28rem);
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-big);
  }

  dialog::backdrop {
    background: oklch(15% 0.02 var(--hue) / 0.35);
  }

  form {
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
    text-wrap: balance;
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  ul {
    max-height: 12rem;
    margin: 0;
    padding-left: 1.25rem;
    overflow: auto;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  small {
    color: var(--muted);
    font-size: 0.75rem;
  }

  /* Подсказки адресов — без системной стрелки: единственного значка не из набора Lucide. */
  input[list]::-webkit-calendar-picker-indicator {
    display: none !important;
  }

  small.field-error {
    color: var(--danger);
  }

  .explain {
    color: var(--text);
    font-size: 0.8125rem;
  }

  .destructive {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--accent-text);
  }
</style>
