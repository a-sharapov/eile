import { beforeNavigate, goto } from '$app/navigation';
import { ask } from './dialog.svelte.ts';
import { t } from './i18n.ts';

/**
 * Защита несохранённой работы: переход внутри менеджера спрашивает через наш диалог,
 * закрытие вкладки — браузерным вопросом (другого браузер не позволяет).
 * Вызывать при инициализации компонента.
 */
export var guardUnsaved = (dirty: () => boolean): void => {
  let leaving = false;

  beforeNavigate(
    (navigation) =>
      void (
        !leaving &&
        dirty() &&
        !navigation.willUnload &&
        navigation.to &&
        (navigation.cancel(),
        ask({
          title: t('common.unsavedTitle'),
          body: t('common.leave'),
          confirm: t('common.leaveConfirm'),
          // Уход теряет правки: кнопка — как у удаления, а не как у сохранения.
          tone: 'danger',
        })
          // Ждём сам переход: goto в SvelteKit 3 вызывает beforeNavigate не сразу,
          // и сброшенный раньше флаг снова открыл бы этот же вопрос.
          .then((confirmed) =>
            confirmed ? ((leaving = true), goto(navigation.to!.url)) : undefined
          )
          .finally(() => (leaving = false)))
      )
  );

  $effect(() => {
    const warn = (event: BeforeUnloadEvent) =>
      void (dirty() && event.preventDefault());
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  });
};
