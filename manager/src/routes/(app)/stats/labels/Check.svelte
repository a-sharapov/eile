<script lang="ts">
import { api } from '#lib/api.ts';
import { t } from '#lib/i18n.ts';
import { describe } from '#lib/notices.svelte.ts';
import type { LabelCheck, SetupView } from '#lib/types.ts';
import { senderName } from '../names.ts';
import CheckResult from './CheckResult.svelte';

// Проверка метки или адреса: адрес с UTM, переход сайта или адрес назначения перехода — откуда взята метка и как
// она разбирается по схеме. Проверка идёт по ходу ввода, через 300 мс после правки.
let { setup }: { setup: SetupView } = $props();

const id = $props.id();
const _LIMIT = 2000;

let text = $state('');
let sender = $state('');
let result = $state<LabelCheck | null>(null);
let error = $state<string | null>(null);
let busy = $state(false);

// Схема в архиве тоже разбирает метки — как у сервера.
const schemas = $derived(setup.schemas);

const run = (wanted: string, owner: string) => (
  (busy = true),
  api
    .get<LabelCheck>(
      `/analytics/labels/check?${new URLSearchParams({ sender: owner, text: wanted })}`
    )
    .then(
      (_) =>
        void (
          wanted === text.trim() &&
          owner === sender &&
          ((result = _), (error = null))
        ),
      (failure) =>
        void (
          wanted === text.trim() &&
          ((result = null), (error = describe(failure)))
        )
    )
    .finally(() => (busy = false))
);

let timer = 0;
$effect(() => {
  const wanted = text.trim();
  const owner = sender;
  clearTimeout(timer);
  void (wanted === ''
    ? ((result = null), (error = null))
    : (timer = window.setTimeout(() => void run(wanted, owner), 300)));
  return () => clearTimeout(timer);
});

const submit = (event: SubmitEvent) => (
  event.preventDefault(),
  void (text.trim() !== '' && (clearTimeout(timer), run(text.trim(), sender)))
);
</script>

<div class="check">
  <p class="intro">{t('labels.checkIntro')}</p>
  <form class="form" onsubmit={submit}>
    <label class="grow">
      <span>{t('labels.checkText')}</span>
      <textarea id={`${id}-text`} rows="2" class="code" bind:value={text} maxlength={_LIMIT} spellcheck="false" autocomplete="off" placeholder="entry__source__type · https://…?start=…" aria-describedby={`${id}-hint`}></textarea>
      <small id={`${id}-hint`}>{t('labels.checkHint', { n: _LIMIT })}</small>
    </label>
    {#if schemas.length > 1}
      <label>
        <span>{t('people.sender')}</span>
        <select bind:value={sender}>
          <option value="">{t('labels.senderAuto')}</option>
          {#each schemas as item (item.sender)}<option value={item.sender}>{senderName(setup, item.sender)}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="actions"><button class="button" aria-disabled={busy}>{t('labels.checkRun')}</button></div>
  </form>

  <div aria-live="polite">
    {#if error}
      <p class="field-error" role="alert">{error}</p>
    {:else if result}
      <CheckResult {setup} {result} />
    {/if}
  </div>
</div>

<style>
  .check {
    display: grid;
    gap: 1.25rem;
    max-width: 52rem;
    min-width: 0;
  }

  .intro {
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(10rem, 14rem);
    gap: 0.75rem 1rem;
    align-items: start;
  }

  .form .grow {
    grid-column: 1 / -1;
  }

  .actions {
    display: flex;
    align-items: end;
    align-self: end;
  }

  textarea {
    resize: vertical;
  }

  @media (max-width: 34rem) {
    .form {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
