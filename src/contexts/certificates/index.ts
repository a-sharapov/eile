import type { Database } from '../../platform/database.ts';
import type { Report } from '../../shared/kernel/report.ts';
import {
  defineCertificatesService,
  type HttpsStatus,
  type Outcome,
} from './application/certificates-service.ts';
import type { Certificate } from './domain/certificate.ts';
import type { Acme } from './domain/ports.ts';
import {
  defineAcmeClient,
  LETS_ENCRYPT,
} from './infrastructure/acme-client.ts';
import { startRenewal } from './infrastructure/background.ts';
import { defineChallengeStore } from './infrastructure/challenge-store.ts';
import {
  defineAccountRepository,
  defineCertificateRepository,
} from './infrastructure/sqlite-certificates.ts';

export type {
  HttpsStatus,
  Outcome,
} from './application/certificates-service.ts';
export type { Certificate } from './domain/certificate.ts';
export { parseDomains, valid } from './domain/certificate.ts';
export { LETS_ENCRYPT } from './infrastructure/acme-client.ts';
export {
  CERTIFICATES_TABLES,
  certificatesMigrations,
} from './infrastructure/migrations.ts';
export { defineHttpListener } from './interface/http-listener.ts';

/** HTTPS без прокси: домены, почта для Let's Encrypt и каталог ACME (по умолчанию — боевой). */
export type HttpsOptions = {
  readonly domains: readonly string[];
  readonly email?: string;
  readonly directory?: string;
  /** Подмена центра сертификации — для тестов. */
  readonly acme?: Acme;
  /** Пауза опроса центра; тесты ставят короче. */
  readonly pollMs?: number;
};

export type Certificates = {
  /** Сертификат выпускает сам сервер; null — HTTPS не его забота (нет `--domain` или стоит прокси). */
  readonly status: () => HttpsStatus | null;
  readonly current: () => Certificate | null;
  readonly ensure: () => Promise<Outcome>;
  /** Ключ авторизации для проверки HTTP-01 по токену из адреса. */
  readonly challenge: (token: string) => string | null;
  /**
   * Проверка раз в час и сразу. `changed` — сертификат новый, `failed` — попытка не удалась (текст ошибки).
   * Возвращает остановку.
   */
  readonly start: (
    changed: (certificate: Certificate) => void,
    failed?: (error: string) => void
  ) => () => void;
};

const _OFF: Certificates = {
  status: () => null,
  current: () => null,
  ensure: () => Promise.resolve('unchanged'),
  challenge: () => null,
  start: () => () => undefined,
};

/** Контекст certificates: сертификат Let's Encrypt для доменов сайта, его выпуск и продление. */
export var defineCertificates = ({
  db,
  clock,
  report,
  https,
}: {
  db: Database;
  clock: () => Date;
  report: Report;
  https?: HttpsOptions;
}): Certificates =>
  https
    ? ((challenges, directory) =>
        ((service) => ({
          status: service.status,
          current: service.current,
          ensure: service.ensure,
          challenge: challenges.answer,
          start: (changed, failed) =>
            startRenewal(() =>
              service
                .ensure()
                .then((outcome) =>
                  ((certificate) =>
                    void (outcome === 'failed'
                      ? failed?.(service.status().lastError)
                      : (outcome === 'issued' || outcome === 'renewed') &&
                        certificate &&
                        changed(certificate)))(service.current())
                )
            ),
        }))(
          defineCertificatesService({
            domains: https.domains,
            email: https.email ?? '',
            staging: directory !== LETS_ENCRYPT.production,
            acme:
              https.acme ??
              defineAcmeClient({
                directory,
                ...(https.pollMs ? { pollMs: https.pollMs } : {}),
              }),
            certificates: defineCertificateRepository(db),
            accounts: defineAccountRepository(db),
            challenges,
            clock,
            report,
          })
        ))(
        defineChallengeStore(),
        https.acme?.directory ?? https.directory ?? LETS_ENCRYPT.production
      )
    : _OFF;
