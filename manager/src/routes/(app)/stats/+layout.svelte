<script lang="ts">
import { t } from '#lib/i18n.ts';
import { can } from '#lib/session.svelte.ts';
import EdgeState from '#lib/ui/EdgeState.svelte';
import { resolve } from '$app/paths';
import { page } from '$app/state';

let { children } = $props();

// «Обзор» видят все менеджеры (без права analytics.read — только посещения); остальные разделы аналитики — только
// с этим правом. Без него экран не монтируется и ничего не запрашивает: прямой адрес показывает «нет доступа».
const visits = $derived(page.route.id === '/(app)/stats');
</script>

{#if visits || can('analytics.read')}
  {@render children()}
{:else}
  <EdgeState kind="forbidden" title={t('analytics.forbiddenTitle')} text={t('analytics.forbiddenText')}>
    {#snippet actions()}
      <a class="button primary" href={resolve('/(app)/stats')}>{t('analytics.toVisits')}</a>
    {/snippet}
  </EdgeState>
{/if}
