import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { type Context, RUN } from '../src/cli/commands.ts';
import { definePaint } from '../src/cli/paint.ts';
import { SCAFFOLDS, SCAFFOLDS_EN } from '../src/scaffolds/index.ts';
import {
  packageScaffold,
  parseManifest,
  readPackageFolder,
  textOf,
} from '../src/scaffolds/package/index.ts';
import type { ScaffoldPage } from '../src/scaffolds/scaffold.ts';

// Каркас студии — официальный пакет packages/kuechenstudio (ADR 0056): тесты ставят его так же, как cms new.
const _PACKAGE = join(import.meta.dir, '../packages/kuechenstudio');
const _FILES = readPackageFolder(_PACKAGE).files;
const _MANIFEST = parseManifest(textOf(_FILES, 'manifest.json')).manifest!;
const KUECHENSTUDIO = packageScaffold(_FILES, _MANIFEST, 'de');

const _lum = (hex: string): number =>
  ((c) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!)(
    [1, 3, 5]
      .map((_) => Number.parseInt(hex.slice(_, _ + 2), 16) / 255)
      .map((_) => (_ <= 0.04045 ? _ / 12.92 : ((_ + 0.055) / 1.055) ** 2.4))
  );
const _contrast = (a: string, b: string): number =>
  ((x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))(
    _lum(a),
    _lum(b)
  );

// Сайт кухонной студии (ADR 0055): страницы и настройки каркаса, чужие планер и чат — только по настройкам.

let app: App;

afterEach(() => app?.close());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://localhost${path}`, { headers }));

const html = (path: string) => get(path).then((_) => _.text());

const PATHS = [
  '/',
  '/kuechen',
  '/kuechen/grifflos',
  '/kuechen/landhaus',
  '/kuechen/kochinsel',
  '/kuechen/kleine-kueche',
  '/online-planen',
  '/leistungen',
  '/ueber-uns',
  '/kontakt',
  '/impressum',
  '/datenschutz',
];

// Чужой скрипт на странице: тег с адресом вне сайта. Адреса в тексте Datenschutz — не теги.
const _FOREIGN = /<script[^>]+src="https?:\/\/[^"]+"/g;
const _foreign = (page: string): string[] =>
  [...page.matchAll(_FOREIGN)].map((_) => /src="([^"]+)"/.exec(_[0])![1]!);

const CHAT = 'https://chat.example/widget.js';
const PLANNER = 'https://planner.example/embed.js';

const embed = (more: Record<string, string> = {}) =>
  Object.entries({
    chatScript: CHAT,
    chatAttributes: 'data-widget="sticky" data-studio="demo-studio"',
    plannerScript: PLANNER,
    plannerAttributes: 'data-studio="demo-studio"\ndata-height="800"',
    ...more,
  }).forEach(
    ({ 0: key, 1: value }) => void app.site.customSettings.save(key, value)
  );

