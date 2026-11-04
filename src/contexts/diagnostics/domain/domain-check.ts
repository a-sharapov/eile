import {
  bareAddress,
  bareName,
  isIPv4,
  parseCaa,
  type RecordChange,
} from './dns.ts';
import {
  type Addresses,
  type CaaFacts,
  type DomainFacts,
  type DomainFinding,
  type DomainFindingId,
  type DomainStatus,
  type DomainWhen,
  type MailHost,
  type NameFacts,
  type PtrFacts,
  SWITCH_TTL,
  type TtlEntry,
} from './domain-facts.ts';
import {
  isSpf,
  movingMechanisms,
  parseSpf,
  rewriteSpf,
  SPF_LOOKUP_LIMIT,
  type SpfNode,
  spfAll,
  spfListsAddress,
  spfLookups,
  spfLoops,
  spfNodes,
} from './spf.ts';

type _Data<Id extends DomainFindingId> = Extract<
  DomainFinding,
  { id: Id }
>['data'];

const _finding = <Id extends DomainFindingId>(
  id: Id,
  status: DomainStatus,
  when: DomainWhen,
  data: _Data<Id>,
  changes: readonly RecordChange[] = [],
  alternative: readonly RecordChange[] = []
): DomainFinding =>
  ({ id, status, when, data, changes, alternative }) as DomainFinding;

const _has = (list: readonly string[], value: string): boolean =>
  list.some((_) => bareAddress(_) === bareAddress(value));

const _same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((_) => _has(b, _));

const _addresses = (facts: NameFacts | null): string[] =>
  facts ? [...facts.a, ...facts.aaaa] : [];

/** Имя переедет вместе с A домена: это сам домен или CNAME на него (в том числе через wildcard). */
const _movesWithApex = (facts: NameFacts, domain: string): boolean =>
  facts.name === domain || facts.cname.includes(domain);

const _newTtl = (current: number | null): number =>
  Math.min(current ?? SWITCH_TTL, SWITCH_TTL);

const _target = (facts: DomainFacts): Addresses => ({
  a: facts.target.a,
  aaaa: facts.target.aaaa,
});

const _targetAddresses = (facts: DomainFacts): string[] => [
  ...facts.target.a,
  ...facts.target.aaaa,
];

const _hasTarget = (facts: DomainFacts): boolean =>
  _targetAddresses(facts).length > 0;

/** Домен уже смотрит на новый сервер: все его адреса — среди адресов цели. */
const _alreadySwitched = (facts: DomainFacts): boolean =>
  _hasTarget(facts) &&
  _addresses(facts.apex).length > 0 &&
  _addresses(facts.apex).every((_) => _has(_targetAddresses(facts), _));

const _change = (
  op: RecordChange['op'],
  name: string,
  type: RecordChange['type'],
  value: string,
  ttl: number | null = null
): RecordChange => ({ op, name, type, ttl, value });

// --- сайт: A и AAAA -------------------------------------------------------------

const _swap = (
  name: string,
  type: 'A' | 'AAAA',
  from: readonly string[],
  to: readonly string[],
  ttl: number | null
): RecordChange[] =>
  to.length === 0
    ? []
    : [
        ...from
          .filter((_) => !_has(to, _))
          .map((_) => _change('remove', name, type, _)),
        ...to
          .filter((_) => !_has(from, _))
          .map((_) => _change('add', name, type, _, _newTtl(ttl))),
      ];

