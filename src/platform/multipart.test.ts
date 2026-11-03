import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BodyBytes, bytesOf, spoolBody } from './body.ts';
import { fieldText, parseMultipart } from './multipart.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-multipart-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const text = (value: string) => new TextEncoder().encode(value);

const _B = 'XyZ';
const _TYPE = `multipart/form-data; boundary=${_B}`;

const parts = (body: string, type = _TYPE) =>
  ((bytes) =>
    parseMultipart(bytes, type)?.map((_) => ({
      name: _.name,
      filename: _.filename,
      type: _.type,
      value: fieldText(bytes, _),
    })) ?? null)(bytesOf(text(body)));

// Тело, как его собирает FormData: так шлют браузер, curl и инструменты агента. Тип с границей Bun
// отдаёт, только если спросить его до чтения тела.
const serialized = (form: FormData) => {
  const request = new Request('http://localhost/', {
    method: 'POST',
    body: form,
  });
  const type = request.headers.get('content-type')!;
  return request
    .arrayBuffer()
    .then((buffer) => ({ bytes: new Uint8Array(buffer), type }));
};

const file = (size: number) =>
  new Uint8Array(size).map((_, i) => (i * 7 + (i >> 10)) % 256);

describe('разбор multipart/form-data', () => {
  it('поля и файл — по порядку, файл — окно в тело без копии', async () => {
    const data = file(300_000);
    const form = new FormData();
    form.append('path', 'video/a b.mp4');
    form.append('file', new File([data], 'Ünï "q".mp4', { type: 'video/mp4' }));
    form.append('note', 'Grüße\r\n--не граница');
    const { bytes, type } = await serialized(form);
    const body = bytesOf(bytes);
    const found = parseMultipart(body, type)!;
    expect(found.map((_) => [_.name, _.filename, _.type])).toEqual([
      ['path', null, ''],
      ['file', 'Ünï %22q%22.mp4', 'video/mp4'],
      ['note', null, ''],
    ]);
    expect(fieldText(body, found[0]!)).toBe('video/a b.mp4');
    expect(fieldText(body, found[2]!)).toBe('Grüße\r\n--не граница');
    const content = body.read(found[1]!.start, found[1]!.end);
    expect(content).toEqual(data);
    expect(content.buffer).toBe(bytes.buffer);
  });

  it('из временного файла — те же части, разделитель на стыке окон чтения', async () => {
    // Первый файл кончается у границы окна в 1 МиБ: разделитель после него разрезан окнами.
    const first = file(1024 * 1024 - 120);
    const second = file(2 * 1024 * 1024 + 5);
    const form = new FormData();
    form.append('a', new File([first], 'a.bin'));
    form.append('b', new File([second], 'b.bin'));
    form.append('c', 'конец');
    const { bytes, type } = await serialized(form);
    const body: BodyBytes = await spoolBody(
      new Request('http://localhost/', { method: 'POST', body: bytes }),
      8 * 1024 * 1024,
      () => new Error('too large'),
      join(dir, 'spool.part')
    );
    const found = parseMultipart(body, type)!;
    expect(found.map((_) => [_.name, _.end - _.start])).toEqual([
      ['a', first.byteLength],
      ['b', second.byteLength],
      ['c', text('конец').byteLength],
    ]);
    expect(body.read(found[0]!.start, found[0]!.end).slice()).toEqual(first);
    expect(fieldText(body, found[2]!)).toBe('конец');
    body.close();
  });

  it('граница в кавычках, преамбула и эпилог; часть без имени пропускается', () => {
    expect(
      parts(
        `пролог\r\n--${_B}\r\nContent-Disposition: form-data\r\n\r\nx\r\n--${_B}\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--${_B}--\r\nэпилог`,
        `multipart/form-data; boundary="${_B}"`
      )
    ).toEqual([{ name: 'a', filename: null, type: '', value: '1' }]);
  });

  it('тип файла — как у FormData в Bun: из заголовка в нижнем регистре, без него — по расширению', () => {
    expect(
      parts(
        `--${_B}\r\nContent-Disposition: form-data; name="a"; filename="x.PDF"\r\n\r\n%PDF\r\n--${_B}\r\nContent-Disposition: form-data; name="b"; filename="x.txt"\r\nContent-Type: Text/Plain; Charset=UTF-8\r\n\r\nv\r\n--${_B}--`
      )?.map((_) => _.type)
    ).toEqual(['application/pdf', 'text/plain;charset=utf-8']);
  });

  it('пустая форма и пустое поле — не ошибка', () => {
    expect(parts(`--${_B}--\r\n`)).toEqual([]);
    expect(
      parts(
        `--${_B}\r\nContent-Disposition: form-data; name="e"\r\n\r\n\r\n--${_B}--`
      )
    ).toEqual([{ name: 'e', filename: null, type: '', value: '' }]);
  });

  it('не multipart, без границы, без конца или без заголовков — null', () => {
    expect(parts('{}', 'application/json')).toBeNull();
    expect(parts(`--${_B}--`, 'multipart/form-data')).toBeNull();
    expect(
      parts(`--${_B}\r\nContent-Disposition: form-data; name="a"\r\n\r\n1`)
    ).toBeNull();
    expect(parts(`--${_B}\r\n\r\nv\r\n--${_B}--`)).toBeNull();
    expect(parts('просто текст')).toBeNull();
    expect(parts('')).toBeNull();
  });
});
