<script lang="ts">
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { describe } from '#lib/notices.svelte.ts';
import { loadSession, session } from '#lib/session.svelte.ts';
import AuthFrame from '#lib/ui/AuthFrame.svelte';
import { invalidField } from '#lib/validity.ts';
import { resolve } from '$app/paths';
import { page } from '$app/state';

// Почта, набранная на входе, приходит в адресе: второй раз её не вводят.
let email = $state(page.url.searchParams.get('email') ?? '');
let busy = $state(false);
let sent = $state(false);
let error = $state<string | null>(null);
let bad = $state(false);
let emailInput = $state<HTMLInputElement>();

$effect(() => void loadSession().then(undefined, () => undefined));
$effect(() => emailInput?.focus());

const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  ((invalid) =>
    invalid &&
    ((error = invalid.text), (bad = true), emailInput?.focus(), true))(
    invalidField(event.currentTarget as HTMLFormElement, {
      'forgot-email': t(
        email.trim() ? 'users.emailInvalid' : 'login.emailMissing'
      ),
    })
  ) ||
    busy ||
    ((busy = true),
    (error = null),
    api
      .send('POST', '/password/forgot', { email })
      .then(() => void (sent = true))
      .then(undefined, (_) => void (error = describe(_)))
      .finally(() => (busy = false)))
);
</script>

<svelte:head><title>{t('forgot.title')} — {t('app.name')}</title></svelte:head>

<AuthFrame title={t('forgot.title')}>
  {#if session.loaded && !session.passwordReset}
    <div class="stack">
      <p class="muted">{t('forgot.unavailable')}</p>
      <a class="button primary" href={resolve('/login')}>{t('forgot.toLogin')}</a>
    </div>
  {:else if sent}
    <div class="stack" role="status">
      <p>{t('forgot.sent')}</p>
      <a class="button primary" href={resolve('/login')}>{t('forgot.toLogin')}</a>
    </div>
  {:else}
    <form class="stack" novalidate onsubmit={submit} oninput={() => ((bad = false), (error = null))}>
      <p class="muted">{t('forgot.lead')}</p>
      <label>{t('login.email')}<input id="forgot-email" type="email" autocomplete="username" required aria-invalid={bad || undefined} aria-describedby={error ? 'forgot-error' : undefined} bind:this={emailInput} bind:value={email} /></label>
      {#if error}<p id="forgot-error" class="error" role="alert">{error}</p>{/if}
      <button class="primary submit" aria-disabled={busy}>{t('forgot.submit')}</button>
      <a class="back" href={resolve('/login')}>{t('forgot.toLogin')}</a>
    </form>
  {/if}
</AuthFrame>

<style>
  .stack {
    display: grid;
    gap: 1.125rem;
  }

  p {
    margin: 0;
  }

  .error {
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

  .back {
    justify-self: center;
    color: var(--muted);
    font-size: 0.8125rem;
    text-decoration: none;
    text-underline-offset: 0.2em;
  }

  .back:hover {
    color: var(--text);
    text-decoration: underline;
  }
</style>