const _web = (facts: DomainFacts): DomainFinding[] =>
  ((apex, to) =>
    facts.target.unresolved.length > 0
      ? [
          _finding('web.target_unresolved', 'error', 'now', {
            names: facts.target.unresolved,
          }),
        ]
      : !_hasTarget(facts)
        ? [
            _finding('web.no_target', 'info', 'switch', {
              from: { a: apex.a, aaaa: apex.aaaa },
            }),
          ]
        : ((changes) => [
            _addresses(apex).length === 0
              ? _finding('web.none', 'warn', 'now', { to }, changes)
              : changes.length === 0
                ? _finding('web.already', 'ok', 'now', { to })
                : _finding(
                    'web.switch',
                    'info',
                    'switch',
                    { from: { a: apex.a, aaaa: apex.aaaa }, to },
                    changes
                  ),
            // Новому серверу дали только IPv4, а у домена есть AAAA: IPv6-посетители и проверка Let's Encrypt
            // (она предпочитает IPv6) попадут на старый сервер.
            ...(to.aaaa.length === 0 && apex.aaaa.length > 0
              ? [
                  _finding(
                    'web.aaaa_stays',
                    'error',
                    'switch',
                    { aaaa: apex.aaaa },
                    apex.aaaa.map((_) =>
                      _change('remove', facts.domain, 'AAAA', _)
                    )
                  ),
                ]
              : []),
          ])([
            ..._swap(facts.domain, 'A', apex.a, to.a, apex.ttl.a),
            ..._swap(facts.domain, 'AAAA', apex.aaaa, to.aaaa, apex.ttl.aaaa),
          ]))(facts.apex, _target(facts));

// --- www и wildcard ---------------------------------------------------------------

const _sameAnswer = (a: NameFacts, b: NameFacts): boolean =>
  a.cname.length > 0
    ? a.cname[0] === b.cname[0]
    : b.cname.length === 0 &&
      _same(_addresses(a), _addresses(b)) &&
      _addresses(a).length > 0;

const _www = (facts: DomainFacts): DomainFinding[] =>
  ((www, apex) =>
    www === null
      ? []
      : ((viaWildcard, addresses) =>
          !www.exists || (www.cname.length === 0 && addresses.length === 0)
            ? [
                _finding('www.missing', 'warn', 'now', {}, [
                  _change(
                    'add',
                    www.name,
                    'CNAME',
                    apex,
                    _newTtl(facts.apex.ttl.a)
                  ),
                ]),
              ]
            : _movesWithApex(www, apex)
              ? [
                  _finding('www.follows', 'ok', 'switch', {
                    how: viaWildcard ? 'wildcard' : 'cname',
                  }),
                ]
              : _hasTarget(facts) &&
                  addresses.every((_) => _has(_targetAddresses(facts), _))
                ? [_finding('www.follows', 'ok', 'switch', { how: 'target' })]
                : [
                    _finding(
                      'www.stays',
                      'warn',
                      'switch',
                      {
                        cname: www.cname[0] ?? null,
                        addresses,
                        viaWildcard,
                      },
                      [
                        // Запись www перекрывает wildcard: своё удаляем, а через * удалять нечего.
                        ...(viaWildcard
                          ? []
                          : www.cname.length > 0
                            ? [
                                _change(
                                  'remove',
                                  www.name,
                                  'CNAME',
                                  www.cname[0]!
                                ),
                              ]
                            : [
                                ...www.a.map((_) =>
                                  _change('remove', www.name, 'A', _)
                                ),
                                ...www.aaaa.map((_) =>
                                  _change('remove', www.name, 'AAAA', _)
                                ),
                              ]),
                        _change(
                          'add',
                          www.name,
                          'CNAME',
                          apex,
                          _newTtl(facts.apex.ttl.a)
                        ),
                      ]
                    ),
                  ])(
          facts.wildcard !== null && _sameAnswer(www, facts.wildcard.host),
          _addresses(www)
        ))(facts.www, facts.domain);

const _wildcard = (facts: DomainFacts): DomainFinding[] =>
  facts.wildcard === null ||
  (facts.wildcard.host.cname.length === 0 &&
    _addresses(facts.wildcard.host).length === 0)
    ? []
    : ((host) =>
        ((moves) => [
          _finding('wildcard', moves ? 'warn' : 'info', 'switch', {
            moves,
            cname: host.cname[0] ?? null,
            addresses: _addresses(host),
          }),
        ])(_movesWithApex(host, facts.domain)))(facts.wildcard.host);

// --- почта: MX --------------------------------------------------------------------

const _under = (name: string, domain: string): boolean =>
  name === domain || name.endsWith(`.${domain}`);

// Имя почтового сервера из PTR: подтверждённое — лучше; имя внутри самого домена переедет вместе с ним.
const _suggestion = (facts: DomainFacts): PtrFacts | null =>
  ((usable) => usable.find((_) => _.confirmed) ?? usable[0] ?? null)(
    facts.ptr.filter((_) => _.name !== null && !_under(_.name, facts.domain))
  );

