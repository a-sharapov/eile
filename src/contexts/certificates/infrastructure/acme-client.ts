import { X509Certificate } from 'node:crypto';
import { attempt } from '../../../shared/kernel/errors.ts';
import type {
  Acme,
  AcmeAccount,
  Issued,
  IssueRequest,
  Jwk,
} from '../domain/ports.ts';
import { certificateRequest, pem } from './der.ts';

// Клиент ACME v2 (RFC 8555) на WebCrypto и fetch: учётная запись, заказ, проверка HTTP-01, выпуск.

/** Каталоги Let's Encrypt: боевой и тестовый (его сертификатам браузеры не верят, зато лимиты мягче). */
export var LETS_ENCRYPT = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
} as const;

export type AcmeOptions = {
  readonly directory: string;
  /** Пауза между опросами, если центр не назвал свою в Retry-After. */
  readonly pollMs?: number;
  /** Сколько ждать выпуска целиком. */
  readonly deadlineMs?: number;
};

type Directory = {
  readonly newNonce: string;
  readonly newAccount: string;
  readonly newOrder: string;
};

type Problem = { readonly type?: string; readonly detail?: string };

type Challenge = {
  readonly type: string;
  readonly url: string;
  readonly token: string;
  readonly error?: Problem;
};

type Authorization = {
  readonly status: string;
  readonly identifier: { readonly value: string };
  readonly challenges: readonly Challenge[];
};

type Order = {
  readonly status: string;
  readonly authorizations: readonly string[];
  readonly finalize: string;
  readonly certificate?: string;
  readonly error?: Problem;
};

type Signer = {
  readonly key: CryptoKey;
  readonly jwk: Jwk;
  readonly url: string | null;
};

const _P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const _SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
const _TIMEOUT = 30_000;
const _encoder = new TextEncoder();
const _ERROR = 'urn:ietf:params:acme:error:';

const _b64u = (bytes: Uint8Array): string =>
  bytes.toBase64({ alphabet: 'base64url', omitPadding: true });

const _json64 = (value: unknown): string =>
  _b64u(_encoder.encode(JSON.stringify(value)));

// Открытая часть ключа в порядке RFC 7638 — она же идёт в заголовок jwk.
const _public = (jwk: Jwk): Jwk => ({
  crv: jwk.crv,
  kty: jwk.kty,
  x: jwk.x,
  y: jwk.y,
});

/** Отпечаток ключа учётной записи (RFC 7638): вторая половина ключа авторизации. */
export var thumbprint = (jwk: Jwk): Promise<string> =>
  crypto.subtle
    .digest('SHA-256', _encoder.encode(JSON.stringify(_public(jwk))))
    .then((_) => _b64u(new Uint8Array(_)));

const _failure = (message: string, problem: Problem = {}): Error =>
  Object.assign(new Error(message), { problem });

const _problemOf = (error: unknown): Problem =>
  (error as { problem?: Problem }).problem ?? {};

// Ответ с ошибкой — документ проблемы (RFC 7807): его тип решает, повторять ли запрос.
const _rejected = (response: Response): Promise<never> =>
  response.text().then((text) =>
    ((problem) =>
      Promise.reject(
        _failure(
          `ACME ${response.status}: ${problem.detail ?? text.slice(0, 200)}`,
          problem
        )
      ))(
      attempt<Problem>(
        () => JSON.parse(text) as Problem,
        () => ({})
      )
    )
  );

// Retry-After — секунды или дата; без него — своя пауза. Дольше 30 секунд не ждём за раз.
const _retryAfter = (response: Response, fallback: number): number =>
  ((value) =>
    Math.min(
      30_000,
      Math.max(
        0,
        value === null
          ? fallback
          : Number.isFinite(Number(value))
            ? Number(value) * 1000
            : Date.parse(value) - Date.now() || fallback
      )
    ))(response.headers.get('retry-after'));

