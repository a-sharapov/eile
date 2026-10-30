// Пояснение <small> внутри <label> — описание поля, а не часть его имени: иначе читалка
// произносит подпись вместе с подсказкой. Подсказка скрывается из имени (aria-hidden) и
// связывается с полем через aria-describedby — описание читается и у скрытого элемента.
let _next = 0;

const _wire = (small: HTMLElement): void => {
  const control = small
    .closest('label')
    ?.querySelector<HTMLElement>('input, select, textarea');
  const id = small.id || (small.id = `hint-${++_next}`);
  const described = (control?.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean);
  void (
    small.getAttribute('aria-hidden') !== 'true' &&
    small.setAttribute('aria-hidden', 'true')
  );
  void (
    control &&
    !described.includes(id) &&
    control.setAttribute('aria-describedby', [...described, id].join(' '))
  );
};

/** Для `{@attach describeHints}` на корне раздела: следит и за полями, которые появятся позже. */
export var describeHints = (root: HTMLElement): (() => void) => {
  const wire = () =>
    root.querySelectorAll<HTMLElement>('label small').forEach(_wire);
  const observer = new MutationObserver(wire);
  wire();
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-describedby'],
  });
  return () => observer.disconnect();
};