const _mailAlias = (
  facts: DomainFacts,
  moving: readonly MailHost[]
): RecordChange[] =>
  ((name, ttl) => [
    ...facts.apex.a.map((_) => _change('add', name, 'A', _, ttl)),
    ...facts.apex.aaaa.map((_) => _change('add', name, 'AAAA', _, ttl)),
    ...(moving.every((_) => _.host === name)
      ? []
      : [
          ...moving.map((_) =>
            _change('remove', facts.domain, 'MX', `${_.priority} ${_.host}`)
          ),
          _change(
            'add',
            facts.domain,
            'MX',
            `${moving[0]?.priority ?? 10} ${name}`,
            ttl
          ),
        ]),
  ])(
    moving.find(
      (_) => _.host.startsWith('mail.') && _under(_.host, facts.domain)
    )?.host ?? `mail.${facts.domain}`,
    _newTtl(facts.mx.ttl)
  );

const _mailMoves = (
  facts: DomainFacts,
  moving: readonly MailHost[]
): DomainFinding =>
  ((suggestion, already) =>
    ((alias, toProvider) =>
      _finding(
        'mx.moves',
        'error',
        already ? 'now' : 'switch',
        {
          hosts: moving.map((_) => _.host),
          addresses: _addresses(facts.apex),
          suggestion: suggestion?.name ?? null,
          confirmed: suggestion?.confirmed ?? false,
          already,
        },
        already ? [] : (toProvider ?? alias),
        already || toProvider === null ? [] : alias
      ))(
      _mailAlias(facts, moving),
      suggestion === null
        ? null
        : [
            ...moving.map((_) =>
              _change('remove', facts.domain, 'MX', `${_.priority} ${_.host}`)
            ),
            _change(
              'add',
              facts.domain,
              'MX',
              `${moving[0]?.priority ?? 10} ${suggestion.name}`,
              _newTtl(facts.mx.ttl)
            ),
          ]
    ))(_suggestion(facts), _alreadySwitched(facts));

/** MX, которые переедут вместе с A: сам домен или CNAME на него. */
const _movingMail = (facts: DomainFacts): MailHost[] =>
  facts.mx.hosts.filter(
    (_) =>
      _.host !== '' &&
      (_.host === facts.domain ||
        (_.facts !== null && _movesWithApex(_.facts, facts.domain)))
  );

const _sharing = (facts: DomainFacts): MailHost[] =>
  facts.mx.hosts.filter(
    (_) =>
      _.host !== '' &&
      !_movingMail(facts).includes(_) &&
      _addresses(_.facts).some((ip) => _has(_addresses(facts.apex), ip))
  );

const _mail = (facts: DomainFacts): DomainFinding[] =>
  ((hosts) =>
    hosts.length === 0
      ? [
          _finding(
            'mx.none',
            'info',
            'switch',
            { addresses: _addresses(facts.apex) },
            [],
            [_change('add', facts.domain, 'MX', '0 .', SWITCH_TTL)]
          ),
        ]
      : hosts.every((_) => _.host === '')
        ? [_finding('mx.null', 'ok', 'now', {})]
        : ((unresolved, moving, sharing) => [
            ...(unresolved.length > 0
              ? [
                  _finding('mx.unresolved', 'error', 'now', {
                    hosts: unresolved.map((_) => _.host),
                  }),
                ]
              : []),
            ...(moving.length > 0 ? [_mailMoves(facts, moving)] : []),
            ...(sharing.length > 0
              ? [
                  _finding('mx.shares', 'warn', 'switch', {
                    hosts: sharing.map((_) => _.host),
                    addresses: _addresses(sharing[0]!.facts),
                  }),
                ]
              : []),
            ...(unresolved.length + moving.length + sharing.length === 0
              ? [
                  _finding('mx.elsewhere', 'ok', 'switch', {
                    hosts: hosts.map((_) => _.host),
                  }),
                ]
              : []),
          ])(
            hosts.filter(
              (_) =>
                _.host !== '' &&
                !_movingMail(facts).includes(_) &&
                _addresses(_.facts).length === 0
            ),
            _movingMail(facts),
            _sharing(facts)
          ))(facts.mx.hosts);

