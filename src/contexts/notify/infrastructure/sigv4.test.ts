import { describe, expect, it } from 'bun:test';
import { amzDate, signingKey, signV4 } from './sigv4.ts';

// Официальный набор тестов AWS Signature Version 4 (awslabs/aws-c-auth,
// tests/aws-signing-test-suite/v4, Apache-2.0): запрос, канонический запрос и подпись. Ключ, регион,
// сервис и время у всех случаев одни.
const _CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const _DATE = new Date('2015-08-30T12:36:00Z');

type Vector = {
  readonly name: string;
  readonly request: string;
  readonly signBody?: boolean;
  readonly token?: string;
  readonly canonical: string;
  readonly signature: string;
};

const _VECTORS: readonly Vector[] = [
  {
    name: 'get-vanilla',
    request: 'GET / HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  },
  {
    name: 'get-vanilla-query-order-key-case',
    request:
      'GET /?Param2=value2&Param1=value1 HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/\nParam1=value1&Param2=value2\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500',
  },
  {
    name: 'get-vanilla-query-order-encoded',
    request:
      'GET /?Param-3=Value3&Param=Value2&%E1%88%B4=Value1 HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/\n%E1%88%B4=Value1&Param=Value2&Param-3=Value3\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '371d3713e185cc334048618a97f809c9ffe339c62934c032af5a0e595648fcac',
  },
  {
    name: 'get-vanilla-query-unreserved',
    request:
      'GET /?-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz=-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/\n-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz=-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '9c3e54bfcdf0b19771a7f523ee5669cdf59bc7cc0884027167c21bb143a40197',
  },
  {
    name: 'get-vanilla-utf8-query',
    request: 'GET /?ሴ=bar HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/\n%E1%88%B4=bar\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '2cdec8eed098649ff3a119c94853b13c643bcf08f8b0a1d91e12c9027818dd04',
  },
  {
    name: 'get-unreserved',
    request:
      'GET /-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '07ef7494c76fa4850883e2b006601f940f8a34d404d0cfa977f52a65bbf5f24f',
  },
  {
    name: 'get-utf8',
    request: 'GET /ሴ HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'GET\n/%E1%88%B4\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '8318018e0b0f223aa2bbf98705b62bb787dc9c0e678f255a891fd03141be5d85',
  },
  {
    name: 'get-header-value-trim',
    request:
      'GET / HTTP/1.1\nHost:example.amazonaws.com\nMy-Header1: value1\nMy-Header2: "a   b   c"\n',
    canonical:
      'GET\n/\n\nhost:example.amazonaws.com\nmy-header1:value1\nmy-header2:"a b c"\nx-amz-date:20150830T123600Z\n\nhost;my-header1;my-header2;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      'acc3ed3afb60bb290fc8d2dd0098b9911fcaa05412b367055dee359757a9c736',
  },
  {
    name: 'post-vanilla',
    request: 'POST / HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'POST\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b',
  },
  {
    name: 'post-vanilla-query',
    request: 'POST /?Param1=value1 HTTP/1.1\nHost:example.amazonaws.com\n',
    canonical:
      'POST\n/\nParam1=value1\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '28038455d6de14eafc1f9222cf5aa6f1a96197d7deb8263271d420d138af7f11',
  },
  {
    name: 'post-header-key-sort',
    request: 'POST / HTTP/1.1\nHost:example.amazonaws.com\nMy-Header1:value1\n',
    canonical:
      'POST\n/\n\nhost:example.amazonaws.com\nmy-header1:value1\nx-amz-date:20150830T123600Z\n\nhost;my-header1;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      'c5410059b04c1ee005303aed430f6e6645f61f4dc9e1461ec8f8916fdf18852c',
  },
  {
    name: 'post-header-value-case',
    request: 'POST / HTTP/1.1\nHost:example.amazonaws.com\nMy-Header1:VALUE1\n',
    canonical:
      'POST\n/\n\nhost:example.amazonaws.com\nmy-header1:VALUE1\nx-amz-date:20150830T123600Z\n\nhost;my-header1;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      'cdbc9802e29d2942e5e10b5bccfdd67c5f22c7c4e8ae67b53629efa58b974b7d',
  },
  {
    name: 'post-x-www-form-urlencoded',
    request:
      'POST / HTTP/1.1\nContent-Type:application/x-www-form-urlencoded\nHost:example.amazonaws.com\nContent-Length:13\n\nParam1=value1',
    signBody: true,
    canonical:
      'POST\n/\n\ncontent-length:13\ncontent-type:application/x-www-form-urlencoded\nhost:example.amazonaws.com\nx-amz-content-sha256:9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e\nx-amz-date:20150830T123600Z\n\ncontent-length;content-type;host;x-amz-content-sha256;x-amz-date\n9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e',
    signature:
      'd3875051da38690788ef43de4db0d8f280229d82040bfac253562e56c3f20e0b',
  },
  {
    name: 'post-x-www-form-urlencoded-parameters',
    request:
      'POST / HTTP/1.1\nContent-Type:application/x-www-form-urlencoded; charset=utf-8\nHost:example.amazonaws.com\nContent-Length:13\n\nParam1=value1',
    signBody: true,
    canonical:
      'POST\n/\n\ncontent-length:13\ncontent-type:application/x-www-form-urlencoded; charset=utf-8\nhost:example.amazonaws.com\nx-amz-content-sha256:9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e\nx-amz-date:20150830T123600Z\n\ncontent-length;content-type;host;x-amz-content-sha256;x-amz-date\n9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e',
    signature:
      '328d1b9eaadca9f5818ef05e8392801e091653bafec24fcab71e7344e7f51422',
  },
  {
    name: 'get-vanilla-with-session-token',
    request: 'GET / HTTP/1.1\nHost:example.amazonaws.com\n',
    token: '6e86291e8372ff2a2260956d9b8aae1d763fbf315fa00fa31553b73ebf194267',
    canonical:
      'GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\nx-amz-security-token:6e86291e8372ff2a2260956d9b8aae1d763fbf315fa00fa31553b73ebf194267\n\nhost;x-amz-date;x-amz-security-token\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signature:
      '07ec1639c89043aa0e3e2de82b96708f198cceab042d4a97044c66dd9f74e7f8',
  },
];

// Запрос набора — как на проводе: строка запроса, заголовки «Имя:значение», пустая строка, тело.
const parse = (raw: string) => {
  const { 0: head = '', 1: body = '' } = raw.split('\n\n');
  const lines = head.split('\n');
  const { 0: method = '', 1: target = '' } = (lines[0] ?? '').split(' ');
  const headers = lines
    .slice(1)
    .filter(Boolean)
    .map((_) => [_.slice(0, _.indexOf(':')), _.slice(_.indexOf(':') + 1)]);
  const host = headers.find(({ 0: name }) => name === 'Host')?.[1] ?? '';
  return {
    method,
    url: `https://${host}${target}`,
    headers: Object.fromEntries(
      headers.filter(({ 0: name }) => name !== 'Host')
    ),
    body,
  };
};

describe('подпись AWS Signature Version 4', () => {
  it.each(_VECTORS.map((_) => [_.name, _] as const))('%s', (_name, vector) => {
    const signed = signV4({
      ...parse(vector.request),
      region: 'us-east-1',
      service: 'service',
      credentials: vector.token
        ? { ..._CREDENTIALS, sessionToken: vector.token }
        : _CREDENTIALS,
      date: _DATE,
      signBody: vector.signBody ?? false,
    });
    expect(signed.canonicalRequest).toBe(vector.canonical);
    expect(signed.signature).toBe(vector.signature);
    expect(signed.headers.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=${vector.canonical.split('\n').at(-2)}, Signature=${vector.signature}`
    );
    expect(signed.headers['x-amz-date']).toBe('20150830T123600Z');
  });

  // Примеры из документации AWS «Signature Version 4 signing process»: вывод ключа и запрос к IAM.
  it('ключ подписи — как в примере документации AWS', () => {
    expect(
      signingKey(
        _CREDENTIALS.secretAccessKey,
        '20120215',
        'us-east-1',
        'iam'
      ).toHex()
    ).toBe('f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
  });

  it('запрос ListUsers к IAM — подпись из документации AWS', () => {
    const signed = signV4({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: '',
      region: 'us-east-1',
      service: 'iam',
      credentials: _CREDENTIALS,
      date: _DATE,
    });
    expect(signed.signature).toBe(
      '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7'
    );
  });

  it('время — без разделителей и долей секунды', () => {
    expect(amzDate(new Date('2026-11-03T09:05:07.123Z'))).toBe(
      '20261103T090507Z'
    );
  });
});
