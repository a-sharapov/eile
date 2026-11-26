import { createApp } from '../app.ts';
import {
  IMPORT_LIMITS,
  type ImportReport,
} from '../contexts/analytics/index.ts';
import { pipe } from '../shared/kernel/pipe.ts';
import { type Context, cliError } from './context.ts';
import type { Language } from './language.ts';
import { type Paint, padEnd } from './paint.ts';

const _SAY = {
  ru: {
    needFile:
      'Нужен файл событий JSON Lines — cms events import <файл> --db site.db',
    noFile: (file: string) => `Нет файла ${file}.`,
    noDb: (db: string) =>
      `Нет базы ${db}. Укажите файл: --db site.db (новую создаёт cms serve).`,
    noSubcommand: (name: string | undefined) =>
      name === undefined
        ? 'Нужна подкоманда: cms events import <файл> --db site.db'
        : `Нет подкоманды events ${name}. Есть: import — cms help events`,
    done: (db: string, sender: string) =>
      `Загружено в ${db}, отправитель ${sender}:`,
    dry: (db: string, sender: string) =>
      `Проверка для ${db}, отправитель ${sender} — база не изменена:`,
    lines: 'Строк',
    empty: (n: number) => `пустых ${n}`,
    accepted: 'Принято',
    toAccept: 'Будет принято',
    repeats: 'Повторы',
    same: (n: number) => `то же тело ${n}`,
    other: (n: number) => `другое тело ${n} — конфликт`,
    erasures: 'Удаления',
    erased: 'Стёрто',
    erasedNote: 'человек стёрт раньше, событие не хранится',
    rejected: 'Отклонено',
    people: 'Людей',
    manyPeople: (n: number) => `больше ${n}`,
    warnings: 'Предупреждения',
    warning: {
      unknown_type: 'незнакомый тип',
      future: 'из будущего',
      invalid_value: 'негодное значение',
      unknown_value: 'не из справочника',
    } as Readonly<Record<string, string>>,
    errors: (n: number) => `Строки с ошибками — ${n}, они пропущены:`,
    more: (n: number) => `… показаны первые ${n} ошибок`,
    again: 'Загрузить по-настоящему — та же команда без --dry-run.',
    fix: 'Исправьте строки и загрузите файл снова: принятые события повтор не задвоит.',
    failed: (n: number) => `Строк с ошибками: ${n} — они не загружены.`,
    failedDry: (n: number) => `Строк с ошибками: ${n} — загрузка их пропустит.`,
  },
  en: {
    needFile:
      'A JSON Lines file of events is needed: cms events import <file> --db site.db',
    noFile: (file: string) => `No file ${file}.`,
    noDb: (db: string) =>
      `No database ${db}. Name the file: --db site.db (cms serve creates a new one).`,
    noSubcommand: (name: string | undefined) =>
      name === undefined
        ? 'A subcommand is needed: cms events import <file> --db site.db'
        : `No subcommand events ${name}. There is import: cms help events`,
    done: (db: string, sender: string) =>
      `Imported into ${db}, sender ${sender}:`,
    dry: (db: string, sender: string) =>
      `Check for ${db}, sender ${sender} — the database is unchanged:`,
    lines: 'Lines',
    empty: (n: number) => `empty ${n}`,
    accepted: 'Accepted',
    toAccept: 'To accept',
    repeats: 'Repeats',
    same: (n: number) => `same body ${n}`,
    other: (n: number) => `other body ${n}, a conflict`,
    erasures: 'Erasures',
    erased: 'Erased',
    erasedNote: 'the person was erased before: the event is not stored',
    rejected: 'Rejected',
    people: 'People',
    manyPeople: (n: number) => `over ${n}`,
    warnings: 'Warnings',
    warning: {
      unknown_type: 'unknown type',
      future: 'from the future',
      invalid_value: 'invalid value',
      unknown_value: 'not in the dictionary',
    } as Readonly<Record<string, string>>,
    errors: (n: number) => `Lines with errors — ${n}, skipped:`,
    more: (n: number) => `… the first ${n} errors shown`,
    again: 'To import for real, run the same command without --dry-run.',
    fix: 'Fix the lines and import the file again: repeats do not double accepted events.',
    failed: (n: number) => `Lines with errors: ${n} — they were not imported.`,
    failedDry: (n: number) =>
      `Lines with errors: ${n} — the import will skip them.`,
  },
} satisfies Record<Language, unknown>;

type _Say = (typeof _SAY)['ru'];

const _row = (paint: Paint, label: string, value: string): string =>
  `  ${padEnd(paint.dim(label), 15)}${value}`;

// Вид предупреждения — до двоеточия, за ним путь поля: `invalid_value:data.<код>`.
const _warning = (say: _Say, warning: string, count: number): string =>
  ((at) =>
    ((kind, path) => `${say.warning[kind] ?? kind}${path} ×${count}`)(
      at === -1 ? warning : warning.slice(0, at),
      at === -1 ? '' : ` ${warning.slice(at + 1)}`
    ))(warning.indexOf(':'));

