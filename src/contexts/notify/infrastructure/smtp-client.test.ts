import { afterEach, describe, expect, it } from 'bun:test';
import { createServer, type Server } from 'node:net';
import { TLSSocket } from 'node:tls';
import type { TCPSocketListener } from 'bun';
import { message } from '../domain/message.ts';
import type { EmailSettings } from '../domain/settings.ts';
import { defineSmtpSender } from './smtp-client.ts';

type Script = Readonly<Record<string, string>>;

const _DEFAULT: Script = {
  EHLO: '250-fake.test\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME',
  AUTH: '235 ok',
  'MAIL FROM': '250 ok',
  'RCPT TO': '250 ok',
  DATA: '354 go',
  QUIT: '221 bye',
};

// Поддельный почтовый сервер: отвечает по сценарию «начало команды → ответ», пишет разговор.
const fakeServer = (script: Script = {}) => {
  const heard: string[] = [];
  let mail = '';
  const reply = (line: string): string =>
    [...Object.entries(script), ...Object.entries(_DEFAULT)].find(
      ({ 0: start }) => line.startsWith(start)
    )?.[1] ?? '500 what';
  const server: TCPSocketListener<{ buffer: string; data: boolean }> =
    Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open: (socket) => {
          socket.data = { buffer: '', data: false };
          socket.write('220 fake ESMTP\r\n');
        },
        data: (socket, chunk) => {
          socket.data.buffer += new TextDecoder().decode(chunk);
          const lines = socket.data.buffer.split('\r\n');
          socket.data.buffer = lines.pop()!;
          lines.forEach((line) => {
            const body = socket.data.data;
            void (
              body &&
              (line === '.'
                ? ((socket.data.data = false), socket.write('250 queued\r\n'))
                : (mail += `${line}\r\n`))
            );
            void (
              !body &&
              (heard.push(line),
              ((answer) => (
                socket.write(`${answer}\r\n`),
                (socket.data.data = answer.startsWith('354')),
                line.startsWith('QUIT') && socket.end()
              ))(reply(line)))
            );
          });
        },
      },
    });
  return {
    port: server.port,
    heard,
    mail: () => mail,
    stop: () => server.stop(true),
  };
};

let server: ReturnType<typeof fakeServer> | null = null;

afterEach(() => server?.stop());

const settingsFor = (
  port: number,
  patch: Partial<EmailSettings> = {}
): EmailSettings => ({
  host: '127.0.0.1',
  port,
  security: 'none',
  user: 'site@example.com',
  password: 'пароль',
  from: 'site@example.com',
  to: ['a@example.com'],
  ...patch,
});

const _ITEM = message({
  topic: 'forms',
  title: 'Заявка',
  fields: [{ label: 'Имя', value: 'Иван' }],
});

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error & { permanent?: boolean }) => ({
      message: error.message,
      permanent: error.permanent,
    })
  );

describe('SMTP', () => {
  it('разговор целиком: EHLO, вход PLAIN, отправитель, адресаты, письмо, QUIT', async () => {
    server = fakeServer();
    await defineSmtpSender().send(
      settingsFor(server.port),
      ['a@example.com', 'b@example.com'],
      _ITEM,
      'Сайт'
    );
    expect(server.heard).toEqual([
      'EHLO example.com',
      `AUTH PLAIN ${new TextEncoder().encode('\0site@example.com\0пароль').toBase64()}`,
      'MAIL FROM:<site@example.com>',
      'RCPT TO:<a@example.com>',
      'RCPT TO:<b@example.com>',
      'DATA',
      'QUIT',
    ]);
    expect(server.mail()).toContain('To: <a@example.com>, <b@example.com>');
    expect(server.mail()).toContain('Content-Type: multipart/alternative');
  });

  it('без входа — без AUTH', async () => {
    server = fakeServer();
    await defineSmtpSender().send(
      settingsFor(server.port, { user: '', password: '' }),
      ['a@example.com'],
      _ITEM,
      ''
    );
    expect(server.heard.some((_) => _.startsWith('AUTH'))).toBe(false);
  });

  it('только LOGIN — вход по шагам', async () => {
    server = fakeServer({
      EHLO: '250-fake\r\n250 AUTH LOGIN',
      'AUTH LOGIN': '334 VXNlcm5hbWU6',
      [new TextEncoder().encode('site@example.com').toBase64()]:
        '334 UGFzc3dvcmQ6',
      [new TextEncoder().encode('пароль').toBase64()]: '235 ok',
    });
    await defineSmtpSender().send(
      settingsFor(server.port),
      ['a@example.com'],
      _ITEM,
      ''
    );
    expect(server.heard.slice(1, 4)).toEqual([
      'AUTH LOGIN',
      new TextEncoder().encode('site@example.com').toBase64(),
      new TextEncoder().encode('пароль').toBase64(),
    ]);
  });

  it('неверный пароль (5xx) — отказ насовсем, с ответом сервера', async () => {
    server = fakeServer({ AUTH: '535 5.7.8 Authentication failed' });
    expect(
      await failureOf(
        defineSmtpSender().send(
          settingsFor(server.port),
          ['a@example.com'],
          _ITEM,
          ''
        )
      )
    ).toEqual({
      message: 'SMTP AUTH: 535 5.7.8 Authentication failed',
      permanent: true,
    });
  });

  it('временный отказ (4xx) — очередь повторит', async () => {
    server = fakeServer({ 'RCPT TO': '451 4.7.1 Try again later' });
    expect(
      (
        await failureOf(
          defineSmtpSender().send(
            settingsFor(server.port),
            ['a@example.com'],
            _ITEM,
            ''
          )
        )
      )?.permanent
    ).toBe(false);
  });

  it('сервер не отвечает — временный отказ', async () => {
    server = fakeServer();
    const port = server.port;
    server.stop();
    server = null;
    expect(
      (
        await failureOf(
          defineSmtpSender().send(
            settingsFor(port),
            ['a@example.com'],
            _ITEM,
            ''
          )
        )
      )?.permanent
    ).toBe(false);
  });

  it('STARTTLS просили, а сервер его не предлагает — отказ без пароля в открытую', async () => {
    server = fakeServer();
    expect(
      await failureOf(
        defineSmtpSender().send(
          settingsFor(server.port, { security: 'starttls' }),
          ['a@example.com'],
          _ITEM,
          ''
        )
      )
    ).toEqual({
      message: 'The mail server does not offer STARTTLS',
      permanent: true,
    });
    expect(server.heard.some((_) => _.startsWith('AUTH'))).toBe(false);
  });
});

