import { describe, expect, it } from 'bun:test';
import {
  buildLabel,
  fillTarget,
  goLabel,
  goSourceOf,
  goTarget,
  hostMatches,
  type LabelNote,
  labelParts,
  parseLabel,
  parseTarget,
  partsOfVisit,
  partValue,
  valueState,
} from './labels.ts';
import type { GoSources, VisitSource } from './ports.ts';
import {
  applySet,
  archiveItem,
  EMPTY_SETUP,
  type GoLink,
  parseRef,
  readSet,
  type Setup,
} from './setup.ts';

// Части метки, схема бота, соответствия рефереров и переход — как в наборе «Подписка» ADR 0072.
const SETUP: Setup = applySet(
  readSet({
    format: 'eile-analytics-set',
    version: 1,
    name: 'Подписка',
    senders: [{ code: 'bot', name: 'Бот' }],
    dictionaries: [
      {
        code: 'entry',
        name: 'Вход',
        purpose: 'parts',
        length: 10,
        values: [
          { code: 'w-trial', name: 'Кнопка' },
          { code: 'post', name: 'Пост' },
        ],
      },
      {
        code: 'source',
        name: 'Источник',
        purpose: 'parts',
        utm: 'utm_source',
        length: 10,
        values: ['ig', 'fb', 'google', 'tg', 'direct'].map((code) => ({
          code,
          name: code,
        })),
      },
      {
        code: 'channel',
        name: 'Тип',
        purpose: 'parts',
        utm: 'utm_medium',
        length: 8,
        values: ['paid', 'organic', 'seo', 'referral', 'direct'].map(
          (code) => ({ code, name: code })
        ),
      },
      {
        code: 'campaign',
        name: 'Кампания',
        purpose: 'parts',
        utm: 'utm_campaign',
        length: 16,
        values: [{ code: 'autumn', name: 'Осень' }],
      },
      {
        code: 'creative',
        name: 'Креатив',
        purpose: 'parts',
        utm: 'utm_content',
        length: 10,
        values: [{ code: 'ad-1', name: 'Объявление 1' }],
      },
    ],
    schemas: [
      {
        sender: 'bot',
        name: 'Метка',
        parts: ['entry', 'source', 'channel', 'campaign', 'creative'],
      },
    ],
    referrers: [
      {
        code: 'instagram',
        name: 'Instagram',
        kind: 'host',
        host: 'instagram.com',
        parts: { source: 'ig', channel: 'organic' },
      },
      {
        code: 'ig-ads',
        name: 'Реклама Instagram',
        kind: 'host',
        host: 'ads.instagram.com',
        parts: { source: 'ig', channel: 'paid' },
      },
      {
        code: 'google',
        name: 'Google',
        kind: 'host',
        host: 'google.*',
        parts: { source: 'google', channel: 'seo' },
      },
      {
        code: 'other-sites',
        name: 'Другие сайты',
        kind: 'any',
        parts: { source: '{host}', channel: 'referral' },
      },
      {
        code: 'no-referrer',
        name: 'Прямой заход',
        kind: 'none',
        parts: { source: 'direct', channel: 'direct' },
      },
    ],
    links: [
      {
        code: 'trial',
        name: 'Попробовать',
        sender: 'bot',
        target: 'https://t.me/ExampleBot?start={label}',
        parts: { entry: 'w-trial' },
      },
    ],
  })
)(EMPTY_SETUP).state;

const SCHEMA = SETUP.schemas[0]!;
const TRIAL = SETUP.links[0] as GoLink;
const PART = (code: string) => SETUP.dictionaries.find((_) => _.code === code)!;

const visit = (source: Partial<VisitSource> = {}): VisitSource => ({
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmContent: '',
  utmTerm: '',
  referrer: '',
  ...source,
});

const UTM = visit({
  utmSource: 'ig',
  utmMedium: 'paid',
  utmCampaign: 'autumn',
  utmContent: 'ad-1',
});

const go = (
  request: Partial<GoSources['request']>,
  day: VisitSource | null
): GoSources => ({
  request: { ...visit(), referer: 'own', ...request },
  visit: day,
});

