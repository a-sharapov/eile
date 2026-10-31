<!-- Глава кукбука: список глав, текст с подсвеченным кодом, разделы главы и соседние главы. -->
<script lang="ts">
import Icon from '$components/Icon';
import Layout from '$components/Layout';
import { children, link, site } from '$core';
import Content from '$core/Content';

let { page } = $props();

const settings = site();
const t = settings.i18n;
const c = settings.custom;
const en = page.language === 'en';
const book = Number(en ? c.enCookbook : c.ruCookbook);
const chapters = children(book);
const index = chapters.findIndex((_) => _.id === page.id);
const prev = chapters[index - 1] ?? null;
const next = chapters[index + 1] ?? null;
// Та же глава на другом языке — по месту в кукбуке.
const twin = children(Number(en ? c.ruCookbook : c.enCookbook))[index] ?? null;
const alternate = twin
  ? link(twin.id)
  : link(Number(en ? c.ruCookbook : c.enCookbook));

const _plural = (forms: string, n: number): string =>
  ((list) =>
    list[
      ({ one: 0, few: 1, many: 2 } as Record<string, number>)[
        new Intl.PluralRules(page.language || 'ru').select(n)
      ] ?? list.length - 1
    ] ?? '')(forms.split('|'));

const _words = (html: string): number =>
  html
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

const minutes = Math.max(1, Math.round(_words(page.content) / 170));
const meta = [
  t.cookChapterOf
    .replace('{n}', String(index + 1))
    .replace('{total}', String(chapters.length)),
  `${minutes} ${_plural(t.cookMinutes, minutes)}`,
].join(' · ');

// Разделы главы для правой колонки: заголовки второго уровня с id.
const sections = [
  ...page.content.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g),
].map((_) => [_[1]!, _[2]!.replace(/<[^>]*>/g, '')] as const);

// Подсветка кода на сервере: страница уходит готовым HTML и без скриптов, результат лежит в кэше.
// Скобки в коде остаются сущностями, иначе текст страницы принял бы `[[…]]` и `[~…~]` за теги.
type Rule = readonly [string, string];

const _JS: readonly Rule[] = [
  ['c', String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
  ['s', String.raw`"[^"\n]*"|'[^'\n]*'|\x60[^\x60]*\x60`],
  [
    'k',
    String.raw`\b(?:import|from|export|let|const|function|return|if|else|as|new|typeof|true|false|null|undefined)\b`,
  ],
  ['e', String.raw`\$[A-Za-z]+\b`],
  ['n', String.raw`#[0-9a-fA-F]{3,8}\b|(?<![#\w])\d[\d_.]*[a-z%]*`],
];

const _MARKUP: readonly Rule[] = [
  ['c', String.raw`<!--[\s\S]*?-->`],
  ..._JS.slice(0, 2),
  ['k', String.raw`\{[#:/@][a-z]+`],
  ['t', String.raw`<\/?[A-Za-z][\w.:-]*|\/?>`],
  ['a', String.raw`[\w:-]+(?==)`],
  ..._JS.slice(2),
];

const _SHELL: readonly Rule[] = [
  ['c', String.raw`(?<=^|\s)#[^\n]*`],
  ['s', String.raw`"[^"\n]*"|'[^'\n]*'`],
  ['a', String.raw`(?<=\s)--?[A-Za-z][\w-]*`],
];

const _INI: readonly Rule[] = [
  ['c', String.raw`^[#;][^\n]*`],
  ['t', String.raw`^\[[^\]\n]+\]`],
  ['a', String.raw`^[\w.-]+(?==)`],
];

const _RULES: Readonly<Record<string, readonly Rule[]>> = {
  svelte: _MARKUP,
  html: _MARKUP,
  ts: _JS,
  sh: _SHELL,
  ini: _INI,
};

const _NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const _decode = (html: string): string =>
  html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) =>
    name.startsWith('#')
      ? String.fromCodePoint(
          name[1]?.toLowerCase() === 'x'
            ? Number.parseInt(name.slice(2), 16)
            : Number(name.slice(1))
        )
      : (_NAMED[name] ?? entity)
  );

