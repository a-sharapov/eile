import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import {
  type Context,
  explain,
  helpFor,
  RUN,
  unknownCommand,
} from '../src/cli/commands.ts';
import { COMMANDS, commandHelp, overview, suggest } from '../src/cli/help.ts';
import { motd, pages } from '../src/cli/motd.ts';
import { colorsWanted, definePaint, visibleLength } from '../src/cli/paint.ts';
import { typeKey } from '../src/cli/prompt.ts';
import { VERSION } from '../src/cli/version.ts';
import { PRODUCT } from '../src/product.ts';
import { DEMO } from './fixtures/demo.ts';

const plain = definePaint(false);
const color = definePaint(true);
const ESC = String.fromCharCode(27);

const dir = mkdtempSync(join(tmpdir(), 'cms-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const longLines = (text: string): string[] =>
  text.split('\n').filter((_) => visibleLength(_) > 80 && !_.includes('://'));

describe('разбор вызова', () => {
  it('без команды — сервер с портом и базой по умолчанию', () => {
    expect(parseInvocation([], {})).toEqual({
      command: null,
      args: [],
      options: {
        port: '8080',
        db: 'site.db',
        name: undefined,
        role: undefined,
        help: false,
        version: false,
        passwordStdin: false,
        trustProxy: false,
      },
    });
  });

  it('за прокси — флаг или CMS_TRUST_PROXY=1', () => {
    const options = (argv: string[], env: Record<string, string>) =>
      ((_) => ('options' in _ ? _.options.trustProxy : null))(
        parseInvocation(argv, env)
      );
    expect(options(['--trust-proxy'], {})).toBe(true);
    expect(options([], { CMS_TRUST_PROXY: '1' })).toBe(true);
    expect(options([], {})).toBe(false);
  });

  it('порт и база — из окружения, флаги сильнее окружения', () => {
    const env = { PORT: '3000', CMS_DB: 'env.db' };
    const fromEnv = parseInvocation(['serve'], env);
    const fromFlags = parseInvocation(
      ['serve', '--port', '9000', '--db', 'x.db'],
      env
    );
    expect('options' in fromEnv && fromEnv.options).toMatchObject({
      port: '3000',
      db: 'env.db',
    });
    expect('options' in fromFlags && fromFlags.options).toMatchObject({
      port: '9000',
      db: 'x.db',
    });
  });

  it('аргументы команды и короткие флаги', () => {
    expect(
      parseInvocation(
        ['users', 'password', 'a@b.cd', '-h', '--password-stdin'],
        {}
      )
    ).toMatchObject({
      command: 'users',
      args: ['password', 'a@b.cd'],
      options: { help: true, passwordStdin: true },
    });
  });

  it('неизвестный параметр — ошибка по-русски', () => {
    expect(parseInvocation(['--prot', '80'], {})).toEqual({
      error: 'Нет параметра --prot. Список — cms help',
    });
  });
});

describe('цвет', () => {
  it('NO_COLOR выключает, FORCE_COLOR включает, иначе — по TTY', () => {
    expect(colorsWanted({ NO_COLOR: '1' }, true)).toBe(false);
    expect(colorsWanted({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(colorsWanted({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(colorsWanted({}, true)).toBe(true);
    expect(colorsWanted({}, false)).toBe(false);
  });

  it('без цвета — ни одной управляющей последовательности', () => {
    expect(overview(plain)).not.toContain(ESC);
    expect(overview(color)).toContain(ESC);
  });
});

describe('справка', () => {
  it('общая справка называет все команды и показывает примеры', () => {
    const text = overview(plain);
    COMMANDS.forEach((_) => void expect(text).toContain(`  ${_.name}`));
    expect(text).toContain('$ cms import-evo evo.sql --db site.db');
    expect(text).toContain('NO_COLOR');
  });

  it('у каждой команды — использование, описание и примеры', () => {
    COMMANDS.forEach((help) => {
      const text = commandHelp(plain, help);
      expect(text).toContain('Использование');
      expect(text).toContain(help.usage[0]!);
      expect(text).toContain('$ ');
    });
  });

  it('строки справки — не шире 80 колонок, с цветом и без', () => {
    expect(longLines(overview(plain))).toEqual([]);
    expect(longLines(overview(color))).toEqual([]);
    COMMANDS.forEach(
      (_) => void expect(longLines(commandHelp(color, _))).toEqual([])
    );
  });

  it('опечатка в команде — подсказка с ближайшей', () => {
    expect(suggest('serv')).toBe('serve');
    expect(suggest('bakup')).toBe('backup');
    expect(suggest('user')).toBe('users');
    expect(suggest('zzzzzz')).toBeNull();
    expect(unknownCommand('bakup').message).toContain(
      'Возможно, вы имели в виду: cms backup'
    );
  });

  it('справка по неизвестной команде — ошибка, по известной — текст', async () => {
    expect(await helpFor(plain, 'users')).toContain('users password');
    expect(helpFor(plain, 'nope')).rejects.toThrow('Нет команды «nope».');
  });

  it('версия — как в package.json', async () => {
    const pkg = await Bun.file(
      new URL('../package.json', import.meta.url)
    ).json();
    expect(VERSION).toBe(pkg.version);
  });
});

describe('MOTD', () => {
  const summary = {
    version: '0.0.1',
    url: 'http://localhost:8080/',
    db: 'site.db',
    fresh: true,
    pages: 12,
    published: 9,
    trashed: 1,
    setupUrl: 'http://localhost:8080/manager/setup?token=abc',
  };

  it('адреса, база, сводка и ссылка настройки', () => {
    const text = motd(plain, summary);
    expect(text).toContain(`${PRODUCT} 0.0.1`);
    expect(text).toContain('http://localhost:8080/manager');
    expect(text).toContain('12 страниц · ● опубликовано 9 · в корзине 1');
    expect(text).toContain(summary.setupUrl);
    expect(text).toContain('страница приветствия');
  });

  it('без пользователей-новичков и корзины — без лишних строк', () => {
    const text = motd(plain, {
      ...summary,
      fresh: false,
      trashed: 0,
      setupUrl: null,
    });
    expect(text).not.toContain('корзине');
    expect(text).not.toContain('setup');
    expect(text).not.toContain('демо-сайт');
  });

  it('не шире 80 колонок, кроме строк с адресом', () => {
    expect(longLines(motd(color, summary))).toEqual([]);
  });

  it('русские формы числа', () => {
    expect([1, 2, 5, 11, 21, 22, 112].map(pages)).toEqual([
      '1 страница',
      '2 страницы',
      '5 страниц',
      '11 страниц',
      '21 страница',
      '22 страницы',
      '112 страниц',
    ]);
  });
});

describe('скрытый ввод', () => {
  const typed = (keys: string) =>
    [...keys].reduce(typeKey, { value: '', done: null });

  it('набор, Backspace и Enter', () => {
    expect(typed('secretx\u007f!\r')).toEqual({
      value: 'secret!',
      done: 'enter',
    });
  });

  it('Ctrl+C отменяет, после Enter ввод не меняется', () => {
    expect(typed('ab\u0003cd').done).toBe('cancel');
    expect(typed('ab\rcd').value).toBe('ab');
  });
});

describe('команды на базе', () => {
  const output: string[] = [];
  const context = (args: readonly string[], db: string): Context => ({
    args,
    options: {
      port: '0',
      db,
      help: false,
      version: false,
      passwordStdin: false,
      trustProxy: false,
    },
    paint: plain,
    tty: false,
    out: (_) => void output.push(_),
  });
  const db = join(dir, 'site.db');

  it('info и backup не создают базу по опечатке в пути', () => {
    expect(RUN.info!(context([], join(dir, 'missing.db')))).rejects.toThrow(
      'Нет базы'
    );
  });

  it('info — сводка по сайту', async () => {
    createApp({ databasePath: db, scaffold: DEMO }).close();
    await RUN.info!(context([], db));
    const text = output.join('\n');
    expect(text).toContain('Страницы');
    expect(text).toContain('миграций');
    expect(text).toContain('Пользователи');
  });

  it('backup пишет копию и не перезаписывает существующий файл', async () => {
    const target = join(dir, 'copy.db');
    await RUN.backup!(context([target], db));
    expect(await Bun.file(target).exists()).toBe(true);
    expect(RUN.backup!(context([target], db))).rejects.toThrow('уже есть');
  });

  it('пароль без терминала и без --password-stdin — понятная ошибка', () => {
    expect(
      RUN.users!(context(['add', 'anna@example.com'], db))
    ).rejects.toThrow('--password-stdin');
  });

  it('ошибки контекстов — по-русски', () => {
    const app = createApp();
    expect(
      app.identity.users
        .create({ email: 'a@b.cd', password: 'short' })
        .then(undefined, explain)
    ).resolves.toBe('Пароль — не короче 10 символов.');
    app.close();
  });

  it('пользователь, созданный мимо настройки, закрывает ссылку настройки', async () => {
    const app = createApp();
    expect(app.identity.setup.token()).not.toBeNull();
    await app.identity.users.create({
      email: 'a@b.cd',
      password: 'correct horse battery',
    });
    expect(app.identity.setup.token()).toBeNull();
    app.close();
  });
});
