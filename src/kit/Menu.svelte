<!-- @component
Меню сайта: страницы дерева на несколько уровней. Подменю открывается при наведении, с клавиатуры и
первым касанием; на узком экране меню прячется за кнопку.
-->
<script lang="ts">
import { ancestors, children, current, link } from '$core';
import Island from '$core/Island';

let {
  /** Родитель: id страницы; пусто — верхний уровень */
  parent = null,
  /** Уровней, от 1 до 4 */
  depth = 2,
  /** Вид: bar=Строка с подменю, list=Столбиком */
  layout = 'bar',
  /** Название меню для читалок экрана */
  label = 'Основное меню',
  /** Прятать меню за кнопку на телефоне */
  burger = true,
  /** Подпись кнопки меню */
  burgerLabel = 'Меню',
}: {
  parent?: number | null;
  depth?: number;
  layout?: 'bar' | 'list';
  label?: string;
  burger?: boolean;
  burgerLabel?: string;
} = $props();

type Item = ReturnType<typeof children>[number];

const uid = $props.id();
const here = current();
// Активная ветка: текущая страница и её предки — по дереву, а не по началу адреса.
const trail = new Set(
  here ? [...ancestors(here.id).map((_) => _.id), here.id] : []
);
const levels = $derived(Math.min(4, Math.max(1, Math.trunc(depth) || 1)));
const collapsible = $derived(burger && layout === 'bar');
const top = $derived(children(parent));
// Остров нужен только подменю: Esc закрывает их. Меню в один уровень обходится без JS.
const nested = $derived(
  levels > 1 && top.some((_) => children(_.id).length > 0)
);
</script>

{#snippet level(items: Item[], left: number)}
  <ul>
    {#each items as item (item.id)}
      {@const sub = left > 1 ? children(item.id) : []}
      <li
        class:current={here?.id === item.id}
        class:active={trail.has(item.id) && here?.id !== item.id}
        class:parent={sub.length > 0}
      >
        <a href={link(item.id)} aria-current={here?.id === item.id ? 'page' : undefined}>{item.menuTitle || item.title}</a>
        {#if sub.length > 0}{@render level(sub, left - 1)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if top.length > 0}
  <nav class="menu {layout}" class:collapsible aria-label={label} data-menu>
    {#if collapsible}
      <button type="button" class="burger" popovertarget="{uid}-panel" aria-label={burgerLabel}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <div class="panel" id="{uid}-panel" popover>
        <button type="button" class="close" popovertarget="{uid}-panel" popovertargetaction="hide" aria-label="Закрыть">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {@render level(top, levels)}
      </div>
      {#if nested}<Island name="MenuKeys" />{/if}
    {:else}
      {@render level(top, levels)}
    {/if}
  </nav>
{/if}

<style>
  .menu {
    --menu-accent: var(--t-accent, #2f6fde);
    --menu-text: var(--t-text, #1d2430);
    --menu-surface: var(--t-surface, #fff);
    --menu-border: var(--t-border, #dfe3ea);
    font: inherit;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    display: block;
    padding: 0.5rem 0.75rem;
    border-radius: var(--t-radius, 0.375rem);
    color: var(--menu-text);
    text-decoration: none;
  }

  a:hover {
    color: var(--menu-accent);
  }

  a:focus-visible,
  button:focus-visible {
    outline: 0.125rem solid var(--menu-accent);
    outline-offset: 0.125rem;
  }

  .current > a,
  .active > a {
    color: var(--menu-accent);
  }

  .current > a {
    font-weight: 600;
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  button {
    display: none;
    padding: 0.5rem;
    border: 0;
    border-radius: var(--t-radius, 0.375rem);
    background: transparent;
    color: var(--menu-text);
    cursor: pointer;
  }

  /* Столбиком: все уровни раскрыты лесенкой. */
  .list ul ul {
    padding-inline-start: 1rem;
  }

  /* Строка: верхний уровень в ряд, подменю — выпадающие. */
  .bar > ul,
  .bar .panel > ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .bar li {
    position: relative;
  }

  .bar .parent > a::after {
    content: '';
    display: inline-block;
    width: 0.375em;
    height: 0.375em;
    margin-inline-start: 0.5em;
    border-inline-end: 0.125rem solid currentColor;
    border-block-end: 0.125rem solid currentColor;
    transform: translateY(-0.2em) rotate(45deg);
  }

  .bar li ul {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 0;
    z-index: 10;
    min-width: 14rem;
    padding: 0.375rem;
    border: 0.0625rem solid var(--menu-border);
    border-radius: calc(var(--t-radius, 0.375rem) * 1.5);
    background: var(--menu-surface);
    box-shadow: 0 0.75rem 2rem rgb(16 24 40 / 0.12);
    opacity: 0;
    visibility: hidden;
    translate: 0 0.25rem;
    /* Закрывается с задержкой: косое движение мыши к подменю его не схлопывает. */
    transition:
      opacity 0.15s,
      translate 0.15s,
      visibility 0s linear 0.25s;
  }

  .bar li li ul {
    inset-block-start: -0.375rem;
    inset-inline-start: 100%;
  }

  .bar li li.parent > a {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .bar li li.parent > a::after {
    transform: rotate(-45deg);
  }

  .bar li:hover > ul,
  .bar li:focus-within > ul {
    opacity: 1;
    visibility: visible;
    translate: 0 0;
    transition-delay: 0s;
  }

  /* Esc закрывает подменю, пока мышь или фокус не уйдут: так его можно убрать, не двигаясь. */
  .bar li[data-closed] > ul {
    opacity: 0;
    visibility: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar li ul {
      transition: none;
      translate: none;
    }
  }

  /* Касание на широком экране: первое открывает подменю (остров), второе ведёт по ссылке. */
  .bar li[data-open] > ul {
    opacity: 1;
    visibility: visible;
    translate: 0 0;
    transition-delay: 0s;
  }

  /* Узкий экран — кнопка и выезжающая панель, уровни раскрыты. */
  @media (max-width: 48rem) {
    .collapsible .burger {
      display: inline-flex;
    }

    .collapsible .panel {
      inset: 0 0 0 auto;
      width: min(20rem, 85vw);
      height: 100dvh;
      margin: 0;
      padding: 3.5rem 1rem 1rem;
      border: 0;
      background: var(--menu-surface);
      overflow-y: auto;
    }

    .collapsible .panel::backdrop {
      background: rgb(16 24 40 / 0.4);
    }

    .collapsible .panel > ul {
      flex-direction: column;
    }

    .collapsible .close {
      display: inline-flex;
      position: absolute;
      inset-block-start: 0.75rem;
      inset-inline-end: 0.75rem;
    }

    .collapsible li ul {
      position: static;
      min-width: 0;
      padding: 0 0 0 1rem;
      border: 0;
      background: none;
      box-shadow: none;
      opacity: 1;
      visibility: visible;
      translate: none;
    }

    .collapsible .parent > a::after {
      display: none;
    }
  }

  /* На широком экране панель — обычный блок: кнопка спрятана, popover не открывается. */
  @media (min-width: 48.0625rem) {
    .collapsible .panel {
      display: block;
      position: static;
      inset: auto;
      width: auto;
      height: auto;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      overflow: visible;
      color: inherit;
    }
  }
</style>
