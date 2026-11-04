import { attempt } from '../shared/kernel/errors.ts';
import { phpField, unserialize } from './php.ts';
import { metaOf, type WpSite } from './source.ts';

/** Пункт меню WordPress: запись, рубрика или свой адрес. */
export type MenuItem = {
  readonly key: string;
  /** Ключ пункта-родителя в меню; null — верхний уровень. */
  readonly parent: string | null;
  readonly title: string;
  readonly target:
    | { readonly kind: 'post'; readonly id: number }
    | { readonly kind: 'term'; readonly id: number; readonly taxonomy: string }
    | { readonly kind: 'url'; readonly url: string };
};

/** Главное меню сайта: пункты по порядку, сверху вниз. */
export type Menu = {
  readonly name: string;
  readonly items: readonly MenuItem[];
};

// Места меню в темах: первое найденное — главное.
const _LOCATIONS = [
  'primary',
  'main',
  'main-menu',
  'main_menu',
  'header',
  'header-menu',
  'menu-1',
  'top',
  'navigation',
];

const _classic = (site: WpSite): Menu | null => {
  const menus = site.terms.filter((_) => _.taxonomy === 'nav_menu');
  const items = site.posts.filter(
    (_) => _.type === 'nav_menu_item' && _.status === 'publish'
  );
  const theme = [...site.options]
    .filter(({ 0: name }) => name.startsWith('theme_mods_'))
    .map(({ 1: value }) => phpField(unserialize(value), 'nav_menu_locations'))
    .find((_) => _ !== null && typeof _ === 'object');
  const located =
    theme && typeof theme === 'object'
      ? [..._LOCATIONS, ...Object.keys(theme)]
          .map((_) => Number((theme as Record<string, unknown>)[_] ?? 0))
          .find((id) => menus.some((_) => _.id === id))
      : undefined;
  const sizeOf = (id: number) =>
    items.filter((_) => _.terms.includes(id)).length;
  const menu =
    menus.find((_) => _.id === located) ??
    menus.toSorted((a, b) => sizeOf(b.id) - sizeOf(a.id))[0];
  return menu
    ? {
        name: menu.name,
        items: items
          .filter((_) => _.terms.includes(menu.id))
          .toSorted((a, b) => a.menuOrder - b.menuOrder)
          .map((item): MenuItem => {
            const type = metaOf(item, '_menu_item_type');
            const id = Number(metaOf(item, '_menu_item_object_id') || 0);
            const parent = metaOf(item, '_menu_item_menu_item_parent');
            return {
              key: String(item.id),
              parent: parent && parent !== '0' ? parent : null,
              title: item.title,
              target:
                type === 'post_type'
                  ? { kind: 'post', id }
                  : type === 'taxonomy'
                    ? {
                        kind: 'term',
                        id,
                        taxonomy: metaOf(item, '_menu_item_object'),
                      }
                    : { kind: 'url', url: metaOf(item, '_menu_item_url') },
            };
          }),
      }
    : null;
};

const _LINK =
  /<!--\s+(\/)?wp:(navigation-link|navigation-submenu|home-link|page-list)\s+(\{[\s\S]*?\}\s+)?(\/)?-->/g;

// Меню блочной темы — запись wp_navigation: пункты `navigation-link`, подменю `navigation-submenu`.
const _block = (site: WpSite): Menu | null => {
  const navigation = site.posts
    .filter((_) => _.type === 'wp_navigation' && _.status === 'publish')
    .toSorted((a, b) => b.id - a.id)[0];
  const walk = (content: string) =>
    [...content.matchAll(_LINK)].reduce<{ stack: string[]; items: MenuItem[] }>(
      (acc, match, index) => {
        const closing = match[1] === '/';
        const attrs = attempt(
          () => JSON.parse(match[3]?.trim() || '{}') as Record<string, unknown>,
          () => ({}) as Record<string, unknown>
        );
        const key = `n${index}`;
        const item: MenuItem | null =
          match[2] === 'page-list' || closing
            ? null
            : {
                key,
                parent: acc.stack.at(-1) ?? null,
                title: typeof attrs.label === 'string' ? attrs.label : '',
                target:
                  typeof attrs.id === 'number' &&
                  (attrs.kind === 'post-type' ||
                    attrs.type === 'page' ||
                    attrs.type === 'post')
                    ? { kind: 'post', id: attrs.id }
                    : typeof attrs.id === 'number' && attrs.kind === 'taxonomy'
                      ? {
                          kind: 'term',
                          id: attrs.id,
                          taxonomy: String(attrs.type ?? 'category'),
                        }
                      : {
                          kind: 'url',
                          url:
                            typeof attrs.url === 'string'
                              ? attrs.url
                              : match[2] === 'home-link'
                                ? '/'
                                : '',
                        },
              };
        return {
          stack:
            match[2] === 'navigation-submenu'
              ? closing
                ? acc.stack.slice(0, -1)
                : match[4]
                  ? acc.stack
                  : [...acc.stack, key]
              : acc.stack,
          items: item ? [...acc.items, item] : acc.items,
        };
      },
      { stack: [], items: [] }
    ).items;
  return navigation
    ? ((items) =>
        items.length > 0 ? { name: navigation.title, items } : null)(
        walk(navigation.content)
      )
    : null;
};

/** Главное меню: классическое из места темы (или самое длинное), иначе меню блочной темы; null — меню нет. */
export var mainMenu = (site: WpSite): Menu | null =>
  _classic(site) ?? _block(site);
