import { tick } from 'svelte';
import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements';
import {
  gapBack,
  isNoop,
  landing,
  nearestGap,
  nextGap,
  type Step,
} from './reorder.ts';

export type SortableOptions = {
  /** Сколько строк в списке. */
  count: () => number;
  /** Строки по порядку, как в DOM; ручка в строке — элемент с `data-sort-grip`. */
  rows: () => readonly HTMLElement[];
  /** Сколько строк едет вместе с этой; по умолчанию одна. */
  span?: (index: number) => number;
  /** Промежутки 0…count, куда можно поставить строку; по умолчанию любые. */
  gaps?: (index: number) => readonly number[];
  /** Переставить строку `from` (с её отрезком) в промежуток `to`. */
  move: (from: number, to: number) => void;
  /** Что сказать читалке; строка уже стоит на `index`. */
  say: {
    readonly picked: (index: number) => string;
    readonly moved: (index: number) => string;
    readonly dropped: (index: number) => string;
    readonly cancelled: (index: number) => string;
  };
  /** Нижний край закреплённой шапки в пикселях окна: под ней список не виден. */
  top?: () => number;
};

type Mode = 'pointer' | 'keyboard';

// Палец и мышь дрожат: перетаскивание начинается, когда указатель ушёл дальше этого, px.
const _THRESHOLD = 4;
// Полоса у края окна, где список сам прокручивается, — в rem; скорость — px за кадр.
const _EDGE_REM = 4;
const _SPEED = 20;
const _NBSP = String.fromCharCode(0xa0);
// Подсветка строки, вставшей на место, — столько же длится её анимация в CSS, мс.
const _SETTLE_MS = 700;

const _KEYS: Readonly<Record<string, Step | 'cancel'>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'first',
  End: 'last',
  Escape: 'cancel',
};

/** Перенести узел в body: фиксированный слой не зависит от контейнеров с container-type. */
export var toBody = (node: HTMLElement): (() => void) => (
  document.body.append(node), () => node.remove()
);

/**
 * Перестановка строк списка мышью, пальцем и клавиатурой (WAI-ARIA): за ручку тянут; с клавиатуры
 * пробел или Enter на ручке поднимает строку, стрелки, Home и End переставляют, пробел или Enter
 * ставят, Esc возвращает на место. Каждый шаг произносит живая область `state.message`. Создаётся
 * при создании компонента: снимает слушатели, когда компонент уходит.
 */
