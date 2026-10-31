import type { Brand } from '../../../shared/kernel/brand.ts';
import {
  type Changed,
  chain,
  changed,
} from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { type Alias, aliasFromTitle, parseAlias } from './alias.ts';
import type { ContentEvent, PageEvent } from './events.ts';
import { type Field, type FieldValue, parseFieldValue } from './field.ts';

export type PageId = Brand<number, 'PageId'>;

/** `link` — ссылка (weblink в Evo): по своему адресу отдаёт редирект на `linkTo`. */
export type PageKind = 'page' | 'link';

/** Момент времени в ISO 8601 UTC; строки сравниваются как время. */
export type Moment = string;

/** Узел дерева сайта, агрегат контекста content. */
export type Page = {
  readonly id: PageId;
  readonly parentId: PageId | null;
  readonly kind: PageKind;
  readonly title: string;
  readonly longTitle: string;
  readonly menuTitle: string;
  readonly description: string;
  readonly introText: string;
  readonly alias: Alias;
  /** Имя шаблона из контекста design. */
  readonly template: string;
  /** MIME-тип ответа: `text/html` рендерит шаблон, остальные — страница-файл со своим текстом. */
  readonly contentType: string;
  readonly content: string;
  /** Цель ссылки: `https://…`, `/путь` или id страницы. */
  readonly linkTo: string;
  readonly published: boolean;
  readonly publishAt: Moment | null;
  readonly unpublishAt: Moment | null;
  readonly publishedAt: Moment | null;
  /** Страница в корзине; вся её ветка скрыта с сайта. */
  readonly trashedAt: Moment | null;
  readonly menuIndex: number;
  readonly hiddenFromMenu: boolean;
  readonly cacheable: boolean;
  /** Показывать поисковикам: false — `noindex` и нет в sitemap.xml и llms.txt (`searchable` в Evo). */
  readonly searchable: boolean;
  /** Картинка для соцсетей и ИИ-превью — путь файла медиатеки; пусто — берётся из настроек сайта. */
  readonly socialImage: string;
  /** Язык страницы и её ветки (`en`); пусто — как у родителя, у корня — язык сайта. */
  readonly language: string;
  /** Исходная страница, переводом которой эта является; набор переводов — она и все, кто на неё указывает. */
  readonly translationOf: PageId | null;
  /** Собственные значения полей; унаследованные и умолчания сюда не попадают. */
  readonly fields: Readonly<Record<string, FieldValue>>;
};

export type NewPage = {
  readonly parentId?: PageId | null;
  readonly kind?: PageKind;
  readonly title: string;
  readonly longTitle?: string;
  readonly menuTitle?: string;
  readonly description?: string;
  readonly introText?: string;
  /** Без алиаса он выводится из заголовка. */
  readonly alias?: string;
  readonly template: string;
  readonly contentType?: string;
  readonly content?: string;
  readonly linkTo?: string;
  readonly publishAt?: string | null;
  readonly unpublishAt?: string | null;
  readonly menuIndex?: number;
  readonly hiddenFromMenu?: boolean;
  readonly cacheable?: boolean;
  readonly searchable?: boolean;
  readonly socialImage?: string;
  readonly language?: string;
  /** null снимает связь с исходной страницей. */
  readonly translationOf?: number | null;
};

export type PageChanges = Partial<Omit<NewPage, 'parentId'>>;

/** null удаляет собственное значение: тогда работают наследование и умолчание. */
export type FieldValues = Readonly<Record<string, FieldValue | null>>;

export type PageChange = Changed<Page, ContentEvent>;

const _MAX_TITLE = 255;
// Путь — `/…`, но не `//host`: такой адрес браузер увёл бы на другой сайт.
const _LINK = /^(?:https?:\/\/\S+|\/(?![/\\])\S*|[1-9]\d*)$/;
const _KINDS: readonly PageKind[] = ['page', 'link'];

export var parsePageId = (raw: number): PageId =>
  Number.isSafeInteger(raw) && raw > 0
    ? (raw as PageId)
    : fail('content.invalid_page_id', `Invalid page id ${raw}`);

const _title = (raw: string): string =>
  pipe(
    (_: string) => _.trim(),
    (_: string) =>
      _ && _.length <= _MAX_TITLE
        ? _
        : fail(
            'content.invalid_title',
            `Title must be 1–${_MAX_TITLE} characters`
          )
  )(raw);

const _text =
  (name: string, max: number) =>
  (raw: string): string =>
    raw.trim().length <= max
      ? raw.trim()
      : fail(
          'content.invalid_text',
          `${name} must be at most ${max} characters`
        );

const _template = (raw: string): string =>
  raw.trim() || fail('content.invalid_template', 'A page needs a template');

const _kind = (raw: PageKind): PageKind =>
  _KINDS.includes(raw)
    ? raw
    : fail('content.invalid_kind', `Unknown page kind "${raw}"`);

