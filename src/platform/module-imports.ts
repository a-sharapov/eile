import { parse } from 'acorn';
import { pipe } from '../shared/kernel/pipe.ts';

type _Path = {
  readonly start: number;
  readonly end: number;
  readonly value: string;
};

type _Node = {
  readonly type?: unknown;
  readonly source?: {
    readonly type: string;
    readonly start: number;
    readonly end: number;
    readonly value?: unknown;
  } | null;
};

const _WITH_SOURCE = new Set<unknown>([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
]);

const _own = ({ type, source }: _Node): _Path[] =>
  _WITH_SOURCE.has(type) &&
  source?.type === 'Literal' &&
  typeof source.value === 'string'
    ? [{ start: source.start, end: source.end, value: source.value }]
    : [];

// Обход всего дерева: `import('…')` бывает и внутри функций.
const _paths = (node: unknown): _Path[] =>
  node !== null && typeof node === 'object'
    ? [..._own(node as _Node), ...Object.values(node).flatMap(_paths)]
    : [];

/**
 * Переписывает пути импортов модуля — `from '…'`, `import '…'`, `import('…')`; кавычки остаются свои.
 * Путь берётся из синтаксического дерева: текст «import … from '…'» в строках и шаблонах не трогается.
 */
export var rewriteImports =
  (to: (path: string) => string) =>
  (code: string): string =>
    pipe(
      (_: string) => parse(_, { ecmaVersion: 'latest', sourceType: 'module' }),
      _paths,
      (_: _Path[]) => _.toSorted((a, b) => a.start - b.start),
      (_: _Path[]) =>
        _.reduce(
          ({ text, at }, path) =>
            ((quote) => ({
              text: `${text}${code.slice(at, path.start)}${quote}${to(path.value)}${quote}`,
              at: path.end,
            }))(code[path.start]),
          { text: '', at: 0 }
        ),
      ({ text, at }: { text: string; at: number }) => `${text}${code.slice(at)}`
    )(code);
