<!-- @component
Поле поиска по сайту для шапки: обычная форма без JS, ведёт на страницу выдачи с запросом в адресе. Где
места меньше 7rem, остаётся одна кнопка-лупа — поле ждёт на странице выдачи.
-->
<script lang="ts">
import { link } from '$core';

let {
  /** Страница выдачи: id страницы, где стоит SearchResults */
  page = null,
  /** Подсказка в поле */
  placeholder = 'Поиск',
  /** Подпись поля для читалок экрана */
  label = 'Поиск по сайту',
  /** Подпись кнопки для читалок экрана */
  button = 'Найти',
}: {
  page?: number | string | null;
  placeholder?: string;
  label?: string;
  button?: string;
} = $props();

const uid = $props.id();
// Номер страницы может прийти строкой из своей настройки; нет страницы — форма уйдёт на текущий адрес.
const action = $derived(
  page !== null && page !== '' && Number.isInteger(Number(page))
    ? link(Number(page))
    : null
);
</script>

<form class="search-form" role="search" method="get" action={action}>
  <label class="hidden" for="{uid}-q">{label}</label>
  <input id="{uid}-q" type="search" name="q" {placeholder} maxlength="200" autocomplete="off" enterkeyhint="search" />
  <button type="submit" aria-label={button} title={button}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
  </button>
</form>

<style>
  .search-form {
    container-type: inline-size;
    position: relative;
    display: flex;
    align-items: center;
    width: var(--search-width, 100%);
    max-width: 100%;
  }

  input {
    width: 100%;
    min-width: 0;
    height: var(--search-height, 2.5rem);
    padding: 0 2.5rem 0 0.875rem;
    border: 0.0625rem solid var(--t-border, #dfe3ea);
    border-radius: var(--t-radius, 0.375rem);
    background: var(--t-surface, #fff);
    color: var(--t-text, #1d2430);
    font: inherit;
    font-size: 0.9375rem;
    appearance: none;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  input::placeholder {
    color: var(--t-muted, #5b6472);
    opacity: 1;
  }

  /* Своя кнопка справа: системный крестик очистки лёг бы на неё. */
  input::-webkit-search-cancel-button {
    display: none;
  }

  input:hover {
    border-color: color-mix(in oklab, var(--t-text, #1d2430) 30%, var(--t-border, #dfe3ea));
  }

  input:focus-visible {
    outline: none;
    border-color: var(--t-accent, #2f6fde);
    box-shadow: 0 0 0 0.1875rem color-mix(in oklab, var(--t-accent, #2f6fde) 22%, transparent);
  }

  button {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    width: 2.5rem;
    padding: 0;
    border: 0;
    border-radius: var(--t-radius, 0.375rem);
    background: none;
    color: var(--t-muted, #5b6472);
    cursor: pointer;
  }

  button:hover {
    color: var(--t-accent, #2f6fde);
  }

  button:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: -0.3125rem;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  /* Тесно — только лупа: пустой запрос откроет страницу выдачи с полем. */
  @container (max-width: 7rem) {
    input {
      display: none;
    }

    button {
      position: static;
      width: var(--search-height, 2.5rem);
      height: var(--search-height, 2.5rem);
      color: var(--t-text, #1d2430);
    }

    svg {
      width: 1.375rem;
      height: 1.375rem;
    }
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
