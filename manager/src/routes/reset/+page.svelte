<script lang="ts">
import { api, isApiError } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { describe } from '#lib/notices.svelte.ts';
import { loadSession } from '#lib/session.svelte.ts';
import AuthFrame from '#lib/ui/AuthFrame.svelte';
import PasswordInput from '#lib/ui/PasswordInput.svelte';
import { invalidField } from '#lib/validity.ts';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

const token = page.url.searchParams.get('token') ?? '';
const _GONE = 'identity.reset_invalid';

let password = $state('');
let busy = $state(false);
let error = $state<string | null>(null);
let bad = $state(false);
// Ссылку проверяем сразу: по устаревшей не нужно придумывать пароль впустую.
let link = $state<'checking' | 'valid' | 'invalid'>(
  token ? 'checking' : 'invalid'
);
let passwordInput = $state<HTMLElement>();

$effect(() => void loadSession().then(undefined, () => undefined));
$effect(
  () =>
    void (
      token &&
      api.send<{ valid: boolean }>('POST', '/password/check', { token }).then(
        (_) => void (link = _.valid ? 'valid' : 'invalid'),
        () => void (link = 'invalid')
      )
    )
);
$effect(
  () =>
    void (
      link === 'valid' &&
      passwordInput?.querySelector<HTMLInputElement>('input')?.focus()
    )
);

const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  ((invalid) =>
    invalid &&
    ((error = invalid.text),
    (bad = true),
    passwordInput?.querySelector<HTMLInputElement>('input')?.focus(),
    true))(
    invalidField(event.currentTarget as HTMLFormElement, {
      'reset-password': t('reset.hint'),
    })
  ) ||
    busy ||
    ((busy = true),
    (error = null),
    api
      .send<{ email: string }>('POST', '/password/reset', { token, password })
      .then((_) =>
        goto(
          `${resolve('/login')}?reset=done&email=${encodeURIComponent(_.email)}`,
          { replace: true }
        )
      )
      .then(undefined, (_) =>
        // Ссылка погасла, пока придумывали пароль, — тот же спокойный экран, что и при открытии.
        isApiError(_) && _.code === _GONE
          ? void (link = 'invalid')
          : void (error = describe(_))
      )
      .finally(() => (busy = false)))
);
</script>

<svelte:head><title>{t('reset.title')} — {t('app.name')}</title></svelte:head>

<AuthFrame title={t('reset.title')}>
  {#if link === 'invalid'}
    <div class="stack">
      <p class="muted">{t('reset.invalid')}</p>
      <a class="button primary" href={resolve('/forgot')}>{t('reset.again')}</a>
      <a class="back" href={resolve('/login')}>{t('forgot.toLogin')}</a>
    </div>
  {:else if link === 'valid'}
    <form class="stack" novalidate onsubmit={submit} oninput={() => ((bad = false), (error = null))}>
      <label bind:this={passwordInput}>
        <span id="reset-password-label">{t('reset.password')}</span>
        <PasswordInput id="reset-password" labelledby="reset-password-label" autocomplete="new-password" minlength={10} required aria-invalid={bad || undefined} aria-describedby={error ? 'reset-error' : 'reset-hint'} bind:value={password} />
        <small id="reset-hint">{t('reset.hint')}</small>
      </label>
      {#if error}<p id="reset-error" class="error" role="alert">{error}</p>{/if}
      <button class="primary submit" aria-disabled={busy}>{t('reset.submit')}</button>
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