// Самоподписанный сертификат на сто лет: клиент обязан ему не поверить.
const _CERT = `-----BEGIN CERTIFICATE-----
MIIBmzCCAUGgAwIBAgIUdmJR6a3RRJU3o5GIPhNYShbOX1wwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAzMDE5MjAzOVoYDzIxMjYxMDA2
MTkyMDM5WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARMzGlVB/a81PBipAlbglbRVHrA1cUZ2q01nJ6/kPnoMhORjjBhdj/8
J5V4XleHDRhRauNHgZZ86tno/9VAwnCho28wbTAdBgNVHQ4EFgQUuDd2CAhm6+6d
bSPavwbXBs51b90wHwYDVR0jBBgwFoAUuDd2CAhm6+6dbSPavwbXBs51b90wDwYD
VR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZI
zj0EAwIDSAAwRQIhAIHCC/KouNMetfCKtWw0VlOT7h5dqnzryGob+YgvtYkmAiB/
ZWEX1a+CaotYBqdyjbnejB06YwjgnXyhaBk7ZuX60g==
-----END CERTIFICATE-----`;
const _KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg+oGWCfGohWUYyFNT
KxiS2IWKmkszGvyopOKsA3Qc4PChRANCAARMzGlVB/a81PBipAlbglbRVHrA1cUZ
2q01nJ6/kPnoMhORjjBhdj/8J5V4XleHDRhRauNHgZZ86tno/9VAwnCh
-----END PRIVATE KEY-----`;

describe('TLS', () => {
  let tlsServer: TCPSocketListener<undefined> | Server | null = null;
  const heard: string[] = [];

  afterEach(() => {
    void (
      tlsServer &&
      ('stop' in tlsServer ? tlsServer.stop(true) : tlsServer.close())
    );
    tlsServer = null;
    heard.length = 0;
  });

  it('TLS сразу: чужой сертификат — отказ насовсем, пароль не уходит', async () => {
    const listener = Bun.listen({
      hostname: '127.0.0.1',
      port: 0,
      tls: { cert: _CERT, key: _KEY },
      socket: {
        open: (socket) => void socket.write('220 secure\r\n'),
        data: (_socket, chunk) =>
          void heard.push(new TextDecoder().decode(chunk)),
      },
    });
    tlsServer = listener;
    const failure = await failureOf(
      defineSmtpSender().send(
        settingsFor(listener.port, { security: 'tls', host: 'localhost' }),
        ['a@example.com'],
        _ITEM,
        ''
      )
    );
    expect(failure?.permanent).toBe(true);
    expect(failure?.message).toStartWith('TLS:');
    expect(heard.join('')).not.toContain('AUTH');
  });

  it('STARTTLS: апгрейд идёт, шифротекст не читается как ответы, чужой сертификат — отказ', async () => {
    const server = createServer((plain) => {
      plain.write('220 fake\r\n');
      plain.on('data', (chunk) => {
        const line = chunk.toString('latin1');
        heard.push(line.trim());
        void (
          line.startsWith('EHLO') &&
          plain.write('250-fake\r\n250-STARTTLS\r\n250 AUTH PLAIN\r\n')
        );
        void (
          line.startsWith('STARTTLS') &&
          (plain.removeAllListeners('data'),
          plain.write('220 go ahead\r\n'),
          new TLSSocket(plain, { isServer: true, cert: _CERT, key: _KEY }).on(
            'error',
            () => undefined
          ))
        );
      });
    });
    tlsServer = server;
    const port = await new Promise<number>((done) =>
      server.listen(0, '127.0.0.1', () =>
        done((server.address() as { port: number }).port)
      )
    );
    const failure = await failureOf(
      defineSmtpSender().send(
        settingsFor(port, { security: 'starttls', host: 'localhost' }),
        ['a@example.com'],
        _ITEM,
        ''
      )
    );
    expect(heard).toEqual(['EHLO example.com', 'STARTTLS']);
    expect(failure?.permanent).toBe(true);
    expect(failure?.message).toStartWith('TLS:');
  });
});