// --- SPF ---------------------------------------------------------------------------

const _txtChange = (
  facts: DomainFacts,
  from: string | null,
  to: string
): RecordChange[] => [
  ...(from === null ? [] : [_change('remove', facts.domain, 'TXT', from)]),
  _change('add', facts.domain, 'TXT', to, SWITCH_TTL),
];

const _spfSuggestion = (facts: DomainFacts): string =>
  facts.mx.hosts.length === 0 || facts.mx.hosts.every((_) => _.host === '')
    ? 'v=spf1 -all'
    : _movingMail(facts).length + _sharing(facts).length > 0
      ? rewriteSpf(parseSpf('v=spf1 mx ~all'), [], _addresses(facts.apex))
      : 'v=spf1 mx ~all';

const _spfProblems = (tree: SpfNode): DomainFinding[] =>
  ((nodes) =>
    ((invalid, loops, broken, macros, lookups) => [
      ...(invalid.length > 0
        ? [_finding('spf.syntax', 'error', 'now', { terms: invalid })]
        : []),
      ...loops.map((chain) => _finding('spf.loop', 'error', 'now', { chain })),
      ...(broken.length + macros.length > 0
        ? [
            _finding(
              'spf.broken_include',
              broken.length > 0 ? 'error' : 'info',
              'now',
              { domains: broken, macros }
            ),
          ]
        : []),
      ...(lookups > SPF_LOOKUP_LIMIT
        ? [_finding('spf.lookups', 'error', 'now', { count: lookups })]
        : []),
    ])(
      nodes.flatMap((_) =>
        _.terms.flatMap((term) => (term.kind === 'invalid' ? [term.raw] : []))
      ),
      spfLoops(tree),
      nodes
        .filter(
          (_) =>
            _.via !== 'root' &&
            (_.problem === 'none' ||
              _.problem === 'failed' ||
              _.problem === 'multiple')
        )
        .map((_) => _.domain),
      nodes.filter((_) => _.problem === 'macro').map((_) => _.domain),
      spfLookups(tree)
    ))(spfNodes(tree));

const _spfMoves = (
  facts: DomainFacts,
  tree: SpfNode,
  record: string
): DomainFinding[] =>
  ((moving, mailOnOld, already) =>
    moving.length === 0
      ? []
      : ((lost) => [
          _finding(
            'spf.moves',
            mailOnOld && (lost.length > 0 || already) ? 'error' : 'info',
            already ? 'now' : 'switch',
            {
              mechanisms: moving.map((_) => _.raw),
              lost,
              mailOnOld,
              already,
              dkim: (facts.dkim?.found.length ?? 0) > 0,
            },
            already || !mailOnOld || lost.length === 0
              ? []
              : _txtChange(
                  facts,
                  record,
                  rewriteSpf(
                    tree.terms,
                    // `a` уходит: на месте старого сервера встаёт явный адрес. `mx` остаётся — после правки MX он
                    // снова укажет на почтовый сервер.
                    moving.filter(
                      (_) => _.kind === 'mechanism' && _.name === 'a'
                    ),
                    mailOnOld ? lost : []
                  )
                )
          ),
        ])(
          mailOnOld
            ? _addresses(facts.apex).filter(
                (_) => !spfListsAddress(tree.terms, _)
              )
            : []
        ))(
    movingMechanisms(
      tree.terms,
      new Set([
        facts.domain,
        ...(facts.www && _movesWithApex(facts.www, facts.domain)
          ? [facts.www.name]
          : []),
      ]),
      _movingMail(facts).length > 0
    ),
    _movingMail(facts).length + _sharing(facts).length > 0,
    _alreadySwitched(facts)
  );

