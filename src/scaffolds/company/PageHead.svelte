<!-- @component
Шапка внутренней страницы: хлебные крошки, заголовок и подзаголовок на светлой полосе.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Breadcrumbs from '$components/Breadcrumbs';

let {
  /** Заголовок */
  title,
  /** Подзаголовок под заголовком */
  lead = '',
  children,
}: { title: string; lead?: string; children?: Snippet } = $props();
</script>

<div class="head">
  <div class="wrap">
    <Breadcrumbs />
    <h1>{title}</h1>
    {#if lead}<p class="lead">{lead}</p>{/if}
    {#if children}{@render children()}{/if}
  </div>
</div>

<style>
  .head {
    padding: 2.5rem 0 3.5rem;
    border-bottom: 0.0625rem solid var(--t-border, #dfe4ec);
    background: var(--t-hover, #f2f5fa);
  }

  .wrap {
    width: var(--page, min(76rem, 100% - 3rem));
    margin-inline: auto;
  }

  h1 {
    max-width: 52rem;
    margin: 1.5rem 0 0;
    font-size: clamp(2rem, 1.4rem + 2.4vw, 3.25rem);
    line-height: 1.1;
  }

  .lead {
    max-width: 42rem;
    margin: 1rem 0 0;
    color: var(--t-muted, #536074);
    font-size: 1.1875rem;
  }
</style>
