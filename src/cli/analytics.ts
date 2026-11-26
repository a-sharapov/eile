import { resolve } from 'node:path';
import { type App, createApp } from '../app.ts';
import {
  type SampleView,
  SET_FORMAT,
  SET_VERSION,
  type SetItemNote,
  type SetPlanReport,
  type SetUntouched,
  type SetupGroup,
  type SetWarning,
  sampleViews,
} from '../contexts/analytics/index.ts';
import { ANALYTICS_SAMPLES } from '../scaffolds/analytics/index.ts';
import { attempt } from '../shared/kernel/errors.ts';
import {
  isManagerLanguage,
  type ManagerLanguage,
} from '../shared/kernel/manager-language.ts';
import { pipe } from '../shared/kernel/pipe.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';

// Набор предельного размера по числу элементов — 12 МБ, со 100-знаковыми названиями у каждого — 29 МБ (замер
// ADR 0072); файл больше — не набор настройки, а память процесса на разбор JSON.
const _LIMIT_MB = 32;
const _LIMIT = _LIMIT_MB * 1024 * 1024;

// Сколько элементов группы и ошибок печатать: остальное — числом и в --json.
const _SHOWN = 5;
const _ERRORS = 100;

const _SQLITE = 'SQLite format 3\u0000';

type _Group = SetupGroup;

