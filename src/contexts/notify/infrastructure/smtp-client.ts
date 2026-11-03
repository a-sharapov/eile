import type { Socket, SocketHandler } from 'bun';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { SendFailure } from '../domain/delivery.ts';
import type { EmailSender, SmtpProbe } from '../domain/ports.ts';
import type { EmailSettings } from '../domain/settings.ts';
import { mailMime, mimeMessage } from './mime.ts';

/** Ответ сервера: код и строки текста (многострочный ответ — `250-…` и последняя `250 …`). */
type Reply = { readonly code: number; readonly lines: readonly string[] };

type Session = {
  /** Команда и ответ на неё; код вне `expect` — отказ с текстом сервера. */
  readonly command: (line: string, expect: readonly number[]) => Promise<Reply>;
  readonly greeting: (expect: readonly number[]) => Promise<Reply>;
  /** Тело письма после DATA: точка в начале строки удваивается, конец — `.` отдельной строкой. */
  readonly data: (body: string) => Promise<Reply>;
  /** STARTTLS: дальше разговор идёт по TLS с проверкой сертификата сервера. */
  readonly upgrade: () => Promise<void>;
  readonly close: () => void;
};

const _TIMEOUT_S = 30;
const _CONNECT_TIMEOUT_MS = 15_000;
const _REPLY = /^(\d{3})([ -])(.*)$/;
const _utf8 = new TextEncoder();

// 5xx — постоянный отказ (неверный пароль, нет ящика), 4xx и сеть — временный: очередь повторит.
const _failure = (message: string, permanent: boolean): SendFailure & Error =>
  Object.assign(new Error(message), { permanent, retryAfter: null });

const _rejected = (reply: Reply, line: string): SendFailure & Error =>
  _failure(
    `SMTP ${line.startsWith('AUTH') ? 'AUTH' : line.split(' ')[0]}: ${reply.code} ${reply.lines.join(' ')}`,
    reply.code >= 500
  );

/**
 * Соединение с почтовым сервером на сокетах Bun: TLS сразу (465) или после STARTTLS (587).
 *
 * После `upgradeTLS` прежние обработчики продолжают получать шифротекст исходного сокета, а ошибка
 * сертификата не отклоняет `connect` и не зовёт `error` — поэтому всё, что пришло не от текущего сокета,
 * пропускается, а отказ проверки ловит `handshake`. `socket.timeout` — срок, а не простой: взводится
 * заново на каждую команду. Своего срока на подключение у `Bun.connect` нет — он свой.
 */
