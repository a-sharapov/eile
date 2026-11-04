<!-- @component
Призыв в конце страницы: заголовок на ступень меньше героя, одна строка о главном и установка.
-->
<script lang="ts">
import Install from '$components/Install';
import { site } from '$core';

const t = site().i18n;
</script>

<section class="closing" id="download" aria-labelledby="closing-title">
  <h2 id="closing-title">{t.closeTitle}</h2>
  <p class="recap">{t.closeRecap}</p>
  <Install />
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

  /* Рисунок заголовка героя, на ступень меньше. */
  h2 {
    max-width: 18ch;
    margin: 0;
    font: 700 clamp(2.25rem, 1.4rem + 3vw, 3.75rem) / 1.04 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.035em;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .recap {
    max-width: 38rem;
    margin: 1.1rem 0 2rem;
    color: var(--muted);
    font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.25rem);
    line-height: 1.55;
    text-wrap: pretty;
  }
</style>