const _SAY = {
  ru: {
    noSubcommand: (name: string | undefined) =>
      name === undefined
        ? 'Нужна подкоманда: cms analytics export | import | samples — cms help analytics'
        : `Нет подкоманды analytics ${name}. Есть: export, import, samples — cms help analytics`,
    needSet:
      'Нужен файл набора или образец: cms analytics import set.json --db site.db или cms analytics import --sample shop --db site.db',
    fileAndSample: 'Либо файл набора, либо --sample: не оба сразу.',
    noFile: (file: string) => `Нет файла ${file}.`,
    noDb: (db: string) =>
      `Нет базы ${db}. Укажите файл: --db site.db (новую создаёт cms serve).`,
    isDb: (file: string) =>
      `${file} — это база сайта, а не набор. Выгрузить набор: cms analytics export set.json --db ${file}`,
    sqlite: (file: string) =>
      `${file} — база SQLite, а не набор настройки. Выгрузить набор из неё: cms analytics export set.json --db ${file}`,
    tooLarge: (file: string) =>
      `${file} больше ${_LIMIT_MB} МБ — это не набор настройки: набор предельного размера меньше.`,
    notJson: (file: string) =>
      `${file} — не JSON. Набор — файл из cms analytics export или менеджера: «Статистика → Настройка → Перенос».`,
    notSet: (file: string) =>
      `${file} — не набор настройки аналитики: в нём нет "format": "${SET_FORMAT}".`,
    version: (version: string) =>
      `Набор версии ${version}: эта Eile читает версию ${SET_VERSION} — обновите Eile, cms update.`,
    noSample: (code: string) =>
      `Нет образца ${code}. Есть: ${ANALYTICS_SAMPLES.map((_) => _.code).join(', ')} — cms analytics samples`,
    language: 'Язык образца — ru, en или de: --language de',
    badName: 'Имя набора — от 1 до 100 знаков: --name "Мой сайт"',
    exists: (file: string) => `Файл ${file} уже есть — выберите другое имя.`,
    exported: (name: string, file: string) => `Набор «${name}» — в ${file}:`,
    notIncluded:
      'В набор не входят ключи отправителей, события и люди, реестр меток, курсы, расходы и выписки, выключатель приёма, срок хранения и базовая валюта.',
    dry: (name: string, db: string) =>
      `Проба набора «${name}» для ${db} — база не изменена:`,
    done: (name: string, db: string, revision: number) =>
      `Набор «${name}» загружен в ${db}, ревизия ${revision}:`,
    same: (name: string, db: string) =>
      `Набор «${name}» уже на ${db}: ничего не изменилось.`,
    refused: (name: string, db: string) =>
      `Набор «${name}» не загружен в ${db}: в нём ошибки, ничего не изменилось.`,
    created: 'Создастся',
    createdDone: 'Создано',
    changed: 'Изменится',
    changedDone: 'Изменено',
    unchanged: 'Без изменений',
    kept: 'Не тронуты',
    keptNote: 'на сайте и не в файле',
    archived: 'в архиве',
    more: (n: number) => `… и ещё ${n}`,
    errors: (n: number) => `Ошибки — ${n}, набор не применить:`,
    untouched: 'Набор не меняет',
    again: 'Загрузить по-настоящему — та же команда без --dry-run.',
    keys: 'Ключи отправителей набор не создаёт: выпустите их в менеджере, «Статистика → Настройка → Отправители», и передайте разработчику.',
    links:
      'Переходов в образце нет: заведите переход на свой бот, приложение или магазин в «Статистика → Настройка → Переходы».',
    failed: (n: number) => `Ошибок в наборе: ${n} — ничего не применено.`,
    samples: 'Образцы наборов настройки аналитики:',
    sampleCounts: (counts: SampleView['counts']) =>
      `типов ${counts.type ?? 0} · справочников ${counts.dictionary ?? 0} · вех ${counts.milestone ?? 0} · воронок ${counts.funnel ?? 0}`,
    samplesHint:
      'Поставить образец: cms analytics import --sample shop --db site.db; сначала проба — с --dry-run.',
    groups: {
      sender: 'отправители',
      type: 'типы',
      property: 'свойства',
      dictionary: 'справочники',
      value: 'значения',
      schema: 'схемы меток',
      referrer: 'соответствия',
      link: 'переходы',
      milestone: 'вехи',
      funnel: 'воронки',
      check: 'проверки',
    } satisfies Record<_Group, string>,
    warnings: {
      role_changed:
        'тип с событиями меняет роль: люди пересчитаются, отчёты изменятся',
      sender_created:
        'новый отправитель без ключа: выпустите ключ в «Отправителях»',
      sender_disabled: 'отправитель выключается: его события получат 401',
      archive_kept: 'архив в файле и на сайте разный: остаётся как на сайте',
      summary_hour: 'меняется час сводки: проверки сводки перепроверятся',
      newer_file: 'набор выгружен более новой Eile, незнакомого в нём нет',
    } satisfies Record<SetWarning['code'], string>,
    untouchedWords: {
      intake: 'приём событий',
      retention: 'срок хранения',
      base_currency: 'базовую валюту',
      keys: 'ключи отправителей',
      labels: 'реестр меток',
      rates: 'курсы',
      spend: 'расходы',
      statements: 'выписки',
      events: 'события',
      people: 'людей',
      results: 'результаты проверок',
    } satisfies Record<SetUntouched, string>,
  },
  en: {
    noSubcommand: (name: string | undefined) =>
      name === undefined
        ? 'A subcommand is needed: cms analytics export | import | samples (cms help analytics)'
        : `No subcommand analytics ${name}. There are export, import, samples: cms help analytics`,
    needSet:
      'A set file or a sample is needed: cms analytics import set.json --db site.db or cms analytics import --sample shop --db site.db',
    fileAndSample: 'Either a set file or --sample, not both.',
    noFile: (file: string) => `No file ${file}.`,
    noDb: (db: string) =>
      `No database ${db}. Name the file: --db site.db (cms serve creates a new one).`,
    isDb: (file: string) =>
      `${file} is the site database, not a set. To export a set: cms analytics export set.json --db ${file}`,
    sqlite: (file: string) =>
      `${file} is an SQLite database, not an analytics set. To export a set from it: cms analytics export set.json --db ${file}`,
    tooLarge: (file: string) =>
      `${file} is over ${_LIMIT_MB} MB: that is not an analytics set, a set of the largest size is smaller.`,
    notJson: (file: string) =>
      `${file} is not JSON. A set is a file from cms analytics export or from the manager: Statistics → Setup → Transfer.`,
    notSet: (file: string) =>
      `${file} is not an analytics set: it has no "format": "${SET_FORMAT}".`,
    version: (version: string) =>
      `The set is version ${version}, this Eile reads version ${SET_VERSION}: update Eile, cms update.`,
    noSample: (code: string) =>
      `No sample ${code}. There are ${ANALYTICS_SAMPLES.map((_) => _.code).join(', ')}: cms analytics samples`,
    language: 'The language of a sample is ru, en or de: --language de',
    badName: 'The set name is 1 to 100 characters: --name "My site"',
    exists: (file: string) => `${file} already exists. Choose another name.`,
    exported: (name: string, file: string) =>
      `The set “${name}” is in ${file}:`,
    notIncluded:
      'The set does not include sender keys, events and people, the label registry, rates, spend and statements, the intake switch, retention and the base currency.',
    dry: (name: string, db: string) =>
      `Trial of the set “${name}” for ${db}, the database is unchanged:`,
    done: (name: string, db: string, revision: number) =>
      `The set “${name}” is imported into ${db}, revision ${revision}:`,
    same: (name: string, db: string) =>
      `The set “${name}” is already on ${db}: nothing changed.`,
    refused: (name: string, db: string) =>
      `The set “${name}” is not imported into ${db}: it has errors, nothing changed.`,
    created: 'To create',
    createdDone: 'Created',
    changed: 'To change',
    changedDone: 'Changed',
    unchanged: 'Unchanged',
    kept: 'Kept',
    keptNote: 'on the site and not in the file',
    archived: 'archived',
    more: (n: number) => `… and ${n} more`,
    errors: (n: number) => `Errors — ${n}, the set cannot be applied:`,
    untouched: 'The set does not change',
    again: 'To import for real, run the same command without --dry-run.',
    keys: 'A set creates no sender keys: issue them in the manager, Statistics → Setup → Senders, and pass them to the developer.',
    links:
      'The sample has no links: add a link to your bot, app or shop in Statistics → Setup → Links.',
    failed: (n: number) => `Errors in the set: ${n}, nothing was applied.`,
    samples: 'Sample sets of the analytics setup:',
    sampleCounts: (counts: SampleView['counts']) =>
      `types ${counts.type ?? 0} · dictionaries ${counts.dictionary ?? 0} · milestones ${counts.milestone ?? 0} · funnels ${counts.funnel ?? 0}`,
    samplesHint:
      'To install a sample: cms analytics import --sample shop --db site.db; try it first with --dry-run.',
    groups: {
      sender: 'senders',
      type: 'types',
      property: 'properties',
      dictionary: 'dictionaries',
      value: 'values',
      schema: 'label schemas',
      referrer: 'referrer rules',
      link: 'links',
      milestone: 'milestones',
      funnel: 'funnels',
      check: 'checks',
    } satisfies Record<_Group, string>,
    warnings: {
      role_changed:
        'a type with events changes its role: people are recounted, reports change',
      sender_created: 'a new sender without a key: issue one in Senders',
      sender_disabled: 'the sender is turned off: its events get 401',
      archive_kept:
        'the archive differs in the file and on the site: kept as on the site',
      summary_hour: 'the summary hour changes: its summary checks run again',
      newer_file:
        'the set was exported by a newer Eile, nothing in it is unknown',
    } satisfies Record<SetWarning['code'], string>,
    untouchedWords: {
      intake: 'the event intake',
      retention: 'retention',
      base_currency: 'the base currency',
      keys: 'sender keys',
      labels: 'the label registry',
      rates: 'rates',
      spend: 'spend',
      statements: 'statements',
      events: 'events',
      people: 'people',
      results: 'check results',
    } satisfies Record<SetUntouched, string>,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _reject = (message: string): Promise<never> =>
  Promise.reject(cliError(message));

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 15)}${value}`;

const _dot = (paint: Paint): string => paint.dim(' · ');

const _open = (ctx: Context): Promise<App> =>
  Bun.file(ctx.options.db)
    .exists()
    .then((exists) =>
      exists
        ? createApp({
            databasePath: ctx.options.db,
            ...(ctx.options.mediaCache
              ? { mediaCache: ctx.options.mediaCache }
              : {}),
          })
        : _reject(_SAY[ctx.language].noDb(ctx.options.db))
    );

const _withApp = <T>(ctx: Context, run: (app: App) => T): Promise<T> =>
  _open(ctx).then((app) =>
    Promise.resolve()
      .then(() => run(app))
      .finally(() => app.close())
  );

// Язык образца — флаг или язык CLI; у CLI их два, у менеджера — три.
const _languageOf = (ctx: Context): Promise<ManagerLanguage> =>
  ((given) =>
    given === undefined
      ? Promise.resolve(ctx.language)
      : isManagerLanguage(given)
        ? Promise.resolve(given)
        : _reject(_SAY[ctx.language].language))(ctx.options.language);

// Список элементов группы: первые несколько ключами с названием, остальные — числом.
const _items = (
  paint: Paint,
  say: _Say,
  items: readonly { key: string; name: string; extra: string }[]
): string[] => [
  ...items
    .slice(0, _SHOWN)
    .map(
      (_) =>
        `      ${_.key}${_.name === '' ? '' : ` ${paint.dim('—')} ${_.name}`}${_.extra}`
    ),
  ...(items.length > _SHOWN
    ? [`      ${paint.dim(say.more(items.length - _SHOWN))}`]
    : []),
];

const _byGroup = <T extends SetItemNote>(
  paint: Paint,
  say: _Say,
  entries: readonly T[],
  extra: (entry: T) => string
): string[] =>
  [...Map.groupBy(entries, (_) => _.group)].flatMap(
    ({ 0: group, 1: inGroup }) => [
      `    ${padEnd(say.groups[group], 15)}${inGroup.length}`,
      ..._items(
        paint,
        say,
        inGroup.map((_) => ({ key: _.key, name: _.name, extra: extra(_) }))
      ),
    ]
  );

const _headline = (
  paint: Paint,
  say: _Say,
  db: string,
  report: SetPlanReport
): string =>
  Object.keys(report.errors).length > 0
    ? `${paint.error('✗')} ${report.dryRun ? say.dry(report.name, db) : say.refused(report.name, db)}`
    : report.dryRun
      ? `${paint.ok('✓')} ${say.dry(report.name, db)}`
      : report.created.length + report.changed.length === 0
        ? `${paint.ok('✓')} ${say.same(report.name, db)}`
        : `${paint.ok('✓')} ${say.done(report.name, db, report.revision ?? 0)}`;

/** Отчёт пробы и загрузки для человека: по группам с ключами, предупреждения, ошибки `путь — причина`. */
export var setReportText = (
  paint: Paint,
  language: Language,
  { db, sample }: { readonly db: string; readonly sample: boolean },
  report: SetPlanReport
): string =>
  ((say, errors) =>
    [
      _headline(paint, say, db, report),
      _row(
        paint,
        report.dryRun ? say.created : say.createdDone,
        String(report.created.length)
      ),
      ..._byGroup(paint, say, report.created, (_) =>
        _.archived ? ` ${paint.dim(`(${say.archived})`)}` : ''
      ),
      _row(
        paint,
        report.dryRun ? say.changed : say.changedDone,
        String(report.changed.length)
      ),
      ..._byGroup(
        paint,
        say,
        report.changed,
        (_) => `${paint.dim(':')} ${_.fields.join(', ')}`
      ),
      _row(paint, say.unchanged, String(report.unchanged)),
      ...(Object.keys(report.kept).length > 0
        ? [
            _row(
              paint,
              say.kept,
              `${Object.entries(report.kept)
                .map(
                  ({ 0: group, 1: count }) =>
                    `${say.groups[group as SetupGroup]} ${count}`
                )
                .join(_dot(paint))} ${paint.dim(`(${say.keptNote})`)}`
            ),
          ]
        : []),
      ...report.warnings.map(
        (_) =>
          `  ${paint.warn('!')} ${paint.path(_.path || _.key || '')}${_.key && _.path ? ` ${_.key}` : ''} ${paint.dim('—')} ${say.warnings[_.code]}`
      ),
      ...(errors.length > 0
        ? [
            '',
            paint.warn(say.errors(errors.length)),
            ...errors
              .slice(0, _ERRORS)
              .map(
                ({ 0: path, 1: message }) =>
                  `  ${paint.error('✗')} ${paint.path(path || '—')} — ${message}`
              ),
            ...(errors.length > _ERRORS
              ? [`  ${paint.dim(say.more(errors.length - _ERRORS))}`]
              : []),
          ]
        : []),
      '',
      `${say.untouched}: ${report.untouched.map((_) => say.untouchedWords[_]).join(', ')}.`,
      ...(report.created.some((_) => _.group === 'sender') ? [say.keys] : []),
      ...(sample && errors.length === 0 ? [say.links] : []),
      ...(report.dryRun && errors.length === 0 ? ['', say.again] : []),
    ].join('\n'))(_SAY[language], Object.entries(report.errors));

// Набор — чужой файл: не база сайта, не база SQLite, не больше предела, JSON с обёрткой набора.
const _readSet = (ctx: Context, file: string): Promise<unknown> =>
  ((say) =>
    resolve(file) === resolve(ctx.options.db)
      ? _reject(say.isDb(file))
      : Bun.file(file)
          .exists()
          .then((exists) =>
            !exists
              ? _reject(say.noFile(file))
              : Bun.file(file).size > _LIMIT
                ? _reject(say.tooLarge(file))
                : Bun.file(file).bytes()
          )
          .then((bytes) =>
            new TextDecoder().decode(bytes.subarray(0, 16)) === _SQLITE
              ? _reject(say.sqlite(file))
              : attempt(
                  () =>
                    Promise.resolve(
                      JSON.parse(
                        new TextDecoder().decode(bytes).replace(/^﻿/, '')
                      ) as unknown
                    ),
                  () => _reject(say.notJson(file))
                )
          )
          .then((set) =>
            set === null ||
            typeof set !== 'object' ||
            Array.isArray(set) ||
            (set as { format?: unknown }).format !== SET_FORMAT
              ? _reject(say.notSet(file))
              : (set as { version?: unknown }).version !== SET_VERSION
                ? _reject(
                    say.version(
                      String((set as { version?: unknown }).version).slice(
                        0,
                        20
                      )
                    )
                  )
                : set
          ))(_SAY[ctx.language]);

// Образец — код из бинарника, язык названий — флаг или язык CLI.
const _sampleOf = (ctx: Context, code: string): Promise<unknown> =>
  ANALYTICS_SAMPLES.some((_) => _.code === code)
    ? _languageOf(ctx).then((language) => ({ sample: code, language }))
    : _reject(_SAY[ctx.language].noSample(code));

const _inputOf = (ctx: Context): Promise<unknown> =>
  ((say, file, sample) =>
    file !== undefined && sample !== undefined
      ? _reject(say.fileAndSample)
      : sample !== undefined
        ? _sampleOf(ctx, sample)
        : file !== undefined
          ? _readSet(ctx, file)
          : _reject(say.needSet))(
    _SAY[ctx.language],
    ctx.args[1],
    ctx.options.sample
  );

// Ошибки набора — код выхода 1 и у пробы: скрипт видит, что файл не применить.
const _reported =
  (ctx: Context) =>
  (report: SetPlanReport): Promise<void> => (
    ctx.out(
      ctx.options.json
        ? JSON.stringify(report, null, 2)
        : setReportText(
            ctx.paint,
            ctx.language,
            { db: ctx.options.db, sample: ctx.options.sample !== undefined },
            report
          )
    ),
    Object.keys(report.errors).length === 0
      ? Promise.resolve()
      : _reject(_SAY[ctx.language].failed(Object.keys(report.errors).length))
  );

// Проба и загрузка — тем же путём, что в менеджере; язык ответа сервера для образца — уже во входе.
const _import = (ctx: Context): Promise<void> =>
  _inputOf(ctx).then(
    pipe(
      (input: unknown) =>
        _withApp(ctx, (app) =>
          ctx.options.dryRun
            ? app.analytics.sets.plan(input, ctx.language)
            : app.analytics.sets.apply(input, ctx.language, null)
        ),
      _reported(ctx)
    )
  );

const _counts = (paint: Paint, say: _Say, set: Record<string, unknown>) =>
  (
    [
      ['sender', set.senders],
      ['dictionary', set.dictionaries],
      ['property', set.properties],
      ['type', set.types],
      ['schema', set.schemas],
      ['referrer', set.referrers],
      ['link', set.links],
      ['milestone', set.milestones],
      ['funnel', set.funnels],
      ['check', set.checks],
    ] as const
  )
    .map(
      ({ 0: group, 1: list }) =>
        [group, Array.isArray(list) ? list.length : 0] as const
    )
    .filter(({ 1: count }) => count > 0)
    .map(({ 0: group, 1: count }) => `${say.groups[group]} ${count}`)
    .join(_dot(paint));

// Имя выгрузки — как у названия элемента: 1–100 знаков; без --name — название сайта и день.
const _name = (ctx: Context): Promise<string | undefined> =>
  ((name) =>
    name === undefined
      ? Promise.resolve(undefined)
      : [...name.trim()].length >= 1 && [...name.trim()].length <= 100
        ? Promise.resolve(name)
        : _reject(_SAY[ctx.language].badName))(ctx.options.name);

// «-» — в вывод: для diff и трубы; файл, который уже есть, не перезаписывается — как у cms backup.
const _export = (ctx: Context): Promise<void> =>
  ((say, target) =>
    target === '-'
      ? _name(ctx).then((name) =>
          _withApp(ctx, (app) =>
            ctx.out(JSON.stringify(app.analytics.sets.export(name), null, 2))
          )
        )
      : resolve(target) === resolve(ctx.options.db)
        ? _reject(say.isDb(target))
        : Bun.file(target)
            .exists()
            .then((exists) =>
              exists ? _reject(say.exists(target)) : _name(ctx)
            )
            .then((name) =>
              _withApp(ctx, (app) => app.analytics.sets.export(name))
            )
            .then((set) =>
              Bun.write(target, `${JSON.stringify(set, null, 2)}\n`).then(() =>
                ctx.out(
                  [
                    `${ctx.paint.ok('✓')} ${say.exported(set.name, ctx.paint.path(target))}`,
                    `  ${_counts(ctx.paint, say, set as unknown as Record<string, unknown>)}`,
                    `  ${ctx.paint.dim(say.notIncluded)}`,
                  ].join('\n')
                )
              )
            ))(
    _SAY[ctx.language],
    ctx.args[1] ??
      `eile-analytics-${new Date().toISOString().slice(0, 10)}.json`
  );

/** Образцы бинарника для человека: код, название, описание и что внутри. */
export var samplesText = (
  paint: Paint,
  language: Language,
  samples: readonly SampleView[]
): string =>
  ((say) =>
    [
      say.samples,
      ...samples.flatMap((_) => [
        '',
        `  ${padEnd(paint.command(_.code), 15)}${paint.bold(_.title)}`,
        `  ${' '.repeat(15)}${_.description}`,
        `  ${' '.repeat(15)}${paint.dim(say.sampleCounts(_.counts))}`,
      ]),
      '',
      say.samplesHint,
    ].join('\n'))(_SAY[language]);

const _samples = (ctx: Context): Promise<void> =>
  _languageOf(ctx).then((language) =>
    ((samples) =>
      ctx.out(
        ctx.options.json
          ? JSON.stringify(samples, null, 2)
          : samplesText(ctx.paint, ctx.language, samples)
      ))(sampleViews(ANALYTICS_SAMPLES, language))
  );

const _ANALYTICS: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  export: _export,
  import: _import,
  samples: _samples,
};

/**
 * `cms analytics export|import|samples`: набор настройки аналитики файлом и образцы из бинарника. События набор не
 * несёт — их загружает `cms events import`.
 */
export var runAnalytics = (ctx: Context): Promise<void> =>
  (Object.hasOwn(_ANALYTICS, ctx.args[0] ?? '')
    ? _ANALYTICS[ctx.args[0]!]!
    : () => _reject(_SAY[ctx.language].noSubcommand(ctx.args[0])))(ctx);
