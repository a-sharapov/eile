import type { Database } from '../../../platform/database.ts';
import { SENDER_KEY_PREFIX, type SenderKey } from '../domain/keys.ts';
import type { AnalyticsCrypto, SenderKeyRepository } from '../domain/ports.ts';

const _utf8 = new TextEncoder();

const _sha256 = (text: string) => new Bun.CryptoHasher('sha256').update(text);

// 32 случайных байта — 256 бит: ключ не угадать и не перебрать; в заголовке он идёт в base64url (43 знака).
export var cryptoAnalytics: AnalyticsCrypto = {
  issue: () =>
    `${SENDER_KEY_PREFIX}${crypto
      .getRandomValues(new Uint8Array(32))
      .toBase64({ alphabet: 'base64url', omitPadding: true })}`,
  hash: (text) => _sha256(text).digest('hex'),
  fingerprint: (text) => _sha256(text).digest('base64url'),
  // timingSafeEqual требует равной длины; хэши sha256 в hex всегда по 64 знака.
  same: (a, b) =>
    a.length === b.length &&
    crypto.timingSafeEqual(_utf8.encode(a), _utf8.encode(b)),
};

type KeyRow = {
  readonly id: number;
  readonly sender: string;
  readonly label: string;
  readonly hash: string;
  readonly hint: string;
  readonly created_at: string;
  readonly used_at: string | null;
};

const _key = (_: KeyRow): SenderKey => ({
  id: _.id,
  sender: _.sender,
  label: _.label,
  hash: _.hash,
  hint: _.hint,
  createdAt: _.created_at,
  usedAt: _.used_at,
});

export var defineSenderKeyRepository = (db: Database): SenderKeyRepository => {
  const all = db.query<KeyRow, []>(
    'SELECT id, sender, label, hash, hint, created_at, used_at FROM analytics_sender_keys ORDER BY sender, id'
  );
  const insert = db.query<
    KeyRow,
    [string, string, string, string, string, string | null]
  >(`
    INSERT INTO analytics_sender_keys (sender, label, hash, hint, created_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id, sender, label, hash, hint, created_at, used_at`);
  const remove = db.query<unknown, [string, number]>(
    'DELETE FROM analytics_sender_keys WHERE sender = ? AND id = ?'
  );
  const touch = db.query<unknown, [string, number]>(
    'UPDATE analytics_sender_keys SET used_at = ? WHERE id = ?'
  );
  const byHash = db.query<{ found: number }, [string]>(
    'SELECT 1 AS found FROM analytics_sender_keys WHERE hash = ?'
  );
  return {
    all: () => all.all().map(_key),
    add: (key) =>
      _key(
        insert.get(
          key.sender,
          key.label,
          key.hash,
          key.hint,
          key.createdAt,
          key.usedAt
        )!
      ),
    remove: (sender, id) => remove.run(sender, id).changes > 0,
    touch: (id, at) => void touch.run(at, id),
    has: (hash) => byHash.get(hash) !== null,
  };
};
