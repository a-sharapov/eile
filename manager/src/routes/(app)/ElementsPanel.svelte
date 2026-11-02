<script lang="ts">
import { tick } from 'svelte';
import { api, CREATE_ONLY } from '#lib/api.ts';
import { elements, elementsLoad, loadElements } from '#lib/elements.svelte.ts';
import { fields } from '#lib/fields.svelte.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { loadPlugins, plugins } from '#lib/plugins.svelte.ts';
import { starters } from '#lib/starters.ts';
import type { ElementKind } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import NameForm from '#lib/ui/NameForm.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

// Дерево элементов как в MODX: шаблоны, компоненты (чанки и сниппеты Evo), скрипты для браузера, плагины, поля (TV).
type Group = 'template' | 'component' | 'script' | 'plugin' | 'field';

type Item = {
  readonly name: string;
  readonly href: string;
  readonly current: boolean;
  readonly note: string;
  readonly noteTitle?: string;
  readonly off?: boolean;
};

let creating = $state<Group | null>(null);

$effect(() => void elementsLoad.retry());

const elementItems = (kind: ElementKind): Item[] =>
  elements.items
    .filter((_) => _.kind === kind)
    .map((_) => ({
      name: _.name,
      href: resolve('/(app)/elements/[kind]/[name]', { kind, name: _.name }),
      current: page.params.kind === kind && page.params.name === _.name,
      note: '',
    }));

const groups = $derived<
  {
    readonly id: Group;
    readonly label: MessageKey;
    readonly create: MessageKey;
    readonly icon: keyof typeof icons;
    readonly items: Item[];
    /** Своё правило имени; без него — PascalCase. */
    readonly name?: { readonly pattern: string; readonly hint: MessageKey };
  }[]
>([
  {
    id: 'template',
    label: 'elements.templates',
    create: 'elements.newTemplate',
    icon: 'template',
    items: elementItems('template'),
  },
  {
    id: 'component',
    label: 'elements.components',
    create: 'elements.newComponent',
    icon: 'component',
    items: elementItems('component'),
  },
  {
    id: 'script',
    label: 'elements.scripts',
    create: 'elements.newScript',
    icon: 'fileCode',
    items: elementItems('script'),
    // Имя скрипта — часть его адреса: строчная латиница, цифры и дефис.
    name: { pattern: '[a-z0-9][a-z0-9\\-]*', hint: 'elements.scriptNameHint' },
  },
  {
    id: 'plugin',
    label: 'plugins.title',
    create: 'plugins.new',
    icon: 'plug',
    items: plugins.items.map((_) => ({
      name: _.name,
      href: resolve('/(app)/plugins/[name]', { name: _.name }),
      current:
        page.params.name === _.name && page.url.pathname.includes('/plugins/'),
      note: '',
      off: !_.enabled,
    })),
  },
  {
    id: 'field',
    label: 'fields.title',
    create: 'fields.new',
    icon: 'fields',
    items: fields.items.map((_) => ({
      name: _.name,
      href: `${resolve('/(app)/fields')}?name=${_.name}`,
      current:
        page.url.pathname.endsWith('/fields') &&
        page.url.searchParams.get('name') === _.name,
      note: _.label === _.name ? '' : _.label,
    })),
  },
]);

const createElement = (kind: ElementKind) => (name: string) =>
  api
    .send(
      'PUT',
      `/elements/${kind}/${name}`,
      { source: starters()[kind] },
      CREATE_ONLY
    )
    .then(loadElements)
    .then(() => goto(resolve('/(app)/elements/[kind]/[name]', { kind, name })));

const _CREATE: Readonly<
  Record<Exclude<Group, 'field'>, (name: string) => Promise<unknown>>
