<script lang="ts">
import { api } from '#lib/api.ts';
import { isHtml, typeLabel } from '#lib/content-types.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';
import {
  menuMany,
  moveMany,
  publishMany,
  setPublished,
  templateMany,
  trashMany,
} from '#lib/page-actions.ts';
import { definePager, pageOf } from '#lib/pager.svelte.ts';
import { aliasFromTitle, followsTitle } from '#lib/translit.ts';
import {
  childrenOf,
  clearSelection,
  loadTree,
  markChanged,
  selection,
  setSelection,
  statusOf,
  toggleSelected,
  trail,
  tree,
} from '#lib/tree.svelte.ts';
import type { PageNode } from '#lib/types.ts';
import PageGlyph from '#lib/ui/PageGlyph.svelte';
import Pager from '#lib/ui/Pager.svelte';
import { resolve } from '$app/paths';

// Страницы таблицей в порядке дерева: главное правится прямо в строке, без захода в редактор.
let { dimmed }: { dimmed: (node: PageNode) => boolean } = $props();

let templates = $state<string[]>([]);

$effect(
  () =>
    void api.get<string[]>('/templates').then(
      (_) => (templates = _),
      () => undefined
    )
);

// Свёрнутые ветки таблицы — свои, не как в дереве слева: по умолчанию видна вся структура.
let folded = $state.raw<ReadonlySet<number>>(new Set());

const _rows = (
  parent: number | null,
  depth: number,
  closed: ReadonlySet<number>
): { node: PageNode; depth: number }[] =>
  childrenOf(parent).flatMap((node) => [
    { node, depth },
    ...(closed.has(node.id) ? [] : _rows(node.id, depth + 1, closed)),
  ]);

const rows = $derived(_rows(null, 0, folded));

// Тысячи строк с полями браузер рисует секундами — таблица идёт страницами (по умолчанию по 50).
const pager = definePager('pages');
const visible = $derived(pageOf(rows, pager));
// Страница начинается внутри ветки — над первой строкой путь к ней: видно, чей это раздел.
const inside = $derived(
  visible[0] && visible[0].depth > 0 ? trail(visible[0].node.id) : []
);

// Выбор — тот же, что в дереве слева: отмеченное в таблице видно там, и наоборот.
const chosen = $derived(
  tree.nodes.filter((_) => selection.ids.has(_.id) && !_.trashed)
);
const onPage = $derived(visible.map((_) => _.node.id));
const allPicked = $derived(
  onPage.length > 0 && onPage.every((_) => selection.ids.has(_))
);
const somePicked = $derived(
  !allPicked && onPage.some((_) => selection.ids.has(_))
);

const pickPage = (on: boolean) =>
  setSelection(
    on
      ? [...selection.ids, ...onPage]
      : [...selection.ids].filter((_) => !onPage.includes(_))
  );

let frame = $state<HTMLElement>();

// Сменили страницу внизу длинной таблицы — её начало снова в кадре.
const toTop = () =>
  void (
    frame &&
    frame.getBoundingClientRect().top < 0 &&
    frame.scrollIntoView({ block: 'start' })
  );

const fold = (id: number) =>
  void (folded = folded.has(id)
    ? new Set([...folded].filter((_) => _ !== id))
    : new Set([...folded, id]));

// Строка, которую только что сохранили, коротко подсвечивается.
let saved = $state<number | null>(null);
let savedTimer: ReturnType<typeof setTimeout> | undefined;

const flash = (id: number) => {
  clearTimeout(savedTimer);
  saved = id;
  savedTimer = setTimeout(() => (saved = null), 1200);
};

type Editable = 'title' | 'alias' | 'menuTitle' | 'template' | 'hiddenFromMenu';

// Новый заголовок ведёт за собой адрес, если тот собран из прежнего заголовка — как в редакторе.
const _changes = (node: PageNode, field: Editable, value: string | boolean) =>
  field === 'title' &&
  typeof value === 'string' &&
  followsTitle(node.alias, node.title, node.language)
    ? { title: value, alias: aliasFromTitle(value, node.language) }
    : { [field]: value };

// Правка поля — PATCH страницы; не вышло — поле возвращается к сохранённому значению.
const save = (
  node: PageNode,
  field: Editable,
  value: string | boolean,
  revert: () => void
): Promise<void> =>
  value === node[field]
    ? Promise.resolve()
    : api
        .send('PATCH', `/pages/${node.id}`, _changes(node, field, value))
        .then(() => loadTree())
        .then(() => (markChanged(node.id), flash(node.id)))
        .then(undefined, (error) => (revert(), failed(error)));

