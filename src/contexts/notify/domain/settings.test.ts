import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import {
  EMPTY_SETTINGS,
  type NotifySettings,
  parseSettings,
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
    expect(parseSettings({ email: same }, withEmail).email!.password).toBe(
      'secret'
    );
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
