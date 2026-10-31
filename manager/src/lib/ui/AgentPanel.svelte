<script lang="ts">
import {
  type AgentStep,
  agent,
  askAgent,
  newConversation,
} from '#lib/agent.svelte.ts';
import { currentScope } from '#lib/ai.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { replyHtml } from '#lib/reply-html.ts';
import { page } from '$app/state';

let text = $state('');
let list = $state<HTMLElement>();
let input = $state<HTMLTextAreaElement>();

// Где человек: страница или элемент по адресу — их id и имя агенту нужнее подписи.
const place = (): string =>
  [
    page.params.id &&
      page.route.id?.includes('/pages/') &&
      `page id ${page.params.id}`,
    page.params.kind &&
      page.params.name &&
      `${page.params.kind} ${page.params.name}`,
    currentScope().area,
  ]
    .filter(Boolean)
    .join(', ');

// Главное в шаге — то, над чем он работал: заголовок, имя, путь или id.
const subject = (step: AgentStep): string =>
  ((args) =>
    String(
      args.title ?? args.name ?? args.path ?? (args.id ? `#${args.id}` : '')
    ))(step.arguments);

const send = (event?: Event) => (
  event?.preventDefault(),
  ((message) => void (message && ((text = ''), askAgent(message, place()))))(
    text.trim()
  )
);

// Enter отправляет, Shift+Enter — новая строка, как в мессенджерах.
const keys = (event: KeyboardEvent) =>
  void (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    send(event)
  );

const close = () => void (agent.open = false);

const EXAMPLES = [
  'agent.example1',
  'agent.example2',
  'agent.example3',
] as const;

// Новая реплика или шаг — прокрутка вниз, к последнему.
$effect(() => {
  void agent.turns.length;
  void agent.live.length;
  queueMicrotask(() =>
    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
  );
});

$effect(() => void (agent.open && queueMicrotask(() => input?.focus())));
</script>

<svelte:window onkeydown={(e) => void (agent.open && e.key === 'Escape' && !document.querySelector('dialog[open]') && close())} />

{#if agent.open}
  <aside class="agent" aria-labelledby="agent-title">
    <header>
      <h2 id="agent-title">{@html icons.wand}{t('agent.title')}</h2>
      <button type="button" class="ghost icon" aria-label={t('agent.new')} title={t('agent.new')} disabled={agent.running || agent.turns.length === 0} onclick={newConversation}>{@html icons.plus}</button>
      <button type="button" class="ghost icon" aria-label={t('common.close')} title={t('common.close')} onclick={close}>{@html icons.close}</button>
    </header>

    <div class="talk" bind:this={list} aria-live="polite">
      {#if agent.turns.length === 0}
        <div class="intro">
          <p>{t('agent.intro')}</p>
          <ul>
            {#each EXAMPLES as key (key)}
              <li><button type="button" class="example" onclick={() => ((text = t(key)), input?.focus())}>{t(key)}</button></li>
            {/each}
          </ul>
        </div>
      {/if}
      {#each agent.turns as turn, index (index)}
        {#if turn.role === 'user'}
          <p class="mine">{turn.content}</p>
        {:else}
          <div class="theirs">
            {#if turn.steps.length > 0}{@render steps(turn.steps)}{/if}
            {#if turn.error}<p class="error" role="alert">{turn.error}</p>{/if}
            {#if turn.content}<div class="reply">{@html replyHtml(turn.content)}</div>{/if}
            {#if turn.stopped}<p class="muted">{t('agent.stopped', { n: turn.steps.length })}</p>{/if}
          </div>
        {/if}
      {/each}
      {#if agent.running}
        <div class="theirs">
          {#if agent.live.length > 0}{@render steps(agent.live)}{/if}
          <p class="working muted"><span class="dot" aria-hidden="true"></span>{t('agent.working')}</p>
        </div>
      {/if}
    </div>

    <form onsubmit={send}>
      <label class="sr-only" for="agent-input">{t('agent.placeholder')}</label>
      <textarea id="agent-input" rows="3" placeholder={t('agent.placeholder')} bind:this={input} bind:value={text} onkeydown={keys} data-ai="off"></textarea>
      <div class="send">
        <small class="muted">{t('agent.hint')}</small>
        <button class="primary" aria-disabled={agent.running || text.trim() === ''}>{@html icons.send}{t('agent.send')}</button>
      </div>
    </form>
  </aside>
{/if}

{#snippet steps(items: readonly AgentStep[])}
  <ol class="steps" aria-label={t('agent.steps')}>
    {#each items as step, index (index)}
      <li class:failed={!step.ok}>
        <span class="mark" aria-hidden="true">{@html step.ok ? icons.check : icons.alert}</span>
        <code>{step.tool}</code>
        {#if subject(step)}<span class="subject">{subject(step)}</span>{/if}
        {#if !step.ok}<small>{step.result}</small>{/if}
      </li>
    {/each}
  </ol>
{/snippet}

<style>
  .agent {
    position: fixed;
    top: var(--topbar, 5rem);
    right: 0;
    bottom: 0;
    z-index: 22;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-columns: minmax(0, 1fr);
    width: min(28rem, 100vw);
    border-left: 0.0625rem solid var(--line);
    background: var(--surface);
    box-shadow: var(--shadow-big);
  }

  header {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding: 0.75rem 0.75rem 0.75rem 1.25rem;
    border-bottom: 0.0625rem solid var(--line);
  }

  h2 {
    display: flex;
    flex: 1;
    gap: 0.5rem;
    align-items: center;
    font-size: 1rem;
  }

  h2 :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
    color: var(--accent);
  }

  .talk {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .intro {
    display: grid;
    gap: 0.75rem;
    color: var(--muted);
  }

  .intro p {
    margin: 0;
  }

  .intro ul {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .example {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: start;
    white-space: normal;
    cursor: pointer;
  }

  .example:hover {
    background: var(--hover);
  }

  .mine {
    align-self: flex-end;
    max-width: 85%;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .theirs {
    display: grid;
    gap: 0.5rem;
  }

  .reply {
    display: grid;
    gap: 0.5rem;
    overflow-wrap: anywhere;
  }

  .reply :global(p),
  .reply :global(ul) {
    margin: 0;
  }

  .reply :global(ul) {
    padding-inline-start: 1.25rem;
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  .steps {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.875rem;
    list-style: none;
  }

  .steps li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: baseline;
    min-width: 0;
  }

  .mark :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--ok);
    vertical-align: -0.125rem;
  }

  .failed .mark :global(svg) {
    color: var(--danger);
  }

  .steps code {
    font-size: 0.8125rem;
  }

  .subject {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .steps small {
    flex-basis: 100%;
    color: var(--danger);
    overflow-wrap: anywhere;
  }

  .working {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s var(--ease, ease) infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }

  /* Телефон: панель во весь экран, поверх шапки — у неё свой заголовок и «Закрыть». */
  @media (max-width: 40rem) {
    .agent {
      top: 0;
      z-index: 30;
      border-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }

  form {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem 1.25rem;
    border-top: 0.0625rem solid var(--line);
  }

  textarea {
    resize: none;
  }

  .send {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .send small {
    font-size: 0.75rem;
  }
</style>
