import { parse } from 'acorn';
import { type AST, parseCss } from 'svelte/compiler';
import { attempt } from '../../../shared/kernel/errors.ts';

/** CSS вида так, как его выводит Svelte в `<style id>`: сжатый, с классом области `svelte-…`. */
export type ViewStyle = {
  /** Класс области: `svelte-1abc`; Svelte считает его по имени файла. */
  readonly hash: string;
  readonly code: string;
};

type _Node = {
  readonly type?: unknown;
  readonly value?: unknown;
  readonly name?: unknown;
  readonly key?: _Node;
  readonly id?: _Node;
  readonly init?: _Node | null;
  /** Свойства объекта: значение — узел-литерал. */
  readonly properties?: readonly (_Node & { readonly value?: _Node })[];
  readonly declarations?: readonly _Node[];
};

// Svelte кладёт стиль компонента в константу модуля и добавляет её в head на каждом рендере.
const _STYLE_CONSTANT = '$$css';

const _field = (object: _Node, name: string): string | null =>
  ((value) => (typeof value === 'string' ? value : null))(
    object.properties?.find((_) => _.key?.name === name)?.value?.value
  );

// Пустой `<style>` — не стиль: в файл и в страницу выводить нечего.
const _styleOf = (init: _Node | null | undefined): ViewStyle | null =>
  ((hash, code) => (hash !== null && code ? { hash, code } : null))(
    init?.type === 'ObjectExpression' ? _field(init, 'hash') : null,
    init?.type === 'ObjectExpression' ? _field(init, 'code') : null
  );

/**
 * Стиль из серверного модуля Svelte (`css: 'injected'`) — по синтаксическому дереву, а не по тексту: та же
 * строка в коде компонента за стиль не сойдёт. Нет константы или CSS пуст — null.
 */
export var liftStyle = (code: string): ViewStyle | null =>
  code.includes(_STYLE_CONSTANT)
    ? _styleOf(
        (
          parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
            .body as readonly _Node[]
        )
          .filter((_) => _.type === 'VariableDeclaration')
          .flatMap((_) => _.declarations ?? [])
          .find((_) => _.id?.name === _STYLE_CONSTANT)?.init
      )
    : null;

// Внутри этих at-правил — обычные правила: проверяем их. Остальные (@font-face, @property, @import,
// @layer без блока) действуют на весь документ.
const _GROUPS = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'starting-style',
]);

type _CssNode = AST.CSS.Rule | AST.CSS.Atrule | AST.CSS.Declaration;

const _scopedIn =
  (style: ViewStyle, own: RegExp) =>
  (node: _CssNode): boolean =>
    node.type === 'Rule'
      ? node.prelude.children.every((_) =>
          own.test(style.code.slice(_.start, _.end))
        )
      : node.type === 'Atrule'
        ? node.name.endsWith('keyframes')
          ? node.prelude.startsWith(`${style.hash}-`)
          : _GROUPS.has(node.name) &&
            (node.block?.children.every(_scopedIn(style, own)) ?? false)
        : false;

/**
 * Каждое правило привязано к своему компоненту: в каждом селекторе есть класс области (вложенные правила
 * привязаны через родителя), анимации — с именем области. Такой CSS действует только там, где компонент
 * нарисован, и годится в общий файл сайта. `:global(body)`, `@font-face`, `@import` — нет: им нужен свой
 * файл, который подключают только страницы с этим компонентом.
 */
export var isScoped = (style: ViewStyle): boolean =>
  attempt(
    () =>
      parseCss(style.code).children.every(
        _scopedIn(style, new RegExp(`\\.${style.hash}(?![\\w-])`))
      ),
    () => false
  );
