import { describe, expect, it } from 'bun:test';
import {
  type Json,
  jsonPieces,
  measured,
  type Piece,
  streamed,
} from './api-body.ts';

const bytesOf = (pieces: () => Iterable<Piece>) =>
  ((size) => new Response(streamed(pieces, size)).bytes())(
    measured(pieces, false).length
  );

const random = (size: number) =>
  crypto.getRandomValues(new Uint8Array(size)).map((_) => _);

const joined = (parts: readonly Uint8Array[]) =>
  parts.reduce(
    (all, part) =>
      ((next) => (next.set(all), next.set(part, all.length), next))(
        new Uint8Array(all.length + part.length)
      ),
    new Uint8Array(0)
  );

describe('тело запроса потоком', () => {
  it.each([
    [[0]],
    [[1]],
    [[2]],
    [[1, 1, 1, 1]],
    [[2, 2, 2]],
    [[1, 5, 7, 100_000, 2]],
    [[3 * 16_384 + 1, 4, 5]],
    [[600_000, 1, 300_001]],
  ])('base64 потока из кусков %p — как base64 их склейки', async (sizes) => {
    const parts = sizes.map(random);
    const pieces = () => ['"', { base64: () => parts }, '"'];
    const body = new TextDecoder().decode(await bytesOf(pieces));
    expect(body).toBe(`"${joined(parts).toBase64()}"`);
  });

  it('JSON кусками — как JSON.stringify; undefined у ключа — ключа нет', async () => {
    const tree: Json = {
      a: 'кавычка " и\nперевод строки',
      b: [1, null, true, { c: undefined, d: 'é' }],
      e: { base64: () => ['hello', new Uint8Array([1, 2, 3, 4])] },
    };
    const text = new TextDecoder().decode(
      await bytesOf(() => jsonPieces(tree))
    );
    expect(JSON.parse(text)).toEqual({
      a: 'кавычка " и\nперевод строки',
      b: [1, null, true, { d: 'é' }],
      e: new Uint8Array([104, 101, 108, 108, 111, 1, 2, 3, 4]).toBase64(),
    });
  });

  it('длина и SHA-256 первого прохода — те же, что у отправленного тела', async () => {
    const big = random(700_000);
    const pieces = () => jsonPieces({ data: { base64: () => ['MIME ', big] } });
    const { length, sha256 } = measured(pieces, true);
    const sent = await new Response(streamed(pieces, length)).bytes();
    expect(sent.length).toBe(length);
    expect(measured(pieces, false).length).toBe(length);
    expect(new Bun.CryptoHasher('sha256').update(sent).digest('hex')).toBe(
      sha256!
    );
  });

  it('второй проход дал другую длину — поток обрывается ошибкой', async () => {
    let calls = 0;
    const pieces = () => [(calls += 1) === 1 ? 'short' : 'longer body'];
    const { length } = measured(pieces, false);
    await expect(
      new Response(streamed(pieces, length)).bytes()
    ).rejects.toThrow('The request body changed between the two passes');
  });
});
