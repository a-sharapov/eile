<script lang="ts">
import { tick } from 'svelte';
import { aiPrompt, closeAi, currentScope } from '#lib/ai.svelte.ts';
import { api } from '#lib/api.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import { parseHtml, serializeHtml } from '#lib/rich-text.ts';

// Окошко «Сгенерировать с ИИ» у поля: короткий запрос → предпросмотр → «Вставить».
let element = $state<HTMLDivElement>();
let input = $state<HTMLTextAreaElement>();
let request = $state('');
let result = $state<string | null>(null);
let error = $state<string | null>(null);
let busy = $state(false);
let place = $state({ top: 0, bottom: 0, left: 0, mode: 'below' });
// Ответ на отменённый или прежний запрос не показываем.
let generation = 0;

const current = $derived(aiPrompt.current);
const code = $derived(
  current?.target.kind === 'template' ||
    current?.target.kind === 'component' ||
    current?.target.kind === 'plugin'
);

const _PLACEHOLDER: Readonly<Record<string, MessageKey>> = {
  text: 'ai.placeholderText',
  longtext: 'ai.placeholderLong',
  richtext: 'ai.placeholderRich',
  template: 'ai.placeholderCode',
  component: 'ai.placeholderCode',
  plugin: 'ai.placeholderCode',
};

// Частые просьбы к уже написанному — одним нажатием.
const _QUICK: readonly MessageKey[] = [
  'ai.quickShorter',
  'ai.quickLively',
  'ai.quickFix',
  'ai.quickEnglish',
];

const _WIDTH = 26 * 16;

// Окошко — под полем, у его правого края; внизу экрана — над полем; на телефоне — листом снизу.
const position = (anchor: HTMLElement) =>
  ((box) =>
    void (place = {
      top: box.bottom + 6,
      bottom: innerHeight - box.top + 6,
      left: Math.max(
        12,
        Math.min(box.right - _WIDTH, innerWidth - _WIDTH - 12)
      ),
      mode:
        innerWidth < 768
          ? 'sheet'
          : box.bottom > innerHeight * 0.6
            ? 'above'
            : 'below',
    }))(anchor.getBoundingClientRect());

$effect(() => {
  const pending = current;
  void (
    pending &&
    ((request = ''),
    (result = null),
    (error = null),
    (busy = false),
    position(pending.anchor),
    tick().then(() => input?.focus()))
  );
});

const close = (returnFocus = true) => {
  const anchor = current?.anchor;
  generation += 1;
  closeAi();
  void (returnFocus && anchor?.focus());
};

const generate = (text = request) =>
  void (
    current &&
    text.trim() &&
    ((pending, id) => (
      (request = text),
      (busy = true),
      (error = null),
      (result = null),
      api
        .send<{ text: string }>('POST', '/assistant/generate', {
          target: { ...pending.target, ...currentScope() },
          request: text,
        })
        .then(
          (_) => void (id === generation && (result = _.text)),
          (failure) => void (id === generation && (error = describe(failure)))
        )
        .finally(() => void (id === generation && (busy = false)))
    ))(current, ++generation)
  );

const insert = () =>
  void (
    current &&
    result !== null &&
    (current.apply(result), notify(t('ai.inserted')), close())
  );

const onKey = (event: KeyboardEvent) =>
  void (event.key === 'Escape'
    ? (event.preventDefault(), close())
    : (event.ctrlKey || event.metaKey) &&
      event.key === 'Enter' &&
      (event.preventDefault(),
      result !== null && !busy ? insert() : generate()));

// Щелчок мимо закрывает окошко, если оно не ждёт ответа.
const onOutside = (event: PointerEvent) =>
  void (
    current &&
    !busy &&
    element &&
    !element.contains(event.target as Node) &&
    !current.anchor.contains(event.target as Node) &&
    close(false)
  );

// HTML от модели — только то, что умеет текст страницы: остальное отсекает схема редактора.
const preview = $derived(
  result !== null && current?.target.kind === 'richtext'
    ? serializeHtml(parseHtml(result))
    : null
);
</script>

<svelte:window onpointerdown={onOutside} onresize={() => current && position(current.anchor)} />

