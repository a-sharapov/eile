<!-- Остров меню: Esc закрывает подменю, открытое наведением или фокусом; без мыши первое касание пункта
с подменю открывает его, второе ведёт по ссылке; ссылка в панели закрывает панель. -->
<script module lang="ts">
// Один обработчик на страницу, сколько бы меню на ней ни было.
let installed = false;
</script>

<script lang="ts">
import { onMount } from 'svelte';

// Подменю закрыто, пока мышь не уйдёт с пункта или фокус не покинет его целиком.
const close = (item: Element): void => {
  const reopen = (): void => (
    item.removeAttribute('data-closed'),
    item.removeEventListener('mouseleave', reopen),
    item.removeEventListener('focusout', leave)
  );
  const leave = (event: Event): void =>
    void (
      !item.contains((event as FocusEvent).relatedTarget as Node | null) &&
      reopen()
    );
  item.setAttribute('data-closed', '');
  item.addEventListener('mouseleave', reopen);
  item.addEventListener('focusout', leave);
  item.querySelector<HTMLElement>(':scope > a')?.focus();
};

const escape = (event: KeyboardEvent): void =>
  ((item) => void (event.key === 'Escape' && item && close(item)))(
    (event.target as Element | null)?.closest?.('[data-menu] li.parent')
  );

// В выезжающей панели ссылка на ту же страницу (#якорь) иначе оставила бы её открытой.
const hidePanel = (link: Element | null): void =>
  void (
    link?.closest('[data-menu] [popover]') as HTMLElement | null
  )?.hidePopover?.();

// Без наведения подменю не увидеть: первое касание раскрывает пункт, касание мимо — сворачивает.
const touch = (event: MouseEvent, link: Element | null): void => {
  const item = link?.parentElement?.matches('[data-menu] .bar li.parent')
    ? link.parentElement
    : null;
  // В панели узкого экрана подменю и так раскрыты — касание сразу ведёт по ссылке.
  const coarse = matchMedia('(hover: none) and (min-width: 48.0625rem)').matches;
  document
    .querySelectorAll('[data-menu] li[data-open]')
    .forEach(
      (_) => void (_.contains(event.target as Node) || _.removeAttribute('data-open'))
    );
  void (
    coarse &&
    item &&
    !item.hasAttribute('data-open') &&
    (event.preventDefault(), item.setAttribute('data-open', ''))
  );
};

const follow = (event: MouseEvent): void =>
  ((link) => (touch(event, link), event.defaultPrevented || hidePanel(link)))(
    (event.target as Element | null)?.closest?.('a') ?? null
  );

onMount(() => {
  const install = !installed;
  installed = true;
  void (
    install &&
    (document.addEventListener('keydown', escape),
    document.addEventListener('click', follow))
  );
  return () =>
    void (
      install &&
      ((installed = false),
      document.removeEventListener('keydown', escape),
      document.removeEventListener('click', follow))
    );
});
</script>