const _encode = (text: string): string =>
  text.replace(/[&<>"'[\]{}]/g, (_) => `&#${_.codePointAt(0)};`);

const _span = (kind: string, text: string): string =>
  `<span class="${kind}">${_encode(text)}</span>`;

const _paint = (rules: readonly Rule[], text: string): string =>
  ((pattern) =>
    ((done) => done.out + _encode(text.slice(done.at)))(
      [...text.matchAll(pattern)].reduce(
        ({ out, at }, match) => ({
          out:
            out +
            _encode(text.slice(at, match.index)) +
            _span(
              rules[match.slice(1).findIndex((_) => _ !== undefined)]![0],
              match[0]
            ),
          at: match.index + match[0].length,
        }),
        { out: '', at: 0 }
      )
    ))(new RegExp(rules.map((_) => `(${_[1]})`).join('|') || '(?!)', 'gm'));

// В сеансе терминала строки без «$ » — ответ программы: они тише и без разбора.
const _shell = (text: string): string =>
  ((session) =>
    text
      .split('\n')
      .map((line) =>
        line.startsWith('$ ')
          ? `<span class="pr">$ </span>${_paint(_SHELL, line.slice(2))}`
          : session
            ? _span('o', line)
            : _paint(_SHELL, line)
      )
      .join('\n'))(/^\$ /m.test(text));

const _highlight = (html: string): string =>
  html.replace(
    /<pre([^>]*)><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, attributes: string, lang: string, body: string) =>
      `<pre${attributes}><code class="language-${lang}">${
        lang === 'sh'
          ? _shell(_decode(body))
          : _paint(_RULES[lang] ?? [], _decode(body))
      }</code></pre>`
  );

const html = _highlight(page.content);
</script>

{#snippet toc()}
  <ol class="chapters">
    {#each chapters as chapter, number (chapter.id)}
      <li>
        <a
          href={link(chapter.id)}
          aria-current={chapter.id === page.id ? 'page' : undefined}
        >
          <span class="n">{number + 1}</span>
          <span>{chapter.menuTitle || chapter.title}</span>
        </a>
      </li>
    {/each}
  </ol>
{/snippet}

<Layout {page} section="cookbook" {alternate}>
  <div class="book">
    <aside class="side" aria-label={t.cookAll}>
      <a class="home" href={link(book)}>{t.navCookbook}</a>
      {@render toc()}
    </aside>

    <details class="mobile">
      <summary>
        <span>{t.cookAll}</span>
        <Icon name="menu" />
      </summary>
      {@render toc()}
    </details>

    <article class="chapter">
      <h1>{page.longTitle || page.title}</h1>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
      <p class="meta">{meta}</p>

      <div class="prose"><Content of={page} {html} /></div>

      <nav class="pager" aria-label={t.cookAll}>
        {#if prev}
          <a class="prev" href={link(prev.id)} rel="prev">
            <span class="dir">{t.cookPrev}</span>
            <span class="name">{prev.menuTitle || prev.title}</span>
          </a>
        {/if}
        {#if next}
          <a class="next" href={link(next.id)} rel="next">
            <span class="dir">{t.cookNext}</span>
            <span class="name">{next.menuTitle || next.title}</span>
          </a>
        {/if}
      </nav>
    </article>

    {#if sections.length > 1}
      <aside class="here" aria-label={t.cookOnPage}>
        <p>{t.cookOnPage}</p>
        <ul>
          {#each sections as { 0: id, 1: title } (id)}
            <li><a href={`#${id}`}>{title}</a></li>
          {/each}
        </ul>
      </aside>
    {/if}
  </div>
</Layout>

<style>
  .book {
    display: grid;
    grid-template-columns: 15rem minmax(0, 44rem) 13rem;
    justify-content: space-between;
    gap: 3rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 0 auto;
    padding-top: clamp(2.5rem, 2rem + 2vw, 4rem);
  }

  .side,
  .here {
    position: sticky;
    top: 6rem;
    align-self: start;
    max-height: calc(100dvh - 7rem);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .home {
    display: block;
    margin-bottom: 0.75rem;
    color: var(--text);
    font: 650 1.0625rem/1.3 var(--display);
    text-decoration: none;
  }

  .chapters {
    display: grid;
    gap: 0.1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chapters a {
    display: grid;
    grid-template-columns: 1.6rem 1fr;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.35;
    text-decoration: none;
    transition:
      color 140ms var(--ease),
      background 140ms var(--ease);
  }

  .chapters a:hover {
    background: var(--bg);
    color: var(--text);
  }

  .chapters a[aria-current] {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .n {
    color: var(--faint);
    font: 500 0.8125rem/1.6 var(--mono);
    font-variant-numeric: tabular-nums;
  }

  [aria-current] .n {
    color: inherit;
  }

  .mobile {
    display: none;
  }

  .chapter {
    min-width: 0;
  }

  h1 {
    margin: 0;
    font: 650 clamp(2rem, 1.5rem + 2vw, 3rem) / 1.08 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .lead {
    margin: 1.25rem 0 0;
    color: var(--muted);
    font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.25rem);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .meta {
    margin: 1rem 0 0;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--line);
    color: var(--faint);
    font-size: 0.875rem;
  }

  .here p {
    margin: 0 0 0.75rem;
    color: var(--text);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .here ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0 0 0 0.85rem;
    border-left: 1px solid var(--line);
    list-style: none;
  }

  .here a {
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.35;
    text-decoration: none;
  }

  .here a:hover {
    color: var(--text);
  }

  .pager {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 4rem;
    padding-top: 2rem;
    border-top: 1px solid var(--line);
  }

  .pager a {
    display: grid;
    gap: 0.2rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
    transition:
      border-color 140ms var(--ease),
      background 140ms var(--ease);
  }

  .pager a:hover {
    border-color: var(--line-strong);
    background: var(--bg);
  }

  .next {
    grid-column: 2;
    text-align: right;
  }

  .dir {
    color: var(--faint);
    font-size: 0.8125rem;
  }

  .name {
    font-weight: 600;
  }

  /* Текст главы приходит из менеджера HTML-ом: стили без собственной специфичности. */
  .prose {
    font-size: 1.0625rem;
    line-height: 1.7;
  }

  .prose :global(:where(h2)) {
    margin: 3.25rem 0 0.75rem;
    font: 650 1.625rem/1.2 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .prose :global(:where(h3)) {
    margin: 2.25rem 0 0.5rem;
    font: 650 1.25rem/1.3 var(--display);
  }

  .prose :global(:where(p, ul, ol)) {
    margin: 1rem 0;
    text-wrap: pretty;
  }

  .prose :global(:where(ul, ol)) {
    padding-left: 1.4rem;
  }

  .prose :global(:where(li + li)) {
    margin-top: 0.4rem;
  }

  .prose :global(:where(ol.steps)) {
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  .prose :global(:where(ol.steps > li)) {
    position: relative;
    padding-left: 2.6rem;
    counter-increment: step;
  }

  .prose :global(:where(ol.steps > li)::before) {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0.1rem;
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font: 600 0.875rem/1 var(--sans);
    font-variant-numeric: tabular-nums;
  }

  .prose :global(:where(:not(pre) > code)) {
    padding: 0.1em 0.35em;
    border-radius: 0.35rem;
    background: var(--bg);
    font-size: 0.875em;
    overflow-wrap: anywhere;
  }

  .prose :global(:where(kbd)) {
    display: inline-block;
    padding: 0.05em 0.4em;
    border: 1px solid var(--line-strong);
    border-bottom-width: 2px;
    border-radius: 0.35rem;
    background: var(--raised);
    font: 500 0.8125em/1.4 var(--mono);
  }

  .prose :global(:where(b.ui)) {
    padding: 0.05em 0.4em;
    border: 1px solid var(--line);
    border-radius: 0.35rem;
    background: var(--raised);
    font-weight: 600;
    white-space: nowrap;
  }

  .prose :global(:where(figure.code)) {
    margin: 1.5rem 0;
    overflow: hidden;
    border: 1px solid #262d36;
    border-radius: var(--radius);
    background: var(--code-bg);
  }

  .prose :global(:where(figure.code figcaption)) {
    padding: 0.6rem 1.1rem;
    border-bottom: 1px solid #222831;
    color: #a9b4c2;
    font: 500 0.8125rem/1.3 var(--mono);
  }

  .prose :global(:where(pre)) {
    margin: 0;
    padding: 1rem 1.1rem 1.1rem;
    overflow-x: auto;
    color: #d8dee6;
    font: 400 0.875rem/1.7 var(--mono);
    tab-size: 2;
    scrollbar-color: #39424e transparent;
  }

  .prose :global(:where(pre code)) {
    font-size: inherit;
  }

  .prose :global(:where(pre .k)) {
    color: #c79bf2;
  }

  .prose :global(:where(pre .s)) {
    color: #9fd59a;
  }

  .prose :global(:where(pre .t)) {
    color: #7fb6f5;
  }

  .prose :global(:where(pre .a)) {
    color: #f2c37d;
  }

  .prose :global(:where(pre .e)) {
    color: #6fd3cf;
  }

  .prose :global(:where(pre .n)) {
    color: #f59f8a;
  }

  .prose :global(:where(pre .c, pre .o)) {
    color: #8a94a1;
  }

  .prose :global(:where(pre .pr)) {
    color: #6c7682;
    user-select: none;
  }

  .prose :global(:where(aside)) {
    margin: 1.75rem 0;
    padding: 1.1rem 1.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }

  .prose :global(:where(aside.goal)) {
    border-color: color-mix(in oklab, var(--accent) 18%, transparent);
    background: var(--accent-soft);
  }

  .prose :global(:where(aside > :last-child)) {
    margin-bottom: 0;
  }

  .prose :global(:where(aside p, aside ul)) {
    margin: 0.5rem 0;
    font-size: 1rem;
  }

  .prose :global(:where(.aside-title)) {
    margin: 0 0 0.35rem;
    font-weight: 650;
  }

  .prose :global(:where(aside.check ul)) {
    padding: 0;
    list-style: none;
  }

  .prose :global(:where(aside.check li)) {
    position: relative;
    padding-left: 1.6rem;
  }

  .prose :global(:where(aside.check li)::before) {
    content: '';
    position: absolute;
    left: 0;
    top: 0.3em;
    width: 1.05em;
    height: 1.05em;
    background: var(--ok);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
      center / contain no-repeat;
  }

  .prose :global(:where(h2[id])) {
    scroll-margin-top: 6rem;
  }

  @media (max-width: 80rem) {
    .book {
      grid-template-columns: 14rem minmax(0, 44rem);
      justify-content: start;
    }

    .here {
      display: none;
    }
  }

  @media (max-width: 60rem) {
    .book {
      display: block;
    }

    .side {
      display: none;
    }

    .mobile {
      display: block;
      margin-bottom: 2rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--raised);
    }

    .mobile summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }

    .mobile summary::-webkit-details-marker {
      display: none;
    }

    .mobile .chapters {
      padding: 0 0.5rem 0.5rem;
    }

    .pager {
      grid-template-columns: 1fr;
    }

    .next {
      grid-column: 1;
    }
  }
</style>