const _linkTo = (raw: string): string =>
  raw === '' || _LINK.test(raw)
    ? raw
    : fail(
        'content.invalid_link',
        `Link "${raw}" must be an http(s) URL, a /path or a page id`
      );

const _iso = (date: Date, raw: string): Moment =>
  Number.isNaN(date.getTime())
    ? fail('content.invalid_moment', `"${raw}" is not a date and time`)
    : date.toISOString();

const _moment = (raw: string | null): Moment | null =>
  raw === null ? null : _iso(new Date(raw), raw);

const _parent = (id: PageId, parentId: PageId | null): PageId | null =>
  parentId === id
    ? fail('content.invalid_parent', 'A page cannot be its own parent')
    : parentId;

// Путь файла медиатеки без `/media/`, как у поля image.
const _MEDIA_PATH = /^[^/\s]\S*$/;

const _socialImage = (raw: string): string =>
  raw === '' || _MEDIA_PATH.test(raw)
    ? raw
    : fail(
        'content.invalid_social_image',
        `"${raw}" is not a media path like images/cover.jpg`
      );

const _LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const _language = (raw: string): string =>
  raw === '' || _LANGUAGE.test(raw)
    ? raw
    : fail(
        'content.invalid_language',
        `"${raw}" is not a language tag like en or ru`
      );

// MIME-тип без параметров: `text/css`, `application/rss+xml`; charset дописывает сайт.
const _CONTENT_TYPE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

const _contentType = (raw: string): string =>
  ((type) =>
    _CONTENT_TYPE.test(type)
      ? type
      : fail(
          'content.invalid_content_type',
          `"${raw}" is not a MIME type like text/css`
        ))(raw.trim().toLowerCase());

const _EDIT: {
  readonly [K in keyof Required<PageChanges>]: (
    value: Exclude<PageChanges[K], undefined>
  ) => Page[K];
} = {
  kind: _kind,
  title: _title,
  longTitle: _text('longTitle', _MAX_TITLE),
  menuTitle: _text('menuTitle', _MAX_TITLE),
  description: _text('description', 1000),
  introText: (_) => _,
  alias: parseAlias,
  template: _template,
  contentType: _contentType,
  content: (_) => _,
  linkTo: _linkTo,
  publishAt: _moment,
  unpublishAt: _moment,
  menuIndex: (_) => _,
  hiddenFromMenu: (_) => _,
  cacheable: (_) => _,
  searchable: (_) => _,
  socialImage: _socialImage,
  language: _language,
  translationOf: (_) => (_ === null ? null : parsePageId(_)),
};

const _RULES: ReadonlyArray<
  readonly [(page: Page) => boolean, string, string]
> = [
  [
    (_) => _.kind === 'link' && _.linkTo === '',
    'content.invalid_link',
    'A link page needs a target',
  ],
  [
    (_) =>
      _.publishAt !== null &&
      _.unpublishAt !== null &&
      _.unpublishAt <= _.publishAt,
    'content.invalid_schedule',
    'unpublishAt must be later than publishAt',
  ],
  [
    (_) => _.translationOf === _.id,
    'content.invalid_translation',
    'A page cannot be a translation of itself',
  ],
];

const _consistent = (page: Page): Page =>
  _RULES.reduce(
    (_, { 0: broken, 1: code, 2: message }) =>
      broken(_) ? fail(code, message) : _,
    page
  );

// Обход по ключам _EDIT: посторонние ключи входа (publish, fields) домен не видит.
const _apply =
  (changes: PageChanges) =>
  (page: Page): Page =>
    (Object.keys(_EDIT) as Array<keyof PageChanges>)
      .filter((key) => changes[key] !== undefined)
      .reduce<Page>(
        (next, key) => ({
          ...next,
          [key]: _EDIT[key](changes[key] as never),
        }),
        page
      );

const _event = (type: PageEvent['type'], page: Page): PageEvent => ({
  type,
  pageId: page.id,
  parentId: page.parentId,
  ...(page.translationOf === null ? {} : { translationOf: page.translationOf }),
});

const _BLANK: Omit<Page, 'id' | 'parentId'> = {
  kind: 'page',
  title: '',
  longTitle: '',
  menuTitle: '',
  description: '',
  introText: '',
  alias: '' as Alias,
  template: '',
  contentType: 'text/html',
  content: '',
  linkTo: '',
  published: false,
  publishAt: null,
  unpublishAt: null,
  publishedAt: null,
  trashedAt: null,
  menuIndex: 0,
  hiddenFromMenu: false,
  cacheable: true,
  searchable: true,
  socialImage: '',
  language: '',
  translationOf: null,
  fields: {},
};

// Пустой алиас — «выведи из заголовка»: так обещает подсказка в менеджере.
const _blankAlias = (alias: string | undefined): boolean =>
  alias !== undefined && alias.trim() === '';

const _withoutBlankAlias = <T extends PageChanges>(changes: T): T =>
  _blankAlias(changes.alias) ? { ...changes, alias: undefined } : changes;

