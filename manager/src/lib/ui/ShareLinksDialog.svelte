<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type { ShareLink } from '#lib/types.ts';

let {
  open = $bindable(false),
  page,
  changeSet = null,
  title,
  days = 7,
}: {
  open: boolean;
  /** Страница ссылки: черновик или страница из набора правок. */
  page: number;
  /** Набор правок: ссылка покажет страницу с ними; null — черновик как есть. */
  changeSet?: number | null;
  title: string;
  /** Срок по умолчанию — из настроек проверки. */
  days?: number;
} = $props();

let element: HTMLDialogElement;
let links = $state<ShareLink[] | null>(null);
let label = $state('');
let lifetime = $state(7);
let issued = $state<string | null>(null);
let busy = $state(false);

const failed = (error: unknown) => notify(describe(error), 'error');

const query = $derived(
  `/review/links?page=${page}&set=${changeSet === null ? '' : changeSet}`
);

const load = () =>
  api.get<ShareLink[]>(query).then((_) => void (links = _), failed);

$effect(() => {
  void (open
    ? ((label = ''),
      (issued = null),
      (links = null),
      (lifetime = days),
      load(),
      element.open || element.showModal())
    : element.open && element.close());
});

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('shareLinks.copied')), failed);

const create = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    ((busy = true),
    api
      .send<ShareLink & { url: string }>('POST', '/review/links', {
        page,
        changeSet,
        label,
        days: lifetime,
      })
      .then((_) => ((issued = _.url), (label = ''), load()))
      .then(undefined, failed)
      .finally(() => (busy = false)))
);

const revoke = (link: ShareLink) =>
  ask({
    title: t('shareLinks.revokeTitle'),
    body: t('shareLinks.revokeBody'),
    confirm: t('shareLinks.revoke'),
    tone: 'danger',
  }).then(
    (yes): unknown =>
      yes &&
      api
        .send('DELETE', `/review/links/${link.id}`)
        .then(() => (notify(t('shareLinks.revoked')), load()))
        .then(undefined, failed)
  );
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), (open = false))} aria-labelledby="share-title">
  {#if open}
    <div class="body">
      <div>
        <h2 id="share-title">{t('shareLinks.title')}</h2>
        <p class="muted subject">{quoted(title)}</p>
      </div>
      <p class="muted">{t(changeSet === null ? 'shareLinks.body' : 'shareLinks.bodySet')}</p>

      {#if issued}
        <section class="issued" aria-labelledby="share-issued">
          <p id="share-issued"><strong>{t('shareLinks.issued')}</strong></p>
          <div class="secret">
            <code>{issued}</code>
            <button type="button" class="icon" aria-label={t('shareLinks.copy')} title={t('shareLinks.copy')} onclick={() => copy(issued!)}>{@html icons.copy}</button>
          </div>
        </section>
      {/if}

      <form onsubmit={create}>
        <label class="grow">
          <span>{t('shareLinks.label')}</span>
          <input maxlength="120" placeholder={t('shareLinks.labelPlaceholder')} bind:value={label} />
        </label>
        <label class="days">
          <span>{t('shareLinks.days')}</span>
          <input type="number" min="1" max="90" required bind:value={lifetime} />
        </label>
        <button class="primary" aria-disabled={busy}>{@html icons.link}{t('shareLinks.create')}</button>
      </form>

      {#if links === null}
        <p class="muted">{t('common.loading')}</p>
      {:else if links.length === 0}
        <p class="muted">{t('shareLinks.empty')}</p>
      {:else}
        <ul class="list">
          {#each links as link (link.id)}
            <li class:expired={!link.live}>
              <span class="what">
                <strong>{link.label || t('shareLinks.unnamed')}</strong>
                <small class="muted">
                  {link.live ? t('shareLinks.expires', { when: moment(link.expiresAt) }) : t('shareLinks.expired', { when: ago(link.expiresAt) })} · {tn('shareLinks.uses', link.uses)}{link.createdBy ? ` · ${link.createdBy.name}` : ''}
                </small>
              </span>
              <button type="button" class="ghost icon" aria-label={`${t('shareLinks.revoke')}: ${link.label || t('shareLinks.unnamed')}`} title={t('shareLinks.revoke')} onclick={() => revoke(link)}>{@html icons.trash}</button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="actions">
        <button type="button" onclick={() => (open = false)}>{t('common.close')}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 36rem);
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
    gap: 1.25rem;
    padding: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: 0;
  }

  .subject {
    margin-top: 0.25rem;
    overflow-wrap: anywhere;
  }

  .issued {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .secret {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .secret code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    user-select: all;
  }

  form {
    display: flex;
    gap: 0.5rem;
    align-items: end;
  }

  form label {
    display: grid;
    gap: 0.25rem;
  }

  .grow {
    flex: 1;
  }

  .days input {
    width: 5rem;
  }

  .list {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-top: 0.0625rem solid var(--line);
  }

  .list li.expired strong {
    color: var(--muted);
  }

  .what {
    display: grid;
    min-width: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 30rem) {
    form {
      flex-direction: column;
      align-items: stretch;
    }

    .days input {
      width: 100%;
    }
  }
</style>
