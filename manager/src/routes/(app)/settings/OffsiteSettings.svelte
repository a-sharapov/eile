<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { fileSize } from '#lib/media.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type { OffsiteSettings, OffsiteStatus } from '#lib/types.ts';
import PasswordInput from '#lib/ui/PasswordInput.svelte';

let {
  status,
  scheduled,
  onstatus,
}: {
  status: OffsiteStatus;
  /** Автокопии по расписанию включены: иначе в хранилище копия уходит только кнопкой. */
  scheduled: boolean;
  onstatus: (next: OffsiteStatus) => void;
} = $props();

// Форма — своя копия сохранённого: правка не трогает статус, пока не сохранили; новый статус приходит в accept.
const saved = (): OffsiteSettings => ({ ...status.settings });
let form = $state<OffsiteSettings>(saved());
let secret = $state('');
let busy = $state(false);
let checking = $state(false);
let check = $state<{ ok: boolean; text: string } | null>(null);
// Ключ восстановления приходит один раз — в ответе, который создал ключ; дальше его не узнать.
let recovery = $state<string | null>(null);

const payload = () => ({
  ...form,
  keep: Number(form.keep),
  ...(secret === '' ? {} : { secret }),
});

const accept = (next: OffsiteStatus): void => {
  onstatus(next);
  form = { ...next.settings };
  secret = '';
  void (next.recoveryKey && (recovery = next.recoveryKey));
};

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    ((busy = true),
    api
      .send<OffsiteStatus>('PUT', '/upkeep/offsite', payload())
      .then((_) => (accept(_), notify(t('offsite.saved'))))
      .then(undefined, failed)
      .finally(() => (busy = false)))
);

// Проверка — с тем, что сейчас в форме, ничего не сохраняя.
const test = () =>
  checking ||
  ((checking = true),
  (check = null),
  api
    .send<{ ok: true }>('POST', '/upkeep/offsite/check', payload())
    .then(
      () => (check = { ok: true, text: t('offsite.checkOk') }),
      (error) => (check = { ok: false, text: describe(error) })
    )
    .finally(() => (checking = false)));

const rotate = () =>
  ask({
    title: t('offsite.rotateTitle'),
    body: t('offsite.rotateBody'),
    confirm: t('offsite.rotateConfirm'),
    tone: 'danger',
  }).then(
    (yes): unknown =>
      yes &&
      api
        .send<OffsiteStatus>('POST', '/upkeep/offsite/key')
        .then(accept)
        .then(undefined, failed)
  );

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('offsite.recoveryCopied')), failed);
</script>

