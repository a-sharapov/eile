<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import {
  LANGUAGE_NAMES,
  LANGUAGES,
  type Language,
  type MessageKey,
  t,
} from '#lib/i18n.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type {
  ChannelKind,
  Chat,
  Delivery,
  IncidentRecord,
  NotifyStatus,
  Severity,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PasswordInput from '#lib/ui/PasswordInput.svelte';
import { firstInvalid } from '#lib/validity.ts';

type Check = { ok: boolean; text: string };

let status = $state<NotifyStatus | null>(null);
let telegram = $state({ on: false, token: '', proxy: '', chats: [] as Chat[] });
let email = $state({
  on: false,
  host: '',
  port: '',
  security: 'tls' as 'tls' | 'starttls' | 'none',
  user: '',
  password: '',
  from: '',
  to: '',
});
let routes = $state({
  forms: [] as ChannelKind[],
  incidents: [] as ChannelKind[],
  level: 'error' as Severity,
  // null — язык сайта.
  language: null as Language | null,
});
let found = $state<Chat[] | null>(null);
let checks = $state<Partial<Record<ChannelKind, Check>>>({});
let journal = $state<IncidentRecord[]>([]);
let undelivered = $state<Delivery[]>([]);
let busy = $state(false);

const accept = (next: NotifyStatus): void => {
  status = next;
  telegram = {
    on: next.telegram !== null,
    token: '',
    proxy: next.telegram?.proxy ?? '',
    chats: next.telegram?.chats ?? [],
  };
  email = {
    on: next.email !== null,
    host: next.email?.host ?? '',
    port: next.email ? String(next.email.port) : '',
    security: next.email?.security ?? 'tls',
    user: next.email?.user ?? '',
    password: '',
    from: next.email?.from ?? '',
    to: next.email?.to.join(', ') ?? '',
  };
  routes = {
    forms: next.forms,
    incidents: next.incidents,
    level: next.level,
    language: next.language,
  };
};

const refreshJournal = (): Promise<void> =>
  Promise.all([
    api.get<IncidentRecord[]>('/notify/incidents'),
    api.get<Delivery[]>('/notify/outbox'),
  ]).then(({ 0: incidents, 1: outbox }) => {
    journal = incidents;
    undelivered = outbox.filter((_) => _.status !== 'sent');
  });

const loading = defineLoad(() =>
  Promise.all([api.get<NotifyStatus>('/notify').then(accept), refreshJournal()])
);
$effect(() => void loading.retry());

const _CHANNELS: readonly { id: ChannelKind; label: MessageKey }[] = [
  { id: 'telegram', label: 'notify.telegram' },
  { id: 'email', label: 'notify.email' },
];

const _LEVELS: readonly { id: Severity; label: MessageKey }[] = [
  { id: 'critical', label: 'notify.levelCritical' },
  { id: 'error', label: 'notify.levelError' },
  { id: 'warning', label: 'notify.levelWarning' },
  { id: 'info', label: 'notify.levelInfo' },
];

const _SEVERITY: Readonly<Record<Severity, MessageKey>> = {
  critical: 'notify.severityCritical',
  error: 'notify.severityError',
  warning: 'notify.severityWarning',
  info: 'notify.severityInfo',
};

const toggle = (list: ChannelKind[], channel: ChannelKind, on: boolean) =>
  on ? [...new Set([...list, channel])] : list.filter((_) => _ !== channel);

const save = (event: SubmitEvent) => {
  event.preventDefault();
  const invalid = firstInvalid(event.currentTarget as HTMLFormElement);
  return invalid
    ? invalid.report()
    : ((busy = true),
      api
        .send<NotifyStatus>('PUT', '/notify', {
          telegram: telegram.on
            ? {
                token: telegram.token,
                proxy: telegram.proxy,
                chats: telegram.chats,
              }
            : null,
          email: email.on
            ? {
                host: email.host,
                port: Number(email.port) || undefined,
                security: email.security,
                user: email.user,
                password: email.password,
                from: email.from,
                to: email.to,
              }
            : null,
          ...routes,
        })
        .then((_) => (accept(_), (checks = {}), notify(t('notify.saved'))))
        .then(undefined, failed)
        .finally(() => (busy = false)));
};

