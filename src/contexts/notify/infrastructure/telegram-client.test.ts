import { afterEach, beforeEach, expect, it } from 'bun:test';
import type { Server } from 'bun';
import { message } from '../domain/message.ts';
import { defineTelegramClient } from './telegram-client.ts';

const _SETTINGS = {
  token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ',
  chats: [],
  proxy: '',
};

let server: Server<undefined>;
let requests: { path: string; body: any }[];
let answer: (path: string) => Response;

beforeEach(() => {
  requests = [];
  answer = () => Response.json({ ok: true, result: {} });
  server = Bun.serve({
    port: 0,
    fetch: (request) =>
      (request.method === 'POST' ? request.json() : Promise.resolve(null)).then(
        (body) => (
          requests.push({
            path: new URL(request.url).pathname + new URL(request.url).search,
            body,
          }),
          answer(new URL(request.url).pathname)
        )
      ),
  });
});

afterEach(() => server.stop(true));

const client = () => defineTelegramClient({ base: server.url.origin });

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error & { permanent?: boolean; retryAfter?: number | null }) => ({
      message: error.message,
      permanent: error.permanent,
      retryAfter: error.retryAfter,
    })
  );

it('sendMessage: HTML, без превью ссылок, в нужный чат', async () => {
  await client().send(
    _SETTINGS,
    '-100500',
    message({ title: 'Заявка' }),
    'Сайт'
  );
  expect(requests).toEqual([
    {
      path: `/bot${_SETTINGS.token}/sendMessage`,
      body: {
        chat_id: '-100500',
        text: '<b>Заявка</b>\n<i>Сайт</i>',
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
    },
  ]);
});

it('429 — временный отказ с паузой от Telegram', async () => {
  answer = () =>
    Response.json(
      {
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 7',
        parameters: { retry_after: 7 },
      },
      { status: 429 }
    );
  expect(
    await failureOf(client().send(_SETTINGS, '1', message({ title: 'x' }), ''))
  ).toEqual({
    message: 'Too Many Requests: retry after 7',
    permanent: false,
    retryAfter: 7000,
  });
});

it('403 — отказ насовсем: бота заблокировали', async () => {
  answer = () =>
    Response.json(
      {
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      },
      { status: 403 }
    );
  expect(
    (
      await failureOf(
        client().send(_SETTINGS, '1', message({ title: 'x' }), '')
      )
    )?.permanent
  ).toBe(true);
});

it('имя бота и чаты из обновлений, без повторов: имя — из последнего', async () => {
  answer = (path) =>
    Response.json({
      ok: true,
      result: path.endsWith('/getMe')
        ? { username: 'site_bot' }
        : [
            {
              message: {
                chat: { id: 42, first_name: 'Иван', last_name: 'Петров' },
              },
            },
            { message: { chat: { id: 42, first_name: 'Иван' } } },
            { my_chat_member: { chat: { id: -100500, title: 'Менеджеры' } } },
            { channel_post: { chat: { id: -100600, username: 'news' } } },
          ],
    });
  expect(await client().me(_SETTINGS)).toBe('@site_bot');
  expect(await client().chats(_SETTINGS)).toEqual([
    { id: '42', title: 'Иван' },
    { id: '-100500', title: 'Менеджеры' },
    { id: '-100600', title: '@news' },
  ]);
});

it('редирект не выполняется, а токен не попадает в текст ошибки', async () => {
  answer = () =>
    new Response(null, {
      status: 302,
      headers: { location: 'http://evil.test/' },
    });
  const failure = await failureOf(
    client().send(_SETTINGS, '1', message({ title: 'x' }), '')
  );
  expect(failure?.permanent).toBe(false);
  expect(failure?.message).not.toContain(_SETTINGS.token);
});

it('сервер недоступен — временный отказ', async () => {
  const origin = server.url.origin;
  server.stop(true);
  expect(
    (
      await failureOf(
        defineTelegramClient({ base: origin }).send(
          _SETTINGS,
          '1',
          message({ title: 'x' }),
          ''
        )
      )
    )?.permanent
  ).toBe(false);
});