<form novalidate onsubmit={save}>
  <section class="form-section">
    <header>
      <h2>{t('offsite.title')}</h2>
      <p>{t('offsite.hint')}</p>
    </header>
    <div class="fields">
      {#if recovery}
        <div class="recovery" role="alert">
          <p><strong>{t('offsite.recoveryTitle')}</strong></p>
          <p class="help">{t('offsite.recoveryBody')}</p>
          <div class="secret">
            <code>{recovery}</code>
            <button type="button" class="icon" aria-label={t('offsite.recoveryCopy')} title={t('offsite.recoveryCopy')} onclick={() => copy(recovery!)}>{@html icons.copy}</button>
          </div>
          <p class="help">{t('offsite.recoveryUse')}</p>
          <div class="row">
            <button type="button" class="button primary" onclick={() => (recovery = null)}>{t('offsite.recoveryDone')}</button>
          </div>
        </div>
      {/if}
      <label class="option">
        <input type="checkbox" bind:checked={form.enabled} />
        <span><strong>{t('offsite.enabled')}</strong><small class="help">{t(scheduled ? 'offsite.enabledHint' : 'offsite.noSchedule')}</small></span>
      </label>
      <label>
        {t('offsite.endpoint')}
        <input class="code" bind:value={form.endpoint} placeholder="https://fra1.digitaloceanspaces.com" spellcheck="false" autocomplete="off" />
        <small>{t('offsite.endpointHint')}</small>
      </label>
      <div class="fields-2">
        <label>
          <span>{t('offsite.bucket')}{#if form.enabled}<span class="required" aria-hidden="true"> *</span>{/if}</span>
          <input class="code" bind:value={form.bucket} required={form.enabled} spellcheck="false" autocomplete="off" />
        </label>
        <label>
          {t('offsite.region')}
          <input class="code" bind:value={form.region} placeholder="fra1" spellcheck="false" autocomplete="off" />
          <small>{t('offsite.regionHint')}</small>
        </label>
      </div>
      <div class="fields-2">
        <label>
          <span>{t('offsite.accessKey')}{#if form.enabled}<span class="required" aria-hidden="true"> *</span>{/if}</span>
          <input class="code" bind:value={form.accessKey} required={form.enabled} spellcheck="false" autocomplete="off" />
        </label>
        <label>
          <span id="offsite-secret-label">{t('offsite.secret')}{#if form.enabled && !status.hasSecret}<span class="required" aria-hidden="true"> *</span>{/if}</span>
          <PasswordInput id="offsite-secret" labelledby="offsite-secret-label" class="code" autocomplete="new-password" bind:value={secret} placeholder={status.hasSecret ? t('offsite.secretSaved') : ''} />
        </label>
      </div>
      <small class="help">{t('offsite.secretHint')}</small>
      <div class="fields-2">
        <label>
          {t('offsite.prefix')}
          <input class="code" bind:value={form.prefix} placeholder="my-site" spellcheck="false" autocomplete="off" />
          <small>{t('offsite.prefixHint')}</small>
        </label>
        <label>
          {t('offsite.keep')}
          <input type="number" min="1" max="365" required bind:value={form.keep} />
          <small>{t('offsite.keepHint')}</small>
        </label>
      </div>
      <label class="option">
        <input type="checkbox" bind:checked={form.virtualHosted} />
        <span><strong>{t('offsite.virtualHosted')}</strong><small class="help">{t('offsite.virtualHostedHint')}</small></span>
      </label>
      <div class="row">
        <button class="button primary" aria-disabled={busy}>{t('offsite.save')}</button>
        <button type="button" class="button" aria-disabled={checking} onclick={test}>{t(checking ? 'offsite.checking' : 'offsite.check')}</button>
      </div>
      {#if check}<p class={check.ok ? 'ok' : 'field-error'} role="status">{check.text}</p>{/if}
      {#if status.failure}
        <p class="failure" role="status">
          <strong>{t('offsite.failed')}</strong> · <time datetime={status.failure.at} title={moment(status.failure.at)}>{ago(status.failure.at)}</time><br />
          <span class="code">{status.failure.message}</span>
        </p>
      {/if}
      <dl class="facts">
        <dt>{t('offsite.last')}</dt>
        <dd>
          {#if status.last}
            <time datetime={status.last.at} title={moment(status.last.at)}>{ago(status.last.at)}</time>
            · <span class="code">{status.last.name}</span> · {fileSize(status.last.size)}
          {:else}
            <span class="muted">{t('offsite.never')}</span>
          {/if}
        </dd>
        <dt>{t('offsite.key')}</dt>
        <dd>
          {#if status.keyId}
            <span class="code">{status.keyId}</span>{#if status.keyCreatedAt}{' · '}{t('offsite.keyCreated', { when: moment(status.keyCreatedAt) })}{/if}
            <button type="button" class="link" onclick={rotate}>{t('offsite.rotate')}</button>
          {:else}
            <span class="muted">{t('offsite.keyNone')}</span>
          {/if}
        </dd>
      </dl>
    </div>
  </section>
</form>

<style>
  form {
    display: contents;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .recovery {
    display: grid;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border: 0.0625rem solid color-mix(in oklab, var(--accent) 45%, var(--line));
    border-radius: var(--radius-l);
    background: var(--sunken);
  }

  .recovery p {
    margin: 0;
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
    font-size: 0.9375rem;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
    user-select: all;
  }

  .facts {
    display: grid;
    grid-template-columns: minmax(8rem, max-content) 1fr;
    gap: 0.5rem 1.25rem;
    margin: 0;
    padding: 0.875rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    font-size: 0.875rem;
  }

  .facts dt {
    color: var(--muted);
  }

  .facts dd {
    min-width: 0;
    margin: 0;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .facts .link {
    margin-left: 0.5rem;
  }

  .ok {
    margin: 0;
    color: var(--ok);
    font-size: 0.875rem;
  }

  .failure {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 45%, var(--line));
    border-radius: var(--radius);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  @media (width < 40rem) {
    .facts {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }

    .facts dd + dt {
      margin-top: 0.5rem;
    }
  }
</style>
