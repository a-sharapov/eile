import type {
  ContentService,
  CreatePageInput,
  NewField,
} from '../contexts/content/index.ts';
import type { DesignService } from '../contexts/design/index.ts';
import type { FormInput, FormsService } from '../contexts/forms/index.ts';
import type { SiteService } from '../contexts/site/index.ts';
import { kitClosure } from '../kit/index.ts';
import { fail } from '../shared/kernel/errors.ts';

/**
 * Страница каркаса. `key` — её имя для ссылок `@{key}`: в тексте страниц и в своих настройках сайта
 * оно становится id, так что `[~@{contacts}~]` и `[[PostList parent=@{blog}]]` ведут куда нужно.
 */
export type ScaffoldPage = Omit<
  CreatePageInput,
  'parentId' | 'menuIndex' | 'publish' | 'fields'
> & {
  readonly key?: string;
  readonly fields?: CreatePageInput['fields'];
  readonly children?: readonly ScaffoldPage[];
};

/** Каркас сайта: элементы, поля, формы, свои настройки и дерево страниц — всё, с чем сайт стартует. */
export type Scaffold = {
  /** Имя в команде: `cms new blog`. */
  readonly name: string;
  readonly title: string;
  /** Одной строкой — что внутри; видно в справке. */
  readonly summary: string;
  /** Название сайта, если в команде не задано своё. */
  readonly siteName: string;
  /** Язык сайта; по умолчанию ru. */
  readonly language?: string;
  readonly description?: string;
  /** Компоненты из набора; их зависимости ставятся сами. */
  readonly kit?: readonly string[];
  /** Свои компоненты: зависимости — раньше зависящих. */
  readonly components?: Readonly<Record<string, string>>;
  readonly templates: Readonly<Record<string, string>>;
  readonly fields?: readonly NewField[];
  readonly forms?: Readonly<Record<string, FormInput>>;
  /** Свои настройки сайта; `@{key}` в значении — id страницы. */
  readonly settings?: Readonly<Record<string, string>>;
  readonly pages: readonly ScaffoldPage[];
  /** Ключи главной и страницы 404. */
  readonly home: string;
  readonly notFound?: string;
};

export type ScaffoldServices = {
  readonly content: ContentService;
  readonly design: DesignService;
  readonly site: SiteService;
  readonly forms: FormsService;
};

export type ScaffoldReport = {
  readonly pages: number;
  readonly templates: number;
  readonly components: number;
  readonly fields: number;
  readonly forms: number;
};

const _REF = /@\{([a-z][a-z0-9-]*)\}/g;

const _resolve =
  (ids: ReadonlyMap<string, number>) =>
  (text: string): string =>
    text.replace(_REF, (_, key: string) =>
      String(
        ids.get(key) ??
          fail('scaffold.unknown_page', `No scaffold page with key "${key}"`)
      )
    );

type Planted = { readonly id: number; readonly page: ScaffoldPage };

// Сверху вниз: родитель раньше детей, порядок в меню — как в каркасе. Текст — вторым проходом, когда
// известны id всех страниц.
const _plant = (
  content: ContentService,
  parentId: number | null,
  pages: readonly ScaffoldPage[]
): Planted[] =>
  pages.flatMap((page, menuIndex) => {
    const { key, children, content: _text, ...input } = page;
    const id = content.pages.create({
      ...input,
      parentId,
      menuIndex,
      publish: true,
    });
    return [{ id, page }, ..._plant(content, id, children ?? [])];
  });

/** Разворачивает каркас на пустой сайт; `siteName` — своё название вместо названия каркаса. */
export var applyScaffold = (
  scaffold: Scaffold,
  { content, design, site, forms }: ScaffoldServices,
  siteName?: string
): ScaffoldReport => {
  // Набор — на языке каркаса: английский сайт получает английские подписи компонентов.
  const kit = [
    ...new Map(
      (scaffold.kit ?? [])
        .flatMap((_) => kitClosure(_, scaffold.language ?? 'ru'))
        .map((_) => [_.name, _])
    ).values(),
  ];
  kit.forEach((_) => void design.components.save(_.name, _.source));
  Object.entries(scaffold.components ?? {}).forEach(
    ({ 0: name, 1: source }) => void design.components.save(name, source)
  );
  Object.entries(scaffold.templates).forEach(
    ({ 0: name, 1: source }) => void design.templates.save(name, source)
  );
  (scaffold.fields ?? []).forEach((_) => void content.fields.save(_));

  const planted = _plant(content, null, scaffold.pages);
  const ids = new Map(
    planted.flatMap((_) => (_.page.key ? [[_.page.key, _.id] as const] : []))
  );
  const resolve = _resolve(ids);
  planted.forEach(
    (_) =>
      void (
        _.page.content &&
        content.pages.edit(_.id, { content: resolve(_.page.content) })
      )
  );
  // Формы — после страниц: согласие ссылается на страницу политики.
  Object.entries(scaffold.forms ?? {}).forEach(
    ({ 0: name, 1: input }) =>
      void forms.forms.save(name, {
        ...input,
        ...(input.source ? { source: resolve(input.source) } : {}),
      })
  );
  Object.entries(scaffold.settings ?? {}).forEach(
    ({ 0: key, 1: value }) => void site.customSettings.save(key, resolve(value))
  );
  site.settings.update({
    name: siteName?.trim() || scaffold.siteName,
    language: scaffold.language ?? 'ru',
    description: scaffold.description ?? '',
    homePageId: Number(resolve(`@{${scaffold.home}}`)),
    notFoundPageId: scaffold.notFound
      ? Number(resolve(`@{${scaffold.notFound}}`))
      : null,
  });

  return {
    pages: planted.length,
    templates: Object.keys(scaffold.templates).length,
    components: kit.length + Object.keys(scaffold.components ?? {}).length,
    fields: scaffold.fields?.length ?? 0,
    forms: Object.keys(scaffold.forms ?? {}).length,
  };
};

/**
 * Можно ли развернуть каркас: сайт пуст или на нём только нетронутый каркас `welcome` — его страницы
 * и элементы совпадают с исходными. Всё остальное — чужая работа, её каркас не заменяет.
 */
export var untouched = (
  welcome: Scaffold,
  { content, design, forms }: ScaffoldServices
): boolean =>
  ((tree, elements) =>
    content.fields.list().length === 0 &&
    forms.forms.list().length === 0 &&
    tree.length <= welcome.pages.length &&
    tree.every((_) =>
      ((page, spec) =>
        spec !== undefined &&
        page.trashedAt === null &&
        page.content === (spec.content ?? ''))(
        content.drafts.page(_.id),
        welcome.pages.find((spec) => spec.title === _.title)
      )
    ) &&
    elements.every(
      (_) =>
        ({ ...welcome.templates, ...welcome.components })[_.name] ===
        design.elements.get(_.kind, _.name)?.source
    ))(content.drafts.tree(), design.elements.list());

/** Убирает нетронутое приветствие: страницы — навсегда, элементы — тоже. */
export var clearWelcome = ({ content, design }: ScaffoldServices): void => {
  content.drafts.tree().forEach((_) => void content.pages.trash(_.id));
  content.trash.empty();
  design.elements
    .list()
    .forEach((_) => void design.elements.remove(_.kind, _.name));
};
