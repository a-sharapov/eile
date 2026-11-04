import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import {
  addressOf,
  addToken,
  attachmentsOf,
  claims,
  DEFAULT_GATEWAY,
  type GatewaySettings,
  type GatewayToken,
  gatewayChecks,
  isReady,
  MAX_ATTACHMENT_BYTES,
  type Mail,
  type MailProblem,
  mailOf,
  parseGateway,
  parseGatewayPath,
  recipientsOf,
  removeToken,
  senderOf,
  touchToken,
} from './gateway.ts';

const codeOf = (run: () => unknown): string | null =>
  attempt(
    () => (run(), null),
    (error) => (isDomainError(error) ? error.code : 'not a domain error')
  );

const _OWN = { address: 'site@example.com', name: 'Küchenstudio' };

const _TOKEN: GatewayToken = {
  id: 'a1',
  label: 'Plattform',
  hash: 'h',
  hint: 'wxyz',
  createdAt: '2026-11-03T10:00:00.000Z',
  usedAt: null,
};

const base64 = (text: string): string =>
  new TextEncoder().encode(text).toBase64();

describe('адрес шлюза', () => {
  it.each([
    ['/mailer/', '/mailer/'],
    ['mailer', '/mailer/'],
    ['/Mailer', '/mailer/'],
    ['//api//mail//', '/api/mail/'],
    ['/mail_relay-2/', '/mail_relay-2/'],
  ])('%p → %p', (raw, path) => {
    expect(parseGatewayPath(raw)).toBe(path);
  });

  it.each([
    '/',
    '',
    '/manager/',
    '/manager/api',
    '/media/x',
    '/_cms/forms',
    '/robots.txt',
    '/.well-known/acme',
    '/mail er/',
    '/a/b/c/d/e/',
    '/почта/',
  ])('%p — отказ', (raw) => {
    expect(codeOf(() => parseGatewayPath(raw))).toBe(
      'notify.invalid_gateway_path'
    );
  });

  it('адрес занят, пока шлюз включён или у него есть токены; со слешем и без', () => {
    const on: GatewaySettings = { ...DEFAULT_GATEWAY, enabled: true };
    expect(claims(on, '/mailer/')).toBe(true);
    expect(claims(on, '/mailer')).toBe(true);
    expect(claims(on, '/mailer/x')).toBe(false);
    expect(claims(on, '/mailers')).toBe(false);
    expect(claims(DEFAULT_GATEWAY, '/mailer/')).toBe(false);
    expect(claims({ ...DEFAULT_GATEWAY, tokens: [_TOKEN] }, '/mailer')).toBe(
      true
    );
  });
});

