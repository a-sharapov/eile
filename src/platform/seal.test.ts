import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bytesSource,
  fileSource,
  keyIdOf,
  memorySink,
  newBackupKey,
  parseRecoveryKey,
  recoveryKeyOf,
  type SealSecret,
  seal,
  sealBytes,
  sealedSize,
  sealInfo,
  unseal,
  unsealBytes,
} from './seal.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-seal-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const _MB = 1024 * 1024;
const HEADER = 72;
const TAG = 16;

const pattern = (size: number): Uint8Array<ArrayBuffer> =>
  new Uint8Array(size).map((_, i) => (i * 31 + (i >> 9)) % 251);

const key = newBackupKey();
const secret: SealSecret = { key };

const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error) => (error as { code?: string }).code ?? String(error)
  );

const opened = (bytes: Uint8Array<ArrayBuffer>, with_: SealSecret = secret) =>
  unsealBytes(bytes, 'site', with_);

describe('запечатанный файл', () => {
  it('открывается тем же ключом: пусто, меньше куска, ровно кусок, несколько с хвостом', async () => {
    for (const size of [0, 1, 1000, _MB - 1, _MB, _MB + 1, 3 * _MB + 17]) {
      const plain = pattern(size);
      const sealed = await sealBytes(plain, 'site', secret);
      expect(sealed.byteLength).toBe(sealedSize(size));
      expect(await opened(sealed)).toEqual(plain);
    }
  });

  it('куски по 1 МиБ: последний неполный, при ровном размере — пустой с одной меткой', async () => {
    expect(sealedSize(0)).toBe(HEADER + TAG);
    expect(sealedSize(_MB)).toBe(HEADER + _MB + 2 * TAG);
    expect(sealedSize(2 * _MB + 5)).toBe(HEADER + 2 * _MB + 5 + 3 * TAG);
  });

  it('одно и то же содержимое запечатывается по-разному: у каждого файла своя соль', async () => {
    const plain = pattern(100);
    const a = await sealBytes(plain, 'site', secret);
    const b = await sealBytes(plain, 'site', secret);
    expect(a.subarray(HEADER)).not.toEqual(b.subarray(HEADER));
    expect(a.subarray(24, 56)).not.toEqual(b.subarray(24, 56));
  });

  it('в заголовке видны содержимое и отпечаток ключа, но не сам ключ', async () => {
    const sealed = await sealBytes(pattern(10), 'site', secret);
    expect(sealInfo(sealed)).toEqual({
      content: 'site',
      secret: 'key',
      keyId: keyIdOf(key),
    });
    expect(sealed.toHex()).not.toContain(key.toHex());
    expect(
      await codeOf(Promise.resolve().then(() => sealInfo(pattern(80))))
    ).toBe('seal.not_sealed');
  });

  it('подмена байта в куске, в заголовке или в метке — seal.damaged', async () => {
    const sealed = await sealBytes(pattern(2 * _MB + 100), 'site', secret);
    for (const at of [
      HEADER + 5,
      HEADER + _MB + TAG + 3,
      sealed.byteLength - 1,
      56,
      24,
    ]) {
      const changed = sealed.slice();
      changed[at]! ^= 1;
      expect(await codeOf(opened(changed))).toBe('seal.damaged');
    }
  });

  it('переставленные куски, обрезка и хвост — seal.damaged', async () => {
    const size = 3 * _MB;
    const sealed = await sealBytes(pattern(size), 'site', secret);
    const chunk = _MB + TAG;
    const swapped = sealed.slice();
    swapped.set(sealed.subarray(HEADER + chunk, HEADER + 2 * chunk), HEADER);
    swapped.set(sealed.subarray(HEADER, HEADER + chunk), HEADER + chunk);
    expect(await codeOf(opened(swapped))).toBe('seal.damaged');
    // Обрезка ровно по границе куска: последний кусок без метки «последний».
    expect(
      await codeOf(opened(sealed.subarray(0, HEADER + 2 * chunk + TAG)))
    ).toBe('seal.damaged');
    expect(await codeOf(opened(sealed.subarray(0, HEADER + 3 * chunk)))).toBe(
      'seal.damaged'
    );
    expect(
      await codeOf(opened(sealed.subarray(0, sealed.byteLength - 1)))
    ).toBe('seal.damaged');
    expect(await codeOf(opened(sealed.subarray(0, HEADER)))).toBe(
      'seal.damaged'
    );
    const longer = new Uint8Array(sealed.byteLength + TAG + 1);
    longer.set(sealed);
    expect(await codeOf(opened(longer))).toBe('seal.damaged');
  });

  it('чужой ключ — seal.wrong_key с отпечатком, до первого куска', async () => {
    const sealed = await sealBytes(pattern(10), 'site', secret);
    const error = await opened(sealed, { key: newBackupKey() }).then(
      () => null,
      (_) => _ as Error & { code: string }
    );
    expect(error?.code).toBe('seal.wrong_key');
    expect(error?.message).toContain(keyIdOf(key));
  });

  it('пароль: открывается тем же, другой — seal.wrong_passphrase; ключом вместо пароля — seal.wrong_secret', async () => {
    const plain = new TextEncoder().encode('{"format":"x"}');
    const sealed = await sealBytes(plain, 'settings', {
      passphrase: 'много слов подряд',
    });
    expect(sealInfo(sealed)).toMatchObject({
      content: 'settings',
      secret: 'passphrase',
      keyId: null,
    });
    expect(
      await unsealBytes(sealed, 'settings', { passphrase: 'много слов подряд' })
    ).toEqual(plain);
    expect(
      await codeOf(
        unsealBytes(sealed, 'settings', { passphrase: 'много слов подряд!' })
      )
    ).toBe('seal.wrong_passphrase');
    expect(await codeOf(unsealBytes(sealed, 'settings', secret))).toBe(
      'seal.wrong_secret'
    );
  });

  it('настройки вместо копии сайта и наоборот — seal.other_content', async () => {
    const sealed = await sealBytes(pattern(10), 'settings', secret);
    expect(await codeOf(opened(sealed))).toBe('seal.other_content');
  });

  it('файл на диске запечатывается и открывается кусками, без всего файла в памяти', async () => {
    const plain = pattern(2 * _MB + 333);
    const source = join(dir, 'plain.db');
    const target = join(dir, 'plain.db.enc');
    const back = join(dir, 'back.db');
    await Bun.write(source, plain);
    const writes: number[] = [];
    const sink = Bun.file(target).writer();
    await seal(fileSource(source), 'site', secret, {
      write: (_) => (writes.push(_.byteLength), sink.write(_)),
      flush: () => sink.flush(),
      end: () => sink.end(),
    });
    expect(writes).toEqual([HEADER, _MB + TAG, _MB + TAG, 333 + TAG]);
    const out = Bun.file(back).writer();
    await unseal(fileSource(target), 'site', secret, out);
    expect(await Bun.file(back).bytes()).toEqual(plain);
  });

  it('сбой чтения посередине: end() стока не зовётся', async () => {
    let ended = false;
    const sink = { ...memorySink(), end: () => void (ended = true) };
    const broken = {
      ...bytesSource(pattern(3 * _MB)),
      read: (start: number, end: number) =>
        start > _MB
          ? Promise.reject(new Error('disk'))
          : Promise.resolve(pattern(end - start)),
    };
    expect(await codeOf(seal(broken, 'site', secret, sink))).toContain('disk');
    expect(ended).toBe(false);
  });
});

describe('ключ восстановления', () => {
  it('55 знаков группами по 5 и обратно в тот же ключ', () => {
    const text = recoveryKeyOf(key);
    expect(text).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){10}$/);
    expect(parseRecoveryKey(text)).toEqual(key);
  });

  it('регистр, пробелы и похожие буквы не важны', () => {
    const text = recoveryKeyOf(key);
    const loose = text.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o');
    expect(parseRecoveryKey(loose)).toEqual(key);
  });

  it('опечатка и чужая строка — seal.invalid_recovery_key', () => {
    const text = recoveryKeyOf(key);
    const typo = `${text.slice(0, 3)}${text[3] === 'A' ? 'B' : 'A'}${text.slice(4)}`;
    for (const bad of [typo, text.slice(0, -1), 'hello', `${text}-AAAAA`]) {
      expect(() => parseRecoveryKey(bad)).toThrow(
        expect.objectContaining({ code: 'seal.invalid_recovery_key' })
      );
    }
  });
});
