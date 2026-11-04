import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import {
  agentsGuide,
  filesOf,
  pull,
  push,
  readFolder,
} from '../src/workspace/index.ts';
import { DEMO } from './fixtures/demo.ts';

const root = mkdtempSync(join(tmpdir(), 'cms-workspace-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let app: App;
let dir: string;
let count = 0;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
  dir = join(root, `site-${++count}`);
});

const write = (path: string, text: string) => Bun.write(join(dir, path), text);
const read = (path: string) => Bun.file(join(dir, path)).text();

describe('выгрузка', () => {
  it('кладёт элементы, формы и поля файлами; повторная ничего не переписывает', async () => {
    const first = await pull(app, dir, new Map([['AGENTS.md', 'guide\n']]));
    expect(first.written).toContain('templates/Base.svelte');
    expect(first.written).toContain('components/Menu.svelte');
    expect(first.written).toContain('fields.json');
    expect(first.written).toContain('AGENTS.md');
    expect(await read('templates/Base.svelte')).toBe(
      app.design.elements.get('template', 'Base')!.source
    );
    const again = await pull(app, dir);
    expect(again.written).toEqual([]);
    expect(again.same).toBe(filesOf(app).size);
  });

  it('файлы, которых нет в сайте, остаются и называются', async () => {
    await write('components/Draft.svelte', '<p>draft</p>');
    const report = await pull(app, dir);
    expect(report.extra).toEqual(['components/Draft.svelte']);
    expect(await read('components/Draft.svelte')).toBe('<p>draft</p>');
  });
});

// git с core.autocrlf=true на Windows выдаёт файлы с CRLF; в сайте и в папке после pull — LF.
const crlf = (text: string) => text.replaceAll('\n', '\r\n');

describe('переводы строк CRLF', () => {
  it('файлы с CRLF и тем же текстом — без правок: push ничего не меняет, pull не переписывает', async () => {
    await pull(app, dir);
    const base = await read('templates/Base.svelte');
    const fields = await read('fields.json');
    await write('templates/Base.svelte', crlf(base));
    await write('fields.json', crlf(fields));
    expect(push(app, await readFolder(dir))).toMatchObject({
      added: [],
      changed: [],
      problems: [],
    });
    const again = await pull(app, dir);
    expect(again.written).toEqual([]);
    expect(await read('templates/Base.svelte')).toBe(crlf(base));
  });

  it('правка в файле с CRLF уходит в сайт с LF', async () => {
    await pull(app, dir);
    await write(
      'components/Badge.svelte',
      '<script>\r\n  let { text = "new" } = $props();\r\n</script>\r\n<b>{text}</b>\r\n'
    );
    const report = push(app, await readFolder(dir));
    expect(report.added).toEqual(['components/Badge.svelte']);
    expect(app.design.elements.get('component', 'Badge')!.source).toBe(
      '<script>\n  let { text = "new" } = $props();\n</script>\n<b>{text}</b>\n'
    );
  });

  it('BOM в начале файла не уходит в сайт и не делает файл изменённым', async () => {
    await pull(app, dir);
    const base = await read('templates/Base.svelte');
    await write('templates/Base.svelte', `﻿${crlf(base)}`);
    expect(push(app, await readFolder(dir)).changed).toEqual([]);
  });

  it('pull пишет LF', async () => {
    await pull(app, dir);
    expect(await read('templates/Base.svelte')).not.toContain('\r');
    expect(await read('fields.json')).not.toContain('\r');
  });
});

