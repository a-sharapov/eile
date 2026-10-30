<script lang="ts">
import { elements, elementsLoad } from '#lib/elements.svelte.ts';
import { fields } from '#lib/fields.svelte.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { plugins } from '#lib/plugins.svelte.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import KitList from './KitList.svelte';

// Вкладка — в адресе: ссылка ?tab=kit открывает набор компонентов сразу.
let tab = $state(page.url.searchParams.get('tab') === 'kit' ? 'kit' : 'site');

$effect(() => {
  const search = tab === 'kit' ? '?tab=kit' : '';
  void (
    page.url.search !== search &&
    goto(`${resolve('/(app)/elements')}${search}`, {
      replace: true,
      reset: false,
    })
  );
});

type Group = {
  readonly id: string;
  readonly title: MessageKey;
  readonly about: MessageKey;
  readonly icon: keyof typeof icons;
  readonly items: readonly { readonly name: string; readonly href: string }[];
};

// Каждая группа — строка: что это, сколько и сами элементы ссылками — сразу открыть нужный.
const groups = $derived<Group[]>([
  {
    id: 'template',
    title: 'elements.templates',
    about: 'elements.aboutTemplates',
    icon: 'template',
    items: elements.items
      .filter((_) => _.kind === 'template')
      .map((_) => ({
        name: _.name,
        href: resolve('/(app)/elements/[kind]/[name]', {
          kind: 'template',
          name: _.name,
        }),
      })),
  },
  {
    id: 'component',
    title: 'elements.components',
    about: 'elements.aboutComponents',
    icon: 'component',
    items: elements.items
      .filter((_) => _.kind === 'component')
      .map((_) => ({
        name: _.name,
        href: resolve('/(app)/elements/[kind]/[name]', {
          kind: 'component',
          name: _.name,
        }),
      })),
  },
  {
    id: 'plugin',
    title: 'plugins.title',
    about: 'elements.aboutPlugins',
    icon: 'plug',
    items: plugins.items.map((_) => ({
      name: _.name,
      href: resolve('/(app)/plugins/[name]', { name: _.name }),
    })),
  },
  {
    id: 'field',
    title: 'fields.title',
    about: 'elements.aboutFields',
    icon: 'fields',
    items: fields.items.map((_) => ({
      name: _.name,
      href: `${resolve('/(app)/fields')}?name=${_.name}`,
    })),
  },
]);
</script>

<svelte:head><title>{t('nav.elements')} — {t('app.name')}</title></svelte:head>

<PageHeader title={t('elements.overviewTitle')} crumbs={[{ label: t('nav.elements') }]} />

{#snippet siteTab()}
<LoadState load={elementsLoad}>
<ul class="groups frame">
  {#each groups as group (group.id)}
    <li>
      <span class="glyph" aria-hidden="true">{@html icons[group.icon]}</span>
      <div class="body">
        <h2>{t(group.title)}<span class="count">{group.items.length}</span></h2>
        <p class="muted">{t(group.about)}</p>
        {#if group.items.length > 0}
          <ul class="items" aria-label={t(group.title)}>
            {#each group.items as item (item.name)}<li><a class="code" href={item.href}>{item.name}</a></li>{/each}
          </ul>
        {/if}
      </div>
    </li>
  {/each}
</ul>
</LoadState>
<p class="muted hint">{t('elements.empty')}</p>
{/snippet}

{#snippet kitTab()}
<KitList />
{/snippet}

<Tabs
  label={t('nav.elements')}
  bind:current={tab}
  tabs={[
    { id: 'site', label: t('elements.tabSite'), content: siteTab },
    { id: 'kit', label: t('kit.title'), content: kitTab },
  ]}
/>

<style>
  .groups {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .groups > li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1rem;
    padding: 1.25rem 1.35rem;
  }

  .groups > li + li {
    border-top: 0.0625rem solid var(--line);
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--sunken);
    color: var(--accent);
  }

  .glyph :global(svg) {
    width: 1.25rem;
    height: 1.25rem;
  }

  .body {
    display: grid;
    gap: 0.35rem;
  }

  h2 {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 1rem;
  }

  .count {
    min-width: 1.5rem;
    padding: 0 0.4rem;
    border-radius: 1rem;
    background: var(--hover);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  p {
    margin: 0;
    max-width: 68ch;
  }

  .items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.4rem 0 0;
    padding: 0;
    list-style: none;
  }

  .items a {
    display: inline-flex;
    align-items: center;
    min-height: 1.875rem;
    padding: 0 0.65rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
  }

  .items a:hover {
    border-color: color-mix(in oklch, var(--accent) 40%, var(--line));
    color: var(--accent);
  }

  .hint {
    margin: 1rem 0 0;
    font-size: 0.875rem;
  }
</style>
