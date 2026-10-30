<!-- @component
Кнопка, которая открывает окно.
-->
<script lang="ts">
import Island from '$core/Island';

let {
  /** Адрес окна, которое открыть */
  modal,
  /** Надпись */
  text = 'Открыть',
  /** Вид: primary=Главная, secondary=Обычная, link=Ссылкой */
  variant = 'primary',
}: {
  modal: string;
  text?: string;
  variant?: 'primary' | 'secondary' | 'link';
} = $props();
</script>

<button type="button" class="open {variant}" commandfor={modal} command="show-modal">{text}</button>
<Island name="ModalLinks" />

<style>
  .open {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0 1.25rem;
    border: 0.0625rem solid transparent;
    border-radius: var(--t-radius, 0.375rem);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .primary {
    background: var(--t-accent, #2f6fde);
    color: var(--t-on-accent, #fff);
  }

  .primary:hover {
    filter: brightness(1.08);
  }

  .secondary {
    border-color: var(--t-border, #dfe3ea);
    background: var(--t-surface, #fff);
    color: var(--t-text, #1d2430);
  }

  .secondary:hover {
    background: var(--t-hover, #f1f4f8);
  }

  .link {
    min-height: 0;
    padding: 0;
    background: none;
    color: var(--t-accent, #2f6fde);
    font-weight: inherit;
    text-decoration: underline;
  }

  .open:focus-visible {
    outline: 0.125rem solid var(--t-accent, #2f6fde);
    outline-offset: 0.125rem;
  }
</style>