describe('настройки шлюза', () => {
  it('поля формы; токены — только прежние', () => {
    const previous = { ...DEFAULT_GATEWAY, tokens: [_TOKEN] };
    expect(
      parseGateway(
        {
          enabled: true,
          path: 'relay',
          rateLimit: '30',
          senders: 'Info@Example.com, info@example.com; noreply@example.com',
          domains: '@Example.com küchen.de',
          tokens: [],
        },
        previous
      )
    ).toEqual({
      enabled: true,
      path: '/relay/',
      tokens: [_TOKEN],
      rateLimit: 30,
      senders: ['info@example.com', 'noreply@example.com'],
      domains: ['example.com', 'xn--kchen-kva.de'],
    });
  });

  it('не переданное — прежнее; пустой предел — по умолчанию, 0 — без предела', () => {
    const previous = { ...DEFAULT_GATEWAY, rateLimit: 40 };
    expect(parseGateway({}, previous)).toEqual(previous);
    expect(parseGateway({ rateLimit: '' }, previous).rateLimit).toBe(15);
    expect(parseGateway({ rateLimit: 0 }, previous).rateLimit).toBe(0);
  });

  it.each([
    [{ rateLimit: -1 }, 'notify.invalid_rate_limit'],
    [{ rateLimit: 1.5 }, 'notify.invalid_rate_limit'],
    [{ senders: 'nobody' }, 'notify.invalid_sender'],
    [{ domains: 'not a domain' }, 'notify.invalid_domain'],
    [{ domains: 'localhost' }, 'notify.invalid_domain'],
    [{ path: '/manager' }, 'notify.invalid_gateway_path'],
  ])('%p — %p', (raw, code) => {
    expect(codeOf(() => parseGateway(raw, DEFAULT_GATEWAY))).toBe(code);
  });

  it('токены: не больше десяти, отзыв по id, время последнего запроса', () => {
    const full = Array.from({ length: 10 }, (_, index) => ({
      ..._TOKEN,
      id: `t${index}`,
    }));
    expect(
      codeOf(() => addToken(_TOKEN)({ ...DEFAULT_GATEWAY, tokens: full }))
    ).toBe('notify.too_many_tokens');
    const one = addToken(_TOKEN)(DEFAULT_GATEWAY);
    expect(
      touchToken('a1', '2026-11-03T11:00:00.000Z')(one).tokens[0]!.usedAt
    ).toBe('2026-11-03T11:00:00.000Z');
    expect(removeToken('a1')(one).tokens).toEqual([]);
    expect(codeOf(() => removeToken('zz')(one))).toBe(
      'notify.gateway_token_not_found'
    );
  });

  it('готов, когда включён, есть токен, почта и отправитель', () => {
    const on = { ...DEFAULT_GATEWAY, enabled: true, tokens: [_TOKEN] };
    expect(isReady(gatewayChecks(on, { from: 'site@example.com' }))).toBe(true);
    expect(gatewayChecks(on, null)).toEqual({
      enabled: true,
      token: true,
      sender: false,
      smtp: false,
    });
    expect(
      isReady(gatewayChecks({ ...on, tokens: [] }, { from: 'a@b.de' }))
    ).toBe(false);
  });
});

describe('адресаты', () => {
  it('строка, объект, список; PocketBase — {Address}; без повторов', () => {
    expect(recipientsOf('a@example.com')).toEqual(['a@example.com']);
    expect(
      recipientsOf([
        ' a@example.com ',
        { address: 'b@example.com', name: 'B' },
        { Address: 'c@example.com' },
        { email: 'd@example.com' },
        'A@Example.com',
        'nobody',
        42,
        null,
      ])
    ).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
      'd@example.com',
    ]);
    expect(recipientsOf(undefined)).toEqual([]);
  });

  it('адрес с переводом строки или скобками — не адрес', () => {
    expect(addressOf('a@example.com\r\nBcc: x@y.z')).toBe('');
    expect(addressOf('<a@example.com>')).toBe('');
    expect(addressOf('Anna <a@example.com>')).toBe('');
  });
});

describe('отправитель', () => {
  it('пусто или не адрес — отправитель почты сайта и имя сайта', () => {
    expect(senderOf(undefined, _OWN, [])).toEqual(_OWN);
    expect(senderOf({ name: '', address: '' }, _OWN, [])).toEqual(_OWN);
    expect(senderOf('nonsense', _OWN, [])).toEqual(_OWN);
  });

  it('чужой адрес заменяется отправителем сайта, имя клиента остаётся', () => {
    expect(
      senderOf({ name: 'Muehlenhof', address: 'ceo@bank.example' }, _OWN, [])
    ).toEqual({ address: 'site@example.com', name: 'Muehlenhof' });
  });

  it('разрешённый адрес и свой — как прислал клиент, регистр не важен', () => {
    expect(
      senderOf({ name: 'Info', address: 'Info@Example.com' }, _OWN, [
        'info@example.com',
      ])
    ).toEqual({ address: 'Info@Example.com', name: 'Info' });
    expect(senderOf('SITE@example.com', _OWN, [])).toEqual({
      address: 'SITE@example.com',
      name: 'Küchenstudio',
    });
  });
});

