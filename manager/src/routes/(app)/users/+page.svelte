<script lang="ts">
import { tick } from 'svelte';
import { api, isApiError } from '#lib/api.ts';
import { ask, askValue } from '#lib/dialog.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { Role, User } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import PasswordInput from '#lib/ui/PasswordInput.svelte';
import { freshForm, invalidField } from '#lib/validity.ts';

const _ROLES = { admin: 'users.admin', editor: 'users.editor' } as const;

let users = $state<User[]>([]);
let form = $state({
  email: '',
  name: '',
  password: '',
  role: 'editor' as Role,
});

const load = () => api.get<User[]>('/users').then((_) => (users = _));

const loading = defineLoad(load);

$effect(() => void loading.retry());

// Ошибки формы нового пользователя — у своего поля.
const _FIELD_ERRORS: Readonly<Record<string, string>> = {
  'identity.email_taken': 'user-email',
  'identity.invalid_email': 'user-email',
  'identity.weak_password': 'user-password',
};

let problem = $state<{ field: string; text: string } | null>(null);

const invalid = (field: string): 'true' | undefined =>
  problem?.field === field ? 'true' : undefined;

const showProblem = (error: unknown): void =>
  ((field) =>
    field
      ? ((problem = { field, text: describe(error) }),
        void tick().then(() =>
          document.querySelector<HTMLElement>(`#${field}`)?.focus()
        ))
      : failed(error))(
    isApiError(error) ? _FIELD_ERRORS[error.code] : undefined
  );

// После успеха форма чистая и снова с ролью «Редактор»: права администратора — только явным выбором.
const _INVALID: Readonly<Record<string, string>> = {
  'user-email': t('users.emailInvalid'),
  'user-password': t('users.passwordHint'),
};

const send = (element: HTMLFormElement) =>
  api
    .send('POST', '/users', form)
    .then(load)
    .then(() =>
      freshForm(element, () => {
        form = { email: '', name: '', password: '', role: 'editor' };
      })
    )
    .then(() => notify(t('users.created')))
    .then(undefined, showProblem);

const create = (event: SubmitEvent) =>
  ((element) =>
    ((bad) =>
      bad
        ? ((problem = bad),
          void tick().then(() =>
            document.querySelector<HTMLElement>(`#${bad.field}`)?.focus()
          ))
        : send(element))(invalidField(element, _INVALID)))(
    (event.preventDefault(), event.currentTarget as HTMLFormElement)
  );

// Смена роли меняет, что человек видит в менеджере: спрашиваем, как перед удалением.
// После отмены или ошибки список показывает роль с сервера, а не выбранную в списке.
const setRole = (user: User, role: Role, select: HTMLSelectElement) =>
  ask({
    title: t('users.roleTitle'),
    body: t(role === 'admin' ? 'users.roleAdminBody' : 'users.roleEditorBody'),
    items: [`${user.name} — ${user.email}`],
    confirm: t(role === 'admin' ? 'users.makeAdmin' : 'users.makeEditor'),
  })
    .then((confirmed) =>
      confirmed
        ? api
            .send('PATCH', `/users/${user.id}`, { role })
            .then(() => notify(t('users.roleSet')))
        : undefined
    )
    .then(undefined, failed)
    .finally(() =>
      load().then(
        () =>
          void (select.value =
            users.find((_) => _.id === user.id)?.role ?? user.role)
      )
    );

const resetPassword = (user: User) =>
  askValue({
    title: t('users.passwordTitle'),
    body: user.email,
    confirm: t('settings.save'),
    input: {
      label: t('users.password'),
      type: 'password',
      minlength: 10,
      hint: t('users.passwordHint'),
    },
  })
    .then((password) =>
      password === null
        ? undefined
        : api
            .send('PATCH', `/users/${user.id}`, { password })
            .then(() => notify(t('users.passwordSet')))
    )
    .then(undefined, failed);

const remove = (user: User) =>
  ask({
    title: t('users.removeTitle'),
    body: t('users.removeBody'),
    items: [`${user.name} — ${user.email}`],
    confirm: t('users.remove'),
    tone: 'danger',
  })
    .then((confirmed) =>
      confirmed
        ? api
            .send('DELETE', `/users/${user.id}`)
            .then(load)
            .then(() => notify(t('users.removed')))
        : undefined
    )
    .then(undefined, failed);
</script>

