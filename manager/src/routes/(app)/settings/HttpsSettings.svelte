<script lang="ts">
import { api } from '#lib/api.ts';
import { moment } from '#lib/format.ts';
import { currentLanguage, t, tn } from '#lib/i18n.ts';
import type { HttpsStatus } from '#lib/types.ts';

// Только чтение: сертификат — забота сервера. Блока нет, если HTTPS держит прокси или его нет вовсе.
let status = $state<HttpsStatus | null>(null);
$effect(
  () =>
    void api.get<HttpsStatus | null>('/https').then(
      (_) => (status = _),
      () => undefined
    )
);

const _DAY = 24 * 60 * 60 * 1000;
const left = $derived(
  status?.notAfter
    ? Math.max(0, Math.floor((Date.parse(status.notAfter) - Date.now()) / _DAY))
    : null
);
const date = (iso: string): string =>
  new Date(iso).toLocaleDateString(currentLanguage(), { dateStyle: 'long' });
</script>

{#if status}
  <section class="form-section" aria-labelledby="https-title">
    <header>
      <h2 id="https-title">{t('https.title')}</h2>
      <p>{t('https.hint')}</p>
    </header>
    <div class="fields">
      <dl class="facts">
        <div><dt>{t('https.domains')}</dt><dd>{status.domains.join(', ')}</dd></div>
        <div>
          <dt>{t('https.until')}</dt>
          <dd>
            {#if status.notAfter}
              {date(status.notAfter)}<small class="muted">{tn('https.daysLeft', left ?? 0)}</small>
            {:else}
              {t('https.notYet')}
            {/if}
          </dd>
        </div>
        {#if status.issuedAt}
          <div><dt>{t('https.issued')}</dt><dd>{date(status.issuedAt)}</dd></div>
        {/if}
      </dl>
      {#if status.staging}<p class="muted note">{t('https.staging')}</p>{/if}
      {#if status.lastError}
        <div class="failure" role="status">
          <p><strong>{t('https.failed')}{#if status.lastAttemptAt}{' · '}{moment(status.lastAttemptAt)}{/if}</strong></p>
          <p class="detail">{status.lastError}</p>
          <p class="muted">{t('https.retry')}</p>
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  .facts div {
    display: grid;
    gap: 0.25rem;
    padding: 0.75rem 0.9rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--sunken);
  }

  dt {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  dd {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  dd small {
    display: block;
    font-size: 0.8125rem;
    font-weight: 400;
  }

  .note {
    margin: 0;
    font-size: 0.875rem;
  }

  .failure {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 45%, var(--line));
    border-radius: var(--radius-l);
    background: var(--danger-soft);
    font-size: 0.875rem;
  }

  .failure p {
    margin: 0;
  }

  .detail {
    color: var(--danger);
    font-family: var(--mono);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }
</style>
