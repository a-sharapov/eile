import {
  localized,
  type ManagerLanguage,
} from '../../../shared/kernel/manager-language.ts';
import { errorKey, type Report } from '../../../shared/kernel/report.ts';

// Тексты событий сертификата на каждом языке: уведомление уходит на языке из настроек.
const _TEXTS: Readonly<
  Record<
    ManagerLanguage,
    {
      readonly issued: string;
      readonly renewed: string;
      readonly issueFailed: string;
      readonly renewFailed: string;
      readonly until: (date: string) => string;
      readonly domains: string;
      readonly current: (date: string) => string;
      readonly none: string;
      readonly error: string;
    }
  >
> = {
  en: {
    issued: 'HTTPS certificate issued',
    renewed: 'HTTPS certificate renewed',
    issueFailed: 'Could not issue the HTTPS certificate',
    renewFailed: 'Could not renew the HTTPS certificate',
    until: (date) => `until ${date}`,
    domains: 'Domains',
    current: (date) => `The current certificate is valid until ${date}.`,
    none: 'Until there is a certificate, the site answers over HTTP.',
    error: 'Error',
  },
  de: {
    issued: 'HTTPS-Zertifikat ausgestellt',
    renewed: 'HTTPS-Zertifikat verlängert',
    issueFailed: 'HTTPS-Zertifikat konnte nicht ausgestellt werden',
    renewFailed: 'HTTPS-Zertifikat konnte nicht verlängert werden',
    until: (date) => `gültig bis ${date}`,
    domains: 'Domains',
    current: (date) => `Das aktuelle Zertifikat gilt bis ${date}.`,
    none: 'Solange es kein Zertifikat gibt, antwortet die Website über HTTP.',
    error: 'Fehler',
  },
  ru: {
    issued: 'Сертификат HTTPS выпущен',
    renewed: 'Сертификат HTTPS продлён',
    issueFailed: 'Не удалось выпустить сертификат HTTPS',
    renewFailed: 'Не удалось продлить сертификат HTTPS',
    until: (date) => `до ${date}`,
    domains: 'Домены',
    current: (date) => `Действующий сертификат — до ${date}.`,
    none: 'Пока сертификата нет, сайт отвечает по HTTP.',
    error: 'Ошибка',
  },
};

import { type Certificate, type Due, due } from '../domain/certificate.ts';
import type {
  AccountRepository,
  Acme,
  CertificateRepository,
  ChallengeStore,
} from '../domain/ports.ts';

/** Что показать в менеджере: на какие домены сертификат, до какого числа и чем кончилась попытка. */
export type HttpsStatus = {
  readonly domains: readonly string[];
  readonly notAfter: string | null;
  readonly issuedAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly lastError: string;
  /** Тестовый центр: браузеры его сертификатам не верят. */
  readonly staging: boolean;
};

export type Outcome = 'issued' | 'renewed' | 'unchanged' | 'failed';

const _DAY = 24 * 60 * 60 * 1000;

const _message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Без сертификата сайт по HTTPS не открыть — это критично; продление ещё терпит, пока до конца больше недели.
const _severity = (kind: Due, certificate: Certificate | null, now: Date) =>
  kind === 'renew' &&
  certificate &&
  Date.parse(certificate.notAfter) - now.getTime() > 7 * _DAY
    ? 'error'
    : 'critical';

export var defineCertificatesService = ({
  domains,
  email,
  staging,
  acme,
  certificates,
  accounts,
  challenges,
  clock,
  report,
}: {
  domains: readonly string[];
  email: string;
  staging: boolean;
  acme: Acme;
  certificates: CertificateRepository;
  accounts: AccountRepository;
  challenges: ChallengeStore;
  clock: () => Date;
  report: Report;
}) => {
  let running: Promise<Outcome> | null = null;

  const attempt = (kind: Due): Promise<Outcome> =>
    ((before) =>
      acme
        .issue({
          domains,
          email,
          account: accounts.load(acme.directory),
          onAccount: (_) => accounts.save(acme.directory, _),
          challenges,
        })
        .then(
          (issued): Outcome => (
            certificates.saveIssued(
              {
                domains,
                chain: issued.chain,
                key: issued.key,
                notAfter: issued.notAfter,
                issuedAt: clock().toISOString(),
              },
              clock().toISOString()
            ),
            report({
              kind: 'certificates.issued',
              severity: 'info',
              title: localized((_) =>
                kind === 'renew' ? _TEXTS[_].renewed : _TEXTS[_].issued
              ),
              detail: localized(
                (_) =>
                  `${domains.join(', ')} — ${_TEXTS[_].until(issued.notAfter.slice(0, 10))}`
              ),
            }),
            kind === 'renew' ? 'renewed' : 'issued'
          ),
          (error): Outcome => (
            certificates.saveFailure(
              domains,
              _message(error),
              clock().toISOString()
            ),
            report({
              kind: 'certificates.failed',
              severity: _severity(kind, before, clock()),
              title: localized((_) =>
                kind === 'renew' ? _TEXTS[_].renewFailed : _TEXTS[_].issueFailed
              ),
              detail: localized((_) =>
                [
                  `${_TEXTS[_].domains}: ${domains.join(', ')}.`,
                  before
                    ? _TEXTS[_].current(before.notAfter.slice(0, 10))
                    : _TEXTS[_].none,
                  `${_TEXTS[_].error}: ${_message(error)}`,
                ].join('\n')
              ),
              key: errorKey('certificates.failed', error),
            }),
            'failed'
          )
        ))(certificates.load(domains)?.certificate ?? null);

  return {
    /** Выпустить или продлить, если пора; одновременно идёт только одна попытка. */
    ensure: (): Promise<Outcome> =>
      (running ??= ((kind) =>
        kind === null ? Promise.resolve<Outcome>('unchanged') : attempt(kind))(
        due(certificates.load(domains), clock())
      ).finally(() => (running = null))),
    /** Сертификат доменов, даже истёкший: отдавать ли его, решает сервер. */
    current: (): Certificate | null =>
      certificates.load(domains)?.certificate ?? null,
    status: (): HttpsStatus =>
      ((state) => ({
        domains,
        notAfter: state?.certificate?.notAfter ?? null,
        issuedAt: state?.certificate?.issuedAt ?? null,
        lastAttemptAt: state?.lastAttemptAt ?? null,
        lastError: state?.lastError ?? '',
        staging,
      }))(certificates.load(domains)),
  };
};

export type CertificatesService = ReturnType<typeof defineCertificatesService>;
