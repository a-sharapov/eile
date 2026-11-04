<!-- @component
Строка перевода с разметкой без HTML: `команда` — моноширинным, [текст](адрес) — ссылка, [n] — ссылка на
источник n (`#{anchor}-n`, обратно — `#{anchor}-ref-n`). Перевод остаётся текстом: правят его в менеджере,
а HTML в нём не исполняется.
-->
<script lang="ts">
let {
  /** Строка перевода */
  text,
  /** Начало id источников на странице: wp-source → #wp-source-1 */
  anchor = 'source',
  /** Подпись ссылки на источник для читалки, {n} — номер */
  refLabel = '{n}',
}: { text: string; anchor?: string; refLabel?: string } = $props();

type Part = {
  kind: 'text' | 'code' | 'ref' | 'link';
  value: string;
  href?: string;
};

const _LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

const _part = (_: string): Part =>
  ((link) =>
    link
      ? { kind: 'link', value: link[1]!, href: link[2]! }
      : _.startsWith('`')
        ? { kind: 'code', value: _.slice(1, -1) }
        : /^\[\d+\]$/.test(_)
          ? { kind: 'ref', value: _.slice(1, -1) }
          : { kind: 'text', value: _ })(_LINK.exec(_));

// Ссылка на источник прижимается к слову: «плагины [1].» → «плагины¹.»
const parts = $derived(
  text
    .replace(/\s+\[(\d+)\]/g, '[$1]')
    .split(/(\[[^\]]+\]\([^)\s]+\)|`[^`]+`|\[\d+\])/)
    .filter(Boolean)
    .map(_part)
);
</script>

{#each parts as part}{#if part.kind === 'code'}<code class="rich">{part.value}</code>{:else if part.kind === 'link'}<a href={part.href}>{part.value}</a>{:else if part.kind === 'ref'}<sup class="ref" id={`${anchor}-ref-${part.value}`}><a href={`#${anchor}-${part.value}`} aria-label={refLabel.replace('{n}', part.value)}>{part.value}</a></sup>{:else}{part.value}{/if}{/each}

<style>
  .rich {
    padding: 0.05em 0.2em;
    border-radius: var(--radius-pill-code);
    background: color-mix(in oklab, var(--line) 60%, transparent);
    font-size: 0.875em;
    font-weight: 500;
    overflow-wrap: anywhere;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  .ref {
    line-height: 0;
    scroll-margin-top: 6rem;
  }

  .ref a {
    margin-left: 0.1em;
    padding: 0 0.1em;
    font: 600 0.75em/1 var(--mono);
    text-decoration: none;
  }

  .ref a:hover {
    text-decoration: underline;
  }
</style>
