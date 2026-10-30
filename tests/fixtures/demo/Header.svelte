<!-- @component
Шапка сайта с названием.
-->
<script lang="ts">
let {
  /** Название сайта */
  siteName,
}: { siteName: string } = $props();
</script>

<header>
  <a href="/">{siteName}</a>
</header>

<style>
  header {
    padding: 1rem;
    border-bottom: 0.0625rem solid #ddd;
    font: 700 1.25rem system-ui, sans-serif;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
</style>
