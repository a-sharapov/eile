<script lang="ts">
import { ITEM_LIMITS } from '#lib/analytics.ts';
import { api } from '#lib/api.ts';
import { ask, askValue } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type {
  IssuedSenderKey,
  SenderKeyView,
  SenderView,
  SetupView,
} from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { archive, type EditRequest, remove, usersOf } from './setup.ts';

let {
  setup,
  editable,
  onedit,
  onchanged,
  onissued,
}: {
  setup: SetupView;
  editable: boolean;
  onedit: (request: EditRequest) => void;
  onchanged: () => void;
  onissued: (key: IssuedSenderKey, sender: string) => void;
} = $props();

// Новый ключ выпускают до того, как отзывают старый: отправитель переходит на него без потерь.
const issue = (sender: SenderView) =>
  askValue({
    title: t('senders.issueTitle', { name: quoted(sender.name) }),
    body: t('senders.issueBody'),
    confirm: t('senders.issue'),
    input: {
      label: t('senders.keyLabel'),
      type: 'text',
      optional: true,
      hint: t('senders.keyLabelHint', { n: ITEM_LIMITS.keyLabel }),
      validate: (_) =>
        [..._.trim()].length > ITEM_LIMITS.keyLabel
          ? t('senders.keyLabelHint', { n: ITEM_LIMITS.keyLabel })
          : null,
    },
  }).then(
    (label): unknown =>
      label !== null &&
      api
        .send<IssuedSenderKey>(
          'POST',
          `/analytics/senders/${encodeURIComponent(sender.code)}/keys`,
          { label: label.trim() || null }
        )
        .then((_) => (onissued(_, sender.name), onchanged()))
        .then(undefined, failed)
  );

const revoke = (sender: SenderView, key: SenderKeyView) =>
  ask({
    title: t('senders.revokeTitle', { label: quoted(key.label) }),
    body: t(
      sender.keys.length === 1 ? 'senders.revokeLastBody' : 'senders.revokeBody'
    ),
    confirm: t('senders.revoke'),
    tone: 'danger',
  }).then(
    (yes): unknown =>
      yes &&
      api
        .send(
          'DELETE',
          `/analytics/senders/${encodeURIComponent(sender.code)}/keys/${key.id}`
        )
        .then(() => (notify(t('senders.revoked')), onchanged()))
        .then(undefined, failed)
  );

const toggle = (sender: SenderView) =>
  api
    .send('PUT', `/analytics/senders/${encodeURIComponent(sender.code)}`, {
      enabled: !sender.enabled,
    })
    .then(
      () => (
        notify(
          t(sender.enabled ? 'senders.disabled' : 'senders.enabled', {
            name: quoted(sender.name),
          })
        ),
        onchanged()
      )
    )
    .then(undefined, failed);

const done = (changed: boolean) => void (changed && onchanged());
</script>

