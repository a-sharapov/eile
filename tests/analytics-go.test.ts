import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { partsOfVisit } from '../src/contexts/analytics/domain/labels.ts';
import type { SetupAuthor } from '../src/contexts/analytics/index.ts';
import { SUBSCRIPTION } from './fixtures/analytics-subscription.ts';
import { DEMO } from './fixtures/demo.ts';

// Переход `/_cms/go/<имя>` (ADR 0072, «Переход»): 302 к отправителю с меткой из заданных частей и источника
// посещения дня, цели `go:<код>` и `go:` в статистике, 404 страницей сайта, без cookie и тела.

const ANNA: SetupAuthor = { id: 1, name: 'Анна', agent: false };
const BOT = 'https://t.me/sample_subscription_bot?start=';
const SITE = 'https://site.test';

const _CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Переход браузера: заголовки, какие шлёт Chrome при клике по ссылке.
const _BROWSER = {
  'user-agent': _CHROME,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
};

const _ADDRESS = '203.0.113.7';

let dir: string;
let app: App;
let now: Date;

const from = (address: string) => ({ requestIP: () => ({ address }) });

const request = (
  path: string,
  headers: Record<string, string> = {},
  address = _ADDRESS,
  method = 'GET'
) =>
  app.fetch(
    new Request(`${SITE}${path}`, {
      method,
      headers: { ..._BROWSER, ...headers },
    }),
    from(address)
  );

const view = (
  path: string,
  headers: Record<string, string> = {},
  address?: string
) =>
  request(path, headers, address).then((_) => (expect(_.status).toBe(200), _));

// Клик по кнопке перехода на странице `page` своего сайта.
const click = (
  page = '/',
  query = '',
  headers: Record<string, string> = {},
  address?: string,
  method = 'GET'
) =>
  request(
    `/_cms/go/trial${query}`,
    { referer: `${SITE}${page}`, ...headers },
    address,
    method
  );

const labelOf = (response: Response): string | null =>
  ((location) =>
    location?.startsWith(BOT) ? location.slice(BOT.length) : location)(
    response.headers.get('location')
  );

const today = () => app.stats.report({ days: 1 }).today;

const goal = (code: string) =>
  app.stats.report({ days: 1 }).goals.find((_) => _.goal === code);

