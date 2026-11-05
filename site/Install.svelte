<!-- @component
Установка: команда с кнопкой «Копировать», «Скачать» и GitHub, строка платформ и версии. Стоит под
заголовком главной; блоком в тексте — для призыва в конце страницы.
-->
<script lang="ts">
import Icon from '$components/Icon';
import { current, link, site as settings } from '$core';
import Island from '$core/Island';

let {
  /** По центру: в шапке главной и в призыве */
  centered = true,
}: { centered?: boolean } = $props();

const site = settings();
const t = site.i18n;
const c = site.custom;
// Кукбук на языке страницы; нет его — нет и кнопки.
const book = link(
  Number(current()?.language === 'en' ? c.enCookbook : c.ruCookbook)
);
</script>

<div class="install" class:centered>
  <div class="command" data-command>
    <span class="prompt" aria-hidden="true">$</span>
    <!-- Строка прокручивается: фокус нужен, чтобы прокрутить её с клавиатуры. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <code tabindex="0">{c.install}</code>
    <Island name="CopyButton" props={{ text: c.install, label: t.copy, done: t.copied }} />
  </div>
  <div class="actions">
    <a class="primary" href={c.download}><Icon name="download" />{t.download}</a>
    <a class="secondary" href={c.repo}><Icon name="github" />{t.github}</a>
    {#if book}<a class="secondary" href={book}><Icon name="book" />{t.heroCookbook}</a>{/if}
  </div>
  <p class="source">
    <a href={c.installSource}>{t.viewScript}<Icon name="external" /></a>
    <span>{t.checksSha}</span>
  </p>
  <p class="meta">
    <span class="part">{t.platforms}</span>
    <span class="part">v{c.version}</span>
    <span class="part">GPL-3.0</span>
  </p>
</div>

<style>
  .install {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
    justify-items: start;
    width: 100%;
  }

  .centered {
    justify-items: center;
  }

  .command {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    max-width: 100%;
    padding: 0.3rem 0.3rem 0.3rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .prompt {
    color: var(--faint);
    font: 500 0.9375rem/1 var(--mono);
    user-select: none;
  }

  code {
    min-width: 0;
    padding: 0.55rem 0.5rem 0.55rem 0.35rem;
    overflow-x: auto;
    color: var(--text);
    font-size: 0.9375rem;
    white-space: nowrap;
    scrollbar-width: none;
    mask-image: linear-gradient(to right, #000 calc(100% - 1.5rem), transparent);
  }

  /* Маска у края гасит и кольцо фокуса, поэтому кольцо — у всей строки команды. */
  code:focus-visible {
    outline: none;
  }

  .command:has(code:focus-visible) {
    outline: 2px solid var(--fill);
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .centered .actions {
    justify-content: center;
  }

  .source {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.65rem;
    margin: 0;
    color: var(--faint);
    font-size: 0.875rem;
  }

  .centered .source {
    justify-content: center;
  }

  .source a {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--muted);
    font-weight: 500;
    text-decoration: none;
  }

  .source a:hover {
    color: var(--text);
  }

  .source a :global(.icon) {
    width: 0.9em;
    height: 0.9em;
  }

  .source span::before {
    content: '·';
    margin-right: 0.5rem;
  }

  .primary,
  .secondary {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    height: 3rem;
    padding: 0 1.4rem;
    border-radius: var(--radius);
    font: 600 1rem/1 var(--sans);
    text-decoration: none;
    transition:
      background 160ms var(--ease),
      border-color 160ms var(--ease),
      transform 160ms var(--ease);
  }

  .primary {
    background: var(--fill);
    color: var(--on-fill);
  }

  .primary:hover {
    background: var(--fill-hover);
  }

  .secondary {
    border: 1px solid var(--line-strong);
    background: var(--raised);
    color: var(--text);
  }

  .secondary:hover {
    background: var(--bg);
  }

  .primary:active,
  .secondary:active {
    transform: translateY(1px);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: inherit;
    gap: 0.35rem 0.7rem;
    margin: 0;
    color: var(--faint);
    font-size: 0.875rem;
  }

  .centered .meta {
    justify-content: center;
  }


  .part {
    white-space: nowrap;
  }

  /* Точка между частями только в одной строке: на узком экране части идут друг под другом. */
  .part + .part::before {
    content: '·';
    margin-right: 0.7rem;
  }

  /* На телефоне платформы — первой строкой, версия и лицензия — второй. */
  /* На телефоне три кнопки не встают в строку: «Скачать» — во всю ширину, остальные — парой под ней. */
  @media (max-width: 34rem) {
    .actions {
      width: 100%;
    }

    .primary {
      flex: 1 1 100%;
    }

    /* Пара под «Скачать»; если не помещается даже пара (крупный текст) — каждая своей строкой. */
    .secondary {
      flex: 1 1 8rem;
    }

    .primary,
    .secondary {
      justify-content: center;
      min-width: 0;
      height: auto;
      min-height: 3rem;
      padding: 0.5rem 0.75rem;
      text-align: center;
      overflow-wrap: anywhere;
    }

    .part:first-child {
      flex-basis: 100%;
      text-align: center;
      white-space: normal;
    }

    .part:nth-child(2)::before {
      content: none;
    }
  }
</style>
