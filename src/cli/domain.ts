import { networkInterfaces } from 'node:os';
import {
  checkDomain,
  type DnsResolver,
  type DomainFacts,
  type DomainFinding,
  type DomainReport,
  type DomainStatus,
  defineDohResolver,
  defineSystemResolver,
  type Fetch,
  isPublicAddress,
  localTarget,
  parseDomainName,
  planOf,
  type RecordChange,
  SPF_LOOKUP_LIMIT,
  spfLookups,
  zoneLine,
} from '../contexts/diagnostics/index.ts';
import { type Context, cliError } from './context.ts';
import { DOMAIN_TEXTS, type DomainTexts, type Said } from './domain-texts.ts';
import { type Paint, padEnd } from './paint.ts';
import { named, PROGRAM } from './program.ts';

/** Сеть и машина для `cms diagnose domain`: тесты подставляют DoH с ответами из своей зоны. */
export type DomainDeps = {
  readonly fetch: Fetch;
  /** Резолвер этой машины; `servers` — спросить сами серверы зоны. */
  readonly system: (servers?: readonly string[]) => DnsResolver;
  /** Адреса интерфейсов этой машины: цель переезда, если нет `--to`. */
  readonly addresses: () => readonly string[];
};

export var DOMAIN_DEPS: DomainDeps = {
  fetch: (url, init) => fetch(url, init),
  system: (servers) => defineSystemResolver(servers ? { servers } : {}),
  addresses: () =>
    Object.values(networkInterfaces())
      .flat()
      .flatMap((_) => (_ ? [_.address] : [])),
};

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(named(PROGRAM)(message)));

// --- резолвер -----------------------------------------------------------------------

type _Picked = { readonly resolver: DnsResolver; readonly fellBack: boolean };

// Первый запрос — проба: недоступный резолвер дал бы отчёт из одних пустых ответов.
const _probed = (
  resolver: DnsResolver,
  domain: string,
  texts: DomainTexts
): Promise<DnsResolver> =>
  resolver
    .query(domain, 'NS')
    .then((answer) =>
      answer.error === 'unreachable'
        ? _reject(texts.unreachable(resolver.kind))
        : resolver
    );

const _RESOLVERS: Readonly<
  Record<
    string,
    (deps: DomainDeps, domain: string, texts: DomainTexts) => Promise<_Picked>
  >
> = {
  doh: (deps, domain, texts) =>
    _probed(defineDohResolver({ fetch: deps.fetch }), domain, texts).then(
      (resolver) => ({ resolver, fellBack: false })
    ),
  system: (deps, domain, texts) =>
    _probed(deps.system(), domain, texts).then((resolver) => ({
      resolver,
      fellBack: false,
    })),
  // По умолчанию DoH: он видит все типы, TTL и DNSSEC. Не достучались — резолвер этой машины.
  auto: (deps, domain, texts) =>
    ((doh) =>
      doh.query(domain, 'NS').then((answer) =>
        answer.error === 'unreachable'
          ? _probed(deps.system(), domain, texts).then((resolver) => ({
              resolver,
              fellBack: true,
            }))
          : { resolver: doh, fellBack: false }
      ))(defineDohResolver({ fetch: deps.fetch })),
};

// --- отчёт ---------------------------------------------------------------------------

const _MARK: Readonly<Record<DomainStatus, (paint: Paint) => string>> = {
  ok: (paint) => paint.ok('✓'),
  info: (paint) => paint.dim('i'),
  warn: (paint) => paint.warn('!'),
  error: (paint) => paint.error('✗'),
};

const _said = (
  texts: DomainTexts,
  finding: DomainFinding,
  facts: DomainFacts
): Said =>
  (texts.findings[finding.id] as (data: unknown, facts: DomainFacts) => Said)(
    finding.data,
    facts
  );

const _findingLines =
  (paint: Paint, texts: DomainTexts, facts: DomainFacts) =>
  (finding: DomainFinding): string[] =>
    ((said) => [
      `${_MARK[finding.status](paint)} ${paint.bold(said.title)}`,
      `  ${paint.dim(said.detail)}`,
    ])(_said(texts, finding, facts));

const _changeLine =
  (paint: Paint, texts: DomainTexts) =>
  (change: RecordChange): string =>
    `     ${paint.dim(padEnd(texts.verbs[change.op], 9))}${change.op === 'remove' ? paint.dim(zoneLine(change)) : zoneLine(change)}`;