describe('отправка', () => {
  it('без правок — ничего не меняет', async () => {
    await pull(app, dir);
    const report = push(app, await readFolder(dir));
    expect(report).toMatchObject({
      added: [],
      changed: [],
      problems: [],
      saved: true,
    });
  });

  it('правка компонента и новый компонент — в сайт, страница показывает новое', async () => {
    await pull(app, dir);
    await write(
      'components/Badge.svelte',
      '<script>\n  let { text = "new" } = $props();\n</script>\n<b class="badge">{text}</b>\n'
    );
    const base = await read('templates/Base.svelte');
    await write(
      'templates/Base.svelte',
      base
        .replace(
          '<script>',
          "<script>\n  import Badge from '$components/Badge';"
        )
        .replace('<main', '<Badge text="из папки" />\n<main')
    );
    const report = push(app, await readFolder(dir));
    expect(report.problems).toEqual([]);
    expect(report.added).toEqual(['components/Badge.svelte']);
    expect(report.changed).toEqual(['templates/Base.svelte']);
    const page = await app
      .fetch(new Request('http://localhost/'))
      .then((_) => _.text());
    expect(page).toContain('из папки');
  });

  it('ошибки всех файлов с местом; не сохраняется ничего, даже верное', async () => {
    await pull(app, dir);
    const menu = await read('components/Menu.svelte');
    await write('components/Menu.svelte', `${menu}\n{#if}\n`);
    const base = await read('templates/Base.svelte');
    await write(
      'templates/Base.svelte',
      base.replace(
        '<script>',
        "<script>\n  import Ghost from '$components/Ghost';"
      )
    );
    await write('components/Fine.svelte', '<p>fine</p>\n');
    const report = push(app, await readFolder(dir));
    expect(report.saved).toBe(false);
    const problems = Object.fromEntries(
      report.problems.map((_) => [_.file, _])
    );
    expect(problems['components/Menu.svelte']).toMatchObject({
      code: 'design.compile_failed',
      line: menu.split('\n').length + 1,
    });
    expect(problems['templates/Base.svelte']).toMatchObject({
      code: 'workspace.unknown_component',
      line: 2,
    });
    expect(app.design.elements.get('component', 'Fine')).toBeNull();
    expect(app.design.elements.get('component', 'Menu')!.source).toBe(menu);
  });

  it('проверка — та же отправка с откатом', async () => {
    await pull(app, dir);
    await write('components/Fine.svelte', '<p>fine</p>\n');
    const report = push(app, await readFolder(dir), { dryRun: true });
    expect(report).toMatchObject({
      added: ['components/Fine.svelte'],
      problems: [],
      saved: false,
    });
    expect(app.design.elements.get('component', 'Fine')).toBeNull();
  });

  it('лишнее удаляется только с prune, шаблон со страницами — нет', async () => {
    await pull(app, dir);
    await write('components/Spare.svelte', '<p>spare</p>\n');
    push(app, await readFolder(dir));
    rmSync(join(dir, 'components/Spare.svelte'));
    rmSync(join(dir, 'templates/Base.svelte'));
    const kept = push(app, await readFolder(dir));
    expect(kept.missing).toEqual([
      'components/Spare.svelte',
      'templates/Base.svelte',
    ]);
    expect(app.design.elements.get('component', 'Spare')).not.toBeNull();
    const pruned = push(app, await readFolder(dir), { prune: true });
    expect(pruned.saved).toBe(false);
    expect(pruned.problems.map((_) => [_.file, _.code])).toEqual([
      ['templates/Base.svelte', 'design.element_in_use'],
    ]);
    await write(
      'templates/Base.svelte',
      app.design.elements.get('template', 'Base')!.source
    );
    const done = push(app, await readFolder(dir), { prune: true });
    expect(done.removed).toEqual(['components/Spare.svelte']);
    expect(app.design.elements.get('component', 'Spare')).toBeNull();
  });

  it('поля и настройки формы — из JSON; битый JSON — ошибка файла', async () => {
    app.forms.forms.save('callback', {
      title: 'Звонок',
      source: '<input name="phone" type="tel">',
    });
    await pull(app, dir);
    const fields = JSON.parse(await read('fields.json'));
    await write(
      'fields.json',
      JSON.stringify([
        ...fields,
        {
          name: 'subtitle',
          label: 'Подзаголовок',
          type: 'text',
          templates: ['Base'],
        },
      ])
    );
    const settings = JSON.parse(await read('forms/callback.json'));
    await write(
      'forms/callback.json',
      JSON.stringify({ ...settings, title: 'Перезвоните мне' })
    );
    const report = push(app, await readFolder(dir));
    expect(report.problems).toEqual([]);
    expect([...report.changed].sort()).toEqual([
      'fields.json',
      'forms/callback.html',
    ]);
    expect(app.content.fields.list().some((_) => _.name === 'subtitle')).toBe(
      true
    );
    expect(app.forms.forms.get('callback')!.title).toBe('Перезвоните мне');

    await write('fields.json', '[{ broken');
    const broken = push(app, await readFolder(dir));
    expect(broken.problems.map((_) => [_.file, _.code])).toEqual([
      ['fields.json', 'workspace.invalid_json'],
    ]);
  });
});

