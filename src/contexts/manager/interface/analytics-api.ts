import type { BodyBytes } from '../../../platform/body.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { managerLanguageOf } from '../../../shared/kernel/manager-language.ts';
import {
  type Analytics,
  type LogQuery,
  PAGE_LIMITS,
  type SetupAuthor,
} from '../../analytics/index.ts';
import type { Context, Route } from './api.ts';
import { API_HEADERS, json } from './responses.ts';

/**
 * Части аналитики для API менеджера: настройка, отправители, чтение, удаление истории, загрузка файла, отчёты,
 * реестр меток, курсы, расходы и выписки, счёт приёма и сводки отправителей.
 */
export type AnalyticsApi = Pick<
  Analytics,
  | 'settings'
  | 'setup'
  | 'senders'
  | 'people'
  | 'events'
  | 'unknown'
  | 'log'
  | 'reports'
  | 'rates'
  | 'spend'
  | 'statements'
  | 'summaries'
  | 'quality'
  | 'sets'
> & {
  readonly intake: Pick<Analytics['intake'], 'summary' | 'daily'>;
  readonly labels: Pick<
    Analytics['labels'],
    'list' | 'create' | 'rename' | 'remove' | 'check'
  >;
};

/** Строка журнала: номер — курсор следующей страницы. */
type _Entry = { readonly id: number };

// Кусок тела загрузки: окно временного файла перезаписывает следующее чтение, поэтому в поток идёт копия.
const _CHUNK = 64 * 1024;

const _FLAGS: Readonly<Record<string, boolean>> = {
  '1': true,
  true: true,
  '0': false,
  false: false,
};

const _LOGS: Readonly<
  Record<string, (analytics: AnalyticsApi, query: LogQuery) => _Entry[]>
> = {
  setup: (analytics, query) => analytics.log.setup(query),
  erasures: (analytics, query) => analytics.log.erasures(query),
};

// Правку пишет журнал: пользователь и отметка агента — у ключа API, инструмента и ассистента.
const _authorOf = (context: Context): SetupAuthor => ({
  id: context.user!.id,
  name: context.user!.name,
  agent: context.agent,
});

// Ключ из адреса — только свой ключ таблицы: `constructor` и прочее из прототипа не в счёт.
const _own = <T>(table: Readonly<Record<string, T>>, key: string): T | null =>
  Object.hasOwn(table, key) ? (table[key] as T) : null;

const _flag = (raw: string | null): boolean | null => _own(_FLAGS, raw ?? '');

// Число из адреса — числом; негодное (`abc`, `1.5`) становится NaN, и фильтр чтения отвечает отказом сам.
const _number = (raw: string | null): number | undefined =>
  raw === null || raw === '' ? undefined : Number(raw);

const _cursor = (raw: string | null): number | null =>
  raw === null || raw === '' ? null : Number(raw);

const _limit = (raw: number | undefined): number =>
  raw !== undefined && Number.isInteger(raw) && raw > 0
    ? Math.min(raw, PAGE_LIMITS.max)
    : PAGE_LIMITS.default;

// Отправителей создаёт только человек в менеджере, и новый сразу получает ключ: у них свои маршруты.
const _group = (raw: string | undefined): string =>
  raw === 'sender'
    ? fail(
        'analytics.sender_route',
        'Senders are created, archived and removed only by a person signed in to the manager: /analytics/senders/:code'
      )
    : (raw ?? '');

// Пачка курсов или строк расхода — полем тела; нет поля — пусто, и сервис ответит, что ждёт список.
const _field = (body: unknown, field: string): unknown =>
  body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Readonly<Record<string, unknown>>)[field]
    : undefined;

const _archived = (body: unknown): boolean =>
  typeof (body as { archived?: unknown } | null)?.archived === 'boolean'
    ? (body as { archived: boolean }).archived
    : fail('analytics.invalid_item', 'archived is true or false');

// Тело загрузки — потоком кусков из временного файла: в памяти лежит кусок, а не файл.
const _streamOf = (body: BodyBytes): ReadableStream<Uint8Array> => {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull: (controller) =>
      ((chunk) =>
        chunk.byteLength === 0
          ? controller.close()
          : ((at += chunk.byteLength), controller.enqueue(chunk.slice())))(
        body.read(at, Math.min(at + _CHUNK, body.size))
      ),
  });
};

const _byPosition = <T extends { position: number; code: string }>(
  a: T,
  b: T
): number => a.position - b.position || (a.code < b.code ? -1 : 1);

