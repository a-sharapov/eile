<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type {
  GatewayForm,
  GatewayStatus,
  GatewayToken,
  NotifyStatus,
} from '#lib/types.ts';

let {
  form = $bindable(),
  status,
  onstatus,
}: {
  form: GatewayForm;
  /** Сохранённое состояние; null — уведомления ещё не загружены. */
  status: GatewayStatus | null;
  onstatus: (next: GatewayStatus) => void;
} = $props();

let label = $state('');
let issued = $state<string | null>(null);
let busy = $state(false);
let check = $state<{ ok: boolean; text: string } | null>(null);

// Адрес — от адреса сайта из настроек и сохранённого пути: клиент ходит к сайту снаружи.
const endpoint = $derived(
  `${(session.site.url || location.origin).replace(/\/$/, '')}${status?.path ?? form.path}`
);

const _MISSING: readonly {
  key: 'smtp' | 'sender' | 'token';
  label: MessageKey;
}[] = [
  { key: 'smtp', label: 'gateway.missingSmtp' },
  { key: 'sender', label: 'gateway.missingSender' },
  { key: 'token', label: 'gateway.missingToken' },
];

const missing = $derived(
  status
    ? _MISSING.filter((_) => !status.checks[_.key]).map((_) => t(_.label))
    : []
);

const summary = $derived(
  !status
    ? ''
    : status.ready
      ? t('gateway.ready', { url: endpoint })
      : !status.enabled
        ? t(status.tokens.length > 0 ? 'gateway.offClaimed' : 'gateway.off')
        : t('gateway.notReady', { what: missing.join(', ') })
);

const refresh = (): Promise<void> =>
  api.get<NotifyStatus>('/notify').then((_) => onstatus(_.gateway));

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('gateway.copied')), failed);

// Форма токена живёт внутри формы уведомлений: Enter в поле выпускает токен, а не сохраняет всё.
const issue = () =>
  busy ||
  ((busy = true),
  api
    .send<GatewayToken & { token: string }>('POST', '/notify/gateway/tokens', {
      label,
    })
    .then((_) => ((issued = _.token), (label = ''), refresh()))
    .then(undefined, failed)
    .finally(() => (busy = false)));

const onLabelKey = (event: KeyboardEvent) =>
  void (event.key === 'Enter' && (event.preventDefault(), issue()));

const revoke = (token: GatewayToken) =>
  ask({
    title: t('gateway.revokeTitle', { name: quoted(token.label) }),
    body: t('gateway.revokeBody'),
    confirm: t('gateway.revoke'),
    tone: 'danger',
  }).then(
    (yes): unknown =>
      yes &&
      api
        .send<NotifyStatus>('DELETE', `/notify/gateway/tokens/${token.id}`)
        .then((_) => (onstatus(_.gateway), notify(t('gateway.revoked'))))
        .then(undefined, failed)
  );

// Проверка — настоящее письмо через сохранённые настройки тому, кто нажал.
const test = () => (
  (busy = true),
  api
    .send<{ ok: true; to: string }>('POST', '/notify/gateway/test')
    .then(
      (_) =>
        (check = { ok: true, text: t('gateway.testSent', { email: _.to }) }),
      (error) => (check = { ok: false, text: describe(error) })
    )
    .then(refresh)
    .finally(() => (busy = false))
);
</script>

<label class="option">
  <input type="checkbox" bind:checked={form.on} />
  <span><strong>{t('gateway.on')}</strong><small class="help">{t('gateway.onHint')}</small></span>
</label>

