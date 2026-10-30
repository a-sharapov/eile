<script lang="ts">
import { tick } from 'svelte';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { mediaUrl } from '#lib/media.ts';
import { pickMedia } from '#lib/media-picker.svelte.ts';

let {
  value = $bindable(null),
  label,
  hint = '',
  size,
}: {
  value: string | null;
  label: string;
  hint?: string;
  /** Рекомендуемый размер: окно выбора сверит с ним картинку. */
  size?: { readonly width: number; readonly height: number };
} = $props();

let group: HTMLDivElement;

// Выбор меняет кнопки («Выбрать» → «Заменить»): фокус — на новую, а не в никуда.
const choose = () =>
  pickMedia({ images: true, size }).then(
    (_) =>
      void (
        _ &&
        ((value = _.file.path),
        tick().then(() => group.querySelector<HTMLElement>('button')?.focus()))
      )
  );

// Кнопка «Убрать» исчезает вместе с картинкой: фокус переходит на «Выбрать».
const clear = () => (
  (value = null),
  tick().then(() => group.querySelector<HTMLElement>('button')?.focus())
);
</script>

<div class="media-field" role="group" aria-label={label} bind:this={group}>
  <span class="label">{label}</span>
  <div class="row">
    {#if value}
      <img src={mediaUrl(value)} alt="" />
      <div class="chosen">
        <span class="path" title={value}>{value}</span>
        <div class="buttons">
          <button type="button" onclick={choose}>{t('picker.replace')}</button>
          <button type="button" class="icon" aria-label={`${t('picker.clear')}: ${label}`} title={t('picker.clear')} onclick={clear}>{@html icons.close}</button>
        </div>
      </div>
    {:else}
      <button type="button" onclick={choose}>{@html icons.image}{t('picker.choose')}</button>
    {/if}
  </div>
  {#if hint}<small>{hint}</small>{/if}
</div>

<style>
  .media-field {
    display: grid;
    gap: 0.375rem;
    align-content: start;
  }

  /* Подпись как у остальных полей формы. */
  .label {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2.25rem;
  }

  .chosen {
    display: grid;
    flex: 1;
    gap: 0.3rem;
    min-width: 0;
  }

  .buttons {
    display: flex;
    gap: 0.35rem;
  }

  .buttons button {
    min-height: 2rem;
  }

  .buttons .icon {
    width: 2rem;
  }

  img {
    flex: none;
    width: 4.5rem;
    height: 3.5rem;
    border-radius: var(--radius);
    background: var(--sunken);
    object-fit: cover;
  }

  .path {
    min-width: 0;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--muted);
    font-size: 0.8125rem;
  }
</style>
