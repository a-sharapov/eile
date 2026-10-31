<script lang="ts">
import {
  currentLanguage,
  isLanguage,
  LANGUAGE_NAMES,
  LANGUAGES,
  type Language,
  t,
} from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';

// Свой список, а не переключатель: языков станет больше. Названия — на самих языках.
let {
  onpick,
  labelled = false,
}: { onpick: (language: Language) => unknown; labelled?: boolean } = $props();

const pick = (event: Event) =>
  ((value) => void (isLanguage(value) && onpick(value)))(
    (event.currentTarget as HTMLSelectElement).value
  );
</script>

<label class="language" class:labelled title={labelled ? undefined : t('language.title')}>
  {@html icons.languages}
  <span class={labelled ? 'name' : 'sr-only'}>{t(labelled ? 'language.label' : 'language.title')}</span>
  <select value={currentLanguage()} onchange={pick}>
    {#each LANGUAGES as code (code)}
      <option value={code} lang={code}>{LANGUAGE_NAMES[code]}</option>
    {/each}
  </select>
</label>

<style>
  .language {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0;
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .language :global(svg) {
    flex: none;
    width: 1.125rem;
    height: 1.125rem;
    color: var(--muted);
  }

  .name {
    flex: 1;
  }

  /* Тихий список: без рамки, пока на него не навели, — как кнопки рядом. */
  select {
    width: auto;
    min-height: 2.25rem;
    padding-block: 0.25rem;
    padding-left: 0.5rem;
    border-color: transparent;
    background-color: transparent;
    font-size: 0.875rem;
    font-weight: 500;
  }

  select:hover:not(:focus) {
    border-color: transparent;
    background-color: var(--hover);
  }

  .labelled {
    padding-left: 0.6rem;
  }

  .labelled select {
    margin-right: -0.125rem;
    color: var(--muted);
  }
</style>
