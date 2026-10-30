<!-- @component
Врезка: выделенный абзац с заголовком.
-->
<script lang="ts">
let {
  /** Заголовок */
  title = '',
  /** Текст */
  text,
  /** Оттенок: note=Заметка, success=Успех, warning=Внимание */
  tone = 'note',
}: {
  title?: string;
  text: string;
  tone?: 'note' | 'success' | 'warning';
} = $props();
</script>

<aside class={tone}>
  {#if title}<strong>{title}</strong>{/if}
  <p>{text}</p>
</aside>

<style>
  aside {
    margin: 1.5rem 0;
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    background: #f1f4f8;
  }

  .success {
    background: #eaf6ee;
  }

  .warning {
    background: #fbf3e4;
  }

  p {
    margin: 0.25rem 0 0;
  }
</style>