const _stepLines =
  (paint: Paint, texts: DomainTexts, facts: DomainFacts) =>
  (finding: DomainFinding, index: number): string[] =>
    ((said, line) => [
      `${paint.bold(`${index + 1}.`)} ${paint.bold(said.step ?? said.title)}`,
      ...finding.changes.map(line),
      ...(said.note ? [`   ${paint.dim(said.note)}`] : []),
      ...(finding.alternative.length === 0
        ? []
        : [
            ...(finding.changes.length > 0 && said.alternative
              ? [`   ${said.alternative}`]
              : []),
            ...finding.alternative.map(line),
          ]),
    ])(_said(texts, finding, facts), _changeLine(paint, texts));

const _ttl = (paint: Paint, ttl: number | null): string =>
  ttl === null ? '' : paint.dim(` · TTL ${ttl}`);

// Что сейчас в DNS — по строке на тип: короткая сводка перед выводами.
const _records = (
  paint: Paint,
  texts: DomainTexts,
  facts: DomainFacts
): string[] =>
  ((rows) =>
    ((width) =>
      rows.map(
        ({ 0: label, 1: name, 2: value }) =>
          `  ${padEnd(paint.bold(label), 6)} ${padEnd(name, width)}  ${value}`
      ))(Math.min(28, Math.max(...rows.map((_) => _[1].length)))))([
    [
      'A',
      facts.domain,
      `${facts.apex.a.join(', ') || texts.none}${_ttl(paint, facts.apex.a.length > 0 ? facts.apex.ttl.a : null)}`,
    ],
    [
      'AAAA',
      facts.domain,
      `${facts.apex.aaaa.join(', ') || texts.none}${_ttl(paint, facts.apex.aaaa.length > 0 ? facts.apex.ttl.aaaa : null)}`,
    ],
    ...(facts.www
      ? [
          [
            'www',
            facts.www.name,
            facts.www.cname.length > 0
              ? `CNAME ${facts.www.cname[0]}`
              : [...facts.www.a, ...facts.www.aaaa].join(', ') || texts.none,
          ] as const,
        ]
      : []),
    ...(facts.wildcard
      ? [
          [
            '*',
            `*.${facts.domain}`,
            facts.wildcard.host.cname.length > 0
              ? `CNAME ${facts.wildcard.host.cname[0]}`
              : [...facts.wildcard.host.a, ...facts.wildcard.host.aaaa].join(
                  ', '
                ),
          ] as const,
        ]
      : []),
    [
      'MX',
      facts.domain,
      `${
        facts.mx.hosts
          .map((_) => `${_.priority} ${_.host || '.'}`)
          .join(', ') || texts.none
      }${_ttl(paint, facts.mx.ttl)}`,
    ],
    [
      'SPF',
      facts.domain,
      facts.spf
        ? `${facts.spf.record}${paint.dim(` · ${texts.lookups(spfLookups(facts.spf), SPF_LOOKUP_LIMIT)}`)}`
        : (facts.txt.find((_) => /^v=spf1/i.test(_)) ?? texts.none),
    ],
    ...(facts.dmarc
      ? [
          [
            'DMARC',
            `_dmarc.${facts.domain}`,
            `${facts.dmarc.records.find((_) => /^v\s*=\s*DMARC1/i.test(_)) ?? texts.none}${facts.dmarc.cname.length > 0 ? paint.dim(` · CNAME ${facts.dmarc.cname[0]}`) : ''}`,
          ] as const,
        ]
      : []),
    ...(facts.dkim
      ? [
          [
            'DKIM',
            `_domainkey.${facts.domain}`,
            facts.dkim.found
              .filter((_) => /(^|;)\s*p=/.test(_.record))
              .map((_) => _.selector)
              .join(', ') || texts.none,
          ] as const,
        ]
      : []),
    ...(facts.caa.length > 0
      ? [
          [
            'CAA',
            facts.caa[0]!.at ?? facts.domain,
            [...new Set(facts.caa.flatMap((_) => _.records))].join(', ') ||
              texts.none,
          ] as const,
        ]
      : []),
  ] as readonly (readonly [string, string, string])[]);

const _header = (
  paint: Paint,
  texts: DomainTexts,
  report: DomainReport,
  fellBack: boolean
): string[] =>
  ((facts) => [
    `${paint.bold(facts.domain)} ${paint.dim('→')} ${
      facts.target.a.length + facts.target.aaaa.length > 0
        ? `${[...facts.target.a, ...facts.target.aaaa].join(', ')}${facts.target.source === 'local' ? paint.dim(` (${texts.target('local')})`) : ''}`
        : paint.warn(texts.noTarget)
    }`,
    ...(facts.nameservers.length > 0
      ? [`  ${padEnd(texts.nameservers, 12)} ${facts.nameservers.join(', ')}`]
      : []),
    `  ${padEnd(texts.via, 12)} ${report.resolver.sources
      .map((_) => texts.resolvers[_] ?? _)
      .join(
        ', '
      )}${report.resolver.blind.length > 0 ? paint.dim(` · ${texts.blind}`) : ''}`,
    ...(fellBack ? [`  ${paint.warn(texts.fellBack)}`] : []),
  ])(report.facts);