> = {
  template: createElement('template'),
  component: createElement('component'),
  script: createElement('script'),
  plugin: (name) =>
    api
      .send(
        'PUT',
        `/plugins/${name}`,
        { source: starters().plugin },
        CREATE_ONLY
      )
      .then(loadPlugins)
      .then(() => goto(resolve('/(app)/plugins/[name]', { name }))),
};

// Элемент с таким именем уже есть: предлагаем открыть его, а не затереть заготовкой.
const existing =
  (group: Group) =>
  (name: string): string | null =>
    groups.find((_) => _.id === group)?.items.find((_) => _.name === name)
      ?.href ?? null;

// Форма имени закрылась: фокус — обратно на «+» её группы, а не на body.
const closeForm = (group: Group) => (
  (creating = null),
  tick().then(() =>
    document.querySelector<HTMLElement>(`[data-create="${group}"]`)?.focus()
  )
);

const create = (group: Group) =>
  group === 'field'
    ? void goto(`${resolve('/(app)/fields')}?name=`)
    : void (creating = creating === group ? null : group);
</script>

<div class="elements-panel">
<LoadState load={elementsLoad} compact>
  {#each groups as group (group.id)}
    <details class="group" open>
      <summary>
        <span class="glyph" aria-hidden="true">{@html icons[group.icon]}</span>
        <span class="label">{t(group.label)}</span>
        <span class="count">{group.items.length}</span>
      </summary>
      <button type="button" class="add ghost icon" data-create={group.id} aria-label={t(group.create)} title={t(group.create)} aria-expanded={group.id === 'field' ? undefined : creating === group.id} onclick={() => create(group.id)}>{@html icons.plus}</button>
      {#if creating === group.id && group.id !== 'field'}
        <NameForm label={t(group.create)} existing={existing(group.id)} oncreate={(name) => _CREATE[group.id as Exclude<Group, 'field'>](name).then(() => (creating = null))} oncancel={() => closeForm(group.id)} pattern={group.name?.pattern} hint={group.name && t(group.name.hint)} />
      {/if}
      <ul>
        {#each group.items as item (item.name)}
          <li>
            <a href={item.href} aria-current={item.current ? 'page' : undefined} data-off={item.off || undefined}>
              <span class="name">{item.name}</span>
              {#if item.note}<span class="note" title={item.noteTitle}>{item.note}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </details>
  {/each}
</LoadState>
</div>

<style>
  .elements-panel {
    display: grid;
    align-content: start;
    gap: 0.35rem;
    height: 100%;
    margin: 0 -0.25rem;
    padding: 0 0.25rem 0.75rem;
    overflow-y: auto;
  }

  .group {
    position: relative;
  }

  summary {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    min-height: 2.25rem;
    padding: 0 2.5rem 0 0.65rem;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: var(--hover);
    color: var(--text);
  }

  .glyph {
    display: inline-flex;
    color: var(--muted);
  }

  .glyph :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .count {
    min-width: 1.25rem;
    padding: 0 0.35rem;
    border-radius: 1rem;
    background: var(--hover);
    color: var(--muted);
    font-size: 0.6875rem;
    font-weight: 600;
    text-align: center;
  }

  .add {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    width: 1.75rem;
    min-height: 1.75rem;
    border-radius: var(--radius-s);
  }

  .add :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* Элементы группы висят на линии ветки, как страницы в дереве сайта. */
  ul {
    margin: 0 0 0.5rem 1.15rem;
    padding: 0 0 0 0.45rem;
    border-left: 0.0625rem solid var(--line);
    list-style: none;
  }

  a {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    justify-content: space-between;
    min-height: 2rem;
    padding: 0.35rem 0.6rem;
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--mono);
    font-size: 0.8125rem;
    text-decoration: none;
  }

  a:hover {
    background: var(--hover);
  }

  a[aria-current='page'] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    font-weight: 600;
  }

  a[data-off] .name {
    color: var(--muted);
    text-decoration: line-through;
  }

  .note {
    overflow: hidden;
    color: var(--muted);
    font-family: var(--font);
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
