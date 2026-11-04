<!-- @component
Сравнение «обычно» и «в Eile»: стопка слоёв типичного сайта на PHP против двух файлов. Слои — перевод
`stackPile`, через «|».
-->
<script lang="ts">
import { site } from '$core';

const t = site().i18n;
const pile = t.stackPile
  .split('|')
  .map((_) => _.trim())
  .filter(Boolean);
</script>

<div class="compare">
  <section class="side usual">
    <h3>{t.stackUsual}</h3>
    <p class="note">{t.stackUsualNote}</p>
    <ol class="pile">
      {#each pile as layer}<li>{layer}</li>{/each}
    </ol>
    <p class="foot">{t.stackUsualFoot}</p>
  </section>
  <section class="side eile">
    <h3>Eile</h3>
    <p class="note">{t.stackEileNote}</p>
    <dl class="files">
      <div class="file">
        <dt><code>cms</code><span>{t.stackBinary}</span></dt>
        <dd>{t.stackBinaryHas}</dd>
      </div>
      <div class="file">
        <dt><code>site.db</code><span>{t.stackDb}</span></dt>
        <dd>{t.stackDbHas}</dd>
      </div>
    </dl>
    <p class="foot">
      <code>cms backup copy.db</code> {t.stackBackup} <code>cms service install --from copy.db</code>{t.stackBackupEnd}
    </p>
  </section>
</div>

<style>
  .compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    overflow: hidden;
  }

  .side {
    display: flex;
    flex-direction: column;
    padding: clamp(1.5rem, 1rem + 2vw, 2.75rem);
  }

  .usual {
    background: var(--bg);
    border-right: 1px solid var(--line);
  }

  .eile {
    background: var(--raised);
  }

  h3 {
    margin: 0;
    font: 650 1.5rem/1.2 var(--display);
    letter-spacing: -0.02em;
  }

  .eile h3 {
    color: var(--accent);
  }

  .note {
    margin: 0.25rem 0 1.75rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .pile {
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line-strong);
    list-style: none;
    counter-reset: layer;
  }

  .pile li {
    display: flex;
    align-items: baseline;
    gap: 0.9rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--line-strong);
    font-size: 0.9375rem;
    counter-increment: layer;
  }

  .pile li::before {
    content: counter(layer, decimal-leading-zero);
    min-width: 1.5rem;
    color: var(--faint);
    font: 500 0.75rem/1 var(--mono);
  }

  .files {
    display: grid;
    align-content: start;
    margin: 0;
    border-top: 1px solid var(--line);
  }

  .file {
    padding: clamp(1.25rem, 1rem + 1.5vw, 2.25rem) 0;
    border-bottom: 1px solid var(--line);
  }

  dt {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 1rem;
  }

  dt code {
    color: var(--text);
    font-size: clamp(1.875rem, 1.4rem + 1.6vw, 2.75rem);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  dt span {
    color: var(--muted);
    font-size: 0.9375rem;
  }

  dd {
    margin: 0.6rem 0 0;
    color: var(--text);
    font-size: 1rem;
  }

  .foot {
    margin: auto 0 0;
    padding-top: 1.75rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .foot code {
    color: var(--text);
  }

  @media (max-width: 52rem) {
    .compare {
      grid-template-columns: 1fr;
    }

    .usual {
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
  }
</style>
