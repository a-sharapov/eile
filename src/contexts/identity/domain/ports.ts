import type { Email, User, UserId } from './user.ts';

export type UserRepository = {
  readonly nextId: () => UserId;
  readonly get: (id: UserId) => User | null;
  readonly byEmail: (email: Email) => User | null;
  readonly all: () => User[];
  readonly count: () => number;
  readonly save: (user: User) => void;
  readonly remove: (id: UserId) => void;
};

/** Сессия хранится по хэшу токена: утечка базы не даёт войти. */
export type Session = {
  readonly tokenHash: string;
  readonly userId: UserId;
  readonly expiresAt: string;
};

export type SessionRepository = {
  readonly get: (tokenHash: string) => Session | null;
  readonly save: (session: Session) => void;
  readonly remove: (tokenHash: string) => void;
  readonly removeOf: (userId: UserId) => void;
  /** Сеансы, чей срок вышел к моменту `at`: в базе их не держим. */
  readonly removeExpired: (at: string) => void;
};

/** Ссылка сброса пароля: как сеанс, хранится по хэшу токена и действует до срока. */
export type PasswordReset = {
  readonly tokenHash: string;
  readonly userId: UserId;
  readonly expiresAt: string;
};

export type PasswordResetRepository = {
  readonly get: (tokenHash: string) => PasswordReset | null;
  readonly save: (reset: PasswordReset) => void;
  /** Все ссылки пользователя: новая отменяет прежние, использованная гасит остальные. */
  readonly removeOf: (userId: UserId) => void;
  readonly removeExpired: (at: string) => void;
};

export type PasswordHasher = {
  readonly hash: (password: string) => Promise<string>;
  readonly verify: (password: string, hash: string) => Promise<boolean>;
};

export type Tokens = {
  /** Случайный токен для cookie. */
  readonly issue: () => string;
  readonly hash: (token: string) => string;
};

/** Токен API: ключ агента или скрипта с правами пользователя; как сеанс, хранится по хэшу. */
export type ApiToken = {
  readonly id: number;
  readonly userId: UserId;
  /** Для чего токен: «Claude Code на ноутбуке». */
  readonly name: string;
  readonly tokenHash: string;
  /** Последние символы токена — узнать его в списке, не храня целиком. */
  readonly hint: string;
  readonly createdAt: string;
  readonly usedAt: string | null;
  /** Правки этим ключом не применяются, а ждут проверки владельца сайта (ADR 0054). */
  readonly review: boolean;
};

export type ApiTokenRepository = {
  readonly byHash: (tokenHash: string) => ApiToken | null;
  readonly of: (userId: UserId) => ApiToken[];
  readonly get: (id: number) => ApiToken | null;
  /** Только свой: чужому ключу проверку не сменить. */
  readonly setReview: (id: number, userId: UserId, on: boolean) => boolean;
  readonly add: (token: Omit<ApiToken, 'id'>) => number;
  readonly touch: (id: number, at: string) => void;
  /** Только свой: чужой токен по id не отозвать. */
  readonly remove: (id: number, userId: UserId) => boolean;
};
