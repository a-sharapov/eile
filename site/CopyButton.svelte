<!-- Остров: копирует строку в буфер обмена; где буфер недоступен (не HTTPS) — выделяет команду рядом. -->
<script lang="ts">
import Icon from '$components/Icon';

let { text, label, done }: { text: string; label: string; done: string } =
  $props();

let copied = $state(false);
let button: HTMLButtonElement | undefined = $state();
let timer: ReturnType<typeof setTimeout> | undefined;

const _flash = (): void => (
  clearTimeout(timer),
  (copied = true),
  void (timer = setTimeout(() => (copied = false), 2000))
);

const _select = (): void =>
  ((code) => void (code && window.getSelection()?.selectAllChildren(code)))(
    button?.closest('[data-command]')?.querySelector('code')
  );

const copy = (): void =>
  void (navigator.clipboard
    ? navigator.clipboard.writeText(text).then(_flash, _select)
    : _select());
</script>

<button
  bind:this={button}
  class="copy"
  class:copied
  type="button"
  onclick={copy}
  title={label}
>
  <Icon name={copied ? 'check' : 'copy'} />
  <span class="word">{copied ? done : label}</span>
</button>
<!-- Смену надписи на кнопке читалка не объявит: «Скопировано» говорит отдельная живая строка. -->
<span class="status" role="status">{copied ? done : ''}</span>

<style>
  .status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .copy {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.25rem;
    padding: 0 0.75rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--muted);
    font: 600 0.8125rem/1 var(--sans);
    cursor: pointer;
    transition:
      color 140ms var(--ease),
      background 140ms var(--ease);
  }

  .copy:hover {
    background: var(--canvas);
    color: var(--text);
  }

  .copied,
  .copied:hover {
    color: var(--ok);
  }

  @media (max-width: 40rem) {
    .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
