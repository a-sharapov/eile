import { relative, resolve } from 'node:path';
import { $, Glob } from 'bun';
import {
  buildClientRuntime,
  CLIENT_RUNTIME_KEY,
} from '../src/contexts/design/index.ts';
import { EMBEDDED_KEY } from '../src/contexts/manager/infrastructure/assets.ts';
import { posixPath } from '../src/platform/paths.ts';
import { PRODUCT } from '../src/product.ts';

// Сборка одного бинарника: SPA менеджера → входной файл, который вшивает её файлы → bun build --compile.
// Общая для `bun run build` (под эту машину) и scripts/release.ts (под платформы релиза).

export var ROOT = resolve(import.meta.dir, '..');
const MANAGER = resolve(ROOT, 'manager/build');
const ENTRY = resolve(ROOT, '.build/entry.ts');

const _import = (file: string, index: number): string =>
  `import f${index} from ${JSON.stringify(posixPath(relative(resolve(ROOT, '.build'), resolve(MANAGER, file))))} with { type: 'file' };`;

const _entry = (
  files: readonly string[],
  runtime: Record<string, string>
): string =>
  [
    ...files.map(_import),
    `(globalThis as Record<string, unknown>)[${JSON.stringify(CLIENT_RUNTIME_KEY)}] = ${JSON.stringify(runtime)};`,
    `(globalThis as Record<string, unknown>)[${JSON.stringify(EMBEDDED_KEY)}] = {`,
    ...files.map(
      (file, index) => `  ${JSON.stringify(`/${file}`)}: f${index},`
    ),
    '};',
    "await import('../src/main.ts');",
    '',
  ].join('\n');

/** Собрать SPA менеджера и входной файл с её файлами и рантаймом островов. Ответ — сколько файлов вшито. */
export var prepareEntry = (): Promise<number> =>
  $`bun run --cwd ${resolve(ROOT, 'manager')} build`
    .then(() =>
      Promise.all([
        // Ключи таблицы — пути SPA через «/»: Glob на Windows отдаёт `_app\immutable\…`.
        Array.from(new Glob('**/*').scanSync(MANAGER))
          .map((_) => posixPath(_))
          .sort(),
        buildClientRuntime(),
      ])
    )
    .then(({ 0: files, 1: runtime }) =>
      Bun.write(ENTRY, _entry(files, runtime)).then(() => files.length)
    );

/** Сведения о cms.exe: значок и вкладка «Подробно» в свойствах файла. Bun вписывает их только на Windows. */
export type WindowsInfo = {
  readonly icon: string;
  /** ProductName. */
  readonly title: string;
  /** FileDescription: его показывает «Диспетчер задач». */
  readonly description: string;
  /** CompanyName. */
  readonly publisher: string;
  /** FileVersion и ProductVersion: четыре числа. */
  readonly version: string;
  readonly copyright: string;
};

/** Версия файла Windows — четыре числа: 0.1.0-alpha.9 → 0.1.0.9, 1.2.3 → 1.2.3.0. Полная — `cms version`. */
export var windowsVersion = (version: string): string =>
  ((match) =>
    match ? `${match[1]}.${match[2]}.${match[3]}.${match[4] ?? 0}` : '0.0.0.0')(
    /^(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z.-]*?(\d+)$)?/i.exec(version)
  );

/** Сведения о cms.exe: значок из favicon (scripts/icon.ts), остальное — из версии и названия продукта. */
export var windowsInfo = (icon: string, version: string): WindowsInfo => ({
  icon,
  title: PRODUCT,
  description: `${PRODUCT} CMS`,
  publisher: `${PRODUCT} contributors`,
  version: windowsVersion(version),
  copyright: `© ${new Date().getUTCFullYear()} ${PRODUCT} contributors, GPL-3.0-or-later`,
});

const _windowsFlags = (info: WindowsInfo): string[] => [
  `--windows-icon=${info.icon}`,
  `--windows-title=${info.title}`,
  `--windows-description=${info.description}`,
  `--windows-publisher=${info.publisher}`,
  `--windows-version=${info.version}`,
  `--windows-copyright=${info.copyright}`,
];

/**
 * Бинарник из входного файла: под эту машину или под `target` другой платформы (`bun-linux-arm64`…).
 * Код вшит байткодом JavaScriptCore: команды и сервер стартуют быстрее, бинарник на 6 МБ больше (ADR 0023).
 * Байткод без --format=esm собирается как CommonJS, а входной файл ждёт main.ts через await верхнего уровня.
 * `windows` — значок и сведения о файле для сборки под Windows на самой Windows (ADR 0049).
 */
export var compile = (
  outfile: string,
  target?: string,
  windows?: WindowsInfo
): Promise<unknown> =>
  $`bun build --compile --minify --bytecode --format=esm ${target ? [`--target=${target}`] : []} ${windows ? _windowsFlags(windows) : []} --define process.env.NODE_ENV='"production"' ${ENTRY} --outfile ${outfile}`.quiet();
