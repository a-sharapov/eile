<script lang="ts">
import { elements, elementsLoad } from '#lib/elements.svelte.ts';
import { fields } from '#lib/fields.svelte.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { palette, recentPages } from '#lib/palette.svelte.ts';
import { plugins } from '#lib/plugins.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import { statusOf, trail, tree } from '#lib/tree.svelte.ts';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

type Entry = {
  readonly key: string;
  readonly group: MessageKey;
  readonly label: string;
  readonly hint: string;
  readonly icon: keyof typeof icons;
  readonly href: string;
  readonly status?: string;
  /** Где искать: название, алиас, id — строчными. */
  readonly text: string;
  readonly id?: number;
};

let element: HTMLDialogElement;
let input = $state<HTMLInputElement>();
let query = $state('');
let active = $state(0);

const admin = $derived(session.user?.role === 'admin');

$effect(() => {
  void (palette.open
    ? ((query = ''),
      (active = 0),
      element.open || element.showModal(),
      // Элементы грузит их панель; если её ещё не открывали — грузим здесь.
      admin &&
        !elementsLoad.state.ready &&
        !elementsLoad.state.error &&
        elementsLoad.retry())
    : element.open && element.close());
});

const close = () => void (palette.open = false);

const pageEntries = $derived(
  tree.nodes
    .filter((_) => !_.trashed)
    .map(
      (node): Entry => ({
        key: `page:${node.id}`,
        group: 'palette.pages',
        label: node.title,
        hint: [trail(node.id).join(' › '), `id ${node.id}`]
          .filter(Boolean)
          .join(' · '),
        icon: node.kind === 'link' ? 'link' : 'file',
        href: resolve('/(app)/pages/[id]', { id: String(node.id) }),
        status: statusOf(node),
        text: `${node.title} ${node.menuTitle} ${node.alias}`.toLowerCase(),
        id: node.id,
      })
    )
);

const elementEntries = $derived<Entry[]>(
  admin
    ? [
        ...elements.items.map((_) => ({
          key: `element:${_.kind}:${_.name}`,
          group: 'palette.elements' as const,
          label: _.name,
          hint: t(
            _.kind === 'template' ? 'elements.template' : 'elements.component'
          ),
          icon: (_.kind === 'template'
            ? 'template'
            : 'component') as keyof typeof icons,
          href: resolve('/(app)/elements/[kind]/[name]', {
            kind: _.kind,
            name: _.name,
          }),
          text: _.name.toLowerCase(),
        })),
        ...plugins.items.map((_) => ({
          key: `plugin:${_.name}`,
          group: 'palette.elements' as const,
          label: _.name,
          hint: t('plugins.one'),
          icon: 'plug' as const,
          href: resolve('/(app)/plugins/[name]', { name: _.name }),
          text: _.name.toLowerCase(),
        })),
        ...fields.items.map((_) => ({
          key: `field:${_.name}`,
          group: 'palette.elements' as const,
          label: _.name,
          hint: `${t('nav.fields')} · ${_.label}`,
          icon: 'fields' as const,
          href: `${resolve('/(app)/fields')}?name=${_.name}`,
          text: `${_.name} ${_.label}`.toLowerCase(),
        })),
      ]
    : []
);

