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

// После сброса пароля почта уже известна — остаётся ввести новый пароль.
const prefilled = page.url.searchParams.get('email') ?? '';
let email = $state(prefilled);
let password = $state('');
let busy = $state(false);
let emailInput = $state<HTMLInputElement>();
// Сюда приводит страница сброса после нового пароля.
const resetDone = page.url.searchParams.get('reset') === 'done';
// Набранная почта переходит на страницу сброса — второй раз её вводить не нужно.
const forgotHref = $derived(
  `${resolve('/forgot')}${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`
);

// Название сайта для левой части — из публичной сессии; ошибка связи тут не мешает входу.
$effect(() => void loadSession().then(undefined, () => undefined));

// Вход — первое, что делают на этой странице: курсор сразу в поле почты, а если она уже есть — в пароль.
$effect(
  () =>
    void (
      emailInput &&
      (prefilled
        ? document.querySelector<HTMLElement>('#login-password')
        : emailInput
      )?.focus()
    )
);
let error = $state<string | null>(null);
// Поле с ошибкой проверки: помечается для читалки и получает фокус.
let bad = $state<string | null>(null);

// Пустая почта — «введите», не «в виде name@example.com»: человек ещё ничего не написал.
const _invalidTexts = (): Readonly<Record<string, string>> => ({
  'login-email': t(email.trim() ? 'users.emailInvalid' : 'login.emailMissing'),
  'login-password': t('login.passwordMissing'),
});

// Кнопка не гаснет через disabled: иначе после ошибки фокус улетает на body.
const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  ((invalid) =>
    invalid &&
    ((error = invalid.text),
    (bad = invalid.field),
    document.querySelector<HTMLElement>(`#${invalid.field}`)?.focus(),
    true))(
    invalidField(event.currentTarget as HTMLFormElement, _invalidTexts())
  ) ||
    busy ||
    ((busy = true),
    (error = null),
    api
      .send('POST', '/session', { email, password })
      .then(loadSession)
      .then(keepPickedScheme)
      // Сайт ещё не назван — администратора встречают настройки: с них начинается работа.
      .then(() =>
        goto(
          session.user?.role === 'admin' && session.site.name === t('app.name')
            ? resolve('/(app)/settings')
            : resolve('/(app)/pages')
        )
      )
      .then(undefined, (_) => void (error = describe(_)))
      .finally(() => (busy = false)))
);
</script>

<svelte:head><title>{t('login.title')} — {t('app.name')}</title></svelte:head>

<AuthFrame title={t('login.title')}>
  <form novalidate onsubmit={submit} oninput={() => ((bad = null), (error = null))}>
    {#if resetDone && !error}<p class="done" role="status">{t('login.resetDone')}</p>{/if}
    <label>{t('login.email')}<input id="login-email" type="email" autocomplete="username" required aria-invalid={bad === 'login-email' || undefined} aria-describedby={bad === 'login-email' ? 'login-error' : undefined} bind:this={emailInput} bind:value={email} /></label>
    <label>
      <span id="login-password-label">{t('login.password')}</span>
      <PasswordInput id="login-password" labelledby="login-password-label" autocomplete="current-password" required aria-invalid={bad === 'login-password' || undefined} aria-describedby={bad === 'login-password' ? 'login-error' : undefined} bind:value={password} />
    </label>
    {#if session.passwordReset}<a class="forgot" href={forgotHref}>{t('login.forgot')}</a>{/if}
    {#if error}<p id="login-error" class="error" role="alert">{error}</p>{/if}
    <button class="primary submit" aria-disabled={busy}>{t('login.submit')}</button>
  </form>
</AuthFrame>

<style>
  form {
    display: grid;
    gap: 1.125rem;
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

  /* Тихая ссылка под паролем: видна, но не спорит с кнопкой входа. */
  .forgot {
    justify-self: end;
    margin-top: -0.5rem;
    color: var(--muted);
    font-size: 0.8125rem;
    text-decoration: none;
    text-underline-offset: 0.2em;
  }

  .forgot:hover {
    color: var(--text);
    text-decoration: underline;
  }

  .done {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--ok) 35%, var(--line));
    border-radius: var(--radius);
    background: var(--ok-soft);
    color: var(--ok);
    font-size: 0.875rem;
  }
</style>
