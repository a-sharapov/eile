/** Смысл события для отчётов. Ролей десять, их задаёт ядро; роль типа берётся из справочника при свёртке. */
export type EventRole =
  | 'touch'
  | 'survey'
  | 'trial'
  | 'payment'
  | 'refund'
  | 'amendment'
  | 'lapse'
  | 'action'
  | 'summary'
  | 'erasure';

/**
 * Вид поля роли в `data`: `label` — строка до 256 знаков, может быть пустой; `text` — чужой текст до 500;
 * `moment` — ISO 8601 с поясом; `amount` — деньги больше нуля, `fee` — деньги от нуля; `reference` — номер
 * платежа у отправителя; `day` — ГГГГ-ММ-ДД; `counts` — код типа → целое от нуля; `revenue` — валюта →
 * деньги; `count` — целое от нуля; `version` — строка до 64 знаков.
 */
export type RoleFieldKind =
  | 'label'
  | 'code'
  | 'text'
  | 'moment'
  | 'amount'
  | 'fee'
  | 'currency'
  | 'reference'
  | 'day'
  | 'counts'
  | 'revenue'
  | 'count'
  | 'version';

export type RoleField = {
  readonly code: string;
  readonly kind: RoleFieldKind;
  readonly required: boolean;
};

export type RoleSpec = {
  readonly role: EventRole;
  /** Сводка — счёт отправителя за день, а не человек: псевдоним у неё запрещён. */
  readonly subject: 'required' | 'forbidden';
  readonly fields: readonly RoleField[];
};

/** Роли в порядке экранов: от прихода человека к его уходу, служебные — в конце. */
export var EVENT_ROLES: readonly EventRole[] = [
  'touch',
  'survey',
  'trial',
  'payment',
  'refund',
  'amendment',
  'lapse',
  'action',
  'summary',
  'erasure',
];

const _field = (
  code: string,
  kind: RoleFieldKind,
  required = false
): RoleField => ({ code, kind, required });

export var ROLES: Readonly<Record<EventRole, RoleSpec>> = {
  touch: {
    role: 'touch',
    subject: 'required',
    fields: [_field('label', 'label')],
  },
  survey: {
    role: 'survey',
    subject: 'required',
    fields: [
      _field('question', 'code', true),
      _field('answer', 'code', true),
      _field('text', 'text'),
    ],
  },
  trial: {
    role: 'trial',
    subject: 'required',
    fields: [_field('ends_at', 'moment')],
  },
  payment: {
    role: 'payment',
    subject: 'required',
    fields: [
      _field('amount', 'amount', true),
      _field('currency', 'currency', true),
      _field('payment_id', 'reference'),
      _field('paid_until', 'moment'),
      _field('fee', 'fee'),
    ],
  },
  refund: {
    role: 'refund',
    subject: 'required',
    fields: [
      _field('amount', 'amount', true),
      _field('currency', 'currency', true),
      _field('payment_id', 'reference', true),
    ],
  },
  // Валюта уточнения — валюта оплаты с тем же payment_id, если её не прислали.
  amendment: {
    role: 'amendment',
    subject: 'required',
    fields: [
      _field('payment_id', 'reference', true),
      _field('fee', 'fee', true),
      _field('currency', 'currency'),
    ],
  },
  lapse: { role: 'lapse', subject: 'required', fields: [] },
  action: { role: 'action', subject: 'required', fields: [] },
  summary: {
    role: 'summary',
    subject: 'forbidden',
    fields: [
      _field('day', 'day', true),
      _field('counts', 'counts', true),
      _field('revenue', 'revenue'),
      _field('failed', 'count'),
      _field('version', 'version'),
    ],
  },
  erasure: { role: 'erasure', subject: 'required', fields: [] },
};