/** Итог загрузки для человека: счёты, предупреждения, ошибки строк как `файл:строка: поле — причина`. */
export var importText = (
  paint: Paint,
  language: Language,
  { db, file }: { readonly db: string; readonly file: string },
  report: ImportReport
): string =>
  ((say, dot) =>
    [
      `${report.rejected > 0 ? paint.warn('!') : paint.ok('✓')} ${report.dryRun ? say.dry(db, report.sender) : say.done(db, report.sender)}`,
      _row(
        paint,
        say.lines,
        [
          String(report.lines),
          ...(report.empty > 0 ? [say.empty(report.empty)] : []),
        ].join(dot)
      ),
      _row(
        paint,
        report.dryRun ? say.toAccept : say.accepted,
        String(report.accepted)
      ),
      ...(report.duplicates + report.conflicts > 0
        ? [
            _row(
              paint,
              say.repeats,
              [
                ...(report.duplicates > 0 ? [say.same(report.duplicates)] : []),
                ...(report.conflicts > 0
                  ? [paint.warn(say.other(report.conflicts))]
                  : []),
              ].join(dot)
            ),
          ]
        : []),
      ...(report.erasures > 0
        ? [_row(paint, say.erasures, String(report.erasures))]
        : []),
      ...(report.erased > 0
        ? [
            _row(
              paint,
              say.erased,
              `${report.erased}${dot}${paint.dim(say.erasedNote)}`
            ),
          ]
        : []),
      ...(report.rejected > 0
        ? [_row(paint, say.rejected, paint.error(String(report.rejected)))]
        : []),
      _row(
        paint,
        say.people,
        report.people === null
          ? say.manyPeople(IMPORT_LIMITS.people)
          : String(report.people)
      ),
      ...(Object.keys(report.warnings).length > 0
        ? [
            _row(
              paint,
              say.warnings,
              Object.entries(report.warnings)
                .toSorted((a, b) => b[1] - a[1])
                .map(({ 0: warning, 1: count }) =>
                  _warning(say, warning, count)
                )
                .join(dot)
            ),
          ]
        : []),
      ...(report.rejected > 0
        ? [
            '',
            paint.warn(say.errors(report.rejected)),
            ...report.errors.map(
              (_) =>
                `  ${paint.error('✗')} ${paint.path(`${file}:${_.line}`)}: ${_.path} — ${_.message}`
            ),
            ...(report.errors.length >= IMPORT_LIMITS.errors
              ? [`  ${paint.dim(say.more(IMPORT_LIMITS.errors))}`]
              : []),
          ]
        : []),
      ...(report.dryRun
        ? ['', say.again]
        : report.rejected > 0
          ? ['', say.fix]
          : []),
    ].join('\n'))(_SAY[language], paint.dim(' · '));

// Отклонённые строки — код выхода 1 и после загрузки, и после проверки: скрипт видит, что файл не чист.
const _reported =
  (ctx: Context, file: string) =>
  (report: ImportReport): Promise<void> => (
    ctx.out(
      ctx.options.json
        ? JSON.stringify(report, null, 2)
        : importText(
            ctx.paint,
            ctx.language,
            { db: ctx.options.db, file },
            report
          )
    ),
    report.rejected === 0
      ? Promise.resolve()
      : Promise.reject(
          cliError(
            (report.dryRun
              ? _SAY[ctx.language].failedDry
              : _SAY[ctx.language].failed)(report.rejected)
          )
        )
  );

const _exists = (path: string, missing: string): Promise<string> =>
  Bun.file(path)
    .exists()
    .then((exists) => (exists ? path : Promise.reject(cliError(missing))));

const _load = (ctx: Context, db: string, file: string): Promise<ImportReport> =>
  ((app) =>
    app.analytics.events
      .import(file, {
        sender: ctx.options.sender ?? null,
        dryRun: ctx.options.dryRun === true,
      })
      .finally(() => app.close()))(
    createApp({
      databasePath: db,
      ...(ctx.options.mediaCache ? { mediaCache: ctx.options.mediaCache } : {}),
    })
  );

const _import = (ctx: Context): Promise<void> =>
  ((say, file) =>
    file === undefined
      ? Promise.reject(cliError(say.needFile))
      : _exists(file, say.noFile(file)).then(
          pipe(
            () => _exists(ctx.options.db, say.noDb(ctx.options.db)),
            (db) => _load(ctx, db, file),
            _reported(ctx, file)
          )
        ))(_SAY[ctx.language], ctx.args[1]);

const _EVENTS: Readonly<Record<string, (ctx: Context) => Promise<void>>> = {
  import: _import,
};

/** `cms events import <файл>`: история событий аналитики из файла JSON Lines тем же приёмом, что у HTTP. */
export var runEvents = (ctx: Context): Promise<void> =>
  (
    _EVENTS[ctx.args[0] ?? ''] ??
    (() =>
      Promise.reject(cliError(_SAY[ctx.language].noSubcommand(ctx.args[0]))))
  )(ctx);