describe('разбор метки', () => {
  it('по таблице «Разбор метки»: части и замечания', () => {
    const rows: readonly (readonly [
      string,
      Record<string, string>,
      LabelNote[],
    ])[] = [
      [
        'w-trial__ig__paid__autumn__ad-1',
        {
          entry: 'w-trial',
          source: 'ig',
          channel: 'paid',
          campaign: 'autumn',
          creative: 'ad-1',
        },
        [],
      ],
      [
        'post__ig__organic',
        { entry: 'post', source: 'ig', channel: 'organic' },
        [],
      ],
      [
        'W-Trial__IG__Paid',
        { entry: 'w-trial', source: 'ig', channel: 'paid' },
        [],
      ],
      ['w-trial____paid', { entry: 'w-trial', channel: 'paid' }, []],
      [
        'w-trial__ig__paid__autumn__ad-1__extra',
        {
          entry: 'w-trial',
          source: 'ig',
          channel: 'paid',
          campaign: 'autumn',
          creative: 'ad-1',
        },
        ['extra'],
      ],
      [
        'w-trial__ig.com__paid',
        { entry: 'w-trial', channel: 'paid' },
        ['invalid'],
      ],
      [
        'w-trial__xx__paid',
        { entry: 'w-trial', source: 'xx', channel: 'paid' },
        [],
      ],
      ['', {}, []],
    ];
    for (const { 0: label, 1: parts, 2: notes } of rows) {
      expect([label, parseLabel(SCHEMA, label)]).toEqual([
        label,
        { parts, notes },
      ]);
      // Части без замечаний — то же, что части разбора: так метку читает свёртка человека.
      expect([label, labelParts(SCHEMA, label)]).toEqual([label, parts]);
    }
    expect(labelParts(null, 'post__ig')).toEqual({});
  });

  it('незнакомое значение решает справочник: xx — нет, ig — есть, в архиве — знакомо', () => {
    expect(valueState(SETUP, 'source', 'xx')).toBe('unknown');
    expect(valueState(SETUP, 'source', 'ig')).toBe('known');
    const archived = archiveItem(
      parseRef('value', { dictionary: 'source', code: 'ig' }),
      true,
      '2026-11-26T10:00:00.000Z'
    )(SETUP).state;
    expect(valueState(archived, 'source', 'ig')).toBe('archived');
  });

  it('пробелы по краям срезаются; длиннее предела — замечание; без схемы — частей нет', () => {
    expect(parseLabel(SCHEMA, '  post__ig  ')).toEqual({
      parts: { entry: 'post', source: 'ig' },
      notes: [],
    });
    const long = `post__${'a'.repeat(60)}`;
    expect(parseLabel(SCHEMA, long)).toEqual({
      parts: { entry: 'post', source: 'a'.repeat(60) },
      notes: ['length'],
    });
    expect(parseLabel(SCHEMA, `post__${'a'.repeat(61)}`).notes).toEqual([
      'invalid',
      'length',
    ]);
    expect(parseLabel(null, 'post__ig')).toEqual({
      parts: {},
      notes: ['schema'],
    });
    expect(parseLabel(null, '   ')).toEqual({ parts: {}, notes: [] });
    // Предел — в знаках, а не в единицах UTF-16: эмодзи — один знак, хотя в строке их два.
    const emoji = { ...SCHEMA, length: 10 };
    expect(parseLabel(emoji, 'post__ig😀a').notes).toEqual(['invalid']);
    expect(parseLabel(emoji, 'post__ig😀ab').notes).toEqual([
      'invalid',
      'length',
    ]);
    // Пустые отрезки в хвосте ничего не теряют: это не лишняя часть.
    expect(parseLabel(SCHEMA, 'post__ig______').notes).toEqual([]);
  });

  it('разделитель схемы: точка и тильда тоже', () => {
    expect(
      parseLabel({ ...SCHEMA, separator: '.' }, 'post.ig.paid').parts
    ).toEqual({ entry: 'post', source: 'ig', channel: 'paid' });
    expect(
      parseLabel({ ...SCHEMA, separator: '~' }, 'post~~seo').parts
    ).toEqual({ entry: 'post', channel: 'seo' });
  });
});

