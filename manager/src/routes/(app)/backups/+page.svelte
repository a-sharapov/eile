<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { fileSize } from '#lib/media.ts';
import { describe, failed } from '#lib/notices.svelte.ts';
import type { OffsiteStatus, RemoteCopy, UpkeepStatus } from '#lib/types.ts';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';

// Восстановление заменяет весь сайт: сначала вопрос с именем файла, потом загрузка и полное обновление
// менеджера — дерево, элементы и настройки должны прийти уже из копии.
let restoring = $state(false);

// Расписание автокопий — сводкой; настраивается во вкладке настроек.
let backups = $state<UpkeepStatus['backups'] | null>(null);
let offsite = $state<OffsiteStatus | null>(null);
// Копии в хранилище: null — ещё не спрашивали или хранилище не настроено.
let copies = $state<RemoteCopy[] | null>(null);
let copiesError = $state<string | null>(null);

const configured = (_: OffsiteStatus): boolean =>
  _.settings.bucket !== '' && _.hasSecret;

const loadCopies = (): Promise<void> =>
  api.get<{ copies: RemoteCopy[] }>('/upkeep/offsite/copies').then(
    (_) => void ((copies = _.copies), (copiesError = null)),
    (error) => void (copiesError = describe(error))
  );

$effect(
  () =>
    void api.get<UpkeepStatus>('/upkeep').then(
      (_) => (
        (backups = _.backups),
        (offsite = _.offsite),
        configured(_.offsite) ? loadCopies() : undefined
      ),
      () => undefined
    )
);

const restoreRemote = (copy: RemoteCopy) =>
  ask({
    title: t('backup.remoteRestoreTitle'),
    body: t('backup.restoreBody'),
    items: [`${copy.name} · ${_size(copy.size)}`],
    confirm: t('backup.restoreConfirm'),
    tone: 'danger',
  })
    .then((confirmed) =>
      confirmed
        ? ((restoring = true),
          api
            .send<{ pages: number; savedTo: string | null }>(
              'POST',
              '/upkeep/offsite/restore',
              { name: copy.name }
            )
            .then((_) =>
              ask({
                title: t('backup.doneTitle'),
                body: `${t('backup.donePages')} ${_.pages}.${_.savedTo ? ` ${t('backup.doneSaved')} ${_.savedTo}` : ''}`,
                confirm: t('backup.reload'),
              })
            )
            .then(() => location.reload()))
        : undefined
    )
    .then(undefined, failed)
    .finally(() => (restoring = false));

const _EVERY: Readonly<Record<number, MessageKey>> = {
  24: 'upkeep.every24',
  12: 'upkeep.every12',
  6: 'upkeep.every6',
  1: 'upkeep.every1',
};

const _size = fileSize;

const restoreFrom = (input: HTMLInputElement) =>
  ((file) =>
    void (
      file &&
      ask({
        title: t('backup.restoreTitle'),
        body: t('backup.restoreBody'),
        items: [`${file.name} · ${_size(file.size)}`],
        confirm: t('backup.restoreConfirm'),
        tone: 'danger',
      })
        .then((confirmed) =>
          confirmed
            ? ((restoring = true),
              api
                .upload<{ pages: number; savedTo: string | null }>(
                  '/backup',
                  file
                )
                .then((_) =>
                  ask({
                    title: t('backup.doneTitle'),
                    body: `${t('backup.donePages')} ${_.pages}.${_.savedTo ? ` ${t('backup.doneSaved')} ${_.savedTo}` : ''}`,
                    confirm: t('backup.reload'),
                  })
                )
                .then(() => location.reload()))
            : undefined
        )
        .then(undefined, failed)
        .finally(() => ((restoring = false), (input.value = '')))
    ))(input.files?.[0]);
</script>

<svelte:head><title>{t('backup.title')} — {t('app.name')}</title></svelte:head>

<PageHeader title={t('backup.title')} crumbs={[{ label: t('nav.backups') }]} />

<!-- Копии — отдельным разделом: скачать, восстановить и поставить на расписание. -->
<div class="page">
<section class="form-section">
  <header>
    <h2>{t('backup.downloadTitle')}</h2>
    <p>{t('backup.downloadIntro')}</p>
  </header>
  <div class="fields">
    <div class="format">
      <a class="button primary" href={api.url('/backup?format=db')} download>{@html icons.database}{t('backup.db')}</a>
      <p class="help">{t('backup.dbHint')}</p>
    </div>
    <div class="format">
      <a class="button" href={api.url('/backup?format=json')} download>{@html icons.fileJson}{t('backup.json')}</a>
      <p class="help">{t('backup.jsonHint')}</p>
    </div>
  </div>