// Разделы и действия — как ссылки: переход один и тот же, а действия — это открытие нужного экрана.
const _GO: readonly (Omit<Entry, 'text' | 'key' | 'label' | 'hint'> & {
  readonly label: MessageKey;
  readonly hint?: MessageKey;
  readonly adminOnly?: boolean;
})[] = [
  {
    group: 'palette.actions',
    label: 'pages.new',
    icon: 'filePlus',
    href: `${resolve('/(app)/pages/[id]', { id: 'new' })}`,
  },
  {
    group: 'palette.actions',
    label: 'pages.newLink',
    icon: 'link',
    href: `${resolve('/(app)/pages/[id]', { id: 'new' })}?kind=link`,
  },
  {
    group: 'palette.actions',
    label: 'media.upload',
    hint: 'nav.media',
    icon: 'upload',
    href: resolve('/(app)/media'),
  },
  {
    group: 'palette.sections',
    label: 'overview.title',
    icon: 'tree',
    href: resolve('/(app)/pages'),
  },
  {
    group: 'palette.sections',
    label: 'nav.elements',
    icon: 'code',
    href: resolve('/(app)/elements'),
    adminOnly: true,
  },
  {
    group: 'palette.sections',
    label: 'nav.media',
    icon: 'images',
    href: resolve('/(app)/media'),
  },
  {
    group: 'palette.sections',
    label: 'nav.users',
    icon: 'users',
    href: resolve('/(app)/users'),
    adminOnly: true,
  },
  {
    group: 'palette.sections',
    label: 'nav.settings',
    icon: 'settings',
    href: resolve('/(app)/settings'),
    adminOnly: true,
  },
  {
    group: 'palette.sections',
    label: 'backup.title',
    icon: 'database',
    href: resolve('/(app)/backups'),
    adminOnly: true,
  },
  {
    group: 'palette.sections',
    label: 'nav.help',
    icon: 'help',
    href: resolve('/(app)/help'),
  },
];

const goEntries = $derived<Entry[]>(
  _GO
    .filter((_) => admin || !_.adminOnly)
    .map((_) => ({
      ..._,
      key: `go:${_.label}`,
      label: t(_.label),
      hint: _.hint ? t(_.hint) : '',
      text: t(_.label).toLowerCase(),
    }))
);

