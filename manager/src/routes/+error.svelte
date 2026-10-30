<script lang="ts">
import { t } from '#lib/i18n.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';

const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{t(missing ? 'edge.notFoundTitle' : 'edge.errorTitle')} — {t('app.name')}</title></svelte:head>

<!-- Ошибка вне оболочки менеджера: тот же фон и тот же рисунок, что у крайних состояний внутри. -->
<main>
  <EdgeState
    kind={missing ? 'missing' : 'broken'}
    title={t(missing ? 'edge.notFoundTitle' : 'edge.errorTitle')}
    text={missing ? t('edge.notFoundText') : `${t('edge.errorText')} ${page.error?.message ?? page.status}`}
  >
    {#snippet actions()}
      <a class="button primary" href={resolve('/(app)/pages')}>{t('overview.title')}</a>
      {#if !missing}<button type="button" onclick={() => location.reload()}>{t('edge.reload')}</button>{/if}
    {/snippet}
  </EdgeState>
</main>

<style>
  main {
    display: grid;
    min-height: 100dvh;
    padding: 0 1.5rem;
    place-items: center;
    background: var(--bg);
  }
</style>
