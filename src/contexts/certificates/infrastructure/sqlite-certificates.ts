import type { Database } from '../../../platform/database.ts';
import { type CertificateState, domainsKey } from '../domain/certificate.ts';
import type {
  AccountRepository,
  CertificateRepository,
  Jwk,
} from '../domain/ports.ts';

type IssuedRow = {
  domains: string;
  chain: string | null;
  key: string | null;
  not_after: string | null;
  issued_at: string | null;
  last_attempt_at: string | null;
  last_error: string;
};

const _state = (row: IssuedRow): CertificateState => ({
  domains: row.domains.split(','),
  certificate:
    row.chain && row.key && row.not_after && row.issued_at
      ? {
          domains: row.domains.split(','),
          chain: row.chain,
          key: row.key,
          notAfter: row.not_after,
          issuedAt: row.issued_at,
        }
      : null,
  lastAttemptAt: row.last_attempt_at,
  lastError: row.last_error,
});

export var defineCertificateRepository = (
  db: Database
): CertificateRepository => {
  const byDomains = db.query<IssuedRow, [string]>(
    'SELECT * FROM certificates_issued WHERE domains = ?'
  );
  const issued = db.query(
    `INSERT INTO certificates_issued (domains, chain, key, not_after, issued_at, last_attempt_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?, '')
     ON CONFLICT (domains) DO UPDATE SET chain = excluded.chain, key = excluded.key,
       not_after = excluded.not_after, issued_at = excluded.issued_at,
       last_attempt_at = excluded.last_attempt_at, last_error = ''`
  );
  // Неудача не стирает действующий сертификат: он служит, пока не выпущен новый.
  const failed = db.query(
    `INSERT INTO certificates_issued (domains, last_attempt_at, last_error) VALUES (?, ?, ?)
     ON CONFLICT (domains) DO UPDATE SET last_attempt_at = excluded.last_attempt_at,
       last_error = excluded.last_error`
  );
  return {
    load: (domains) =>
      ((row) => (row ? _state(row) : null))(byDomains.get(domainsKey(domains))),
    saveIssued: (certificate, at) =>
      void issued.run(
        domainsKey(certificate.domains),
        certificate.chain,
        certificate.key,
        certificate.notAfter,
        certificate.issuedAt,
        at
      ),
    saveFailure: (domains, error, at) =>
      void failed.run(domainsKey(domains), at, error.slice(0, 2000)),
  };
};

export var defineAccountRepository = (db: Database): AccountRepository => {
  const byDirectory = db.query<{ key: string; url: string }, [string]>(
    'SELECT key, url FROM certificates_accounts WHERE directory = ?'
  );
  const upsert = db.query(
    `INSERT INTO certificates_accounts (directory, key, url) VALUES (?, ?, ?)
     ON CONFLICT (directory) DO UPDATE SET key = excluded.key, url = excluded.url`
  );
  return {
    load: (directory) =>
      ((row) =>
        row ? { key: JSON.parse(row.key) as Jwk, url: row.url } : null)(
        byDirectory.get(directory)
      ),
    save: (directory, account) =>
      void upsert.run(directory, JSON.stringify(account.key), account.url),
  };
};