// Выше — точный id, начало названия, начало слова; разделы и действия чуть важнее страниц.
const _score = (entry: Entry, needle: string): number =>
  ((label) =>
    (entry.id !== undefined && String(entry.id) === needle
      ? 100
      : label.startsWith(needle)
        ? 80
        : label.split(/[\s\-–—«»"'(),.:/]+/).some((_) => _.startsWith(needle))
          ? 60
          : 40) + (entry.group === 'palette.pages' ? 0 : 5))(
    entry.label.toLowerCase()
  );

const _LIMIT = 30;

const results = $derived.by((): Entry[] => {
  const needle = query.trim().toLowerCase();
  const words = needle.split(/\s+/).filter(Boolean);
  return needle === ''
    ? [
        ...recentPages()
          .map((id) => pageEntries.find((_) => _.id === id))
          .filter((_): _ is Entry => _ !== undefined)
          .map((_) => ({ ..._, group: 'palette.recent' as const })),
        ...goEntries,
      ]
    : [...goEntries, ...pageEntries, ...elementEntries]
        .filter(
          (entry) =>
            (entry.id !== undefined && String(entry.id) === needle) ||
            words.every((_) => entry.text.includes(_))
        )
        .map((entry) => ({ entry, score: _score(entry, needle) }))
        .toSorted((a, b) => b.score - a.score)
        .slice(0, _LIMIT)
        .map((_) => _.entry);
});

// Заголовок группы — перед первой строкой группы; в результатах поиска группы идут вперемешку.
const headed = $derived(
  results.map((entry, index) => ({
    entry,
    heading:
      query.trim() === '' && results[index - 1]?.group !== entry.group
        ? t(entry.group)
        : null,
  }))
);

// Новый запрос — выбор снова на первой строке.
$effect(() => {
  void query;
  active = 0;
});

const choose = (entry: Entry) => (close(), void goto(entry.href));

const _MOVE: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: 5,
  PageUp: -5,
};

const onKey = (event: KeyboardEvent) =>
  void (_MOVE[event.key] !== undefined
    ? (event.preventDefault(),
      (active = Math.min(
        Math.max(active + _MOVE[event.key]!, 0),
        results.length - 1
      )),
      element
        .querySelector(`#palette-option-${active}`)
        ?.scrollIntoView({ block: 'nearest' }))
    : event.key === 'Enter' &&
      results[active] &&
      (event.preventDefault(), choose(results[active]!)));
</script>

<dialog bind:this={element} class="palette" oncancel={(e) => (e.preventDefault(), close())} onclick={(e) => void (e.target === element && close())} aria-label={t('palette.title')}>
  {#if palette.open}
    <div class="search">
      {@html icons.search}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:this={input}
        bind:value={query}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-results"
        aria-activedescendant={results.length > 0 ? `palette-option-${active}` : undefined}
        aria-label={t('palette.title')}
        placeholder={t(admin ? 'palette.placeholder' : 'palette.placeholderEditor')}
        autocomplete="off"
        spellcheck="false"
        autofocus
        onkeydown={onKey}
      />
      <kbd>Esc</kbd>
    </div>
    <ul id="palette-results" role="listbox" aria-label={t('palette.results')}>
      {#each headed as item, index (item.entry.key)}
        {#if item.heading}<li class="heading" role="presentation">{item.heading}</li>{/if}
        <li
          id={`palette-option-${index}`}
          role="option"
          aria-selected={index === active}
          data-status={item.entry.status}
          onclick={() => choose(item.entry)}
          onmousemove={() => (active = index)}
          onkeydown={() => undefined}
        >
          {#if item.entry.status}
            <i class="status-node" aria-hidden="true"></i>
          {:else}
            <span class="glyph" aria-hidden="true">{@html icons[item.entry.icon]}</span>
          {/if}
          <span class="label">{item.entry.label}</span>
          {#if item.entry.hint}<span class="hint">{item.entry.hint}</span>{/if}
          {#if query.trim() !== ''}<span class="group">{t(item.entry.group)}</span>{/if}
        </li>
      {:else}
        <li class="nothing" role="presentation">{t('palette.nothing')}</li>
      {/each}
    </ul>
    <p class="keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> {t('palette.keyMove')}</span><span><kbd>Enter</kbd> {t('palette.keyOpen')}</span></p>
  {/if}
</dialog>

<style>
  /* Окно перехода — сверху по центру, как поиск: взгляд уже там, где шапка. */
  .palette {
    width: min(100% - 2rem, 40rem);
    max-height: min(32rem, 100dvh - 6rem);
    margin: 12dvh auto auto;
    padding: 0;
    overflow: hidden;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-big);
  }

  .palette[open] {
    display: flex;
    flex-direction: column;
    animation: palette-in 160ms var(--ease);
  }

  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateY(-0.5rem) scale(0.99);
    }
  }

  .palette::backdrop {
    background: color-mix(in oklch, var(--text) 22%, transparent);
  }

  .search {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0 1rem;
    border-bottom: 0.0625rem solid var(--line);
  }

  .search > :global(svg) {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--muted);
  }

  .search input {
    flex: 1;
    min-width: 0;
    min-height: 3.5rem;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    font-size: 1.0625rem;
    outline: none;
  }

  ul {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0.5rem;
    overflow-y: auto;
    list-style: none;
  }

  .heading {
    padding: 0.625rem 0.75rem 0.25rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  [role='option'] {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border-radius: var(--radius);
    cursor: pointer;
  }

  [role='option'][aria-selected='true'] {
    background: var(--accent-soft);
  }

  .glyph {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 1rem;
    color: var(--muted);
  }

  .glyph :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  [role='option'] .status-node {
    margin: 0 0.25rem;
  }

  .label {
    flex: none;
    max-width: 60%;
    overflow: hidden;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group {
    flex: none;
    margin-left: auto;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .nothing {
    padding: 1.5rem 0.75rem;
    color: var(--muted);
    text-align: center;
  }

  .keys {
    display: flex;
    gap: 1.25rem;
    margin: 0;
    padding: 0.625rem 1rem;
    border-top: 0.0625rem solid var(--line);
    color: var(--muted);
    font-size: 0.75rem;
  }

  .keys span {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .palette[open] {
      animation: none;
    }
  }

  @media (width < 48rem) {
    .palette {
      margin-top: 1rem;
    }

    .keys {
      display: none;
    }
  }
</style>
