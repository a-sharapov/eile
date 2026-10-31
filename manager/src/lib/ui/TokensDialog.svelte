<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';

type Token = {
  readonly id: number;
  readonly name: string;
  readonly hint: string;
  readonly createdAt: string;
  readonly usedAt: string | null;
};

let {
  open = $bindable(false),
  onclose,
}: { open: boolean; onclose?: () => void } = $props();

let element: HTMLDialogElement;
let tokens = $state<Token[] | null>(null);
let name = $state('');
let issued = $state<string | null>(null);
let busy = $state(false);

const failed = (error: unknown) => notify(describe(error), 'error');

const load = () =>
  api.get<Token[]>('/tokens').then((_) => void (tokens = _), failed);

$effect(() => {
  void (open
    ? ((name = ''),
      (issued = null),
      (tokens = null),
      load(),
      element.open || element.showModal())
    : element.open && element.close());
});

// Адрес MCP — от адреса сайта из настроек: агент ходит к сайту снаружи, а не к адресу этой вкладки.
const endpoint = $derived(
  `${(session.site.url || location.origin).replace(/\/$/, '')}/manager/mcp`
);

const claudeCommand = (token: string) =>
  `claude mcp add --transport http site ${endpoint} --header "Authorization: Bearer ${token}"`;

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('tokens.copiedNotice')), failed);

const issue = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    ((busy = true),
    api
      .send<Token & { token: string }>('POST', '/tokens', { name })
      .then((_) => ((issued = _.token), (name = ''), load()))
      .then(undefined, failed)
      .finally(() => (busy = false)))
);

const revoke = (token: Token) =>
  ask({
    title: t('tokens.revokeTitle', { name: quoted(token.name) }),
    body: t('tokens.revokeBody'),
    confirm: t('tokens.revoke'),
    tone: 'danger',
  }).then(
    (yes): unknown =>
      yes &&
      api
        .send('DELETE', `/tokens/${token.id}`)
        .then(() => (notify(t('tokens.revoked')), load()))
        .then(undefined, failed)
  );
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), (open = false))} onclose={() => onclose?.()} aria-labelledby="tokens-title">
  {#if open}
    <div class="body">
      <h2 id="tokens-title">{t('tokens.title')}</h2>
      <p class="muted">{t('tokens.body')}</p>

      {#if issued}
        <section class="issued" aria-labelledby="tokens-issued">
          <p id="tokens-issued"><strong>{t('tokens.issued')}</strong></p>
          <div class="secret">
            <code>{issued}</code>
            <button type="button" class="icon" aria-label={t('tokens.copyToken')} title={t('tokens.copyToken')} onclick={() => copy(issued!)}>{@html icons.copy}</button>
          </div>
          <dl>
            <dt>{t('tokens.address')}</dt>
            <dd class="secret"><code>{endpoint}</code><button type="button" class="icon" aria-label={t('tokens.copyAddress')} title={t('tokens.copyAddress')} onclick={() => copy(endpoint)}>{@html icons.copy}</button></dd>
            <dt>{t('tokens.claudeCode')}</dt>
            <dd class="secret"><code>{claudeCommand(issued)}</code><button type="button" class="icon" aria-label={t('tokens.copyCommand')} title={t('tokens.copyCommand')} onclick={() => copy(claudeCommand(issued!))}>{@html icons.copy}</button></dd>
          </dl>
        </section>
      {/if}

      <form onsubmit={issue}>
        <label>
          <span>{t('tokens.name')}</span>
          <input maxlength="80" placeholder={t('tokens.namePlaceholder')} bind:value={name} />
        </label>
        <button class="primary" aria-disabled={busy}>{@html icons.plus}{t('tokens.issue')}</button>
      </form>

      {#if tokens === null}
        <p class="muted">{t('common.loading')}</p>
      {:else if tokens.length === 0}
        <p class="muted">{t('tokens.empty')}</p>
      {:else}
        <ul class="list">
          {#each tokens as token (token.id)}
            <li>
              <span class="what">
                <strong>{token.name}</strong>
                <small class="muted">…{token.hint} · {t('tokens.created', { when: moment(token.createdAt) })} · {token.usedAt ? t('tokens.used', { when: ago(token.usedAt) }) : t('tokens.unused')}</small>
              </span>
              <button type="button" class="ghost icon" aria-label={`${t('tokens.revoke')}: ${token.name}`} title={t('tokens.revoke')} onclick={() => revoke(token)}>{@html icons.trash}</button>
            </li>
          {/each}
        </ul>
      {/if}

      <p class="muted small">{t('tokens.limits')}</p>
      <div class="actions">
        <button type="button" onclick={() => (open = false)}>{t('common.close')}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 36rem);
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

  .body {
    display: grid;
    gap: 1.25rem;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: 0;
  }

  .body > .muted:first-of-type {
    margin-top: -0.5rem;
  }

  .issued {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .secret {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
    margin: 0;
  }

  .secret code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    user-select: all;
  }

  dl {
    display: grid;
    gap: 0.25rem 0;
    margin: 0;
  }

  dt {
    font-size: 0.875rem;
    color: var(--muted);
  }

  form {
    display: flex;
    gap: 0.5rem;
    align-items: end;
  }

  form label {
    flex: 1;
    display: grid;
    gap: 0.25rem;
  }

  .list {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-top: 0.0625rem solid var(--line);
  }

  .what {
    display: grid;
    min-width: 0;
  }

  .small {
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 30rem) {
    form {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
