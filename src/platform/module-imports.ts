import { parse } from 'acorn';
import { pipe } from '../shared/kernel/pipe.ts';

/** Строка в коде от кавычки до кавычки: `start` — открывающая, `end` — за закрывающей. */
type _Span = { readonly start: number; readonly end: number };

/**
 * Путь модуля в коде. `module` — `import … from '…'`, `import '…'`, `export … from '…'`, `import('…')`;
 * `url` — `new URL('…', import.meta.url)`, адрес рядом с модулем (так подключают воркеры).
 */
export type ModulePath = _Span & {
  readonly value: string;
  readonly kind: 'module' | 'url';
};

type _Node = {
  readonly type?: unknown;
  readonly start?: number;
  readonly end?: number;
  readonly value?: unknown;
  readonly name?: unknown;
  readonly computed?: unknown;
  readonly source?: _Node | null;
  readonly callee?: _Node;
  readonly arguments?: readonly _Node[];
  readonly object?: _Node;
  readonly property?: _Node;
  readonly meta?: _Node;
  readonly expressions?: readonly unknown[];
  readonly quasis?: readonly {
    readonly value: { readonly cooked?: unknown };
  }[];
};

type _String = _Span & { readonly value: string };

const _WITH_SOURCE = new Set<unknown>([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
]);

// Строка — литерал или шаблон без подстановок: минификатор пишет и import(`./x.js`).
const _string = (node: _Node | null | undefined): _String | null =>
  node?.type === 'Literal' && typeof node.value === 'string'
    ? { start: node.start!, end: node.end!, value: node.value }
    : node?.type === 'TemplateLiteral' &&
        node.expressions?.length === 0 &&
        typeof node.quasis?.[0]?.value.cooked === 'string'
      ? {
          start: node.start!,
          end: node.end!,
          value: node.quasis[0].value.cooked,
        }
      : null;

const _isMetaUrl = (node: _Node | undefined): boolean =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  node.property?.name === 'url' &&
  node.object?.type === 'MetaProperty' &&
  node.object.meta?.name === 'import' &&
  node.object.property?.name === 'meta';

const _url = (node: _Node): _String | null =>
  node.type === 'NewExpression' &&
  node.callee?.type === 'Identifier' &&
  node.callee.name === 'URL' &&
  _isMetaUrl(node.arguments?.[1])
    ? _string(node.arguments?.[0])
    : null;

const _own = (node: _Node): ModulePath[] =>
  ((module, url) => [
    ...(module ? [{ ...module, kind: 'module' as const }] : []),
    ...(url ? [{ ...url, kind: 'url' as const }] : []),
  ])(_WITH_SOURCE.has(node.type) ? _string(node.source) : null, _url(node));

// Обход всего дерева: `import('…')` бывает и внутри функций.
const _paths = (node: unknown): ModulePath[] =>
  node !== null && typeof node === 'object'
    ? [..._own(node as _Node), ...Object.values(node).flatMap(_paths)]
    : [];

/**
 * Пути модуля по синтаксическому дереву, по порядку в тексте. Текст «import … from '…'» в строках,
 * шаблонах и комментариях путём не считается. Ошибку разбора acorn бросает как есть.
 */
export var modulePaths = (code: string): ModulePath[] =>
  pipe(
    (_: string) => parse(_, { ecmaVersion: 'latest', sourceType: 'module' }),
    _paths,
    (_: ModulePath[]) => _.toSorted((a, b) => a.start - b.start)
  )(code);

/** Код с другими путями на местах `spans` (по порядку в тексте); кавычки остаются свои. */
export var replacePaths = <T extends _Span>(
  code: string,
  spans: readonly T[],
  to: (span: T) => string
): string =>
  ((done) => `${done.text}${code.slice(done.at)}`)(
    spans.reduce(
      ({ text, at }, span) =>
        ((quote) => ({
          text: `${text}${code.slice(at, span.start)}${quote}${to(span)}${quote}`,
          at: span.end,
        }))(code[span.start]),
      { text: '', at: 0 }
    )
  );

/** Переписывает пути импортов модуля — `from '…'`, `import '…'`, `import('…')`; `new URL` не трогает. */
export var rewriteImports =
  (to: (path: string) => string) =>
  (code: string): string =>
    replacePaths(
      code,
      modulePaths(code).filter((_) => _.kind === 'module'),
      (_) => to(_.value)
    );
