<script lang="ts">
import { untrack } from 'svelte';
import {
  appearance,
  applyAppearance,
  PRESETS,
  saveAppearance,
} from '#lib/appearance.svelte.ts';
import { t } from '#lib/i18n.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { Appearance, ColorScheme } from '#lib/types.ts';

// onclose — вернуть фокус: кнопка, открывшая диалог, к этому времени уже скрыта вместе с меню.
let {
  open = $bindable(false),
  onclose,
}: { open: boolean; onclose?: () => void } = $props();

let element: HTMLDialogElement;
let draft = $state<Appearance>({ ...appearance.current });
// До «Отмены» — то оформление, с которым диалог открыли.
let before: Appearance = { ...appearance.current };

const _SCHEMES: readonly {
  readonly value: ColorScheme;
  readonly label: string;
}[] = [
  { value: 'system', label: t('appearance.system') },
  { value: 'light', label: t('appearance.light') },
  { value: 'dark', label: t('appearance.dark') },
];

// untrack: предпросмотр пишет в appearance.current, и эффект, подписанный на него, переписал бы
// «как было» каждым выбором — «Отмена» тогда ничего не возвращала бы.
$effect(() => {
  void (open
    ? untrack(
        () => (
          (before = { ...appearance.current }),
          (draft = { ...appearance.current }),
          element.open || element.showModal()
        )
      )
    : element.open && element.close());
});

// Цвета меняются сразу — видно, как будет выглядеть менеджер, ещё до сохранения.
const pick = (next: Partial<Appearance>) =>
  void ((draft = { ...draft, ...next }), applyAppearance(draft));

const cancel = () => (applyAppearance(before), (open = false));

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  saveAppearance(draft)
    .then(() => ((open = false), notify(t('appearance.saved'))))
    .then(undefined, failed)
);
</script>

<dialog bind:this={element} oncancel={(e) => (e.preventDefault(), cancel())} onclose={() => onclose?.()} aria-labelledby="appearance-title">
  {#if open}
    <form onsubmit={save}>
      <h2 id="appearance-title">{t('appearance.title')}</h2>
      <p class="muted">{t('appearance.body')}</p>

      <fieldset class="plain">
        <legend class="label">{t('appearance.accent')}</legend>
        <div class="swatches">
          {#each PRESETS as preset (preset.accent)}
            <label class="swatch" title={preset.label}>
              <input type="radio" name="accent" value={preset.accent} checked={draft.accent === preset.accent} onchange={() => pick({ accent: preset.accent })} />
              <span class="chip" style:background={preset.accent}></span>
              <span class="sr-only">{preset.label}</span>
            </label>
          {/each}
          <label class="custom">
            <input type="color" value={draft.accent} oninput={(e) => pick({ accent: e.currentTarget.value })} />
            <span>{t('appearance.custom')}</span>
          </label>
        </div>
      </fieldset>

      <!-- Образец: где появится акцент — главная кнопка, выделение в дереве, ссылка. -->
      <div class="sample" aria-hidden="true">
        <span class="sample-button">{t('appearance.rolePrimary')}</span>
        <span class="sample-soft"><i></i>{t('appearance.roleAccent')}</span>
        <span class="sample-link">{t('appearance.roleMark')}</span>
      </div>

      <fieldset class="plain">
        <legend class="label">{t('appearance.scheme')}</legend>
        <div class="schemes">
          {#each _SCHEMES as scheme (scheme.value)}
            <label class="scheme" data-scheme={scheme.value}>
              <input type="radio" name="scheme" value={scheme.value} checked={draft.scheme === scheme.value} onchange={() => pick({ scheme: scheme.value })} />
              <span class="preview" aria-hidden="true"><i></i><b></b></span>
              {scheme.label}
            </label>
          {/each}
        </div>
      </fieldset>

      <div class="actions">
        <button type="button" onclick={cancel}>{t('common.cancel')}</button>
        <button class="primary">{t('appearance.save')}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 30rem);
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
    gap: 1.25rem;
    padding: 1.75rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  p {
    margin: 0;
  }

  .plain {
    gap: 0.5rem;
    padding: 0;
    border: 0;
    background: none;
    box-shadow: none;
  }

  .label {
    float: none;
    width: auto;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font-size: 0.8125rem;
    box-shadow: none;
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .swatch {
    position: relative;
    display: block;
    cursor: pointer;
  }

  .swatch input {
    position: absolute;
    opacity: 0;
  }

  .chip {
    display: block;
    width: 2rem;
    height: 2rem;
    border: 0.125rem solid var(--surface);
    border-radius: 50%;
    box-shadow: 0 0 0 0.0625rem var(--line);
  }

  .swatch input:checked + .chip {
    box-shadow: 0 0 0 0.1875rem var(--text);
  }

  .swatch input:focus-visible + .chip {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.25rem;
  }

  .custom {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    font-weight: 400;
  }

  .custom input {
    width: 2.5rem;
    height: 2rem;
    min-height: 0;
    padding: 0.125rem;
  }

  .sample {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.85rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--sunken);
    font-size: 0.8125rem;
  }

  .sample-button {
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius);
    background: var(--primary);
    color: var(--primary-text);
    font-weight: 600;
  }

  .sample-soft {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.35rem 0.6rem;
    border-radius: var(--radius);
    background: var(--canvas);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    font-weight: 600;
  }

  .sample-soft i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .sample-link {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.18em;
  }

  /* Схема — карточкой с крошечным макетом: светлая, тёмная или пополам, как в системе. */
  .schemes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }

  .scheme {
    position: relative;
    display: grid;
    gap: 0.45rem;
    padding: 0.5rem 0.5rem 0.6rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .scheme:has(:checked) {
    border-color: var(--accent);
    box-shadow: 0 0 0 0.0625rem var(--accent);
  }

  .scheme:has(:focus-visible) {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  .scheme input {
    position: absolute;
    opacity: 0;
  }

  .preview {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.25rem;
    height: 3rem;
    padding: 0.25rem;
    border-radius: var(--radius);
    background: oklch(95% 0.006 var(--hue));
  }

  .preview i,
  .preview b {
    border-radius: 0.25rem;
  }

  .preview i {
    background: oklch(90% 0.01 var(--hue));
  }

  .preview b {
    background: oklch(100% 0 none);
  }

  [data-scheme='dark'] .preview {
    background: oklch(17% 0.01 var(--hue));
  }

  [data-scheme='dark'] .preview i {
    background: oklch(24% 0.012 var(--hue));
  }

  [data-scheme='dark'] .preview b {
    background: oklch(21% 0.01 var(--hue));
  }

  [data-scheme='system'] .preview {
    background: linear-gradient(
      135deg,
      oklch(95% 0.006 var(--hue)) 50%,
      oklch(17% 0.01 var(--hue)) 50%
    );
  }

  [data-scheme='system'] .preview :is(i, b) {
    background: oklch(60% 0.01 var(--hue) / 0.35);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
</style>