const _BAD: ReadonlySet<DomainStatus> = new Set(['error', 'warn']);

const _section = (paint: Paint, title: string, lines: readonly string[]) =>
  lines.length === 0 ? [] : ['', paint.bold(title), ...lines];

const _text = (
  paint: Paint,
  texts: DomainTexts,
  report: DomainReport,
  fellBack: boolean
): string =>
  ((facts, lines, findings) =>
    ((breaks, already, fine, plan) =>
      [
        ..._header(paint, texts, report, fellBack),
        ...(facts.answered && facts.apex.exists
          ? [
              ..._section(paint, texts.now, _records(paint, texts, facts)),
              ..._section(
                paint,
                texts.breaks,
                breaks.length > 0
                  ? breaks.flatMap(lines)
                  : [`${paint.ok('✓')} ${texts.nothingBreaks}`]
              ),
              ..._section(paint, texts.already, already.flatMap(lines)),
              ..._section(
                paint,
                texts.todo,
                plan.flatMap(_stepLines(paint, texts, facts))
              ),
              ..._section(paint, texts.fine, fine.flatMap(lines)),
            ]
          : ['', ...findings.flatMap(lines)]),
        '',
        paint.bold(
          texts.summary(report.summary.errors, report.summary.warnings)
        ),
      ].join('\n'))(
      findings.filter((_) => _.when === 'switch' && _BAD.has(_.status)),
      findings.filter((_) => _.when === 'now' && _BAD.has(_.status)),
      // Переключение само — последний шаг плана, в «на заметку» его не повторяем.
      findings.filter((_) => !_BAD.has(_.status) && _.id !== 'web.switch'),
      planOf(findings)
    ))(
    report.facts,
    _findingLines(paint, texts, report.facts),
    report.findings
  );

const _withLine = (change: RecordChange) => ({
  ...change,
  line: zoneLine(change),
});

/** JSON для скриптов и агентов: весь отчёт, тексты находок на языке CLI и строки зоны у правок. */
const _json = (
  texts: DomainTexts,
  report: DomainReport,
  fellBack: boolean
): string =>
  JSON.stringify(
    {
      ...report,
      resolver: { ...report.resolver, fellBack },
      findings: report.findings.map((_) => ({
        ..._,
        ..._said(texts, _, report.facts),
        changes: _.changes.map(_withLine),
        alternative: _.alternative.map(_withLine),
      })),
      plan: planOf(report.findings).map((_) => _.id),
    },
    null,
    2
  );

// Ошибки — код выхода 1: проверку можно поставить перед переключением в скрипт переезда.
const _reported =
  (ctx: Context, texts: DomainTexts, fellBack: boolean) =>
  (report: DomainReport): Promise<void> => (
    ctx.out(
      ctx.options.json
        ? _json(texts, report, fellBack)
        : named(PROGRAM)(_text(ctx.paint, texts, report, fellBack))
    ),
    report.summary.errors > 0
      ? _reject(texts.failed(report.summary.errors))
      : Promise.resolve()
  );

/**
 * `cms diagnose domain <домен> [--to <IP|имя>]`: что сломается, если перевести A домена на новый сервер, и
 * какие записи поправить до этого — MX, SPF, DMARC, CAA, www, TTL. DNS — поверх HTTPS, без него — резолвер
 * этой машины. Без `--to` новый сервер — эта машина.
 */
export var runDomain = (
  ctx: Context,
  deps: DomainDeps = DOMAIN_DEPS
): Promise<void> =>
  ((texts, raw) =>
    raw === undefined
      ? _reject(texts.needDomain)
      : ((domain, mode) =>
          domain === null
            ? _reject(texts.badDomain(raw))
            : _RESOLVERS[mode] === undefined
              ? _reject(texts.badResolver(mode))
              : _RESOLVERS[mode]!(deps, domain, texts).then((picked) =>
                  checkDomain({
                    resolver: picked.resolver,
                    zone: deps.system,
                    domain,
                    to: ctx.options.to ?? null,
                    local: localTarget(deps.addresses(), isPublicAddress),
                    selectors: ctx.options.dkimSelector ?? [],
                  }).then(_reported(ctx, texts, picked.fellBack))
                ))(parseDomainName(raw), ctx.options.resolver ?? 'auto'))(
    DOMAIN_TEXTS[ctx.language],
    ctx.args[1] ?? ctx.options.domain?.split(',')[0]
  );
