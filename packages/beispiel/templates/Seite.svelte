<!-- @component
Seite des Beispiels: Kopf mit Menü, Text der Seite und Fuß mit dem Link zur Kontaktseite.
-->
<script lang="ts">
import { children, link } from '$core';
import Content from '$core/Content';

let { page, site } = $props();

const menu = children(null);
const contact = $derived(link(Number(site.custom.kontaktSeite)));
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

<header>
  <a class="name" href="/">{site.name}</a>
  <nav>
    {#each menu as item (item.id)}
      <a href={link(item.id)}>{item.menuTitle || item.title}</a>
    {/each}
  </nav>
</header>

<main>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</main>

<footer>
  <a href={contact}>Kontakt</a>
</footer>

<style>
  :global(body) {
    margin: 0;
    font: 1.0625rem/1.6 system-ui, sans-serif;
    color: #1f1f1f;
    background: #fbfaf7;
  }
  header,
  main,
  footer {
    max-width: 44rem;
    margin: 0 auto;
    padding: 1.5rem;
  }
  header {
    display: flex;
    gap: 1.5rem;
    align-items: baseline;
  }
  .name {
    font-weight: 700;
    color: inherit;
    text-decoration: none;
  }
  nav {
    display: flex;
    gap: 1rem;
  }
  footer {
    border-top: 0.0625rem solid #e4e0d8;
  }
</style>
