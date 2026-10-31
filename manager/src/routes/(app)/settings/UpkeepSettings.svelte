<script lang="ts">
import { api } from '#lib/api.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { fileSize } from '#lib/media.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { BackupSchedule, UpdateStatus, UpkeepStatus } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';

let status = $state<UpkeepStatus | null>(null);
let schedule = $state<BackupSchedule>({
  enabled: false,
  every: 24,
  at: '03:30',
  keep: 7,
  folder: '',
});
let busy = $state(false);
let running = $state(false);
let checking = $state(false);

const accept = (next: UpkeepStatus): void => {
  status = next;
  schedule = { ...next.backups.schedule };
};

const acceptBackups = (backups: UpkeepStatus['backups']): void =>
  void (status && accept({ ...status, backups }));

// Новая версия видна и в меню профиля: сессия знает о ней из того же ответа.
const acceptUpdates = (updates: UpdateStatus): void => (
  status && (status = { ...status, updates }),
  void (session.update = updates.enabled ? updates.latest : null)
);

const loading = defineLoad(() => api.get<UpkeepStatus>('/upkeep').then(accept));
$effect(() => void loading.retry());

const _EVERY: readonly { id: BackupSchedule['every']; label: MessageKey }[] = [
  { id: 24, label: 'upkeep.every24' },
  { id: 12, label: 'upkeep.every12' },
  { id: 6, label: 'upkeep.every6' },
  { id: 1, label: 'upkeep.every1' },
];

const _size = fileSize;

const _name = (file: string): string => file.split(/[\\/]/).at(-1) ?? file;

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    ((busy = true),
    api
      .send<UpkeepStatus['backups']>('PUT', '/upkeep/backups', {
        ...schedule,
        keep: Number(schedule.keep),
        every: Number(schedule.every),
      })
      .then((_) => (acceptBackups(_), notify(t('upkeep.saved'))))
      .then(undefined, failed)
      .finally(() => (busy = false)))
);

const runNow = () =>
  running ||
  ((running = true),
  api
    .send<UpkeepStatus['backups']>('POST', '/upkeep/backups/run')
    .then((_) => (acceptBackups(_), notify(t('upkeep.done'))))
    .then(undefined, (error) => loading.retry().then(() => failed(error)))
    .finally(() => (running = false)));

const toggleUpdates = (enabled: boolean) =>
  api
    .send<UpdateStatus>('PUT', '/upkeep/updates', { enabled })
    .then(acceptUpdates)
    .then(undefined, failed);

const checkNow = () =>
  checking ||
  ((checking = true),
  api
    .send<UpdateStatus>('POST', '/upkeep/updates/check')
    .then(acceptUpdates)
    .then(undefined, failed)
    .finally(() => (checking = false)));
</script>

