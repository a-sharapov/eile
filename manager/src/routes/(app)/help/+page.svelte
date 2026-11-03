<script lang="ts">
import type { Component } from 'svelte';
import {
  currentLanguage,
  type Language,
  type MessageKey,
  t,
} from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { session } from '#lib/session.svelte.ts';
import PageHeader from '#lib/ui/PageHeader.svelte';
import './help.css';
import HelpDe from './HelpDe.svelte';
import HelpEn from './HelpEn.svelte';
import HelpRu from './HelpRu.svelte';
import type { HelpProps } from './help.ts';

type Chapter = {
  readonly id: string;
  readonly title: MessageKey;
  readonly admin?: boolean;
};

// Главы — по задачам, а не по экранам: «как сделать», а не «что где лежит».
const _CHAPTERS: readonly Chapter[] = [
  { id: 'start', title: 'help.chapterStart' },
  { id: 'pages', title: 'help.chapterPages' },
  { id: 'text', title: 'help.chapterText' },
  { id: 'media', title: 'help.chapterMedia' },
  { id: 'forms', title: 'help.chapterForms' },
  { id: 'stats', title: 'help.chapterStats' },
  { id: 'speed', title: 'help.chapterSpeed' },
  { id: 'keys', title: 'help.chapterKeys' },
  { id: 'account', title: 'help.chapterAccount' },
  { id: 'admin', title: 'help.chapterAdmin', admin: true },
  { id: 'trouble', title: 'help.chapterTrouble' },
];

// Текст помощи — свой на каждом языке: перевод целыми главами, а не строками.
const _TEXT: Readonly<Record<Language, Component<HelpProps>>> = {
  en: HelpEn,
  de: HelpDe,
  ru: HelpRu,
};
const Text = _TEXT[currentLanguage()];

const admin = $derived(session.user?.role === 'admin');
const chapters = $derived(_CHAPTERS.filter((_) => admin || !_.admin));
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? '⌘' : t('common.ctrl');

// Поиск по помощи: тексты разделов собираются один раз, лишние разделы и главы прячутся.
let article = $state<HTMLElement>();
let query = $state('');
let texts = $state<ReadonlyMap<string, string>>(new Map());

$effect(
  () =>
    void (
      article &&
      (texts = new Map(
        [...article.querySelectorAll<HTMLElement>('[data-topic]')].map((_) => [
          _.id,
          (_.textContent ?? '').toLowerCase(),
        ])
      ))
    )
);

const needle = $derived(query.trim().toLowerCase());
const shown = (topic: string): boolean =>
  needle === '' || (texts.get(topic) ?? '').includes(needle);
const anyShown = $derived(
  needle === '' || [...texts.values()].some((_) => _.includes(needle))
);
const chapterShown = (chapter: string): boolean =>
  needle === '' ||
  [...texts.entries()].some(
    ([id, text]) => id.startsWith(`${chapter}-`) && text.includes(needle)
  );

// Оглавление подсвечивает главу, которую сейчас читают.
let active = $state('start');

$effect(() => {
  const observer = new IntersectionObserver(
    (entries) =>
      entries
        .filter((_) => _.isIntersecting)
        .forEach((_) => void (active = _.target.id)),
    { rootMargin: '-20% 0px -70% 0px' }
  );
  article
    ?.querySelectorAll('h2[id]:not(#thanks-title)')
    .forEach((_) => void observer.observe(_));
  return () => observer.disconnect();
});
</script>

<svelte:head><title>{t('nav.help')} — {t('app.name')}</title></svelte:head>

<PageHeader title={t('help.title')} crumbs={[{ label: t('nav.help') }]} />

<div class="help">
  <aside class="toc">
    <label class="find">
      <span class="sr-only">{t('help.search')}</span>
      {@html icons.search}
      <input type="search" bind:value={query} placeholder={t('help.search')} />
    </label>
    <nav aria-label={t('help.contents')}>
      <ol>
        {#each chapters as chapter (chapter.id)}
          {#if chapterShown(chapter.id)}
            <li><a href={`#${chapter.id}`} aria-current={active === chapter.id ? 'location' : undefined}>{t(chapter.title)}</a></li>
          {/if}
        {/each}
      </ol>
    </nav>
  </aside>

  <article class="help-text" bind:this={article}>
    <Text {shown} {chapterShown} {mod} {admin} />
    {#if !anyShown}
      <p class="nothing">{t('help.nothing')}</p>
    {/if}
  </article>
</div>

<style>
  /* Помощь читают: колонка текста ~65 знаков, оглавление справа и закреплено; узко — сверху. */
  .help {
    container: help / inline-size;
    display: grid;
    grid-template-columns: minmax(0, 42rem) minmax(13rem, 16rem);
    gap: 3rem;
    align-items: start;
    justify-content: space-between;
  }

  .toc {
    position: sticky;
    top: calc(var(--topbar, 0) + 5rem);
    order: 2;
    display: grid;
    gap: 1rem;
  }

  .find {
    position: relative;
    display: block;
  }

  .find :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: var(--muted);
    transform: translateY(-50%);
  }

  .find input {
    width: 100%;
    padding-left: 2.25rem;
  }

  .toc ol {
    display: grid;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toc a {
    display: block;
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.875rem;
    text-decoration: none;
  }

  .toc a:hover {
    background: var(--hover);
    color: var(--text);
  }

  .toc a[aria-current] {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }

  /* Узкая холстина: оглавление — над текстом строкой ссылок. Правило после базовых — перебивает их. */
  @container help (width < 52rem) {
    .toc {
      position: static;
      order: 0;
      grid-column: 1 / -1;
    }

    article {
      grid-column: 1 / -1;
    }

    .toc ol {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .toc a {
      padding: 0.25rem 0.6rem;
      border: 0.0625rem solid var(--line);
      border-radius: 999px;
      font-size: 0.8125rem;
    }
  }

  article {
    font-size: 1rem;
    line-height: 1.65;
  }

  .nothing {
    color: var(--muted);
  }
</style>