// Язык для транслитерации: свой у страницы, иначе ветки — его знает только сценарий.
const _aliasFromTitle =
  (branchLanguage: string) =>
  (_: Page): Page => ({
    ..._,
    alias: aliasFromTitle(_.title, _.language || branchLanguage),
  });

/** `branchLanguage` — язык ветки, куда ложится страница: по нему алиас из заголовка. */
export var createPage = (
  id: PageId,
  { parentId, ...input }: NewPage,
  branchLanguage = ''
): PageChange =>
  pipe(
    _apply(_withoutBlankAlias(input)),
    (_: Page) =>
      input.alias === undefined || _blankAlias(input.alias)
        ? _aliasFromTitle(branchLanguage)(_)
        : _,
    _consistent,
    (_: Page) => changed(_, _event('content.page_created', _))
  )({ ..._BLANK, id, parentId: _parent(id, parentId ?? null) });

export var editPage =
  (changes: PageChanges, branchLanguage = '') =>
  (page: Page): PageChange =>
    pipe(
      _apply(_withoutBlankAlias(changes)),
      (_: Page) =>
        _blankAlias(changes.alias) ? _aliasFromTitle(branchLanguage)(_) : _,
      _consistent,
      // Прежняя исходная страница — чтобы и её набор переводов узнал, что эта ушла.
      (_: Page) =>
        changed(_, {
          ..._event('content.page_edited', _),
          ...(_.translationOf === page.translationOf
            ? {}
            : { previousTranslationOf: page.translationOf }),
        })
    )(page);

/** Публикация снимает ожидание `publishAt`, даже если страница уже опубликована. */
export var publishPage =
  (at: Moment) =>
  (page: Page): PageChange =>
    page.published
      ? changed({ ...page, publishAt: null })
      : changed(
          { ...page, published: true, publishedAt: at, publishAt: null },
          _event('content.page_published', page)
        );

export var unpublishPage = (page: Page): PageChange =>
  page.published
    ? changed(
        { ...page, published: false, unpublishAt: null },
        _event('content.page_unpublished', page)
      )
    : changed({ ...page, unpublishAt: null });

const _due = (moment: Moment | null, at: Moment): moment is Moment =>
  moment !== null && moment <= at;

/** Отложенная публикация и снятие, чей момент наступил к `at`. */
export var applySchedule =
  (at: Moment) =>
  (page: Page): PageChange =>
    pipe(
      (_: PageChange) =>
        _due(_.state.publishAt, at)
          ? chain(publishPage(_.state.publishAt))(_)
          : _,
      (_: PageChange) =>
        _due(_.state.unpublishAt, at) ? chain(unpublishPage)(_) : _
    )(changed(page));

export var trashPage =
  (at: Moment) =>
  (page: Page): PageChange =>
    page.trashedAt === null
      ? changed(
          { ...page, trashedAt: at },
          _event('content.page_trashed', page)
        )
      : changed(page);

export var restorePage = (page: Page): PageChange =>
  page.trashedAt === null
    ? changed(page)
    : changed(
        { ...page, trashedAt: null },
        _event('content.page_restored', page)
      );

/** `lineage` — новый родитель и все его предки: страница не может уйти внутрь своей ветки. */
export var movePage =
  (parentId: PageId | null, lineage: readonly PageId[]) =>
  (page: Page): PageChange =>
    parentId === page.parentId
      ? changed(page)
      : lineage.includes(page.id)
        ? fail(
            'content.invalid_parent',
            'A page cannot move into its own branch'
          )
        : changed(
            { ...page, parentId },
            {
              type: 'content.page_moved',
              pageId: page.id,
              parentId,
              previousParentId: page.parentId,
              // Перевод сменил адрес — ссылки на него у всего набора устарели.
              ...(page.translationOf === null
                ? {}
                : { translationOf: page.translationOf }),
            }
          );

const _assigned =
  (fields: readonly Field[], template: string) =>
  (name: string): Field =>
    fields.find((_) => _.name === name && _.templates.includes(template)) ??
    fail(
      'content.field_not_assigned',
      `Field "${name}" is not assigned to template "${template}"`
    );

const _without = (
  values: Readonly<Record<string, FieldValue>>,
  name: string
): Record<string, FieldValue> =>
  Object.fromEntries(
    Object.entries(values).filter(({ 0: key }) => key !== name)
  );

export var setFields =
  (fields: readonly Field[], values: FieldValues) =>
  (page: Page): PageChange =>
    changed(
      {
        ...page,
        fields: Object.entries(values).reduce<
          Readonly<Record<string, FieldValue>>
        >(
          (next, { 0: name, 1: value }) =>
            pipe(_assigned(fields, page.template), (field: Field) =>
              value === null
                ? _without(next, name)
                : { ...next, [name]: parseFieldValue(field)(value) }
            )(name),
          page.fields
        ),
      },
      _event('content.page_fields_changed', page)
    );
