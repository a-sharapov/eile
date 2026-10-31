import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { definePaint } from '../src/cli/paint.ts';
import { named, programName } from '../src/cli/program.ts';

const eile = named('eile');

describe('имя программы', () => {
  it('cms или eile — как запустили; из исходников и под чужим именем — cms', () => {
    expect(programName('/usr/local/bin/eile')).toBe('eile');
    expect(programName('./eile')).toBe('eile');
    expect(programName('eile')).toBe('eile');
    expect(programName('/home/anna/.local/bin/cms')).toBe('cms');
    expect(programName('bun')).toBe('cms');
    expect(programName('site-server')).toBe('cms');
  });

  it('вызовы в справке и подсказках — под этим именем', () => {
    expect(eile('cms new blog --db blog.db && cms --db blog.db')).toBe(
      'eile new blog --db blog.db && eile --db blog.db'
    );
    expect(eile('sudo cms update')).toBe('sudo eile update');
    expect(eile('printf %s "$PASS" | cms users password a@b.ru')).toBe(
      'printf %s "$PASS" | eile users password a@b.ru'
    );
    expect(eile('setcap cap_net_bind_service=+ep $(which cms)')).toBe(
      'setcap cap_net_bind_service=+ep $(which eile)'
    );
    expect(eile('Список — cms help. Готовый сайт — cms new.')).toBe(
      'Список — eile help. Готовый сайт — eile new.'
    );
    expect(eile('cms')).toBe('eile');
  });

  it('в цвете — тоже', () => {
    const color = definePaint(true);
    expect(eile(`${color.bold('cms')} ${color.command('new')}`)).toBe(
      `${color.bold('eile')} ${color.command('new')}`
    );
  });

  it('пути, файлы и переменные не трогает', () => {
    const text =
      'PORT=80 CMS_DB=/var/lib/cms/site.db, копия cms-2026-10-31.db, прежний — cms.old, почта cms@example.com';
    expect(eile(text)).toBe(text);
  });

  it('под именем cms текст не меняется', () => {
    expect(named('cms')('cms new')).toBe('cms new');
  });
});

// Запуск под именем eile, как через ссылку от установщика: argv0 — то, что набрал человек.
const _MAIN = resolve(import.meta.dir, '../src/main.ts');
const run = (args: string[], lang = 'ru_RU.UTF-8') =>
  Bun.spawnSync({
    cmd: ['bun', _MAIN, ...args],
    argv0: '/home/anna/.local/bin/eile',
    env: {
      ...process.env,
      LANG: lang,
      LC_ALL: '',
      LC_MESSAGES: '',
      NO_COLOR: '1',
    },
  });

describe('запуск как eile', () => {
  it('справка зовёт команду eile, на обоих языках', () => {
    const ru = run(['help']).stdout.toString();
    const en = run(['help', 'update'], 'en_US.UTF-8').stdout.toString();
    expect(ru).toContain('eile [команда] [параметры]');
    expect(en).toContain('eile update --check');
    // Ни одного вызова cms не осталось, а cms.old — имя файла — на месте.
    expect(eile(ru)).toBe(ru);
    expect(eile(en)).toBe(en);
    expect(en).toContain('cms.old');
  });

  it('подсказка в ошибке — тоже с eile', () => {
    const result = run(['users', 'add'], 'en_US.UTF-8');
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('eile users add <email>');
  });
});
