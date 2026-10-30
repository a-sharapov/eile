<script lang="ts">
import { api } from '#lib/api.ts';
import { keepPickedScheme } from '#lib/appearance.svelte.ts';
import { t } from '#lib/i18n.ts';
import { describe } from '#lib/notices.svelte.ts';
import { loadSession, session } from '#lib/session.svelte.ts';
import AuthFrame from '#lib/ui/AuthFrame.svelte';
import PasswordInput from '#lib/ui/PasswordInput.svelte';
import { invalidField } from '#lib/validity.ts';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

const token = page.url.searchParams.get('token') ?? '';

let name = $state('');
let email = $state('');
let password = $state('');
let busy = $state(false);
let error = $state<string | null>(null);
let bad = $state<string | null>(null);

const _INVALID: Readonly<Record<string, string>> = {
  'setup-email': t('users.emailInvalid'),
  'setup-password': t('users.passwordHint'),
};

// Администратор уже есть: форма не нужна, ведём ко входу.
$effect(() => void loadSession().then(undefined, () => undefined));
const closed = $derived(session.loaded && !session.setup);

// Кнопка не гаснет через disabled: иначе после ошибки фокус улетает на body.
const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  ((invalid) =>
    invalid &&
    ((error = invalid.text),
    (bad = invalid.field),
    document.querySelector<HTMLElement>(`#${invalid.field}`)?.focus(),
    true))(invalidField(event.currentTarget as HTMLFormElement, _INVALID)) ||
    busy ||
    !token ||
    ((busy = true),
    (error = null),
    api
      .send('POST', '/setup', { token, name, email, password })
      .then(loadSession)
      .then(keepPickedScheme)
      .then(() => goto(resolve('/(app)/pages')))
      .then(undefined, (_) => void (error = describe(_)))
      .finally(() => (busy = false)))
);
</script>

<svelte:head><title>{t('setup.title')} — {t('app.name')}</title></svelte:head>

<AuthFrame title={t('setup.title')}>
  {#if closed}
    <div class="closed">
      <p class="muted">{t('setup.closed')}</p>
      <a class="button primary" href={resolve('/login')}>{t('setup.toLogin')}</a>
    </div>
  {:else}
  <form novalidate onsubmit={submit} oninput={() => ((bad = null), (error = null))}>
    <p class="muted">{token ? t('setup.lead') : t('setup.noToken')}</p>
    <label>{t('setup.name')}<input autocomplete="name" bind:value={name} /></label>
    <label>{t('login.email')}<input id="setup-email" type="email" autocomplete="username" required aria-invalid={bad === 'setup-email' || undefined} bind:value={email} /></label>
    <label>
      <span id="setup-password-label">{t('users.password')}</span>
      <PasswordInput id="setup-password" labelledby="setup-password-label" autocomplete="new-password" minlength={10} required aria-invalid={bad === 'setup-password' || undefined} bind:value={password} />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary submit" aria-disabled={busy || !token}>{t('setup.submit')}</button>
  </form>
  {/if}
</AuthFrame>

<style>
  form,
  .closed {
    display: grid;
    gap: 1.125rem;
  }

  p {
    margin: 0;
  }

  .error {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 45%, var(--line));
    border-radius: var(--radius);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 0.875rem;
  }

  .submit {
    min-height: 2.75rem;
    margin-top: 0.25rem;
  }
</style>