describe('каркас kuechenstudio', () => {
  it('официальный пакет, не встроенный каркас; сайт немецкий', () => {
    expect(SCAFFOLDS.some((_) => _.name === 'kuechenstudio')).toBe(false);
    expect(SCAFFOLDS_EN.some((_) => _.name === 'kuechenstudio')).toBe(false);
    app = createApp({ scaffold: KUECHENSTUDIO });
    expect(app.site.settings.get().language).toBe('de');
  });

  it('страницы, поля, форма и свои настройки с пояснениями', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    for (const path of PATHS) {
      expect([path, (await get(path)).status]).toEqual([path, 200]);
    }
    expect((await get('/gibt-es-nicht')).status).toBe(404);
    expect(app.forms.forms.exists('termin')).toBe(true);
    const settings = new Map(
      app.site.customSettings.list().map((_) => [String(_.key), _])
    );
    [
      'chatScript',
      'chatAttributes',
      'plannerScript',
      'plannerAttributes',
    ].forEach(
      (key) => void expect([key, settings.get(key)?.value]).toEqual([key, ''])
    );
    // Пояснение говорит, где взять значение: у поставщика сервиса, а не у нас.
    expect(settings.get('plannerScript')?.note).toContain('Kundenbereich');
    expect(settings.get('chatAttributes')?.note).toContain('Einbauanleitung');
    expect([...settings.values()].every((_) => _.note !== '')).toBe(true);
    expect(Number(settings.get('contactPage')?.value)).toBe(
      app.content.published.byPath('/kontakt')!.id
    );
  });

  it('без адресов скриптов — ни одного чужого скрипта и запроса', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    for (const path of PATHS) {
      const page = await html(path);
      expect([path, _foreign(page)]).toEqual([path, []]);
      expect(page).not.toContain('rel="preconnect"');
    }
    // Страница планера — приглашение спланировать вместе, без пустого места под виджет.
    const planner = await html('/online-planen');
    expect(planner).toContain('Ihre Küche planen wir gemeinsam');
    expect(planner).toContain('#form-termin');
    // Пункта меню и кнопки «online planen» нет, пока планер не подключён.
    const home = await html('/');
    expect(home).not.toContain('href="/online-planen"');
    expect(home).toContain('Küchen ansehen');
  });

  it('с адресами — чат везде, кроме страницы планера, и планер на ней', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    embed();
    const home = await html('/');
    expect(_foreign(home)).toEqual([CHAT]);
    const chat = home.match(/<script[^>]+chat\.example[^>]*>/)![0];
    expect(chat).toContain('data-widget="sticky"');
    expect(chat).toContain('data-studio="demo-studio"');
    expect(chat).toContain('defer');
    // Без inline-обработчиков: строгий CSP сайта их бы не пропустил.
    expect(chat).not.toMatch(/\son[a-z]+=/);
    expect(home).toContain(
      '<link rel="preconnect" href="https://chat.example"'
    );
    expect(home).toContain('href="/online-planen"');
    const planner = await html('/online-planen');
    expect(_foreign(planner)).toEqual([PLANNER]);
    const frame = planner.match(/<script[^>]+planner\.example[^>]*>/)![0];
    expect(frame).toContain(
      'data-studio="demo-studio" data-height="800" defer'
    );
    expect(planner).toContain('min-height: 50rem');
    expect(_foreign(await html('/kontakt'))).toEqual([CHAT]);
    // По желанию чат стоит и рядом с планером.
    embed({ chatOnPlanner: 'ja', plannerHeight: '640' });
    const both = await html('/online-planen');
    expect(_foreign(both).sort()).toEqual([CHAT, PLANNER].sort());
    expect(both).toContain('min-height: 40rem');
  });

  it('весь код установки в поле атрибутов: src и data-…, остальное мимо', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    embed({
      plannerScript: '',
      plannerAttributes:
        '<script src="https://planner.example/embed.js" data-studio="x" onload="alert(1)" data-lang=\'de\' style="x" defer></script>',
    });
    const planner = await html('/online-planen');
    const frame = planner.match(/<script[^>]+planner\.example[^>]*>/)![0];
    expect(frame).toBe(
      '<script src="https://planner.example/embed.js" data-studio="x" data-lang="de" defer>'
    );
    expect(planner).not.toContain('alert(1)');
    expect(planner).toContain(
      'übergangen (erlaubt sind nur data-…): onload, style'
    );
  });

  it('выключатели, адрес скриптов и экранирование', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    embed({ chatEnabled: 'nein' });
    expect(_foreign(await html('/'))).toEqual([]);
    expect(_foreign(await html('/online-planen'))).toEqual([PLANNER]);
    embed({ chatEnabled: 'ja', plannerEnabled: 'nein' });
    const planner = await html('/online-planen');
    expect(planner).toContain('Ihre Küche planen wir gemeinsam');
    // Без планера чату на этой странице мешать нечему.
    expect(_foreign(planner)).toEqual([CHAT]);
    // Чужой адрес по http, javascript: и адрес с паролем не грузятся; http — только с машины разработчика.
    for (const bad of [
      'http://chat.example/widget.js',
      'javascript:alert(1)',
      'https://user:secret@chat.example/w.js',
    ]) {
      embed({ chatScript: bad });
      expect([bad, _foreign(await html('/'))]).toEqual([bad, []]);
    }
    expect(await html('/')).toContain(
      'Die Adresse in chatScript wird nicht geladen'
    );
    embed({ chatScript: 'http://localhost:5771/widget.js' });
    expect(_foreign(await html('/'))).toEqual([
      'http://localhost:5771/widget.js',
    ]);
    embed({
      plannerEnabled: 'ja',
      plannerAttributes: 'data-studio="a&quot;b<c>"',
    });
    const planned = await html('/online-planen');
    expect(planned).toContain('data-studio="a&amp;quot;b&lt;c&gt;"');
    expect(planned).not.toContain('b<c>');
    embed({
      chatAttributes: 'data-name="Küchen \'&\' Söhne" data-x="</script>"',
    });
    const home = await html('/');
    expect(home).toContain('data-name="Küchen \'&amp;\' Söhne"');
    expect(home).not.toContain('data-x="</script>"');
  });

  it('форма «Termin» на странице контактов, согласие ведёт на Datenschutz', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    const page = await html('/kontakt');
    expect(page).toContain('id="form-termin"');
    expect(page).toMatch(/name="name"[^>]*required/);
    expect(page).toMatch(/name="phone"[^>]*type="tel"/);
    expect(page).toContain('type="date"');
    expect(page).toContain('href="/datenschutz"');
    expect(page).toContain('Termin anfragen');
  });

  it('телефон формы: шаблон годится для флага v, как его читают браузер и сервер', () => {
    const source = KUECHENSTUDIO.forms!.termin!.source!;
    const pattern = /name="phone"[^>]*pattern="([^"]+)"/.exec(source)![1]!;
    const phone = new RegExp(`^(?:${pattern})$`, 'v');
    expect(
      ['030 1234567', '+49 (30) 123/456-7'].every((_) => phone.test(_))
    ).toBe(true);
    expect(['abc', '12345'].some((_) => phone.test(_))).toBe(false);
    expect(source).toContain('autocomplete="tel"');
    expect(source).toContain('autocomplete="name"');
    expect(source).toContain('autocomplete="email"');
  });

  it('контакты и часы из настроек: шапка, подвал, контакты и HomeGoodsStore', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    // Пока настройки не заполнены — пустые поля, без ссылок tel: и данных для поисковиков.
    const blank = await html('/');
    expect(blank).toContain('class="blank');
    expect(blank).not.toContain('href="tel:');
    expect(blank).not.toContain('PostalAddress');
    Object.entries({
      studioStreet: 'Hauptstraße 12',
      studioZip: '10115',
      studioCity: 'Berlin',
      studioPhone: '030 1234567',
      studioEmail: 'info@kuechen.example',
      studioHours: 'Mo-Fr 10:00-18:30; Sa 10-14; So geschlossen',
    }).forEach(
      ({ 0: key, 1: value }) => void app.site.customSettings.save(key, value)
    );
    const home = await html('/');
    // В заголовке «Küchenstudio» один раз; телефон — в E.164.
    expect(home).toContain('<title>Ihr Küchenstudio in Berlin</title>');
    expect(home).toContain('href="tel:+49301234567"');
    expect(home).toContain('10:00–18:30 Uhr');
    const ld = JSON.parse(
      home.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)![1]!
    );
    expect(ld['@type']).toBe('HomeGoodsStore');
    expect(ld.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Hauptstraße 12',
      postalCode: '10115',
      addressLocality: 'Berlin',
      addressCountry: 'DE',
    });
    // «Sa 10-14» — часы без минут тоже разбираются; «So geschlossen» — текст для людей.
    expect(ld.telephone).toBe('+49301234567');
    expect(ld.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(
          (_) => `https://schema.org/${_}`
        ),
        opens: '10:00',
        closes: '18:30',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['https://schema.org/Saturday'],
        opens: '10:00',
        closes: '14:00',
      },
    ]);
    expect(ld.hasMap).toContain('google.com/maps');
    // Свой JSON-LD шаблона — один на странице: рендер свой граф не добавляет.
    expect(home.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(await html('/impressum')).toContain('Hauptstraße 12');
    expect(await html('/kontakt')).toContain('HomeGoodsStore');
    expect(await html('/leistungen')).not.toContain('HomeGoodsStore');
  });

  it('акцент владельца: на белом и на сланце читаемы кнопки, линии и фокус при любом цвете', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    const SLATE = '#3a4049';
    const MIST = '#f4f4f2';
    const vars = async (color: string) => (
      app.site.customSettings.save('accentColor', color),
      Object.fromEntries(
        [
          ...(await html('/'))
            .match(/class="site[^"]*" style="([^"]+)"/)![1]!
            .matchAll(/--([a-z-]+): (#[0-9a-f]{6})/g),
        ].map((_) => [_[1]!, _[2]!])
      )
    );
    for (const color of [
      '#c49a55',
      '#14213d',
      '#1d3557',
      '#0b5d3b',
      '#7a1f2b',
      '#000000',
      '#c0392b',
      '#f2d24b',
      '#e9e4da',
    ]) {
      const v = await vars(color);
      const check = (what: string, ratio: number, min: number) =>
        expect([color, what, ratio >= min]).toEqual([color, what, true]);
      check('текст на кнопке', _contrast(v.accent!, v['on-accent']!), 4.5);
      check(
        'текст на кнопке на сланце',
        _contrast(v['accent-dark']!, v['on-accent-dark']!),
        4.5
      );
      check('кнопка на сланце', _contrast(v['accent-dark']!, SLATE), 3);
      check('линия на светлом', _contrast(v['accent-line']!, MIST), 2);
      check('линия на сланце', _contrast(v['accent-line-dark']!, SLATE), 2.5);
      check('фокус на светлом', _contrast(v.focus!, MIST), 3);
      check('фокус на сланце', _contrast(v['focus-dark']!, SLATE), 3);
    }
    // Тёмно-синий на сланце осветлён в OKLCH, но остаётся синим, а не серым.
    const navy = await vars('#14213d');
    expect(navy['accent-dark']).not.toBe('#ffffff');
    const { 0: red, 2: blue } = [1, 3, 5].map((_) =>
      Number.parseInt(navy['accent-dark']!.slice(_, _ + 2), 16)
    );
    expect(blue!).toBeGreaterThan(red!);
    // Чёрный осветлять некуда — на сланце кнопка белая, с тёмным текстом.
    expect((await vars('#000000'))['accent-dark']).toBe('#ffffff');
    // Светло-жёлтый остаётся сам собой: текст на нём тёмный.
    expect((await vars('#f2d24b')).accent).toBe('#f2d24b');
    app.site.customSettings.save('accentColor', 'red; x: y');
    expect(await html('/')).toContain('--accent: #c49a55');
  });

  it('доверие из настроек: заполненное видно с пробелами, пустое — только владельцу', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    const blank = await html('/');
    // Заготовки ассистента консультации видит только владелец: в разметке они скрыты.
    expect(blank).toMatch(/<div class="side person[^"]*" hidden/);
    Object.entries({
      studioSince: '1998',
      studioCraft: 'Meisterbetrieb',
      callbackTime: 'innerhalb eines Werktags',
      contactName: 'Anna Beispiel',
      contactRole: 'Inhaberin',
      consultDuration: 'etwa 90 Minuten',
      studioStreet: 'Hauptstraße 12',
      studioZip: '10115',
      studioCity: 'Berlin',
    }).forEach(
      ({ 0: key, 1: value }) => void app.site.customSettings.save(key, value)
    );
    const text = (await html('/')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    expect(text).toContain('Seit 1998');
    expect(text).toContain('Wir rufen Sie innerhalb eines Werktags an');
    expect(text).toContain('10115 Berlin');
    expect(text).toContain('Anna Beispiel');
    const home = await html('/');
    expect(home).not.toMatch(/<div class="side person[^"]*" hidden/);
  });

  it('подсказки владельцу — в странице скрытыми, их открывает полоса правки', async () => {
    app = createApp({ scaffold: KUECHENSTUDIO });
    // Пакет ставит шрифт Jost в медиатеку: страница подключает его и заранее загружает.
    const withFont = await html('/online-planen');
    expect(withFont).toContain('@font-face');
    expect(withFont).toContain(
      'rel="preload" href="/media/fonts/jost-latin.woff2'
    );
    app.media.files.remove('fonts/jost-latin.woff2');
    const page = await html('/online-planen');
    expect(page).toMatch(/<aside class="setup[^"]*" hidden/);
    expect(page).toContain('Kein Online-Planer und kein Chat eingebunden');
    const css = await Promise.all(
      [...page.matchAll(/href="(\/_cms\/styles\/[^"]+\.css)"/g)].map((_) =>
        html(_[1]!)
      )
    );
    expect(css.join('\n')).toMatch(/body:has\(>\s*script\[data-eile-bar\]\)/);
    // Шрифта в медиатеке нет — ни @font-face, ни запроса; владелец видит, какой файл загрузить.
    expect(page).not.toContain('@font-face');
    expect(page).toContain('jost-latin.woff2');
    // Markdown-версия страницы подсказок не несёт.
    const markdown = await get('/online-planen', { accept: 'text/markdown' });
    expect(await markdown.text()).not.toContain('Kein Online-Planer');
  });
});