// Чаты, которые писали боту или куда его добавили: токен — введённый или сохранённый.
const findChats = () => (
  (busy = true),
  Promise.all([
    api.send<{ bot: string }>('POST', '/notify/telegram/bot', {
      token: telegram.token,
      proxy: telegram.proxy,
    }),
    api.send<Chat[]>('POST', '/notify/telegram/chats', {
      token: telegram.token,
      proxy: telegram.proxy,
    }),
  ])
    .then(({ 0: bot, 1: chats }) => {
      found = chats.filter(
        (_) => !telegram.chats.some((own) => own.id === _.id)
      );
      checks = {
        ...checks,
        telegram: { ok: true, text: `${t('notify.botFound')} ${bot.bot}` },
      };
    })
    .catch(
      (error) =>
        (checks = { ...checks, telegram: { ok: false, text: describe(error) } })
    )
    .finally(() => (busy = false))
);

const addChat = (chat: Chat) => (
  (telegram.chats = [...telegram.chats, chat]),
  (found = found?.filter((_) => _.id !== chat.id) ?? null)
);

const removeChat = (chat: Chat) =>
  (telegram.chats = telegram.chats.filter((_) => _.id !== chat.id));

// Проверка — настоящее сообщение через сохранённые настройки: сначала «Сохранить».
const test = (channel: ChannelKind) => (
  (busy = true),
  api
    .send('POST', '/notify/test', { channel })
    .then(
      () =>
        (checks = {
          ...checks,
          [channel]: { ok: true, text: t('notify.testSent') },
        }),
      (error) =>
        (checks = {
          ...checks,
          [channel]: { ok: false, text: describe(error) },
        })
    )
    .finally(() => (busy = false))
);

const retry = (delivery: Delivery) =>
  api
    .send('POST', `/notify/outbox/${delivery.id}/retry`)
    .then(() => notify(t('notify.retried')))
    .then(refreshJournal)
    .then(undefined, failed);

const off = (channel: ChannelKind) =>
  ask({
    title: t('notify.offTitle'),
    body: t('notify.offBody'),
    items: [t(channel === 'telegram' ? 'notify.telegram' : 'notify.email')],
    confirm: t('notify.off'),
    tone: 'danger',
  }).then((confirmed) =>
    confirmed
      ? api
          .send<NotifyStatus>('PUT', '/notify', { [channel]: null })
          .then((_) => (accept(_), notify(t('notify.saved'))))
          .then(undefined, failed)
      : undefined
  );
</script>

