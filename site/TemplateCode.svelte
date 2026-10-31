<!-- @component
Шаблон на Svelte: настоящий код ленты блога и три свойства, которые отличают шаблоны Eile.
-->
<script lang="ts">
import { site } from '$core';

const t = site().i18n;

// Код подсвечен заранее: на странице нет ни подсветчика, ни скрипта.
const _k = (_: string) => `<span class="k">${_}</span>`;
const _s = (_: string) => `<span class="s">${_}</span>`;
const _t = (_: string) => `<span class="t">${_}</span>`;
const _a = (_: string) => `<span class="a">${_}</span>`;
const _e = (_: string) => `<span class="e">${_}</span>`;
const _lt = '<span class="p">&lt;</span>';
const _gt = '<span class="p">&gt;</span>';

const code = [
  `${_lt}${_t('script')}${_gt}`,
  `  ${_k('import')} Layout ${_k('from')} ${_s("'$components/Layout'")};`,
  `  ${_k('import')} { link, listing } ${_k('from')} ${_s("'$core'")};`,
  '',
  `  ${_k('let')} { page, site } = ${_e('$props')}();`,
  `  ${_k('const')} posts = ${_e('listing')}(page.id, { perPage: <span class="n">10</span> });`,
  `${_lt}/${_t('script')}${_gt}`,
  '',
  `${_lt}${_t('Layout')} ${_a('{page}')}${_gt}`,
  `  ${_lt}${_t('h1')}${_gt}${_a('{page.longTitle || page.title}')}${_lt}/${_t('h1')}${_gt}`,
  `  ${_a('{#each posts.items as post (post.id)}')}`,
  `    ${_lt}${_t('a')} href=${_a('{link(post.id)}')}${_gt}${_a('{post.title}')}${_lt}/${_t('a')}${_gt}`,
  `  ${_a('{/each}')}`,
  `  ${_lt}${_t('p')}${_gt}${_a('{site.custom.phone}')}${_lt}/${_t('p')}${_gt}`,
  `${_lt}/${_t('Layout')}${_gt}`,
].join('\n');

const facts = [
  [t.codeLive, t.codeLiveText],
  [t.codeSafe, t.codeSafeText],
  [t.codeIslands, t.codeIslandsText],
];
</script>

<div class="code">
  <figure class="window">
    <figcaption>
      <span class="file">Blog</span>
      <span class="kind">{t.codeKind}</span>
    </figcaption>
    <pre><code>{@html code}</code></pre>
  </figure>
  <dl class="facts">
    {#each facts as { 0: term, 1: text }}
      <div>
        <dt>{term}</dt>
        <dd>{text}</dd>
      </div>
    {/each}
  </dl>
</div>

<style>
  .code {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
    gap: clamp(2rem, 1rem + 3vw, 4rem);
    align-items: center;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
  }

  .window {
    margin: 0;
    overflow: hidden;
    border: 1px solid #262d36;
    border-radius: var(--radius-l);
    background: var(--code-bg);
    color: #d8dee6;
  }

  figcaption {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid #222831;
    font-size: 0.8125rem;
  }

  .file {
    color: #f2f5f8;
    font: 600 0.8125rem/1 var(--mono);
  }

  .kind {
    padding: 0.2rem 0.5rem;
    border-radius: 1rem;
    background: #1f2a3a;
    color: #9cc0f0;
    font-weight: 600;
  }

  pre {
    margin: 0;
    padding: 1.25rem 1.5rem 1.5rem;
    overflow-x: auto;
    font: 400 0.875rem/1.7 var(--mono);
    tab-size: 2;
    scrollbar-color: #39424e transparent;
  }

  pre :global(.k) {
    color: #c79bf2;
  }

  pre :global(.s) {
    color: #9fd59a;
  }

  pre :global(.t) {
    color: #7fb6f5;
  }

  pre :global(.a) {
    color: #f2c37d;
  }

  pre :global(.e) {
    color: #6fd3cf;
  }

  pre :global(.n) {
    color: #f59f8a;
  }

  pre :global(.p) {
    color: #7c8692;
  }

  .facts {
    display: grid;
    gap: 1.75rem;
    margin: 0;
  }

  dt {
    font: 600 1.125rem/1.35 var(--sans);
  }

  dd {
    margin: 0.4rem 0 0;
    color: var(--muted);
    font-size: 0.9875rem;
  }

  @media (max-width: 60rem) {
    .code {
      grid-template-columns: 1fr;
    }

    .facts {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 40rem) {
    .facts {
      grid-template-columns: 1fr;
    }
  }
</style>
