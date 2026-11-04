import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { sealInfo } from '../src/platform/seal.ts';
import {
  openServerSettings,
  sealServerSettings,
} from '../src/server-settings.ts';
import { isDomainError } from '../src/shared/kernel/errors.ts';
import { expectMode } from './fixtures/platform.ts';

const dir = mkdtempSync(join(tmpdir(), 'cms-server-settings-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PASSPHRASE = 'кухня на Эльбе 2026';
const SMTP_PASSWORD = 'smtp-password-of-the-owner';
const AI_KEY = 'sk-ai-key-of-the-owner';
const BOT = '123456789:AAEhBOweik9ai4n5bpz0bWSEKVZa0OcTQYw';

let sites = 0;
const fresh = (): { app: App; path: string } =>
  ((folder) => (
    mkdirSync(folder),
    ((path) => ({ app: createApp({ databasePath: path }), path }))(
      join(folder, 'site.db')
    )
  ))(join(dir, `site-${++sites}`));

const admin = (app: App, email = 'owner@example.com') =>
  app.identity.users.create({
    email,
    password: 'correct horse battery',
    role: 'admin',
  });

const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'resolved',
    (error) => (isDomainError(error) ? error.code : String(error))
  );

// Сервер, на котором владелец всё настроил: почта, Telegram, шлюз, расписание, хранилище, ИИ, ключ API.
const configured = async () => {
  const { app, path } = fresh();
  const owner = await admin(app);
  app.notify.settings.save({
    email: {
      host: 'smtp.example.com',
      port: 465,
      security: 'tls',
      user: 'site@example.com',
      password: SMTP_PASSWORD,
      from: 'site@example.com',
      to: ['owner@example.com'],
    },
    telegram: { token: BOT, chats: [{ id: '-100123', title: 'Студия' }] },
    gateway: { enabled: true },
  });
  const gatewayToken = app.notify.gateway.tokens.issue('Plattform');
  app.upkeep.backups.configure({
    enabled: true,
    every: 6,
    at: '02:15',
    keep: 9,
    folder: '/home/owner/backups',
  });
  const offsite = app.upkeep.offsite.configure({
    enabled: true,
    endpoint: 'https://fra1.digitaloceanspaces.com',
    region: 'fra1',
    bucket: 'muehlenhof-copies',
    prefix: 'site',
    accessKey: 'DO00EXAMPLE',
    secret: 'spaces-secret',
  });
  app.assistant.connection.save({
    url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    key: AI_KEY,
    instructions: 'Пиши коротко.',
  });
  // Секрет печатей появляется с первой формой на странице; здесь — сразу.
  app.forms.serverSettings.apply({
    secret: crypto
      .getRandomValues(new Uint8Array(32))
      .toBase64({ alphabet: 'base64url' }),
  });
  const apiToken = app.identity.apiTokens.issue(owner.id, 'Claude Code');
  app.identity.apiTokens.issue(
    (await admin(app, 'helper@example.com')).id,
    'Скрипт помощника'
  );
  return { app, path, owner, gatewayToken, offsite, apiToken };
};

describe('файл настроек сервера', () => {
  it('в файле — настройки сервера; сеансов, ссылок сброса, сертификатов, очереди и сбоев нет', async () => {
    const { app } = await configured();
    await app.identity.login('owner@example.com', 'correct horse battery');
    const settings = app.serverSettings.read();
    expect(Object.keys(settings).toSorted()).toEqual([
      'assistant',
      'createdAt',
      'format',
      'forms',
      'from',
      'notify',
      'tokens',
      'upkeep',
      'version',
    ]);
    expect(settings.notify?.email).toMatchObject({
      transport: 'smtp',
      password: SMTP_PASSWORD,
    });
    expect(settings.notify?.gateway.tokens).toHaveLength(1);
    expect(settings.assistant?.key).toBe(AI_KEY);
    expect(settings.upkeep.offsite?.secret).toBe('spaces-secret');
    expect(settings.upkeep.offsite?.key).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(settings.tokens.map((_) => _.email).toSorted()).toEqual([
      'helper@example.com',
      'owner@example.com',
    ]);
    const text = JSON.stringify(settings);
    expect(text).not.toContain('session');
    expect(text).not.toContain('certificate');
    expect(text).not.toContain('"last"');
    app.close();
  });

  it('запечатан паролем: в файле нет ни одного секрета открытым текстом; чужой пароль не открывает', async () => {
    const { app } = await configured();
    const sealed = await sealServerSettings(
      app.serverSettings.read(),
      PASSPHRASE
    );
    expect(sealInfo(sealed)).toMatchObject({
      content: 'settings',
      secret: 'passphrase',
    });
    const text = new TextDecoder('latin1').decode(sealed);
    for (const secret of [SMTP_PASSWORD, AI_KEY, BOT, 'spaces-secret']) {
      expect(text).not.toContain(secret);
    }
    expect(await codeOf(openServerSettings(sealed, `${PASSPHRASE}!`))).toBe(
      'seal.wrong_passphrase'
    );
    expect((await openServerSettings(sealed, PASSPHRASE)).notify).toEqual(
      app.serverSettings.read().notify
    );
    app.close();
  });

  it('на новой машине: что в файле — заменяет своё; итоги копий, сеансы и чужие пути — свои', async () => {
    const source = await configured();
    const settings = source.app.serverSettings.read();
    const target = fresh();
    await admin(target.app);
    const login = await target.app.identity.login(
      'owner@example.com',
      'correct horse battery'
    );
    target.app.upkeep.backups.configure({ enabled: false, keep: 2 });
    const report = target.app.serverSettings.apply(settings);
    expect(report).toEqual({
      notify: true,
      forms: true,
      assistant: true,
      upkeep: {
        schedule: true,
        checkUpdates: true,
        folderReset: '/home/owner/backups',
        offsite: true,
        keyReplaced: null,
      },
      tokens: { added: 1, present: 0, skipped: ['helper@example.com'] },
    });
    expect(target.app.notify.serverSettings.read()).toEqual(settings.notify);
    expect(target.app.forms.serverSettings.read()).toEqual(settings.forms);
    expect(target.app.assistant.serverSettings.read()).toEqual(
      settings.assistant
    );
    expect(target.app.upkeep.backups.schedule()).toEqual({
      enabled: true,
      every: 6,
      at: '02:15',
      keep: 9,
      folder: '',
    });
    expect(target.app.upkeep.offsite.status()).toMatchObject({
      keyId: source.offsite.keyId,
      hasSecret: true,
      settings: { bucket: 'muehlenhof-copies', prefix: 'site/' },
      last: null,
    });
    // Ключ API работает и на новой машине, сеанс того, кто там вошёл, не закрыт.
    expect(
      target.app.identity.apiTokens.authenticate(source.apiToken.token)?.email
    ).toBe('owner@example.com');
    expect(target.app.identity.authenticate(login.token)).not.toBeNull();
    // Повтор ничего не удваивает.
    expect(target.app.serverSettings.apply(settings).tokens).toEqual({
      added: 0,
      present: 1,
      skipped: ['helper@example.com'],
    });
    source.app.close();
    target.app.close();
  });

  it('чего в файле нет — остаётся своё; относительный каталог копий переезжает как есть', async () => {
    const source = fresh();
    source.app.assistant.connection.save({
      url: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      key: AI_KEY,
    });
    source.app.upkeep.backups.configure({ folder: 'copies' });
    const target = await configured();
    const before = target.app.notify.serverSettings.read();
    const report = target.app.serverSettings.apply(
      source.app.serverSettings.read()
    );
    expect(report).toMatchObject({
      notify: false,
      forms: false,
      assistant: true,
      upkeep: { offsite: false, folderReset: null },
    });
    expect(target.app.notify.serverSettings.read()).toEqual(before);
    expect(target.app.upkeep.offsite.status().keyId).toBe(target.offsite.keyId);
    expect(target.app.upkeep.backups.schedule().folder).toBe('copies');
    source.app.close();
    target.app.close();
  });

  it('другой ключ копий в файле — в отчёте оба отпечатка', async () => {
    const source = await configured();
    const target = await configured();
    const report = target.app.serverSettings.apply(
      source.app.serverSettings.read()
    );
    expect(report.upkeep.keyReplaced).toEqual({
      from: target.offsite.keyId!,
      to: source.offsite.keyId!,
    });
    source.app.close();
    target.app.close();
  });

  it('всё или ничего: испорченный раздел — ничего не применено', async () => {
    const source = await configured();
    const target = fresh();
    const settings = source.app.serverSettings.read();
    expect(() =>
      target.app.serverSettings.apply({
        ...settings,
        upkeep: {
          ...settings.upkeep,
          schedule: { ...settings.upkeep.schedule!, every: 7 as never },
        },
      })
    ).toThrow(expect.objectContaining({ code: 'upkeep.invalid_every' }));
    expect(target.app.notify.serverSettings.read()).toBeNull();
    expect(target.app.assistant.serverSettings.read()).toBeNull();
    source.app.close();
    target.app.close();
  });
});

describe('cms backup --server и cms restore --server', () => {
  const output: string[] = [];
  const context = (
    argv: readonly string[],
    env: Record<string, string> = {}
  ): Context =>
    ((parsed) => {
      if ('error' in parsed) throw new Error(parsed.error);
      return {
        args: parsed.args,
        options: parsed.options,
        paint: definePaint(false),
        language: 'ru',
        tty: false,
        out: (_) => void output.push(_),
      };
    })(parseInvocation(argv, env));

  it('файл с правами 600 и сводкой; на другой базе — применяется, работающий сервер подхватывает сам', async () => {
    const source = await configured();
    source.app.close();
    const file = join(dir, 'server.enc');
    output.length = 0;
    await RUN.backup!(
      context(['backup', '--server', file, '--db', source.path], {
        CMS_SETTINGS_PASSPHRASE: PASSPHRASE,
      })
    );
    expectMode(file, 0o600);
    expect(output.join('\n')).toContain('почтовый шлюз (токенов: 1)');
    expect(output.join('\n')).toContain('ключи API (2)');

    const target = fresh();
    await admin(target.app);
    // Сервер на этой базе: настройки появятся у него без перезапуска.
    const server = createApp({ databasePath: target.path });
    expect(server.notify.settings.status().email).toBeNull();
    output.length = 0;
    await RUN.restore!(
      context(['restore', '--server', file, '--db', target.path], {
        CMS_SETTINGS_PASSPHRASE: PASSPHRASE,
      })
    );
    expect(output.join('\n')).toContain('Настройки сервера применены');
    expect(output.join('\n')).toContain('/home/owner/backups');
    await server.fetch(new Request('http://localhost/'));
    expect(server.notify.settings.status().email).toMatchObject({
      host: 'smtp.example.com',
    });
    expect(server.upkeep.backups.schedule().every).toBe(6);
    server.close();
    target.app.close();
  });

  it('короткий пароль, чужой пароль, копия сайта вместо файла настроек — понятные отказы', async () => {
    const { app, path } = await configured();
    app.close();
    expect(
      RUN.backup!(
        context(['backup', '--server', join(dir, 'weak.enc'), '--db', path], {
          CMS_SETTINGS_PASSPHRASE: 'short',
        })
      )
    ).rejects.toThrow(
      expect.objectContaining({ code: 'settings.weak_passphrase' })
    );
    expect(
      RUN.backup!(
        context(['backup', '--server', join(dir, 'tty.enc'), '--db', path])
      )
    ).rejects.toThrow('CMS_SETTINGS_PASSPHRASE');
    const file = join(dir, 'other.enc');
    await RUN.backup!(
      context(['backup', '--server', file, '--db', path], {
        CMS_SETTINGS_PASSPHRASE: PASSPHRASE,
      })
    );
    expect(
      RUN.restore!(
        context(['restore', '--server', file, '--db', path], {
          CMS_SETTINGS_PASSPHRASE: 'не тот пароль совсем',
        })
      )
    ).rejects.toThrow(
      expect.objectContaining({ code: 'seal.wrong_passphrase' })
    );
    const copy = join(dir, 'copy.db');
    await RUN.backup!(context(['backup', copy, '--db', path]));
    expect(
      RUN.restore!(
        context(['restore', '--server', copy, '--db', path], {
          CMS_SETTINGS_PASSPHRASE: PASSPHRASE,
        })
      )
    ).rejects.toThrow(expect.objectContaining({ code: 'seal.not_sealed' }));
    // Файл настроек — не копия сайта: обычное восстановление его не примет.
    expect(
      RUN.restore!(context(['restore', file, '--db', path]))
    ).rejects.toThrow(expect.objectContaining({ code: 'backup.invalid' }));
  });
});