const _spf = (facts: DomainFacts): DomainFinding[] =>
  ((records) =>
    records.length === 0
      ? [
          _finding(
            'spf.none',
            'warn',
            'now',
            { suggestion: _spfSuggestion(facts) },
            _txtChange(facts, null, _spfSuggestion(facts))
          ),
        ]
      : records.length > 1
        ? [_finding('spf.multiple', 'error', 'now', { records })]
        : facts.spf === null
          ? []
          : ((tree, record) =>
              ((problems, moves, all) =>
                ((fixAll) => [
                  ...problems,
                  ...moves,
                  ...(all === '+'
                    ? [
                        _finding(
                          'spf.pass_all',
                          'error',
                          'now',
                          { record },
                          fixAll
                        ),
                      ]
                    : all === '?' || all === null
                      ? [_finding('spf.neutral', 'info', 'now', { record })]
                      : []),
                  ...(problems.length + moves.length === 0 &&
                  (all === '-' || all === '~')
                    ? [
                        _finding('spf.ok', 'ok', 'now', {
                          record,
                          lookups: spfLookups(tree),
                        }),
                      ]
                    : []),
                ])(
                  // Одна запись на все правки: если её уже предлагает spf.moves, `+all` правится там же.
                  moves.some((_) => _.changes.length > 0)
                    ? []
                    : _txtChange(facts, record, rewriteSpf(tree.terms, [], []))
                ))(
                _spfProblems(tree),
                _spfMoves(facts, tree, record),
                spfAll(tree)
              ))(facts.spf, records[0]!))(facts.txt.filter(isSpf));

// --- DKIM и DMARC ------------------------------------------------------------------

const _tags = (record: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    record
      .split(';')
      .map((_) => _.trim())
      .filter(Boolean)
      .map((_) =>
        ((at) =>
          at < 0
            ? [_.toLowerCase(), '']
            : [_.slice(0, at).trim().toLowerCase(), _.slice(at + 1).trim()])(
          _.indexOf('=')
        )
      )
  );

const _isDkim = (record: string): boolean =>
  ((tags) => 'p' in tags && (tags.v === undefined || tags.v === 'DKIM1'))(
    _tags(record)
  );

// Длина ключа RSA по длине SubjectPublicKeyInfo: 294 байта — 2048 бит, 162 — 1024 (38 байт — обёртка DER).
const _bits = (key: string): number | null =>
  ((bytes) =>
    bytes < 64 ? null : Math.round(((bytes - 38) * 8) / 1024) * 1024)(
    Math.floor((key.replace(/[\s=]/g, '').length * 3) / 4)
  );

const _dkim = (facts: DomainFacts): DomainFinding[] =>
  facts.dkim === null
    ? []
    : ((found) =>
        ((live, revoked, missing) => [
          ...(live.length > 0
            ? [
                _finding('dkim.found', 'ok', 'now', {
                  keys: live.map((_) =>
                    ((tags) => ({
                      selector: _.selector,
                      key: (tags.k ?? 'rsa').toLowerCase(),
                      bits:
                        (tags.k ?? 'rsa').toLowerCase() === 'rsa'
                          ? _bits(tags.p ?? '')
                          : null,
                    }))(_tags(_.record))
                  ),
                }),
              ]
            : []),
          ...(revoked.length > 0
            ? [
                _finding('dkim.revoked', 'warn', 'now', {
                  selectors: revoked.map((_) => _.selector),
                }),
              ]
            : []),
          ...(missing.length > 0
            ? [_finding('dkim.missing', 'warn', 'now', { selectors: missing })]
            : []),
          ...(found.length === 0 && missing.length === 0
            ? [
                _finding('dkim.none', 'info', 'now', {
                  tried: facts.dkim!.tried.length,
                }),
              ]
            : []),
        ])(
          found.filter((_) => (_tags(_.record).p ?? '') !== ''),
          found.filter((_) => (_tags(_.record).p ?? '') === ''),
          facts.dkim!.requested.filter(
            (selector) => !found.some((_) => _.selector === selector)
          )
        ))(
        // Ответ wildcard — не ключ: под `*` попадает и `<селектор>._domainkey`, если `_domainkey` нет.
        facts.dkim.found.filter(
          (_) =>
            _isDkim(_.record) && !(facts.wildcard?.txt ?? []).includes(_.record)
        )
      );

const _dmarcName = (domain: string): string => `_dmarc.${domain}`;