describe('вложения', () => {
  it('base64 и строка; имя без пути и чужих знаков, тип без параметров', () => {
    expect(
      attachmentsOf([
        {
          filename: '../../etc/Angebot Küche.pdf',
          contentType: 'application/pdf; name="x"',
          contentBase64: base64('%PDF'),
        },
        { filename: 'note.txt', content: 'привет' },
      ])
    ).toEqual([
      {
        filename: 'Angebot_K_che.pdf',
        contentType: 'application/pdf',
        content: new TextEncoder().encode('%PDF'),
        contentId: '',
        inline: false,
      },
      {
        filename: 'note.txt',
        contentType: 'application/octet-stream',
        content: new TextEncoder().encode('привет'),
        contentId: '',
        inline: false,
      },
    ]);
  });

  it('картинка с contentId — встроенная, если inline не запрещён; content_id тоже читается', () => {
    const files = attachmentsOf([
      {
        filename: 'logo.png',
        contentType: 'image/png',
        contentBase64: base64('png'),
        contentId: '<logo@muehlenhof>',
        inline: true,
      },
      { filename: 'a.png', content: 'x', content_id: 'a' },
      { filename: 'b.png', content: 'x', contentId: 'b', inline: false },
    ]);
    expect(files.map((_) => [_.contentId, _.inline])).toEqual([
      ['logo@muehlenhof', true],
      ['a', true],
      ['b', false],
    ]);
  });

  it('пустые, битые и больше 2 МБ — отброшены; не больше 40', () => {
    expect(
      attachmentsOf([
        { filename: 'empty.txt', content: '' },
        { filename: 'broken.bin', contentBase64: '***' },
        { filename: '..', content: 'x' },
        {
          filename: 'big.bin',
          contentBase64: new Uint8Array(MAX_ATTACHMENT_BYTES + 1).toBase64(),
        },
        'not an object',
      ])
    ).toEqual([]);
    expect(
      attachmentsOf(
        Array.from({ length: 45 }, (_, index) => ({
          filename: `f${index}.txt`,
          content: 'x',
        }))
      )
    ).toHaveLength(40);
    expect(attachmentsOf('nope')).toEqual([]);
  });

  it('из типа вырезаются переводы строк и чужие знаки; не type/subtype — octet-stream', () => {
    expect(
      attachmentsOf([
        { filename: 'a', content: 'x', contentType: 'text/html\r\nX: y' },
        { filename: 'b', content: 'x', contentType: 'garbage' },
      ]).map((_) => _.contentType)
    ).toEqual(['text/htmlxy', 'application/octet-stream']);
  });
});

describe('письмо из запроса', () => {
  const body = {
    to: ['a@example.com'],
    subject: '  Termin  ',
    html: '<p>Hallo</p>',
  };

  it('отправитель, адресаты, тема без пробелов по краям', () => {
    expect(mailOf(body, _OWN, DEFAULT_GATEWAY)).toEqual({
      from: _OWN,
      to: ['a@example.com'],
      subject: 'Termin',
      html: '<p>Hallo</p>',
      text: '',
      attachments: [],
    } satisfies Mail);
  });

  it.each([
    [{ ...body, to: 'nobody' }, 'to_required'],
    [{ ...body, subject: ' ' }, 'subject_required'],
    [{ ...body, subject: 5 }, 'subject_required'],
    [{ ...body, html: '', text: '' }, 'body_required'],
    [{ to: [], subject: '', html: '' }, 'to_required'],
    [
      {
        ...body,
        to: Array.from({ length: 51 }, (_, index) => `u${index}@example.com`),
      },
      'too_many_recipients',
    ],
  ])('%p — %p', (raw, problem) => {
    expect(mailOf(raw, _OWN, DEFAULT_GATEWAY)).toEqual({
      problem: problem as MailProblem,
    });
  });

  it('домены получателей: свои и поддомены — да, чужие — отказ', () => {
    const gateway = { ...DEFAULT_GATEWAY, domains: ['example.com'] };
    expect(
      'problem' in
        mailOf(
          { ...body, to: ['a@example.com', 'b@mail.example.com'] },
          _OWN,
          gateway
        )
    ).toBe(false);
    expect(
      mailOf(
        { ...body, to: ['a@example.com', 'b@badexample.com'] },
        _OWN,
        gateway
      )
    ).toEqual({ problem: 'recipient_not_allowed' });
  });
});
