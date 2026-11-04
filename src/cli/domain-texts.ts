import type {
  DkimKey,
  DomainFacts,
  DomainFinding,
  DomainFindingId,
  TtlEntry,
} from '../contexts/diagnostics/index.ts';
import type { Language } from './language.ts';

/** Тексты находки: заголовок, почему и что делать; у шага плана — его название и пояснения. */
export type Said = {
  readonly title: string;
  readonly detail: string;
  /** Название шага в «Что сделать до переключения». */
  readonly step?: string;
  /** Строка под правками шага: откуда предложение, в какой момент делать. */
  readonly note?: string;
  /** Подпись к другому пути, если первый — только предложение. */
  readonly alternative?: string;
};

type _Text<K extends DomainFindingId> = (
  data: Extract<DomainFinding, { id: K }>['data'],
  facts: DomainFacts
) => Said;

export type DomainTexts = {
  readonly findings: { readonly [K in DomainFindingId]: _Text<K> };
  readonly needDomain: string;
  readonly badDomain: (raw: string) => string;
  readonly badResolver: (raw: string) => string;
  readonly unreachable: (via: string) => string;
  readonly fellBack: string;
  readonly failed: (errors: number) => string;
  readonly target: (source: DomainFacts['target']['source']) => string;
  readonly noTarget: string;
  readonly nameservers: string;
  readonly via: string;
  readonly resolvers: Readonly<Record<string, string>>;
  readonly blind: string;
  readonly now: string;
  readonly breaks: string;
  readonly nothingBreaks: string;
  readonly already: string;
  readonly todo: string;
  readonly fine: string;
  readonly summary: (errors: number, warnings: number) => string;
  readonly verbs: Readonly<Record<'add' | 'remove' | 'set', string>>;
  readonly none: string;
  readonly lookups: (n: number, limit: number) => string;
  readonly viaWildcard: string;
};

const _list = (items: readonly string[]): string => items.join(', ');

const _addresses = (data: {
  readonly a: readonly string[];
  readonly aaaa: readonly string[];
}): string => _list([...data.a, ...data.aaaa]);

const _pluralRu = (n: number, one: string, few: string, many: string): string =>
  `${n} ${({ one, few, many } as Record<string, string>)[new Intl.PluralRules('ru').select(n)] ?? many}`;

const _durationRu = (seconds: number): string =>
  seconds >= 86_400
    ? _pluralRu(Math.ceil(seconds / 86_400), 'сутки', 'суток', 'суток')
    : seconds >= 3600
      ? `${Math.ceil(seconds / 3600)} ч`
      : seconds >= 60
        ? `${Math.ceil(seconds / 60)} мин`
        : `${seconds} с`;

const _durationEn = (seconds: number): string =>
  seconds >= 86_400
    ? ((n) => `${n} ${n === 1 ? 'day' : 'days'}`)(Math.ceil(seconds / 86_400))
    : seconds >= 3600
      ? `${Math.ceil(seconds / 3600)} h`
      : seconds >= 60
        ? `${Math.ceil(seconds / 60)} min`
        : `${seconds} s`;

const _ttlList = (
  entries: readonly TtlEntry[],
  duration: (seconds: number) => string
): string =>
  _list(entries.map((_) => `${_.type} ${_.name} — ${duration(_.ttl)}`));

const _keys = (keys: readonly DkimKey[]): string =>
  _list(
    keys.map(
      (_) =>
        `${_.selector} (${_.key.toUpperCase()}${_.bits === null ? '' : ` ${_.bits}`})`
    )
  );

const _old = (facts: DomainFacts): string => _addresses(facts.apex) || '—';