<LoadState load={loading}>
{#if status}
  <form novalidate onsubmit={save}>
    <section class="form-section">
      <header>
        <h2>{t('upkeep.backupsTitle')}</h2>
        <p>{t('upkeep.backupsHint')}</p>
      </header>
      <div class="fields">
        <label class="option">
          <input type="checkbox" bind:checked={schedule.enabled} />
          <span><strong>{t('upkeep.enabled')}</strong><small class="help">{t('upkeep.enabledHint')}</small></span>
        </label>
        {#if schedule.enabled}
          <div class="fields-2">
            <label>
              {t('upkeep.every')}
              <select bind:value={schedule.every}>
                {#each _EVERY as every (every.id)}<option value={every.id}>{t(every.label)}</option>{/each}
              </select>
            </label>
            <label>
              {t('upkeep.at')}
              <input type="time" step="60" required bind:value={schedule.at} />
              <small>{t(Number(schedule.every) === 1 ? 'upkeep.atHourly' : 'upkeep.atHint')}</small>
            </label>
          </div>
          <div class="fields-2">
            <label>
              {t('upkeep.keep')}
              <input type="number" min="1" max="365" required bind:value={schedule.keep} />
              <small>{t('upkeep.keepHint')}</small>
            </label>
            <label>
              {t('upkeep.folder')}
              <input class="code" bind:value={schedule.folder} placeholder="backups" spellcheck="false" autocomplete="off" />
              <small>{t('upkeep.folderHint')}</small>
            </label>
          </div>
        {/if}
        <div class="row">
          <button class="button primary" aria-disabled={busy}>{t('upkeep.save')}</button>
          <button type="button" class="button" aria-disabled={running} onclick={runNow}>{t(running ? 'upkeep.running' : 'upkeep.runNow')}</button>
        </div>
        {#if status.backups.failure}
          <p class="failure" role="status">
            <strong>{t('upkeep.failed')}</strong> · <time datetime={status.backups.failure.at} title={moment(status.backups.failure.at)}>{ago(status.backups.failure.at)}</time><br />
            <span class="code">{status.backups.failure.message}</span>
          </p>
        {/if}
        <dl class="facts">
          <dt>{t('upkeep.last')}</dt>
          <dd>
            {#if status.backups.last}
              <time datetime={status.backups.last.at} title={moment(status.backups.last.at)}>{ago(status.backups.last.at)}</time>
              · <span class="code">{_name(status.backups.last.file)}</span> · {_size(status.backups.last.size)}{#if status.backups.last.manual}{' · '}{t('upkeep.manual')}{/if}
            {:else}
              <span class="muted">{t('upkeep.never')}</span>
            {/if}
          </dd>
          <dt>{t('upkeep.next')}</dt>
          <dd>
            {#if status.backups.next}{moment(status.backups.next)}{:else}<span class="muted">{t('upkeep.nextOff')}</span>{/if}
          </dd>
          <dt>{t('upkeep.where')}</dt>
          <dd><span class="code path">{status.backups.folder || '—'}</span></dd>
        </dl>
      </div>
    </section>
  </form>

  <section class="form-section">
    <header>
      <h2>{t('upkeep.updatesTitle')}</h2>
      <p>{t('upkeep.updatesHint')}</p>
    </header>
    <div class="fields">
      <label class="option">
        <input type="checkbox" checked={status.updates.enabled} disabled={status.updates.locked} onchange={(e) => toggleUpdates(e.currentTarget.checked)} />
        <span><strong>{t('upkeep.check')}</strong><small class="help">{t(status.updates.locked ? 'upkeep.checkLocked' : 'upkeep.checkHint')}</small></span>
      </label>
      <dl class="facts">
        <dt>{t('upkeep.installed')}</dt>
        <dd>{t('app.name')} {status.updates.current}</dd>
        {#if status.updates.latest}
          <dt>{t('upkeep.available')}</dt>
          <dd>
            <strong>{t('app.name')} {status.updates.latest.latest}</strong> · <a href={status.updates.latest.url} target="_blank" rel="noopener noreferrer">{t('upkeep.notes')}</a>
          </dd>
        {/if}
        <dt>{t('upkeep.checkedAt')}</dt>
        <dd>
          {#if status.updates.checkedAt}
            <time datetime={status.updates.checkedAt} title={moment(status.updates.checkedAt)}>{ago(status.updates.checkedAt)}</time>{#if !status.updates.latest}{' · '}{t('upkeep.upToDate')}{/if}
          {:else}
            <span class="muted">{t('upkeep.notChecked')}</span>
          {/if}
        </dd>
      </dl>
      {#if status.updates.latest}
        <div class="how">
          <p class="help">{t('upkeep.howTo')}</p>
          <pre class="command"><code>cms update</code></pre>
        </div>
      {/if}
      {#if status.updates.enabled}
        <div class="row">
          <button type="button" class="button" aria-disabled={checking} onclick={checkNow}>{t('upkeep.checkNow')}</button>
        </div>
      {/if}
    </div>
  </section>
{/if}
</LoadState>

<style>
  form {
    display: contents;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Сведения — подписью слева и значением справа; на узкой холстине — друг под другом. */
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

  .path {
    font-size: 0.8125rem;
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

  .how {
    display: grid;
    gap: 0.4rem;
  }

  .how .help {
    margin: 0;
  }

  .command {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-radius: var(--radius);
    background: var(--sunken);
    font-family: var(--mono);
    font-size: 0.8125rem;
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
