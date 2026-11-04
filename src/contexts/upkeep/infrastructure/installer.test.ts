import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { zip } from '../../../platform/zip.ts';
import {
  buildTarget,
  type InstallFiles,
  installedBinary,
  previousOf,
  restorePrevious,
  updateProgram,
} from './installer.ts';

// Каталог установки с правилами Windows: запущенный файл не удалить и не перезаписать, а переименовать можно
// (ADR 0049). Жёсткая ссылка — тот же узел под вторым именем. Пути — через «/», ключи нормализуются: так тест
// одинаков на Linux и на раннере Windows, где node:path пишет «\».
type _Node = { content: string; running: boolean };

const _busy = (path: string): never => {
  throw Object.assign(new Error(`EBUSY: resource busy or locked, ${path}`), {
    code: 'EBUSY',
  });
};

const defineDisk = (
  initial: Readonly<Record<string, string>>,
  { windows = true, running = [] as readonly string[] } = {}
) => {
  const key = (path: string) => path.replaceAll('\\', '/');
  const nodes = new Map<string, _Node>(
    Object.entries(initial).map(({ 0: path, 1: content }) => [
      key(path),
      { content, running: running.includes(path) },
    ])
  );
  const locked = (path: string) => nodes.get(key(path))?.running === true;
  const files: InstallFiles = {
    windows,
    write: (path, bytes) =>
      Promise.resolve(
        windows && locked(path)
          ? _busy(path)
          : void nodes.set(key(path), {
              content: new TextDecoder().decode(bytes),
              running: false,
            })
      ),
    executable: () => undefined,
    copy: (from, to) =>
      windows && locked(to)
        ? _busy(to)
        : void nodes.set(key(to), {
            content: nodes.get(key(from))!.content,
            running: false,
          }),
    rename: (from, to) =>
      !nodes.has(key(from))
        ? _busy(from)
        : windows && locked(to)
          ? _busy(to)
          : (nodes.set(key(to), nodes.get(key(from))!),
            void nodes.delete(key(from))),
    remove: (path) =>
      windows && locked(path) ? _busy(path) : void nodes.delete(key(path)),
    alias: (binary, path) =>
      nodes.has(key(path))
        ? _busy(path)
        : void nodes.set(key(path), nodes.get(key(binary))!),
    exists: (path) => nodes.has(key(path)),
    same: (a, b) =>
      nodes.has(key(a)) && nodes.get(key(a)) === nodes.get(key(b)),
    list: (dir) =>
      [...nodes.keys()]
        .filter((_) => _.startsWith(`${key(dir)}/`))
        .map((_) => _.slice(key(dir).length + 1))
        .filter((_) => !_.includes('/')),
    check: (path) =>
      nodes.get(key(path))?.content.startsWith('Eile') ? null : 'not an exe',
  };
  return {
    files,
    read: (path: string) => nodes.get(key(path))?.content ?? null,
    names: () =>
      [...nodes.keys()].map((_) => _.slice(_.lastIndexOf('/') + 1)).sort(),
    /** Процесс завершился: его файл снова можно удалить. */
    stop: (path: string) =>
      [...nodes.values()]
        .filter((_) => _ === nodes.get(key(path)))
        .forEach((_) => void (_.running = false)),
  };
};

// Пути — через join, как их строит код: на раннере Windows разделитель «\».
const DIR = join('/Users', 'anna', 'AppData', 'Local', 'Programs', 'Eile');
const CMS = join(DIR, 'cms.exe');
const EILE = join(DIR, 'eile.exe');
const OLD = join(DIR, 'cms.old.exe');

const release = (target: string, name: string, archive: Uint8Array) => ({
  releases: () =>
    Promise.resolve([
      {
        version: '0.2.0',
        url: 'https://example.test/releases/v0.2.0',
        draft: false,
        assets: [
          { name, url: `https://example.test/download/${name}` },
          { name: 'SHA256SUMS', url: 'https://example.test/download/SUMS' },
        ],
      },
    ]),
  fetch: (url: string) =>
    Promise.resolve(
      url.endsWith('/SUMS')
        ? new Response(
            `${new Bun.CryptoHasher('sha256').update(archive).digest('hex')}  ${name}\n`
          )
        : url.endsWith(`/${name}`)
          ? new Response(archive)
          : new Response('Not Found', { status: 404 })
    ),
  target,
});

