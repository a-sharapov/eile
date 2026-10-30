<!-- @component
Корзина в браузере: строки заказа в localStorage, событие `cart:change` между островами на странице и
событие `storage` между вкладками. Ничего не выводит — его функции берут острова AddToCart, CartLink и Cart.
-->
<script module lang="ts">
export type Line = {
  id: number;
  title: string;
  price: number;
  url: string;
  qty: number;
};

const _KEY = 'cart';
const _EVENT = 'cart:change';

const _line = (raw: unknown): raw is Line =>
  typeof raw === 'object' &&
  raw !== null &&
  Number.isSafeInteger((raw as Line).id) &&
  typeof (raw as Line).title === 'string' &&
  Number.isFinite((raw as Line).price) &&
  Number.isSafeInteger((raw as Line).qty) &&
  (raw as Line).qty > 0;

/** Строки корзины; битые и чужие записи пропускаются. */
export var readCart = (): Line[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(_line) : [];
  } catch {
    return [];
  }
};

export var writeCart = (lines: readonly Line[]): void => {
  try {
    localStorage.setItem(_KEY, JSON.stringify(lines));
  } catch {}
  dispatchEvent(new CustomEvent(_EVENT));
};

/** Подписка на перемены корзины здесь и в других вкладках; возвращает отписку. */
export var onCart = (listener: () => void): (() => void) => {
  const storage = (event: StorageEvent): void =>
    void ((event.key === _KEY || event.key === null) && listener());
  addEventListener(_EVENT, listener);
  addEventListener('storage', storage);
  return () => (
    removeEventListener(_EVENT, listener),
    removeEventListener('storage', storage)
  );
};

/** Добавить или изменить количество; ноль убирает строку. */
export var setQty = (
  lines: readonly Line[],
  line: Omit<Line, 'qty'>,
  qty: number
): Line[] =>
  ((next) =>
    lines.some((_) => _.id === line.id)
      ? lines
          .map((_) => (_.id === line.id ? { ..._, qty: next } : _))
          .filter((_) => _.qty > 0)
      : next > 0
        ? [...lines, { ...line, qty: next }]
        : [...lines])(Math.max(0, Math.min(99, Math.trunc(qty))));

export var countOf = (lines: readonly Line[]): number =>
  lines.reduce((sum, _) => sum + _.qty, 0);

export var totalOf = (lines: readonly Line[]): number =>
  lines.reduce((sum, _) => sum + _.price * _.qty, 0);

export var money = (amount: number, currency: string): string =>
  `${new Intl.NumberFormat('ru', { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
</script>