<div class="list">
  <header class="intro">
    <p>{t('senders.intro')}</p>
    {#if editable}<button type="button" class="primary" onclick={() => onedit({ group: 'sender', item: null })}>{@html icons.plus}{t('senders.new')}</button>{/if}
  </header>

  {#if setup.senders.length === 0}
    <div class="frame empty">
      <p>{t('senders.empty')}</p>
    </div>
  {:else}
    <ul class="senders">
      {#each setup.senders as sender (sender.code)}
        <li class="frame" class:archived={sender.archivedAt !== null}>
          <div class="head">
            <div class="what">
              <h3>{sender.name} <code class="muted">{sender.code}</code></h3>
              <div class="marks">
                {#if sender.archivedAt !== null}<Mark>{t('setupList.inArchive')}</Mark>{:else if !sender.enabled}<Mark tone="warn">{t('senders.off')}</Mark>{:else}<Mark tone="ok">{t('senders.on')}</Mark>{/if}
                <span class="muted hour">{sender.summaryAt === null ? t('senders.noSummaryShort') : t('senders.summaryAtShort', { time: sender.summaryAt })}</span>
              </div>
              {#if sender.note}<p class="muted note">{sender.note}</p>{/if}
            </div>
            {#if editable}
              <div class="actions">
                <button type="button" class="ghost" onclick={() => onedit({ group: 'sender', item: sender })}>{@html icons.pencil}{t('setupList.edit')}</button>
                {#if sender.archivedAt === null}
                  <button type="button" class="ghost" onclick={() => toggle(sender)}>{t(sender.enabled ? 'senders.turnOff' : 'senders.turnOn')}</button>
                {/if}
                <button type="button" class="ghost" onclick={() => archive('sender', sender, sender.archivedAt === null).then(done)}>{@html icons.restore}{t(sender.archivedAt === null ? 'setupList.toArchive' : 'setupList.fromArchive')}</button>
                {#if usersOf(setup, 'sender', sender).length === 0}
                  <button type="button" class="ghost danger" onclick={() => remove(setup, 'sender', sender).then(done)}>{@html icons.trash}{t('setupList.remove')}</button>
                {/if}
              </div>
            {/if}
          </div>

          <div class="keys">
            <h4>{t('senders.keys')}</h4>
            {#if sender.keys.length === 0}
              <p class="muted">{t('senders.noKeys')}</p>
            {:else}
              <ul>
                {#each sender.keys as key (key.id)}
                  <li>
                    {@html icons.key}
                    <span class="key">
                      <strong>{key.label}</strong>
                      <small class="muted"><code>…{key.hint}</code> · {t('senders.issued', { when: moment(key.createdAt) })} · {key.usedAt ? t('senders.used', { when: ago(key.usedAt) }) : t('senders.unused')}</small>
                    </span>
                    {#if editable}<button type="button" class="ghost danger" onclick={() => revoke(sender, key)}>{t('senders.revoke')}<span class="sr-only">: {key.label}</span></button>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
            {#if editable && sender.archivedAt === null}
              <button type="button" class="add" aria-disabled={sender.keys.length >= ITEM_LIMITS.keysPerSender} title={sender.keys.length >= ITEM_LIMITS.keysPerSender ? t('senders.keysFull', { n: ITEM_LIMITS.keysPerSender }) : undefined} onclick={() => sender.keys.length < ITEM_LIMITS.keysPerSender && issue(sender)}>{@html icons.plus}{t('senders.issue')}</button>
              {#if sender.keys.length >= ITEM_LIMITS.keysPerSender}<small class="help">{t('senders.keysFull', { n: ITEM_LIMITS.keysPerSender })}</small>{/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .list {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: start;
    justify-content: space-between;
  }

  .intro p {
    flex: 1 1 24rem;
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .senders {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .senders > li {
    display: grid;
    gap: 0.85rem;
    padding: 1rem 1.15rem;
  }

  .archived .what h3 {
    color: var(--muted);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: start;
    justify-content: space-between;
  }

  .what {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  h3 {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  h3 code {
    margin-left: 0.25rem;
    font-weight: 400;
  }

  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.6rem;
    align-items: center;
  }

  .hour {
    font-size: 0.8125rem;
  }

  .note {
    margin: 0;
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .actions button,
  .keys button {
    min-height: 2.25rem;
    padding: 0 0.65rem;
    font-size: 0.8125rem;
  }

  .actions :global(svg),
  .keys button :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .keys {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    padding-top: 0.75rem;
    border-top: 0.0625rem solid var(--line);
  }

  h4 {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .keys > p {
    margin: 0;
    font-size: 0.875rem;
  }

  .keys ul {
    display: grid;
    gap: 0.35rem;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .keys li {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    min-width: 0;
  }

  .keys li > :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }

  .key {
    display: grid;
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
  }

  .key small {
    font-size: 0.8125rem;
  }

  .empty {
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
