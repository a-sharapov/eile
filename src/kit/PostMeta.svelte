<!-- @component
Подпись поста: дата публикации и время чтения.
-->
<script lang="ts">
import { current, site } from '$core';

let {
  /** Показывать время чтения */
  reading = true,
  /** Слов в минуту для времени чтения */
  speed = 180,
  /** Шаблон времени чтения: {n} — минуты */
  readingLabel = '{n} мин чтения',
}: {
  reading?: boolean;
  speed?: number;
  readingLabel?: string;
} = $props();

const here = current();
const language = here?.language || site().language;
const dates = new Intl.DateTimeFormat(language, {
  dateStyle: 'long',
  timeZone: 'UTC',
});
// Слова текста без разметки и тегов компонентов.
const words = (here?.content ?? '')
  .replace(/<[^>]*>|\[\[[^\]]*\]\]/g, ' ')
  .split(/\s+/)
  .filter(Boolean).length;
const minutes = $derived(Math.max(1, Math.round(words / Math.max(60, speed))));
</script>

{#if here}
  <p class="meta">
    {#if here.publishedAt}
      <time datetime={here.publishedAt}>{dates.format(new Date(here.publishedAt))}</time>
    {/if}
    {#if reading && words > 0}
      <span>{readingLabel.replaceAll('{n}', String(minutes))}</span>
    {/if}
  </p>
{/if}

<style>
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0 0 1.5rem;
    color: var(--t-muted, #5b6472);
    font-size: 0.875em;
  }
</style>