const _open = (settings: EmailSettings): Promise<Session> =>
  new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    const waiting: {
      resolve: (reply: Reply) => void;
      reject: (error: Error) => void;
    }[] = [];
    const ready: Reply[] = [];
    let text = '';
    let lines: string[] = [];
    let broken: Error | null = null;
    let outgoing = new Uint8Array(0);
    let socket: Socket<undefined> | null = null;
    let upgraded: ((error: Error | null) => void) | null = null;
    let late = false;

    const settle = (reply: Reply): void =>
      void ((next) => (next ? next.resolve(reply) : ready.push(reply)))(
        waiting.shift()
      );

    const fail = (error: Error): void => {
      broken ??= error;
      waiting.splice(0).forEach((_) => void _.reject(broken!));
      void upgraded?.(broken);
    };

    // Строки до CRLF; ответ закончен строкой «код пробел текст».
    const parse = (): void => {
      const at = text.indexOf('\r\n');
      const line = at < 0 ? null : text.slice(0, at);
      const match = line === null ? null : _REPLY.exec(line);
      void (
        line !== null &&
        ((text = text.slice(at + 2)),
        (lines = [...lines, match ? match[3]! : line]),
        match &&
          match[2] === ' ' &&
          (settle({ code: Number(match[1]), lines }), (lines = [])),
        parse())
      );
    };

    const flush = (): void =>
      void (
        socket &&
        outgoing.length > 0 &&
        (outgoing = outgoing.subarray(Math.max(0, socket.write(outgoing))))
      );

    const current = (from: Socket<undefined>): boolean => from === socket;

    const handlers: SocketHandler<undefined> = {
      open: (from) => void (socket ??= from),
      data: (from, chunk) =>
        void (
          current(from) &&
          ((text += decoder.decode(chunk, { stream: true })), parse())
        ),
      drain: (from) => void (current(from) && flush()),
      end: (from) =>
        void (
          current(from) &&
          fail(_failure('The mail server closed the connection', false))
        ),
      close: (from) =>
        void (
          current(from) &&
          fail(_failure('The mail server closed the connection', false))
        ),
      error: (_from, error) => fail(_failure(error.message, false)),
      timeout: (from) =>
        void (
          current(from) &&
          (fail(_failure('The mail server did not answer in time', false)),
          from.terminate())
        ),
      // Сертификат не прошёл проверку — насовсем: повтор не поможет, нужен другой адрес или настройка.
      handshake: (from, success, authorizationError) =>
        void (
          current(from) &&
          (success && !authorizationError
            ? upgraded?.(null)
            : fail(
                _failure(
                  `TLS: ${authorizationError?.message ?? 'handshake failed'}`,
                  true
                )
              ))
        ),
    };

    const reply = (): Promise<Reply> =>
      broken
        ? Promise.reject(broken)
        : ready.length > 0
          ? Promise.resolve(ready.shift()!)
          : new Promise((done, refuse) =>
              waiting.push({ resolve: done, reject: refuse })
            );

    // Не влезло в сокет — остаток уйдёт по drain. Каждая запись взводит срок ответа заново.
    const write = (line: string): void => {
      const bytes = _utf8.encode(line);
      const next = new Uint8Array(outgoing.length + bytes.length);
      next.set(outgoing);
      next.set(bytes, outgoing.length);
      outgoing = next;
      socket?.timeout(_TIMEOUT_S);
      flush();
    };

    const expected =
      (line: string, expect: readonly number[]) =>
      (answer: Reply): Reply | Promise<never> =>
        expect.includes(answer.code)
          ? answer
          : Promise.reject(_rejected(answer, line));

    const session: Session = {
      greeting: (expect) => reply().then(expected('greeting', expect)),
      command: (line, expect) => (
        write(`${line}\r\n`), reply().then(expected(line, expect))
      ),
      data: (body) => (
        write(`${body.replace(/^\./gm, '..').replace(/\r?\n?$/, '')}\r\n.\r\n`),
        reply().then(expected('DATA', [250]))
      ),
      upgrade: () =>
        new Promise<void>((done, refuse) => {
          upgraded = (error) => (
            (upgraded = null), error ? refuse(error) : done()
          );
          text = '';
          socket = socket!.upgradeTLS({
            tls: { serverName: settings.host },
            socket: handlers,
          })[1];
          socket.timeout(_TIMEOUT_S);
        }),
      close: () => void socket?.end(),
    };

    const unreachable = (detail: string) =>
      _failure(`Cannot reach ${settings.host}: ${detail}`, false);

    const timer = setTimeout(
      () => ((late = true), reject(unreachable('connection timed out'))),
      _CONNECT_TIMEOUT_MS
    );

    Bun.connect({
      hostname: settings.host,
      port: settings.port,
      tls: settings.security === 'tls' ? { serverName: settings.host } : false,
      socket: {
        ...handlers,
        connectError: (_from, error) => reject(unreachable(error.message)),
      },
    }).then(
      (connected) => {
        clearTimeout(timer);
        // Подключился после отказа по сроку — никому не нужен.
        void (late
          ? connected.terminate()
          : ((socket ??= connected),
            connected.timeout(_TIMEOUT_S),
            resolve(session)));
      },
      (error) => (clearTimeout(timer), reject(unreachable(String(error))))
    );
  });

// Возможности сервера из ответа на EHLO: STARTTLS, AUTH PLAIN LOGIN.
const _has = (reply: Reply, word: string): boolean =>
  reply.lines.some((_) => _.toUpperCase().split(/\s+/).includes(word));

const _base64 = (text: string): string => _utf8.encode(text).toBase64();

const _login = (
  session: Session,
  settings: EmailSettings,
  hello: Reply
): Promise<unknown> =>
  settings.user === ''
    ? Promise.resolve()
    : _has(hello, 'PLAIN') || !_has(hello, 'LOGIN')
      ? session.command(
          `AUTH PLAIN ${_base64(`\0${settings.user}\0${settings.password}`)}`,
          [235]
        )
      : session
          .command('AUTH LOGIN', [334])
          .then(() => session.command(_base64(settings.user), [334]))
          .then(() => session.command(_base64(settings.password), [235]));