const _dmarcSuggestion = (facts: DomainFacts): string =>
  facts.mx.hosts.some((_) => _.host !== '')
    ? `v=DMARC1; p=none; rua=mailto:postmaster@${facts.domain}`
    : 'v=DMARC1; p=reject';

const _dmarcAdd = (facts: DomainFacts): RecordChange =>
  _change(
    'add',
    _dmarcName(facts.domain),
    'TXT',
    _dmarcSuggestion(facts),
    SWITCH_TTL
  );

const _isDmarc = (record: string): boolean =>
  /^v\s*=\s*DMARC1\s*(;|$)/i.test(record.trim());

const _dmarc = (facts: DomainFacts): DomainFinding[] =>
  facts.dmarc === null
    ? []
    : ((dmarc) =>
        ((records, viaWildcard) =>
          records.length > 1
            ? [_finding('dmarc.multiple', 'error', 'now', { records })]
            : records.length === 1
              ? ((tags) =>
                  ((policy, rua) => [
                    _finding(
                      'dmarc.ok',
                      policy === 'none' || rua.length === 0 ? 'info' : 'ok',
                      'now',
                      {
                        policy,
                        rua,
                        pct: Number(tags.pct ?? 100),
                      }
                    ),
                  ])(
                    (tags.p ?? 'none').toLowerCase(),
                    (tags.rua ?? '')
                      .split(',')
                      .map((_) => _.trim())
                      .filter(Boolean)
                  ))(_tags(records[0]!))
              : viaWildcard
                ? [
                    _finding(
                      'dmarc.wildcard',
                      'warn',
                      'now',
                      { via: dmarc.cname[0] ?? '*' },
                      [_dmarcAdd(facts)]
                    ),
                  ]
                : dmarc.records.length > 0
                  ? [
                      _finding(
                        'dmarc.invalid',
                        'warn',
                        'now',
                        { records: dmarc.records },
                        [
                          ...(dmarc.cname.length > 0
                            ? [
                                _change(
                                  'remove',
                                  _dmarcName(facts.domain),
                                  'CNAME',
                                  dmarc.cname[0]!
                                ),
                              ]
                            : dmarc.records.map((_) =>
                                _change(
                                  'remove',
                                  _dmarcName(facts.domain),
                                  'TXT',
                                  _
                                )
                              )),
                          _dmarcAdd(facts),
                        ]
                      ),
                    ]
                  : [
                      _finding('dmarc.none', 'warn', 'now', {}, [
                        _dmarcAdd(facts),
                      ]),
                    ])(
          dmarc.records.filter(_isDmarc),
          // `_dmarc` отвечает то же, что случайное имя: это wildcard, своей записи нет.
          facts.wildcard !== null &&
            ((facts.wildcard.host.cname.length > 0 &&
              dmarc.cname[0] === facts.wildcard.host.cname[0]) ||
              (dmarc.cname.length === 0 &&
                dmarc.records.length > 0 &&
                _same(dmarc.records, facts.wildcard.txt)))
        ))(facts.dmarc);

// --- CAA ---------------------------------------------------------------------------

/** Центр сертификации Eile: сертификат `--domain` выпускает Let's Encrypt, проверка — http-01. */
export var ACME_ISSUER = 'letsencrypt.org';

const _KNOWN_TAGS: ReadonlySet<string> = new Set([
  'issue',
  'issuewild',
  'iodef',
  'contactemail',
  'contactphone',
  'issuemail',
  'issuevmc',
]);

const _issuer = (value: string): string => bareName(value.split(';')[0] ?? '');

const _params = (value: string): Readonly<Record<string, string>> =>
  _tags(value.split(';').slice(1).join(';'));