<LoadState load={loading}>
<form novalidate onsubmit={save}>
  <section class="form-section">
    <header>
      <h2>{t('notify.telegram')}</h2>
      <p>{t('notify.telegramHint')}</p>
    </header>
    <div class="fields">
      <label class="option">
        <input type="checkbox" bind:checked={telegram.on} />
        <span><strong>{t('notify.telegramOn')}</strong><small class="help">{t('notify.telegramOnHint')}</small></span>
      </label>
      {#if telegram.on}
        <label>
          <span id="notify-token-label">{t('notify.token')}{#if !status?.telegram}<span class="required" aria-hidden="true"> *</span>{/if}</span>
          <PasswordInput id="notify-token" labelledby="notify-token-label" class="code" required={!status?.telegram} autocomplete="off" bind:value={telegram.token} placeholder={status?.telegram ? t('notify.tokenKept') : '123456789:AA…'} />
          <small>{t('notify.tokenHint')}</small>
        </label>
        <label>
          {t('notify.proxy')}
          <input class="code" bind:value={telegram.proxy} placeholder="http://user:pass@host:3128" spellcheck="false" autocomplete="off" />
          <small>{t('notify.proxyHint')}</small>
        </label>
        <div class="chats">
          <span class="label">{t('notify.chats')}</span>
          {#if telegram.chats.length === 0}
            <p class="muted">{t('notify.noChats')}</p>
          {:else}
            <ul>
              {#each telegram.chats as chat (chat.id)}
                <li><span>{chat.title}</span><span class="code muted">{chat.id}</span><button type="button" class="button ghost" onclick={() => removeChat(chat)}>{t('notify.removeChat')}</button></li>
              {/each}
            </ul>
          {/if}
          <div class="row">
            <button type="button" class="button" aria-disabled={busy} onclick={findChats}>{t('notify.findChats')}</button>
            {#if status?.telegram}<button type="button" class="button" aria-disabled={busy} onclick={() => test('telegram')}>{t('notify.test')}</button>{/if}
            {#if status?.telegram}<button type="button" class="button danger" onclick={() => off('telegram')}>{t('notify.off')}</button>{/if}
          </div>
          {#if checks.telegram}<p class={checks.telegram.ok ? 'ok' : 'field-error'} role="status">{checks.telegram.text}</p>{/if}
          {#if found}
            {#if found.length === 0}
              <p class="muted">{t('notify.noNewChats')}</p>
            {:else}
              <ul class="found">
                {#each found as chat (chat.id)}
                  <li><span>{chat.title}</span><span class="code muted">{chat.id}</span><button type="button" class="button primary" onclick={() => addChat(chat)}>{t('notify.addChat')}</button></li>
                {/each}
              </ul>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <section class="form-section">
    <header>
      <h2>{t('notify.email')}</h2>
      <p>{t('notify.emailHint')}</p>
    </header>
    <div class="fields">
      <label class="option">
        <input type="checkbox" bind:checked={email.on} />
        <span><strong>{t('notify.emailOn')}</strong><small class="help">{t('notify.emailOnHint')}</small></span>
      </label>
      {#if email.on}
        <div class="fields-2">
          <label>
            <span>{t('notify.host')}<span class="required" aria-hidden="true"> *</span></span>
            <input class="code" required bind:value={email.host} placeholder="smtp.yandex.ru" spellcheck="false" autocomplete="off" />
          </label>
          <label>
            {t('notify.security')}
            <select bind:value={email.security}>
              <option value="tls">{t('notify.securityTls')}</option>
              <option value="starttls">{t('notify.securityStarttls')}</option>
              <option value="none">{t('notify.securityNone')}</option>
            </select>
          </label>
        </div>
        <label>
          {t('notify.port')}
          <input type="number" min="1" max="65535" bind:value={email.port} placeholder={{ tls: '465', starttls: '587', none: '25' }[email.security]} />
        </label>
        <div class="fields-2">
          <label>
            {t('notify.user')}
            <input bind:value={email.user} autocomplete="off" spellcheck="false" />
          </label>
          <label>
            <span id="notify-password-label">{t('notify.password')}</span>
            <PasswordInput id="notify-password" labelledby="notify-password-label" autocomplete="new-password" bind:value={email.password} placeholder={status?.email?.hasPassword ? t('notify.passwordKept') : ''} />
          </label>
        </div>
        <small class="help">{t('notify.passwordHint')}</small>
        <label>
          <span>{t('notify.from')}<span class="required" aria-hidden="true"> *</span></span>
          <input type="email" required bind:value={email.from} placeholder="site@example.com" />
        </label>
        <label>
          <span>{t('notify.to')}<span class="required" aria-hidden="true"> *</span></span>
          <input required bind:value={email.to} placeholder="boss@example.com, sales@example.com" />
          <small>{t('notify.toHint')}</small>
        </label>
        {#if status?.email}
          <div class="row">
            <button type="button" class="button" aria-disabled={busy} onclick={() => test('email')}>{t('notify.test')}</button>
            <button type="button" class="button danger" onclick={() => off('email')}>{t('notify.off')}</button>
          </div>
        {/if}
        {#if checks.email}<p class={checks.email.ok ? 'ok' : 'field-error'} role="status">{checks.email.text}</p>{/if}
      {/if}
    </div>
  </section>

  <section class="form-section">
    <header>
      <h2>{t('notify.routes')}</h2>
      <p>{t('notify.routesHint')}</p>
    </header>
    <div class="fields">
      <fieldset>
        <legend>{t('notify.routeForms')}</legend>
        {#each _CHANNELS as channel (channel.id)}
          <label class="inline"><input type="checkbox" checked={routes.forms.includes(channel.id)} onchange={(e) => (routes.forms = toggle(routes.forms, channel.id, e.currentTarget.checked))} />{t(channel.label)}</label>
        {/each}
      </fieldset>
      <fieldset>
        <legend>{t('notify.routeIncidents')}</legend>
        {#each _CHANNELS as channel (channel.id)}
          <label class="inline"><input type="checkbox" checked={routes.incidents.includes(channel.id)} onchange={(e) => (routes.incidents = toggle(routes.incidents, channel.id, e.currentTarget.checked))} />{t(channel.label)}</label>
        {/each}
      </fieldset>
      <label>
        {t('notify.level')}
        <select bind:value={routes.level}>
          {#each _LEVELS as level (level.id)}<option value={level.id}>{t(level.label)}</option>{/each}
        </select>
        <small>{t('notify.levelHint')}</small>
      </label>
      <label>
        {t('notify.language')}
        <select bind:value={routes.language}>
          <option value={null}>{t('notify.languageSite')}</option>
          {#each LANGUAGES as language (language)}<option value={language}>{LANGUAGE_NAMES[language]}</option>{/each}
        </select>
        <small>{t('notify.languageHint')}</small>
      </label>
      <div class="row">
        <button class="button primary" aria-disabled={busy}>{t('notify.save')}</button>
      </div>
    </div>
  </section>
</form>

<section class="form-section">
  <header>
    <h2>{t('notify.journal')}</h2>
    <p>{t('notify.journalHint')}</p>
  </header>
  <div class="fields">
    {#if undelivered.length > 0}
      <div class="undelivered">
        <span class="label">{t('notify.undelivered')}</span>
        <ul>
          {#each undelivered as delivery (delivery.id)}
            <li>
              <strong>{delivery.message.title}</strong>
              <span class="muted">{t(delivery.channel === 'telegram' ? 'notify.telegram' : 'notify.email')} · {delivery.status === 'failed' ? t('notify.failed') : t('notify.nextTry', { when: moment(delivery.nextAt) })}</span>
              {#if delivery.lastError}<span class="code error">{delivery.lastError}</span>{/if}
              <button type="button" class="button" onclick={() => retry(delivery)}>{t('notify.retry')}</button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if journal.length === 0}
      <p class="muted">{t('notify.journalEmpty')}</p>
    {:else}
      <ul class="journal">
        {#each journal as incident (incident.id)}
          <li>
            <details>
              <summary>
                <span class="severity" data-severity={incident.severity}>{t(_SEVERITY[incident.severity])}</span>
                <span class="title">{incident.title}</span>
                <span class="muted when">{incident.count > 1 ? `×${incident.count} · ` : ''}{ago(incident.lastAt)}</span>
              </summary>
              <pre>{incident.detail}</pre>
            </details>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
</LoadState>

<style>
  form {
    display: contents;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    width: 100%;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  .inline {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .label {
    display: block;
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  .chats ul,
  .undelivered ul,
  .journal {
    display: grid;
    gap: 0.4rem;
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  .chats li,
  .undelivered li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .chats li button,
  .undelivered li button {
    margin-left: auto;
  }

  .found li {
    border-style: dashed;
  }

  .undelivered .error {
    flex-basis: 100%;
    color: var(--danger);
    font-size: 0.8125rem;
  }

  .ok {
    margin: 0;
    color: var(--ok);
    font-size: 0.875rem;
  }

  .journal li {
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  summary {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
  }

  .title {
    flex: 1;
    min-width: 0;
  }

  .when {
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .severity {
    padding: 0.05rem 0.45rem;
    border-radius: 1rem;
    background: var(--hover);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .severity[data-severity='critical'],
  .severity[data-severity='error'] {
    background: color-mix(in oklch, var(--danger) 14%, transparent);
    color: var(--danger);
  }

  .severity[data-severity='warning'] {
    background: var(--warn-soft);
    color: var(--warn);
  }

  pre {
    max-height: 16rem;
    margin: 0;
    padding: 0.75rem;
    border-top: 0.0625rem solid var(--line);
    overflow: auto;
    font-size: 0.8125rem;
    white-space: pre-wrap;
  }
</style>