// Медиатека пакета: фото-образцы и шрифт, описания — в manifest.media, лицензия шрифта — LICENSE.
const _MEDIA = join(_PACKAGE, 'media');
const _flat = (pages: readonly ScaffoldPage[]): ScaffoldPage[] =>
  pages.flatMap((_) => [_, ..._flat(_.children ?? [])]);

describe('медиатека пакета kuechenstudio', () => {
  it('фото-образцы: файлы на месте, alt с «Beispielbild:», каждое стоит в поле страницы', () => {
    const media = _MANIFEST.media ?? {};
    const photos = Object.keys(media).filter((_) => _.startsWith('beispiel/'));
    expect(photos.length).toBeGreaterThanOrEqual(5);
    const used = new Set(
      _flat(KUECHENSTUDIO.pages).flatMap((_) =>
        Object.values(_.fields ?? {}).filter((v) => typeof v === 'string')
      )
    );
    for (const path of photos) {
      const file = join(_MEDIA, path);
      expect([path, existsSync(file)]).toEqual([path, true]);
      expect(statSync(file).size).toBeLessThan(260_000);
      expect(media[path]?.alt?.startsWith('Beispielbild: ')).toBe(true);
      expect([path, used.has(path)]).toEqual([path, true]);
    }
    const total = photos.reduce(
      (sum, _) => sum + statSync(join(_MEDIA, _)).size,
      0
    );
    expect(total).toBeLessThan(1_250_000);
    expect(existsSync(join(_MEDIA, 'fonts/jost-latin.woff2'))).toBe(true);
    expect(textOf(_FILES, 'LICENSE')).toContain('SIL OPEN FONT LICENSE');
  });
});

describe('cms new kuechenstudio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cms-studio-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('на английском CLI — тот же немецкий сайт', async () => {
    const output: string[] = [];
    const db = join(dir, 'studio.db');
    const context: Context = {
      args: [_PACKAGE],
      options: {
        port: '8080',
        db,
        help: false,
        version: false,
        passwordStdin: false,
        trustProxy: false,
      },
      paint: definePaint(false),
      language: 'en',
      tty: false,
      out: (_) => void output.push(_),
    };
    await RUN.new!(context);
    expect(output.join('\n')).toContain('Küchenstudio');
    app = createApp({ databasePath: db });
    expect(app.site.settings.get().language).toBe('de');
    expect(app.forms.forms.exists('termin')).toBe(true);
  });
});