const windowsRelease = (content = 'Eile 0.2.0') =>
  release(
    'windows-x64',
    'cms-windows-x64.zip',
    zip([{ name: 'cms.exe', data: new TextEncoder().encode(content) }])
  );

const update = (
  disk: ReturnType<typeof defineDisk>,
  binary = CMS,
  feed = windowsRelease()
) =>
  updateProgram({
    releases: feed.releases,
    fetch: feed.fetch,
    target: feed.target,
    current: '0.1.0',
    binary,
    standalone: true,
    files: disk.files,
  });

describe('цель сборки', () => {
  it('Windows — windows-x64 и windows-arm64; чужие системы — нет сборок', () => {
    const probe = { musl: false, rosetta: false };
    expect(buildTarget({ ...probe, platform: 'win32', arch: 'x64' })).toBe(
      'windows-x64'
    );
    expect(buildTarget({ ...probe, platform: 'win32', arch: 'arm64' })).toBe(
      'windows-arm64'
    );
    expect(buildTarget({ ...probe, platform: 'win32', arch: 'ia32' })).toBe(
      null
    );
    expect(buildTarget({ ...probe, platform: 'freebsd', arch: 'x64' })).toBe(
      null
    );
    expect(
      buildTarget({ ...probe, platform: 'linux', arch: 'x64', musl: true })
    ).toBe('linux-x64-musl');
  });

  it('прежняя версия — с расширением последним: cms.old, cms.old.exe', () => {
    expect(previousOf('/usr/local/bin/cms')).toBe('/usr/local/bin/cms.old');
    expect(previousOf(CMS)).toBe(OLD);
    expect(previousOf('C:\\Tools\\CMS.EXE')).toBe('C:\\Tools\\CMS.old.EXE');
  });
});

