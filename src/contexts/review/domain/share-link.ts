import { fail } from '../../../shared/kernel/errors.ts';

/**
 * Что показывает ссылка: неопубликованную страницу как есть или страницу с правками набора, ещё не
 * принятыми.
 */
export type LinkTarget = {
  readonly page: number;
  readonly changeSet: number | null;
};

/**
 * Ссылка предпросмотра: секрет в адресе `/_cms/preview/<токен>`. Токен — открытая часть для поиска
 * (selector) и секрет (verifier); в базе — selector и хэш секрета.
 */
export type ShareLink = {
  readonly id: number;
  readonly selector: string;
  readonly verifierHash: string;
  readonly target: LinkTarget;
  readonly label: string;
  readonly createdBy: { readonly id: number; readonly name: string } | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
  readonly uses: number;
};

/** Срок ссылки в днях: по умолчанию — из настроек, не больше 90. */
export var LINK_DAYS = { fallback: 7, max: 90 } as const;

// selector — 12 знаков base64url (72 бита), verifier — 32 (192 бита).
export var SELECTOR_LENGTH = 12;
export var VERIFIER_LENGTH = 32;

const _TOKEN = new RegExp(
  `^[A-Za-z0-9_-]{${SELECTOR_LENGTH + VERIFIER_LENGTH}}$`
);

export var parseDays = (raw: unknown, fallback: number): number =>
  raw === undefined || raw === null || raw === ''
    ? fallback
    : Number.isSafeInteger(Number(raw)) &&
        Number(raw) >= 1 &&
        Number(raw) <= LINK_DAYS.max
      ? Number(raw)
      : fail(
          'review.invalid_days',
          `A preview link lives 1–${LINK_DAYS.max} days`
        );

/** Токен из адреса → его части; чужой формат — null, в базу за ним не ходим. */
export var splitToken = (
  raw: string
): { readonly selector: string; readonly verifier: string } | null =>
  _TOKEN.test(raw)
    ? {
        selector: raw.slice(0, SELECTOR_LENGTH),
        verifier: raw.slice(SELECTOR_LENGTH),
      }
    : null;

export var expiresAt = (from: Date, days: number): string =>
  new Date(from.getTime() + days * 86_400_000).toISOString();

export var isLive = (link: Pick<ShareLink, 'expiresAt'>, at: string): boolean =>
  link.expiresAt > at;

const _MAX_LABEL = 120;

export var parseLabel = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().slice(0, _MAX_LABEL) : '';
