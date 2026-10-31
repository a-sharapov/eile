import type { Certificate, CertificateState } from './certificate.ts';

/** Ключ в формате JWK (RFC 7517); у учётной записи — EC P-256 вместе с закрытой частью `d`. */
export type Jwk = {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  ext?: boolean;
  key_ops?: string[];
};

/** Учётная запись у центра сертификации: закрытый ключ (JWK) и её адрес — `kid` в подписи запросов. */
export type AcmeAccount = {
  readonly key: Jwk;
  readonly url: string;
};

export type CertificateRepository = {
  readonly load: (domains: readonly string[]) => CertificateState | null;
  readonly saveIssued: (certificate: Certificate, at: string) => void;
  readonly saveFailure: (
    domains: readonly string[],
    error: string,
    at: string
  ) => void;
};

export type AccountRepository = {
  readonly load: (directory: string) => AcmeAccount | null;
  readonly save: (directory: string, account: AcmeAccount) => void;
};

/** Ключ авторизации для проверки HTTP-01: его отдаёт HTTP-слушатель, пока центр проверяет домен. */
export type ChallengeStore = {
  readonly publish: (token: string, keyAuthorization: string) => void;
  readonly withdraw: (token: string) => void;
  readonly answer: (token: string) => string | null;
};

export type IssueRequest = {
  readonly domains: readonly string[];
  readonly email: string;
  readonly account: AcmeAccount | null;
  /** Новая учётная запись сохраняется сразу: неудачный выпуск не должен плодить их у центра. */
  readonly onAccount: (account: AcmeAccount) => void;
  readonly challenges: ChallengeStore;
};

export type Issued = {
  readonly account: AcmeAccount;
  readonly chain: string;
  readonly key: string;
  readonly notAfter: string;
};

/** Центр сертификации по ACME: выпускает сертификат на домены, заодно заводит учётную запись. */
export type Acme = {
  readonly directory: string;
  readonly issue: (request: IssueRequest) => Promise<Issued>;
};
