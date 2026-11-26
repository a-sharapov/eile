import type {
  AnalyticsSet,
  SetSample,
} from '../../contexts/analytics/index.ts';
import type { ManagerLanguage } from '../../shared/kernel/manager-language.ts';
import { labelParts, labelSchema, referrerRules, wordsIn } from './sources.ts';

const _TEXT = {
  ru: {
    title: 'Подписка',
    description:
      'Бот, приложение или сайт с подпиской: регистрация, пробный период, оплаты и продления, конец доступа, ключевое действие и опрос «Откуда вы узнали?».',
    sender: 'Приложение',
    senderNote:
      'Бот, приложение или сайт, который шлёт события: переименуйте под себя и выпустите ключ',
    signup: 'Регистрация',
    trial: 'Начало пробного периода',
    paid: 'Оплата подписки',
    refunded: 'Возврат',
    ended: 'Конец доступа',
    action: 'Ключевое действие',
    actionNote:
      'Действие, ради которого пользуются продуктом: первый отчёт, первый заказ, первый урок',
    plan: 'Тариф',
    month: 'Месяц',
    year: 'Год',
    activated: 'Активация',
    activatedNote: 'Ключевое действие в первые три дня после прихода',
    path: 'Путь к подписке',
  },
  en: {
    title: 'Subscription',
    description:
      'A bot, an app or a site with a subscription: sign-up, trial, payments and renewals, end of access, a key action and the question “How did you hear about us?”.',
    sender: 'App',
    senderNote:
      'The bot, app or site that sends the events: rename it and issue a key',
    signup: 'Sign-up',
    trial: 'Trial started',
    paid: 'Subscription paid',
    refunded: 'Refund',
    ended: 'Access ended',
    action: 'Key action',
    actionNote:
      'The action the product is used for: the first report, order or lesson',
    plan: 'Plan',
    month: 'Monthly',
    year: 'Yearly',
    activated: 'Activation',
    activatedNote: 'A key action within three days of arrival',
    path: 'Path to subscription',
  },
  de: {
    title: 'Abonnement',
    description:
      'Ein Bot, eine App oder eine Website mit Abo: Registrierung, Testphase, Zahlungen und Verlängerungen, Ende des Zugangs, eine Schlüsselaktion und die Frage „Wie haben Sie von uns erfahren?“.',
    sender: 'App',
    senderNote:
      'Der Bot, die App oder die Website, die die Ereignisse sendet: umbenennen und einen Schlüssel ausstellen',
    signup: 'Registrierung',
    trial: 'Testphase begonnen',
    paid: 'Abo bezahlt',
    refunded: 'Erstattung',
    ended: 'Zugang beendet',
    action: 'Schlüsselaktion',
    actionNote:
      'Die Aktion, für die das Produkt genutzt wird: der erste Bericht, die erste Bestellung, die erste Lektion',
    plan: 'Tarif',
    month: 'Monatlich',
    year: 'Jährlich',
    activated: 'Aktivierung',
    activatedNote:
      'Eine Schlüsselaktion in den ersten drei Tagen nach dem Zugang',
    path: 'Weg zum Abo',
  },
} as const satisfies Record<ManagerLanguage, Record<string, string>>;

const _set = (language: ManagerLanguage): AnalyticsSet =>
  ((text, words) => ({
    format: 'eile-analytics-set',
    version: 1,
    name: text.title,
    senders: [
      {
        code: 'app',
        name: text.sender,
        note: text.senderNote,
        enabled: true,
        summaryAt: '06:00',
      },
    ],
    dictionaries: [
      {
        code: 'plan',
        name: text.plan,
        purpose: 'values',
        values: [
          { code: 'per-month', name: text.month },
          { code: 'per-year', name: text.year },
        ],
      },
      ...labelParts(words),
    ],
    properties: [
      {
        scope: 'event',
        code: 'plan',
        name: text.plan,
        kind: 'choice',
        dictionary: 'plan',
        dimension: true,
      },
    ],
    types: [
      { sender: 'app', code: 'signup', name: text.signup, role: 'touch' },
      {
        sender: 'app',
        code: 'source_answer',
        name: words.answered,
        role: 'survey',
      },
      { sender: 'app', code: 'trial_started', name: text.trial, role: 'trial' },
      {
        sender: 'app',
        code: 'subscription_paid',
        name: text.paid,
        role: 'payment',
        properties: [{ code: 'plan' }],
      },
      {
        sender: 'app',
        code: 'subscription_refunded',
        name: text.refunded,
        role: 'refund',
        properties: [{ code: 'plan' }],
      },
      { sender: 'app', code: 'fee_known', name: words.fee, role: 'amendment' },
      {
        sender: 'app',
        code: 'access_ended',
        name: text.ended,
        role: 'lapse',
        properties: [{ code: 'plan' }],
      },
      {
        sender: 'app',
        code: 'key_action',
        name: text.action,
        note: text.actionNote,
        role: 'action',
      },
      {
        sender: 'app',
        code: 'daily_summary',
        name: words.summary,
        role: 'summary',
      },
      {
        sender: 'app',
        code: 'user_deleted',
        name: words.deleted,
        role: 'erasure',
      },
    ],
    schemas: [labelSchema('app', words)],
    referrers: referrerRules(words),
    milestones: [
      {
        code: 'activated',
        name: text.activated,
        note: text.activatedNote,
        sender: 'app',
        type: 'key_action',
        days: 3,
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
          { kind: 'trial' },
          { kind: 'milestone', milestone: 'activated' },
          { kind: 'payment', number: 1 },
          { kind: 'payment', number: 2 },
        ],
      },
    ],
  }))(_TEXT[language], wordsIn(language));

/** «Подписка»: бот, приложение или сайт с пробным периодом, оплатами, продлениями и концом доступа. */
export var SUBSCRIPTION_SAMPLE: SetSample = {
  code: 'subscription',
  title: { ru: _TEXT.ru.title, en: _TEXT.en.title, de: _TEXT.de.title },
  description: {
    ru: _TEXT.ru.description,
    en: _TEXT.en.description,
    de: _TEXT.de.description,
  },
  set: _set,
};
