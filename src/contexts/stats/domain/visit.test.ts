import { describe, expect, it } from 'bun:test';
import {
  addDays,
  browserLanguageOf,
  countableBeacon,
  countableGo,
  countableView,
  dayOf,
  daysBetween,
  deviceOf,
  isBot,
  isDay,
  networkOf,
  originOf,
  refererKindOf,
  referrerHost,
  requestSourceOf,
  sourceOfOrigin,
  sourceOfVisit,
  utmOf,
  visitOf,
} from './visit.ts';

const _CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const _IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const _ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const _ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Заголовки перехода браузера; `extra` дописывает или убирает (null) отдельные.
const browser =
  (extra: Record<string, string | null> = {}) =>
  (name: string): string | null =>
    (
      ({
        'user-agent': _CHROME,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        ...extra,
      }) as Record<string, string | null>
    )[name] ?? null;

describe('что считается просмотром', () => {
  it('переход браузера — да; Safari без Sec-Fetch — тоже', () => {
    expect(countableView(browser())).toBe(true);
    expect(
      countableView(browser({ 'sec-fetch-mode': null, 'sec-fetch-dest': null }))
    ).toBe(true);
  });

  it('предзагрузка и пререндер — нет', () => {
    expect(countableView(browser({ 'sec-purpose': 'prefetch' }))).toBe(false);
    expect(
      countableView(browser({ 'sec-purpose': 'prefetch;prerender' }))
    ).toBe(false);
    expect(countableView(browser({ purpose: 'prefetch' }))).toBe(false);
    expect(countableView(browser({ 'x-moz': 'prefetch' }))).toBe(false);
  });

  it('fetch из скрипта, фрейм и запрос без Accept-Language — нет', () => {
    expect(countableView(browser({ 'sec-fetch-mode': 'cors' }))).toBe(false);
    expect(countableView(browser({ 'sec-fetch-dest': 'iframe' }))).toBe(false);
    expect(countableView(browser({ 'accept-language': null }))).toBe(false);
    expect(countableView(browser({ accept: '*/*' }))).toBe(false);
  });

  it('боты, проверки и HTTP-библиотеки — нет; Cubot и браузеры приложений — люди', () => {
    for (const agent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Chrome-Lighthouse)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0',
      'curl/8.9.1',
      'python-requests/2.32',
      'Go-http-client/1.1',
      '',
    ]) {
      expect(isBot(agent)).toBe(true);
      expect(countableView(browser({ 'user-agent': agent }))).toBe(false);
    }
    expect(
      isBot(
        'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
      )
    ).toBe(false);
    expect(isBot(`${_ANDROID_PHONE} Telegram-Android/11.2.3`)).toBe(false);
  });

  it('маячок: браузер с языком — да, бот — нет; режим fetch ему не мешает', () => {
    expect(
      countableBeacon(
        browser({ 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'empty' })
      )
    ).toBe(true);
    expect(countableBeacon(browser({ 'user-agent': 'curl/8' }))).toBe(false);
    expect(countableBeacon(browser({ 'accept-language': null }))).toBe(false);
  });
});

