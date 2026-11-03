import { relative, resolve } from 'node:path';
import { $, Glob } from 'bun';
import {
  buildClientRuntime,
  CLIENT_RUNTIME_KEY,
} from '../src/contexts/design/index.ts';
import { EMBEDDED_KEY } from '../src/contexts/manager/infrastructure/assets.ts';

// Сборка одного бинарника: SPA менеджера → входной файл, который вшивает её файлы → bun build --compile.
// Общая для `bun run build` (под эту машину) и scripts/release.ts (под платформы релиза).

export var ROOT = resolve(import.meta.dir, '..');
const MANAGER = resolve(ROOT, 'manager/build');
const ENTRY = resolve(ROOT, '.build/entry.ts');

const _import = (file: string, index: number): string =>
  `import f${index} from ${JSON.stringify(relative(resolve(ROOT, '.build'), resolve(MANAGER, file)))} with { type: 'file' };`;

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
        Array.from(new Glob('**/*').scanSync(MANAGER)).sort(),
        buildClientRuntime(),
      ])
    )
    .then(({ 0: files, 1: runtime }) =>
      Bun.write(ENTRY, _entry(files, runtime)).then(() => files.length)
    );

/**
 * Бинарник из входного файла: под эту машину или под `target` другой платформы (`bun-linux-arm64`…).
 * Код вшит байткодом JavaScriptCore: команды и сервер стартуют быстрее, бинарник на 6 МБ больше (ADR 0023).
 * Байткод без --format=esm собирается как CommonJS, а входной файл ждёт main.ts через await верхнего уровня.
 */
export var compile = (outfile: string, target?: string): Promise<unknown> =>
  $`bun build --compile --minify --bytecode --format=esm ${target ? [`--target=${target}`] : []} --define process.env.NODE_ENV='"production"' ${ENTRY} --outfile ${outfile}`.quiet();
