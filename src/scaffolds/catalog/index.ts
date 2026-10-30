import type { NewField } from '../../contexts/content/index.ts';
import categoryList from './CategoryList.svelte' with { type: 'text' };
import cover from './Cover.svelte' with { type: 'text' };
import price from './Price.svelte' with { type: 'text' };
import productCard from './ProductCard.svelte' with { type: 'text' };
import productGrid from './ProductGrid.svelte' with { type: 'text' };

// Общее у витрины и магазина: компоненты каталога, поля товара и текст политики.

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

/** Компоненты каталога; зависимости — раньше зависящих. Набор: Pagination. */
export var CATALOG_COMPONENTS: Readonly<Record<string, string>> = {
  Cover: _text(cover),
  Price: _text(price),
  ProductCard: _text(productCard),
  ProductGrid: _text(productGrid),
  CategoryList: _text(categoryList),
};

/** Поля товара; обложка — и у раздела. */
export var catalogFields = (
  product: string,
  category: string
): readonly NewField[] => [
  { name: 'price', label: 'Цена', type: 'number', templates: [product] },
  {
    name: 'oldPrice',
    label: 'Старая цена',
    type: 'number',
    templates: [product],
  },
  { name: 'sku', label: 'Артикул', type: 'text', templates: [product] },
  {
    name: 'inStock',
    label: 'В наличии',
    type: 'boolean',
    defaultValue: true,
    templates: [product],
  },
  {
    name: 'badge',
    label: 'Отметка',
    type: 'select',
    options: ['Новинка', 'Хит', 'Скидка'],
    templates: [product],
  },
  {
    name: 'cover',
    label: 'Обложка',
    type: 'image',
    templates: [product, category],
  },
];

/** Таблица характеристик в тексте товара. */
export var specs = (rows: readonly (readonly [string, string])[]): string =>
  `<table class="specs"><tbody>${rows
    .map(
      ({ 0: name, 1: value }) => `<tr><th>${name}</th><td>${value}</td></tr>`
    )
    .join('')}</tbody></table>`;

/** Политика обработки персональных данных — образец, который владелец сайта дописывает под себя. */
export var policy = (
  operator: string
): string => `<p>Здесь — образец политики. Впишите свои реквизиты и проверьте текст с юристом: требования к нему зависят от страны и того, какие данные вы собираете.</p>
<h2>Кто обрабатывает данные</h2>
<p>Оператор — ${operator}. Реквизиты и адрес для обращений указаны на странице контактов.</p>
<h2>Какие данные и зачем</h2>
<p>Имя, телефон, почта, адрес доставки и текст сообщения — только чтобы ответить на заявку, оформить и доставить заказ. Данные не передаются третьим лицам, кроме службы доставки, если вы выбрали доставку.</p>
<h2>Сколько хранятся</h2>
<p>Заявки хранятся столько, сколько нужно для ответа и выполнения заказа, затем удаляются.</p>
<h2>Ваши права</h2>
<p>Вы можете узнать, какие данные о вас хранятся, исправить их или попросить удалить — напишите на почту из контактов.</p>`;
