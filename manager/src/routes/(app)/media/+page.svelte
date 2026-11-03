<script lang="ts">
import { tick } from 'svelte';
import { aiScope, facts } from '#lib/ai.svelte.ts';
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { pageRef, places } from '#lib/format.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { fileSize, folderOf, originals, previewUrl } from '#lib/media.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { MediaFile, PageRef } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import {
  confirmReplace,
  folderSlug,
  rememberUploadFolder,
  upload,
  uploadFolder,
} from '#lib/upload.ts';
import { resolve } from '$app/paths';
import { page as route } from '$app/state';

let files = $state<MediaFile[]>([]);
let folder = $state(uploadFolder());
let busy = $state(false);
let dragging = $state(false);
let progress = $state({ done: 0, total: 0 });
let query = $state('');
let shownFolder = $state('');
let fileInput = $state<HTMLInputElement>();

const load = () => api.get<MediaFile[]>('/media').then((_) => (files = _));

const loading = defineLoad(load);

$effect(() => void loading.retry());

const all = $derived(originals(files));
const folders = $derived([...new Set(all.map((_) => folderOf(_.path)))].sort());
const shown = $derived(
  all.filter(
    (_) =>
      (shownFolder === '' || folderOf(_.path) === shownFolder) &&
      _.path.toLowerCase().includes(query.trim().toLowerCase())
  )
);
const url = previewUrl;
const size = fileSize;

// Варианты размеров сервер делает следом за загрузкой: пока у новых картинок их нет, список
// перечитывается, но не больше десяти раз. Маленьким, SVG и GIF вариантов не положено.
const _RESIZABLE = /^image\/(jpeg|png|webp)$/;
let follow: ReturnType<typeof setTimeout> | undefined;

$effect(() => () => clearTimeout(follow));

const followVariants = (sent: readonly MediaFile[], left = 10): void =>
  void (
    left > 0 &&
    sent.some(
      (_) =>
        _RESIZABLE.test(_.contentType) &&
        (_.width ?? 0) > 480 &&
        family(_).length === 1
    ) &&
    (follow = setTimeout(
      () =>
        void load().then(
          () => followVariants(sent, left - 1),
          () => undefined
        ),
      1500
    ))
  );

const sendAll = (list: File[]) => (
  (busy = true),
  (progress = { done: 0, total: list.length }),
  list
    .reduce<Promise<MediaFile[]>>(
      (done, file) =>
        done.then((sent) =>
          upload(folder, file).then(
            (_) => (
              (progress = { ...progress, done: sent.length + 1 }), [...sent, _]
            )
          )
        ),
      Promise.resolve([])
    )
    .then(
      (sent) => (
        notify(`${t('media.uploaded')} ${sent.length}`),
        load().then(() => followVariants(sent))
      )
    )
    .then(undefined, (error) => (failed(error), load()))
    .finally(() => (busy = false))
);

const send = (list: FileList | null) =>
  ((chosen) =>
    chosen.length > 0 &&
    confirmReplace(folder, chosen, files)
      .then((confirmed) => (confirmed ? sendAll(chosen) : undefined))
      .then(undefined, failed))([...(list ?? [])]);

const drop = (event: DragEvent) => (
  event.preventDefault(),
  (dragging = false),
  send(event.dataTransfer?.files ?? null)
);

const copy = (file: MediaFile) =>
  navigator.clipboard
    .writeText(url(file))
    .then(() => notify(t('media.copied')), failed);

const family = (file: MediaFile): MediaFile[] =>
  files.filter(
    (_) =>
      _.path === file.path ||
      _.path.startsWith(`${file.path.slice(0, file.path.lastIndexOf('.'))}@`)
  );

// Карточка файла: щелчок по плитке открывает панель — превью, сведения, описание, где используется.
// Ссылка `?file=…` из диагностики открывает карточку файла сразу.
let selectedPath = $state<string | null>(route.url.searchParams.get('file'));
let usage = $state<{ pages: PageRef[]; site: boolean } | null>(null);

const selected = $derived(files.find((_) => _.path === selectedPath) ?? null);

const variantWidths = $derived(
  selected
    ? family(selected)
        .map((_) => /@(\d+)\.[a-z0-9]+$/.exec(_.path)?.[1])
        .filter((_): _ is string => _ !== undefined)
        .map(Number)
        .toSorted((a, b) => a - b)
    : []
);

$effect(() => {
  const path = selectedPath;
  usage = null;
  void (
    path &&
    api
      .get<{ pages: PageRef[]; site: boolean }>(`/media-usage/${path}`)
      .then((_) => void (selectedPath === path && (usage = _)))
      .then(undefined, failed)
  );
});

