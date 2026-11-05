import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { $ } from 'bun';
import { WINDOWS } from './fixtures/platform.ts';

// install.sh на поддельном релизе из file://: ставит cms и рядом второе имя eile.

const SCRIPT = resolve(import.meta.dir, '../install.sh');
const _TARGETS = [
  'linux-x64',
  'linux-arm64',
  'linux-x64-musl',
  'linux-arm64-musl',
  'darwin-x64',
  'darwin-arm64',
];
// Вместо бинарника — сценарий оболочки: установщику достаточно, что `cms version` отвечает.
const _FAKE = '#!/bin/sh\necho "Eile 9.9.9"\n';

const dir = mkdtempSync(join(tmpdir(), 'cms-install-'));
const release = join(dir, 'release');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const gz = Bun.gzipSync(new TextEncoder().encode(_FAKE));
const sum = new Bun.CryptoHasher('sha256').update(gz).digest('hex');
mkdirSync(release);
_TARGETS.forEach((_) => void writeFileSync(join(release, `cms-${_}.gz`), gz));
writeFileSync(
  join(release, 'SHA256SUMS'),
  `${_TARGETS.map((_) => `${sum}  cms-${_}.gz`).join('\n')}\n`
);
// Тот же выпуск с чужой суммой: архив будто подменён.
const forged = join(dir, 'forged');
mkdirSync(forged);
_TARGETS.forEach((_) => void writeFileSync(join(forged, `cms-${_}.gz`), gz));
writeFileSync(
  join(forged, 'SHA256SUMS'),
  `${_TARGETS.map((_) => `${'0'.repeat(64)}  cms-${_}.gz`).join('\n')}\n`
);

let bin = '';
beforeEach(() => {
  bin = join(mkdtempSync(join(dir, 'home-')), 'bin');
});

const install = (
  lang = 'ru_RU.UTF-8',
  env: Readonly<Record<string, string>> = {}
) =>
  $`bash ${SCRIPT}`
    .env({
      ...process.env,
      LANG: lang,
      LC_ALL: '',
      LC_MESSAGES: '',
      HOME: join(bin, '..'),
      CMS_DOWNLOAD_URL: `file://${release}`,
      CMS_INSTALL_DIR: bin,
      CMS_NO_MODIFY_PATH: '1',
      NO_COLOR: '1',
      ...env,
    })
    .quiet()
    .nothrow();

// install.sh — для Linux и macOS; install.ps1 проверяет workflow релиза на раннере Windows.
describe.skipIf(WINDOWS)('установщик', () => {
  it('ставит cms и рядом ссылку eile на него', async () => {
    const result = await install();
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toContain('второе имя — eile');
    expect(readlinkSync(join(bin, 'eile'))).toBe('cms');
    expect((await $`${join(bin, 'eile')} version`.text()).trim()).toBe(
      'Eile 9.9.9'
    );
  });

  it('повторная установка оставляет ссылку и не предупреждает о ней', async () => {
    await install();
    const again = await install();
    expect(again.exitCode).toBe(0);
    expect(again.stderr.toString()).not.toContain('не создано');
    expect(readlinkSync(join(bin, 'eile'))).toBe('cms');
  });

  // /tmp бывает tmpfs, то есть той же памятью, а архив с бинарником — под 200 МБ.
  it('скачанное — в каталоге установки, а не в TMPDIR; после установки там только cms и eile', async () => {
    const result = await install('ru_RU.UTF-8', {
      TMPDIR: join(dir, 'no-such-tmp'),
    });
    expect(result.exitCode).toBe(0);
    expect(readdirSync(bin).toSorted()).toEqual(['cms', 'eile']);
  });

  it('подменённый архив — отказ, в каталоге ничего не остаётся', async () => {
    const result = await install('ru_RU.UTF-8', {
      CMS_DOWNLOAD_URL: `file://${forged}`,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('не совпала');
    expect(readdirSync(bin)).toEqual([]);
  });

  it('на нерусской локали говорит по-английски', async () => {
    const result = await install('en_US.UTF-8');
    expect(result.exitCode).toBe(0);
    const text = result.stderr.toString();
    expect(text).toContain('downloading cms-');
    expect(text).toContain('Eile 9.9.9 installed:');
    expect(text).toContain('also as eile');
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('чужой eile в каталоге не трогает: только cms и предупреждение', async () => {
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'eile'), 'mine');
    const result = await install();
    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toContain('второе имя eile не создано');
    expect(readFileSync(join(bin, 'eile'), 'utf8')).toBe('mine');
    expect(readFileSync(join(bin, 'cms'), 'utf8')).toBe(_FAKE);
  });
});
