<script lang="ts">
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { folderOf, isImage, originals, previewUrl } from '#lib/media.ts';
import { picker, settlePick } from '#lib/media-picker.svelte.ts';
import { failed } from '#lib/notices.svelte.ts';
import type { MediaFile } from '#lib/types.ts';
import { confirmReplace, upload, uploadFolder } from '#lib/upload.ts';
import LoadState from './LoadState.svelte';

let element: HTMLDialogElement;
let files = $state<MediaFile[] | null>(null);
let query = $state('');
let folder = $state('');
let chosen = $state<MediaFile | null>(null);
let alt = $state('');
let uploading = $state(false);

const current = $derived(picker.current);

$effect(() => {
  void (current
    ? ((query = ''),
      (chosen = null),
      (alt = ''),
      element.open || element.showModal(),
      loading.retry())
    : element.open && element.close());
});

const available = $derived(
  (files ?? []).filter((_) => !current?.images || isImage(_))
);
const folders = $derived(
  [...new Set(available.map((_) => folderOf(_.path)))].sort()
);
const shown = $derived(
  available.filter(
    (_) =>
      (folder === '' || folderOf(_.path) === folder) &&
      _.path.toLowerCase().includes(query.trim().toLowerCase())
  )
);

const name = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

// Выбор не прячется за поиском: скрытый файл нельзя «выбрать» вслепую.
$effect(
  () =>
    void (
      chosen &&
      !shown.some((_) => _.path === chosen!.path) &&
      (chosen = null)
    )
);

const load = () =>
  api.get<MediaFile[]>('/media').then((_) => (files = originals(_)));

const loading = defineLoad(load);

// Загрузка прямо отсюда: не уходить со страницы с несохранёнными правками ради одной картинки.
const sendAll = (list: File[]) => (
  (uploading = true),
  list
    .reduce<Promise<MediaFile | null>>(
      (done, file) =>
        done.then(() =>
          upload(folder || uploadFolder(), file).then((_) => _[0] ?? null)
        ),
      Promise.resolve(null)
    )
    .then((last) =>
      load().then(
        () =>
          void (
            last &&
            ((query = ''), (folder = folderOf(last.path)), (chosen = last))
          )
      )
    )
    .then(undefined, failed)
    .finally(() => (uploading = false))
);

const send = (list: FileList | null) =>
  ((chosen) =>
    chosen.length > 0 &&
    confirmReplace(folder || uploadFolder(), chosen, files ?? [])
      .then((confirmed) => (confirmed ? sendAll(chosen) : undefined))
      .then(undefined, failed))([...(list ?? [])]);

const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  chosen && settlePick({ file: chosen, alt: alt.trim() })
);

// Сверка с нужным размером: другие пропорции соцсети обрежут, малую картинку — растянут.
const fitNote = $derived(
  ((size, file) =>
    size && file?.width && file.height
      ? Math.abs(file.width / file.height - size.width / size.height) > 0.05
        ? t('picker.ratioOff', { size: `${size.width}×${size.height}` })
        : file.width < size.width
          ? t('picker.tooSmall', { size: `${size.width}×${size.height}` })
          : null
      : null)(picker.current?.size, chosen)
);

