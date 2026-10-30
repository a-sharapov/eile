<script>
import { getContext } from 'svelte';

let { of = null, html = null } = $props();
const content = getContext('cms:content');
const parts = $derived(content ? content.parse(html ?? of?.content ?? '') : []);
</script>

{#each parts as part}
  {#if 'html' in part}
    {@html content.links(part.html)}
  {:else if 'module' in part}
    {@html content.module(part.module, part.name)}
  {:else}
    {@const View = content.view(part.component)}
    {#if View}<View page={of} {...part.props} />{/if}
  {/if}
{/each}