describe('переход аналитики', () => {
  it('цель — только GET и переход браузера: HEAD, бот и предзагрузка — нет', () => {
    expect(countableGo('GET', browser())).toBe(true);
    expect(countableGo('HEAD', browser())).toBe(false);
    expect(countableGo('GET', browser({ 'user-agent': 'curl/8.9.1' }))).toBe(
      false
    );
    expect(countableGo('GET', browser({ 'sec-purpose': 'prefetch' }))).toBe(
      false
    );
    expect(countableGo('GET', browser({ 'sec-fetch-mode': 'cors' }))).toBe(
      false
    );
  });

  it('откуда пришёл запрос: без Referer — none, свой сайт — own, чужой — foreign', () => {
    const own = ['site.test', 'www.muehlenhof.example'];
    expect(refererKindOf(null, own)).toBe('none');
    expect(refererKindOf('', own)).toBe('none');
    expect(refererKindOf('not a url', own)).toBe('none');
    expect(refererKindOf('https://site.test/kontakt', own)).toBe('own');
    expect(refererKindOf('https://www.site.test/', own)).toBe('own');
    expect(refererKindOf('https://muehlenhof.example/', own)).toBe('own');
    expect(refererKindOf('https://l.instagram.com/', own)).toBe('foreign');
    expect(refererKindOf('android-app://org.telegram.messenger/', own)).toBe(
      'foreign'
    );
  });

  it('источник запроса: все пять UTM адреса перехода и хост реферера', () => {
    expect(
      requestSourceOf(
        browser({ referer: 'https://www.Google.de/search' }),
        new URLSearchParams(
          'utm_source=QR&utm_medium=Print&utm_campaign=Herbst&utm_content=Flyer%20A&utm_term=k%C3%BCche'
        ),
        ['site.test']
      )
    ).toEqual({
      utmSource: 'qr',
      utmMedium: 'print',
      utmCampaign: 'Herbst',
      utmContent: 'Flyer A',
      utmTerm: 'küche',
      referrer: 'google.de',
      referer: 'foreign',
    });
    expect(
      requestSourceOf(
        browser({ referer: 'https://site.test/' }),
        new URLSearchParams(),
        ['site.test']
      )
    ).toMatchObject({ referrer: '', referer: 'own' });
  });

  it('origin: источник посещения туда и обратно; чужое значение — пустой источник', () => {
    const visit = visitOf(
      browser({ referer: 'https://l.instagram.com/' }),
      new URLSearchParams('utm_campaign=Herbst&utm_content=ad-1'),
      '/',
      []
    );
    const source = sourceOfVisit(visit);
    expect(source).toEqual({
      utmSource: '',
      utmMedium: '',
      utmCampaign: 'Herbst',
      utmContent: 'ad-1',
      utmTerm: '',
      referrer: 'l.instagram.com',
    });
    expect(originOf(source)).toBe(
      '["","","Herbst","ad-1","","l.instagram.com"]'
    );
    expect(sourceOfOrigin(originOf(source))).toEqual(source);
    // В строке посещения нет ни страницы входа, ни устройства.
    expect(originOf(visit)).toBe(originOf(source));
    const empty = {
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmContent: '',
      utmTerm: '',
      referrer: '',
    };
    expect(sourceOfOrigin('{"x":1}')).toEqual(empty);
    expect(sourceOfOrigin('не json')).toEqual(empty);
    expect(sourceOfOrigin('[1,"a"]')).toEqual({ ...empty, utmMedium: 'a' });
  });
});