const _signer = (account: AcmeAccount | null): Promise<Signer> =>
  account
    ? crypto.subtle
        .importKey('jwk', account.key, _P256, true, ['sign'])
        .then((key) => ({ key, jwk: account.key, url: account.url }))
    : crypto.subtle
        .generateKey(_P256, true, ['sign', 'verify'])
        .then((pair) =>
          crypto.subtle
            .exportKey('jwk', pair.privateKey)
            .then((jwk) => ({ key: pair.privateKey, jwk, url: null }))
        );

export var defineAcmeClient = (options: AcmeOptions): Acme => {
  const pollMs = options.pollMs ?? 2000;
  const deadlineMs = options.deadlineMs ?? 5 * 60_000;
  let directory: Promise<Directory> | null = null;

  const directoryOf = (): Promise<Directory> =>
    (directory ??= fetch(options.directory, {
      signal: AbortSignal.timeout(_TIMEOUT),
    })
      .then((_) => (_.ok ? (_.json() as Promise<Directory>) : _rejected(_)))
      .then(undefined, (error) => Promise.reject(((directory = null), error))));

  // Один выпуск — один разговор с центром: свой запас nonce и своя подпись.
  const session = (request: IssueRequest, signer: Signer) => {
    const deadline = Date.now() + deadlineMs;
    let nonce: string | null = null;
    let current = signer;

    const keep = (response: Response): Response => (
      (nonce = response.headers.get('replay-nonce') ?? nonce), response
    );

    const fresh = (): Promise<string> =>
      ((taken) =>
        taken
          ? ((nonce = null), Promise.resolve(taken))
          : directoryOf()
              .then((_) =>
                fetch(_.newNonce, {
                  method: 'HEAD',
                  signal: AbortSignal.timeout(_TIMEOUT),
                })
              )
              .then(
                (_) =>
                  _.headers.get('replay-nonce') ??
                  Promise.reject(_failure('ACME: no Replay-Nonce'))
              ))(nonce);

    const signed = (url: string, payload: unknown, value: string) =>
      ((head, body) =>
        crypto.subtle
          .sign(_SIGN, current.key, _encoder.encode(`${head}.${body}`))
          .then((signature) =>
            JSON.stringify({
              protected: head,
              payload: body,
              signature: _b64u(new Uint8Array(signature)),
            })
          ))(
        _json64({
          alg: 'ES256',
          nonce: value,
          url,
          ...(current.url
            ? { kid: current.url }
            : { jwk: _public(current.jwk) }),
        }),
        payload === null ? '' : _json64(payload)
      );

    // POST с подписью; null — POST-as-GET. Устаревший nonce — повторить со свежим, до трёх раз.
    const send = (
      url: string,
      payload: unknown,
      accept = 'application/json',
      tries = 0
    ): Promise<Response> =>
      fresh()
        .then((value) => signed(url, payload, value))
        .then((body) =>
          fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/jose+json',
              accept,
            },
            body,
            signal: AbortSignal.timeout(_TIMEOUT),
          })
        )
        .then(keep)
        .then((response) =>
          response.ok
            ? response
            : _rejected(response).then(undefined, (error) =>
                _problemOf(error).type === `${_ERROR}badNonce` && tries < 3
                  ? send(url, payload, accept, tries + 1)
                  : Promise.reject(error)
              )
        );

    const read = <T>(url: string): Promise<{ body: T; response: Response }> =>
      send(url, null).then((response) =>
        (response.json() as Promise<T>).then((body) => ({ body, response }))
      );

    // Опрос до готовности: центр сам говорит, когда спросить снова.
    const poll = <T>(
      url: string,
      done: (body: T) => boolean,
      failed: (body: T) => string | null
    ): Promise<T> =>
      read<T>(url).then(({ body, response }) =>
        done(body)
          ? body
          : ((problem) =>
              problem !== null
                ? Promise.reject(_failure(problem))
                : Date.now() > deadline
                  ? Promise.reject(
                      _failure(`ACME: no answer in time at ${url}`)
                    )
                  : Bun.sleep(_retryAfter(response, pollMs)).then(() =>
                      poll(url, done, failed)
                    ))(failed(body))
      );

    const account = (): Promise<void> =>
      current.url
        ? Promise.resolve()
        : directoryOf()
            .then((_) =>
              send(_.newAccount, {
                termsOfServiceAgreed: true,
                ...(request.email
                  ? { contact: [`mailto:${request.email}`] }
                  : {}),
              })
            )
            .then((response) =>
              ((url) =>
                url
                  ? void ((current = { ...current, url }),
                    request.onAccount({ key: current.jwk, url }))
                  : Promise.reject(_failure('ACME: account has no Location')))(
                response.headers.get('location')
              )
            );

    const authorize = (
      url: string,
      keyAuthorizationOf: (token: string) => string
    ) =>
      read<Authorization>(url).then(({ body }) =>
        body.status === 'valid'
          ? undefined
          : ((challenge) =>
              challenge
                ? (request.challenges.publish(
                    challenge.token,
                    keyAuthorizationOf(challenge.token)
                  ),
                  send(challenge.url, {})
                    .then(() =>
                      poll<Authorization>(
                        url,
                        (_) => _.status === 'valid',
                        (_) =>
                          _.status === 'invalid' || _.status === 'deactivated'
                            ? `${body.identifier.value}: ${
                                _.challenges.find((c) => c.error)?.error
                                  ?.detail ?? _.status
                              }`
                            : null
                      )
                    )
                    .finally(() =>
                      request.challenges.withdraw(challenge.token)
                    ))
                : Promise.reject(
                    _failure(
                      `ACME: no http-01 check for ${body.identifier.value}`
                    )
                  ))(body.challenges.find((_) => _.type === 'http-01'))
      );

    const order = (): Promise<Issued> =>
      Promise.all([
        directoryOf(),
        thumbprint(current.jwk),
        crypto.subtle.generateKey(_P256, true, ['sign', 'verify']),
      ]).then(({ 0: dir, 1: print, 2: keys }) =>
        send(dir.newOrder, {
          identifiers: request.domains.map((value) => ({ type: 'dns', value })),
        })
          .then((response) =>
            (response.json() as Promise<Order>).then((body) => ({
              body,
              url: response.headers.get('location') ?? '',
            }))
          )
          .then(({ body, url }) =>
            body.authorizations
              .reduce<Promise<unknown>>(
                (previous, authz) =>
                  previous.then(() =>
                    authorize(authz, (token) => `${token}.${print}`)
                  ),
                Promise.resolve()
              )
              .then(() => certificateRequest(request.domains, keys))
              .then((csr) => send(body.finalize, { csr: _b64u(csr) }))
              .then(() =>
                poll<Order>(
                  url,
                  (_) => _.status === 'valid' && Boolean(_.certificate),
                  (_) =>
                    _.status === 'invalid'
                      ? (_.error?.detail ?? 'order is invalid')
                      : null
                )
              )
          )
          .then((ready) =>
            send(ready.certificate!, null, 'application/pem-certificate-chain')
          )
          .then((response) => response.text())
          .then((chain) =>
            crypto.subtle.exportKey('pkcs8', keys.privateKey).then((key) => ({
              account: { key: current.jwk, url: current.url! },
              chain,
              key: pem('PRIVATE KEY', new Uint8Array(key)),
              notAfter: new X509Certificate(chain).validToDate.toISOString(),
            }))
          )
      );

    return () => account().then(order);
  };

  const issue = (request: IssueRequest): Promise<Issued> =>
    _signer(request.account)
      .then((signer) => session(request, signer)())
      .then(undefined, (error) =>
        // Центр забыл учётную запись (её удалили или это другой каталог) — заводим новую, один раз.
        request.account &&
        _problemOf(error).type === `${_ERROR}accountDoesNotExist`
          ? issue({ ...request, account: null })
          : Promise.reject(error)
      );

  return { directory: options.directory, issue };
};
