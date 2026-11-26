import { fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS, isCode } from './codes.ts';
import type { SetupAuthor, SetupLogDraft } from './setup.ts';

/** Ключ отправителя на сервере: сам ключ показан один раз, здесь — его хэш, подпись и последние знаки. */
export type SenderKey = {
  readonly id: number;
  /** Код отправителя, а не номер строки: восстановленная чужая копия не подпишет ключом другого отправителя. */
  readonly sender: string;
  readonly label: string;
  /** SHA-256 ключа, hex. */
  readonly hash: string;
  /** Последние четыре знака: узнать ключ в списке. */
  readonly hint: string;
  readonly createdAt: string;
  readonly usedAt: string | null;
};

export type SenderKeyView = Omit<SenderKey, 'hash'>;

/** Ключ в файле настроек сервера: хэш и код отправителя, без номера строки. */
export type CarriedSenderKey = {
  readonly sender: string;
  readonly label: string;
  readonly keyHash: string;
  readonly hint: string;
  readonly createdAt: string;
};

/** Приставка помогает сканерам секретов, как `cms_` у ключей API и `mail_` у токенов шлюза. */
export var SENDER_KEY_PREFIX = 'evk_';

export var KEY_LIMITS = { perSender: 3, label: 100 } as const;

/** «Когда пользовались» пишется не чаще раза в пять минут: приём не пишет в базу ради отметки на каждом событии. */
export var KEY_TOUCH_MS = 5 * 60_000;

const _HASH = /^[0-9a-f]{64}$/;

/** Вид ключа без хэша: поля перечислены явно, и ключ с хэшем, переданный как вид, хэша не отдаст. */
export var keyView = (key: SenderKeyView): SenderKeyView => ({
  id: key.id,
  sender: key.sender,
  label: key.label,
  hint: key.hint,
  createdAt: key.createdAt,
  usedAt: key.usedAt,
});

/**
 * Строка журнала настройки о ключе: выпущен (`created`) или отозван (`removed`). Ключ строки — `отправитель/номер`,
 * было или стало — вид ключа: подпись, последние знаки и даты, без самого ключа и хэша.
 */
export var keyLog = (
  action: 'created' | 'removed',
  key: SenderKeyView,
  author: SetupAuthor | null,
  at: string
): SetupLogDraft => ({
  at,
  author,
  item: 'key',
  key: `${key.sender}/${key.id}`,
  action,
  before: action === 'removed' ? keyView(key) : null,
  after: action === 'created' ? keyView(key) : null,
});

/** Подпись ключа: 1–100 знаков; не дали — подпись по умолчанию. */
export var keyLabel = (raw: unknown, fallback: string): string =>
  raw === undefined || raw === null || raw === ''
    ? fallback
    : typeof raw === 'string' &&
        raw.trim() !== '' &&
        [...raw.trim()].length <= KEY_LIMITS.label
      ? raw.trim()
      : fail(
          'analytics.invalid_item',
          `The key label is 1 to ${KEY_LIMITS.label} characters`
        );

/** Пора ли записать «когда пользовались». */
export var staleUse = (key: SenderKey, now: string): boolean =>
  key.usedAt === null ||
  Date.parse(now) - Date.parse(key.usedAt) >= KEY_TOUCH_MS;

const _carried = (raw: unknown): CarriedSenderKey =>
  ((_) =>
    isCode(_.sender, CODE_LIMITS.sender) &&
    typeof _.label === 'string' &&
    typeof _.keyHash === 'string' &&
    _HASH.test(_.keyHash) &&
    typeof _.hint === 'string' &&
    typeof _.createdAt === 'string'
      ? (_ as CarriedSenderKey)
      : fail('analytics.invalid_settings', 'A sender key entry is not valid'))(
    (raw ?? {}) as Record<string, unknown>
  );

/** Ключи из файла настроек сервера: список проверенных записей. */
export var readCarriedKeys = (raw: unknown): CarriedSenderKey[] =>
  Array.isArray(raw)
    ? raw.map(_carried)
    : fail('analytics.invalid_settings', 'Sender keys are not a list');
