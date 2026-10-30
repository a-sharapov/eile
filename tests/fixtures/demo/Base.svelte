<script>
import Breadcrumbs from '$components/Breadcrumbs';
import Header from '$components/Header';
import Menu from '$components/Menu';
import Content from '$core/Content';

let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
  {#if page.description}
    <meta name="description" content={page.description}>
  {/if}
</svelte:head>

<Header siteName={site.name} />
<Menu depth={1} />

<main>
  <Breadcrumbs />
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
  }

  main {
    max-width: 40rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font: 1.125rem/1.6 system-ui, sans-serif;
  }
</style>
