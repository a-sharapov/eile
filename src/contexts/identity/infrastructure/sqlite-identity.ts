import type { Database, Migration } from '../../../platform/database.ts';
import type {
  PasswordHasher,
  PasswordResetRepository,
  SessionRepository,
  Tokens,
  UserRepository,
} from '../domain/ports.ts';
import {
  type Email,
  parseUserId,
  type Role,
  type User,
} from '../domain/user.ts';

export var identityMigrations: readonly Migration[] = [
  {
    id: 'identity/001_users_sessions',
    sql: `
      CREATE TABLE identity_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE identity_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES identity_users (id),
        expires_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX identity_sessions_user ON identity_sessions (user_id);
    `,
  },
  {
    id: 'identity/002_password_resets',
    sql: `
      CREATE TABLE identity_password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES identity_users (id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX identity_password_resets_user ON identity_password_resets (user_id);
    `,
  },
];

/** Таблицы этого сервера, а не сайта: в копию не попадают, при восстановлении остаются свои. */
export var IDENTITY_SERVER_TABLES = [
  'identity_sessions',
  'identity_password_resets',
] as const;

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  password_hash: string;
};

const _toUser = (row: UserRow | null): User | null =>
  row && {
    id: parseUserId(row.id),
    email: row.email as Email,
    name: row.name,
    role: row.role as Role,
    passwordHash: row.password_hash,
  };

export var defineUserRepository = (db: Database): UserRepository => {
  const sequence = db.query<{ seq: number }, []>(
    "SELECT seq FROM sqlite_sequence WHERE name = 'identity_users'"
  );
  const byId = db.query<UserRow, [number]>(
    'SELECT * FROM identity_users WHERE id = ?'
  );
  const byEmail = db.query<UserRow, [string]>(
    'SELECT * FROM identity_users WHERE email = ?'
  );
  const all = db.query<UserRow, []>('SELECT * FROM identity_users ORDER BY id');
  const total = db.query<{ n: number }, []>(
    'SELECT count(*) AS n FROM identity_users'
  );
  const upsert = db.query(`
    INSERT INTO identity_users (id, email, name, role, password_hash, created_at)
    VALUES ($id, $email, $name, $role, $passwordHash, $now)
    ON CONFLICT (id) DO UPDATE SET
      email = excluded.email, name = excluded.name, role = excluded.role,
      password_hash = excluded.password_hash`);
  const remove = db.query('DELETE FROM identity_users WHERE id = ?');

  return {
    nextId: () => parseUserId((sequence.get()?.seq ?? 0) + 1),
    get: (id) => _toUser(byId.get(id)),
    byEmail: (email) => _toUser(byEmail.get(email)),
    all: () => all.all().map((_) => _toUser(_)!),
    count: () => total.get()?.n ?? 0,
    save: (user) =>
      void upsert.run({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash: user.passwordHash,
        now: new Date().toISOString(),
      }),
    remove: (id) => void remove.run(id),
  };
};

type SessionRow = { token_hash: string; user_id: number; expires_at: string };

export var defineSessionRepository = (db: Database): SessionRepository => {
  const get = db.query<SessionRow, [string]>(
    'SELECT * FROM identity_sessions WHERE token_hash = ?'
  );
  const insert = db.query(
    'INSERT INTO identity_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
  );
  const remove = db.query('DELETE FROM identity_sessions WHERE token_hash = ?');
  const removeOf = db.query('DELETE FROM identity_sessions WHERE user_id = ?');
  const removeExpired = db.query(
    'DELETE FROM identity_sessions WHERE expires_at <= ?'
  );

  return {
    get: (tokenHash) => {
      const row = get.get(tokenHash);
      return (
        row && {
          tokenHash: row.token_hash,
          userId: parseUserId(row.user_id),
          expiresAt: row.expires_at,
        }
      );
    },
    save: (session) =>
      void insert.run(session.tokenHash, session.userId, session.expiresAt),
    remove: (tokenHash) => void remove.run(tokenHash),
    removeOf: (userId) => void removeOf.run(userId),
    removeExpired: (at) => void removeExpired.run(at),
  };
};

type ResetRow = { token_hash: string; user_id: number; expires_at: string };

export var definePasswordResetRepository = (
  db: Database
): PasswordResetRepository => {
  const get = db.query<ResetRow, [string]>(
    'SELECT * FROM identity_password_resets WHERE token_hash = ?'
  );
  const insert = db.query(
    'INSERT INTO identity_password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
  );
  const removeOf = db.query(
    'DELETE FROM identity_password_resets WHERE user_id = ?'
  );
  const removeExpired = db.query(
    'DELETE FROM identity_password_resets WHERE expires_at <= ?'
  );

  return {
    get: (tokenHash) =>
      ((row) =>
        row && {
          tokenHash: row.token_hash,
          userId: parseUserId(row.user_id),
          expiresAt: row.expires_at,
        })(get.get(tokenHash)),
    save: (reset) =>
      void insert.run(reset.tokenHash, reset.userId, reset.expiresAt),
    removeOf: (userId) => void removeOf.run(userId),
    removeExpired: (at) => void removeExpired.run(at),
  };
};

export var bunPasswordHasher: PasswordHasher = {
  hash: (password) => Bun.password.hash(password, { algorithm: 'argon2id' }),
  verify: (password, hash) => Bun.password.verify(password, hash),
};

// 32 байта случайности — 256 бит: токен не угадать, в cookie он идёт в base64url.
export var cryptoTokens: Tokens = {
  issue: () =>
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
      'base64url'
    ),
  hash: (token) => new Bun.CryptoHasher('sha256').update(token).digest('hex'),
};
