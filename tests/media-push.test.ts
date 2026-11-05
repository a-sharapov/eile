import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { MAX_MEDIA_SIZE } from '../src/contexts/media/index.ts';
import {
  type MediaPushReport,
  parseInto,
  pushMedia,
  readMediaFolder,
} from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';
import { picture } from './fixtures/images.ts';
import { WINDOWS } from './fixtures/platform.ts';

const root = mkdtempSync(join(tmpdir(), 'cms-media-push-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let folders = 0;
let folder = '';

const put = (path: string, data: string | Uint8Array): void => (
  mkdirSync(dirname(join(folder, path)), { recursive: true }),
  writeFileSync(join(folder, path), data)
);

beforeEach(() => {
  folder = join(root, `folder-${++folders}`);
  mkdirSync(folder, { recursive: true });
});

const run = (
  app: App,
  options: { prune?: boolean; dryRun?: boolean; into?: string } = {}
): Promise<MediaPushReport> =>
  readMediaFolder(folder, options.into ?? '').then((_) =>
    pushMedia(app, _, options)
  );

const paths = (app: App): string[] =>
  app.media.files
    .list()
    .map((_) => _.path)
    .sort();

describe('cms media push', () => {
  it('новое сохраняется, совпавшее пропускается, изменённое — новой версией', async () => {
    const app = createApp({ scaffold: DEMO });
    put('fonts/pt-sans.woff2', 'font-1');
    put('video/intro.webm', new Uint8Array(3 * 1024 * 1024 + 17).fill(7));
    const first = await run(app);
    expect(first).toMatchObject({
      added: ['fonts/pt-sans.woff2', 'video/intro.webm'],
      changed: [],
      same: 0,
      problems: [],
      saved: true,
    });
    const video = app.media.files.read('video/intro.webm')!;
    expect(video.meta.size).toBe(3 * 1024 * 1024 + 17);
    expect(video.chunk(3 * 1024 * 1024, 17)).toEqual(
      new Uint8Array(17).fill(7)
    );
    const before = app.media.url('fonts/pt-sans.woff2');

    expect(await run(app)).toMatchObject({
      added: [],
      changed: [],
      same: 2,
      saved: true,
    });
    expect(app.media.url('fonts/pt-sans.woff2')).toBe(before);

    // Тот же размер, другое содержимое: сверка по хэшу, а не по длине.
    put('fonts/pt-sans.woff2', 'font-2');
    const changed = await run(app);
    expect(changed).toMatchObject({
      added: [],
      changed: ['fonts/pt-sans.woff2'],
      same: 1,
    });
    expect(app.media.url('fonts/pt-sans.woff2')).not.toBe(before);
    expect(
      await app
        .fetch(
          new Request(`http://localhost${app.media.url('fonts/pt-sans.woff2')}`)
        )
        .then((_) => _.text())
    ).toBe('font-2');
    app.close();
  });

  it('скрытое и следы архиваторов не читаются, media.json в медиатеку не идёт', async () => {
    const app = createApp({ scaffold: DEMO });
    put('images/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    put('.git/HEAD', 'ref: refs/heads/main');
    put('.DS_Store', 'junk');
    put('images/.hidden.png', 'junk');
    put('__MACOSX/images/._logo.svg', 'junk');
    put('images/Thumbs.db', 'junk');
    put('media.json', '{}');
    expect((await run(app)).added).toEqual(['images/logo.svg']);
    expect(paths(app)).toEqual(['images/logo.svg']);
    app.close();
  });

  it('нарушения правил — все сразу, с путями, и тогда не сохраняется ничего', async () => {
    const app = createApp({ scaffold: DEMO });
    put('images/ok.png', 'png');
    put('Images/Photo.JPG', 'jpg');
    put('docs/отчёт.pdf', 'pdf');
    put('tools/run.exe', 'exe');
    put('empty.txt', '');
    put('video/huge.mp4', '');
    truncateSync(join(folder, 'video/huge.mp4'), MAX_MEDIA_SIZE + 1);
    put('data.csv', 'a;b');
    // Символьную ссылку на Windows создаёт только администратор или режим разработчика.
    if (!WINDOWS)
      symlinkSync(join(folder, 'data.csv'), join(folder, 'link.csv'));
    put(
      'media.json',
      JSON.stringify({
        'images/ok.png': { alt: 'x'.repeat(501) },
        'images/nope.png': { alt: 'Нет файла' },
      })
    );
    const report = await run(app);
    expect(report.saved).toBe(false);
    expect(report.problems.map((_) => [_.file, _.code])).toEqual([
      ['Images/Photo.JPG', 'media.invalid_path'],
      ['docs/отчёт.pdf', 'media.invalid_path'],
      ['empty.txt', 'media.invalid_size'],
      ...(WINDOWS ? [] : [['link.csv', 'workspace.symlink']]),
      ['tools/run.exe', 'media.unsupported_type'],
      ['video/huge.mp4', 'media.invalid_size'],
      ['media.json', 'media.invalid_alt'],
      ['media.json', 'workspace.unknown_media'],
    ]);
    expect(report.added).toEqual([]);
    expect(paths(app)).toEqual([]);
    app.close();
  });

  it('media.json: неверный JSON и незнакомое поле — ошибка, как у манифеста пакета', async () => {
    const app = createApp({ scaffold: DEMO });
    put('a.png', 'png');
    put('media.json', '{ broken');
    expect((await run(app)).problems.map((_) => _.code)).toEqual([
      'workspace.invalid_json',
    ]);
    put('media.json', JSON.stringify({ 'a.png': { alt: 'А', title: 'Б' } }));
    expect((await run(app)).problems).toEqual([
      expect.objectContaining({
        file: 'media.json',
        code: 'workspace.invalid_media_json',
        message: 'media.json["a.png"].title is not part of the format',
      }),
    ]);
    expect(paths(app)).toEqual([]);
    app.close();
  });

  it('описания из media.json: у нового файла, у совпавшего — отдельной строкой; без ключа описание не трогается', async () => {
    const app = createApp({ scaffold: DEMO });
    const jpeg = await picture(600, 400, 'jpeg');
    put('photos/kitchen.jpg', jpeg);
    put('photos/hall.jpg', jpeg);
    put(
      'media.json',
      JSON.stringify({ 'photos/kitchen.jpg': { alt: '  Кухня   у окна ' } })
    );
    await run(app);
    expect(app.media.files.read('photos/kitchen.jpg')!.meta.alt).toBe(
      'Кухня у окна'
    );
    app.media.files.describe('photos/hall.jpg', 'Описал в менеджере');
    put(
      'media.json',
      JSON.stringify({ 'photos/kitchen.jpg': { alt: 'Кухня вечером' } })
    );
    expect(await run(app)).toMatchObject({
      added: [],
      changed: [],
      described: ['photos/kitchen.jpg'],
      same: 2,
    });
    expect(app.media.files.read('photos/kitchen.jpg')!.meta.alt).toBe(
      'Кухня вечером'
    );
    expect(app.media.files.read('photos/hall.jpg')!.meta.alt).toBe(
      'Описал в менеджере'
    );
    app.close();
  });

  it('варианты размеров готовы сразу после отправки', async () => {
    const app = createApp({ scaffold: DEMO });
    put('photos/wide.jpg', await picture(1200, 800, 'jpeg'));
    const report = await run(app);
    expect(report.variants).toBe(2);
    expect(app.media.variants.pending()).toBe(0);
    expect(app.media.image('photos/wide.jpg')!.srcset).toContain(
      'wide@960.webp'
    );
    app.close();
  });

  it('--into кладёт файлы под приставку; пути media.json — от корня папки', async () => {
    const app = createApp({ scaffold: DEMO });
    put('pt-sans.woff2', 'font');
    put('icons/star.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    put('media.json', JSON.stringify({ 'icons/star.svg': { alt: 'Звезда' } }));
    expect((await run(app, { into: 'fonts' })).added).toEqual([
      'fonts/icons/star.svg',
      'fonts/pt-sans.woff2',
    ]);
    expect(app.media.files.read('fonts/icons/star.svg')!.meta.alt).toBe(
      'Звезда'
    );
    expect(parseInto('/assets/fonts/')).toBe('assets/fonts');
    expect(() => parseInto('Fonts')).toThrow('lowercase latin');
    app.close();
  });

  it('--prune: лишнее — с вариантами; занятое страницей, сайтом или элементом остаётся с причиной', async () => {
    const app = createApp({ scaffold: DEMO });
    const jpeg = await picture(1200, 800, 'jpeg');
    [
      'photos/old.jpg',
      'photos/used.jpg',
      'photos/social.jpg',
      'photos/keep.jpg',
    ].forEach((path) => void app.media.files.save({ path, data: jpeg }));
    app.media.files.save({
      path: 'fonts/theme.woff2',
      data: new Uint8Array(3),
    });
    await app.media.variants.run();
    const page = app.content.pages.create({
      title: 'Галерея',
      alias: 'galereya',
      template: 'Base',
      content: '<p><img src="/media/photos/used.jpg" alt=""></p>',
      publish: true,
    });
    app.site.settings.update({ socialImage: 'photos/social.jpg' });
    const base = app.design.elements.get('template', 'Base')!.source;
    app.design.templates.save(
      'Base',
      base.replace(
        '</svelte:head>',
        '<link rel="preload" href="/media/fonts/theme.woff2" as="font"></svelte:head>'
      )
    );
    put('photos/keep.jpg', jpeg);

    const missing = await run(app);
    expect(missing.missing).toEqual([
      'fonts/theme.woff2',
      'photos/old.jpg',
      'photos/social.jpg',
      'photos/used.jpg',
    ]);
    expect(missing.removed).toEqual([]);

    const dry = await run(app, { prune: true, dryRun: true });
    expect(dry.removed).toEqual([
      'photos/old.jpg',
      'photos/old@480.webp',
      'photos/old@960.webp',
    ]);
    expect(paths(app)).toContain('photos/old.jpg');

    const pruned = await run(app, { prune: true });
    expect(pruned.removed).toEqual(dry.removed);
    expect(pruned.kept).toEqual([
      {
        path: 'fonts/theme.woff2',
        pages: [],
        site: false,
        elements: ['templates/Base.svelte'],
      },
      { path: 'photos/social.jpg', pages: [], site: true, elements: [] },
      {
        path: 'photos/used.jpg',
        pages: [{ id: page, title: 'Галерея' }],
        site: false,
        elements: [],
      },
    ]);
    expect(paths(app)).toEqual([
      'fonts/theme.woff2',
      'photos/keep.jpg',
      'photos/keep@480.webp',
      'photos/keep@960.webp',
      'photos/social.jpg',
      'photos/social@480.webp',
      'photos/social@960.webp',
      'photos/used.jpg',
      'photos/used@480.webp',
      'photos/used@960.webp',
    ]);
    app.close();
  });

  it('--prune с --into трогает только файлы под приставкой', async () => {
    const app = createApp({ scaffold: DEMO });
    app.media.files.save({ path: 'fonts/old.woff2', data: new Uint8Array(3) });
    app.media.files.save({ path: 'photos/a.png', data: new Uint8Array(3) });
    put('new.woff2', 'font');
    const report = await run(app, { into: 'fonts', prune: true });
    expect(report).toMatchObject({
      added: ['fonts/new.woff2'],
      removed: ['fonts/old.woff2'],
    });
    expect(paths(app)).toEqual(['fonts/new.woff2', 'photos/a.png']);
    app.close();
  });

  it('--dry-run ничего не пишет', async () => {
    const app = createApp({ scaffold: DEMO });
    put('a.txt', 'a');
    app.media.files.save({ path: 'b.txt', data: new Uint8Array([1]) });
    expect(await run(app, { dryRun: true, prune: true })).toMatchObject({
      added: ['a.txt'],
      removed: ['b.txt'],
      saved: false,
    });
    expect(paths(app)).toEqual(['b.txt']);
    app.close();
  });
});

describe('cms media push из командной строки', () => {
  const output: string[] = [];
  const context = (
    args: readonly string[],
    db: string,
    options: Record<string, unknown> = {}
  ): Context => ({
    args,
    options: {
      port: '0',
      db,
      help: false,
      version: false,
      passwordStdin: false,
      trustProxy: false,
      ...options,
    },
    paint: definePaint(false),
    language: 'ru',
    tty: false,
    out: (_) => void output.push(_),
  });

  it('--json — итог для скриптов; ошибка папки — код выхода 1', async () => {
    const db = join(root, 'cli.db');
    createApp({ databasePath: db, scaffold: DEMO }).close();
    put('docs/price.pdf', '%PDF-1.4');
    output.length = 0;
    await RUN.media!(context(['push', folder], db, { json: true }));
    expect(JSON.parse(output.join('\n'))).toEqual({
      added: ['docs/price.pdf'],
      changed: [],
      described: [],
      removed: [],
      kept: [],
      missing: [],
      same: 0,
      variants: 0,
      problems: [],
      saved: true,
    });
    output.length = 0;
    await RUN.media!(context(['push', folder], db));
    expect(output.join('\n')).toContain('Папка и медиатека совпадают');
    put('docs/Price.PDF', '%PDF-1.4');
    output.length = 0;
    await expect(RUN.media!(context(['push', folder], db))).rejects.toThrow(
      'Ничего не сохранено: ошибок 1'
    );
    await expect(
      RUN.media!(context(['push', join(root, 'nope')], db))
    ).rejects.toThrow('Нет папки');
    await expect(RUN.media!(context(['pull', folder], db))).rejects.toThrow(
      'Нет подкоманды media pull'
    );
  });

  it('сервер на той же базе отдаёт новый файл и новую версию картинки на странице без перезапуска', async () => {
    const db = join(root, 'shared.db');
    const server = createApp({ databasePath: db, scaffold: DEMO });
    try {
      const page = server.content.pages.create({
        title: 'Кухня',
        alias: 'kuhnya',
        template: 'Base',
        content: '[[Figure src="photos/kitchen.jpg"]]',
        publish: true,
      });
      expect(page).toBeGreaterThan(0);
      put('photos/kitchen.jpg', await picture(1200, 800, 'jpeg'));
      put('video/clip.webm', new Uint8Array(2 * 1024 * 1024).fill(3));
      const html = () =>
        server
          .fetch(new Request('http://localhost/kuhnya'))
          .then((_) => _.text());
      expect(await html()).not.toContain('kitchen.jpg?v=');

      await RUN.media!(context(['push', folder], db));
      const first = await html();
      expect(first).toMatch(/kitchen\.jpg\?v=[0-9a-f]+/);
      expect(first).toContain('kitchen@960.webp');
      const clip = await server.fetch(
        new Request('http://localhost/media/video/clip.webm')
      );
      expect(clip.status).toBe(200);
      expect((await clip.bytes()).byteLength).toBe(2 * 1024 * 1024);

      put('photos/kitchen.jpg', await picture(1000, 700, 'jpeg'));
      await RUN.media!(context(['push', folder], db));
      const second = await html();
      expect(/kitchen\.jpg\?v=([0-9a-f]+)/.exec(second)![1]).not.toBe(
        /kitchen\.jpg\?v=([0-9a-f]+)/.exec(first)![1]
      );
    } finally {
      server.close();
    }
  });
});