describe('посещение', () => {
  it('устройство по User-Agent и подсказке Chromium', () => {
    expect(deviceOf(_CHROME, null)).toBe('desktop');
    expect(deviceOf(_IPHONE, null)).toBe('mobile');
    expect(deviceOf(_ANDROID_PHONE, null)).toBe('mobile');
    expect(deviceOf(_ANDROID_TABLET, null)).toBe('tablet');
    expect(deviceOf(_CHROME, '?1')).toBe('mobile');
  });

  it('реферер — только хост чужого сайта, без www; свой сайт и мусор — пусто', () => {
    expect(referrerHost('https://www.Google.de/search?q=küche', [])).toBe(
      'google.de'
    );
    expect(
      referrerHost('https://muehlenhof.example/ratgeber', [
        'www.muehlenhof.example',
      ])
    ).toBe('');
    expect(referrerHost('android-app://com.google.android.gm/', [])).toBe(
      'com.google.android.gm'
    );
    expect(referrerHost('javascript:alert(1)', [])).toBe('');
    expect(referrerHost('not a url', [])).toBe('');
    expect(referrerHost(null, [])).toBe('');
  });

  it('UTM: source и medium строчными, campaign, content и term как есть, без управляющих символов', () => {
    expect(
      utmOf(
        new URLSearchParams(
          'utm_source=Newsletter&utm_medium=E-Mail&utm_campaign=Herbst%202026%0A&utm_content=Banner%0D%0AOben&utm_term=K%C3%BCche%20Eiche&x=1'
        )
      )
    ).toEqual({
      source: 'newsletter',
      medium: 'e-mail',
      campaign: 'Herbst 2026',
      content: 'BannerOben',
      term: 'Küche Eiche',
    });
    expect(
      utmOf(new URLSearchParams(`utm_term=${'b'.repeat(300)}`)).term
    ).toHaveLength(100);
    expect(
      utmOf(new URLSearchParams(`utm_source=${'a'.repeat(300)}`)).source
    ).toHaveLength(100);
  });

  it('язык браузера — первый, без региона', () => {
    expect(browserLanguageOf('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
    expect(browserLanguageOf('EN')).toBe('en');
    expect(browserLanguageOf('*')).toBe('');
    expect(browserLanguageOf(null)).toBe('');
  });

  it('адрес для хэша: IPv4 как есть, у IPv6 — сеть /64', () => {
    expect(networkOf('203.0.113.7')).toBe('203.0.113.7');
    expect(networkOf('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(networkOf('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb');
    expect(networkOf('2001:DB8:aa:bb::9')).toBe('2001:db8:aa:bb');
    expect(networkOf('2001:db8::1')).toBe('2001:db8:0:0');
    expect(networkOf('fe80::1%eth0')).toBe('fe80:0:0:0');
  });

  it('известные сервисы — под одним именем, хост реферера остаётся как есть', () => {
    const from = (referer: string, query = '') =>
      visitOf(browser({ referer }), new URLSearchParams(query), '/', [
        'muehlenhof.example',
      ]);
    expect(from('https://www.google.de/').source).toBe('Google');
    expect(from('https://www.google.com/search?q=k').source).toBe('Google');
    expect(from('', 'utm_source=Google&utm_medium=cpc').source).toBe('Google');
    expect(from('https://www.google.de/').referrer).toBe('google.de');
    expect(from('https://gemini.google.com/app').source).toBe('Gemini');
    expect(from('android-app://com.google.android.gm/').source).toBe('Gmail');
    expect(from('https://l.instagram.com/').source).toBe('Instagram');
    expect(from('https://lm.facebook.com/').source).toBe('Facebook');
    expect(from('https://www.pinterest.de/').source).toBe('Pinterest');
    expect(from('https://t.co/abc').source).toBe('X');
    expect(from('https://chatgpt.com/').source).toBe('ChatGPT');
    expect(from('https://www.ecosia.org/').source).toBe('Ecosia');
    expect(from('https://moebel-blog.de/').source).toBe('moebel-blog.de');
    expect(from('', 'utm_source=newsletter').source).toBe('newsletter');
    expect(from('https://evilgoogle.de/').source).toBe('evilgoogle.de');
  });

  it('источник — utm_source, иначе реферер; пусто — прямой заход', () => {
    const header = browser({ referer: 'https://www.instagram.com/' });
    expect(
      visitOf(header, new URLSearchParams(), '/kuechenplaner', [
        'muehlenhof.example',
      ])
    ).toEqual({
      entry: '/kuechenplaner',
      source: 'Instagram',
      referrer: 'instagram.com',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmContent: '',
      utmTerm: '',
      device: 'desktop',
      browserLanguage: 'de',
    });
    expect(
      visitOf(header, new URLSearchParams('utm_source=ads'), '/', []).source
    ).toBe('ads');
    expect(visitOf(browser(), new URLSearchParams(), '/', []).source).toBe('');
  });
});

describe('дни', () => {
  it('день — в поясе статистики', () => {
    const late = new Date('2026-11-03T23:30:00Z');
    expect(dayOf(late, 'UTC')).toBe('2026-11-03');
    expect(dayOf(late, 'Europe/Berlin')).toBe('2026-11-04');
  });

  it('сдвиг, длина периода и проверка даты', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-05', '2026-11-03')).toBe(30);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-11-03')).toBe(true);
    expect(isDay('03.11.2026')).toBe(false);
  });
});
