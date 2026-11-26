import type { AnalyticsSet } from '../../src/contexts/analytics/index.ts';

/**
 * Набор «Подписка» сайта-образца: бот в Telegram продаёт подписку. Отправитель, справочники, свойства и признак, типы
 * событий; части метки («Платная» ждёт расхода), схема `bot`, соответствия рефереров, переход `trial`, веха
 * `activation` и воронка `journey` — те, на которых стоят примеры и ручные цифры ADR 0072.
 */
export var SUBSCRIPTION: AnalyticsSet = {
  format: 'eile-analytics-set',
  version: 1,
  name: 'Подписка (сайт-образец)',
  senders: [
    {
      code: 'bot',
      name: 'Бот подписки',
      note: 'Telegram: старт, опрос, пробный период, оплаты и задания',
    },
  ],
  dictionaries: [
    {
      code: 'plan',
      name: 'Тариф',
      purpose: 'values',
      values: [
        { code: '1m', name: '1 месяц' },
        { code: '3m', name: '3 месяца' },
      ],
    },
    {
      code: 'format',
      name: 'Формат',
      purpose: 'values',
      values: [
        { code: 'self', name: 'Самостоятельно' },
        { code: 'feedback', name: 'С обратной связью наставника' },
      ],
    },
    {
      code: 'lang',
      name: 'Язык',
      purpose: 'values',
      values: [
        { code: 'ru', name: 'Русский' },
        { code: 'pl', name: 'Polski' },
      ],
    },
    {
      code: 'heard_from',
      name: 'Откуда вы узнали?',
      note: 'Опрос после первого задания',
      purpose: 'answers',
      values: [
        { code: 'ig-reels', name: 'Reels в Instagram' },
        { code: 'ig-posts', name: 'Посты в Instagram' },
        { code: 'ig-ads', name: 'Реклама в Instagram' },
        { code: 'friend', name: 'Посоветовали знакомые' },
        { code: 'blogger', name: 'У блогера' },
        { code: 'search', name: 'Поиск' },
        { code: 'tg', name: 'Telegram' },
        { code: 'other', name: 'Другое' },
      ],
    },
    // Части метки бота: 10 + 10 + 8 + 16 + 10 = 54 знака и 8 на разделители — 62 из 64.
    {
      code: 'entry',
      name: 'Вход',
      note: 'Где нажали: кнопка пробного периода, пост, ссылка в профиле',
      purpose: 'parts',
      length: 10,
      values: [
        { code: 'w-trial', name: 'Кнопка «Попробовать»' },
        { code: 'post', name: 'Пост' },
        { code: 'bio', name: 'Ссылка в профиле' },
      ],
    },
    {
      code: 'source',
      name: 'Источник',
      purpose: 'parts',
      utm: 'utm_source',
      length: 10,
      values: [
        { code: 'ig', name: 'Instagram' },
        { code: 'fb', name: 'Facebook' },
        { code: 'google', name: 'Google' },
        { code: 'tg', name: 'Telegram' },
        { code: 'direct', name: 'Прямой заход' },
      ],
    },
    {
      code: 'channel',
      name: 'Тип',
      purpose: 'parts',
      utm: 'utm_medium',
      length: 8,
      values: [
        // На платную рекламу деньги тратятся всегда: месяц без расхода «Расходы» подсказывают ввести.
        { code: 'paid', name: 'Платная', awaitsSpend: true },
        { code: 'organic', name: 'Органика' },
        { code: 'seo', name: 'Поиск' },
        { code: 'referral', name: 'Ссылка с сайта' },
        { code: 'direct', name: 'Прямой заход' },
      ],
    },
    {
      code: 'campaign',
      name: 'Кампания',
      purpose: 'parts',
      utm: 'utm_campaign',
      length: 16,
      values: [{ code: 'autumn', name: 'Осень' }],
    },
    {
      code: 'creative',
      name: 'Креатив',
      purpose: 'parts',
      utm: 'utm_content',
      length: 10,
      values: [
        { code: 'ad-1', name: 'Объявление 1' },
        { code: 'ad-2', name: 'Объявление 2' },
      ],
    },
  ],
  properties: [
    {
      scope: 'event',
      code: 'plan',
      name: 'Тариф',
      kind: 'choice',
      dictionary: 'plan',
      dimension: true,
    },
    {
      scope: 'event',
      code: 'format',
      name: 'Формат',
      kind: 'choice',
      dictionary: 'format',
      dimension: true,
    },
    {
      scope: 'event',
      code: 'items_n',
      name: 'Шагов в задании',
      kind: 'number',
    },
    {
      scope: 'event',
      code: 'own_material',
      name: 'Со своим материалом',
      kind: 'boolean',
      dimension: true,
    },
    {
      scope: 'person',
      code: 'lang',
      name: 'Язык',
      kind: 'choice',
      dictionary: 'lang',
      dimension: true,
    },
  ],
  types: [
    { sender: 'bot', code: 'bot_start', name: 'Старт бота', role: 'touch' },
    {
      sender: 'bot',
      code: 'source_survey',
      name: 'Опрос «Откуда вы узнали?»',
      role: 'survey',
    },
    {
      sender: 'bot',
      code: 'trial_started',
      name: 'Начало пробного периода',
      role: 'trial',
    },
    {
      sender: 'bot',
      code: 'purchase',
      name: 'Оплата',
      role: 'payment',
      properties: [
        { code: 'plan', required: true },
        { code: 'format', required: true },
      ],
    },
    {
      sender: 'bot',
      code: 'refund',
      name: 'Возврат',
      role: 'refund',
      properties: [{ code: 'plan' }, { code: 'format' }],
    },
    {
      sender: 'bot',
      code: 'fee_settled',
      name: 'Комиссия уточнена',
      role: 'amendment',
    },
    {
      sender: 'bot',
      code: 'access_ended',
      name: 'Конец доступа',
      role: 'lapse',
      properties: [{ code: 'plan' }, { code: 'format' }],
    },
    {
      sender: 'bot',
      code: 'task_done',
      name: 'Задание выполнено',
      role: 'action',
      properties: [
        { code: 'items_n', required: true },
        { code: 'own_material' },
      ],
    },
    {
      sender: 'bot',
      code: 'daily_summary',
      name: 'Сводка за день',
      role: 'summary',
    },
    {
      sender: 'bot',
      code: 'user_deleted',
      name: 'Удаление по просьбе',
      role: 'erasure',
    },
  ],
  schemas: [
    {
      sender: 'bot',
      name: 'Метка start-параметра',
      separator: '__',
      length: 64,
      parts: ['entry', 'source', 'channel', 'campaign', 'creative'],
    },
  ],
  referrers: [
    {
      code: 'instagram',
      name: 'Instagram',
      kind: 'host',
      host: 'instagram.com',
      parts: { source: 'ig', channel: 'organic' },
    },
    {
      code: 'google',
      name: 'Google',
      kind: 'host',
      host: 'google.*',
      parts: { source: 'google', channel: 'seo' },
    },
    {
      code: 'other-sites',
      name: 'Другие сайты',
      kind: 'any',
      parts: { source: '{host}', channel: 'referral' },
    },
    {
      code: 'no-referrer',
      name: 'Прямой заход',
      kind: 'none',
      parts: { source: 'direct', channel: 'direct' },
    },
  ],
  links: [
    {
      code: 'trial',
      name: 'Кнопка «Попробовать бесплатно»',
      sender: 'bot',
      target: 'https://t.me/sample_subscription_bot?start={label}',
      parts: { entry: 'w-trial' },
    },
  ],
  milestones: [
    {
      code: 'activation',
      name: 'Активация',
      note: 'Задание хотя бы из двух шагов за три дня',
      sender: 'bot',
      type: 'task_done',
      condition: { property: 'items_n', gte: 2 },
      days: 3,
    },
  ],
  funnels: [
    {
      code: 'journey',
      name: 'Путь к подписке',
      main: true,
      steps: [
        { kind: 'visits', page: null },
        { kind: 'goal', goal: 'go:' },
        { kind: 'arrival' },
        { kind: 'trial' },
        { kind: 'milestone', milestone: 'activation' },
        { kind: 'payment', number: 1 },
        { kind: 'payment', number: 2 },
      ],
    },
  ],
};
