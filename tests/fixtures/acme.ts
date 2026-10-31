// Учебный центр сертификации по ACME для тестов: проверяет подписи JWS и nonce, сам ходит за ключом
// HTTP-01 к нашему HTTP-слушателю и выпускает настоящий сертификат X.509 своим ключом P-256.
import {
  commonName,
  context,
  ecdsaWithSha256,
  integer,
  octetString,
  oid,
  pem,
  sequence,
  signed,
  small,
  tlv,
} from '../../src/contexts/certificates/infrastructure/der.ts';

const _P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const _VERIFY = { name: 'ECDSA', hash: 'SHA-256' } as const;
const _decoder = new TextDecoder();

type Node = {
  readonly tag: number;
  readonly whole: Uint8Array;
  readonly content: Uint8Array;
};

// Разбор DER: тег, длина (короткая или длинная форма), содержимое.
const _node = (bytes: Uint8Array, at = 0): Node => {
  const first = bytes[at + 1]!;
  const size = first & 0x80 ? first & 0x7f : 0;
  const length =
    size === 0
      ? first
      : [...bytes.subarray(at + 2, at + 2 + size)].reduce(
          (sum, b) => sum * 256 + b,
          0
        );
  const start = at + 2 + size;
  return {
    tag: bytes[at]!,
    whole: bytes.subarray(at, start + length),
    content: bytes.subarray(start, start + length),
  };
};

const _children = (node: Node): Node[] => {
  const out: Node[] = [];
  for (let at = 0; at < node.content.length; ) {
    const child = _node(node.content, at);
    out.push(child);
    at += child.whole.length;
  }
  return out;
};

// Ecdsa-Sig-Value → r‖s по 32 байта, как ждёт WebCrypto.
const _rawSignature = (der: Uint8Array): Uint8Array => {
  const { 0: r, 1: s } = _children(_node(der));
  const fixed = (n: Node) =>
    ((v) => {
      const out = new Uint8Array(32);
      out.set(
        v.subarray(Math.max(0, v.length - 32)),
        32 - Math.min(32, v.length)
      );
      return out;
    })(n.content);
  const out = new Uint8Array(64);
  out.set(fixed(r!), 0);
  out.set(fixed(s!), 32);
  return out;
};

const _time = (date: Date): Uint8Array =>
  tlv(
    0x17,
    new TextEncoder().encode(
      `${date.toISOString().slice(2, 19).replace(/[-:T]/g, '')}Z`
    )
  );

const _true = tlv(0x01, new Uint8Array([0xff]));

const _b64u = (text: string): Uint8Array =>
  Uint8Array.fromBase64(text, { alphabet: 'base64url' });

/** Что внутри CSR: открытый ключ (SubjectPublicKeyInfo целиком) и имена из subjectAltName. */
export var readRequest = (der: Uint8Array) => {
  const { 0: info, 2: signature } = _children(_node(der));
  const { 2: spki, 3: attributes } = _children(info!);
  const extensions = _children(
    _children(_children(_children(attributes!)[0]!)[1]!)[0]!
  );
  const san = extensions.find(
    (_) =>
      _decoder.decode(_children(_)[0]!.whole) ===
      _decoder.decode(oid('2.5.29.17'))
  )!;
  const names = _children(_node(_children(san)[1]!.content)).map((_) =>
    _decoder.decode(_.content)
  );
  return {
    info: info!.whole,
    spki: spki!.whole,
    names,
    signature: _rawSignature(signature!.content.subarray(1)),
  };
};

export type MockAcme = {
  readonly directory: string;
  readonly caPem: string;
  /** Сколько запросов отклонено как badNonce. */
  readonly badNonces: () => number;
  readonly stop: () => void;
};

/**
 * Центр на случайном порту. `resolve(domain)` — куда идти за ключом HTTP-01 (наш HTTP-слушатель);
 * `badNonceOnce` — пути, на которых первый запрос получит badNonce; `days` — срок сертификата.
 */
