import { describe, expect, it } from 'bun:test';
import { parseInvocation } from '../src/cli/args.ts';
import { type Context, explain } from '../src/cli/commands.ts';
import { type DomainDeps, runDomain } from '../src/cli/domain.ts';
import { definePaint } from '../src/cli/paint.ts';
import {
  type Zone,
  type ZoneFetchOptions,
  zoneFetch,
  zoneResolver,
} from './fixtures/dns-zone.ts';

// Проверка домена перед переездом: DoH отвечает из зоны в памяти, сети нет.

// Ключ RSA 2048: SubjectPublicKeyInfo в 294 байта — 392 знака base64.
const KEY = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${'A'.repeat(348)}`;

/** Mühlenhof до переезда: MX и SPF смотрят на сам домен, wildcard CNAME на него же, DMARC нет. */
const MUEHLENHOF: Zone = {
  'muehlenhof.example': {
    A: ['46.242.244.215'],
    MX: ['10 muehlenhof.example'],
    TXT: ['v=spf1 a mx ~all'],
    NS: ['dns.home.pl', 'dns2.home.pl', 'dns3.home.pl'],
    ttl: 60,
  },
  '*.muehlenhof.example': { CNAME: ['muehlenhof.example'], ttl: 60 },
  'dkim._domainkey.muehlenhof.example': { TXT: [`v=DKIM1; k=rsa; p=${KEY}`] },
  '215.244.242.46.in-addr.arpa': {
    PTR: ['cloudserver3234681-3234712.home.pl'],
  },
  'cloudserver3234681-3234712.home.pl': { A: ['46.242.244.215'] },
  'dns.home.pl': { A: ['217.160.80.244'] },
  'dns2.home.pl': { A: ['217.160.81.248'] },
};

/** Аккуратный домен: почта в Google, www — CNAME, DMARC и DKIM есть, TTL зоны — час. */
const TIDY: Zone = {
  'fasad.ru': {
    A: ['198.51.100.7'],
    MX: ['1 aspmx.l.google.com', '5 alt1.aspmx.l.google.com'],
    TXT: [
      'google-site-verification=abc',
      'v=spf1 include:_spf.google.com ~all',
    ],
    NS: ['ns1.reg.ru', 'ns2.reg.ru'],
  },
  'www.fasad.ru': { CNAME: ['fasad.ru'] },
  '_dmarc.fasad.ru': {
    TXT: ['v=DMARC1; p=quarantine; rua=mailto:dmarc@fasad.ru'],
  },
  'google._domainkey.fasad.ru': { TXT: [`v=DKIM1; k=rsa; p=${KEY}`] },
  '_spf.google.com': {
    TXT: ['v=spf1 include:_netblocks.google.com ip4:203.0.113.0/24 ~all'],
  },
  '_netblocks.google.com': { TXT: ['v=spf1 ip4:35.190.247.0/24 ~all'] },
  'aspmx.l.google.com': { A: ['142.250.153.26'] },
  'alt1.aspmx.l.google.com': { A: ['142.250.153.27'] },
  'ns1.reg.ru': { A: ['194.58.117.13'] },
};

type Ran = {
  readonly out: string;
  readonly error: string | null;
  readonly calls: readonly string[];
};

const run = async (
  zone: Zone,
  argv: readonly string[],
  {
    language = 'ru',
    fetchOptions = {},
    addresses = [],
    system = zone,
  }: {
    language?: 'ru' | 'en';
    fetchOptions?: ZoneFetchOptions;
    addresses?: readonly string[];
    system?: Zone;
  } = {}
): Promise<Ran> => {
  const out: string[] = [];
  const calls: string[] = [];
  const parsed = parseInvocation(['diagnose', 'domain', ...argv], {});
  const ctx: Context = {
    args: 'options' in parsed ? parsed.args : [],
    options: 'options' in parsed ? parsed.options : (undefined as never),
    paint: definePaint(false),
    language,
    tty: false,
    out: (_) => void out.push(_),
  };
  const deps: DomainDeps = {
    fetch: zoneFetch(zone, { calls, ...fetchOptions }),
    system: () => zoneResolver(system, calls),
    addresses: () => addresses,
  };
  return runDomain(ctx, deps).then(
    () => ({ out: out.join('\n'), error: null, calls }),
    (error) => ({ out: out.join('\n'), error: explain(error, language), calls })
  );
};

const json = async (
  zone: Zone,
  argv: readonly string[],
  options?: Parameters<typeof run>[2]
) => {
  const ran = await run(zone, [...argv, '--json'], options);
  return { ...ran, report: JSON.parse(ran.out) };
};

type Finding = {
  id: string;
  status: string;
  when: string;
  data: Record<string, unknown>;
  changes: Record<string, unknown>[];
  alternative: Record<string, unknown>[];
};

const findingsOf = (report: { findings: Finding[] }) =>
  Object.fromEntries(report.findings.map((_) => [_.id, _]));

const ids = (report: { findings: Finding[] }) =>
  report.findings.map((_) => _.id);

describe('cms diagnose domain: Mühlenhof перед переездом', () => {
  it('почта и SPF сломаются, wildcard уведёт поддомены, DMARC отвечает wildcard — код выхода 1', async () => {
    const { out, error } = await run(MUEHLENHOF, [
      'muehlenhof.example',
      '--to',
      '203.0.113.10',
    ]);
    expect(out).toContain('muehlenhof.example → 203.0.113.10');
    expect(out).toContain(
      'Серверы DNS  dns.home.pl, dns2.home.pl, dns3.home.pl'
    );
    const breaks = out.slice(
      out.indexOf('Что сломается при переключении'),
      out.indexOf('Уже сейчас')
    );
    expect(breaks).toContain('✗ Почта переедет вместе с сайтом');
    expect(breaks).toContain(
      '✗ SPF перестанет пропускать почту старого сервера'
    );
    expect(breaks).toContain('! Wildcard * переедет вместе с доменом');
    expect(out).toContain('! DMARC нет: _dmarc отвечает wildcard');
    expect(error).toBe('Переключать рано: ошибок 2');
  });

  it('план по порядку: MX, SPF, DMARC, затем само переключение — записями зоны', async () => {
    const { out } = await run(MUEHLENHOF, [
      'muehlenhof.example',
      '--to',
      '203.0.113.10',
    ]);
    const plan = out.slice(out.indexOf('Что сделать до переключения'));
    const steps = plan.match(/^\d+\. .+$/gm);
    expect(steps).toEqual([
      '1. Почта: MX — на имя почтового сервера',
      '2. SPF: старый почтовый сервер — явным адресом',
      '3. DMARC: своя запись _dmarc',
      '4. Переключение: адрес сайта — на новый сервер',
    ]);
    expect(plan).toContain(
      'удалить  muehlenhof.example. IN MX 10 muehlenhof.example.'
    );
    expect(plan).toContain(
      'создать  muehlenhof.example. 60 IN MX 10 cloudserver3234681-3234712.home.pl.'
    );
    expect(plan).toContain('Это предложение');
    expect(plan).toContain(
      'создать  mail.muehlenhof.example. 60 IN A 46.242.244.215'
    );
    expect(plan).toContain(
      'создать  muehlenhof.example. 300 IN TXT "v=spf1 ip4:46.242.244.215 mx ~all"'
    );
    expect(plan).toContain(
      'создать  _dmarc.muehlenhof.example. 300 IN TXT "v=DMARC1; p=none; rua=mailto:postmaster@muehlenhof.example"'
    );
    expect(plan).toContain('удалить  muehlenhof.example. IN A 46.242.244.215');
    expect(plan).toContain('создать  muehlenhof.example. 60 IN A 203.0.113.10');
  });

  it('JSON: находки с текстами, правки со строками зоны, порядок плана', async () => {
    const { report } = await json(MUEHLENHOF, [
      'muehlenhof.example',
      '--to',
      '203.0.113.10',
    ]);
    const found = findingsOf(report);
    expect(found['mx.moves']).toMatchObject({
      status: 'error',
      when: 'switch',
      title: 'Почта переедет вместе с сайтом',
      data: {
        hosts: ['muehlenhof.example'],
        suggestion: 'cloudserver3234681-3234712.home.pl',
        confirmed: true,
      },
    });
    expect(found['spf.moves']!.data).toMatchObject({
      mechanisms: ['a', 'mx'],
      lost: ['46.242.244.215'],
      dkim: true,
    });
    expect(found['www.follows']!.data).toEqual({ how: 'wildcard' });
    expect(found['dkim.found']!.data).toEqual({
      keys: [{ selector: 'dkim', key: 'rsa', bits: 2048 }],
    });
    expect(found['dmarc.wildcard']!.data).toEqual({
      via: 'muehlenhof.example',
    });
    expect(found['caa.none']!.status).toBe('ok');
    expect(found['ttl.ok']!.status).toBe('ok');
    expect(report.plan).toEqual([
      'mx.moves',
      'spf.moves',
      'dmarc.wildcard',
      'web.switch',
    ]);
    expect(report.summary).toEqual({ errors: 2, warnings: 2 });
    expect(report.resolver).toEqual({
      kind: 'doh',
      sources: ['cloudflare'],
      blind: [],
      fellBack: false,
    });
    expect(report.facts.ttlFrom).toBe('zone');
  });

  it('уже переключили: почта приходит туда, где её не ждут, — «уже сейчас», без плана для MX', async () => {
    const zone: Zone = {
      ...MUEHLENHOF,
      'muehlenhof.example': {
        ...MUEHLENHOF['muehlenhof.example'],
        A: ['203.0.113.10'],
      },
    };
    const { report } = await json(zone, [
      'muehlenhof.example',
      '--to',
      '203.0.113.10',
    ]);
    const found = findingsOf(report);
    expect(found['web.already']!.status).toBe('ok');
    expect(found['mx.moves']).toMatchObject({ when: 'now', changes: [] });
    expect(found['spf.moves']).toMatchObject({ when: 'now', status: 'error' });
    expect(report.plan).not.toContain('web.switch');
  });

  it('по-английски — те же выводы', async () => {
    const { out, error } = await run(
      MUEHLENHOF,
      ['muehlenhof.example', '--to', '203.0.113.10'],
      { language: 'en' }
    );
    expect(out).toContain('What breaks when you switch');
    expect(out).toContain('✗ Mail moves together with the site');
    expect(out).toContain('1. Mail: MX to the mail server name');
    expect(out).toContain(
      'remove   muehlenhof.example. IN MX 10 muehlenhof.example.'
    );
    expect(error).toBe('Too early to switch: errors 2');
  });
});

describe('cms diagnose domain: аккуратный домен', () => {
  it('почта в Google, SPF через include, www CNAME — ничего не сломается, код выхода 0', async () => {
    const { out, error, report } = await json(
      TIDY,
      ['fasad.ru', '--to', '203.0.113.10'],
      { fetchOptions: { ad: true } }
    );
    const found = findingsOf(report);
    expect(found['mx.elsewhere']!.data).toEqual({
      hosts: ['aspmx.l.google.com', 'alt1.aspmx.l.google.com'],
    });
    expect(found['spf.ok']!.data).toEqual({
      record: 'v=spf1 include:_spf.google.com ~all',
      lookups: 2,
    });
    expect(found['www.follows']!.data).toEqual({ how: 'cname' });
    expect(found['dmarc.ok']).toMatchObject({
      status: 'ok',
      data: { policy: 'quarantine', rua: ['mailto:dmarc@fasad.ru'] },
    });
    expect(found.dnssec!.data).toEqual({ signed: true });
    expect(error).toBeNull();
    expect(out).toBeDefined();
  });

  it('TTL зоны — час: первым шагом TTL 300 и подождать; TTL берётся у серверов зоны, а не из кэша', async () => {
    const { out } = await run(TIDY, ['fasad.ru', '--to', '203.0.113.10'], {
      fetchOptions: { ttlShift: 3500 },
    });
    expect(out).toContain('1. TTL 300 — и подождать 1 ч');
    expect(out).toContain('TTL      fasad.ru. 300 IN A 198.51.100.7');
    expect(out).toContain('A fasad.ru — 1 ч');
  });

  it('www нет и wildcard нет — предупреждение и CNAME в плане', async () => {
    const { 'www.fasad.ru': _, ...zone } = TIDY;
    const { report } = await json(zone, ['fasad.ru', '--to', '203.0.113.10']);
    const found = findingsOf(report);
    expect(found['www.missing']).toMatchObject({
      status: 'warn',
      changes: [{ op: 'add', line: 'www.fasad.ru. 300 IN CNAME fasad.ru.' }],
    });
    expect(report.plan).toContain('www.missing');
  });

  it('www своими A на старый сервер — останется там; правка — CNAME на домен', async () => {
    const zone: Zone = { ...TIDY, 'www.fasad.ru': { A: ['198.51.100.7'] } };
    const { report } = await json(zone, ['fasad.ru', '--to', '203.0.113.10']);
    expect(findingsOf(report)['www.stays']).toMatchObject({
      status: 'warn',
      data: { addresses: ['198.51.100.7'], viaWildcard: false },
      changes: [
        { op: 'remove', line: 'www.fasad.ru. IN A 198.51.100.7' },
        { op: 'add', line: 'www.fasad.ru. 300 IN CNAME fasad.ru.' },
      ],
    });
  });

  it('AAAA у домена, а --to только IPv4 — ошибка: IPv6 и проверка Let’s Encrypt уйдут на старый сервер', async () => {
    const zone: Zone = {
      ...TIDY,
      'fasad.ru': { ...TIDY['fasad.ru'], AAAA: ['2001:db8::7'] },
    };
    const { report } = await json(zone, ['fasad.ru', '--to', '203.0.113.10']);
    expect(findingsOf(report)['web.aaaa_stays']).toMatchObject({
      status: 'error',
      changes: [{ op: 'remove', line: 'fasad.ru. IN AAAA 2001:db8::7' }],
    });
    const both = await json(zone, [
      'fasad.ru',
      '--to',
      '203.0.113.10,2001:db8::10',
    ]);
    expect(ids(both.report)).not.toContain('web.aaaa_stays');
    expect(findingsOf(both.report)['web.switch']!.changes).toContainEqual({
      op: 'add',
      name: 'fasad.ru',
      type: 'AAAA',
      ttl: 300,
      value: '2001:db8::10',
      line: 'fasad.ru. 300 IN AAAA 2001:db8::10',
    });
  });
});

describe('cms diagnose domain: SPF', () => {
  const withSpf = (spf: string, extra: Zone = {}): Zone => ({
    'a.example': {
      A: ['198.51.100.7'],
      MX: ['10 mx.mail.example'],
      TXT: [spf],
    },
    'www.a.example': { CNAME: ['a.example'] },
    'mx.mail.example': { A: ['192.0.2.25'] },
    ...extra,
  });

  it('include по кругу — петля, ошибка с цепочкой', async () => {
    const { report } = await json(
      withSpf('v=spf1 include:b.example ~all', {
        'b.example': { TXT: ['v=spf1 include:c.example ~all'] },
        'c.example': { TXT: ['v=spf1 include:b.example ~all'] },
      }),
      ['a.example', '--to', '203.0.113.10']
    );
    expect(findingsOf(report)['spf.loop']).toMatchObject({
      status: 'error',
      data: { chain: ['a.example', 'b.example', 'c.example', 'b.example'] },
    });
  });

  it('больше 10 запросов DNS — permerror', async () => {
    const leaves = Array.from({ length: 6 }, (_, i) => `l${i}.example`);
    const { report } = await json(
      withSpf(
        `v=spf1 a mx ${leaves.map((_) => `include:${_}`).join(' ')} ~all`,
        {
          ...Object.fromEntries(
            leaves.map((_) => [_, { TXT: ['v=spf1 a:x.example ~all'] }])
          ),
        }
      ),
      ['a.example', '--to', '203.0.113.10']
    );
    expect(findingsOf(report)['spf.lookups']).toMatchObject({
      status: 'error',
      data: { count: 14 },
    });
  });

  it('include на домен без SPF и макросы — по отдельности', async () => {
    const { report } = await json(
      withSpf('v=spf1 include:nospf.example include:%{d}.spf.example ~all', {
        'nospf.example': { TXT: ['just text'] },
      }),
      ['a.example', '--to', '203.0.113.10']
    );
    expect(findingsOf(report)['spf.broken_include']).toMatchObject({
      status: 'error',
      data: { domains: ['nospf.example'], macros: ['%{d}.spf.example'] },
    });
  });

  it('+all — ошибка и правка на ~all', async () => {
    const { report } = await json(withSpf('v=spf1 mx +all'), [
      'a.example',
      '--to',
      '203.0.113.10',
    ]);
    expect(findingsOf(report)['spf.pass_all']).toMatchObject({
      status: 'error',
      changes: [
        { op: 'remove', line: 'a.example. IN TXT "v=spf1 mx +all"' },
        { op: 'add', line: 'a.example. 300 IN TXT "v=spf1 mx ~all"' },
      ],
    });
  });

  it('a при почте у другого провайдера — на заметку, без правки: старый веб-сервер почту не шлёт', async () => {
    const { report } = await json(withSpf('v=spf1 a mx -all'), [
      'a.example',
      '--to',
      '203.0.113.10',
    ]);
    expect(findingsOf(report)['spf.moves']).toMatchObject({
      status: 'info',
      changes: [],
      data: { mechanisms: ['a'], mailOnOld: false },
    });
    expect(ids(report)).toContain('mx.elsewhere');
  });

  it('почта на отдельном имени с тем же адресом — предупреждение, SPF теряет старый адрес', async () => {
    const zone: Zone = {
      'a.example': {
        A: ['198.51.100.7'],
        MX: ['10 mail.a.example'],
        TXT: ['v=spf1 a mx ~all'],
      },
      'www.a.example': { CNAME: ['a.example'] },
      'mail.a.example': { A: ['198.51.100.7'] },
    };
    const { report } = await json(zone, ['a.example', '--to', '203.0.113.10']);
    const found = findingsOf(report);
    expect(found['mx.shares']!.status).toBe('warn');
    expect(found['spf.moves']).toMatchObject({
      status: 'error',
      data: { mechanisms: ['a'], lost: ['198.51.100.7'] },
    });
    expect(ids(report)).not.toContain('mx.moves');
  });

  it('две записи SPF — permerror', async () => {
    const zone: Zone = {
      ...withSpf('v=spf1 mx ~all'),
      'a.example': {
        A: ['198.51.100.7'],
        MX: ['10 mx.mail.example'],
        TXT: ['v=spf1 mx ~all', 'v=spf1 a -all'],
      },
    };
    const { report } = await json(zone, ['a.example', '--to', '203.0.113.10']);
    expect(findingsOf(report)['spf.multiple']!.status).toBe('error');
  });
});

describe('cms diagnose domain: CAA', () => {
  const withCaa = (caa: readonly string[], at = 'shop.example'): Zone => ({
    'shop.example': {
      A: ['198.51.100.7'],
      MX: ['0 .'],
      TXT: ['v=spf1 -all'],
      ...(at === 'shop.example' ? { CAA: caa } : {}),
    },
    'www.shop.example': { CNAME: ['shop.example'] },
    '_dmarc.shop.example': { TXT: ['v=DMARC1; p=reject'] },
    ...(at === 'shop.example' ? {} : { [at]: { CAA: caa } }),
  });

  const caaOf = async (zone: Zone, domain = 'shop.example') =>
    (await json(zone, [domain, '--to', '203.0.113.10'])).report.findings.filter(
      (_: Finding) => _.id.startsWith('caa.')
    );

  it('только чужой центр — Let’s Encrypt не выпустит, правка — issue letsencrypt.org', async () => {
    expect(await caaOf(withCaa(['0 issue "sectigo.com"']))).toMatchObject([
      {
        id: 'caa.blocks',
        status: 'error',
        data: {
          reason: 'issuer',
          issuers: ['sectigo.com'],
          at: 'shop.example',
        },
        changes: [
          { line: 'shop.example. 300 IN CAA 0 issue "letsencrypt.org"' },
        ],
      },
    ]);
  });

  it('letsencrypt.org в списке — в порядке', async () => {
    expect(
      await caaOf(
        withCaa(['0 issue "sectigo.com"', '0 issue "letsencrypt.org"'])
      )
    ).toMatchObject([{ id: 'caa.allows', status: 'ok' }]);
  });

  it('validationmethods без http-01 — тоже отказ', async () => {
    expect(
      await caaOf(
        withCaa(['0 issue "letsencrypt.org; validationmethods=dns-01"'])
      )
    ).toMatchObject([{ id: 'caa.blocks', data: { reason: 'method' } }]);
  });

  it('accounturi — предупреждение: у Eile на новом сервере свой аккаунт', async () => {
    expect(
      await caaOf(
        withCaa([
          '0 issue "letsencrypt.org; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1"',
        ])
      )
    ).toMatchObject([{ id: 'caa.account', status: 'warn' }]);
  });

  it('неизвестный критический тег — выпуск запрещён всем', async () => {
    expect(
      await caaOf(withCaa(['0 issue "letsencrypt.org"', '128 tbs "x"']))
    ).toMatchObject([
      { id: 'caa.blocks', data: { reason: 'critical', issuers: ['tbs'] } },
    ]);
  });

  it('только issuewild — обычный сертификат не ограничен', async () => {
    expect(await caaOf(withCaa(['0 issuewild "sectigo.com"']))).toMatchObject([
      { id: 'caa.allows', data: { issuers: [] } },
    ]);
  });

  it('CAA у родителя — действует и на поддомен (RFC 8659: подъём к корню)', async () => {
    const zone: Zone = {
      ...withCaa(['0 issue "sectigo.com"'], 'example'),
    };
    expect(await caaOf(zone)).toMatchObject([
      { id: 'caa.blocks', data: { at: 'example', name: 'shop.example' } },
    ]);
  });

  it('CAA нет — в порядке; null MX и p=reject у домена без почты — тоже', async () => {
    const { report, error } = await json(withCaa([]), [
      'shop.example',
      '--to',
      '203.0.113.10',
    ]);
    const found = findingsOf(report);
    expect(found['caa.none']!.status).toBe('ok');
    expect(found['mx.null']!.status).toBe('ok');
    expect(found['dmarc.ok']!.data).toMatchObject({ policy: 'reject' });
    expect(error).toBeNull();
  });
});

describe('cms diagnose domain: wildcard, DMARC и DKIM', () => {
  it('wildcard TXT отвечает на _dmarc и на селекторы DKIM — это не DMARC и не ключ', async () => {
    const zone: Zone = {
      'w.example': { A: ['198.51.100.7'], TXT: ['v=spf1 -all'] },
      '*.w.example': { A: ['198.51.100.7'], TXT: ['hello from wildcard p=1'] },
    };
    const { report } = await json(zone, ['w.example', '--to', '203.0.113.10']);
    const found = findingsOf(report);
    expect(found['dmarc.wildcard']!.status).toBe('warn');
    expect(found['dkim.none']!.status).toBe('info');
    expect(found.wildcard).toMatchObject({
      status: 'info',
      data: { moves: false, addresses: ['198.51.100.7'] },
    });
    // www через wildcard A на старый адрес — после переключения останется там.
    expect(found['www.stays']).toMatchObject({
      data: { viaWildcard: true },
      changes: [{ op: 'add', line: 'www.w.example. 300 IN CNAME w.example.' }],
    });
    expect(found['mx.none']).toMatchObject({
      status: 'info',
      alternative: [{ line: 'w.example. 300 IN MX 0 .' }],
    });
  });

  it('DMARC: не тот TXT и две записи', async () => {
    const base: Zone = {
      'd.example': { A: ['198.51.100.7'], MX: ['0 .'], TXT: ['v=spf1 -all'] },
    };
    const invalid = await json(
      { ...base, '_dmarc.d.example': { TXT: ['p=reject'] } },
      ['d.example', '--to', '203.0.113.10']
    );
    expect(findingsOf(invalid.report)['dmarc.invalid']!.changes).toMatchObject([
      { op: 'remove', line: '_dmarc.d.example. IN TXT "p=reject"' },
      { op: 'add', line: '_dmarc.d.example. 300 IN TXT "v=DMARC1; p=reject"' },
    ]);
    const twice = await json(
      {
        ...base,
        '_dmarc.d.example': { TXT: ['v=DMARC1; p=none', 'v=DMARC1; p=reject'] },
      },
      ['d.example', '--to', '203.0.113.10']
    );
    expect(findingsOf(twice.report)['dmarc.multiple']!.status).toBe('error');
  });

  it('свой селектор DKIM: найден через CNAME провайдера; не найденный — предупреждение', async () => {
    const zone: Zone = {
      ...TIDY,
      '20240101pm._domainkey.fasad.ru': { CNAME: ['dkim.postmark.example'] },
      'dkim.postmark.example': { TXT: [`k=rsa; p=${KEY}`] },
      'brevo1._domainkey.fasad.ru': { TXT: ['v=DKIM1; k=rsa; p='] },
    };
    const { report } = await json(zone, [
      'fasad.ru',
      '--to',
      '203.0.113.10',
      '--dkim-selector',
      '20240101pm',
      '--dkim-selector',
      'nope',
    ]);
    const found = findingsOf(report);
    expect(
      (found['dkim.found']!.data.keys as { selector: string }[]).map(
        (_) => _.selector
      )
    ).toEqual(['google', '20240101pm']);
    expect(found['dkim.revoked']!.data).toEqual({ selectors: ['brevo1'] });
    expect(found['dkim.missing']!.data).toEqual({ selectors: ['nope'] });
  });
});

describe('cms diagnose domain: цель и резолвер', () => {
  it('--to по имени: адреса берутся из DNS; имени нет — ошибка', async () => {
    const zone: Zone = { ...TIDY, 'new.host.example': { A: ['203.0.113.10'] } };
    const named = await json(zone, ['fasad.ru', '--to', 'new.host.example']);
    expect(named.report.facts.target).toMatchObject({
      source: 'to',
      a: ['203.0.113.10'],
    });
    const missing = await json(zone, ['fasad.ru', '--to', 'nope.host.example']);
    expect(findingsOf(missing.report)['web.target_unresolved']!.status).toBe(
      'error'
    );
  });

  it('без --to — публичные адреса этой машины; за NAT — просьба указать --to', async () => {
    const here = await json(TIDY, ['fasad.ru'], {
      addresses: ['127.0.0.1', '10.0.0.5', '203.0.113.10', 'fe80::1'],
    });
    expect(here.report.facts.target).toMatchObject({
      source: 'local',
      a: ['203.0.113.10'],
      aaaa: [],
    });
    const nat = await json(TIDY, ['fasad.ru'], {
      addresses: ['192.168.1.20', '2001:db8:1::20'],
    });
    expect(findingsOf(nat.report)['web.no_target']!.status).toBe('info');
    const text = await run(TIDY, ['fasad.ru'], { addresses: ['192.168.1.20'] });
    expect(text.out).toContain('fasad.ru → новый адрес не задан');
  });

  it('Cloudflare не отвечает — тот же отчёт от Google; дальше Google спрашивается первым', async () => {
    const { report, calls } = await json(
      MUEHLENHOF,
      ['muehlenhof.example', '--to', '203.0.113.10'],
      { fetchOptions: { down: ['cloudflare'] } }
    );
    expect(report.resolver.sources).toEqual(['google']);
    expect(findingsOf(report)['mx.moves']!.status).toBe('error');
    expect(findingsOf(report)['dkim.found']!.status).toBe('ok');
    const cloudflare = calls.filter((_) =>
      _.includes('cloudflare-dns.com')
    ).length;
    expect(cloudflare).toBeLessThan(3);
  });

  it('DoH недоступен — резолвер этой машины, с пометкой; --resolver doh — отказ', async () => {
    const { out } = await run(
      MUEHLENHOF,
      ['muehlenhof.example', '--to', '203.0.113.10'],
      {
        fetchOptions: { down: ['cloudflare', 'google'] },
      }
    );
    expect(out).toContain('DNS поверх HTTPS недоступен');
    expect(out).toContain('Запросы      резолвер этой машины');
    expect(out).toContain('✗ Почта переедет вместе с сайтом');
    const strict = await run(
      MUEHLENHOF,
      ['muehlenhof.example', '--to', '203.0.113.10', '--resolver', 'doh'],
      { fetchOptions: { down: ['cloudflare', 'google'] } }
    );
    expect(strict.error).toContain('DNS недоступен (doh)');
  });

  it('--resolver system: DNSSEC не видно, TTL MX тоже', async () => {
    const { report } = await json(MUEHLENHOF, [
      'muehlenhof.example',
      '--to',
      '203.0.113.10',
      '--resolver',
      'system',
    ]);
    expect(report.resolver.kind).toBe('system');
    expect(findingsOf(report).dnssec!.data).toEqual({ signed: null });
    expect(report.facts.mx.ttl).toBeNull();
  });

  it('домена нет — одна ошибка; не домен, нет домена, не тот резолвер — отказ с подсказкой', async () => {
    const { report, error } = await json(MUEHLENHOF, ['nope.example']);
    expect(ids(report)).toEqual(['domain.missing']);
    expect(error).toBe('Переключать рано: ошибок 1');
    expect((await run(MUEHLENHOF, [])).error).toContain('Нужен домен');
    expect((await run(MUEHLENHOF, ['not a domain'])).error).toContain(
      'не домен'
    );
    expect(
      (await run(MUEHLENHOF, ['muehlenhof.example', '--resolver', 'bind']))
        .error
    ).toBe('--resolver — doh или system, а не bind');
  });

  it('IDN и адрес с https:// — тот же домен', async () => {
    const zone: Zone = { 'xn--mhlenhof-65a.example': { A: ['198.51.100.7'] } };
    const idn = await json(zone, ['mühlenhof.example', '--to', '203.0.113.10']);
    expect(idn.report.domain).toBe('xn--mhlenhof-65a.example');
    const url = await json(MUEHLENHOF, [
      'https://muehlenhof.example/',
      '--to',
      '203.0.113.10',
    ]);
    expect(url.report.domain).toBe('muehlenhof.example');
  });
});