const _RU: DomainTexts = {
  findings: {
    'domain.missing': (_, facts) => ({
      title: `Домена ${facts.domain} нет в DNS`,
      detail:
        'Резолвер отвечает NXDOMAIN: такого имени нет. Проверьте, как написан домен; новый домен сначала регистрируют и делегируют на DNS-серверы.',
    }),
    'domain.unanswered': (_, facts) => ({
      title: `DNS домена ${facts.domain} не отвечает`,
      detail:
        'На запрос адреса пришёл SERVFAIL или ничего: DNS-серверы зоны молчат или сломана подпись DNSSEC. Пока так, домен не работает ни для сайта, ни для почты.',
    }),
    'web.switch': (data) => ({
      title: `Сайт: ${_addresses(data.from)} → ${_addresses(data.to)}`,
      detail:
        'Это и есть переключение: записи A и AAAA домена поведут на новый сервер.',
      step: 'Переключение: адрес сайта — на новый сервер',
      note: 'Последним шагом: когда остальное готово и прошёл прежний TTL.',
    }),
    'web.none': (data) => ({
      title: 'У домена нет адреса',
      detail: `Ни A, ни AAAA: сайт по домену сейчас не открывается. Создайте записи с адресом нового сервера ${_addresses(data.to)}.`,
      step: 'Адрес сайта — на новый сервер',
    }),
    'web.already': (data) => ({
      title: 'Домен уже указывает на новый сервер',
      detail: `${_addresses(data.to)}: переключать нечего.`,
    }),
    'web.no_target': () => ({
      title: 'Новый адрес не задан',
      detail:
        'Без --to проверка берёт публичные адреса этой машины, а их нет. Укажите новый сервер: cms diagnose domain <домен> --to 203.0.113.10',
    }),
    'web.target_unresolved': (data) => ({
      title: '--to не находится в DNS',
      detail: `У ${_list(data.names)} нет адресов A и AAAA. Укажите IP нового сервера или имя, которое уже есть в DNS.`,
    }),
    'web.aaaa_stays': (data) => ({
      title: 'AAAA останется на старом сервере',
      detail: `У домена есть AAAA ${_list(data.aaaa)}, а адреса IPv6 нового сервера нет в --to. После переключения A посетители с IPv6 придут на старый сервер. Туда же пойдёт проверка Let’s Encrypt: она предпочитает IPv6, и сертификат не выпустится. Удалите AAAA или назовите IPv6 нового сервера: --to <IPv4>,<IPv6>.`,
      step: 'Удалить AAAA вместе с переключением',
    }),
    'www.missing': (_, facts) => ({
      title: 'Нет www',
      detail: `www.${facts.domain} не находится в DNS: кто наберёт адрес с www или придёт по старой ссылке, увидит ошибку. Создайте CNAME на домен и добавьте www в --domain, чтобы сертификат был и на него.`,
      step: 'Создать www',
    }),
    'www.follows': (data) => ({
      title: 'www следует за доменом',
      detail: {
        cname: 'www — CNAME на домен и переедет вместе с ним.',
        wildcard:
          'Своей записи у www нет: он отвечает через wildcard * — CNAME на домен — и переедет вместе с ним.',
        target: 'www уже указывает на новый сервер.',
      }[data.how],
    }),
    'www.stays': (data, facts) => ({
      title: 'www останется на прежнем месте',
      detail: `www.${facts.domain} — ${data.cname ? `CNAME ${data.cname}` : _list(data.addresses)}${data.viaWildcard ? ' (через wildcard *)' : ''}, а не сам домен: после переключения A по адресу с www откроется прежний сайт. Сделайте www CNAME на домен.`,
      step: 'www — CNAME на домен',
    }),
    wildcard: (data, facts) =>
      data.moves
        ? {
            title: 'Wildcard * переедет вместе с доменом',
            detail: `*.${facts.domain} — CNAME на домен: любое имя, которого нет в зоне (mail., webmail., опечатки и даже _dmarc), сейчас ведёт на старый сервер, а после переключения поведёт на новый. Нужные поддомены старого хостинга — webmail, ftp, панель — создайте отдельными записями с адресом ${_old(facts)} до переключения.`,
          }
        : {
            title: `Wildcard * указывает на ${_list(data.addresses) || data.cname}`,
            detail:
              'Имена, которых нет в зоне, после переключения останутся там: на новый сервер они не придут.',
          },
    'mx.none': (_, facts) => ({
      title: 'У домена нет MX',
      detail: `Без MX почту для @${facts.domain} доставляют на адрес из A (неявный MX, RFC 5321). После переключения отправители пойдут на новый сервер, а почтового сервера там нет. Если почта на этом домене не нужна, скажите это явно записью null MX (RFC 7505).`,
      step: 'Если почта на домене не нужна — null MX',
    }),
    'mx.null': () => ({
      title: 'Почту домен не принимает',
      detail: 'null MX «0 .»: отправители сразу знают, что почты здесь нет.',
    }),
    'mx.unresolved': (data) => ({
      title: 'MX ведёт в никуда',
      detail: `У ${_list(data.hosts)} нет адреса: почта на домен не доставляется уже сейчас.`,
    }),
    'mx.moves': (data, facts) =>
      data.already
        ? {
            title: 'Почта идёт на новый сервер',
            detail: `MX ${_list(data.hosts)} — это сам домен, а он уже указывает на новый сервер: письма для @${facts.domain} приходят туда, где почтового сервера нет. Узнайте у почтового провайдера имя его сервера и поставьте его в MX.`,
          }
        : {
            title: 'Почта переедет вместе с сайтом',
            detail: `MX ${_list(data.hosts)} — это сам домен, и почтовый сервер ищут по его адресу из A. После переключения письма для @${facts.domain} пойдут на новый сервер, где почтового сервера нет: отправители будут повторять и через несколько дней вернут письма. Туда же пойдут почтовые программы, у которых сервер IMAP и SMTP записан как ${data.hosts[0]} или mail.${facts.domain}. Направьте MX на имя почтового сервера заранее и подождите TTL записи MX.`,
            step: 'Почта: MX — на имя почтового сервера',
            note:
              data.suggestion === null
                ? `Своё имя для старого почтового сервера: запись mail.${facts.domain} с его адресом перекроет и wildcard.`
                : data.confirmed
                  ? `${data.suggestion} — имя из PTR адреса ${_list(data.addresses)}, и оно ведёт обратно на этот адрес. Это предложение: какое имя ставить в MX, скажет почтовый провайдер.`
                  : `${data.suggestion} — имя из PTR адреса ${_list(data.addresses)}, но обратно на этот адрес оно не ведёт. Это только предложение: сверьтесь с почтовым провайдером.`,
            alternative: `Или своё имя для старого почтового сервера — mail.${facts.domain} с адресом ${_list(data.addresses)}:`,
          },
    'mx.shares': (data) => ({
      title: 'Почта живёт на том же сервере, что и сайт',
      detail: `MX ${_list(data.hosts)} — отдельное имя, но с тем же адресом ${_list(data.addresses)}: пока меняется только A домена, почта не переедет. Не отключайте старый хостинг и не меняйте записи «везде, где этот адрес» — иначе вместе с сайтом уедет и почта.`,
    }),
    'mx.elsewhere': (data) => ({
      title: 'Почта не зависит от адреса сайта',
      detail: `MX — ${_list(data.hosts)}: переключение A её не коснётся.`,
    }),
    'spf.none': () => ({
      title: 'Нет SPF',
      detail:
        'Без SPF получатель не знает, с каких серверов домен шлёт почту, и письма чаще попадают в спам.',
      step: 'SPF',
    }),
    'spf.multiple': (data) => ({
      title: 'Несколько записей SPF',
      detail: `У домена записей v=spf1: ${data.records.length}. По RFC 7208 это permerror: SPF не проходит ни одно письмо. Объедините их в одну.`,
    }),
    'spf.syntax': (data) => ({
      title: 'Ошибка в SPF',
      detail: `Непонятные части записи: ${_list(data.terms)}. Получатели отвергнут её целиком (permerror).`,
    }),
    'spf.loop': (data) => ({
      title: 'Петля в SPF',
      detail: `include ведёт по кругу: ${data.chain.join(' → ')}. Проверка SPF кончится ошибкой permerror.`,
    }),
    'spf.broken_include': (data) =>
      data.domains.length > 0
        ? {
            title: 'include без SPF',
            detail: `У ${_list(data.domains)} нет записи SPF или нет ответа. По RFC 7208 это permerror: SPF не проходит ни одно письмо. Уберите include или поправьте имя.`,
          }
        : {
            title: 'Макросы в SPF',
            detail: `${_list(data.macros)}: что они дадут, видно только у получателя, проверка их не раскрывает.`,
          },
    'spf.lookups': (data) => ({
      title: 'SPF требует больше 10 запросов DNS',
      detail: `Запросов ${data.count}, а RFC 7208 разрешает 10 на проверку: получатели дают permerror, и SPF не проходит ни одно письмо. Замените часть include на ip4 и ip6 или уберите лишние.`,
    }),
    'spf.pass_all': (data) => ({
      title: 'SPF разрешает всех',
      detail: `${data.record}: «+all» или «all» без знака разрешает слать почту от имени домена любому серверу. Поставьте ~all или -all.`,
      step: 'SPF: ~all вместо +all',
    }),
    'spf.neutral': (data) => ({
      title: 'SPF ничего не запрещает',
      detail: `${data.record}: в конце ?all или нет all, и письмо с чужого сервера получит «neutral». Когда все отправители перечислены, поставьте ~all.`,
    }),
    'spf.moves': (data) =>
      !data.mailOnOld
        ? {
            title: 'SPF разрешит новый сервер',
            detail: `${_list(data.mechanisms)} в SPF разрешают адрес самого домена: после переключения письма с нового сервера пройдут SPF, а со старого веб-сервера — нет. Eile шлёт почту через SMTP-сервер из настроек, адрес сервера сайта для этого не нужен.`,
          }
        : data.already
          ? {
              title: 'SPF не пропускает почту старого сервера',
              detail: `${_list(data.mechanisms)} в SPF разрешают адрес домена, а он уже указывает на новый сервер. Если старый почтовый сервер ещё шлёт письма, впишите его адрес в SPF явно: ip4:.`,
            }
          : {
              title: 'SPF перестанет пропускать почту старого сервера',
              detail: `${_list(data.mechanisms)} в SPF разрешают адрес самого домена. После переключения A они разрешат новый сервер, а почтовый сервер ${_list(data.lost)} — уже нет: его письма провалят SPF${data.dkim ? '' : ', а DKIM у домена не найден, и такие письма почти наверняка уйдут в спам или вернутся'}. Впишите старый адрес явно. Если почта уходит через SMTP провайдера, нужен ещё его include — он есть в документации провайдера.`,
              step: 'SPF: старый почтовый сервер — явным адресом',
              note: 'mx остаётся: после правки MX он снова укажет на почтовый сервер.',
            },
    'spf.ok': (data) => ({
      title: 'SPF в порядке',
      detail: `${data.record} · запросов DNS ${data.lookups} из 10`,
    }),
    'dkim.found': (data) => ({
      title: 'DKIM найден',
      detail: `${_keys(data.keys)}: подпись не зависит от адреса сайта и переезд переживёт.`,
    }),
    'dkim.revoked': (data) => ({
      title: 'Ключ DKIM отозван',
      detail: `У ${_list(data.selectors)} пустой p=: письма с этим селектором не пройдут DKIM.`,
    }),
    'dkim.missing': (data, facts) => ({
      title: 'Нет DKIM для указанного селектора',
      detail: `${_list(data.selectors.map((_) => `${_}._domainkey.${facts.domain}`))}: записи DKIM нет.`,
    }),
    'dkim.none': (data) => ({
      title: 'DKIM не найден',
      detail: `Ни один из ${data.tried} обычных селекторов не ответил. Имена селекторов DNS не перечисляет: если у провайдера свой (у Postmark в нём дата), укажите его: --dkim-selector <имя>.`,
    }),
    'dmarc.none': (_, facts) => ({
      title: 'Нет DMARC',
      detail: `Без _dmarc.${facts.domain} получатели не знают, что делать с поддельными письмами, а Gmail и Yahoo с 2024 года требуют DMARC от массовых отправителей. Начните с p=none и отчётов: они покажут, кто шлёт почту от имени домена.`,
      step: 'DMARC',
    }),
    'dmarc.wildcard': (data, facts) => ({
      title: 'DMARC нет: _dmarc отвечает wildcard',
      detail: `Своей записи у _dmarc.${facts.domain} нет, и он попадает под * (CNAME ${data.via}): получатели видят там чужой TXT, а не DMARC. Своя запись _dmarc перекроет wildcard.`,
      step: 'DMARC: своя запись _dmarc',
    }),
    'dmarc.invalid': (data) => ({
      title: 'Запись _dmarc — не DMARC',
      detail: `Там ${_list(data.records)}, а запись DMARC начинается с v=DMARC1: получатели её не увидят.`,
      step: 'DMARC: заменить запись',
    }),
    'dmarc.multiple': () => ({
      title: 'Несколько записей DMARC',
      detail:
        'В таком случае получатели не применяют ни одну (RFC 7489 §6.6.3). Оставьте одну.',
    }),
    'dmarc.ok': (data) => ({
      title: `DMARC: p=${data.policy}`,
      detail: [
        data.policy === 'none'
          ? 'Только наблюдение: поддельные письма не отклоняются.'
          : `Поддельные письма получатели ${data.policy === 'reject' ? 'отклонят' : 'отправят в спам'}${data.pct < 100 ? ` (pct=${data.pct})` : ''}.`,
        data.rua.length > 0
          ? `Отчёты — ${_list(data.rua)}.`
          : 'Отчётов нет: rua не задан.',
      ].join(' '),
    }),
    'caa.none': () => ({
      title: 'CAA нет',
      detail:
        'Выпускать сертификаты для домена может любой центр, в том числе Let’s Encrypt.',
    }),
    'caa.allows': (data) => ({
      title:
        data.issuers.length > 0
          ? 'CAA разрешает Let’s Encrypt'
          : 'CAA не ограничивает выпуск',
      detail: `${data.at}${data.issuers.length > 0 ? `: ${_list(data.issuers)}` : ''}`,
    }),
    'caa.blocks': (data) => ({
      title: 'CAA не пускает Let’s Encrypt',
      detail: {
        issuer: `CAA у ${data.at} разрешает выпуск только ${_list(data.issuers)}: сертификат в режиме --domain не выпустится. Добавьте запись для letsencrypt.org.`,
        method: `CAA у ${data.at} разрешает Let’s Encrypt только без http-01 (validationmethods), а Eile подтверждает домен как раз по http-01. Добавьте запись без ограничения.`,
        critical: `В CAA у ${data.at} критический тег ${_list(data.issuers)}, которого центры не знают: по RFC 8659 выпускать нельзя никому. Уберите его.`,
      }[data.reason],
      step: 'CAA: разрешить Let’s Encrypt',
    }),
    'caa.account': (data) => ({
      title: 'CAA пускает только один аккаунт Let’s Encrypt',
      detail: `В записи CAA у ${data.at} есть accounturi: сертификат выпустит только этот аккаунт. У Eile на новом сервере аккаунт свой — уберите accounturi или впишите его аккаунт.`,
    }),
    'ttl.high': (data) => ({
      title: 'TTL больше 5 минут',
      detail: `${_ttlList(data.entries, _durationRu)}. После переключения старые записи продержатся в кэшах до ${_durationRu(data.wait)}. Поставьте TTL 300 сейчас, а переключайтесь не раньше чем через ${_durationRu(data.wait)}: тогда новый адрес разойдётся за пять минут.${data.entries.some((_) => !_.exact) ? ' TTL взят из кэша резолвера: в зоне он может быть больше.' : ''}`,
      step: `TTL 300 — и подождать ${_durationRu(data.wait)}`,
    }),
    'ttl.ok': (data) => ({
      title: 'TTL короткий',
      detail: `${_ttlList(data.entries, _durationRu)}: новый адрес разойдётся быстро.${data.entries.some((_) => !_.exact) ? ' TTL MX — из кэша резолвера: в зоне он может быть больше.' : ''}`,
    }),
    dnssec: (data) =>
      data.signed === null
        ? {
            title: 'DNSSEC: не видно',
            detail:
              'Резолвер системы флаг AD не показывает. Посмотреть — с --resolver doh.',
          }
        : data.signed
          ? {
              title: 'DNSSEC: зона подписана',
              detail:
                'Записи, которые меняете у того же DNS-провайдера, он подпишет сам.',
            }
          : {
              title: 'DNSSEC: зона не подписана',
              detail: 'На переезд это не влияет.',
            },
  },
  needDomain:
    'Нужен домен: cms diagnose domain example.com --to <IP нового сервера>',
  badDomain: (raw) => `${raw} — не домен. Пример: example.com`,
  badResolver: (raw) => `--resolver — doh или system, а не ${raw}`,
  unreachable: (via) =>
    `DNS недоступен (${via}): нет сети или запросы закрыты. Есть свой резолвер — --resolver system.`,
  fellBack: 'DNS поверх HTTPS недоступен — спрашиваю резолвер этой машины.',
  failed: (errors) => `Переключать рано: ошибок ${errors}`,
  target: (source) =>
    ({ to: '', local: 'адреса этой машины', none: '' })[source],
  noTarget: 'новый адрес не задан',
  nameservers: 'Серверы DNS',
  via: 'Запросы',
  resolvers: {
    cloudflare: 'DNS поверх HTTPS, Cloudflare',
    google: 'DNS поверх HTTPS, Google',
    system: 'резолвер этой машины',
  },
  blind: 'TTL только у A и AAAA, DNSSEC не видно, длинные TXT — кусками',
  now: 'Сейчас в DNS',
  breaks: 'Что сломается при переключении',
  nothingBreaks: 'Переключение ничего не сломает.',
  already: 'Уже сейчас',
  todo: 'Что сделать до переключения',
  fine: 'В порядке и на заметку',
  summary: (errors, warnings) => `Ошибок ${errors}, предупреждений ${warnings}`,
  verbs: { add: 'создать', remove: 'удалить', set: 'TTL' },
  none: '—',
  lookups: (n, limit) => `запросов DNS ${n} из ${limit}`,
  viaWildcard: 'через *',
};

