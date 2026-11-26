<script lang="ts">
import { carriedQuery } from '#lib/analytics-reports.ts';
import { type MessageKey, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { quality } from '#lib/quality-status.svelte.ts';
import { can } from '#lib/session.svelte.ts';
import { resolve } from '$app/paths';
import { page } from '$app/state';

// Разделы статистики: «Обзор» (итоги аналитики и посещения сайта), источники, воронки, когорты, люди из событий,
// метки, расходы и курсы, качество данных, настройка аналитики — служебные в конце. Это переходы между экранами, а
// не вкладки одной формы: ссылки с aria-current, у каждой свой адрес. «Источники», «Воронки», «Когорты» и «Люди»
// передают друг другу период, атрибуцию, фильтры, тестовых, комиссию и сравнение: фильтр действует на все четыре.
// `help` — раздел главы «Аналитика» справки для ссылки «?» вкладки; подвкладка может назвать свой раздел.
type Section =
  | 'overview'
  | 'sources'
  | 'funnels'
  | 'cohorts'
  | 'people'
  | 'labels'
  | 'spend'
  | 'quality'
  | 'setup';

const _SECTIONS: readonly {
  id: Section;
  href: string;
  label: MessageKey;
  icon: string;
  carries: boolean;
  help: string;
}[] = [
  {
    id: 'overview',
    href: resolve('/(app)/stats'),
    label: 'analytics.overview',
    icon: icons.dashboard,
    help: 'analytics-what',
    carries: false,
  },
  {
    id: 'sources',
    href: resolve('/(app)/stats/sources'),
    label: 'analytics.sources',
    icon: icons.route,
    help: 'analytics-reports',
    carries: true,
  },
  {
    id: 'funnels',
    href: resolve('/(app)/stats/funnels'),
    label: 'analytics.funnels',
    icon: icons.funnel,
    help: 'analytics-reports',
    carries: true,
  },
  {
    id: 'cohorts',
    href: resolve('/(app)/stats/cohorts'),
    label: 'analytics.cohorts',
    icon: icons.grid,
    help: 'analytics-reports',
    carries: true,
  },
  {
    id: 'people',
    href: resolve('/(app)/stats/people'),
    label: 'analytics.people',
    icon: icons.users,
    help: 'analytics-reports',
    carries: true,
  },
  {
    id: 'labels',
    href: resolve('/(app)/stats/labels'),
    label: 'analytics.labels',
    icon: icons.tag,
    help: 'analytics-labels',
    carries: false,
  },
  {
    id: 'spend',
    href: resolve('/(app)/stats/spend'),
    label: 'analytics.spend',
    icon: icons.coins,
    help: 'analytics-money',
    carries: false,
  },
  {
    id: 'quality',
    href: resolve('/(app)/stats/quality'),
    label: 'analytics.quality',
    icon: icons.badgeCheck,
    help: 'analytics-quality',
    carries: false,
  },
  {
    id: 'setup',
    href: resolve('/(app)/stats/setup'),
    label: 'analytics.setup',
    icon: icons.settings,
    help: 'analytics-setup',
    carries: false,
  },
];

let { help }: { help?: string } = $props();

const current = $derived(
  ((route) =>
    _SECTIONS.find(
      (_) => _.id !== 'overview' && route.startsWith(`/(app)/stats/${_.id}`)
    )?.id ?? 'overview')(page.route.id ?? '')
);

const section = $derived(_SECTIONS.find((_) => _.id === current)!);

// Переносить есть что, только из «Источников», «Воронок», «Когорт» и «Людей»: из журнала событий — нет.
const carried = $derived(
  section.carries && page.url.searchParams.get('tab') !== 'events'
    ? carriedQuery(page.url.searchParams)
    : ''
);
</script>

{#if can('analytics.read')}
  <div class="sections">
    <div class="bar">
      <nav class="segmented" aria-label={t('analytics.sections')}>
        {#each _SECTIONS as item (item.id)}
          <a href={`${item.href}${item.carries ? carried : ''}`} aria-current={current === item.id ? 'page' : undefined}>{@html item.icon}<span>{t(item.label)}</span>{#if item.id === 'quality' && quality.failures > 0}<span class="dot" aria-hidden="true"></span><span class="sr-only">: {tn('analytics.qualityFailures', quality.failures)}</span>{/if}</a>
        {/each}
      </nav>
      <!-- «?» — раздел справки об открытом экране: та же глава, что в «Помощи», с якорем раздела. -->
      <a class="help" href={`${resolve('/(app)/help')}#${help ?? section.help}`} aria-label={t('analytics.helpFor', { name: t(section.label) })} title={t('analytics.helpFor', { name: t(section.label) })}>{@html icons.help}</a>
    </div>
  </div>
{/if}

<style>
  /* Ширину решает место под разделами, а не экран: рядом может стоять дерево страниц. */
  .sections {
    container-type: inline-size;
    min-width: 0;
  }

  /* Разделы и «?» справки — одной строкой: «?» не уходит под разделы и на узком экране. */
  .bar {
    display: flex;
    gap: 0.5rem;
    align-items: start;
    margin-bottom: 1.25rem;
  }

  /* Переключатель разделов — «таблетка» на подложке, как вкладки дерева и «Формы | Заявки». */
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    justify-self: start;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    gap: 0.125rem;
    padding: 0.1875rem;
    border-radius: calc(var(--radius) + 0.1875rem);
    background: var(--hover);
  }

  .segmented a {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    padding: 0 0.75rem;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 550;
    text-decoration: none;
    white-space: nowrap;
  }

  .segmented a:hover:not([aria-current='page']) {
    background: var(--hover);
    color: var(--text);
  }

  .segmented a[aria-current='page'] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    color: var(--text);
    font-weight: 600;
  }

  .segmented a :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
  }

  /* «?» — круглая кнопка высотой с «таблетку» разделов. */
  .help {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 2.375rem;
    height: 2.375rem;
    border-radius: 50%;
    color: var(--muted);
  }

  .help:hover {
    background: var(--hover);
    color: var(--text);
  }

  .help :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  /* Нерешённый сбой проверки данных — точка у «Качества»; словами — для читалки. */
  .dot {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--danger);
    box-shadow: 0 0 0 0.125rem var(--hover);
  }

  /* Девять разделов и «?» на средней ширине: значки уступают место словам (на 1440 с деревом — ещё со значками). */
  @container (width < 65rem) {
    .segmented a :global(svg) {
      display: none;
    }
  }

  /* Уже 53rem: разделы — сеткой в три столбца, три ровных ряда без строки-сироты; на немецком тоже без обрезки. */
  @container (width < 53rem) {
    .segmented {
      display: grid;
      flex: 1;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      width: auto;
    }

    .segmented a {
      padding: 0 0.4rem;
    }
  }

  /* Телефон: шрифт мельче, чтобы и «Einrichtung» влезла в треть ряда рядом с «?». */
  @container (width < 28rem) {
    .bar {
      gap: 0.25rem;
    }

    .segmented a {
      gap: 0.3rem;
      padding: 0 0.25rem;
      font-size: 0.8125rem;
    }
  }
</style>