<svelte:head><title>{t('users.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" onclick={() => document.querySelector<HTMLInputElement>('#user-email')?.focus()}>{@html icons.userPlus}{t('users.new')}</button>
{/snippet}

<PageHeader title={t('users.title')} crumbs={[{ label: t('nav.users') }]} {actions} />
<div class="page">
  <LoadState load={loading}>
  <div class="scroll frame">
  <table>
    <thead>
      <tr><th>{t('users.name')}</th><th>{t('users.role')}</th><th><span class="sr-only">{t('users.actions')}</span></th></tr>
    </thead>
    <tbody>
      {#each users as user (user.id)}
        <tr>
          <td>{user.name}{#if user.id === session.user?.id}{' '}<span class="muted">{t('users.you')}</span>{/if}<br /><span class="muted">{user.email}</span></td>
          <td>
            <select aria-label={`${t('users.role')}: ${user.name}`} value={user.role} disabled={user.id === session.user?.id} onchange={(e) => setRole(user, e.currentTarget.value as Role, e.currentTarget)}>
              {#each Object.entries(_ROLES) as { 0: role, 1: label } (role)}<option value={role}>{t(label)}</option>{/each}
            </select>
          </td>
          <td>
            <div class="actions">
            {#if user.id !== session.user?.id}<button type="button" aria-label={`${t('users.resetPassword')}: ${user.name}`} onclick={() => resetPassword(user)}>{t('users.resetPassword')}</button>{/if}
            <button
              type="button"
              class="icon danger"
              aria-label={`${t('users.remove')}: ${user.name}`}
              title={t('users.remove')}
              disabled={user.id === session.user?.id}
              onclick={() => remove(user)}
            >
              {@html icons.trash}
            </button>
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  </div>
  </LoadState>

  <form class="panel" novalidate onsubmit={create} oninput={() => (problem = null)}>
    <section class="form-section">
      <header>
        <h2>{t('users.new')}</h2>
        <p>{t('users.newHint')}</p>
      </header>
      <div class="fields">
        <div class="fields-2">
          <label>
            <span>{t('users.email')}<span class="required" aria-hidden="true"> *</span></span>
            <input id="user-email" type="email" autocomplete="off" required bind:value={form.email} aria-invalid={invalid('user-email')} aria-describedby={invalid('user-email') && 'user-email-error'} />
            {#if invalid('user-email')}<small id="user-email-error" class="field-error">{problem?.text}</small>{/if}
          </label>
          <label>{t('users.name')}<input bind:value={form.name} /><small>{t('users.namePlaceholder')}</small></label>
        </div>
        <div class="fields-2">
          <label>
            <span id="user-password-label">{t('users.passwordLabel')}<span class="required" aria-hidden="true"> *</span></span>
            <PasswordInput id="user-password" labelledby="user-password-label" minlength={10} autocomplete="new-password" required bind:value={form.password} aria-invalid={invalid('user-password')} aria-describedby="user-password-help" />
            {#if invalid('user-password')}<small id="user-password-help" class="field-error">{problem?.text}</small>{:else}<small id="user-password-help">{t('users.passwordHint')}</small>{/if}
          </label>
          <label>
            {t('users.role')}
            <select bind:value={form.role}>
              {#each Object.entries(_ROLES) as { 0: role, 1: label } (role)}<option value={role}>{t(label)}</option>{/each}
            </select>
            <small>{t(form.role === 'admin' ? 'users.roleAdminBody' : 'users.roleEditorBody')}</small>
          </label>
        </div>
        <div><button class="primary">{t('users.create')}</button></div>
      </div>
    </section>
  </form>
</div>

<style>
  .page {
    display: grid;
    gap: 1.5rem;
    max-width: 72rem;
  }



  /* position — чтобы скрытый заголовок колонки не вылезал за прокрутку. */
  .scroll {
    position: relative;
    min-width: 0;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
  }

  th,
  td {
    padding: 0.6rem 0.9rem;
    border-bottom: 0.0625rem solid var(--line);
    text-align: left;
  }

  th {
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  td select {
    width: auto;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  /* Телефон: строка таблицы — блок из ячеек друг под другом; действия не уезжают за край. */
  @media (width < 48rem) {
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    table,
    tbody,
    tr,
    td {
      display: block;
    }

    tr {
      display: grid;
      gap: 0.5rem;
      padding: 0.9rem 1rem;
      border-bottom: 0.0625rem solid var(--line);
    }

    td {
      padding: 0;
      border: 0;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
