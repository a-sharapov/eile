import { fail } from '../../../shared/kernel/errors.ts';

/**
 * Защита формы доказательством работы (ADR 0053): браузер перебирает числа, пока SHA-256(соль + число) не
 * совпадёт с хэшем задачи. `off` — без задачи, остальное — сложность: сколько чисел в худшем случае.
 */
export type ProofLevel = 'off' | 'light' | 'standard' | 'strong';

export type ProofDifficulty = Exclude<ProofLevel, 'off'>;

/**
 * Предел числа задачи: секретное число равномерно от 0 до него, перебор в среднем — половина. По замерам
 * ADR 0053 на телефоне средней мощности (Chrome, замедление ×4) в среднем 0,06, 0,17 и 0,42 с, в худшем
 * случае до 0,8 с.
 */
export var PROOF_LIMITS: Readonly<Record<ProofDifficulty, number>> = {
  light: 50_000,
  standard: 200_000,
  strong: 400_000,
};

export var PROOF_LEVELS: readonly ProofLevel[] = [
  'off',
  'light',
  'standard',
  'strong',
];

/** У новой формы защита включена; у формы, сохранённой до неё, — выключена, пока её не включат. */
export var PROOF_DEFAULTS = { created: 'standard', stored: 'off' } as const;

export var parseProofLevel = (value: unknown): ProofLevel =>
  PROOF_LEVELS.includes(value as ProofLevel)
    ? (value as ProofLevel)
    : fail(
        'forms.invalid_proof',
        `Spam protection is one of ${PROOF_LEVELS.join(', ')}`
      );

/** Задача для браузера: подпись сервера связывает её с формой, печатью и сроком — хранить её не нужно. */
export type Challenge = {
  readonly algorithm: 'SHA-256';
  /** 16 знаков base64url. */
  readonly salt: string;
  readonly max: number;
  /** Срок в миллисекундах эпохи — как момент печати. */
  readonly expires: number;
  /** SHA-256(соль + секретное число), hex. */
  readonly hash: string;
  /** HMAC задачи вместе с формой и печатью, base64url. */
  readonly signature: string;
};

/** Решение из поля `_proof`: задача, как её выдали, и найденное число. */
export type Solution = Challenge & { readonly number: number };

/** Исход проверки: `missing` — решения нет, `nojs` — его нет, а браузер сказал, что JS выключен. */
export type ProofCheck = 'valid' | 'invalid' | 'expired' | 'missing' | 'nojs';

/** Задача строкой — для атрибута `data-proof` формы: `SHA-256.соль.max.срок.хэш.подпись`. */
export var challengeText = (challenge: Challenge): string =>
  [
    challenge.algorithm,
    challenge.salt,
    challenge.max,
    challenge.expires,
    challenge.hash,
    challenge.signature,
  ].join('.');

const _SOLUTION =
  /^SHA-256\.([A-Za-z0-9_-]{16})\.(\d{1,7})\.(\d{1,15})\.([0-9a-f]{64})\.([A-Za-z0-9_-]{43})\.(\d{1,7})$/;

/** Решение, которое прислал браузер: задача и через точку число; не того вида — null. */
export var parseSolution = (raw: string): Solution | null =>
  ((match) =>
    match
      ? {
          algorithm: 'SHA-256' as const,
          salt: match[1]!,
          max: Number(match[2]),
          expires: Number(match[3]),
          hash: match[4]!,
          signature: match[5]!,
          number: Number(match[6]),
        }
      : null)(_SOLUTION.exec(raw));

/** Поле решения: пустое в разметке, его заполняет скрипт формы. */
export var PROOF_FIELD = '_proof';

/** Поле внутри `<noscript>`: его присылает только браузер с выключенным JS. */
export var NO_SCRIPT_FIELD = '_nojs';
