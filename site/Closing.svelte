<!-- @component
Призыв в конце страницы: установка и честная пометка про альфу.
-->
<script lang="ts">
import Install from '$components/Install';
import { site } from '$core';

const t = site().i18n;
</script>

<section class="closing" id="download">
  <Install />
  <p class="alpha">{t.closeAlpha}</p>
</section>

<style>
  .closing {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: clamp(6rem, 3rem + 7vw, 10rem) auto 0;
    padding: clamp(3rem, 2rem + 4vw, 5.5rem) clamp(1.25rem, 1rem + 3vw, 4rem);
    border: 1px solid var(--line);
    border-radius: calc(var(--radius-l) * 1.5);
    background:
      radial-gradient(60rem 22rem at 50% 0%, color-mix(in oklab, var(--accent-soft) 85%, transparent), transparent 70%),
      var(--bg);
    text-align: center;
  }

  .alpha {
    max-width: 34rem;
    margin: 2rem 0 0;
    color: var(--faint);
    font-size: 0.875rem;
  }
</style>