const _EN: DomainTexts = {
  findings: {
    'domain.missing': (_, facts) => ({
      title: `${facts.domain} is not in DNS`,
      detail:
        'The resolver answers NXDOMAIN: there is no such name. Check the spelling; a new domain is registered and delegated to name servers first.',
    }),
    'domain.unanswered': (_, facts) => ({
      title: `DNS of ${facts.domain} does not answer`,
      detail:
        'The address query got SERVFAIL or nothing: the zone name servers are silent or the DNSSEC signature is broken. Until that is fixed, the domain works neither for the site nor for mail.',
    }),
    'web.switch': (data) => ({
      title: `Site: ${_addresses(data.from)} → ${_addresses(data.to)}`,
      detail:
        'This is the switch itself: the A and AAAA records of the domain will lead to the new server.',
      step: 'The switch: the site address to the new server',
      note: 'Do it last: when the rest is done and the old TTL has passed.',
    }),
    'web.none': (data) => ({
      title: 'The domain has no address',
      detail: `Neither A nor AAAA: the site does not open by the domain now. Create records with the new server address ${_addresses(data.to)}.`,
      step: 'The site address to the new server',
    }),
    'web.already': (data) => ({
      title: 'The domain already points to the new server',
      detail: `${_addresses(data.to)}: nothing to switch.`,
    }),
    'web.no_target': () => ({
      title: 'No new address given',
      detail:
        'Without --to the check takes the public addresses of this machine, and it has none. Name the new server: cms diagnose domain <domain> --to 203.0.113.10',
    }),
    'web.target_unresolved': (data) => ({
      title: '--to is not in DNS',
      detail: `${_list(data.names)} has no A or AAAA records. Give the IP of the new server or a name that is already in DNS.`,
    }),
    'web.aaaa_stays': (data) => ({
      title: 'AAAA stays on the old server',
      detail: `The domain has AAAA ${_list(data.aaaa)}, and --to has no IPv6 of the new server. After the A switch, IPv6 visitors reach the old server. So does the Let’s Encrypt check: it prefers IPv6, and the certificate will not be issued. Remove the AAAA or name the new IPv6: --to <IPv4>,<IPv6>.`,
      step: 'Remove AAAA together with the switch',
    }),
    'www.missing': (_, facts) => ({
      title: 'No www',
      detail: `www.${facts.domain} is not in DNS: whoever types the address with www or follows an old link gets an error. Create a CNAME to the domain and add www to --domain so the certificate covers it.`,
      step: 'Create www',
    }),
    'www.follows': (data) => ({
      title: 'www follows the domain',
      detail: {
        cname: 'www is a CNAME to the domain and moves with it.',
        wildcard:
          'www has no record of its own: it answers through the wildcard *, a CNAME to the domain, and moves with it.',
        target: 'www already points to the new server.',
      }[data.how],
    }),
    'www.stays': (data, facts) => ({
      title: 'www stays where it is',
      detail: `www.${facts.domain} is ${data.cname ? `a CNAME to ${data.cname}` : _list(data.addresses)}${data.viaWildcard ? ' (through the wildcard *)' : ''}, not the domain itself: after the A switch the address with www opens the old site. Make www a CNAME to the domain.`,
      step: 'www as a CNAME to the domain',
    }),
    wildcard: (data, facts) =>
      data.moves
        ? {
            title: 'The wildcard * moves with the domain',
            detail: `*.${facts.domain} is a CNAME to the domain: any name missing from the zone (mail., webmail., typos and even _dmarc) leads to the old server now and to the new one after the switch. Create the subdomains of the old hosting you need, such as webmail, ftp or the panel, as records of their own with the address ${_old(facts)} before the switch.`,
          }
        : {
            title: `The wildcard * points to ${_list(data.addresses) || data.cname}`,
            detail:
              'Names missing from the zone stay there after the switch: they will not reach the new server.',
          },
    'mx.none': (_, facts) => ({
      title: 'The domain has no MX',
      detail: `Without MX, mail for @${facts.domain} goes to the A address (implicit MX, RFC 5321). After the switch senders will try the new server, which has no mail server. If the domain needs no mail, say so with a null MX (RFC 7505).`,
      step: 'If the domain needs no mail: null MX',
    }),
    'mx.null': () => ({
      title: 'The domain takes no mail',
      detail: 'A null MX “0 .”: senders know at once there is no mail here.',
    }),
    'mx.unresolved': (data) => ({
      title: 'MX leads nowhere',
      detail: `${_list(data.hosts)} has no address: mail for the domain is not delivered already.`,
    }),
    'mx.moves': (data, facts) =>
      data.already
        ? {
            title: 'Mail goes to the new server',
            detail: `MX ${_list(data.hosts)} is the domain itself, and it already points to the new server: mail for @${facts.domain} arrives where there is no mail server. Ask the mail provider for the name of its server and put it into MX.`,
          }
        : {
            title: 'Mail moves together with the site',
            detail: `MX ${_list(data.hosts)} is the domain itself, so the mail server is found by its A address. After the switch mail for @${facts.domain} goes to the new server, which has no mail server: senders retry and bounce the mail in a few days. Mail apps with ${data.hosts[0]} or mail.${facts.domain} as the IMAP and SMTP server go there too. Point MX at the mail server name beforehand and wait for the MX TTL.`,
            step: 'Mail: MX to the mail server name',
            note:
              data.suggestion === null
                ? `A name of your own for the old mail server: a mail.${facts.domain} record with its address overrides the wildcard too.`
                : data.confirmed
                  ? `${data.suggestion} is the PTR name of ${_list(data.addresses)}, and it leads back to that address. It is a suggestion: the mail provider says which name belongs in MX.`
                  : `${data.suggestion} is the PTR name of ${_list(data.addresses)}, but it does not lead back to that address. It is only a suggestion: check with the mail provider.`,
            alternative: `Or a name of your own for the old mail server, mail.${facts.domain} with ${_list(data.addresses)}:`,
          },
    'mx.shares': (data) => ({
      title: 'Mail lives on the same server as the site',
      detail: `MX ${_list(data.hosts)} is a name of its own with the same address ${_list(data.addresses)}: while only the A of the domain changes, mail stays. Do not cancel the old hosting and do not change “every record with this address”, or mail leaves with the site.`,
    }),
    'mx.elsewhere': (data) => ({
      title: 'Mail does not depend on the site address',
      detail: `MX is ${_list(data.hosts)}: the A switch does not touch it.`,
    }),
    'spf.none': () => ({
      title: 'No SPF',
      detail:
        'Without SPF a receiver does not know which servers send mail for the domain, and mail lands in spam more often.',
      step: 'SPF',
    }),
    'spf.multiple': (data) => ({
      title: 'Several SPF records',
      detail: `The domain has ${data.records.length} v=spf1 records. RFC 7208 makes this a permerror: no mail passes SPF. Merge them into one.`,
    }),
    'spf.syntax': (data) => ({
      title: 'An error in SPF',
      detail: `Unknown parts of the record: ${_list(data.terms)}. Receivers reject it as a whole (permerror).`,
    }),
    'spf.loop': (data) => ({
      title: 'A loop in SPF',
      detail: `include goes in a circle: ${data.chain.join(' → ')}. The SPF check ends with a permerror.`,
    }),
    'spf.broken_include': (data) =>
      data.domains.length > 0
        ? {
            title: 'include without SPF',
            detail: `${_list(data.domains)} has no SPF record or no answer. RFC 7208 makes this a permerror: no mail passes SPF. Remove the include or fix the name.`,
          }
        : {
            title: 'Macros in SPF',
            detail: `${_list(data.macros)}: only the receiver sees what they expand to; the check does not.`,
          },
    'spf.lookups': (data) => ({
      title: 'SPF needs more than 10 DNS lookups',
      detail: `${data.count} lookups, and RFC 7208 allows 10 per check: receivers return a permerror and no mail passes SPF. Replace some include with ip4 and ip6 or drop the extra ones.`,
    }),
    'spf.pass_all': (data) => ({
      title: 'SPF allows everyone',
      detail: `${data.record}: “+all”, or “all” without a sign, lets any server send mail as the domain. Use ~all or -all.`,
      step: 'SPF: ~all instead of +all',
    }),
    'spf.neutral': (data) => ({
      title: 'SPF forbids nothing',
      detail: `${data.record}: it ends with ?all or has no all, so mail from a foreign server gets “neutral”. Once every sender is listed, use ~all.`,
    }),
    'spf.moves': (data) =>
      !data.mailOnOld
        ? {
            title: 'SPF will allow the new server',
            detail: `${_list(data.mechanisms)} in SPF allow the address of the domain itself: after the switch mail from the new server passes SPF and mail from the old web server does not. Eile sends mail through the SMTP server from its settings, the site server address is not needed for that.`,
          }
        : data.already
          ? {
              title: 'SPF does not pass mail from the old server',
              detail: `${_list(data.mechanisms)} in SPF allow the address of the domain, and it already points to the new server. If the old mail server still sends mail, list its address in SPF explicitly: ip4:.`,
            }
          : {
              title: 'SPF will stop passing mail from the old server',
              detail: `${_list(data.mechanisms)} in SPF allow the address of the domain itself. After the A switch they allow the new server, and the mail server ${_list(data.lost)} no longer: its mail fails SPF${data.dkim ? '' : ', and the domain has no DKIM, so such mail will almost surely go to spam or bounce'}. List the old address explicitly. If mail goes out through the provider’s SMTP, its include is needed too: the provider documents it.`,
              step: 'SPF: the old mail server as an explicit address',
              note: 'mx stays: after the MX change it points to the mail server again.',
            },
    'spf.ok': (data) => ({
      title: 'SPF is fine',
      detail: `${data.record} · ${data.lookups} of 10 DNS lookups`,
    }),
    'dkim.found': (data) => ({
      title: 'DKIM found',
      detail: `${_keys(data.keys)}: the signature does not depend on the site address and survives the move.`,
    }),
    'dkim.revoked': (data) => ({
      title: 'A DKIM key is revoked',
      detail: `${_list(data.selectors)} has an empty p=: mail signed with this selector fails DKIM.`,
    }),
    'dkim.missing': (data, facts) => ({
      title: 'No DKIM for the given selector',
      detail: `${_list(data.selectors.map((_) => `${_}._domainkey.${facts.domain}`))}: there is no DKIM record.`,
    }),
    'dkim.none': (data) => ({
      title: 'DKIM not found',
      detail: `None of ${data.tried} common selectors answered. DNS does not list selector names: if the provider uses its own (Postmark puts a date in it), give it: --dkim-selector <name>.`,
    }),
    'dmarc.none': (_, facts) => ({
      title: 'No DMARC',
      detail: `Without _dmarc.${facts.domain} receivers do not know what to do with forged mail, and since 2024 Gmail and Yahoo require DMARC from bulk senders. Start with p=none and reports: they show who sends mail as the domain.`,
      step: 'DMARC',
    }),
    'dmarc.wildcard': (data, facts) => ({
      title: 'No DMARC: the wildcard answers _dmarc',
      detail: `_dmarc.${facts.domain} has no record of its own and falls under * (a CNAME to ${data.via}): receivers see a foreign TXT there, not DMARC. A _dmarc record of its own overrides the wildcard.`,
      step: 'DMARC: a _dmarc record of its own',
    }),
    'dmarc.invalid': (data) => ({
      title: 'The _dmarc record is not DMARC',
      detail: `It holds ${_list(data.records)}, and a DMARC record starts with v=DMARC1: receivers will not see it.`,
      step: 'DMARC: replace the record',
    }),
    'dmarc.multiple': () => ({
      title: 'Several DMARC records',
      detail: 'Receivers apply none of them then (RFC 7489 §6.6.3). Keep one.',
    }),
    'dmarc.ok': (data) => ({
      title: `DMARC: p=${data.policy}`,
      detail: [
        data.policy === 'none'
          ? 'Monitoring only: forged mail is not rejected.'
          : `Receivers ${data.policy === 'reject' ? 'reject' : 'send to spam'} forged mail${data.pct < 100 ? ` (pct=${data.pct})` : ''}.`,
        data.rua.length > 0
          ? `Reports go to ${_list(data.rua)}.`
          : 'No reports: rua is not set.',
      ].join(' '),
    }),
    'caa.none': () => ({
      title: 'No CAA',
      detail:
        'Any certificate authority may issue for the domain, Let’s Encrypt included.',
    }),
    'caa.allows': (data) => ({
      title:
        data.issuers.length > 0
          ? 'CAA allows Let’s Encrypt'
          : 'CAA does not limit issuance',
      detail: `${data.at}${data.issuers.length > 0 ? `: ${_list(data.issuers)}` : ''}`,
    }),
    'caa.blocks': (data) => ({
      title: 'CAA keeps Let’s Encrypt out',
      detail: {
        issuer: `CAA at ${data.at} allows only ${_list(data.issuers)}: the --domain certificate will not be issued. Add a record for letsencrypt.org.`,
        method: `CAA at ${data.at} allows Let’s Encrypt only without http-01 (validationmethods), and Eile proves the domain with http-01. Add a record without the limit.`,
        critical: `CAA at ${data.at} has the critical tag ${_list(data.issuers)}, unknown to authorities: RFC 8659 forbids issuing to anyone. Remove it.`,
      }[data.reason],
      step: 'CAA: allow Let’s Encrypt',
    }),
    'caa.account': (data) => ({
      title: 'CAA allows a single Let’s Encrypt account',
      detail: `The CAA record at ${data.at} has accounturi: only that account may issue. Eile on the new server has an account of its own: remove accounturi or put in its account.`,
    }),
    'ttl.high': (data) => ({
      title: 'TTL over 5 minutes',
      detail: `${_ttlList(data.entries, _durationEn)}. After the switch the old records stay in caches for up to ${_durationEn(data.wait)}. Set TTL 300 now and switch no earlier than in ${_durationEn(data.wait)}: then the new address spreads in five minutes.${data.entries.some((_) => !_.exact) ? ' The TTL comes from the resolver cache: the zone may hold more.' : ''}`,
      step: `TTL 300, then wait ${_durationEn(data.wait)}`,
    }),
    'ttl.ok': (data) => ({
      title: 'TTL is short',
      detail: `${_ttlList(data.entries, _durationEn)}: the new address spreads fast.${data.entries.some((_) => !_.exact) ? ' The MX TTL comes from the resolver cache: the zone may hold more.' : ''}`,
    }),
    dnssec: (data) =>
      data.signed === null
        ? {
            title: 'DNSSEC: not visible',
            detail:
              'The system resolver does not show the AD flag. See it with --resolver doh.',
          }
        : data.signed
          ? {
              title: 'DNSSEC: the zone is signed',
              detail:
                'Records you change at the same DNS provider are signed by it.',
            }
          : {
              title: 'DNSSEC: the zone is not signed',
              detail: 'It does not affect the move.',
            },
  },
  needDomain:
    'A domain is needed: cms diagnose domain example.com --to <new server IP>',
  badDomain: (raw) => `${raw} is not a domain. Example: example.com`,
  badResolver: (raw) => `--resolver is doh or system, not ${raw}`,
  unreachable: (via) =>
    `DNS is unreachable (${via}): no network or the queries are blocked. With a resolver of your own: --resolver system.`,
  fellBack:
    'DNS over HTTPS is unreachable, asking the resolver of this machine.',
  failed: (errors) => `Too early to switch: errors ${errors}`,
  target: (source) =>
    ({ to: '', local: 'addresses of this machine', none: '' })[source],
  noTarget: 'no new address given',
  nameservers: 'Name servers',
  via: 'Queries',
  resolvers: {
    cloudflare: 'DNS over HTTPS, Cloudflare',
    google: 'DNS over HTTPS, Google',
    system: 'the resolver of this machine',
  },
  blind: 'TTL only for A and AAAA, no DNSSEC, long TXT in pieces',
  now: 'In DNS now',
  breaks: 'What breaks when you switch',
  nothingBreaks: 'The switch breaks nothing.',
  already: 'Already now',
  todo: 'What to do before the switch',
  fine: 'Fine and for the record',
  summary: (errors, warnings) => `Errors ${errors}, warnings ${warnings}`,
  verbs: { add: 'add', remove: 'remove', set: 'TTL' },
  none: '—',
  lookups: (n, limit) => `${n} of ${limit} DNS lookups`,
  viaWildcard: 'through *',
};

/** Тексты проверки домена на языке CLI. */
export var DOMAIN_TEXTS: Readonly<Record<Language, DomainTexts>> = {
  ru: _RU,
  en: _EN,
};