{#if current}
  <div
    bind:this={element}
    class="ai-prompt"
    data-place={place.mode}
    style:top={place.mode === 'below' ? `${place.top}px` : undefined}
    style:bottom={place.mode === 'above' ? `${place.bottom}px` : undefined}
    style:left={place.mode === 'sheet' ? undefined : `${place.left}px`}
    role="dialog"
    aria-label={`${t('ai.title')}: ${current.target.label}`}
    tabindex="-1"
    onkeydown={onKey}
  >
    <header>
      <span class="glyph" aria-hidden="true">{@html icons.wand}</span>
      <strong>{t('ai.title')}</strong>
      <span class="field">{current.target.label}</span>
      <button type="button" class="ghost icon" aria-label={t('common.close')} title={`${t('common.close')} (Esc)`} onclick={() => close()}>{@html icons.close}</button>
    </header>

    <label class="sr-only" for="ai-request">{t('ai.request')}</label>
    <textarea
      id="ai-request"
      bind:this={input}
      bind:value={request}
      rows="2"
      placeholder={t(_PLACEHOLDER[current.target.kind] ?? 'ai.placeholderText')}
      disabled={busy}
    ></textarea>

    {#if !code && current.target.value.trim() && result === null && !busy}
      <div class="quick" role="group" aria-label={t('ai.quick')}>
        {#each _QUICK as key (key)}
          <button type="button" onclick={() => generate(t(key))}>{t(key)}</button>
        {/each}
      </div>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if busy}
      <p class="thinking" role="status"><span class="dot" aria-hidden="true"></span>{t('ai.thinking')}</p>
    {:else if result !== null}
      <div class="result" class:code aria-live="polite">
        {#if preview !== null}
          {@html preview}
        {:else if code}
          <pre>{result}</pre>
        {:else}
          <p>{result}</p>
        {/if}
      </div>
    {/if}

    <footer>
      {#if busy}
        <button type="button" onclick={() => ((generation += 1), (busy = false))}>{t('common.cancel')}</button>
      {:else if result !== null}
        <button type="button" onclick={() => generate()}>{@html icons.refresh}{t('ai.again')}</button>
        <button type="button" class="primary" onclick={insert}>{t('ai.insert')}<kbd>{t('ai.keyEnter')}</kbd></button>
      {:else}
        <span class="hint">{t('ai.sends')}</span>
        <button type="button" class="primary" aria-disabled={!request.trim()} onclick={() => generate()}>{@html icons.wand}{t('ai.generate')}</button>
      {/if}
    </footer>
  </div>
{/if}

<style>
  .ai-prompt {
    position: fixed;
    z-index: 40;
    display: grid;
    gap: 0.75rem;
    width: min(26rem, calc(100vw - 1.5rem));
    padding: 0.875rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow-big);
    animation: ai-in 160ms var(--ease);
  }

  @keyframes ai-in {
    from {
      opacity: 0;
      transform: translateY(-0.25rem);
    }
  }

  .ai-prompt[data-place='above'] {
    animation-name: ai-in-above;
  }

  @keyframes ai-in-above {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-prompt {
      animation: none;
    }
  }

  header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.875rem;
  }

  .glyph {
    display: inline-grid;
    color: var(--accent);
  }

  .glyph :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .field {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header button {
    margin-left: auto;
  }

  textarea {
    width: 100%;
    min-height: 3.5rem;
    resize: vertical;
    field-sizing: content;
    max-height: 10rem;
  }

  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .quick button {
    min-height: 1.875rem;
    padding: 0 0.7rem;
    border-radius: 999px;
    box-shadow: none;
    font-size: 0.8125rem;
    font-weight: 450;
  }

  .thinking {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .dot {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--accent);
    animation: ai-pulse 900ms var(--ease) infinite alternate;
  }

  @keyframes ai-pulse {
    to {
      opacity: 0.25;
      transform: scale(0.7);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }

  .result {
    max-height: 16rem;
    overflow: auto;
    padding: 0.75rem 0.875rem;
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.875rem;
    line-height: 1.55;
  }

  .result :global(:first-child) {
    margin-top: 0;
  }

  .result :global(:last-child) {
    margin-bottom: 0;
  }

  .result pre {
    margin: 0;
    font-family: var(--mono);
    font-size: 0.75rem;
    white-space: pre-wrap;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.875rem;
  }

  footer {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-end;
  }

  .hint {
    margin-right: auto;
    color: var(--muted);
    font-size: 0.75rem;
  }

  footer kbd {
    margin-left: 0.25rem;
    border-color: color-mix(in oklab, var(--on-accent, white) 35%, transparent);
    background: transparent;
    color: inherit;
  }

  /* Телефон: окошко — листом снизу во всю ширину, над клавиатурой. */
  .ai-prompt[data-place='sheet'] {
    right: 0.75rem;
    bottom: 0.75rem;
    left: 0.75rem;
    width: auto;
  }
</style>
