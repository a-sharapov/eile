<script lang="ts">
import { curlExample } from '#lib/analytics.ts';
import { intakeUrl } from '#lib/analytics-urls.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import type { IssuedSenderKey } from '#lib/types.ts';
import { resolve } from '$app/paths';
import Modal from '../Modal.svelte';

// Ключ отправителя показывается один раз: в этом окне. Закрыли — в интерфейсе остаются подпись и последние
// четыре знака; потеряли ключ — выпускают новый, старый отзывают.
let {
  issued,
  sender,
  enabled,
  onclose,
}: {
  issued: IssuedSenderKey | null;
  /** Название отправителя для заголовка. */
  sender: string;
  /** Включён ли приём: выключен — пример получит 503. */
  enabled: boolean;
  onclose: () => void;
} = $props();

const url = $derived(intakeUrl(session.site.url));
// Время примера — момент выпуска: событие с ним сервер примет, а не отложит как «из будущего».
const example = $derived(
  issued ? curlExample(url, issued.key, new Date(issued.createdAt)) : ''
);

const copy = (text: string, done: string) =>
  navigator.clipboard.writeText(text).then(() => notify(done), failed);
</script>

<Modal open={issued !== null} wide title={t('senderKey.title', { name: quoted(sender) })} {onclose}>
  {#if issued}
    <p class="once" role="note">{@html icons.alert}<span>{t('senderKey.once')}</span></p>
    <div class="secret">
      <span class="label" id="sender-key-label">{t('senderKey.key')}</span>
      <div class="row">
        <code>{issued.key}</code>
        <button type="button" class="primary" onclick={() => copy(issued!.key, t('senderKey.copied'))}>{@html icons.copy}{t('common.copy')}</button>
      </div>
      <small class="muted">{t('senderKey.label', { label: issued.label, hint: issued.hint })}</small>
    </div>
    <div class="secret">
      <span class="label" id="sender-key-url">{t('senderKey.url')}</span>
      <div class="row">
        <code>{url}</code>
        <button type="button" class="ghost icon" aria-label={t('senderKey.copyUrl')} title={t('senderKey.copyUrl')} onclick={() => copy(url, t('common.copied'))}>{@html icons.copy}</button>
      </div>
    </div>
    <div class="secret">
      <span class="label" id="sender-key-curl">{t('senderKey.example')}</span>
      <!-- Прокручиваемый блок — в порядке Tab: его читают и листают с клавиатуры. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre aria-labelledby="sender-key-curl" tabindex="0">{example}</pre>
      <div class="row end">
        <small class="muted">{t('senderKey.exampleHint')}</small>
        <button type="button" class="ghost" onclick={() => copy(example, t('common.copied'))}>{@html icons.copy}{t('senderKey.copyExample')}</button>
      </div>
      {#if !enabled}<p class="help">{t('senderKey.off')}</p>{/if}
      <p class="guide"><a href={`${resolve('/(app)/help')}#analytics-sender`}>{t('senderKey.guide')}</a></p>
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" onclick={onclose}>{t('senderKey.done')}</button>
  {/snippet}
</Modal>

<style>
  .once {
    display: flex;
    gap: 0.5rem;
    align-items: start;
    margin: 0;
    padding: 0.7rem 0.9rem;
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    font-size: 0.875rem;
  }

  .once :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-top: 0.15rem;
    color: var(--warn-text);
  }

  .secret {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 550;
  }

  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .row.end {
    flex-wrap: wrap;
    justify-content: space-between;
  }

  code,
  pre {
    min-width: 0;
    margin: 0;
    padding: 0.55rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    overflow-wrap: anywhere;
  }

  code {
    flex: 1;
    user-select: all;
  }

  pre {
    overflow-x: auto;
    white-space: pre-wrap;
  }

  .help {
    margin: 0;
  }

  .guide {
    margin: 0;
    font-size: 0.875rem;
  }
</style>
