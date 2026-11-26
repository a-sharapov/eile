import type { AnalyticsSet } from '../../contexts/analytics/index.ts';
import type { ManagerLanguage } from '../../shared/kernel/manager-language.ts';

/** Слова обоих образцов на языке менеджера: части метки, опрос, соответствия рефереров, служебные типы. */
type Words = {
  readonly source: string;
  readonly channel: string;
  readonly campaign: string;
  readonly campaignNote: string;
  readonly direct: string;
  readonly paid: string;
  readonly organic: string;
  readonly search: string;
  readonly referral: string;
  readonly heardFrom: string;
  readonly answers: Readonly<
    Record<'search' | 'social' | 'friends' | 'ads' | 'other', string>
  >;
  readonly answered: string;
  readonly fee: string;
  readonly summary: string;
  readonly deleted: string;
  readonly label: string;
  readonly googleSearch: string;
  readonly otherSites: string;
  readonly directVisit: string;
};

const _WORDS: Readonly<Record<ManagerLanguage, Words>> = {
  ru: {
    source: 'Источник',
    channel: 'Тип',
    campaign: 'Кампания',
    campaignNote: 'Значения — ваши кампании: заведите их перед выдачей меток',
    direct: 'Прямой заход',
    paid: 'Платная',
    organic: 'Органика',
    search: 'Поиск',
    referral: 'Ссылка с сайта',
    heardFrom: 'Откуда вы узнали?',
    answers: {
      search: 'Поиск',
      social: 'Соцсети',
      friends: 'Посоветовали знакомые',
      ads: 'Реклама',
      other: 'Другое',
    },
    answered: 'Ответ «Откуда вы узнали?»',
    fee: 'Комиссия уточнена',
    summary: 'Сводка за сутки',
    deleted: 'Удаление по просьбе',
    label: 'Метка',
    googleSearch: 'Поиск Google',
    otherSites: 'Другие сайты',
    directVisit: 'Прямой заход',
  },
  en: {
    source: 'Source',
    channel: 'Channel',
    campaign: 'Campaign',
    campaignNote:
      'Its values are your campaigns: add them before issuing labels',
    direct: 'Direct',
    paid: 'Paid',
    organic: 'Organic',
    search: 'Search',
    referral: 'Referral',
    heardFrom: 'How did you hear about us?',
    answers: {
      search: 'Search',
      social: 'Social media',
      friends: 'A friend told me',
      ads: 'An ad',
      other: 'Other',
    },
    answered: 'Answer “How did you hear about us?”',
    fee: 'Fee known',
    summary: 'Daily summary',
    deleted: 'Deletion on request',
    label: 'Label',
    googleSearch: 'Google search',
    otherSites: 'Other sites',
    directVisit: 'Direct visit',
  },
  de: {
    source: 'Quelle',
    channel: 'Kanal',
    campaign: 'Kampagne',
    campaignNote:
      'Die Werte sind Ihre Kampagnen: legen Sie sie an, bevor Sie Kennungen vergeben',
    direct: 'Direkt',
    paid: 'Bezahlt',
    organic: 'Organisch',
    search: 'Suche',
    referral: 'Verweis',
    heardFrom: 'Wie haben Sie von uns erfahren?',
    answers: {
      search: 'Suche',
      social: 'Soziale Medien',
      friends: 'Empfehlung',
      ads: 'Werbung',
      other: 'Sonstiges',
    },
    answered: 'Antwort „Wie haben Sie von uns erfahren?“',
    fee: 'Gebühr bekannt',
    summary: 'Tageszusammenfassung',
    deleted: 'Löschung auf Wunsch',
    label: 'Kennung',
    googleSearch: 'Google-Suche',
    otherSites: 'Andere Websites',
    directVisit: 'Direkter Aufruf',
  },
};

export var wordsIn = (language: ManagerLanguage): Words => _WORDS[language];

/** Части метки обоих образцов: источник и тип — из UTM, кампании у каждого сайта свои. */
export var labelParts = (
  words: Words
): NonNullable<AnalyticsSet['dictionaries']> => [
  {
    code: 'source',
    name: words.source,
    purpose: 'parts',
    utm: 'utm_source',
    length: 16,
    values: [
      { code: 'google', name: 'Google' },
      { code: 'instagram', name: 'Instagram' },
      { code: 'facebook', name: 'Facebook' },
      { code: 'telegram', name: 'Telegram' },
      { code: 'direct', name: words.direct },
    ],
  },
  {
    code: 'channel',
    name: words.channel,
    purpose: 'parts',
    utm: 'utm_medium',
    length: 16,
    values: [
      { code: 'paid', name: words.paid, awaitsSpend: true },
      { code: 'organic', name: words.organic },
      { code: 'search', name: words.search },
      { code: 'referral', name: words.referral },
      { code: 'direct', name: words.direct },
    ],
  },
  {
    code: 'campaign',
    name: words.campaign,
    note: words.campaignNote,
    purpose: 'parts',
    utm: 'utm_campaign',
    length: 24,
  },
  {
    code: 'heard_from',
    name: words.heardFrom,
    purpose: 'answers',
    values: (['search', 'social', 'friends', 'ads', 'other'] as const).map(
      (_) => ({ code: _, name: words.answers[_] })
    ),
  },
];

/** Схема метки отправителя: источник, тип, кампания — 16 + 16 + 24 и два разделителя из 64. */
export var labelSchema = (
  sender: string,
  words: Words
): NonNullable<AnalyticsSet['schemas']>[number] => ({
  sender,
  name: words.label,
  separator: '__',
  length: 64,
  parts: ['source', 'channel', 'campaign'],
});

/** Посещение без UTM: поиск, соцсети, другой сайт и прямой заход. */
export var referrerRules = (
  words: Words
): NonNullable<AnalyticsSet['referrers']> => [
  {
    code: 'google',
    name: words.googleSearch,
    kind: 'host',
    host: 'google.*',
    parts: { source: 'google', channel: 'search' },
  },
  {
    code: 'instagram',
    name: 'Instagram',
    kind: 'host',
    host: 'instagram.com',
    parts: { source: 'instagram', channel: 'organic' },
  },
  {
    code: 'facebook',
    name: 'Facebook',
    kind: 'host',
    host: 'facebook.com',
    parts: { source: 'facebook', channel: 'organic' },
  },
  {
    code: 'telegram',
    name: 'Telegram',
    kind: 'host',
    host: 't.me',
    parts: { source: 'telegram', channel: 'organic' },
  },
  {
    code: 'other-sites',
    name: words.otherSites,
    kind: 'any',
    parts: { source: '{host}', channel: 'referral' },
  },
  {
    code: 'no-referrer',
    name: words.directVisit,
    kind: 'none',
    parts: { source: 'direct', channel: 'direct' },
  },
];
