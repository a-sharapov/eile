/**
 * Стиль адресов сайта (ADR 0063): чем кончается адрес страницы. По умолчанию — ничем: `/blog/post`.
 * Сайт Evo переносится со своим: `/katalog/` у папок и `/o-nas.html` у остальных.
 */
export type AddressStyle = {
  /** Окончание документа: пусто, `/` или расширение вроде `.html`; алиас с точкой его не получает. */
  readonly suffix: string;
  /** Адрес папки кончается на `/`, как `make_folders` в Evo. */
  readonly folderSlash: boolean;
};

export var PLAIN_ADDRESS: AddressStyle = { suffix: '', folderSlash: false };

/** Что о странице нужно адресу: алиас, флаги папки и алиаса в адресе. */
export type AddressNode = {
  readonly id: number;
  readonly parentId: number | null;
  readonly alias: string;
  readonly folder: boolean;
  readonly aliasInPath: boolean;
};

/** Адрес страницы: ключ (путь без окончания) и сам адрес. */
export type Address = {
  readonly id: number;
  readonly key: string;
  readonly url: string;
};

/** `/` у папки, суффикс у документа, у алиаса с точкой (`sitemap.xml`) — пусто. */
export var addressEnding = (
  page: { readonly alias: string; readonly folder: boolean },
  style: AddressStyle
): string =>
  page.folder && style.folderSlash
    ? '/'
    : page.alias.includes('.')
      ? ''
      : style.suffix;

const _withoutSlash = (path: string): string =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

/**
 * Ключ адреса из пути запроса: без одного завершающего `/` и без суффикса — `/katalog/` → `/katalog`,
 * `/o-nas.html` → `/o-nas`. По нему находится страница, к чьему адресу путь — вариант.
 */
export var addressKey = (path: string, style: AddressStyle): string =>
  ((bare) =>
    style.suffix.length > 1 &&
    bare.endsWith(style.suffix) &&
    bare.length > style.suffix.length + 1 &&
    !bare.endsWith(`/${style.suffix}`)
      ? bare.slice(0, -style.suffix.length)
      : bare)(_withoutSlash(path));

/** Пути, которыми мог быть записан тот же адрес: как есть, без `/`, без окончания, с `/` и с суффиксом. */
export var addressVariants = (path: string, style: AddressStyle): string[] =>
  ((key) => [
    ...new Set([
      path,
      _withoutSlash(path),
      key,
      ...(key === '/' ? [] : [`${key}/`]),
      ...(style.suffix && key !== '/' ? [`${key}${style.suffix}`] : []),
    ]),
  ])(addressKey(path, style));

/** Начало адреса детей: путь страницы, если её алиас в адресе, иначе — то же, что у неё самой. */
export var childTrail = (trail: string, node: AddressNode): string =>
  node.aliasInPath ? `${trail}/${node.alias}` : trail;

/** Адрес страницы, чьи предки дают начало `trail`. */
export var addressOf = (
  trail: string,
  node: AddressNode,
  style: AddressStyle
): Address =>
  ((key) => ({
    id: node.id,
    key,
    url: `${key}${addressEnding(node, style)}`,
  }))(`${trail}/${node.alias}`);

/** Адреса ветки: корень с началом `trail` и его потомки — в порядке обхода. */
export var branchAddresses = (
  root: AddressNode,
  descendants: readonly AddressNode[],
  trail: string,
  style: AddressStyle
): Address[] => {
  const childrenOf = descendants.reduce(
    (all, node) =>
      all.set(node.parentId, [...(all.get(node.parentId) ?? []), node]),
    new Map<number | null, AddressNode[]>()
  );
  const walk = (node: AddressNode, at: string): Address[] => [
    addressOf(at, node, style),
    ...(childrenOf.get(node.id) ?? []).flatMap((_) =>
      walk(_, childTrail(at, node))
    ),
  ];
  return walk(root, trail);
};

/**
 * Алиасы, чьи адреса могут совпасть с адресом страницы с этим алиасом: тот же, с суффиксом и без него
 * (`o-nas` с `.html` и страница с алиасом `o-nas.html` живут по одному адресу).
 */
export var rivalAliases = (alias: string, style: AddressStyle): string[] =>
  style.suffix.startsWith('.')
    ? [
        ...new Set([
          alias,
          `${alias}${style.suffix}`,
          ...(alias.endsWith(style.suffix)
            ? [alias.slice(0, -style.suffix.length)]
            : []),
        ]),
      ].filter(Boolean)
    : [alias];

/** Первое совпадение ключа или адреса: среди своих и со страницами вне их; null — адреса свободны. */
export var addressClash = (
  mine: readonly Address[],
  others: readonly Address[]
): {
  readonly page: number;
  readonly url: string;
  readonly other: number;
} | null =>
  mine.reduce<{ page: number; url: string; other: number } | null>(
    (found, address, index) =>
      found ??
      ((rival) =>
        rival ? { page: address.id, url: address.url, other: rival.id } : null)(
        [...mine.slice(0, index), ...others].find(
          (_) =>
            _.id !== address.id &&
            (_.key === address.key || _.url === address.url)
        )
      ),
    null
  );