const onText =
  (node: PageNode, field: 'title' | 'alias' | 'menuTitle') => (event: Event) =>
    ((input) =>
      void save(
        node,
        field,
        input.value.trim(),
        () => (input.value = node[field])
      ))(event.currentTarget as HTMLInputElement);

// Как в таблице: Enter сохраняет и ведёт к той же колонке строкой ниже (Shift — выше), Esc — отмена.
const onKey =
  (node: PageNode, field: 'title' | 'alias' | 'menuTitle') =>
  (event: KeyboardEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    const row = input.closest('tr');
    const next = (
      event.shiftKey ? row?.previousElementSibling : row?.nextElementSibling
    )?.querySelector<HTMLInputElement>(`[data-col="${field}"]`);
    void (event.key === 'Enter'
      ? (event.preventDefault(), next ? next.focus() : input.blur())
      : event.key === 'Escape' &&
        (event.preventDefault(), (input.value = node[field]), input.blur()));
  };

// Публикация — как из меню дерева (с вопросом про расписание); отказ возвращает галочку.
const onPublish = (node: PageNode) => (event: Event) =>
  ((box) =>
    void setPublished(node, box.checked).then(() =>
      ((now) => (
        (box.checked = now), now !== node.published && flash(node.id)
      ))(tree.nodes.find((_) => _.id === node.id)?.published ?? false)
    ))(event.currentTarget as HTMLInputElement);

const href = (node: PageNode) =>
  resolve('/(app)/pages/[id]', { id: String(node.id) });

const _STATUS = {
  published: 'pages.published',
  draft: 'pages.draft',
  scheduled: 'pages.scheduled',
  trashed: 'pages.trashed',
} as const;
</script>

