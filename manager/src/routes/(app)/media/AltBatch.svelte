<script lang="ts">
import { untrack } from 'svelte';
import { facts } from '#lib/ai.svelte.ts';
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type { MediaFile } from '#lib/types.ts';

// Описания картинок пачкой: ИИ пишет их по одной для картинок этой страницы списка, человек правит и
// отмечает, что сохранить. Ничего не сохраняется без него.
let {
  open = $bindable(false),
  files,
  preview,
  onsaved,
}: {
  open: boolean;
  /** Картинки без описания на этой странице списка. */
  files: readonly MediaFile[];
  /** Адрес превью плитки. */
  preview: (file: MediaFile) => string;
  /** Сохранённые файлы — экран обновит их у себя. */
  onsaved: (saved: readonly MediaFile[]) => void;
} = $props();

type Status = 'waiting' | 'working' | 'ready' | 'failed';

type Item = {
  readonly file: MediaFile;
  alt: string;
  status: Status;
  error: string;
  keep: boolean;
};

let element: HTMLDialogElement;
let items = $state<Item[]>([]);
let stopped = $state<string | null>(null);
let saving = $state(false);
// Закрыли окно или открыли заново — начатое прежде не пишет в новый список.
let run = 0;

const target = (file: MediaFile) => ({
  kind: 'text',
  label: t('media.alt'),
  hint: t('media.altHint'),
  value: '',
  maxLength: 500,
  pattern: '',
  image: file.path,
  area: t('aiFacts.media'),
  facts: facts([
    t('aiFacts.file', { path: file.path }),
    file.width && t('aiFacts.size', { size: `${file.width}×${file.height}` }),
  ]),
});

// Предел запросов ИИ (120 в час) или ИИ недоступен — дальше идти незачем: остальные ждут следующего раза.
const _FATAL =
  /^assistant\.(busy|not_connected|no_key|no_model|unavailable|unreachable)$/;

// По одной картинке: так видно, как идёт, а сбой одной не губит остальные.
const next = (id: number, index: number): Promise<void> =>
  id !== run || index >= items.length
    ? Promise.resolve()
    : ((item) => (
        (item.status = 'working'),
        api
          .send<{ text: string }>('POST', '/assistant/generate', {
            target: target(item.file),
            request: t('media.altRequest'),
          })
          .then(
            (_) =>
              void (
                id === run &&
                ((item.alt = _.text.trim().replace(/^["«]|["»]$/g, '')),
                (item.status = 'ready'),
                (item.keep = item.alt !== ''))
              ),
            (error) =>
              void (
                id === run &&
                ((item.status = 'failed'),
                (item.error = describe(error)),
                _FATAL.test(String((error as { code?: string })?.code ?? '')) &&
                  ((stopped = item.error), (run += 1)))
              )
          )
          .then(() => next(id, index + 1))
      ))(items[index]!);

// Открыли — новый список и пачка с начала; сама пачка меняет список, поэтому идёт вне отслеживания эффекта.
const start = () => {
  items = files.map((file) => ({
    file,
    alt: '',
    status: 'waiting' as Status,
    error: '',
    keep: false,
  }));
  stopped = null;
  run += 1;
  void next(run, 0);
};

$effect(() => {
  void (open
    ? (untrack(start), element.open || element.showModal())
    : ((run += 1), element.open && element.close()));
});

const chosen = $derived(
  items.filter((_) => _.keep && _.status === 'ready' && _.alt.trim() !== '')
);
const done = $derived(
  items.filter((_) => _.status === 'ready' || _.status === 'failed').length
);

const save = () =>
  void (
    !saving &&
    chosen.length > 0 &&
    ((saving = true),
    chosen
      .reduce<Promise<MediaFile[]>>(
        (saved, item) =>
          saved.then((list) =>
            api
              .send<MediaFile>('PATCH', `/media/${item.file.path}`, {
                alt: item.alt.trim(),
              })
              .then((_) => [...list, _])
          ),
        Promise.resolve([])
      )
      .then(
        (saved) => (
          onsaved(saved),
          notify(t('media.altBatchSaved', { n: saved.length })),
          (open = false)
        ),
        (error) => notify(describe(error), 'error')
      )
      .finally(() => (saving = false)))
  );

const _STATUS: Readonly<Record<Status, string>> = {
  get waiting() {
    return t('media.altWaiting');
  },
  get working() {
    return t('media.altWorking');
  },
  ready: '',
  failed: '',
};
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), (open = false))} aria-labelledby="alt-batch-title">
  {#if open}
    <div class="body">
      <header>
        <h2 id="alt-batch-title">{t('media.altBatchTitle')}</h2>
        <p class="muted">{t('media.altBatchIntro')}</p>
        <p class="progress muted" aria-live="polite">{t('media.altProgress', { n: done, total: items.length })}</p>
        {#if stopped}<p class="stopped" role="alert">{t('media.altBatchStopped', { reason: stopped })}</p>{/if}
      </header>
      <ol class="items">
        {#each items as item (item.file.path)}
          <li data-status={item.status}>
            <img src={preview(item.file)} alt="" width={item.file.width} height={item.file.height} loading="lazy" />
            <div class="text">
              <span class="path">{item.file.path}</span>
              {#if item.status === 'ready'}
                <textarea rows="2" maxlength="500" aria-label={`${t('media.alt')}: ${item.file.path}`} bind:value={item.alt}></textarea>
              {:else if item.status === 'failed'}
                <p class="error">{item.error}</p>
              {:else}
                <p class="muted">{_STATUS[item.status]}</p>
              {/if}
            </div>
            <label class="keep">
              <input type="checkbox" bind:checked={item.keep} disabled={item.status !== 'ready'} />
              {t('media.altKeep')}
            </label>
          </li>
        {/each}
      </ol>
      <div class="actions">
        <button type="button" onclick={() => (open = false)}>{t('common.close')}</button>
        <button type="button" class="primary" aria-disabled={chosen.length === 0 || saving} onclick={save}>{@html icons.check}{t('media.altSaveChecked', { n: chosen.length })}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 48rem);
    max-height: min(100dvh - 2rem, 52rem);
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-big);
  }

  dialog::backdrop {
    background: oklch(15% 0.02 var(--hue) / 0.35);
  }

  .body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 1rem;
    max-height: inherit;
    padding: 1.5rem;
  }

  header {
    display: grid;
    gap: 0.4rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: 0;
  }

  .progress {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .stopped,
  .error {
    color: var(--danger);
    font-size: 0.8125rem;
  }

  .items {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0 0.25rem 0 0;
    overflow-y: auto;
    list-style: none;
  }

  .items li {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: start;
    padding: 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
  }

  .items li[data-status='working'] {
    border-color: var(--accent);
  }

  .items img {
    width: 5rem;
    height: 5rem;
    border-radius: var(--radius-s);
    background: var(--sunken);
    object-fit: cover;
  }

  .text {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .path {
    overflow: hidden;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  textarea {
    width: 100%;
    font-size: 0.875rem;
  }

  .keep {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    padding-top: 1.25rem;
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  @media (max-width: 36rem) {
    .items li {
      grid-template-columns: 3.5rem minmax(0, 1fr);
    }

    .items img {
      width: 3.5rem;
      height: 3.5rem;
    }

    .keep {
      grid-column: 2;
      padding-top: 0;
    }
  }
</style>