export var defineSortable = (options: SortableOptions) => {
  const state = $state<{
    mode: Mode | null;
    from: number | null;
    to: number | null;
    x: number;
    y: number;
    message: string;
    /** Куда строка только что встала мышью или пальцем — её коротко подсвечивают. */
    settled: number | null;
  }>({
    mode: null,
    from: null,
    to: null,
    x: 0,
    y: 0,
    message: '',
    settled: null,
  });

  let press: { index: number; id: number; x: number; y: number } | null = null;
  let origin = 0;
  let frame = 0;
  let settling = 0;

  const span = (index: number): number => options.span?.(index) ?? 1;
  const gaps = (index: number): readonly number[] =>
    options.gaps?.(index) ??
    Array.from({ length: options.count() + 1 }, (_, i) => i);

  const grip = (index: number): HTMLElement | null =>
    options.rows()[index]?.querySelector<HTMLElement>('[data-sort-grip]') ??
    null;
  const focus = (index: number) => tick().then(() => grip(index)?.focus());

  // Одинаковый текст подряд читалка не повторяет: второй раз — с неразрывным пробелом.
  const say = (text: string) =>
    void (state.message = state.message === text ? `${text}${_NBSP}` : text);

  const target = (): number | null =>
    state.from === null
      ? null
      : nearestGap(
          options.rows().map((_) => _.getBoundingClientRect()),
          gaps(state.from),
          state.y
        );

  const scroll = () => {
    const zone =
      _EDGE_REM *
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const top = (options.top?.() ?? 0) + zone;
    const bottom = window.innerHeight - zone;
    const delta =
      state.y < top
        ? -Math.ceil(Math.min((top - state.y) / zone, 1) * _SPEED)
        : state.y > bottom
          ? Math.ceil(Math.min((state.y - bottom) / zone, 1) * _SPEED)
          : 0;
    void (delta !== 0 && (window.scrollBy(0, delta), (state.to = target())));
    frame = state.mode === 'pointer' ? requestAnimationFrame(scroll) : 0;
  };

  const listen = (on: boolean) =>
    (
      [
        ['pointermove', onMove],
        ['pointerup', onUp],
        ['pointercancel', end],
        ['keydown', onEscape],
      ] as const
    ).forEach(
      (_) =>
        void (on
          ? window.addEventListener(_[0], _[1] as EventListener, true)
          : window.removeEventListener(_[0], _[1] as EventListener, true))
    );

  const end = () => (
    cancelAnimationFrame(frame),
    listen(false),
    document.documentElement.removeAttribute('data-sorting'),
    (press = null),
    (state.mode = null),
    (state.from = null),
    (state.to = null)
  );

  const start = (event: PointerEvent, index: number) => (
    (state.mode = 'pointer'),
    (state.from = index),
    (state.x = event.clientX),
    (state.y = event.clientY),
    (state.to = target()),
    document.documentElement.setAttribute('data-sorting', ''),
    (frame = requestAnimationFrame(scroll))
  );

  const onMove = (event: PointerEvent) =>
    void (
      press &&
      event.pointerId === press.id &&
      (state.mode === 'pointer'
        ? ((state.x = event.clientX),
          (state.y = event.clientY),
          (state.to = target()))
        : Math.hypot(event.clientX - press.x, event.clientY - press.y) >
            _THRESHOLD && start(event, press.index))
    );

  const commit = (from: number, to: number) => {
    const at = landing(from, span(from), to);
    options.move(from, to);
    clearTimeout(settling);
    state.settled = at;
    settling = window.setTimeout(() => (state.settled = null), _SETTLE_MS);
    return focus(at).then(() => say(options.say.dropped(at)));
  };

  const onUp = (event: PointerEvent) =>
    void (
      press &&
      event.pointerId === press.id &&
      ((placed) => (end(), placed && commit(placed.from, placed.to)))(
        state.mode === 'pointer' &&
          state.from !== null &&
          state.to !== null &&
          !isNoop(state.from, span(state.from), state.to)
          ? { from: state.from, to: state.to }
          : null
      )
    );

  const onEscape = (event: KeyboardEvent) =>
    void (event.key === 'Escape' && (event.preventDefault(), end()));

  const pick = (index: number) => (
    (state.mode = 'keyboard'),
    (state.from = index),
    (origin = index),
    say(options.say.picked(index))
  );

  const drop = () =>
    void (
      state.from !== null &&
      (say(options.say.dropped(state.from)),
      (state.mode = null),
      (state.from = null))
    );

  const shift = (from: number, to: number) => {
    const at = landing(from, span(from), to);
    options.move(from, to);
    state.from = at;
    return focus(at);
  };

  // Дальше некуда — повторяем, где строка стоит, чтобы нажатие не прошло молча.
  const walk = (from: number, step: Step) =>
    ((to) =>
      to === null
        ? say(options.say.moved(from))
        : shift(from, to).then(() =>
            say(options.say.moved(state.from ?? from))
          ))(nextGap(gaps(from), from, span(from), step));

  const keys: Readonly<Record<Step | 'cancel', (from: number) => unknown>> = {
    cancel: (from) => (
      from === origin
        ? focus(origin)
        : shift(from, gapBack(from, span(from), origin)),
      say(options.say.cancelled(origin)),
      (state.mode = null),
      (state.from = null)
    ),
    up: (from) => walk(from, 'up'),
    down: (from) => walk(from, 'down'),
    first: (from) => walk(from, 'first'),
    last: (from) => walk(from, 'last'),
  };

  /** Свойства ручки строки `index`: подпись и пояснение добавляет список. */
  // Ушли со страницы посреди перетаскивания — снять слушатели окна и курсор.
  $effect(() => () => void (press && end()));

  const handle = (index: number): HTMLButtonAttributes => ({
    'data-sort-grip': '',
    'aria-pressed': state.mode === 'keyboard' && state.from === index,
    onpointerdown: (event) =>
      void (
        event.button === 0 &&
        state.mode === null &&
        (event.preventDefault(),
        event.currentTarget.setPointerCapture(event.pointerId),
        (press = {
          index,
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        }),
        listen(true))
      ),
    // Щелчок мышью или касание ручку не поднимают — это перетаскивание; detail 0 — клавиатура и читалка.
    onclick: (event) =>
      void (
        event.detail === 0 &&
        (state.mode === 'keyboard'
          ? drop()
          : state.mode === null && pick(index))
      ),
    onkeydown: (event) =>
      ((step) =>
        void (
          step &&
          state.mode === 'keyboard' &&
          state.from === index &&
          (event.preventDefault(), keys[step](index))
        ))(_KEYS[event.key]),
    // Ушли с ручки — Tab, щелчок в другом месте: строка остаётся там, куда её переставили.
    onfocusout: () =>
      void setTimeout(
        () =>
          void (
            state.mode === 'keyboard' &&
            state.from !== null &&
            document.activeElement !== grip(state.from) &&
            drop()
          )
      ),
    oncontextmenu: (event) => void event.preventDefault(),
  });

  const within = (index: number, start: number | null) =>
    start !== null && index >= start && index < start + span(start);

  /** Свойства строки: `data-sort` — поднята, едет или встала; `data-drop` — линия места над или под ней. */
  const row = (index: number): HTMLAttributes<HTMLElement> => {
    const moving = within(index, state.from);
    const to =
      state.mode === 'pointer' &&
      state.from !== null &&
      state.to !== null &&
      !isNoop(state.from, span(state.from), state.to)
        ? state.to
        : null;
    return {
      'data-sort': moving
        ? state.mode === 'keyboard'
          ? 'picked'
          : 'moving'
        : within(index, state.settled)
          ? 'settled'
          : undefined,
      'data-drop':
        to === index
          ? 'before'
          : to === options.count() && index === options.count() - 1
            ? 'after'
            : undefined,
    };
  };

  return { state, handle, row };
};
