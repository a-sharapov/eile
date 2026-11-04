import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import {
  EMPTY_SETTINGS,
  type NotifySettings,
  parseSettings,
  restoredSettings,
  statusOf,
} from './settings.ts';

const _TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : 'not a domain error';
  }
};

const withTelegram: NotifySettings = parseSettings(
  {
    telegram: { token: _TOKEN, chats: [{ id: '-100123', title: 'Менеджеры' }] },
  },
  EMPTY_SETTINGS
);

const withEmail: NotifySettings = parseSettings(
  {
    email: {
      host: 'smtp.yandex.ru',
      security: 'tls',
      user: 'site@yandex.ru',
      password: 'secret',
      from: 'Site@Yandex.ru',
      to: 'a@example.com, b@example.com; a@example.com',
    },
  },
  EMPTY_SETTINGS
);

describe('Telegram', () => {
  it('токен, чаты и прокси', () => {
    expect(withTelegram.telegram).toEqual({
      token: _TOKEN,
      chats: [{ id: '-100123', title: 'Менеджеры' }],
      proxy: '',
    });
  });

  it('пустой токен — прежний: в форму он не возвращается', () => {
    const next = parseSettings(
      {
        telegram: {
          token: '',
          chats: ['@site_news'],
          proxy: 'http://10.0.0.1:3128',
        },
      },
      withTelegram
    );
    expect(next.telegram).toEqual({
      token: _TOKEN,
      chats: [{ id: '@site_news', title: '@site_news' }],
      proxy: 'http://10.0.0.1:3128',
    });
  });

  it.each([
    [{ token: '' }, 'notify.no_token'],
    [{ token: 'abc' }, 'notify.invalid_token'],
    [{ token: _TOKEN, chats: ['chat'] }, 'notify.invalid_chat'],
    [{ token: _TOKEN, proxy: 'socks://x' }, 'notify.invalid_proxy'],
  ])('%p — %p', (telegram, code) => {
    expect(codeOf(() => parseSettings({ telegram }, EMPTY_SETTINGS))).toBe(
      code
    );
  });

  it('null убирает канал', () => {
    expect(parseSettings({ telegram: null }, withTelegram).telegram).toBeNull();
  });
});

describe('почта', () => {
  it('порт по шифрованию, адреса строчными и без повторов', () => {
    expect(withEmail.email).toEqual({
      transport: 'smtp',
      host: 'smtp.yandex.ru',
      port: 465,
      security: 'tls',
      user: 'site@yandex.ru',
      password: 'secret',
      from: 'site@yandex.ru',
      to: ['a@example.com', 'b@example.com'],
    });
  });

  it('пустой пароль — прежний, но только для того же сервера и входа', () => {
    const same = { ...withEmail.email!, password: '' };
    expect(parseSettings({ email: same }, withEmail).email).toMatchObject({
      password: 'secret',
    });
    expect(
      codeOf(() =>
        parseSettings({ email: { ...same, host: 'smtp.mail.ru' } }, withEmail)
      )
    ).toBe('notify.no_password');
  });

  it('без входа пароль не нужен', () => {
    expect(
      parseSettings(
        {
          email: {
            host: 'relay',
            security: 'none',
            from: 'a@b.ru',
            to: 'c@d.ru',
          },
        },
        EMPTY_SETTINGS
      ).email
    ).toMatchObject({ port: 25, user: '', password: '' });
  });

  it.each([
    [{ host: 'bad host' }, 'notify.invalid_host'],
    [{ port: 70000 }, 'notify.invalid_port'],
    [{ security: 'ssl' }, 'notify.invalid_security'],
    [{ from: 'nobody' }, 'notify.invalid_email'],
    [{ to: '' }, 'notify.invalid_email'],
  ])('%p — %p', (patch, code) => {
    expect(
      codeOf(() =>
        parseSettings(
          { email: { ...withEmail.email!, password: 'x', ...patch } },
          EMPTY_SETTINGS
        )
      )
    ).toBe(code);
  });
});

