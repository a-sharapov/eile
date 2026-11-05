import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zip } from '../src/platform/zip.ts';
import { removeTemp, WINDOWS } from './fixtures/platform.ts';

// install.ps1 (ADR 0049): на любой системе — что файл чистый ASCII; на Windows — установка с поддельного
// релиза из file:// через Windows PowerShell 5.1, тот, что есть на каждой Windows.

const SCRIPT = resolve(import.meta.dir, '../install.ps1');

it('install.ps1 — только ASCII: Windows PowerShell 5.1 читает irm как ISO-8859-1', () => {
  const bytes = readFileSync(SCRIPT);
  expect(bytes.findIndex((_) => _ > 0x7f)).toBe(-1);
  expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
});

describe.if(WINDOWS)('install.ps1 на Windows', () => {
  // Каталог и поддельный релиз — в beforeAll: тело describe выполняется и тогда, когда он пропущен.
  let dir = '';
  let release = '';
  let archive: Uint8Array = new Uint8Array();
  const names = ['cms-windows-x64.zip', 'cms-windows-arm64.zip'];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cms-install-ps1-'));
    release = join(dir, 'release');
    mkdirSync(join(dir, 'fake'));
    const fake = join(dir, 'fake', 'cms.exe');
    const built = Bun.spawnSync(
      [
        process.execPath,
        'build',
        '--compile',
        resolve(import.meta.dir, 'fixtures/fake-cms.ts'),
        '--outfile',
        fake,
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    );
    expect(built.exitCode).toBe(0);
    archive = zip([{ name: 'cms.exe', data: readFileSync(fake) }]);
    const sum = new Bun.CryptoHasher('sha256').update(archive).digest('hex');
    mkdirSync(release);
    names.forEach((_) => void writeFileSync(join(release, _), archive));
    writeFileSync(
      join(release, 'SHA256SUMS'),
      `${names.map((_) => `${sum}  ${_}`).join('\n')}\n`
    );
  }, 120_000);
  afterAll(() => removeTemp(dir));

  let count = 0;
  const fresh = () => join(dir, `bin-${++count}`);

  const install = (bin: string, sums = release) =>
    Bun.spawnSync(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        SCRIPT,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          CMS_DOWNLOAD_URL: pathToFileURL(sums).href,
          CMS_INSTALL_DIR: bin,
          CMS_NO_MODIFY_PATH: '1',
          NO_COLOR: '1',
        },
      }
    );

  const output = (result: ReturnType<typeof install>) =>
    `${result.stdout.toString()}${result.stderr.toString()}`;

  const sameFile = (a: string, b: string) =>
    statSync(a, { bigint: true }).ino === statSync(b, { bigint: true }).ino;

  it('ставит cms.exe и рядом eile.exe — жёсткую ссылку на тот же файл', () => {
    const bin = fresh();
    const result = install(bin);
    expect(output(result)).toContain('Eile 9.9.9 installed');
    expect(result.exitCode).toBe(0);
    expect(sameFile(join(bin, 'cms.exe'), join(bin, 'eile.exe'))).toBe(true);
    expect(
      Bun.spawnSync([join(bin, 'eile.exe'), 'version']).stdout.toString()
    ).toContain('Eile 9.9.9');
  }, 120_000);

  it('повторная установка при запущенном cms.exe: прежний — cms.old.exe, eile.exe — на новый', async () => {
    const bin = fresh();
    expect(install(bin).exitCode).toBe(0);
    const server = Bun.spawn([join(bin, 'cms.exe'), 'serve']);
    try {
      await Bun.sleep(500);
      const result = install(bin);
      expect(output(result)).toContain('installed');
      expect(result.exitCode).toBe(0);
      expect(statSync(join(bin, 'cms.old.exe')).isFile()).toBe(true);
      expect(sameFile(join(bin, 'cms.exe'), join(bin, 'eile.exe'))).toBe(true);
      expect(sameFile(join(bin, 'cms.exe'), join(bin, 'cms.old.exe'))).toBe(
        false
      );
    } finally {
      server.kill();
      await server.exited;
    }
  }, 180_000);

  it('файла нет в релизе — отказ с причиной, а не одно «download failed»', () => {
    const empty = join(dir, 'empty-release');
    mkdirSync(empty);
    const result = install(fresh(), empty);
    expect(result.exitCode).toBe(1);
    expect(output(result)).toMatch(
      /download failed: \S+cms-windows-\w+\.zip \(.+\)/
    );
  }, 120_000);

  it('подменённый архив — отказ с кодом 1, ничего не поставлено', () => {
    const tampered = join(dir, 'tampered');
    mkdirSync(tampered);
    names.forEach(
      (_) => void writeFileSync(join(tampered, _), archive.subarray(0, 1024))
    );
    writeFileSync(
      join(tampered, 'SHA256SUMS'),
      readFileSync(join(release, 'SHA256SUMS'))
    );
    const bin = fresh();
    const result = install(bin, tampered);
    expect(result.exitCode).toBe(1);
    expect(output(result)).toContain('checksum');
    expect(Bun.file(join(bin, 'cms.exe')).size).toBe(0);
  }, 120_000);

  it('чужой eile.exe не трогает: только cms.exe и предупреждение', () => {
    const bin = fresh();
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'eile.exe'), 'someone else');
    const result = install(bin);
    expect(result.exitCode).toBe(0);
    expect(output(result)).toContain('is not Eile');
    expect(readFileSync(join(bin, 'eile.exe'), 'utf8')).toBe('someone else');
  }, 120_000);
});