export var startMockAcme = ({
  resolve,
  badNonceOnce = [],
  days = 90,
  port = 0,
}: {
  resolve: (domain: string) => string;
  badNonceOnce?: readonly string[];
  days?: number;
  port?: number;
}): Promise<MockAcme> =>
  crypto.subtle.generateKey(_P256, true, ['sign', 'verify']).then((ca) =>
    crypto.subtle.exportKey('spki', ca.publicKey).then((caSpki) => {
      const caName = commonName('Mock CA');
      const now = Date.now();
      // Корневой сертификат: v3, CA:TRUE — иначе TLS-клиент не примет подписанные им листья.
      return signed(
        sequence(
          context(0, true, small(2)),
          small(1),
          ecdsaWithSha256(),
          caName,
          sequence(
            _time(new Date(now - 3_600_000)),
            _time(new Date(now + 365 * 86_400_000))
          ),
          caName,
          new Uint8Array(caSpki),
          context(
            3,
            true,
            sequence(
              sequence(oid('2.5.29.19'), _true, octetString(sequence(_true)))
            )
          )
        ),
        ca.privateKey
      ).then((caDer) => {
        const caPem = pem('CERTIFICATE', caDer);
        const nonces = new Set<string>();
        const accounts = new Map<string, CryptoKey & { jwk?: unknown }>();
        const jwks = new Map<string, Record<string, string>>();
        const authzs = new Map<
          string,
          {
            status: string;
            domain: string;
            token: string;
            account: string;
            error?: { type: string; detail: string };
          }
        >();
        const orders = new Map<
          string,
          {
            status: string;
            authorizations: string[];
            finalize: string;
            certificate?: string;
            chain?: string;
          }
        >();
        const pendingBadNonce = new Set(badNonceOnce);
        let badNonces = 0;
        let counter = 0;

        const nonce = () => {
          const value = crypto.randomUUID();
          nonces.add(value);
          return value;
        };
        const reply = (
          status: number,
          body: unknown,
          headers: Record<string, string> = {}
        ) =>
          new Response(typeof body === 'string' ? body : JSON.stringify(body), {
            status,
            headers: {
              'content-type':
                typeof body === 'string'
                  ? 'application/pem-certificate-chain'
                  : 'application/json',
              'replay-nonce': nonce(),
              ...headers,
            },
          });
        const problem = (type: string, detail: string, status = 400) =>
          reply(status, { type: `urn:ietf:params:acme:error:${type}`, detail });

        const thumbprint = (jwk: Record<string, string>) =>
          crypto.subtle
            .digest(
              'SHA-256',
              new TextEncoder().encode(
                JSON.stringify({
                  crv: jwk.crv,
                  kty: jwk.kty,
                  x: jwk.x,
                  y: jwk.y,
                })
              )
            )
            .then((_) =>
              new Uint8Array(_).toBase64({
                alphabet: 'base64url',
                omitPadding: true,
              })
            );

        const issue = (orderId: string, csr: Uint8Array) => {
          const request = readRequest(csr);
          return crypto.subtle
            .importKey(
              'spki',
              request.spki as Uint8Array<ArrayBuffer>,
              _P256,
              true,
              ['verify']
            )
            .then((key) =>
              crypto.subtle.verify(
                _VERIFY,
                key,
                request.signature as Uint8Array<ArrayBuffer>,
                request.info as Uint8Array<ArrayBuffer>
              )
            )
            .then((ok) => {
              if (!ok) throw new Error('CSR signature does not verify');
              const issued = new Date();
              const tbs = sequence(
                context(0, true, small(2)),
                integer(new Uint8Array([++counter + 1])),
                ecdsaWithSha256(),
                caName,
                sequence(
                  _time(new Date(issued.getTime() - 60_000)),
                  _time(new Date(issued.getTime() + days * 86_400_000))
                ),
                commonName(request.names[0]!),
                request.spki,
                context(
                  3,
                  true,
                  sequence(
                    sequence(
                      oid('2.5.29.17'),
                      octetString(
                        sequence(
                          ...request.names.map((_) =>
                            context(2, false, new TextEncoder().encode(_))
                          )
                        )
                      )
                    )
                  )
                )
              );
              return signed(tbs, ca.privateKey).then((leaf) => {
                const order = orders.get(orderId)!;
                order.chain = pem('CERTIFICATE', leaf) + caPem;
              });
            });
        };

        let base = '';
        const server = Bun.serve({
          port,
          development: false,
          fetch: async (request) => {
            const url = new URL(request.url);
            const path = url.pathname;
            if (path === '/dir')
              return reply(200, {
                newNonce: `${base}/nonce`,
                newAccount: `${base}/account`,
                newOrder: `${base}/order`,
                meta: { termsOfService: `${base}/terms` },
              });
            if (path === '/nonce')
              return new Response(null, {
                headers: { 'replay-nonce': nonce() },
              });
            if (request.method !== 'POST')
              return new Response('Not Found', { status: 404 });

            const jws = (await request.json()) as {
              protected: string;
              payload: string;
              signature: string;
            };
            const header = JSON.parse(
              new TextDecoder().decode(_b64u(jws.protected))
            ) as {
              alg: string;
              nonce: string;
              url: string;
              jwk?: Record<string, string>;
              kid?: string;
            };
            if (!nonces.delete(header.nonce))
              return problem('badNonce', 'unknown nonce');
            if (pendingBadNonce.delete(path)) {
              badNonces += 1;
              return problem('badNonce', 'try again');
            }
            if (header.alg !== 'ES256' || header.url !== `${base}${path}`)
              return problem('malformed', 'bad protected header');
            const jwk =
              header.jwk ?? (header.kid ? jwks.get(header.kid) : undefined);
            if (!jwk) return problem('accountDoesNotExist', 'no such account');
            if (path !== '/account' && !header.kid)
              return problem('malformed', 'kid is required');
            const key = await crypto.subtle.importKey('jwk', jwk, _P256, true, [
              'verify',
            ]);
            const ok = await crypto.subtle.verify(
              _VERIFY,
              key,
              _b64u(jws.signature) as Uint8Array<ArrayBuffer>,
              new TextEncoder().encode(`${jws.protected}.${jws.payload}`)
            );
            if (!ok) return problem('unauthorized', 'bad signature', 401);
            const payload =
              jws.payload === ''
                ? null
                : JSON.parse(new TextDecoder().decode(_b64u(jws.payload)));

            if (path === '/account') {
              if (payload?.termsOfServiceAgreed !== true)
                return problem('userActionRequired', 'agree to the terms');
              const account = `${base}/acct/${++counter}`;
              jwks.set(account, jwk);
              return reply(201, { status: 'valid' }, { location: account });
            }
            if (path === '/order') {
              const id = String(++counter);
              const authorizations = (
                payload.identifiers as { value: string }[]
              ).map((identifier) => {
                const authz = String(++counter);
                authzs.set(authz, {
                  status: 'pending',
                  domain: identifier.value,
                  token: crypto.randomUUID().replaceAll('-', ''),
                  account: header.kid!,
                });
                return `${base}/authz/${authz}`;
              });
              orders.set(id, {
                status: 'pending',
                authorizations,
                finalize: `${base}/finalize/${id}`,
              });
              return reply(201, orders.get(id), {
                location: `${base}/orders/${id}`,
              });
            }
            const [, kind, id] = path.split('/');
            if (kind === 'authz') {
              const authz = authzs.get(id!)!;
              return reply(200, {
                status: authz.status,
                identifier: { type: 'dns', value: authz.domain },
                challenges: [
                  {
                    type: 'dns-01',
                    url: `${base}/chall/${id}/dns`,
                    token: authz.token,
                    status: 'pending',
                  },
                  {
                    type: 'http-01',
                    url: `${base}/chall/${id}`,
                    token: authz.token,
                    status: authz.status,
                    ...(authz.error ? { error: authz.error } : {}),
                  },
                ],
              });
            }
            if (kind === 'chall') {
              const authz = authzs.get(id!)!;
              const expected = `${authz.token}.${await thumbprint(jwks.get(authz.account)!)}`;
              // Проверка — чуть позже, как у настоящего центра: клиенту придётся опросить.
              setTimeout(() => {
                fetch(
                  `${resolve(authz.domain)}/.well-known/acme-challenge/${authz.token}`,
                  {
                    headers: { host: authz.domain },
                  }
                )
                  .then((_) => (_.ok ? _.text() : ''))
                  .catch(() => '')
                  .then((body) => {
                    authz.status = body === expected ? 'valid' : 'invalid';
                    if (body !== expected)
                      authz.error = {
                        type: 'urn:ietf:params:acme:error:unauthorized',
                        detail: `wrong key authorization: "${body}"`,
                      };
                  });
              }, 20);
              return reply(200, {
                type: 'http-01',
                url: `${base}/chall/${id}`,
                token: authz.token,
                status: 'processing',
              });
            }
            if (kind === 'finalize') {
              const order = orders.get(id!)!;
              const ready = order.authorizations.every(
                (_) => authzs.get(_.split('/').at(-1)!)!.status === 'valid'
              );
              if (!ready)
                return problem(
                  'orderNotReady',
                  'authorizations are not valid',
                  403
                );
              order.status = 'processing';
              await issue(id!, _b64u(payload.csr));
              setTimeout(() => {
                order.status = 'valid';
                order.certificate = `${base}/cert/${id}`;
              }, 20);
              return reply(200, order, { 'retry-after': '0' });
            }
            if (kind === 'orders') return reply(200, orders.get(id!));
            if (kind === 'cert') return reply(200, orders.get(id!)!.chain!);
            return new Response('Not Found', { status: 404 });
          },
        });
        base = `http://127.0.0.1:${server.port}`;
        return {
          directory: `${base}/dir`,
          caPem,
          badNonces: () => badNonces,
          stop: () => server.stop(true),
        };
      });
    })
  );