// Описание из медиатеки подставляется само; своё, уже набранное, не затирается.
const pickFile = (file: MediaFile) => (
  (alt = alt.trim() === '' || alt === chosen?.alt ? file.alt : alt),
  (chosen = file)
);
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), settlePick(null))} aria-labelledby="picker-title">
  {#if current}
    <form onsubmit={submit}>
      <h2 id="picker-title">{t(current.images ? 'picker.image' : 'picker.file')}</h2>
      <div class="filters">
        <label>
          {t('picker.search')}
          <!-- svelte-ignore a11y_autofocus -->
          <input type="search" bind:value={query} autofocus />
        </label>
        {#if folders.length > 1}
          <label>
            {t('media.folder')}
            <select bind:value={folder}>
              <option value="">{t('picker.allFolders')}</option>
              {#each folders as name (name)}<option value={name}>{name || '/'}</option>{/each}
            </select>
          </label>
        {/if}
      </div>
      <LoadState load={loading}>
      {#if shown.length === 0}
        <p class="muted">{t(available.length === 0 ? 'picker.empty' : 'picker.nothing')}</p>
      {:else}
        <ul aria-label={t('picker.files')}>
          {#each shown as file (file.path)}
            <li>
              <button
                type="button"
                aria-pressed={chosen?.path === file.path}
                onclick={() => pickFile(file)}
                onkeydown={(e) => void (e.key === 'Enter' && chosen?.path === file.path && (e.preventDefault(), settlePick({ file, alt: alt.trim() })))}
                ondblclick={() => settlePick({ file, alt: alt.trim() })}
              >
                {#if isImage(file)}
                  <img src={previewUrl(file)} alt="" loading="lazy" />
                {:else}
                  <span class="type">{file.contentType.split('/')[1]}</span>
                {/if}
                <span class="name">{name(file.path)}</span>
                {#if file.width && file.height}<span class="dims">{file.width}×{file.height}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      </LoadState>
      {#if fitNote}<p class="fit" role="status">{fitNote}</p>{/if}
      <label class="upload">
        <span class="button">{@html icons.upload}{t(uploading ? 'picker.uploading' : 'picker.upload')}</span>
        <input class="sr-only" type="file" multiple accept={current.images ? 'image/*' : undefined} disabled={uploading} aria-label={t('picker.upload')} aria-describedby="picker-upload-hint" onchange={(e) => send(e.currentTarget.files)} />
        <span id="picker-upload-hint" class="muted">{t('picker.uploadHint', { folder: folder || uploadFolder() })}</span>
      </label>
      {#if current.describe}
        <label>
          {t('picker.alt')}
          <input bind:value={alt} aria-describedby="alt-hint" />
          <small id="alt-hint" class="muted">{t('picker.altHint')}</small>
        </label>
      {/if}
      <div class="actions">
        <span class="muted path">{chosen?.path ?? ''}</span>
        <button type="button" onclick={() => settlePick(null)}>{t('common.cancel')}</button>
        <button class="primary" disabled={!chosen}>{t('picker.choose')}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 48rem);
    max-height: min(100dvh - 2rem, 44rem);
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-big);
  }

  dialog::backdrop {
    background: oklch(15% 0.02 var(--hue) / 0.35);
  }

  form {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto auto;
    gap: 1rem;
    max-height: inherit;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0.125rem;
    overflow-y: auto;
    list-style: none;
  }

  li button {
    display: grid;
    gap: 0.4rem;
    width: 100%;
    min-height: 0;
    padding: 0.4rem;
    border-radius: var(--radius-l);
    text-align: left;
  }

  /* Выбранная плитка и под мышью остаётся выбранной: общий hover кнопок перекрасил бы текст в белый. */
  li button[aria-pressed='true'],
  li button[aria-pressed='true']:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: 0 0 0 0.0625rem var(--accent);
    color: var(--text);
  }

  img,
  .type {
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: var(--radius);
    background: var(--sunken);
    object-fit: cover;
  }

  .type {
    display: grid;
    place-items: center;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.8125rem;
    text-transform: uppercase;
  }

  .name {
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dims {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
  }

  /* Картинка не того размера — предупреждение, не запрет: выбрать её всё равно можно. */
  .fit {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: color-mix(in oklch, var(--warn) 10%, var(--surface));
    color: var(--text);
    font-size: 0.8125rem;
  }

  .upload {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
  }

  .upload .button :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .upload:focus-within .button {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  .button {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    padding: 0 0.9rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font-size: 0.9375rem;
    cursor: pointer;
  }

  small {
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-end;
  }

  .path {
    margin-right: auto;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
  }
</style>