// Для описания картинки ИИ получает её имя, размеры и страницы, где она стоит; модель, которая видит, — и саму картинку.
$effect(() =>
  aiScope({
    area: t('aiFacts.media'),
    facts: facts([
      selected && t('aiFacts.file', { path: selected.path }),
      selected?.width &&
        t('aiFacts.size', { size: `${selected.width}×${selected.height}` }),
      usage &&
        usage.pages.length > 0 &&
        t('aiFacts.usedOn', {
          pages: usage.pages.map((_) => _.title).join(', '),
        }),
      selected && !session.aiVision && t('aiFacts.blindImage'),
    ]),
  })
);

const select = (file: MediaFile) =>
  void (selectedPath = selectedPath === file.path ? null : file.path);

// Панель закрылась — фокус на плитку файла, с которой её открыли.
const closeDetails = () => {
  const path = selectedPath;
  selectedPath = null;
  void tick().then(() =>
    document
      .querySelector<HTMLElement>(`[data-file="${CSS.escape(path ?? '')}"]`)
      ?.focus()
  );
};

const describeFile = (file: MediaFile, alt: string) =>
  alt.trim() === file.alt
    ? undefined
    : api
        .send<MediaFile>('PATCH', `/media/${file.path}`, { alt })
        .then(
          (next) => (
            (files = files.map((_) => (_.path === next.path ? next : _))),
            notify(t('media.altSaved'))
          )
        )
        .then(undefined, failed);

const detailsKey = (event: KeyboardEvent) =>
  void (
    event.key === 'Escape' &&
    selectedPath &&
    !document.querySelector('dialog[open]') &&
    (event.preventDefault(), closeDetails())
  );

// Где файл используется — в вопросе: удалить можно, но человек знает, где картинка пропадёт.
const remove = (file: MediaFile) =>
  api
    .get<{ pages: PageRef[]; site: boolean }>(`/media-usage/${file.path}`)
    .then((usage) =>
      ask({
        title: t('media.removeTitle'),
        body:
          usage.pages.length > 0 || usage.site
            ? `${t('media.usedOn')} ${places([
                ...(usage.site ? [t('media.usedBySite')] : []),
                ...usage.pages.map(pageRef),
              ])}. ${t('media.removeBody')}`
            : t('media.unused'),
        items: family(file).map((_) => _.path),
        confirm: t('media.remove'),
        tone: 'danger',
      })
    )
    .then((confirmed) =>
      confirmed
        ? family(file)
            .reduce<Promise<unknown>>(
              (done, _) =>
                done.then(() => api.send('DELETE', `/media/${_.path}`)),
              Promise.resolve()
            )
            .then(load)
            .then(
              () => (
                selectedPath === file.path && (selectedPath = null),
                notify(t('media.removed'))
              )
            )
        : undefined
    )
    .then(undefined, failed);
</script>

