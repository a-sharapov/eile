<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';
import type { UpkeepStatus } from '#lib/types.ts';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { resolve } from '$app/paths';

// Восстановление заменяет весь сайт: сначала вопрос с именем файла, потом загрузка и полное обновление
// менеджера — дерево, элементы и настройки должны прийти уже из копии.
let restoring = $state(false);

// Расписание автокопий — сводкой; настраивается во вкладке настроек.
let backups = $state<UpkeepStatus['backups'] | null>(null);
$effect(
  () =>
    void api.get<UpkeepStatus>('/upkeep').then(
      (_) => void (backups = _.backups),
      () => undefined
    )
);

const _EVERY: Readonly<Record<number, MessageKey>> = {
  24: 'upkeep.every24',
  12: 'upkeep.every12',
  6: 'upkeep.every6',
  1: 'upkeep.every1',
};

const _size = (bytes: number): string =>
  bytes < 1024 ** 2
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 ** 2).toFixed(1)} МБ`;

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
</style>
