<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';
import PageHeader from '#lib/ui/PageHeader.svelte';

// Восстановление заменяет весь сайт: сначала вопрос с именем файла, потом загрузка и полное обновление
// менеджера — дерево, элементы и настройки должны прийти уже из копии.
let restoring = $state(false);

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
    <pre class="command"><code>0 3 * * * cms backup /backups/site-$(date +\%F).db --db /srv/site/site.db</code></pre>
    <p class="help">{t('backup.cliHint')}</p>
  </div>
</section>
</div>

<style>
  .page {
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
</style>