<svelte:window onkeydown={detailsKey} />
<svelte:head><title>{t('media.title')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="primary" aria-disabled={busy} onclick={() => busy || fileInput?.click()}>{@html icons.upload}{t('media.upload')}</button>
{/snippet}

<PageHeader title={t('media.title')} crumbs={[{ label: t('nav.media') }]} {actions} />
<!-- Файлы можно бросить в любое место раздела: полоса загрузки наверху — подсказка и цель для щелчка. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="page"
  ondragover={(e) => (e.preventDefault(), (dragging = true))}
  ondragleave={(e) => void (!e.currentTarget.contains(e.relatedTarget as Node | null) && (dragging = false))}
  ondrop={drop}
>
  <div class="upload-bar">
  <label class="drop" data-dragging={dragging || undefined}>
    {@html icons.upload}
    <span>{t('media.drop')}</span>
    <input
      bind:this={fileInput}
      class="sr-only"
      aria-label={t('media.upload')}
      aria-describedby="drop-hint"
      type="file"
      multiple disabled={busy} onchange={(e) => (send(e.currentTarget.files), (e.currentTarget.value = ''))} />
  </label>
    <label class="folder">
      {t('media.folder')}
      <input class="code" list="media-folders" bind:value={folder} onchange={() => ((folder = folderSlug(folder)), rememberUploadFolder(folder))} title={t('media.folderHint')} aria-describedby="folder-help" />
      <datalist id="media-folders">{#each folders as name (name)}<option value={name}></option>{/each}</datalist>
      <small id="folder-help" class="sr-only">{t('media.folderHint')}</small>
    </label>
  </div>
    <p id="drop-hint" class="muted drop-hint" aria-live="polite">{busy ? t('media.uploadingOf', { n: Math.min(progress.done + 1, progress.total), total: progress.total }) : `${t('media.into', { folder: folderSlug(folder) || '/' })} ${t('media.variants')}`}</p>

  <LoadState load={loading}>
  {#if all.length > 0}
    <div class="filters">
      <label class="search">
        <span class="sr-only">{t('picker.search')}</span>
        <input type="search" bind:value={query} placeholder={t('picker.search')} />
      </label>
      {#if folders.length > 1}
        <label class="show-folder">
          <span class="sr-only">{t('media.folder')}</span>
          <select bind:value={shownFolder}>
            <option value="">{t('picker.allFolders')}</option>
            {#each folders as name (name)}<option value={name}>{name || '/'}</option>{/each}
          </select>
        </label>
      {/if}
      <span class="muted count">{shown.length} / {all.length}</span>
    </div>
  {/if}

  <div class="library" data-open={selected ? '' : undefined}>
    <div class="files">
    {#if all.length === 0}
      <p class="muted">{t('media.empty')}</p>
    {:else if shown.length === 0}
      <p class="muted">{t('picker.nothing')}</p>
    {:else}
      <ul class="grid-files">
        {#each shown as file (file.path)}
          <li>
            <button type="button" class="tile" data-file={file.path} aria-pressed={selectedPath === file.path} aria-controls="file-details" onclick={() => select(file)}>
              <span class="thumb">
                {#if file.contentType.startsWith('image/')}
                  <img src={url(file)} alt="" loading="lazy" width={file.width} height={file.height} />
                {:else}
                  <span class="type">{@html icons.fileBlank}<span>{file.path.slice(file.path.lastIndexOf('.') + 1)}</span></span>
                {/if}
              </span>
              <span class="path">{file.path}</span>
              <span class="muted meta">
                {size(file.size)}{#if file.width}{' · '}{file.width}×{file.height}{/if}{#if file.contentType.startsWith('image/') && !file.alt}<span class="no-alt">{' · '}{t('media.noAlt')}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    </div>
    {#if selected}
      <!-- Карточка файла: что это, где стоит, как описан; удалить — отсюда же, зная последствия. -->
      <aside id="file-details" class="details" aria-labelledby="file-title">
        <header>
          <h2 id="file-title">{selected.path.slice(selected.path.lastIndexOf('/') + 1)}</h2>
          <button type="button" class="ghost icon" aria-label={t('media.closeDetails')} title={t('media.closeDetails')} onclick={closeDetails}>{@html icons.close}</button>
        </header>
        <div class="preview">
          {#if selected.contentType.startsWith('image/')}
            <img src={url(selected)} alt={selected.alt} width={selected.width} height={selected.height} />
          {:else}
            <span class="type">{@html icons.fileBlank}<span>{selected.path.slice(selected.path.lastIndexOf('.') + 1)}</span></span>
          {/if}
        </div>
        <dl class="facts">
          <dt>{t('media.folder')}</dt><dd class="code">{folderOf(selected.path) || '/'}</dd>
          <dt>{t('media.size')}</dt><dd>{size(selected.size)}</dd>
          {#if selected.width}<dt>{t('media.dimensions')}</dt><dd>{selected.width}×{selected.height} px</dd>{/if}
          <dt>{t('media.type')}</dt><dd>{selected.contentType.split(';')[0]}</dd>
          {#if variantWidths.length > 0}<dt>{t('media.variantsShort')}</dt><dd>{variantWidths.join(', ')} px, webp</dd>{/if}
        </dl>
        {#if selected.contentType.startsWith('image/')}
          {#key selected.path}
            <label>
              {t('media.alt')}
              <textarea rows="2" value={selected.alt} data-ai-image={selected.path} onchange={(e) => describeFile(selected!, e.currentTarget.value)}></textarea>
              <small>{t('media.altHint')}</small>
            </label>
          {/key}
        {/if}
        <section class="usage" aria-labelledby="usage-title">
          <h3 id="usage-title">{t('media.usage')}</h3>
          {#if usage === null}
            <p class="muted">{t('common.loading')}</p>
          {:else if usage.pages.length === 0 && !usage.site}
            <p class="muted">{t('media.unusedShort')}</p>
          {:else}
            <ul>
              {#if usage.site}<li><a href={resolve('/(app)/settings')}>{t('media.usedBySite')}</a></li>{/if}
              {#each usage.pages as ref (ref.id)}
                <li><a href={resolve('/(app)/pages/[id]', { id: String(ref.id) })}>{ref.title}</a>{#if ref.trashed}<span class="muted"> · {t('pages.trashed')}</span>{/if}</li>
              {/each}
            </ul>
          {/if}
        </section>
        <div class="details-actions">
          <button type="button" onclick={() => copy(selected!)}>{@html icons.copy}{t('media.copy')}</button>
          <a class="button" href={url(selected)} target="_blank" rel="noopener">{@html icons.external}{t('media.openFile')}</a>
          <button type="button" class="danger" onclick={() => remove(selected!)}>{@html icons.trash}{t('media.remove')}</button>
        </div>
      </aside>
    {/if}
  </div>
  </LoadState>
</div>

<style>
  .page {
    display: grid;
    gap: 1.25rem;
  }


  /* Загрузка — одной строкой: библиотека начинается сразу под ней, а не под половиной экрана. */
  .upload-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .drop {
    display: flex;
    flex: 1 1 20rem;
    gap: 0.6rem;
    align-items: center;
    justify-content: center;
    min-height: 3.25rem;
    padding: 0.5rem 1rem;
    border: 0.125rem dashed var(--field-line);
    border-radius: var(--radius-l);
    background: var(--surface);
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 400;
    text-align: center;
    cursor: pointer;
    transition:
      border-color 140ms var(--ease),
      background-color 140ms var(--ease);
  }

  .drop:hover {
    border-color: color-mix(in oklch, var(--accent) 55%, var(--field-line));
    color: var(--text);
  }

  .drop :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
  }

  .drop-hint {
    margin: -0.75rem 0 0;
    font-size: 0.8125rem;
  }

  .drop[data-dragging] {
    border-color: var(--accent);
    background: color-mix(in oklch, var(--accent) 6%, var(--surface));
  }

  .drop:focus-within {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  /* Вид кнопки — общий (.button в theme.css); вся зона — подпись к полю файла. */

  .folder {
    display: flex;
    flex: 0 1 18rem;
    gap: 0.5rem;
    align-items: center;
    white-space: nowrap;
  }

  .folder input {
    min-width: 0;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .search {
    flex: 1 1 14rem;
    max-width: 24rem;
  }

  .count {
    margin-left: auto;
    font-size: 0.8125rem;
  }

  .grid-files {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Плитка — кнопка: щелчок открывает карточку файла; выбранная — с рамкой акцента. */
  /* Колонка не шире плитки и текст переносится: от общих кнопок плитка унаследовала бы запрет
     переноса и центровку — длинная строка раздвинула бы колонку, и превью вылезло бы за рамку. */
  .tile {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    justify-content: stretch;
    gap: 0.35rem;
    justify-items: stretch;
    width: 100%;
    white-space: normal;
    min-height: 0;
    padding: 0.5rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: none;
    color: var(--text);
    font-weight: 400;
    text-align: left;
  }

  .tile:hover:not(:disabled) {
    border-color: var(--field-line);
    background: var(--surface);
  }

  /* Открытая в карточке — тонкая рамка акцента и мягкий ореол, а не толстая обводка. */
  .tile[aria-pressed='true'] {
    border-color: color-mix(in oklab, var(--accent) 60%, var(--line));
    box-shadow: 0 0 0 0.1875rem var(--accent-soft);
  }

  .no-alt {
    color: var(--warn);
  }

  /* Карточка файла — справа от плиток; на узкой холстине — над ними. */
  .library {
    container: library / inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  .library[data-open] {
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
  }

  .details {
    position: sticky;
    top: calc(var(--topbar, 0) + 4.5rem);
    display: grid;
    gap: 1rem;
    padding-left: 1.5rem;
    border-left: 0.0625rem solid var(--line);
  }

  @container library (width < 44rem) {
    .details {
      position: static;
      grid-row: 1;
      padding: 0 0 1.5rem;
      border-left: 0;
      border-bottom: 0.0625rem solid var(--line);
    }

    .files {
      grid-row: 2;
    }

    .library[data-open] > * {
      grid-column: 1 / -1;
    }
  }

  .details header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }

  .details h2 {
    min-width: 0;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 0.9375rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview {
    display: grid;
    place-items: center;
    max-height: 16rem;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .preview img {
    max-width: 100%;
    max-height: 16rem;
    object-fit: contain;
  }

  .facts {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.35rem 1rem;
    margin: 0;
    font-size: 0.8125rem;
  }

  .facts dt {
    color: var(--muted);
  }

  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .usage h3 {
    margin-bottom: 0.4rem;
    font-size: 0.875rem;
  }

  .usage ul {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    font-size: 0.875rem;
    list-style: none;
  }

  .usage p {
    margin: 0;
    font-size: 0.875rem;
  }

  .details-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .thumb {
    display: grid;
    aspect-ratio: 4 / 3;
    place-items: center;
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .type {
    display: grid;
    gap: 0.25rem;
    justify-items: center;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .type :global(svg) {
    width: 2rem;
    height: 2rem;
    stroke-width: 1.25;
  }

  p {
    margin: 0;
  }

  .path {
    overflow: hidden;
    font-family: var(--mono);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-size: 0.75rem;
    line-height: 1.4;
  }

</style>
