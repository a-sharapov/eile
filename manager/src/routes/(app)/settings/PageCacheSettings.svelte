<script lang="ts">
import { untrack } from 'svelte';
import { api } from '#lib/api.ts';
import { moment } from '#lib/format.ts';
import { number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { fileSize } from '#lib/media.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { PageCacheStats } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';

let {
  size = $bindable(),
  applied,
}: {
  /** Объём кэша в настройках сайта, МБ: сохраняется общей кнопкой настроек. */
  size: number;
  /** Сохранённый объём: сменился — сводка перечитывается. */
  applied: number;
} = $props();

let stats = $state<PageCacheStats | null>(null);
let busy = $state(false);

const loading = defineLoad(() =>
  api.get<PageCacheStats>('/cache').then((_) => (stats = _))
);
// Читает сохранённый объём — перезапускается, когда его сохранили.
$effect(() => ((_: number) => void untrack(() => loading.retry()))(applied));

const answered = $derived(stats ? stats.hits + stats.misses + stats.bypass : 0);
// Доля ответов из кэша среди всех ответов страниц; без ответов — прочерк.
const share = $derived(
  stats && answered > 0 ? `${Math.round((stats.hits / answered) * 100)} %` : '—'
);

const clear = () =>
  busy
    ? undefined
    : ((busy = true),
      api
        .send<PageCacheStats>('DELETE', '/cache')
        .then((_) => ((stats = _), notify(t('cache.cleared'))), failed)
        .finally(() => (busy = false)));
</script>

<section class="form-section" aria-labelledby="cache-title">
  <header>
    <h2 id="cache-title">{t('cache.title')}</h2>
    <p>{t('cache.hint')}</p>
  </header>
  <div class="fields">
    <LoadState load={loading}>
      {#if stats}
        <dl class="stats">
          <div><dt>{t('cache.pages')}</dt><dd>{number(stats.pages)}</dd></div>
          <div><dt>{t('cache.memory')}</dt><dd>{fileSize(stats.bytes)}<small class="muted">{t('cache.of', { total: fileSize(stats.budget) })}</small></dd></div>
          <div><dt>{t('cache.share')}</dt><dd>{share}</dd></div>
          <div><dt>{t('cache.bypass')}</dt><dd>{number(stats.bypass)}</dd></div>
        </dl>
        <p class="muted since">
          {t(stats.manual ? 'cache.sinceReset' : 'cache.sinceStart')} {moment(stats.since)} · {t('cache.answered', { n: number(answered) })}
        </p>
        <label>
          {t('cache.size')}
          <span class="unit">
            <input form="settings-form" type="number" required min="16" max="4096" step="1" inputmode="numeric" bind:value={size} />
            <span aria-hidden="true">{t('cache.mb')}</span>
          </span>
          <small>{t('cache.sizeHint')}</small>
        </label>
        <div class="actions">
          <button type="button" class="button" aria-disabled={busy} onclick={clear}>{t('cache.clear')}</button>
          <button type="button" class="button ghost" onclick={() => loading.retry()}>{@html icons.refresh}{t('cache.refresh')}</button>
        </div>
        <small class="muted">{t('cache.cdn')}</small>
      {/if}
    </LoadState>
  </div>
</section>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.75rem;
    margin: 0;
  }

  .stats div {
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
    font-size: 1.125rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  dd small {
    display: block;
    font-size: 0.8125rem;
    font-weight: 400;
  }

  .since {
    margin: 0;
    font-size: 0.875rem;
  }

  .unit {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .unit input {
    width: 8rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