const _searchOf = (request: Request): URLSearchParams =>
  new URL(request.url).searchParams;

// Язык менеджера — первым в Accept-Language: на нём названия образцов.
const _languageOf = (request: Request) =>
  managerLanguageOf(request.headers.get('accept-language'));

// Файл набора — JSON с отступами: две выгрузки одной настройки сравниваются построчно, diff.
const _setFile = (set: { readonly exportedAt?: string }): Response =>
  new Response(`${JSON.stringify(set, null, 2)}\n`, {
    headers: {
      ...API_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="eile-analytics-${(set.exportedAt ?? '').slice(0, 10)}.json"`,
    },
  });

// Параметры отчёта в адресе: период, атрибуция, группа, окно, тестовые, строки, срок жизни, комиссия,
// сравнение, основа и показатель когорт; фильтры — `part.<код>` и прочие. Отчёт берёт свои и не смотрит на
// чужие: вкладки переносят параметры друг другу.
const _REPORT_KEYS = [
  'days',
  'from',
  'to',
  'all',
  'attribution',
  'group',
  'window',
  'test',
  'limit',
  'life',
  'fees',
  'compare',
  'basis',
  'metric',
] as const;

const _FILTER = /^(?:part|trait|prop|answer)\./;

// Фильтр — один на ключ: два значения одной части всё равно не подошли бы никому.
const _filtersOf = (
  query: URLSearchParams,
  sender: boolean
): Readonly<Record<string, string>> =>
  ((entries) =>
    new Set(entries.map((_) => _[0])).size < entries.length
      ? fail(
          'analytics.invalid_query',
          'A filter is given once: each filter key appears once in the address'
        )
      : Object.fromEntries(entries))(
    [...query.entries()].filter(
      ({ 0: key }) => _FILTER.test(key) || (sender && key === 'sender')
    )
  );

const _reportOf = (query: URLSearchParams) => ({
  ...Object.fromEntries(
    _REPORT_KEYS.flatMap((key) =>
      ((value) => (value === null ? [] : [[key, value]]))(query.get(key))
    )
  ),
  filters: _filtersOf(query, true),
});

/**
 * Аналитика клиентского пути в API менеджера (ADR 0072): настройка и её журнал, отправители и ключи, люди,
 * журнал событий, «незнакомые», приём, его счёт и загрузка файла, сводки отправителей, проверки данных, отчёты,
 * реестр меток, курсы и расходы, перенос набора. Отправители,
 * ключи, выключатель приёма, базовая валюта и загрузка набора — только сеансом человека (`_SESSION_ONLY` в api.ts); ключ
 * отправителя есть только в ответе, который его выдал. Курсы, расходы и выписки ключ API вносит: их берёт у банка
 * или кабинета скрипт владельца; инструмента агента для них нет.
 */
export var analyticsApi = (analytics: AnalyticsApi) => {
  // Вся настройка экрану и агенту: у отправителя — есть ли ключ и ключи без них самих, у справочника — значения;
  // вехи и воронки — по порядку.
  const setupView = () =>
    ((setup) => ({
      revision: setup.revision,
      senders: analytics.senders.list().map((sender) => ({
        ...sender,
        hasKey: sender.keys.length > 0,
      })),
      types: setup.types,
      properties: setup.properties,
      dictionaries: setup.dictionaries.map((dictionary) => ({
        ...dictionary,
        values: setup.values
          .filter((_) => _.dictionary === dictionary.code)
          .toSorted(_byPosition),
      })),
      schemas: setup.schemas,
      referrers: setup.referrers,
      links: setup.links,
      milestones: setup.milestones.toSorted(_byPosition),
      funnels: setup.funnels.toSorted(_byPosition),
      // Встроенные проверки — все, с порогами ядра рядом с действующими: поправка — элемент группы check.
      checks: analytics.quality.checks(),
      roles: analytics.setup.roles(),
    }))(analytics.setup.get());

  const logPage = (query: URLSearchParams) =>
    ((kind, limit) =>
      ((read) =>
        ((entries) => ({
          kind,
          entries,
          next: entries.length === limit ? (entries.at(-1)?.id ?? null) : null,
        }))(
          read === null
            ? fail(
                'analytics.invalid_query',
                'The kind filter is one of setup, erasures'
              )
            : read(analytics, {
                before: _cursor(query.get('before')),
                limit,
              })
        ))(_own(_LOGS, kind)))(
      query.get('kind') || 'setup',
      _limit(_number(query.get('limit')))
    );

  const routes: readonly Route[] = [
    [
      'GET',
      '/analytics/settings',
      'analytics.read',
      () => json(200, analytics.settings.get()),
    ],
    [
      // Включить приём — решение человека: о сборе истории говорит политика сайта; базовую валюту — тоже.
      'PUT',
      '/analytics/settings',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(200, analytics.settings.save(_ ?? {}, _authorOf(context)))
          ),
    ],
    ['GET', '/analytics/setup', 'analytics.read', () => json(200, setupView())],
    [
      'PUT',
      '/analytics/setup/:group',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              analytics.setup.save(
                _group(context.params.group),
                _,
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'POST',
      '/analytics/setup/:group/archive',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              analytics.setup.archive(
                _group(context.params.group),
                _,
                _archived(_),
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'POST',
      '/analytics/setup/:group/remove',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then(
            (_) => (
              analytics.setup.remove(
                _group(context.params.group),
                _,
                _authorOf(context)
              ),
              json(200, {})
            )
          ),
    ],
    [
      // Новый отправитель получает ключ в том же ответе — 201; правка прежнего — 200 без ключа.
      'PUT',
      '/analytics/senders/:code',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            ((saved) => json(saved.key === null ? 200 : 201, saved))(
              analytics.senders.save(
                { ...(_ ?? {}), code: context.params.code },
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'POST',
      '/analytics/senders/:code/archive',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              analytics.senders.archive(
                context.params.code,
                _archived(_),
                _authorOf(context)
              )
            )
          ),
    ],
    [
      // Отправитель без типов и событий уходит вместе с ключами; иначе — `analytics.in_use`, только в архив.
      'POST',
      '/analytics/senders/:code/remove',
      'analytics.edit',
      (context) => (
        analytics.setup.remove(
          'sender',
          { code: context.params.code },
          _authorOf(context)
        ),
        json(200, {})
      ),
    ],
    [
      'POST',
      '/analytics/senders/:code/keys',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_: { label?: unknown } | null) =>
            json(
              201,
              analytics.senders.issue(
                context.params.code,
                _?.label ?? null,
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'DELETE',
      '/analytics/senders/:code/keys/:id',
      'analytics.edit',
      (context) => (
        analytics.senders.revoke(
          context.params.code,
          Number(context.params.id),
          _authorOf(context)
        ),
        json(200, {})
      ),
    ],
    [
      // Набор настройки файлом: без ключей, событий, людей, курсов, расходов и выписок.
      'GET',
      '/analytics/set',
      'analytics.read',
      () => _setFile(analytics.sets.export()),
    ],
    [
      'GET',
      '/analytics/set/samples',
      'analytics.read',
      ({ request }) => json(200, analytics.sets.samples(_languageOf(request))),
    ],
    [
      // Проба ничего не пишет: её можно и ключом API. Тело — набор или { sample, language }.
      'POST',
      '/analytics/set/plan',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(200, analytics.sets.plan(_, _languageOf(context.request)))
          ),
    ],
    [
      // Загрузка — только сеанс (_SESSION_ONLY): набор создаёт отправителей и меняет роли разом. Ошибки набора —
      // 422 с путями и отчётом пробы, ничего не записано.
      'POST',
      '/analytics/set',
      'analytics.edit',
      (context) =>
        context.body().then((_) =>
          ((report) =>
            report.applied
              ? json(200, report)
              : json(422, {
                  error: {
                    code: 'analytics.invalid_set',
                    message: `The set "${report.name}" is not applied, nothing changed: ${Object.keys(report.errors).length} error(s)`,
                  },
                  errors: report.errors,
                  report,
                }))(
            analytics.sets.apply(
              _,
              _languageOf(context.request),
              _authorOf(context)
            )
          )
        ),
    ],
    [
      'GET',
      '/analytics/unknown',
      'analytics.read',
      () => json(200, analytics.unknown()),
    ],
    [
      'GET',
      '/analytics/sources',
      'analytics.read',
      ({ request }) =>
        json(200, analytics.reports.sources(_reportOf(_searchOf(request)))),
    ],
    [
      'GET',
      '/analytics/funnel',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.reports.funnel({
              ..._reportOf(query),
              funnel: query.get('funnel'),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/overview',
      'analytics.read',
      ({ request }) =>
        json(200, analytics.reports.overview(_reportOf(_searchOf(request)))),
    ],
    [
      'GET',
      '/analytics/cohorts',
      'analytics.read',
      ({ request }) =>
        json(200, analytics.reports.cohorts(_reportOf(_searchOf(request)))),
    ],
    [
      'GET',
      '/analytics/milestones',
      'analytics.read',
      ({ request }) =>
        json(200, analytics.reports.milestones(_reportOf(_searchOf(request)))),
    ],
    [
      'GET',
      '/analytics/answers',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.reports.answers({
              ..._reportOf(query),
              question: query.get('question'),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/labels',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.labels.list({
              sender: query.get('sender'),
              q: query.get('q'),
              offset: _number(query.get('offset')),
              limit: _number(query.get('limit')),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/labels/check',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.labels.check(query.get('sender'), query.get('text') ?? '')
          ))(_searchOf(request)),
    ],
    [
      // Новая метка — 201; такая уже есть — 200 с прежней записью и `existing`.
      'POST',
      '/analytics/labels',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            ((issued) => json(issued.existing ? 200 : 201, issued))(
              analytics.labels.create(
                (_ ?? {}) as Readonly<Record<string, unknown>>,
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'PUT',
      '/analytics/labels/:sender/:label',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_: { name?: unknown } | null) =>
            json(
              200,
              analytics.labels.rename(
                context.params.sender,
                context.params.label,
                _?.name,
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'DELETE',
      '/analytics/labels/:sender/:label',
      'analytics.edit',
      (context) => (
        analytics.labels.remove(
          context.params.sender,
          context.params.label,
          _authorOf(context)
        ),
        json(200, {})
      ),
    ],
    [
      'GET',
      '/analytics/rates',
      'analytics.read',
      () => json(200, analytics.rates.list()),
    ],
    [
      'PUT',
      '/analytics/rates',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              analytics.rates.save(_field(_, 'rates'), _authorOf(context))
            )
          ),
    ],
    [
      'DELETE',
      '/analytics/rates/:currency/:day',
      'analytics.edit',
      (context) => (
        analytics.rates.remove(
          context.params.currency,
          context.params.day,
          _authorOf(context)
        ),
        json(200, {})
      ),
    ],
    [
      // Выписки месяцев рядом с выручкой сайта: `from` и `to` — месяцы ГГГГ-ММ.
      'GET',
      '/analytics/statements',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.statements.list({
              from: query.get('from'),
              to: query.get('to'),
            })
          ))(_searchOf(request)),
    ],
    [
      'PUT',
      '/analytics/statements',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              analytics.statements.save(
                _field(_, 'statements'),
                _authorOf(context)
              )
            )
          ),
    ],
    [
      'DELETE',
      '/analytics/statements/:month/:currency',
      'analytics.edit',
      (context) => (
        analytics.statements.remove(
          context.params.month,
          context.params.currency,
          _authorOf(context)
        ),
        json(200, {})
      ),
    ],
    [
      'GET',
      '/analytics/spend',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.spend.list({
              from: query.get('from'),
              to: query.get('to'),
              days: query.get('days'),
              all: query.get('all'),
            })
          ))(_searchOf(request)),
    ],
    [
      'PUT',
      '/analytics/spend',
      'analytics.edit',
      (context) =>
        context
          .body()
          .then((_) =>
            json(
              200,
              analytics.spend.save(_field(_, 'rows'), _authorOf(context))
            )
          ),
    ],
    [
      'DELETE',
      '/analytics/spend/:id',
      'analytics.edit',
      (context) => (
        analytics.spend.remove(Number(context.params.id), _authorOf(context)),
        json(200, {})
      ),
    ],
    [
      'GET',
      '/analytics/intake',
      'analytics.read',
      () => json(200, analytics.intake.summary()),
    ],
    [
      // Счёт приёма по суткам UTC: исходы событий и отказы, в том числе ещё не записанные из памяти.
      'GET',
      '/analytics/intake/daily',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.intake.daily({
              days: query.get('days'),
              from: query.get('from'),
              to: query.get('to'),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/summaries',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.summaries.list({
              sender: query.get('sender'),
              days: query.get('days'),
              from: query.get('from'),
              to: query.get('to'),
              test: query.get('test'),
            })
          ))(_searchOf(request)),
    ],
    [
      // Сетка проверок данных: сутки UTC, проверки с порогами, есть ли каналы сбоев; detail — и сверка сводок.
      'GET',
      '/analytics/quality',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.quality.report({
              days: query.get('days'),
              from: query.get('from'),
              to: query.get('to'),
              check: query.get('check'),
              sender: query.get('sender'),
              test: query.get('test'),
              detail: query.get('detail'),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/quality/status',
      'analytics.read',
      () => json(200, analytics.quality.status()),
    ],
    [
      'GET',
      '/analytics/quality/:check/:day',
      'analytics.read',
      ({ request, params }) =>
        ((query) =>
          json(
            200,
            analytics.quality.day({
              check: params.check,
              day: params.day,
              scope: query.get('scope'),
              test: query.get('test'),
            })
          ))(_searchOf(request)),
    ],
    [
      // Снять замечание или сбой вручную: заметка о причине обязательна, кто снял — в строке и журнале.
      'POST',
      '/analytics/quality/:check/:day/resolve',
      'analytics.edit',
      (context) =>
        context.body().then((_) =>
          json(
            200,
            analytics.quality.resolve(
              {
                check: context.params.check,
                day: context.params.day,
                scope: _field(_, 'scope'),
                test: _field(_, 'test'),
              },
              _field(_, 'note'),
              _authorOf(context)
            )
          )
        ),
    ],
    [
      'DELETE',
      '/analytics/quality/:check/:day/resolve',
      'analytics.edit',
      (context) =>
        ((query) =>
          json(
            200,
            analytics.quality.reopen(
              {
                check: context.params.check,
                day: context.params.day,
                scope: query.get('scope'),
                test: query.get('test'),
              },
              _authorOf(context)
            )
          ))(_searchOf(context.request)),
    ],
    [
      // Проверить заново сейчас, в своём процессе и без уведомлений: о них решит такт сервера по строкам.
      'POST',
      '/analytics/quality/run',
      'analytics.edit',
      (context) =>
        context.body().then((_) =>
          json(
            200,
            analytics.quality.run({
              check: _field(_, 'check'),
              day: _field(_, 'day'),
              scope: _field(_, 'scope'),
            })
          )
        ),
    ],
    [
      'GET',
      '/analytics/log',
      'analytics.read',
      ({ request }) => json(200, logPage(_searchOf(request))),
    ],
    [
      'GET',
      '/analytics/people',
      'analytics.read',
      // С параметрами отчёта — те же люди, что в строке «Источников» или на шаге воронки.
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.people.list({
              state: query.get('state'),
              sender: query.get('sender'),
              q: query.get('q'),
              test: _flag(query.get('test')) === true,
              offset: _number(query.get('offset')),
              limit: _number(query.get('limit')),
              days: query.get('days'),
              from: query.get('from'),
              to: query.get('to'),
              all: query.get('all'),
              attribution: query.get('attribution'),
              filters: _filtersOf(query, false),
              milestone: query.get('milestone'),
              reached: query.get('reached'),
              by: query.get('by'),
              funnel: query.get('funnel'),
              step: query.get('step'),
              stage: query.get('stage'),
              firstTouchConflict: query.get('firstTouchConflict'),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/people/:subject',
      'analytics.read',
      ({ request, params }) =>
        ((query) =>
          json(
            200,
            analytics.people.get(params.subject, {
              before: _cursor(query.get('before')),
              limit: _number(query.get('limit')),
            })
          ))(_searchOf(request)),
    ],
    [
      // Необратимо: остаётся отметка удаления, журнал называет пользователя.
      'DELETE',
      '/analytics/people/:subject',
      'analytics.edit',
      (context) =>
        json(
          200,
          analytics.people.erase(context.params.subject, _authorOf(context))
        ),
    ],
    [
      'GET',
      '/analytics/events',
      'analytics.read',
      ({ request }) =>
        ((query) =>
          json(
            200,
            analytics.events.list({
              type: query.get('type'),
              role: query.get('role'),
              sender: query.get('sender'),
              from: query.get('from'),
              to: query.get('to'),
              test: _flag(query.get('test')),
              subject: query.get('subject'),
              before: _cursor(query.get('before')),
              limit: _number(query.get('limit')),
            })
          ))(_searchOf(request)),
    ],
    [
      'GET',
      '/analytics/events/:seq',
      'analytics.read',
      ({ params }) => json(200, analytics.events.body(Number(params.seq))),
    ],
    [
      // Файл JSON Lines ждёт разбора во временном файле, строки идут в приём пачками с паузами: сервер
      // между пачками отвечает. Отчёт — как у `cms events import --json`.
      'POST',
      '/analytics/events/import',
      'analytics.edit',
      (context) =>
        ((query) =>
          context.spooled().then((body) =>
            analytics.events
              .import(_streamOf(body), {
                sender: query.get('sender'),
                dryRun: _flag(query.get('dryRun')) === true,
              })
              .then((report) => json(200, report))
              .finally(body.close)
          ))(_searchOf(context.request)),
    ],
  ];

  return { routes };
};
