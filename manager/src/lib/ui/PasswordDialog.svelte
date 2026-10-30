<script lang="ts">
import { api, isApiError } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import PasswordInput from '#lib/ui/PasswordInput.svelte';

let {
  open = $bindable(false),
  onclose,
}: { open: boolean; onclose?: () => void } = $props();

let element: HTMLDialogElement;
let current = $state('');
let password = $state('');
let busy = $state(false);
let problem = $state<{ field: 'current' | 'password'; text: string } | null>(
  null
);

$effect(() => {
  void (open
    ? ((current = ''),
      (password = ''),
      (problem = null),
      element.open || element.showModal())
    : element.open && element.close());
});

// Неверный текущий пароль — ошибка поля «Текущий», слабый новый — поля «Новый».
const _FIELDS: Readonly<Record<string, 'current' | 'password'>> = {
  'identity.invalid_credentials': 'current',
  'identity.too_many_attempts': 'current',
  'identity.weak_password': 'password',
};

const _TEXTS: Readonly<Record<string, string>> = {
  'identity.invalid_credentials': t('password.wrongCurrent'),
};

// Пустое или короткое поле — ошибка у поля, а не «пузырь» браузера поверх кнопок.
const _missing = (): typeof problem =>
  current === ''
    ? { field: 'current', text: t('password.currentMissing') }
    : password.length < 10
      ? { field: 'password', text: t('password.newHint') }
      : null;

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  ((missing) =>
    missing &&
    ((problem = missing),
    element
      .querySelector<HTMLInputElement>(
        missing.field === 'current' ? '#password-current' : '#password-new'
      )
      ?.focus(),
    true))(_missing()) ||
    busy ||
    ((busy = true),
    api
      .send('PUT', '/session/password', { current, password })
      .then(() => ((open = false), notify(t('password.changed'))))
      .then(undefined, (error) =>
        ((field) =>
          field
            ? void (problem = {
                field,
                text:
                  _TEXTS[isApiError(error) ? error.code : ''] ??
                  describe(error),
              })
            : notify(describe(error), 'error'))(
          isApiError(error) ? _FIELDS[error.code] : undefined
        )
      )
      .finally(() => (busy = false)))
);
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), (open = false))} onclose={() => onclose?.()} aria-labelledby="password-title">
  {#if open}
    <form novalidate onsubmit={save} oninput={() => (problem = null)}>
      <h2 id="password-title">{t('password.title')}</h2>
      <p class="muted">{t('password.body')}</p>
      <label>
        <span>{t('password.current')}<span class="required" aria-hidden="true"> *</span></span>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="password-current" type="password" autocomplete="current-password" required autofocus bind:value={current} aria-invalid={problem?.field === 'current' ? 'true' : undefined} aria-describedby={problem?.field === 'current' ? 'password-current-error' : undefined} />
        {#if problem?.field === 'current'}<small id="password-current-error" class="field-error">{problem.text}{#if current !== ''} {t('password.lockHint')}{/if}</small>{/if}
      </label>
      <label>
        <span id="password-new-label">{t('password.new')}<span class="required" aria-hidden="true"> *</span></span>
        <PasswordInput id="password-new" labelledby="password-new-label" autocomplete="new-password" required minlength={10} bind:value={password} aria-invalid={problem?.field === 'password' ? 'true' : undefined} aria-describedby="password-new-help" />
        {#if problem?.field === 'password'}<small id="password-new-help" class="field-error">{problem.text}</small>{:else}<small id="password-new-help">{t('password.newHint')}</small>{/if}
      </label>
      <div class="actions">
        <button type="button" onclick={() => (open = false)}>{t('common.cancel')}</button>
        <button class="primary" aria-disabled={busy}>{t('password.save')}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 26rem);
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-big);
  }

  dialog::backdrop {
    background: oklch(15% 0.02 var(--hue) / 0.35);
  }

  form {
    display: grid;
    gap: 1.25rem;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: -0.5rem 0 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
