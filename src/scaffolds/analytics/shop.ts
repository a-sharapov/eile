import type {
  AnalyticsSet,
  SetSample,
} from '../../contexts/analytics/index.ts';
import type { ManagerLanguage } from '../../shared/kernel/manager-language.ts';
import { labelParts, labelSchema, referrerRules, wordsIn } from './sources.ts';

const _TEXT = {
  ru: {
    title: 'Магазин',
    description:
      'Интернет-магазин: заход, товар в корзине, оплаты заказов и возвраты, опрос «Откуда вы узнали?»; без пробного периода и продлений.',
    sender: 'Магазин',
    senderNote:
      'Магазин, который шлёт события: переименуйте под себя и выпустите ключ',
    visit: 'Заход в магазин',
    paid: 'Оплата заказа',
    refunded: 'Возврат заказа',
    cart: 'Товар в корзине',
    items: 'Товаров в заказе',
    milestone: 'Корзина',
    milestoneNote: 'Товар в корзине в первые сутки после прихода',
    path: 'Путь к покупке',
  },
  en: {
    title: 'Shop',
    description:
      'An online shop: a visit, an item in the cart, order payments and refunds, the question “How did you hear about us?”; no trial and no renewals.',
    sender: 'Shop',
    senderNote: 'The shop that sends the events: rename it and issue a key',
    visit: 'Shop visit',
    paid: 'Order paid',
    refunded: 'Order refunded',
    cart: 'Added to cart',
    items: 'Items in the order',
    milestone: 'Cart',
    milestoneNote: 'An item in the cart within a day of arrival',
    path: 'Path to purchase',
  },
  de: {
    title: 'Onlineshop',
    description:
      'Ein Onlineshop: Besuch, Artikel im Warenkorb, bezahlte und erstattete Bestellungen, die Frage „Wie haben Sie von uns erfahren?“; ohne Testphase und Verlängerungen.',
    sender: 'Shop',
    senderNote:
      'Der Shop, der die Ereignisse sendet: umbenennen und einen Schlüssel ausstellen',
    visit: 'Shop-Besuch',
    paid: 'Bestellung bezahlt',
    refunded: 'Bestellung erstattet',
    cart: 'In den Warenkorb gelegt',
    items: 'Artikel in der Bestellung',
    milestone: 'Warenkorb',
    milestoneNote: 'Ein Artikel im Warenkorb am ersten Tag nach dem Zugang',
    path: 'Weg zum Kauf',
  },
} as const satisfies Record<ManagerLanguage, Record<string, string>>;

const _set = (language: ManagerLanguage): AnalyticsSet =>
  ((text, words) => ({
    format: 'eile-analytics-set',
    version: 1,
    name: text.title,
    senders: [
      {
        code: 'shop',
        name: text.sender,
        note: text.senderNote,
        enabled: true,
        summaryAt: '06:00',
      },
    ],
    dictionaries: labelParts(words),
    properties: [
      {
        scope: 'event',
        code: 'item_count',
        name: text.items,
        kind: 'number',
        dimension: true,
      },
    ],
    types: [
      { sender: 'shop', code: 'shop_visit', name: text.visit, role: 'touch' },
      {
        sender: 'shop',
        code: 'source_answer',
        name: words.answered,
        role: 'survey',
      },
      {
        sender: 'shop',
        code: 'order_paid',
        name: text.paid,
        role: 'payment',
        properties: [{ code: 'item_count' }],
      },
      {
        sender: 'shop',
        code: 'order_refunded',
        name: text.refunded,
        role: 'refund',
        properties: [{ code: 'item_count' }],
      },
      { sender: 'shop', code: 'fee_known', name: words.fee, role: 'amendment' },
      { sender: 'shop', code: 'cart_added', name: text.cart, role: 'action' },
      {
        sender: 'shop',
        code: 'daily_summary',
        name: words.summary,
        role: 'summary',
      },
      {
        sender: 'shop',
        code: 'customer_deleted',
        name: words.deleted,
        role: 'erasure',
      },
    ],
    schemas: [labelSchema('shop', words)],
    referrers: referrerRules(words),
    milestones: [
      {
        code: 'cart',
        name: text.milestone,
        note: text.milestoneNote,
        sender: 'shop',
        type: 'cart_added',
        days: 1,
      },
    ],
    funnels: [
      {
        code: 'path',
        name: text.path,
        main: true,
        steps: [
          { kind: 'visits', page: null },
          { kind: 'goal', goal: 'go:' },
          { kind: 'arrival' },
          { kind: 'milestone', milestone: 'cart' },
          { kind: 'payment', number: 1 },
          { kind: 'payment', number: 2 },
        ],
      },
    ],
  }))(_TEXT[language], wordsIn(language));

/** «Магазин»: заход, корзина, оплаты и возвраты заказов — без пробного периода и конца доступа. */
export var SHOP_SAMPLE: SetSample = {
  code: 'shop',
  title: { ru: _TEXT.ru.title, en: _TEXT.en.title, de: _TEXT.de.title },
  description: {
    ru: _TEXT.ru.description,
    en: _TEXT.en.description,
    de: _TEXT.de.description,
  },
  set: _set,
};
