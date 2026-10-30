<script lang="ts">
import type { HTMLInputAttributes } from 'svelte/elements';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';

let {
  value = $bindable(''),
  labelledby,
  ...rest
}: {
  value: string;
  /**
   * id подписи поля. Кнопка «Показать» лежит внутри <label>, и без явной подписи её название
   * вошло бы в имя поля: «Пароль Показать пароль».
   */
  labelledby: string;
} & Omit<HTMLInputAttributes, 'type' | 'value'> = $props();

let shown = $state(false);
</script>

<!-- Пароль, набранный вслепую, — частая ошибка, особенно когда его задают другому человеку. -->
<span class="password">
  <input {...rest} type={shown ? 'text' : 'password'} aria-labelledby={labelledby} bind:value />
  <button type="button" class="icon reveal" aria-pressed={shown} aria-label={t('password.show')} title={t(shown ? 'password.hide' : 'password.show')} onclick={() => (shown = !shown)}>
    {@html shown ? icons.eyeOff : icons.eye}
  </button>
</span>

<style>
  .password {
    position: relative;
    display: block;
  }

  input {
    width: 100%;
    padding-right: 2.75rem;
    font-size: 0.9375rem;
    font-weight: 400;
  }

  .reveal {
    position: absolute;
    top: 50%;
    right: 0.25rem;
    width: 2.25rem;
    min-height: 2.25rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--muted);
    transform: translateY(-50%);
  }

  .reveal:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