{#if form.on || (status && status.tokens.length > 0)}
  <div class="gateway">
    {#if status}
      <p class="summary" data-ready={status.ready} role="status">{summary}</p>
      {#if status.shadows}
        <p class="warning">{t('gateway.shadows', { title: quoted(status.shadows.title) })}</p>
      {/if}
    {/if}

    {#if form.on}
      <div class="fields-2">
        <label>
          {t('gateway.path')}
          <input class="code" bind:value={form.path} placeholder="/mailer/" spellcheck="false" autocomplete="off" />
          <small>{t('gateway.pathHint')}</small>
        </label>
        <label>
          {t('gateway.rateLimit')}
          <input type="number" min="0" max="10000" bind:value={form.rateLimit} placeholder="15" />
          <small>{t('gateway.rateLimitHint')}</small>
        </label>
      </div>
      <label>
        {t('gateway.senders')}
        <input bind:value={form.senders} placeholder="info@example.com, noreply@example.com" spellcheck="false" autocomplete="off" />
        <small>{t('gateway.sendersHint')}</small>
      </label>
      <label>
        {t('gateway.domains')}
        <input bind:value={form.domains} placeholder="example.com" spellcheck="false" autocomplete="off" />
        <small>{t('gateway.domainsHint')}</small>
      </label>
    {/if}

    <div class="tokens">
      <span class="label">{t('gateway.tokens')}</span>
      {#if issued}
        <div class="issued" role="status">
          <p><strong>{t('gateway.issued')}</strong></p>
          <div class="secret">
            <code>{issued}</code>
            <button type="button" class="icon" aria-label={t('gateway.copyToken')} title={t('gateway.copyToken')} onclick={() => copy(issued!)}>{@html icons.copy}</button>
          </div>
          <div class="secret">
            <code>{endpoint}</code>
            <button type="button" class="icon" aria-label={t('gateway.copyAddress')} title={t('gateway.copyAddress')} onclick={() => copy(endpoint)}>{@html icons.copy}</button>
          </div>
        </div>
      {/if}
      {#if !status || status.tokens.length === 0}
        <p class="muted">{t('gateway.noTokens')}</p>
      {:else}
        <ul>
          {#each status.tokens as token (token.id)}
            <li>
              <span class="what">
                <strong>{token.label}</strong>
                <small class="muted">…{token.hint} · {t('gateway.created', { when: moment(token.createdAt) })} · {token.usedAt ? t('gateway.used', { when: ago(token.usedAt) }) : t('gateway.unused')}</small>
              </span>
              <button type="button" class="ghost icon" aria-label={`${t('gateway.revoke')}: ${token.label}`} title={t('gateway.revoke')} onclick={() => revoke(token)}>{@html icons.trash}</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="issue">
        <label>
          <span>{t('gateway.tokenLabel')}</span>
          <input maxlength="80" placeholder={t('gateway.tokenLabelPlaceholder')} bind:value={label} onkeydown={onLabelKey} />
        </label>
        <button type="button" class="button" aria-disabled={busy} onclick={issue}>{@html icons.plus}{t('gateway.issue')}</button>
      </div>
    </div>

    {#if status?.enabled && status.checks.smtp}
      <div class="row">
        <button type="button" class="button" aria-disabled={busy} onclick={test}>{t('gateway.test')}</button>
      </div>
      {#if check}<p class={check.ok ? 'ok' : 'field-error'} role="status">{check.text}</p>{/if}
    {/if}

    {#if status && status.recent.length > 0}
      <div class="recent">
        <span class="label">{t('gateway.recent')}</span>
        <ul>
          {#each status.recent as entry, index (index)}
            <li>
              <span class="muted">{ago(entry.at)}</span>
              <span>{entry.token ?? t('gateway.noToken')}</span>
              <span class="muted">{tn('gateway.recipients', entry.recipients)}</span>
              <span class="code" data-sent={entry.outcome === 'sent'}>{entry.outcome === 'sent' ? t('gateway.outcomeSent') : entry.outcome}</span>
            </li>
          {/each}
        </ul>
        <small class="help">{t('gateway.recentHint')}</small>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Поля шлюза — ветка от галочки: отступ и волосяная линия слева. */
  .gateway {
    display: grid;
    gap: 1.25rem;
    padding-left: 1rem;
    border-left: 0.0625rem solid var(--line);
  }

  p {
    margin: 0;
  }

  .summary {
    font-size: 0.875rem;
    color: var(--muted);
  }

  .summary[data-ready='true'] {
    color: var(--ok);
  }

  .warning {
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.875rem;
  }

  .label {
    display: block;
    margin-bottom: 0.35rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .ok {
    margin: 0;
    color: var(--ok);
    font-size: 0.875rem;
  }

  .tokens ul,
  .recent ul {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  .tokens li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .what {
    display: grid;
    min-width: 0;
  }

  .issued {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .secret {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .secret code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    user-select: all;
  }

  .issue {
    display: flex;
    gap: 0.5rem;
    align-items: end;
  }

  .issue label {
    flex: 1;
  }

  .recent li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    font-size: 0.8125rem;
  }

  .recent [data-sent='false'] {
    color: var(--danger);
  }

  .recent [data-sent='true'] {
    color: var(--ok);
  }

  @media (max-width: 30rem) {
    .issue {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