describe('значение из параметра', () => {
  it('примеры ADR и пустое значение после чистки', () => {
    expect(partValue('Instagram', PART('source'))).toBe('instagram');
    expect(partValue('Spring Sale 2027!', PART('campaign'))).toBe(
      'spring-sale-2027'
    );
    expect(partValue('a__b', PART('campaign'))).toBe('a_b');
    expect(partValue('a-_b', PART('campaign'))).toBe('a-b');
    expect(partValue('l.instagram.com', PART('source'))).toBe('l-instagra');
    // Обрезка до предела не оставляет разделителя на краю.
    expect(partValue('abcdefghi-jk', PART('source'))).toBe('abcdefghi');
    for (const empty of ['', '   ', '--', '_-_', '!!!', 'Ы']) {
      expect(partValue(empty, PART('source'))).toBeNull();
    }
  });
});

describe('сборка метки', () => {
  it('пустая часть в середине — пустой отрезок, хвост отброшен, части не из схемы отброшены', () => {
    expect(
      buildLabel(SCHEMA, { entry: 'w-trial', channel: 'paid', size: 'xl' })
    ).toBe('w-trial____paid');
    expect(buildLabel(SCHEMA, { entry: 'w-trial' })).toBe('w-trial');
    expect(buildLabel(SCHEMA, { source: 'ig' })).toBe('__ig');
    expect(buildLabel(SCHEMA, {})).toBe('');
    expect(
      buildLabel({ ...SCHEMA, separator: '~' }, { entry: 'post', source: 'ig' })
    ).toBe('post~ig');
  });

  it('метка — в адрес назначения на место {label}', () => {
    expect(fillTarget(TRIAL.target, 'w-trial__ig')).toBe(
      'https://t.me/ExampleBot?start=w-trial__ig'
    );
  });

  it('адрес назначения: https, ровно один {label} после хоста, до 500 знаков, без управляющих знаков', () => {
    for (const good of [
      'https://t.me/ExampleBot?start={label}',
      'https://shop.example.com/{label}/',
      'https://example.com#{label}',
      ' https://example.com/?a=1&ref={label} ',
    ]) {
      expect(parseTarget(good)).toBe(good.trim());
    }
    for (const bad of [
      'http://t.me/ExampleBot?start={label}',
      'tg://resolve?domain=ExampleBot&start={label}',
      'javascript:alert({label})',
      'https://t.me/ExampleBot',
      'https://t.me/{label}?start={label}',
      'https://{label}.example.com/',
      'https://example.com{label}',
      'https:///{label}',
      'https://example.com\\{label}',
      'https://user@{label}/',
      `https://example.com/${'a'.repeat(490)}{label}`,
      // URL.parse выбросил бы переводы строк и пропустил адрес: в Location они расщепили бы ответ.
      'https://t.me/Bot\r\nSet-Cookie: a=1?start={label}',
      'https://t.me/Bot?start={label}\nX: y',
      'https://t.me/Bot\t?start={label}',
      'https://t.me/Example Bot?start={label}',
      'https://t.me/Bot\u202e?start={label}',
      'https://t.me/Bot\u0000?start={label}',
      42,
    ]) {
      expect([bad, parseTarget(bad)]).toEqual([bad, null]);
    }
  });
});