</section>
<section class="form-section">
  <header>
    <h2>{t('backup.restoreSection')}</h2>
    <p>{t('backup.restoreIntro')}</p>
  </header>
  <div class="fields">
    <label class="restore" data-busy={restoring || undefined}>
      <input class="sr-only" type="file" accept=".db,.sqlite,.json,application/json,application/vnd.sqlite3" disabled={restoring} aria-describedby="restore-hint" onchange={(e) => restoreFrom(e.currentTarget)} />
      <span class="button">{@html icons.upload}{t(restoring ? 'backup.restoring' : 'backup.chooseFile')}</span>
      <span id="restore-hint" class="help">{t('backup.restoreHint')}</span>
    </label>
  </div>
</section>
<section class="form-section">
  <header>
    <h2>{t('backup.remoteTitle')}</h2>
    <p>{t('backup.remoteIntro')}</p>
  </header>
  <div class="fields">
    {#if offsite && configured(offsite)}
      {#if copiesError}
        <p class="field-error" role="status">{copiesError}</p>
      {:else if copies && copies.length === 0}
        <p class="muted">{t('backup.remoteEmpty')}</p>
      {:else if copies}
        <ul class="copies">
          {#each copies as copy (copy.name)}
            <li>
              <span class="what">
                <span class="code">{copy.name}</span>
                <small class="muted">{_size(copy.size)}{#if copy.at}{' · '}<time datetime={copy.at} title={moment(copy.at)}>{ago(copy.at)}</time>{/if}</small>
              </span>
              <button type="button" class="button" aria-disabled={restoring} onclick={() => restoreRemote(copy)}>{t('backup.remoteRestore')}</button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if offsite}
      <p class="muted">{t('backup.remoteOff')}</p>
      <a class="button" href={`${resolve('/(app)/settings')}?tab=upkeep`}>{t('backup.remoteSetup')}</a>
    {/if}
  </div>
</section>
<section class="form-section">
  <header>
    <h2>{t('backup.cliTitle')}</h2>
    <p>{t('backup.cliIntro')}</p>
  </header>
  <div class="fields">
    {#if backups}
      <dl class="facts">
        {#if backups.schedule.enabled}
          <dt>{t('upkeep.every')}</dt>
          <dd>{t(_EVERY[backups.schedule.every] ?? 'upkeep.every24')}{#if backups.schedule.every !== 1}, {backups.schedule.at}{/if} · {t('upkeep.keep').toLowerCase()} {backups.schedule.keep}</dd>
          <dt>{t('upkeep.next')}</dt>
          <dd>{backups.next ? moment(backups.next) : '—'}</dd>
        {:else}
          <dt>{t('backup.schedule')}</dt>
          <dd class="muted">{t('backup.scheduleOff')}</dd>
        {/if}
        <dt>{t('upkeep.last')}</dt>
        <dd>{#if backups.last}<time datetime={backups.last.at} title={moment(backups.last.at)}>{ago(backups.last.at)}</time>{:else}<span class="muted">{t('upkeep.never')}</span>{/if}</dd>
        {#if backups.failure}
          <dt class="danger">{t('upkeep.failed')}</dt>
          <dd class="danger">{ago(backups.failure.at)}</dd>
        {/if}
      </dl>
    {/if}
    <a class="button" href={`${resolve('/(app)/settings')}?tab=upkeep`}>{t('backup.scheduleSetup')}</a>
    <pre class="command"><code>0 3 * * * cms backup /backups/site-$(date +\%F).db --db /srv/site/site.db</code></pre>
    <p class="help">{t('backup.cliHint')}</p>
  </div>
</section>
</div>

<style>
  /* Контейнер для разделов: на узкой холстине они складываются в одну колонку, как в настройках. */
  .page {
    container-type: inline-size;
    max-width: 72rem;
  }

  .format {
    display: grid;
    gap: 0.4rem;
    justify-items: start;
  }

  .format .help {
    margin: 0;
  }

  .restore {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    cursor: pointer;
  }

  .restore:focus-within .button {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  .restore[data-busy] {
    cursor: progress;
  }

  .command {
    margin: 0;
    padding: 0.75rem 1rem;
    overflow-x: auto;
    border-radius: var(--radius);
    background: var(--sunken);
    font-family: var(--mono);
    font-size: 0.8125rem;
  }

  .fields > .help {
    margin: 0;
  }

  /* Длинная строка cron прокручивается сама и не раздвигает колонку на телефоне. */
  .fields {
    min-width: 0;
  }

  .fields > .button {
    justify-self: start;
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
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .facts .danger {
    color: var(--danger);
  }

  .copies {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .copies li {
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
    overflow-wrap: anywhere;
  }

  .fields > .muted {
    margin: 0;
  }
</style>
