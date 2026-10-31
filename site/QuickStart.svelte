<!-- @component
Быстрый старт в три шага: установить, развернуть готовый сайт, запустить.
-->
<script lang="ts">
import Icon from '$components/Icon';
import { current, link, site as settings } from '$core';

const site = settings();
const t = site.i18n;
const c = site.custom;
const en = current()?.language === 'en';
const book = link(Number(en ? c.enCookbook : c.ruCookbook));

const steps = [
  [t.startInstall, 'curl -fsSL …/install.sh | bash', t.startInstallText],
  [t.startNew, 'cms new blog --db site.db', t.startNewText],
  [t.startRun, 'cms --db site.db', t.startRunText],
];
</script>

<ol class="steps">
  {#each steps as { 0: title, 1: command, 2: text }, index}
    <li>
      <span class="n" aria-hidden="true">{index + 1}</span>
      <h3>{title}</h3>
      <code>{command}</code>
      <p>{text}</p>
    </li>
  {/each}
</ol>
{#if book}
  <p class="more">
    {t.startCookbook}
    <a href={book}>{t.navCookbook}<Icon name="arrow" /></a>
  </p>
{/if}

<style>
  .more {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 1.5rem auto 0;
    color: var(--muted);
  }

  .more a {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 600;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    padding: 1.75rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
  }

  .n {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    color: var(--muted);
    font: 600 0.875rem/1 var(--mono);
  }

  h3 {
    margin: 1.25rem 0 0.85rem;
    font: 650 1.25rem/1.25 var(--display);
    letter-spacing: -0.015em;
  }

  code {
    display: block;
    padding: 0.75rem 0.9rem;
    overflow-x: auto;
    border-radius: 0.6rem;
    background: var(--code-bg);
    color: #e6ebf1;
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  p {
    margin: 0.9rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  @media (max-width: 56rem) {
    .steps {
      grid-template-columns: 1fr;
    }
  }
</style>