describe('части посещения', () => {
  it('по таблице ADR: UTM важнее реферера, поддомен, .*, {host}, прямой заход', () => {
    expect(partsOfVisit(UTM, SETUP)).toEqual({
      source: 'ig',
      channel: 'paid',
      campaign: 'autumn',
      creative: 'ad-1',
    });
    expect(
      partsOfVisit(
        visit({ utmSource: 'Instagram', referrer: 'google.de' }),
        SETUP
      )
    ).toEqual({ source: 'instagram' });
    expect(partsOfVisit(visit({ referrer: 'l.instagram.com' }), SETUP)).toEqual(
      {
        source: 'ig',
        channel: 'organic',
      }
    );
    expect(
      partsOfVisit(visit({ referrer: 'www.google.co.uk' }), SETUP)
    ).toEqual({ source: 'google', channel: 'seo' });
    expect(
      partsOfVisit(visit({ referrer: 'blog.example.net' }), SETUP)
    ).toEqual({ source: 'blog-examp', channel: 'referral' });
    expect(partsOfVisit(visit(), SETUP)).toEqual({
      source: 'direct',
      channel: 'direct',
    });
  });

  it('из совпавших шаблонов — самый длинный; ничего не подошло — частей нет', () => {
    expect(
      partsOfVisit(visit({ referrer: 'm.ads.instagram.com' }), SETUP)
    ).toEqual({ source: 'ig', channel: 'paid' });
    expect(partsOfVisit(visit({ referrer: 'instagram.com' }), SETUP)).toEqual({
      source: 'ig',
      channel: 'organic',
    });
    const bare: Setup = { ...SETUP, referrers: [] };
    expect(partsOfVisit(visit({ referrer: 'l.instagram.com' }), bare)).toEqual(
      {}
    );
    expect(partsOfVisit(visit(), bare)).toEqual({});
  });

  it('шаблон хоста: он и поддомены; имя с .* — в любой зоне', () => {
    expect(hostMatches('instagram.com', 'instagram.com')).toBe(true);
    expect(hostMatches('instagram.com', 'l.instagram.com')).toBe(true);
    expect(hostMatches('instagram.com', 'notinstagram.com')).toBe(false);
    expect(hostMatches('google.*', 'google.de')).toBe(true);
    expect(hostMatches('google.*', 'google.co.uk')).toBe(true);
    expect(hostMatches('google.*', 'mail.google.com')).toBe(true);
    expect(hostMatches('google.*', 'notgoogle.com')).toBe(false);
    expect(hostMatches('google.*', 'google')).toBe(false);
    expect(hostMatches('google.*', 'googleads.com')).toBe(false);
  });
});

describe('метка перехода', () => {
  it('по таблице «Метка перехода»', () => {
    const rows: readonly (readonly [string, boolean, GoSources, string])[] = [
      [
        'UTM посещения, нажал',
        true,
        go({}, UTM),
        'w-trial__ig__paid__autumn__ad-1',
      ],
      [
        'реферер посещения без UTM, нажал на второй странице',
        true,
        go({}, visit({ referrer: 'l.instagram.com' })),
        'w-trial__ig__organic',
      ],
      [
        'QR-код, посещения нет',
        true,
        go({ referer: 'none' }, null),
        'w-trial__direct__direct',
      ],
      [
        'QR-код с UTM',
        true,
        go({ referer: 'none', utmSource: 'qr' }, null),
        'w-trial__qr',
      ],
      ['посещение прошлых суток забыто', true, go({}, null), 'w-trial'],
      ['приём событий выключен', false, go({}, UTM), 'w-trial'],
    ];
    for (const { 0: what, 1: enabled, 2: sources, 3: label } of rows) {
      expect([what, goLabel(SETUP, TRIAL, enabled, sources)]).toEqual([
        what,
        label,
      ]);
    }
    expect(goTarget(SETUP, TRIAL, true, go({}, UTM))).toBe(
      'https://t.me/ExampleBot?start=w-trial__ig__paid__autumn__ad-1'
    );
  });

  it('пять правил по порядку: выключатель, запрос, посещение, прямой заход, своя страница', () => {
    expect(goSourceOf(false, go({ utmSource: 'qr' }, UTM))).toBe('disabled');
    expect(goSourceOf(true, go({ utmSource: 'qr' }, UTM))).toBe('request');
    expect(
      goSourceOf(
        true,
        go({ referer: 'foreign', referrer: 'blog.example.net' }, UTM)
      )
    ).toBe('request');
    expect(goSourceOf(true, go({ referer: 'none' }, UTM))).toBe('visit');
    expect(goSourceOf(true, go({}, UTM))).toBe('visit');
    expect(goSourceOf(true, go({ referer: 'none' }, null))).toBe('none');
    expect(goSourceOf(true, go({}, null))).toBe('own');
    // С чужого сайта — его хост, даже если посещение дня было с UTM.
    expect(
      goLabel(
        SETUP,
        TRIAL,
        true,
        go({ referer: 'foreign', referrer: 'blog.example.net' }, UTM)
      )
    ).toBe('w-trial__blog-examp__referral');
  });

  it('заданные заранее части важнее посещения', () => {
    const preset: GoLink = {
      ...TRIAL,
      parts: { entry: 'post', channel: 'organic' },
    };
    expect(goLabel(SETUP, preset, true, go({}, UTM))).toBe(
      'post__ig__organic__autumn__ad-1'
    );
  });
});