const _hello = (session: Session, settings: EmailSettings): Promise<Reply> =>
  session.command(`EHLO ${settings.from.split('@')[1] ?? 'localhost'}`, [250]);

// После STARTTLS сервер забывает прежний EHLO: здороваемся заново уже по TLS.
const _secure = (session: Session, settings: EmailSettings, hello: Reply) =>
  settings.security !== 'starttls'
    ? Promise.resolve(hello)
    : _has(hello, 'STARTTLS')
      ? session
          .command('STARTTLS', [220])
          .then(session.upgrade)
          .then(() => _hello(session, settings))
      : Promise.reject(
          _failure('The mail server does not offer STARTTLS', true)
        );

// Разговор целиком: приветствие, вход, конверт, письмо, QUIT; письмо собирается, когда сервер его ждёт.
const _transmit = (
  settings: EmailSettings,
  to: readonly string[],
  body: () => string
): Promise<void> =>
  _open(settings).then((session) =>
    session
      .greeting([220])
      .then(
        pipe(
          () => _hello(session, settings),
          (hello) => _secure(session, settings, hello),
          (hello) => _login(session, settings, hello),
          () => session.command(`MAIL FROM:<${settings.from}>`, [250]),
          () =>
            to.reduce<Promise<unknown>>(
              (chain, address) =>
                chain.then(() =>
                  session.command(`RCPT TO:<${address}>`, [250, 251])
                ),
              Promise.resolve()
            ),
          () => session.command('DATA', [354]),
          () => session.data(body()),
          () => session.command('QUIT', [221]).then(undefined, () => null)
        )
      )
      .then(
        () => session.close(),
        (error) => (session.close(), Promise.reject(error))
      )
  );

// Проверка связи не ждёт сроков отправки: 8 секунд на подключение и приветствие.
const _PROBE_MS = 8_000;
const _PROBE_TIMEOUT = 'The probe timed out';

const _PROBE_ERRORS: readonly (readonly [
  string,
  NonNullable<SmtpProbe['error']>,
])[] = [
  [_PROBE_TIMEOUT, 'timeout'],
  ['Cannot reach', 'connect_failed'],
  ['TLS:', 'tls_failed'],
];

// Причина — кодом, без текста сервера: ответ проверки виден без входа.
const _probeError = (error: unknown): NonNullable<SmtpProbe['error']> =>
  ((text) =>
    _PROBE_ERRORS.find(({ 0: start }) => text.startsWith(start))?.[1] ??
    'unexpected_reply')(error instanceof Error ? error.message : String(error));

const _greet = (settings: EmailSettings): Promise<void> =>
  _open(settings).then((session) =>
    session
      .greeting([220])
      .then(() => session.command('QUIT', [221]).then(undefined, () => null))
      .then(
        () => session.close(),
        (error) => (session.close(), Promise.reject(error))
      )
  );

const _probe = (settings: EmailSettings): Promise<SmtpProbe> => {
  const started = performance.now();
  const elapsed = (): number => Math.round(performance.now() - started);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    _greet(settings),
    new Promise<never>((_done, refuse) => {
      timer = setTimeout(() => refuse(new Error(_PROBE_TIMEOUT)), _PROBE_MS);
    }),
  ])
    .then(
      (): SmtpProbe => ({ ok: true, latencyMs: elapsed() }),
      (error): SmtpProbe => ({
        ok: false,
        latencyMs: elapsed(),
        error: _probeError(error),
      })
    )
    .finally(() => clearTimeout(timer));
};

/** Отправка письма по SMTP без зависимостей: `Bun.connect` и `upgradeTLS`, вход PLAIN или LOGIN. */
export var defineSmtpSender = (): EmailSender => ({
  send: (settings, to, item, site) =>
    _transmit(settings, to, () =>
      mimeMessage({ from: settings.from, to, item, site })
    ),
  mail: (settings, mail) =>
    _transmit(settings, mail.to, () =>
      mailMime({ envelope: settings.from, mail })
    ),
  probe: _probe,
});