describe('почта через HTTP API', () => {
  const _BREVO = 'xkeysib-0123456789abcdef0123456789abcdef-AbCdEfGh12345678';
  const _SES_SECRET = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
  const _ADDRESSES = {
    from: 'Site@Muehlenhof.example',
    to: 'boss@muehlenhof.example',
  };

  const api = (email: Record<string, unknown>, previous = EMPTY_SETTINGS) =>
    parseSettings({ email: { ..._ADDRESSES, ...email } }, previous).email;

  it('Brevo: ключ и адреса, лишних полей нет', () => {
    expect(api({ transport: 'brevo', key: ` ${_BREVO} ` })).toEqual({
      transport: 'brevo',
      key: _BREVO,
      keyId: '',
      region: '',
      domain: '',
      stream: '',
      from: 'site@muehlenhof.example',
      to: ['boss@muehlenhof.example'],
    });
  });

  it('Postmark: поток по умолчанию outbound', () => {
    expect(
      api({
        transport: 'postmark',
        key: '00000000-1111-2222-3333-444444444444',
      })
    ).toMatchObject({ transport: 'postmark', stream: 'outbound' });
    expect(
      api({
        transport: 'postmark',
        key: '00000000-1111-2222-3333-444444444444',
        stream: 'broadcast',
      })
    ).toMatchObject({ stream: 'broadcast' });
  });

  it('Mailgun: регион us по умолчанию, домен — из адреса отправителя', () => {
    expect(
      api({ transport: 'mailgun', key: 'mailgun-test-key-not-a-real-one' })
    ).toMatchObject({ region: 'us', domain: 'muehlenhof.example' });
    expect(
      api({
        transport: 'mailgun',
        key: 'mailgun-test-key-not-a-real-one',
        region: 'EU',
        domain: 'MG.Muehlenhof.example',
      })
    ).toMatchObject({ region: 'eu', domain: 'mg.muehlenhof.example' });
  });

  it('SES: регион и ключ доступа', () => {
    expect(
      api({
        transport: 'ses',
        region: 'eu-central-1',
        keyId: 'akiaiosfodnn7example',
        key: _SES_SECRET,
      })
    ).toMatchObject({
      region: 'eu-central-1',
      keyId: 'AKIAIOSFODNN7EXAMPLE',
      key: _SES_SECRET,
    });
  });

  it.each([
    [{ transport: 'sendgrid' }, 'notify.invalid_transport'],
    [{ transport: 'brevo' }, 'notify.no_key'],
    [{ transport: 'brevo', key: 'short' }, 'notify.invalid_key'],
    [
      { transport: 'brevo', key: 'xsmtpsib-0123456789abcdef0123456789abcdef' },
      'notify.brevo_smtp_key',
    ],
    [
      { transport: 'resend', key: 'sk_0123456789abcdef0123456789' },
      'notify.resend_key',
    ],
    [
      {
        transport: 'postmark',
        key: '00000000-1111-2222-3333-444444444444',
        stream: 'no spaces',
      },
      'notify.invalid_stream',
    ],
    [
      { transport: 'mailgun', key: _BREVO, region: 'asia' },
      'notify.invalid_region',
    ],
    [
      { transport: 'mailgun', key: _BREVO, domain: 'not a domain' },
      'notify.invalid_mail_domain',
    ],
    [
      { transport: 'ses', key: _SES_SECRET, keyId: 'AKIAIOSFODNN7EXAMPLE' },
      'notify.invalid_region',
    ],
    [
      { transport: 'ses', key: _SES_SECRET, region: 'eu-central-1' },
      'notify.no_key_id',
    ],
    [
      {
        transport: 'ses',
        key: _SES_SECRET,
        region: 'eu-central-1',
        keyId: 'ASIAIOSFODNN7EXAMPLE',
      },
      'notify.temporary_key',
    ],
    [
      { transport: 'brevo', key: _BREVO, from: 'nobody' },
      'notify.invalid_email',
    ],
  ])('%p — %p', (email, code) => {
    expect(codeOf(() => api(email))).toBe(code);
  });

  it('пустой ключ — прежний, но только для того же сервиса, региона и ключа доступа', () => {
    const ses = parseSettings(
      {
        email: {
          ..._ADDRESSES,
          transport: 'ses',
          region: 'eu-central-1',
          keyId: 'AKIAIOSFODNN7EXAMPLE',
          key: _SES_SECRET,
        },
      },
      EMPTY_SETTINGS
    );
    const again = {
      transport: 'ses',
      region: 'eu-central-1',
      keyId: 'AKIAIOSFODNN7EXAMPLE',
      to: 'boss@muehlenhof.example, sales@muehlenhof.example',
    };
    expect(api(again, ses)).toMatchObject({
      key: _SES_SECRET,
      to: ['boss@muehlenhof.example', 'sales@muehlenhof.example'],
    });
    expect(codeOf(() => api({ ...again, region: 'us-east-1' }, ses))).toBe(
      'notify.no_key'
    );
    expect(
      codeOf(() => api({ ...again, keyId: 'AKIAOTHERKEY0000000' }, ses))
    ).toBe('notify.no_key');
    expect(codeOf(() => api({ transport: 'brevo' }, ses))).toBe(
      'notify.no_key'
    );
    expect(codeOf(() => api({ transport: 'brevo' }, withEmail))).toBe(
      'notify.no_key'
    );
  });

  it('пароль SMTP не переходит к провайдеру, ключ провайдера — к SMTP', () => {
    const brevo = parseSettings(
      { email: { ..._ADDRESSES, transport: 'brevo', key: _BREVO } },
      withEmail
    );
    expect(JSON.stringify(brevo.email)).not.toContain('secret');
    expect(
      codeOf(() =>
        parseSettings({ email: { ...withEmail.email!, password: '' } }, brevo)
      )
    ).toBe('notify.no_password');
  });

  it('менеджер видит провайдера и последние четыре знака ключа, но не ключ', () => {
    const brevo = parseSettings(
      { email: { ..._ADDRESSES, transport: 'brevo', key: _BREVO } },
      EMPTY_SETTINGS
    );
    const status = statusOf(brevo);
    expect(status.email).toEqual({
      transport: 'brevo',
      keyId: '',
      region: '',
      domain: '',
      stream: '',
      from: 'site@muehlenhof.example',
      to: ['boss@muehlenhof.example'],
      keyHint: '5678',
    });
    expect(JSON.stringify(status)).not.toContain(_BREVO);
    expect(status.gateway.checks.smtp).toBe(true);
  });

  it('почта прежней версии — без способа отправки — читается как SMTP', () => {
    const { transport: _transport, ...old } = withEmail.email as Record<
      string,
      unknown
    >;
    expect(restoredSettings({ email: old }).email).toEqual(withEmail.email);
    expect(restoredSettings({}).email).toBeNull();
  });
});

it('маршруты — только известные каналы, порог — известная важность', () => {
  const next = parseSettings(
    { forms: ['email', 'sms'], incidents: [], level: 'warning' },
    EMPTY_SETTINGS
  );
  expect(next).toMatchObject({
    forms: ['email'],
    incidents: [],
    level: 'warning',
  });
  expect(codeOf(() => parseSettings({ level: 'loud' }, EMPTY_SETTINGS))).toBe(
    'notify.invalid_level'
  );
});

it('менеджер не видит токена и пароля', () => {
  const status = JSON.stringify(
    statusOf({ ...withTelegram, email: withEmail.email })
  );
  expect(status).not.toContain(_TOKEN);
  expect(status).not.toContain('secret');
  expect(status).toContain('"hasToken":true');
  expect(status).toContain('"hasPassword":true');
});