const _caaOne = (caa: CaaFacts): DomainFinding[] =>
  ((records, at) =>
    ((issues, critical) =>
      ((le) =>
        critical.length > 0
          ? [
              _finding('caa.blocks', 'error', 'now', {
                name: caa.name,
                at,
                reason: 'critical',
                issuers: critical.map((_) => _.tag),
              }),
            ]
          : issues.length === 0
            ? [_finding('caa.allows', 'ok', 'now', { at, issuers: [] })]
            : le.length === 0
              ? [
                  _finding(
                    'caa.blocks',
                    'error',
                    'now',
                    {
                      name: caa.name,
                      at,
                      reason: 'issuer',
                      issuers: issues.map((_) => _issuer(_.value)),
                    },
                    [
                      _change(
                        'add',
                        at,
                        'CAA',
                        `0 issue "${ACME_ISSUER}"`,
                        SWITCH_TTL
                      ),
                    ]
                  ),
                ]
              : le.every((_) =>
                    ((methods) =>
                      methods !== undefined &&
                      !methods
                        .split(',')
                        .map((m) => m.trim())
                        .includes('http-01'))(
                      _params(_.value).validationmethods
                    )
                  )
                ? [
                    _finding(
                      'caa.blocks',
                      'error',
                      'now',
                      {
                        name: caa.name,
                        at,
                        reason: 'method',
                        issuers: issues.map((_) => _issuer(_.value)),
                      },
                      [
                        _change(
                          'add',
                          at,
                          'CAA',
                          `0 issue "${ACME_ISSUER}"`,
                          SWITCH_TTL
                        ),
                      ]
                    ),
                  ]
                : le.every((_) => 'accounturi' in _params(_.value))
                  ? [_finding('caa.account', 'warn', 'now', { at })]
                  : [
                      _finding('caa.allows', 'ok', 'now', {
                        at,
                        issuers: issues.map((_) => _issuer(_.value)),
                      }),
                    ])(issues.filter((_) => _issuer(_.value) === ACME_ISSUER)))(
      records.filter((_) => _.tag === 'issue'),
      records.filter((_) => _.critical && !_KNOWN_TAGS.has(_.tag))
    ))(caa.records.map(parseCaa), caa.at ?? caa.name);

const _caa = (facts: DomainFacts): DomainFinding[] =>
  facts.caa.length === 0
    ? []
    : facts.caa.every((_) => _.at === null)
      ? [_finding('caa.none', 'ok', 'now', {})]
      : facts.caa
          .filter(
            (caa, index) =>
              caa.at !== null &&
              facts.caa.findIndex((_) => _.at === caa.at) === index
          )
          .flatMap(_caaOne);

// --- TTL и DNSSEC ---------------------------------------------------------------------

const _entry = (
  name: string,
  type: TtlEntry['type'],
  ttl: number | null,
  exact: boolean,
  present: boolean
): TtlEntry[] => (present && ttl !== null ? [{ name, type, ttl, exact }] : []);

const _ttlEntries = (facts: DomainFacts): TtlEntry[] =>
  ((exact) => [
    ..._entry(
      facts.domain,
      'A',
      facts.apex.ttl.a,
      exact,
      facts.apex.a.length > 0
    ),
    ..._entry(
      facts.domain,
      'AAAA',
      facts.apex.ttl.aaaa,
      exact,
      facts.apex.aaaa.length > 0
    ),
    ...(facts.www
      ? _entry(
          facts.www.name,
          'A',
          facts.www.ttl.a,
          exact,
          facts.www.cname.length === 0 && facts.www.a.length > 0
        )
      : []),
    ..._entry(
      facts.domain,
      'MX',
      facts.mx.ttl,
      false,
      facts.mx.hosts.some((_) => _.host !== '')
    ),
  ])(facts.ttlFrom === 'zone');

const _ttlValues = (facts: DomainFacts, entry: TtlEntry): string[] =>
  entry.type === 'MX'
    ? facts.mx.hosts.map((_) => `${_.priority} ${_.host}`)
    : entry.name === facts.domain
      ? entry.type === 'A'
        ? [...facts.apex.a]
        : [...facts.apex.aaaa]
      : [...(facts.www?.a ?? [])];

const _ttl = (facts: DomainFacts): DomainFinding[] =>
  ((entries) =>
    entries.length === 0
      ? []
      : ((high) =>
          high.length > 0
            ? [
                _finding(
                  'ttl.high',
                  'warn',
                  'switch',
                  {
                    entries: high,
                    wait: Math.max(...high.map((_) => _.ttl)),
                  },
                  high.flatMap((entry) =>
                    _ttlValues(facts, entry).map((value) =>
                      _change('set', entry.name, entry.type, value, SWITCH_TTL)
                    )
                  )
                ),
              ]
            : [_finding('ttl.ok', 'ok', 'switch', { entries })])(
          entries.filter((_) => _.ttl > SWITCH_TTL)
        ))(_ttlEntries(facts));