{#if chosen.length > 0}
  <!-- Выбрано несколько страниц: действия с ними разом, у каждого — «Вернуть». -->
  <div class="bulk" role="toolbar" aria-label={t('bulk.title')}>
    <span class="chosen"><span aria-live="polite">{t('bulk.selected')} <strong>{chosen.length}</strong></span><button type="button" class="ghost icon clear" aria-label={t('bulk.clear')} title={t('bulk.clear')} onclick={clearSelection}>{@html icons.close}</button></span>
    <button type="button" onclick={() => publishMany(chosen, true)}>{@html icons.eye}{t('bulk.publishShort')}</button>
    <button type="button" onclick={() => publishMany(chosen, false)}>{@html icons.eyeOff}{t('bulk.unpublishShort')}</button>
    <button type="button" onclick={() => templateMany(chosen, templates)}>{@html icons.palette}{t('bulk.templateShort')}</button>
    <button type="button" onclick={() => menuMany(chosen, true)}>{@html icons.menu}{t('bulk.showInMenu')}</button>
    <button type="button" onclick={() => menuMany(chosen, false)}>{t('bulk.hideFromMenu')}</button>
    <button type="button" onclick={() => moveMany(chosen)}>{@html icons.folderInput}{t('bulk.moveShort')}</button>
    <button type="button" class="danger" onclick={() => trashMany(chosen)}>{@html icons.trash}{t('bulk.trashShort')}</button>
  </div>
{/if}
<div class="table-frame" bind:this={frame}>
  <table>
    <caption class="sr-only">{t('table.caption')}</caption>
    <thead>
      <tr>
        <th scope="col" class="pick-col"><input type="checkbox" checked={allPicked} indeterminate={somePicked} aria-label={t('table.selectAll')} onchange={(e) => pickPage(e.currentTarget.checked)} /></th>
        <th scope="col" class="page-col">{t('page.title')}</th>
        <th scope="col">{t('page.address')}</th>
        <th scope="col">{t('page.menuTitle')}</th>
        <th scope="col">{t('table.template')}</th>
        <th scope="col" class="check-col">{t('table.inMenu')}</th>
        <th scope="col" class="check-col">{t('pages.published')}</th>
        <th scope="col" class="id-col">id</th>
      </tr>
    </thead>
    <tbody>
      {#if inside.length > 0}
        <tr class="inside">
          <td colspan="8"><span class="sr-only">{t('table.inside')}: </span>{@html icons.folder}{inside.join(' › ')}</td>
        </tr>
      {/if}
      {#each visible as { node, depth } (node.id)}
        {@const file = node.kind === 'page' && !isHtml(node.contentType)}
        {@const branch = childrenOf(node.id).length > 0}
        <tr data-status={statusOf(node)} data-dim={dimmed(node) || undefined} data-saved={saved === node.id || undefined} data-picked={selection.ids.has(node.id) || undefined}>
          <td class="pick-col"><input type="checkbox" checked={selection.ids.has(node.id)} aria-label={t('table.selectPage', { title: node.title })} onchange={() => toggleSelected(node.id)} /></td>
          <td class="page-col">
            <div class="page-cell" style:--depth={depth}>
              {#if branch}
                <button type="button" class="fold" aria-expanded={!folded.has(node.id)} aria-label={`${t(folded.has(node.id) ? 'pages.expand' : 'pages.collapse')}: ${node.title}`} title={t(folded.has(node.id) ? 'pages.expand' : 'pages.collapse')} onclick={() => fold(node.id)}>{@html icons.chevron}</button>
              {:else}
                <span class="fold" aria-hidden="true"></span>
              {/if}
              <PageGlyph kind={node.kind} contentType={node.contentType} status={statusOf(node)} title={file ? `${typeLabel(node.contentType)} · ${t(_STATUS[statusOf(node)])}` : t(_STATUS[statusOf(node)])} />
              <input class="cell" data-col="title" value={node.title} required maxlength="255" aria-label={`${t('page.title')}: ${node.title}`} onchange={onText(node, 'title')} onkeydown={onKey(node, 'title')} />
            </div>
          </td>
          <td>
            <input class="cell code" data-col="alias" data-ai="off" value={node.alias} spellcheck="false" aria-label={`${t('page.address')}: ${node.title}`} onchange={onText(node, 'alias')} onkeydown={onKey(node, 'alias')} />
          </td>
          <td>
            {#if file}
              <span class="none" aria-label={t('table.notInMenu')}>—</span>
            {:else}
              <input class="cell" data-col="menuTitle" value={node.menuTitle} placeholder={node.title} maxlength="255" aria-label={`${t('page.menuTitle')}: ${node.title}`} onchange={onText(node, 'menuTitle')} onkeydown={onKey(node, 'menuTitle')} />
            {/if}
          </td>
          <td>
            {#if node.kind === 'link'}
              <span class="muted">{t('page.kindLink')}</span>
            {:else if file}
              <span class="muted">{typeLabel(node.contentType)}</span>
            {:else}
              <select class="cell" value={node.template} aria-label={`${t('page.template')}: ${node.title}`} onchange={(e) => ((select) => void save(node, 'template', select.value, () => (select.value = node.template)))(e.currentTarget)}>
                {#each templates.includes(node.template) ? templates : [node.template, ...templates] as name (name)}<option value={name}>{name}</option>{/each}
              </select>
            {/if}
          </td>
          <td class="check-col">
            {#if file}
              <span class="none" aria-label={t('table.notInMenu')}>—</span>
            {:else}
              <input type="checkbox" checked={!node.hiddenFromMenu} aria-label={`${t('table.inMenu')}: ${node.title}`} onchange={(e) => ((box) => void save(node, 'hiddenFromMenu', !box.checked, () => (box.checked = !node.hiddenFromMenu)))(e.currentTarget)} />
            {/if}
          </td>
          <td class="check-col">
            <input type="checkbox" checked={node.published} aria-label={`${t('pages.published')}: ${node.title}`} onchange={onPublish(node)} />
          </td>
          <td class="id-col">
            <a class="open" href={href(node)} aria-label={`${t('table.open')}: ${node.title}`} title={t('table.open')}><span>{node.id}</span>{@html icons.chevron}</a>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<Pager {pager} total={rows.length} onpage={toTop} />

<style>
  /* Широкая таблица на узкой холстине прокручивается сама, страница — нет. */
  .table-frame {
    overflow-x: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  table {
    min-width: 56rem;
    border-collapse: collapse;
    background: transparent;
  }

  th {
    padding: 0.6rem 0.5rem;
    border-bottom: 0.0625rem solid var(--line);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
  }

  th:first-child {
    padding-left: 1rem;
  }

  /* Отметка строки — узкой первой колонкой; отмеченная строка подсвечена, как выбранная в дереве. */
  .pick-col {
    width: 2.5rem;
    padding-right: 0;
    text-align: center;
  }

  td.pick-col {
    padding-left: 0.75rem;
  }

  tr[data-picked] {
    background: color-mix(in oklch, var(--accent) 8%, transparent);
  }

  .bulk {
    position: sticky;
    top: calc(var(--topbar, 0) + 4.5rem);
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid color-mix(in oklch, var(--accent) 35%, var(--line));
    border-radius: var(--radius-l);
    background: color-mix(in oklch, var(--accent) 6%, var(--surface));
    box-shadow: var(--shadow-s);
  }

  /* Сколько выбрано и «снять выбор» — одним чипом в начале: кнопки действий идут за ним. */
  .bulk .chosen {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    margin-right: 0.5rem;
    font-size: 0.875rem;
  }

  .bulk button {
    gap: 0.35em;
    min-height: 2rem;
    padding: 0 0.55rem;
    font-size: 0.8125rem;
  }

  .bulk button :global(svg) {
    width: 0.95rem;
    height: 0.95rem;
  }

  .bulk .clear {
    min-width: 1.75rem;
    min-height: 1.75rem;
    padding: 0;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 0.0625rem solid var(--line);
    vertical-align: middle;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  /* Путь к ветке над первой строкой страницы — тихой строкой, не страницей. */
  tr.inside td {
    padding: 0.45rem 1rem;
    color: var(--muted);
    font-size: 0.75rem;
    background: color-mix(in oklch, var(--hover) 60%, transparent);
  }

  tr.inside :global(svg) {
    width: 0.8rem;
    height: 0.8rem;
    margin-right: 0.35rem;
    vertical-align: -0.1em;
  }

  tbody tr.inside:hover {
    background: none;
  }

  /* Таблица под шапкой экрана: начало видно после перехода на страницу. */
  .table-frame {
    scroll-margin-top: calc(var(--topbar, 0) + 4.5rem);
  }

  tbody tr:hover {
    background: var(--hover);
  }

  /* Сохранено — строка коротко теплеет зелёным и остывает. */
  tr[data-saved] {
    animation: row-saved 1200ms var(--ease);
  }

  @keyframes row-saved {
    from {
      background: var(--ok-soft);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    tr[data-saved] {
      animation: none;
    }
  }

  tr[data-dim] {
    opacity: 0.35;
  }

  .page-col {
    width: 34%;
  }

  /* Вложенность — отступом на уровень, как в дереве слева. */
  .page-cell {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding-left: calc(0.5rem + var(--depth) * 1.25rem);
  }

  .fold {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 1.25rem;
    min-height: 1.25rem;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--muted);
  }

  .fold:hover:not(:disabled) {
    border: 0;
    background: var(--hover);
    color: var(--text);
    box-shadow: none;
  }

  .fold :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
    transform: rotate(90deg);
    transition: transform 160ms var(--ease);
  }

  .fold[aria-expanded='false'] :global(svg) {
    transform: none;
  }

  /* Поля в ячейках тихие: рамка проступает под мышью и в фокусе — таблица читается как таблица. */
  .cell {
    width: 100%;
    min-width: 6rem;
    min-height: 2rem;
    padding: 0 0.5rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    font-size: 0.875rem;
    /* Длинный адрес или заголовок в ячейке — с многоточием, а не жёстким срезом; в фокусе поле прокручивается. */
    text-overflow: ellipsis;
  }

  .cell:hover {
    border-color: var(--field-line);
    background: var(--surface);
  }

  .cell:focus {
    border-color: var(--accent);
    background: var(--surface);
    box-shadow: 0 0 0 0.125rem
      color-mix(in oklch, var(--accent) 30%, transparent);
  }

  /* Палочка ИИ — по центру поля в невысокой строке, тексту поля — место под неё. */
  .table-frame :global(td > .ai-wand) {
    top: 50%;
    right: 0.6rem;
    translate: 0 -50%;
  }

  :global(td:has(> .ai-wand)) .cell {
    padding-right: 2.25rem;
  }

  .cell.code {
    font-family: var(--mono);
    font-size: 0.8125rem;
  }

  input.cell[data-col='title'] {
    font-weight: 500;
  }

  [data-status='draft'] input.cell[data-col='title'] {
    color: var(--muted);
    font-style: italic;
  }

  [data-status='scheduled'] input.cell[data-col='title'] {
    color: var(--warn);
    font-style: italic;
  }

  select.cell {
    padding-right: 1.75rem;
  }

  .check-col {
    width: 6rem;
    text-align: center;
  }

  .muted,
  .none {
    padding: 0 0.5rem;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .id-col {
    width: 4.5rem;
    text-align: right;
  }

  th.id-col {
    padding-right: 1rem;
  }

  .open {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    min-height: 2rem;
    padding: 0 0.5rem;
    border-radius: var(--radius-s);
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.75rem;
    text-decoration: none;
  }

  .open:hover {
    background: color-mix(in oklch, var(--text) 9%, var(--canvas));
    color: var(--text);
  }

  .open :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
  }
</style>
