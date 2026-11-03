import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BodyBytes, bytesOf, readBody, spoolBody } from './body.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-body-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let files = 0;
const spoolPath = (): string => join(dir, `body-${++files}.part`);

const _MB = 1024 * 1024;

const pattern = (size: number): Uint8Array =>
  new Uint8Array(size).map((_, i) => (i * 31 + (i >> 9)) % 251);

// Тело без Content-Length: кусками по 64 КБ, как chunked.
const chunked = (bytes: Uint8Array): Request =>
  new Request('http://localhost/', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start: (controller) => {
        Array.from({ length: Math.ceil(bytes.byteLength / 65536) }, (_, n) =>
          bytes.subarray(n * 65536, (n + 1) * 65536)
        ).forEach((_) => void controller.enqueue(_));
        controller.close();
      },
    }),
    duplex: 'half',
  });

const sized = (bytes: Uint8Array): Request =>
  new Request('http://localhost/', {
    method: 'POST',
    headers: { 'content-length': String(bytes.byteLength) },
    body: bytes,
  });

const tooLarge = () => new Error('too large');

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: Error) => error.message
  );

describe('тело запроса одним буфером', () => {
  it('с Content-Length и без него — те же байты', async () => {
    const bytes = pattern(3 * _MB + 17);
    expect(await readBody(sized(bytes), 4 * _MB, tooLarge)).toEqual(bytes);
    expect(await readBody(chunked(bytes), 4 * _MB, tooLarge)).toEqual(bytes);
    expect(
      await readBody(new Request('http://localhost/'), _MB, tooLarge)
    ).toEqual(new Uint8Array(0));
  });

  it('больше потолка — отказ: по Content-Length сразу, без него — по ходу чтения', async () => {
    const bytes = pattern(_MB + 1);
    expect(await failure(readBody(sized(bytes), _MB, tooLarge))).toBe(
      'too large'
    );
    expect(await failure(readBody(chunked(bytes), _MB, tooLarge))).toBe(
      'too large'
    );
  });

  it('bytesOf: окна — без копий, поиск и текст', async () => {
    const body = bytesOf(new TextEncoder().encode('ab--x--cd'));
    expect(body.read(2, 5).buffer).toBe(body.read(0, 1).buffer);
    expect(body.indexOf(new TextEncoder().encode('--'), 3)).toBe(5);
    expect(await body.text()).toBe('ab--x--cd');
  });
});

describe('тело запроса во временном файле', () => {
  const spooled = (request: Request, limit = 8 * _MB) =>
    ((path) =>
      spoolBody(request, limit, tooLarge, path).then((body) => ({
        body,
        path,
      })))(spoolPath());

  // Чтение окнами по 1 МиБ: окно перезаписывается следующим чтением — сразу копируем.
  const whole = (body: BodyBytes): Uint8Array =>
    Array.from({ length: Math.ceil(body.size / _MB) }, (_, n) =>
      body.read(n * _MB, (n + 1) * _MB).slice()
    ).reduce(
      (all, part, n) => (all.set(part, n * _MB), all),
      new Uint8Array(body.size)
    );

  it('тело — на диске, читается окнами и текстом; close удаляет файл', async () => {
    const bytes = pattern(2 * _MB + 333);
    const { body, path } = await spooled(sized(bytes));
    expect(body.size).toBe(bytes.byteLength);
    expect(whole(body)).toEqual(bytes);
    expect(body.read(_MB - 2, _MB + 3)).toEqual(
      bytes.subarray(_MB - 2, _MB + 3)
    );
    expect((await body.text()).length).toBeGreaterThan(0);
    body.close();
    body.close();
    expect(existsSync(path)).toBe(false);
  });

  it('поиск находит совпадение на стыке окон и за ним', async () => {
    const bytes = pattern(3 * _MB);
    const needle = new TextEncoder().encode('\r\n--boundary');
    bytes.set(needle, _MB - 5);
    bytes.set(needle, 2 * _MB + 100);
    const { body } = await spooled(chunked(bytes));
    expect(body.indexOf(needle, 0)).toBe(_MB - 5);
    expect(body.indexOf(needle, _MB)).toBe(2 * _MB + 100);
    expect(body.indexOf(needle, 2 * _MB + 101)).toBe(-1);
    body.close();
  });

  it('больше потолка — отказ, файла не остаётся', async () => {
    const big = pattern(_MB + 1);
    const paths = [spoolPath(), spoolPath()];
    expect(await failure(spoolBody(sized(big), _MB, tooLarge, paths[0]!))).toBe(
      'too large'
    );
    expect(
      await failure(spoolBody(chunked(big), _MB, tooLarge, paths[1]!))
    ).toBe('too large');
    expect(paths.filter((_) => existsSync(_))).toEqual([]);
  });
});