// --- отчёт -------------------------------------------------------------------------

const _ORDER: readonly DomainFindingId[] = [
  'domain.missing',
  'domain.unanswered',
  'web.target_unresolved',
  'web.none',
  'web.aaaa_stays',
  'web.switch',
  'web.already',
  'web.no_target',
  'mx.moves',
  'mx.unresolved',
  'mx.shares',
  'mx.none',
  'mx.null',
  'mx.elsewhere',
  'spf.moves',
  'spf.multiple',
  'spf.syntax',
  'spf.loop',
  'spf.broken_include',
  'spf.lookups',
  'spf.pass_all',
  'spf.none',
  'spf.neutral',
  'spf.ok',
  'www.missing',
  'www.stays',
  'www.follows',
  'wildcard',
  'caa.blocks',
  'caa.account',
  'caa.allows',
  'caa.none',
  'dmarc.multiple',
  'dmarc.wildcard',
  'dmarc.invalid',
  'dmarc.none',
  'dmarc.ok',
  'dkim.missing',
  'dkim.revoked',
  'dkim.found',
  'dkim.none',
  'ttl.high',
  'ttl.ok',
  'dnssec',
];

/** Шаги до переключения по порядку: сначала TTL (его надо переждать), потом почта, сертификат и в конце сам A. */
const _STEPS: readonly DomainFindingId[] = [
  'ttl.high',
  'mx.moves',
  'mx.none',
  'spf.moves',
  'spf.pass_all',
  'spf.none',
  'dmarc.wildcard',
  'dmarc.invalid',
  'dmarc.none',
  'caa.blocks',
  'www.missing',
  'www.stays',
  'web.aaaa_stays',
  'web.none',
  'web.switch',
];

const _rank = (finding: DomainFinding): number => _ORDER.indexOf(finding.id);

/** Находки проверки домена по порядку тем; домена нет или DNS молчит — только об этом. */
export var assessDomain = (facts: DomainFacts): DomainFinding[] =>
  !facts.answered
    ? [_finding('domain.unanswered', 'error', 'now', {})]
    : facts.apex.exists
      ? [
          ..._web(facts),
          ..._www(facts),
          ..._wildcard(facts),
          ..._mail(facts),
          ..._spf(facts),
          ..._dkim(facts),
          ..._dmarc(facts),
          ..._caa(facts),
          ...(facts.scope === 'full'
            ? [
                ..._ttl(facts),
                _finding('dnssec', 'info', 'now', { signed: facts.dnssec }),
              ]
            : []),
        ].toSorted((a, b) => _rank(a) - _rank(b))
      : [_finding('domain.missing', 'error', 'now', {})];

/** Что сделать до переключения: находки с правками зоны в порядке шагов. */
export var planOf = (findings: readonly DomainFinding[]): DomainFinding[] =>
  findings
    .filter(
      (_) =>
        _.changes.length + _.alternative.length > 0 && _STEPS.includes(_.id)
    )
    .toSorted((a, b) => _STEPS.indexOf(a.id) - _STEPS.indexOf(b.id));

export var summaryOf = (
  findings: readonly DomainFinding[]
): { readonly errors: number; readonly warnings: number } => ({
  errors: findings.filter((_) => _.status === 'error').length,
  warnings: findings.filter((_) => _.status === 'warn').length,
});

/**
 * Адреса этой машины как цель переезда: только видимые из интернета и только если среди них есть IPv4. У
 * ноутбука за NAT бывает публичный IPv6, но новым сервером сайта он не станет.
 */
export var localTarget = (
  addresses: readonly string[],
  isPublic: (address: string) => boolean
): Addresses =>
  ((public_) =>
    public_.some(isIPv4)
      ? {
          a: public_.filter(isIPv4),
          aaaa: public_.filter((_) => !isIPv4(_)),
        }
      : { a: [], aaaa: [] })([
    ...new Set(addresses.map(bareAddress).filter(isPublic)),
  ]);
