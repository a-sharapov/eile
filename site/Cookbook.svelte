<!-- Оглавление кукбука: что получится, с чего начать и главы по порядку со временем чтения. -->
<script lang="ts">
import Icon from '$components/Icon';
import Layout from '$components/Layout';
import Shot from '$components/Shot';
import { children, image, link, site } from '$core';
import Content from '$core/Content';

let { page } = $props();

const settings = site();
const t = settings.i18n;
const c = settings.custom;
const en = page.language === 'en';
const chapters = children(page.id);
const alternate = link(Number(en ? c.ruCookbook : c.enCookbook));
// Сайт студии на языке кукбука: снимки английских глав — с приставкой en-.
const shot = en ? 'cook-en-site-home' : 'cook-site-home';
const result = image(`screens/${shot}-light.webp`);

const _plural = (forms: string, n: number): string =>
  ((list) =>
    list[
      ({ one: 0, few: 1, many: 2 } as Record<string, number>)[
        new Intl.PluralRules(page.language || 'ru').select(n)
      ] ?? list.length - 1
    ] ?? '')(forms.split('|'));

const _minutes = (html: string): number =>
  Math.max(
    1,
    Math.round(
      html
        .replace(/<[^>]*>/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length / 170
    )
  );

const times = chapters.map((_) => _minutes(_.content));
const shortest = Math.min(...times);
const longest = Math.max(...times);
const meta = [
  `${chapters.length} ${_plural(t.cookChapters, chapters.length)}`,
  `${shortest}–${longest} ${_plural(t.cookMinutes, longest)}`,
].join(' · ');
</script>

<Layout {page} section="cookbook" {alternate}>
  <section class="intro">
    <div class="text">
      <h1>{page.longTitle || page.title}</h1>
      {#if page.introText}<p class="lead">{page.introText}</p>{/if}
      {#if chapters[0]}
        <p class="go">
          <a class="start" href={link(chapters[0].id)}>
            <span>{t.cookStart}</span>
            <Icon name="arrow" />
          </a>
          <span class="meta">{meta}</span>
        </p>
      {/if}
    </div>
    {#if result}
      <figure class="result">
        <Shot
          name={shot}
          alt={t.cookSiteAlt}
          title={t.winStudio}
          sizes="(min-width: 64rem) 36rem, calc(94vw - 1rem)"
          eager
        />
      </figure>
    {/if}
  </section>

  {#if page.content}<div class="about"><Content of={page} /></div>{/if}

  <section class="list" aria-labelledby="chapters">
    <h2 id="chapters">{t.cookChaptersTitle}</h2>
    <ol class="toc">
      {#each chapters as chapter, index (chapter.id)}
        <li>
          <span class="n">{index + 1}</span>
          <div class="what">
            <h3><a href={link(chapter.id)}>{chapter.title}</a></h3>
            {#if chapter.introText}<p>{chapter.introText}</p>{/if}
          </div>
          <span class="time">{times[index]} {_plural(t.cookMinutes, times[index] ?? 1)}</span>
        </li>
      {/each}
    </ol>
  </section>
</Layout>

<style>
  .intro {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: clamp(2rem, 1rem + 4vw, 5rem);
    align-items: center;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 0 auto;
    padding-top: clamp(3rem, 2rem + 4vw, 6rem);
  }

  h1 {
    margin: 0;
    font: 700 clamp(2.5rem, 1.6rem + 3.4vw, 4.25rem) / 1.02 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .lead {
    max-width: 36rem;
    margin: 1.5rem 0 0;
    color: var(--muted);
    font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.25rem);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .go {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.5rem;
    margin: 2rem 0 0;
  }

  .start {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    height: 3rem;
    padding: 0 1.4rem;
    border-radius: var(--radius);
    background: var(--fill);
    color: var(--on-fill);
    font-weight: 600;
    text-decoration: none;
    transition: background 140ms var(--ease);
  }

  .start:hover {
    background: var(--fill-hover);
  }

  .meta {
    color: var(--faint);
    font-size: 0.9375rem;
  }

  .result {
    margin: 0;
  }

  .about {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: clamp(2.5rem, 2rem + 2vw, 4rem) auto 0;
    color: var(--muted);
    font-size: 1.0625rem;
    line-height: 1.7;
  }

  .about :global(:where(p)) {
    max-width: 44rem;
    margin: 0 0 1rem;
  }

  .list {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: clamp(3rem, 2rem + 3vw, 5rem) auto 0;
  }

  .list h2 {
    margin: 0 0 1.5rem;
    font: 650 clamp(1.75rem, 1.3rem + 1.6vw, 2.5rem) / 1.1 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.03em;
  }

  .toc {
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--line-strong);
    list-style: none;
  }

  .toc li {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) 7rem;
    gap: 1.5rem;
    align-items: baseline;
    padding: 1.4rem 0;
    border-bottom: 1px solid var(--line);
  }

  .n {
    color: var(--faint);
    font: 650 1.5rem/1 var(--display);
    font-variant-numeric: tabular-nums;
  }

  h3 {
    margin: 0;
    font: 650 1.25rem/1.3 var(--display);
    letter-spacing: -0.015em;
  }

  h3 a {
    color: var(--text);
    text-decoration: none;
  }

  h3 a:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .what p {
    max-width: 46rem;
    margin: 0.4rem 0 0;
    color: var(--muted);
    font-size: 0.9875rem;
    line-height: 1.55;
  }

  .time {
    color: var(--faint);
    font-size: 0.875rem;
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 56rem) {
    .intro {
      grid-template-columns: minmax(0, 1fr);
    }

    .toc li {
      grid-template-columns: 2.25rem minmax(0, 1fr);
      gap: 0.25rem 1rem;
    }

    .n {
      font-size: 1.125rem;
    }

    .time {
      grid-column: 2;
      text-align: left;
      white-space: normal;
    }
  }
</style>