it('AGENTS.md: команды с этой базой, правила CMS и компоненты сайта', () => {
  const text = agentsGuide(app, { db: '/srv/site.db', program: 'cms' });
  expect(text).toContain('cms elements push . --db /srv/site.db');
  expect(text).toContain('<Content of={page} />');
  expect(text).toContain('data-show-if');
  expect(text).toContain('- Menu');
  expect(text).toMatch(/- \d+ \/ "/);
});

describe('скрипты в папке элементов', () => {
  const STAGE = "document.querySelector('[data-stage]')?.remove();\n";

  it('pull кладёт scripts/имя.js, push сохраняет новый и правленый', async () => {
    app.design.scripts.save('kitchen-stage', STAGE);
    await pull(app, dir);
    expect(await read('scripts/kitchen-stage.js')).toBe(STAGE);
    await write('scripts/kitchen-stage.js', `${STAGE}console.log(1);\n`);
    await write('scripts/menu.js', 'export const open = () => {};\n');
    const report = push(app, await readFolder(dir));
    expect(report).toMatchObject({
      added: ['scripts/menu.js'],
      changed: ['scripts/kitchen-stage.js'],
      problems: [],
      saved: true,
    });
    expect(app.design.elements.get('script', 'kitchen-stage')?.revision).toBe(
      2
    );
    expect(app.design.scripts.url('menu')).toStartWith('/_cms/scripts/menu.');
  });

  it('check: синтаксис и голый импорт — файл:строка:столбец, ничего не сохраняется', async () => {
    await pull(app, dir);
    await write('scripts/broken.js', 'const a = 1;\nexport const b = ;\n');
    await write(
      'scripts/bare.js',
      "// сцена\nimport * as THREE from 'three';\n"
    );
    const report = push(app, await readFolder(dir), { dryRun: true });
    expect(report.saved).toBe(false);
    expect(report.problems).toEqual([
      expect.objectContaining({
        file: 'scripts/bare.js',
        code: 'design.script_import',
        line: 2,
        column: 24,
      }),
      expect.objectContaining({
        file: 'scripts/broken.js',
        code: 'design.script_syntax',
        line: 2,
        column: 18,
      }),
    ]);
    expect(app.design.elements.get('script', 'broken')).toBeNull();
  });

  it('prune удаляет скрипт без файла, если его не подключает шаблон', async () => {
    app.design.scripts.save('old-stage', STAGE);
    app.design.scripts.save('kept-stage', STAGE);
    app.design.components.save(
      'Stage',
      "<script>import { script } from '$core';</script><svelte:head><script type=\"module\" src={script('kept-stage')}></script></svelte:head>"
    );
    await pull(app, dir);
    rmSync(join(dir, 'scripts/old-stage.js'));
    rmSync(join(dir, 'scripts/kept-stage.js'));
    const report = push(app, await readFolder(dir), { prune: true });
    expect(report.problems).toEqual([
      expect.objectContaining({
        file: 'scripts/kept-stage.js',
        code: 'design.element_in_use',
      }),
    ]);
    expect(report.saved).toBe(false);
    rmSync(join(dir, 'components/Stage.svelte'));
    const pruned = push(app, await readFolder(dir), { prune: true });
    expect(pruned.problems).toEqual([]);
    expect([...pruned.removed].sort()).toEqual([
      'components/Stage.svelte',
      'scripts/kept-stage.js',
      'scripts/old-stage.js',
    ]);
    expect(app.design.scripts.url('old-stage')).toBeNull();
  });

  it('AGENTS.md описывает папку scripts и правило импортов', () => {
    app.design.scripts.save('kitchen-stage', STAGE);
    const text = agentsGuide(app, { db: 'site.db', program: 'cms' });
    expect(text).toContain('`scripts/name.js`');
    expect(text).toContain('## Scripts');
    expect(text).toContain('only from https:// URLs');
    expect(text).toContain('- Scripts: kitchen-stage.');
  });
});
