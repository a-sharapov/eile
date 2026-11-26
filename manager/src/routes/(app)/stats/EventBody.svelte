<script lang="ts">
import { ROLE_LABELS } from '#lib/analytics.ts';
import { api } from '#lib/api.ts';
import { moment } from '#lib/format.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type { RawEvent } from '#lib/types.ts';
import Mark from './Mark.svelte';
import Modal from './Modal.svelte';

// Исходное тело события — как пришло от отправителя. Его пишут чужие системы, поэтому оно выводится только
// текстом: Svelte экранирует подстановку, разметки из тела на экране не бывает.
let { seq, onclose }: { seq: number | null; onclose: () => void } = $props();

let event = $state<RawEvent | null>(null);
let error = $state<string | null>(null);

$effect(() => {
  const wanted = seq;
  event = null;
  error = null;
  void (
    wanted !== null &&
    api.get<RawEvent>(`/analytics/events/${wanted}`).then(
      (_) => void (seq === wanted && (event = _)),
      (_) => void (error = describe(_))
    )
  );
});

// Тело — JSON-объект: с отступами его легче читать; не разобралось (так не бывает, но тело хранится как пришло) — как есть.
const pretty = (body: string): string => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
};

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('common.copied')), failed);
</script>

<Modal open={seq !== null} wide title={event ? (event.name ?? t('analytics.unknownTypeTitle', { code: event.type })) : t('analytics.bodyTitle')} {onclose}>
  {#if error}
    <p class="field-error" role="alert">{error}</p>
  {:else if event}
    <dl class="meta">
      <div><dt>{t('analytics.eventAt')}</dt><dd>{moment(event.at)} {#if event.future}<Mark tone="warn">{t('analytics.future')}</Mark>{/if}</dd></div>
      <div><dt>{t('analytics.receivedAt')}</dt><dd>{moment(event.receivedAt)} · {t(event.origin === 'file' ? 'analytics.originFile' : 'analytics.originHttp')}</dd></div>
      <div><dt>{t('analytics.role')}</dt><dd>{event.role ? t(ROLE_LABELS[event.role]) : t('analytics.noRole')}</dd></div>
      <div><dt>{t('analytics.sender')}</dt><dd class="code">{event.sender}</dd></div>
      <div><dt>id</dt><dd class="code">{event.id}</dd></div>
      {#if event.test}<div><dt>{t('analytics.test')}</dt><dd><Mark>{t('analytics.testMark')}</Mark></dd></div>{/if}
    </dl>
    <p class="help">{t('analytics.bodyHint')}</p>
    <!-- Прокручиваемый блок — в порядке Tab: его читают и листают с клавиатуры. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="raw" tabindex="0" aria-label={t('analytics.bodyTitle')}>{pretty(event.body)}</pre>
  {:else}
    <p class="muted">{t('common.loading')}</p>
  {/if}
  {#snippet footer()}
    {#if event}<button type="button" class="ghost" onclick={() => copy(event!.body)}>{@html icons.copy}{t('analytics.copyBody')}</button>{/if}
    <button type="button" onclick={onclose}>{t('common.close')}</button>
  {/snippet}
</Modal>

<style>
  .meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.6rem 1.25rem;
    margin: 0;
  }

  .meta dt {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .meta dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .help {
    margin: 0;
  }

  .raw {
    max-height: 26rem;
    margin: 0;
    padding: 0.9rem 1rem;
    overflow: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--sunken);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
