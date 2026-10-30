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

export type PasswordHasher = {
  readonly hash: (password: string) => Promise<string>;
  readonly verify: (password: string, hash: string) => Promise<boolean>;
};

export type Tokens = {
  /** Случайный токен для cookie. */
  readonly issue: () => string;
  readonly hash: (token: string) => string;
};
