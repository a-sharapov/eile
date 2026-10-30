import { parse } from 'svelte/compiler';
import { attempt } from '../../../shared/kernel/errors.ts';
import type { Element } from '../domain/element.ts';
import type {
  ComponentSignature,
  PropOption,
  PropSignature,
  PropType,
  PropValue,
} from '../domain/signature.ts';

// Узлы ESTree из парсера Svelte: берём только то, что читаем.
type Node = { readonly type: string; readonly [key: string]: any };

const _DOC = /^\s*@component\s*/;

// Параметры, которые нельзя передать из текста страницы.
const _SKIPPED = new Set(['children']);

const _TS_TYPES: Readonly<Record<string, PropType>> = {
  TSStringKeyword: 'string',
  TSNumberKeyword: 'number',
  TSBooleanKeyword: 'boolean',
};

const _VALUE_TYPES: Readonly<Record<string, PropType>> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
};

// `number | null`, `'info' | 'warning'`: null и undefined не меняют тип параметра.
const _NULLISH = new Set(['TSNullKeyword', 'TSUndefinedKeyword']);

const _members = (type: Node | undefined): Node[] =>
  type?.type === 'TSUnionType'
    ? type.types.filter((_: Node) => !_NULLISH.has(_.type))
    : type
      ? [type]
      : [];

const _values = (members: readonly Node[]): string[] =>
  members.length > 0 &&
  members.every(
    (_) => _.type === 'TSLiteralType' && typeof _.literal?.value === 'string'
  )
    ? members.map((_) => _.literal.value)
    : [];

const _annotatedType = (members: readonly Node[]): PropType | undefined =>
  _values(members).length > 0
    ? 'string'
    : members.length === 1
      ? _TS_TYPES[members[0]!.type]
      : undefined;

const _literal = (node: Node | undefined): PropValue | null | undefined =>
  node?.type === 'Literal'
    ? node.value
    : node?.type === 'UnaryExpression' &&
        node.operator === '-' &&
        typeof node.argument?.value === 'number'
      ? -node.argument.value
      : undefined;

const _comment = (property: Node): string =>
  (property.leadingComments ?? [])
    .map((_: Node) => String(_.value).replace(/^\*+/, '').trim())
    .find(Boolean) ?? '';

// «Оттенок: note=Заметка, warning=Внимание» — подпись и подписи вариантов.
const _LABELLED = /^(.*?):\s*([\w-]+=[^,]+(?:,\s*[\w-]+=[^,]+)*)$/;

const _described = (
  comment: string
): { readonly label: string; readonly labels: ReadonlyMap<string, string> } =>
  ((match) =>
    match
      ? {
          label: match[1]!.trim(),
          labels: new Map(
            match[2]!
              .split(',')
              .map((_) => _.split('=').map((part) => part.trim()))
              .map(({ 0: value, 1: label }) => [value!, label!] as const)
          ),
        }
      : { label: comment, labels: new Map() })(_LABELLED.exec(comment));

const _annotations = (pattern: Node): ReadonlyMap<string, Node> =>
  new Map(
    (pattern.typeAnnotation?.typeAnnotation?.members ?? [])
      .filter((_: Node) => _.key?.type === 'Identifier')
      .map((_: Node) => [_.key.name, _] as const)
  );

const _prop =
  (annotations: ReadonlyMap<string, Node>) =>
  (property: Node): PropSignature | null => {
    const name: string = property.key?.name ?? '';
    const fallback = property.value?.type === 'AssignmentPattern';
    const value = fallback ? _literal(property.value.right) : null;
    const annotation = annotations.get(name);
    const { label, labels } = _described(_comment(property));
    const members = _members(annotation?.typeAnnotation?.typeAnnotation);
    const type =
      _annotatedType(members) ??
      _VALUE_TYPES[typeof value] ??
      (value === null ? 'string' : undefined);
    return property.type !== 'Property' ||
      !name ||
      _SKIPPED.has(name) ||
      value === undefined ||
      type === undefined
      ? null
      : {
          name,
          type,
          label: label || name,
          defaultValue: value,
          required: !fallback && !annotation?.optional,
          options: _values(members).map(
            (value): PropOption => ({
              value,
              label: labels.get(value) ?? value,
            })
          ),
        };
  };

const _isProps = (declarator: Node): boolean =>
  declarator.init?.type === 'CallExpression' &&
  declarator.init.callee?.name === '$props' &&
  declarator.id?.type === 'ObjectPattern';

const _props = (program: Node | undefined): PropSignature[] =>
  (program?.body ?? [])
    .filter((_: Node) => _.type === 'VariableDeclaration')
    .flatMap((_: Node) => _.declarations)
    .filter(_isProps)
    .flatMap((_: Node) => _.id.properties.map(_prop(_annotations(_.id))))
    .filter((_: PropSignature | null) => _ !== null);

const _description = (fragment: Node): string =>
  (fragment.nodes ?? [])
    .filter((_: Node) => _.type === 'Comment' && _DOC.test(_.data))
    .map((_: Node) => String(_.data).replace(_DOC, '').trim())
    .at(0) ?? '';

/** Сигнатура по исходнику: `<!-- @component -->` и деструктуризация `$props()`. */
export var describeComponent = ({
  name,
  source,
}: Pick<Element, 'name' | 'source'>): ComponentSignature =>
  attempt(
    () => {
      const ast = parse(source, { modern: true }) as unknown as Node;
      return {
        name,
        description: _description(ast.fragment),
        props: _props(ast.instance?.content),
      };
    },
    () => ({ name, description: '', props: [] })
  );