describe('cms update на Windows', () => {
  it('запущенный cms.exe уходит в cms.old.exe, новый встаёт на место, eile.exe ведёт на новый', async () => {
    const disk = defineDisk(
      { [CMS]: 'Eile 0.1.0', [EILE]: 'Eile 0.1.0' },
      { running: [CMS] }
    );
    // eile.exe — жёсткая ссылка на cms.exe, как ставит install.ps1.
    disk.files.remove(EILE);
    disk.files.alias(CMS, EILE);
    const result = await update(disk);
    expect(result).toMatchObject({
      status: 'updated',
      binary: CMS,
      previous: OLD,
      alias: null,
    });
    expect(disk.read(CMS)).toBe('Eile 0.2.0');
    expect(disk.read(OLD)).toBe('Eile 0.1.0');
    expect(disk.files.same(EILE, CMS)).toBe(true);
    // Старая ссылка eile.exe — тот же запущенный файл: она ушла в сторону и ждёт следующего обновления.
    expect(disk.names().filter((_) => _.endsWith('.trash'))).toHaveLength(1);
    expect(disk.names().filter((_) => _.includes('.new.'))).toEqual([]);
  });

  it('запуск через eile.exe обновляет cms.exe рядом — это тот же файл', async () => {
    const disk = defineDisk({ [CMS]: 'Eile 0.1.0' }, { running: [CMS] });
    disk.files.alias(CMS, EILE);
    expect(installedBinary(EILE, disk.files)).toBe(CMS);
    const result = await update(disk, EILE);
    expect(result).toMatchObject({ binary: CMS });
    expect(disk.read(CMS)).toBe('Eile 0.2.0');
    expect(disk.read(EILE)).toBe('Eile 0.2.0');
  });

  it('eile.exe нет — появляется; чужой eile.exe не трогается', async () => {
    const fresh = defineDisk({ [CMS]: 'Eile 0.1.0' }, { running: [CMS] });
    expect(await update(fresh)).toMatchObject({ alias: EILE });
    expect(fresh.files.same(EILE, CMS)).toBe(true);

    const foreign = defineDisk(
      { [CMS]: 'Eile 0.1.0', [EILE]: 'чужая программа' },
      { running: [CMS] }
    );
    expect(await update(foreign)).toMatchObject({ alias: null });
    expect(foreign.read(EILE)).toBe('чужая программа');
    expect(installedBinary(EILE, foreign.files)).toBe(EILE);
  });

  it('cms.old.exe ещё запущен (старый сервер) — уходит в сторону; следующее обновление его убирает', async () => {
    const disk = defineDisk(
      { [CMS]: 'Eile 0.1.0', [OLD]: 'Eile 0.0.9' },
      { running: [CMS, OLD] }
    );
    await update(disk);
    expect(disk.read(OLD)).toBe('Eile 0.1.0');
    const trash = disk.names().filter((_) => _.endsWith('.trash'));
    expect(trash).toHaveLength(1);
    expect(disk.read(join(DIR, trash[0]!))).toBe('Eile 0.0.9');
    // Старый сервер остановлен; новая версия обновляется дальше и убирает остаток.
    disk.stop(join(DIR, trash[0]!));
    disk.stop(CMS);
    disk.stop(OLD);
    await update(disk, CMS, {
      ...windowsRelease('Eile 0.3.0'),
      releases: () =>
        windowsRelease('Eile 0.3.0')
          .releases()
          .then((_) => _.map((r) => ({ ...r, version: '0.3.0' }))),
    }).catch(() => undefined);
    expect(disk.names().filter((_) => _.endsWith('.trash'))).toEqual([]);
  });

  it('новый файл не встал на место — прежний cms.exe возвращается, временного файла нет', async () => {
    const disk = defineDisk({ [CMS]: 'Eile 0.1.0' }, { running: [CMS] });
    const rename = disk.files.rename;
    const files: InstallFiles = {
      ...disk.files,
      rename: (from, to) =>
        from.includes('.new.') ? _busy(to) : rename(from, to),
    };
    await expect(
      updateProgram({
        ...windowsRelease(),
        current: '0.1.0',
        binary: CMS,
        standalone: true,
        files,
      })
    ).rejects.toThrow('EBUSY');
    expect(disk.read(CMS)).toBe('Eile 0.1.0');
    expect(disk.names()).toEqual(['cms.exe']);
  });

  it('новая версия не запускается — установленный cms.exe не тронут', async () => {
    const disk = defineDisk({ [CMS]: 'Eile 0.1.0' }, { running: [CMS] });
    await expect(
      update(disk, CMS, windowsRelease('MZ broken'))
    ).rejects.toThrow('does not start');
    expect(disk.names()).toEqual(['cms.exe']);
  });

  it('откат на Windows: запущенная новая версия уходит в сторону, cms.old.exe — снова cms.exe и остаётся', async () => {
    const disk = defineDisk(
      { [CMS]: 'Eile 0.2.0', [OLD]: 'Eile 0.1.0' },
      { running: [CMS] }
    );
    disk.files.alias(CMS, EILE);
    restorePrevious(CMS, previousOf(CMS), disk.files);
    expect(disk.read(CMS)).toBe('Eile 0.1.0');
    expect(disk.read(OLD)).toBe('Eile 0.1.0');
    expect(disk.files.same(EILE, CMS)).toBe(true);
    expect(disk.names().filter((_) => _.endsWith('.trash'))).toHaveLength(2);
  });
});

describe('cms update на Linux и macOS с теми же файлами', () => {
  it('прежний — копией в cms.old, новый — одним переименованием; ссылка eile появляется', async () => {
    const bin = join('/opt', 'bin');
    const disk = defineDisk(
      { [join(bin, 'cms')]: 'Eile 0.1.0' },
      { windows: false }
    );
    const feed = release(
      'linux-x64',
      'cms-linux-x64.gz',
      Bun.gzipSync(new TextEncoder().encode('Eile 0.2.0'))
    );
    const result = await updateProgram({
      ...feed,
      current: '0.1.0',
      binary: join(bin, 'cms'),
      standalone: true,
      files: disk.files,
    });
    expect(result).toMatchObject({
      previous: join(bin, 'cms.old'),
      alias: join(bin, 'eile'),
    });
    expect(disk.names()).toEqual(['cms', 'cms.old', 'eile']);
    expect(disk.read(join(bin, 'cms'))).toBe('Eile 0.2.0');
    expect(disk.read(join(bin, 'cms.old'))).toBe('Eile 0.1.0');
  });
});
