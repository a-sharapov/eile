<!-- Остров окон: ссылки #адрес открывают окно, окно из адреса страницы открывается при загрузке.
Где браузер ещё не знает commandfor и closedby, их работу делает этот остров. -->
<script module lang="ts">
// Один обработчик на страницу, сколько бы окон и кнопок на ней ни было.
let installed = false;
</script>

<script lang="ts">
import { onMount } from 'svelte';

// Битый адрес вроде #%E0 — просто не окно.
const decoded = (hash: string): string => {
  try {
    return decodeURIComponent(hash);
  } catch {
    return '';
  }
};

const modalOf = (id: string): HTMLDialogElement | null =>
  ((found) =>
    found instanceof HTMLDialogElement && found.hasAttribute('data-modal')
      ? found
      : null)(id ? document.getElementById(id) : null);

const open = (dialog: HTMLDialogElement | null): boolean =>
  dialog !== null && (dialog.open || dialog.showModal(), true);

const _INVOKERS = typeof HTMLButtonElement !== 'undefined' &&
  'command' in HTMLButtonElement.prototype;
const _CLOSEDBY = typeof HTMLDialogElement !== 'undefined' &&
  'closedBy' in HTMLDialogElement.prototype;

const _COMMANDS: Readonly<Record<string, (dialog: HTMLDialogElement) => void>> = {
  'show-modal': (dialog) => void open(dialog),
  close: (dialog) => dialog.close(),
};

// Щелчок по подложке приходит в сам dialog, но за пределами его рамки.
const outside = (dialog: HTMLDialogElement, event: MouseEvent): boolean =>
  ((box) =>
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom)(dialog.getBoundingClientRect());

const click = (event: MouseEvent): void => {
  const target = event.target as Element | null;
  const anchor = target?.closest?.('a[href^="#"]');
  const invoker = _INVOKERS ? null : target?.closest?.('button[commandfor]');
  const dialog = target instanceof HTMLDialogElement ? target : null;
  void (
    anchor &&
    open(modalOf(decoded(anchor.getAttribute('href')!.slice(1)))) &&
    event.preventDefault()
  );
  void (
    invoker &&
    ((modal) =>
      modal && _COMMANDS[invoker.getAttribute('command') ?? '']?.(modal))(
      modalOf(invoker.getAttribute('commandfor') ?? '')
    )
  );
  void (
    !_CLOSEDBY &&
    dialog?.hasAttribute('data-modal') &&
    outside(dialog, event) &&
    dialog.close()
  );
};

onMount(() => {
  const install = !installed;
  installed = true;
  void (
    install &&
    (document.addEventListener('click', click),
    open(modalOf(decoded(location.hash.slice(1)))))
  );
  return () =>
    void (
      install &&
      ((installed = false), document.removeEventListener('click', click))
    );
});
</script>