const count = (table: string): number => {
  const db = new Database(join(dir, 'site.db'), { readonly: true });
  const { n } = db
    .query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`)
    .get()!;
  db.close();
  return n;
};

beforeEach(() => {
  now = new Date('2026-11-15T12:00:00Z');
  dir = mkdtempSync(join(tmpdir(), 'cms-go-'));
  app = createApp({
    scaffold: DEMO,
    clock: () => now,
    databasePath: join(dir, 'site.db'),
    mediaCache: join(dir, 'cache'),
  });
  app.stats.settings.save({ enabled: true, timeZone: 'Europe/Berlin' });
  app.analytics.setup.apply(SUBSCRIPTION, ANNA);
  app.analytics.settings.save({ enabled: true }, ANNA);
});

afterEach(() => {
  app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('ответ перехода', () => {
  it('просмотр с UTM, затем клик со своей страницы — 302 с меткой из UTM, без тела и cookie', async () => {
    await view(
      '/?utm_source=ig&utm_medium=paid&utm_campaign=autumn&utm_content=ad-1'
    );
    const response = await click();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `${BOT}w-trial__ig__paid__autumn__ad-1`
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('set-cookie')).toBeNull();
    // Чужому сайту — только адрес с меткой: ни тела, ни других заголовков.
    expect([...response.headers.keys()].toSorted()).toEqual([
      'cache-control',
      'location',
      'x-robots-tag',
    ]);
    expect(await response.text()).toBe('');
    expect(goal('go:trial')).toMatchObject({
      kind: 'go',
      name: 'trial',
      label: 'Кнопка «Попробовать бесплатно»',
      visitors: 1,
      events: 1,
    });
    expect(goal('go:')).toMatchObject({
      kind: 'go',
      name: '',
      label: '',
      visitors: 1,
    });
  });

  it('неизвестное имя и не код — страница 404 сайта; POST — 405', async () => {
    const page404 = await request('/no-such-page');
    expect(page404.status).toBe(404);
    const body = await page404.text();
    for (const path of [
      '/_cms/go/nope',
      '/_cms/go/',
      '/_cms/go/TRIAL',
      '/_cms/go/trial/',
      '/_cms/go/trial/x',
      '/_cms/go/tr%69al',
      '/_cms/go/..%2ftrial',
      '/_cms/go/%2e%2e/trial',
      '/_cms/go/trial%2f..',
      '/_cms/go/tri%0d%0aal',
      `/_cms/go/${'a'.repeat(41)}`,
    ]) {
      const response = await request(path);
      expect([path, response.status]).toEqual([path, 404]);
      expect(response.headers.get('location')).toBeNull();
      // `%2e%2e` разбор адреса сам сводит к `/_cms/trial`: до перехода такой запрос не доходит.
      void (
        new URL(`${SITE}${path}`).pathname.startsWith('/_cms/go/') &&
        expect([path, await response.text()]).toEqual([path, body])
      );
    }
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await click('/', '', {}, _ADDRESS, method);
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expect(response.headers.get('location')).toBeNull();
    }
    expect(goal('go:')).toBeUndefined();
  });

  it('переход в архиве работает, удалённый — 404; отправитель в архиве и выключенный приём не ломают', async () => {
    app.analytics.setup.archive('link', { code: 'trial' }, true, ANNA);
    expect(labelOf(await click())).toBe('w-trial');
    app.analytics.senders.archive('bot', true, ANNA);
    expect(labelOf(await click())).toBe('w-trial');
    app.analytics.settings.save({ enabled: false }, ANNA);
    expect((await click()).status).toBe(302);
    app.analytics.setup.remove('link', { code: 'trial' }, ANNA);
    expect((await click()).status).toBe(404);
  });
});

describe('метка перехода — строки таблицы ADR', () => {
  it('пришёл с UTM на главную, нажал — части из UTM посещения', async () => {
    await view(
      '/?utm_source=ig&utm_medium=paid&utm_campaign=autumn&utm_content=ad-1'
    );
    await view('/blog', { referer: `${SITE}/` });
    expect(labelOf(await click('/blog'))).toBe(
      'w-trial__ig__paid__autumn__ad-1'
    );
  });

  it('пришёл из l.instagram.com без UTM, нажал на второй странице — соответствие реферера', async () => {
    await view('/', { referer: 'https://l.instagram.com/' });
    await view('/blog', { referer: `${SITE}/` });
    expect(labelOf(await click('/blog'))).toBe('w-trial__ig__organic');
  });

  it('открыл переход по QR-коду, посещения нет — прямой заход', async () => {
    const response = await request('/_cms/go/trial');
    expect(labelOf(response)).toBe('w-trial__direct__direct');
  });

  it('открыл переход с utm_source=qr — части самого запроса', async () => {
    expect(labelOf(await request('/_cms/go/trial?utm_source=qr'))).toBe(
      'w-trial__qr'
    );
  });

  it('UTM в адресе перехода и чужой сайт важнее посещения дня', async () => {
    await view('/?utm_source=ig&utm_medium=paid');
    expect(labelOf(await click('/', '?utm_source=fb'))).toBe('w-trial__fb');
    expect(
      labelOf(
        await request('/_cms/go/trial', {
          referer: 'https://blog.example.net/post',
        })
      )
    ).toBe('w-trial__blog-examp__referral');
  });

  it('открыл страницу до полуночи, нажал после — посещение прошлых суток забыто', async () => {
    now = new Date('2026-11-15T22:55:00Z');
    await view('/?utm_source=ig&utm_medium=paid');
    now = new Date('2026-11-15T23:05:00Z');
    expect(labelOf(await click())).toBe('w-trial');
  });

  it('счёт посещений выключен — со своей страницы только заданные части', async () => {
    await view('/?utm_source=ig&utm_medium=paid');
    app.stats.settings.save({ enabled: false });
    expect(labelOf(await click())).toBe('w-trial');
    expect(labelOf(await request('/_cms/go/trial'))).toBe(
      'w-trial__direct__direct'
    );
  });

  it('приём событий выключен — только заданные части, и с UTM, и с чужого сайта', async () => {
    await view('/?utm_source=ig&utm_medium=paid&utm_campaign=autumn');
    app.analytics.settings.save({ enabled: false }, ANNA);
    expect(labelOf(await click())).toBe('w-trial');
    expect(labelOf(await click('/', '?utm_source=qr'))).toBe('w-trial');
    expect(
      labelOf(
        await request('/_cms/go/trial', { referer: 'https://l.instagram.com/' })
      )
    ).toBe('w-trial');
    expect(labelOf(await request('/_cms/go/trial'))).toBe('w-trial');
    // Цель статистики от приёма событий не зависит.
    expect(goal('go:trial')?.visitors).toBe(1);
  });
});

describe('цели перехода', () => {
  it('бот, HEAD и предзагрузка — тот же Location без цели', async () => {
    await view('/?utm_source=ig&utm_medium=paid');
    const expected = 'w-trial__ig__paid';
    const head = await click('/', '', {}, _ADDRESS, 'HEAD');
    expect([head.status, labelOf(head)]).toEqual([302, expected]);
    expect(await head.text()).toBe('');
    expect(labelOf(await click('/', '', { 'sec-purpose': 'prefetch' }))).toBe(
      expected
    );
    expect(labelOf(await click('/', '', { purpose: 'prefetch' }))).toBe(
      expected
    );
    expect(goal('go:')).toBeUndefined();
    // Бот с тем же адресом перехода получает ту же метку из запроса, но посещения у него нет.
    const bot = { 'user-agent': 'curl/8.9.1' };
    expect(labelOf(await click('/', '?utm_source=qr', bot))).toBe(
      labelOf(await request('/_cms/go/trial?utm_source=qr', {}, '198.51.100.9'))
    );
    expect(labelOf(await click('/', '', bot))).toBe('w-trial');
    const googlebot = {
      'user-agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    };
    expect(labelOf(await click('/', '', googlebot))).toBe('w-trial');
    expect(goal('go:trial')).toBeUndefined();
    // Настоящий клик того же браузера — цель.
    await click();
    expect(goal('go:trial')?.visitors).toBe(1);
  });

  it('цель — только посетителю, который сегодня смотрел страницы; два посетителя — два', async () => {
    await request('/_cms/go/trial');
    expect(goal('go:')).toBeUndefined();
    await view('/', {}, '198.51.100.20');
    await view('/', { referer: 'https://l.instagram.com/' });
    await click('/', '', {}, '198.51.100.20');
    await click();
    await click();
    expect(goal('go:trial')).toMatchObject({ visitors: 2, events: 3 });
    expect(goal('go:')).toMatchObject({ visitors: 2, events: 3 });
  });

  it('повторы — не больше 20 за день на посетителя; посещение для метки — и после', async () => {
    await view('/?utm_source=ig');
    const labels = await Promise.all(
      Array.from({ length: 25 }, () => click().then(labelOf))
    );
    expect(new Set(labels)).toEqual(new Set(['w-trial__ig']));
    expect(goal('go:trial')).toMatchObject({ visitors: 1, events: 20 });
    expect(goal('go:')).toMatchObject({ visitors: 1, events: 20 });
  });

  it('переход не пишет в базу на каждый запрос: цели — в буфере, как просмотры', async () => {
    await view('/?utm_source=ig');
    await Promise.all(Array.from({ length: 5 }, () => click()));
    expect(count('stats_goals')).toBe(0);
    expect(count('stats_daily')).toBe(0);
    app.stats.report();
    // Две цели, по четыре разреза у каждой: всего, источник, вход, origin.
    expect(count('stats_goals')).toBe(8);
  });

  it('цель приписывается источнику, странице входа и origin посещения; origin в отчёт не выходит', async () => {
    await view('/blog?utm_source=ig&utm_medium=paid&utm_term=kurs');
    await click('/blog');
    const report = app.stats.report({ days: 1 });
    const trial = report.goals.find((_) => _.goal === 'go:trial')!;
    expect(trial.sources).toEqual([
      { value: 'Instagram', visitors: 1, events: 1, base: 1, rate: 1 },
    ]);
    expect(trial.entries.map((_) => _.value)).toEqual(['/blog']);
    expect(report.utmTerms).toEqual([{ value: 'kurs', visitors: 1, views: 1 }]);
    expect(JSON.stringify(report)).not.toContain('origin');
    expect(JSON.stringify(report)).not.toContain('["ig"');
  });

  it('посетители и переходы дня по источнику — как шаги-посещения воронки с part.source=ig', async () => {
    await view('/?utm_source=ig&utm_medium=paid', {}, '198.51.100.1');
    await view('/', { referer: 'https://www.instagram.com/' }, '198.51.100.2');
    await view('/', { referer: 'https://www.google.de/' }, '198.51.100.3');
    await view('/', {}, '198.51.100.4');
    await click('/', '', {}, '198.51.100.1');
    await click('/', '', {}, '198.51.100.3');
    await click('/', '', {}, '198.51.100.4');
    const day = today();
    const setup = app.analytics.setup.get();
    const ig = (sums: ReturnType<App['stats']['visits']>) =>
      sums.origins
        .filter((_) => partsOfVisit(_.source, setup).source === 'ig')
        .reduce((sum, _) => sum + _.visitors, 0);
    const visitors = app.stats.visits({ from: day, to: day });
    const clicked = app.stats.visits({ from: day, to: day }, { goal: 'go:' });
    expect([visitors.total, ig(visitors)]).toEqual([4, 2]);
    expect([clicked.total, ig(clicked)]).toEqual([3, 1]);
    expect(app.stats.since()).toEqual({ visits: day, origins: day });
  });

  it('воронка за сегодня с part.source=ig: посетители и переходы только из Instagram', async () => {
    await view('/?utm_source=ig&utm_medium=paid', {}, '198.51.100.1');
    await view('/', { referer: 'https://www.instagram.com/' }, '198.51.100.2');
    await view('/', { referer: 'https://www.google.de/' }, '198.51.100.3');
    await view('/', {}, '198.51.100.4');
    await click('/', '', {}, '198.51.100.1');
    await click('/', '', {}, '198.51.100.3');
    // Цели ещё в буфере счётчика: отчёт пишет его в базу сам, один раз.
    const visits = (filters = {}) =>
      app.analytics.reports
        .funnel({ days: 1, filters })
        .steps.filter((_) => _.side === 'visits')
        .map((_) => [_.step.kind, _.count, _.unfiltered]);
    expect(visits()).toEqual([
      ['visits', 4, false],
      ['goal', 2, false],
    ]);
    expect(visits({ 'part.source': 'ig' })).toEqual([
      ['visits', 2, false],
      ['goal', 1, false],
    ]);
    expect(visits({ 'part.source': '~unknown' })).toEqual([
      ['visits', 0, false],
      ['goal', 0, false],
    ]);
    // Признак людей статистика не знает: шаг-посещение его не получает.
    expect(visits({ 'part.source': 'ig', 'trait.lang': 'ru' })).toEqual([
      ['visits', 2, true],
      ['goal', 1, true],
    ]);
    const report = app.analytics.reports.funnel({ days: 1 });
    expect(report.visitsSince).toBe(today());
    expect(report.timeZone).toBe('Europe/Berlin');
    app.stats.settings.save({ enabled: false });
    expect(visits()).toEqual([
      ['visits', null, false],
      ['goal', null, false],
    ]);
  });
});

describe('безопасность перехода', () => {
  // Метка в Location — только из знаков a-z 0-9 _ - . ~, хост назначения — всегда t.me.
  const safe = (response: Response): void => {
    const location = response.headers.get('location') ?? '';
    expect([response.status, location]).toEqual([
      302,
      expect.stringMatching(
        /^https:\/\/t\.me\/sample_subscription_bot\?start=[a-z0-9_.~-]*$/
      ),
    ]);
    expect(new URL(location).host).toBe('t.me');
    expect(location).not.toMatch(/[\r\n]/);
  };

  const hostile = [
    '//evil.com',
    'https://evil.com/',
    '@evil.com',
    'x%0d%0aSet-Cookie:%20a=1',
    '%0d%0aLocation:%20https://evil.com',
    '..',
    '../../evil',
    '%2e%2e%2f',
    'ig/../../evil.com',
    '\\\\evil.com',
    'Ìnstägrâm',
    '%F0%9F%98%80',
    '%E2%80%AE',
    '%00',
    'a'.repeat(5000),
    '%C0%AE%C0%AE',
  ];

  it('UTM из адреса перехода: //evil.com, CRLF, @, .., юникод, длинные значения — хост тот же', async () => {
    for (const value of hostile) {
      for (const name of [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
      ]) {
        safe(await click('/', `?${name}=${value}`));
      }
      safe(
        await click(
          '/',
          `?utm_source=${value}&utm_medium=${value}&utm_campaign=${value}&utm_content=${value}`
        )
      );
    }
  });

  it('UTM из посещения дня и Referer чужого сайта — хост тот же', async () => {
    for (const [index, value] of hostile.entries()) {
      const address = `198.51.100.${index + 1}`;
      await view(
        `/?utm_source=${value}&utm_medium=${value}&utm_campaign=${value}&utm_content=${value}`,
        {},
        address
      );
      safe(await click('/', '', {}, address));
    }
    for (const referer of [
      'https://evil.com/',
      'https://evil.com@t.me/',
      'https://user:pass@evil.com:8443/x',
      'https://xn--80ak6aa92e.com/',
      'https://EVIL.com./',
      'android-app://com.evil/',
      'javascript:alert(1)',
      `https://${'a'.repeat(250)}.com/`,
    ]) {
      safe(await request('/_cms/go/trial', { referer }));
    }
  });

  it('пустая первая часть со разделителем «.» не делает метку хостом', async () => {
    app.analytics.setup.save('sender', { code: 'shop', name: 'Магазин' }, ANNA);
    app.analytics.setup.save(
      'schema',
      {
        sender: 'shop',
        name: 'Метка магазина',
        separator: '.',
        parts: ['campaign', 'source'],
      },
      ANNA
    );
    app.analytics.setup.save(
      'link',
      {
        code: 'buy',
        name: 'Купить',
        sender: 'shop',
        target: 'https://shop.example.com/r/{label}',
      },
      ANNA
    );
    await view('/?utm_source=ig');
    const response = await request('/_cms/go/buy', { referer: `${SITE}/` });
    expect(response.headers.get('location')).toBe(
      'https://shop.example.com/r/.ig'
    );
    expect(
      (
        await request('/_cms/go/buy?utm_source=..', { referer: `${SITE}/` })
      ).headers.get('location')
    ).toBe('https://shop.example.com/r/');
  });

  it('адрес назначения с переводом строки не сохраняется', () => {
    expect(() =>
      app.analytics.setup.save(
        'link',
        {
          code: 'bad',
          name: 'Плохой',
          sender: 'bot',
          target: 'https://t.me/Bot\r\nSet-Cookie: a=1?start={label}',
        },
        ANNA
      )
    ).toThrow();
  });
});
