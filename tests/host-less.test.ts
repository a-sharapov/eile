import { afterEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { defineHttpListener } from '../src/contexts/certificates/index.ts';
import { errorLine, withAbsoluteUrl } from '../src/platform/request-url.ts';
import { DEMO } from './fixtures/demo.ts';

// Сканеры портов шлют HTTP/1.0 без Host: Bun отдаёт обработчику голый путь, и разбор адреса падал с 500
// и простынёй в журнале. Проверяем настоящим TCP-запросом, как это приходит в жизни.

let app: App | null = null;
let server: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  server?.stop(true);
  server = null;
  app?.close();
  app = null;
});

const raw = (port: number, text: string): Promise<string> =>
  new Promise((resolve, reject) => {
    let answer = '';
    void Bun.connect({
      hostname: '127.0.0.1',
      port,
      socket: {
        open: (socket) => void socket.write(text),
        data: (_socket, chunk) => void (answer += chunk.toString()),
        close: () => resolve(answer),
        error: (_socket, error) => reject(error),
      },
    });
  });

const logged: unknown[] = [];
const serve = (fetch: (request: Request) => Promise<Response>) =>
  Bun.serve({
    port: 0,
    fetch,
    development: false,
    error: (error) => (
      logged.push(error), new Response('Internal Server Error', { status: 500 })
    ),
  });

describe('запрос без Host', () => {
  it('сайт отвечает 400 и ничего не пишет в журнал; обычный запрос — как раньше', async () => {
    app = createApp({ scaffold: DEMO });
    server = serve(app.fetch);
    logged.length = 0;
    const scan = await raw(
      server.port!,
      'GET /nice%20ports%2C/Tri%6Eity.txt%2ebak HTTP/1.0\r\n\r\n'
    );
    expect(scan.split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request');
    const bare = await raw(server.port!, 'GET / HTTP/1.0\r\n\r\n');
    expect(bare.split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request');
    expect(logged).toEqual([]);
    const normal = await raw(
      server.port!,
      'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'
    );
    expect(normal.split('\r\n')[0]).toBe('HTTP/1.1 200 OK');
  });

  it('HTTP-порт рядом с HTTPS — тоже 400, а не 500', async () => {
    server = serve(
      withAbsoluteUrl(
        defineHttpListener({
          domains: ['a.de'],
          httpsPort: 443,
          challenge: () => null,
          secured: () => true,
          site: () => Promise.resolve(new Response('site')),
        })
      )
    );
    logged.length = 0;
    const answer = await raw(server.port!, 'GET / HTTP/1.0\r\n\r\n');
    expect(answer.split('\r\n')[0]).toBe('HTTP/1.1 400 Bad Request');
    expect(logged).toEqual([]);
  });

  it('ошибка для журнала — строка со стеком, без объекта', () => {
    const line = errorLine(new TypeError('Invalid URL'));
    expect(line.startsWith('TypeError: Invalid URL')).toBe(true);
    expect(errorLine('plain')).toBe('plain');
  });
});
