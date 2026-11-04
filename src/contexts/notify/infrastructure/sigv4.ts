/** Ключ доступа AWS; токен сеанса — только у временных ключей. */
export type AwsCredentials = {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
};

export type SigningRequest = {
  readonly method: string;
  readonly url: string;
  /** Заголовки запроса без `host` и `x-amz-*`: их добавляет подпись. */
  readonly headers: Readonly<Record<string, string>>;
  /** Тело или его SHA-256 в hex — для тела, которое уходит потоком. */
  readonly body: Uint8Array | string | { readonly sha256: string };
  readonly region: string;
  readonly service: string;
  readonly credentials: AwsCredentials;
  readonly date: Date;
  /** Подписать и заголовок `x-amz-content-sha256`: его ждёт S3; SES он не нужен. */
  readonly signBody?: boolean;
};

export type SignedRequest = {
  /** Что отправить: заголовки запроса, `x-amz-date`, `authorization`; `host` fetch ставит сам. */
  readonly headers: Readonly<Record<string, string>>;
  readonly canonicalRequest: string;
  readonly stringToSign: string;
  readonly signature: string;
};

const _ALGORITHM = 'AWS4-HMAC-SHA256';

const _sha256 = (data: Uint8Array | string): string =>
  new Bun.CryptoHasher('sha256').update(data).digest('hex');

const _hmac = (key: Uint8Array | string, data: string): Uint8Array =>
  new Bun.CryptoHasher('sha256', key).update(data).digest();

// RFC 3986: всё, кроме A–Z a–z 0–9 - . _ ~, — %XX заглавными; encodeURIComponent оставляет ещё !'()*.
const _encode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (_) => `%${_.charCodeAt(0).toString(16).toUpperCase()}`
  );

// Путь — сегментами, каждый раскодирован и закодирован заново: так считает набор тестов AWS.
const _canonicalPath = (url: URL): string =>
  url.pathname
    .split('/')
    .map((_) => _encode(decodeURIComponent(_)))
    .join('/') || '/';

type _Pair = readonly [string, string];

// Порядок — по кодам знаков, а не по правилам языка: так сортирует AWS.
const _order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const _byName = (a: _Pair, b: _Pair): number =>
  _order(a[0], b[0]) || _order(a[1], b[1]);

// Параметры — по ключу, затем по значению, оба закодированы; `+` в запросе — знак плюс, а не пробел.
const _canonicalQuery = (url: URL): string =>
  url.search
    .slice(1)
    .split('&')
    .filter(Boolean)
    .map(
      (pair): _Pair =>
        ((at) =>
          at < 0
            ? [_encode(decodeURIComponent(pair)), '']
            : [
                _encode(decodeURIComponent(pair.slice(0, at))),
                _encode(decodeURIComponent(pair.slice(at + 1))),
              ])(pair.indexOf('='))
    )
    .toSorted(_byName)
    .map(({ 0: key, 1: value }) => `${key}=${value}`)
    .join('&');

// Значение заголовка — без пробелов по краям, пробелы подряд — одним.
const _headerValue = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

/** `20150830T123600Z` — время запроса, как его ждёт подпись. */
export var amzDate = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Ключ подписи на день, регион и сервис: цепочка HMAC от секрета. */
export var signingKey = (
  secret: string,
  day: string,
  region: string,
  service: string
): Uint8Array =>
  [day, region, service, 'aws4_request'].reduce<Uint8Array | string>(
    (key, part) => _hmac(key, part),
    `AWS4${secret}`
  ) as Uint8Array;

/**
 * Подпись AWS Signature Version 4 для заголовка Authorization: канонический запрос, строка для
 * подписи и HMAC-SHA256 ключом, выведенным из секрета, дня, региона и сервиса. Проверена
 * официальным набором тестов AWS (`sigv4.test.ts`).
 */
export var signV4 = (request: SigningRequest): SignedRequest => {
  const url = new URL(request.url);
  const stamp = amzDate(request.date);
  const day = stamp.slice(0, 8);
  const payload =
    typeof request.body === 'object' && 'sha256' in request.body
      ? request.body.sha256
      : _sha256(request.body);
  const headers: Record<string, string> = {
    ...request.headers,
    'x-amz-date': stamp,
    ...(request.signBody ? { 'x-amz-content-sha256': payload } : {}),
    ...(request.credentials.sessionToken
      ? { 'x-amz-security-token': request.credentials.sessionToken }
      : {}),
  };
  const canonical = Object.entries({ ...headers, host: url.host })
    .map(
      ({ 0: name, 1: value }): _Pair => [
        name.toLowerCase(),
        _headerValue(value),
      ]
    )
    .toSorted(_byName);
  const signedHeaders = canonical.map((_) => _[0]).join(';');
  const canonicalRequest = [
    request.method.toUpperCase(),
    _canonicalPath(url),
    _canonicalQuery(url),
    ...canonical.map(({ 0: name, 1: value }) => `${name}:${value}`),
    '',
    signedHeaders,
    payload,
  ].join('\n');
  const scope = `${day}/${request.region}/${request.service}/aws4_request`;
  const stringToSign = [
    _ALGORITHM,
    stamp,
    scope,
    _sha256(canonicalRequest),
  ].join('\n');
  const signature = _hmac(
    signingKey(
      request.credentials.secretAccessKey,
      day,
      request.region,
      request.service
    ),
    stringToSign
  ).toHex();
  return {
    headers: {
      ...headers,
      authorization: `${_ALGORITHM} Credential=${request.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    canonicalRequest,
    stringToSign,
    signature,
  };
};
