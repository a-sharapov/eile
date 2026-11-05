<script lang="ts">
import { tick, untrack } from 'svelte';
import { aiScope, facts } from '#lib/ai.svelte.ts';
import { api, isApiError } from '#lib/api.ts';
import {
  CONTENT_TYPES,
  codeLanguage,
  HTML_TYPE,
  inertType,
  isHtml,
} from '#lib/content-types.ts';
import { ask, modalOpen } from '#lib/dialog.svelte.ts';
import { tellPage } from '#lib/embed.ts';
import { moment } from '#lib/format.ts';
import { guardUnsaved } from '#lib/guard.svelte.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe, describeLoad, failed, notify } from '#lib/notices.svelte.ts';
import { confirmBranchTrash, duplicatePage } from '#lib/page-actions.ts';
import { openPalette } from '#lib/palette.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import { aliasFromTitle, followsTitle } from '#lib/translit.ts';
import {
  branchOrder,
  lineage,
  loadTree,
  pageChanged,
  sitePath as sitePathOf,
  statusOf,
  tree,
} from '#lib/tree.svelte.ts';
import type {
  Field,
  FieldValue,
  Page,
  PageDetails,
  Settings,
} from '#lib/types.ts';
import CodeEditor from '#lib/ui/CodeEditor.svelte';
import ContentEditor from '#lib/ui/ContentEditor.svelte';
import EdgeState from '#lib/ui/EdgeState.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import MediaField from '#lib/ui/MediaField.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import ShareLinksDialog from '#lib/ui/ShareLinksDialog.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import TextBlock from '#lib/ui/TextBlock.svelte';
import { firstInvalid } from '#lib/validity.ts';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page as route } from '$app/state';
import PageHistory from './PageHistory.svelte';

const _EDITABLE = [
  'kind',
  'title',
  'alias',
  'template',
  'contentType',
  'longTitle',
  'menuTitle',
  'description',
  'introText',
  'content',
  'linkTo',
  'menuIndex',
  'hiddenFromMenu',
  'cacheable',
  'searchable',
  'socialImage',
  'language',
  'translationOf',
  'publishAt',
  'unpublishAt',
] as const;

type Action = 'publish' | 'unpublish' | 'trash' | 'restore';

const _DONE: Readonly<Record<Action, MessageKey>> = {
  publish: 'page.publishedNotice',
  unpublish: 'page.unpublishedNotice',
  trash: 'page.trashedNotice',
  restore: 'page.restoredNotice',
};

const _STATUS = {
  published: 'pages.published',
  draft: 'pages.draft',
  scheduled: 'pages.scheduled',
  trashed: 'pages.trashed',
} as const;

// Ошибка сервера, относящаяся к полю: id поля и вкладка, на которой оно лежит.
const _FIELD_ERRORS: Readonly<
  Record<string, readonly [field: string, tab: string]>
> = {
  'content.alias_taken': ['alias', 'document'],
  'content.invalid_alias': ['alias', 'document'],
  'content.invalid_title': ['title', 'document'],
  'content.invalid_link': ['link-to', 'document'],
  'content.invalid_schedule': ['unpublish-at', 'settings'],
  'content.invalid_moment': ['publish-at', 'settings'],
  'content.invalid_language': ['language', 'settings'],
  'content.invalid_translation': ['translation-of', 'settings'],
  'content.translation_not_found': ['translation-of', 'settings'],
  'content.translation_has_translations': ['translation-of', 'settings'],
  'content.invalid_content_type': ['content-type', 'settings'],
};

// Ограничения сервера (content/domain/page.ts): лишнее не набрать, а не получить отказ.
const _MAX_TITLE = 255;
const _MAX_DESCRIPTION = 1000;

// Заготовка новой страницы: записи на сервере нет до первого сохранения.
const _blank = (parentId: number | null, template: string): Page => ({
  id: 0,
  parentId,
  kind: 'page',
  title: '',
  longTitle: '',
  menuTitle: '',
  description: '',
  introText: '',
  alias: '',
  template,
  contentType: HTML_TYPE,
  content: '',
  linkTo: '',
  published: false,
  publishAt: null,
  unpublishAt: null,
  publishedAt: null,
  trashedAt: null,
  menuIndex: tree.nodes.filter((_) => _.parentId === parentId).length,
  hiddenFromMenu: false,
  cacheable: true,
  searchable: true,
  socialImage: '',
  language: '',
  translationOf: null,
  fields: {},
});

let details = $state<PageDetails | null>(null);
let draft = $state<Page | null>(null);
let fields = $state<Field[]>([]);
let fieldsTemplate = $state('');
let values = $state<Record<string, FieldValue | null>>({});
let parentId = $state<number | null>(null);
// «Другой тип…»: MIME вводится вручную, пока не выбран тип из списка.
let customType = $state(false);
let templates = $state<string[]>([]);
// Языки сайта: выбор языка ветки в настройках страницы.
let site = $state<Settings | null>(null);

$effect(
  () =>
    void api
      .get<Settings>('/settings')
      .then((_) => (site = _))
      .then(undefined, (error) => notify(describeLoad(error), 'error'))
);
let busy = $state(false);
let missing = $state(false);
let fieldError = $state<{ field: string; text: string } | null>(null);

const creating = $derived(route.params.id === 'new');
// Страница-файл (CSS, лента, SVG): свой текст без шаблона, полей, анонса, меню и сниппета для поиска.
const asFile = $derived(
  draft !== null && draft.kind === 'page' && !isHtml(draft.contentType)
);
// Язык для транслита: свой у страницы, иначе родителя (его язык уже с учётом ветки), иначе сайта.
const aliasLanguage = $derived(
  draft?.language ||
    (parentId === null
      ? undefined
      : tree.nodes.find((_) => _.id === parentId)?.language) ||
    site?.language ||
    ''
);

// Заголовок ведёт за собой адрес — транслитом, как TransAlias в Evo, — пока адрес не правили вручную.
const retitle = (title: string) =>
  void (
    draft &&
    ((draft.alias = followsTitle(draft.alias, draft.title, aliasLanguage)
      ? aliasFromTitle(title, aliasLanguage)
      : draft.alias),
    (draft.title = title))
  );

// Исполняемые типы (SVG, XML, ленты, скрипты) — только у администратора: сервер их редактору не даст.
const designer = $derived(session.user?.role === 'admin');
const typeLocked = $derived(
  !designer &&
    draft !== null &&
    !inertType(details?.page.contentType ?? HTML_TYPE)
);

const pickType = (type: string) =>
  void (
    draft && ((customType = type === ''), type && (draft.contentType = type))
  );
const id = $derived(creating ? 0 : Number(route.params.id));
// Пока грузится следующая страница, на экране — прежняя: её id, а не адрес, решает, куда писать.
// Форма прежней страницы в это время неактивна, а Ctrl+S ничего не сохраняет.
const pageId = $derived(details?.page.id ?? 0);
const fresh = $derived(details !== null && details.page.id === id);
const requestedParent = $derived(
  Number(route.url.searchParams.get('parent')) || null
);
const requestedKind = $derived(
  route.url.searchParams.get('kind') === 'link' ? 'link' : 'page'
);

// datetime-local работает в местном времени без зоны; API — в ISO UTC.
const _local = (iso: string | null): string =>
  iso
    ? new Date(
        new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000
      )
        .toISOString()
        .slice(0, 16)
    : '';
const _utc = (local: string): string | null =>
  local ? new Date(local).toISOString() : null;

const _shown = (value: FieldValue | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

const _savedValues = (next: PageDetails): Record<string, FieldValue | null> =>
  Object.fromEntries(
    next.fields.map((_) => [_.name, next.page.fields[_.name] ?? null])
  );

const accept = (next: PageDetails): void => {
  details = next;
  draft = structuredClone(next.page);
  fields = next.fields;
  fieldsTemplate = next.page.template;
  values = _savedValues(next);
  parentId = next.page.parentId;
  customType = !CONTENT_TYPES.some((_) => _.type === next.page.contentType);
  missing = false;
  fieldError = null;
};

// Шаблон новой страницы — как у родителя, на верхнем уровне — как у соседей.
const _templateFor = (
  parent: number | null,
  names: readonly string[]
): string =>
  tree.nodes.find((_) => _.id === parent)?.template ??
  tree.nodes.find((_) => _.parentId === null && !_.trashed)?.template ??
  names[0] ??
  '';

const fieldsOf = (template: string): Promise<Field[]> =>
  template
    ? api.get<Field[]>(`/templates/${encodeURIComponent(template)}/fields`)
    : Promise.resolve([]);

const startBlank = (names: readonly string[]) => {
  const page = {
    ..._blank(requestedParent, _templateFor(requestedParent, names)),
    kind: requestedKind,
  } satisfies Page;
  return fieldsOf(page.template).then((_) =>
    accept({ page, view: null, fields: _, oldPaths: [], translations: [] })
  );
};

// Новая страница и копия ждут названия: фокус — в заголовок, когда форма готова (autofocus
// срабатывает только при первом монтировании, а форма переиспользуется между страницами).
const focusTitle = () =>
  tick().then(
    () =>
      void (
        (creating || route.state.focusTitle) &&
        fresh &&
        form?.querySelector<HTMLElement>('#title')?.focus()
      )
  );

// Три исхода загрузки: готово, «нет такой страницы» (404) и «не загрузилось» с «Повторить» —
// а не застывшая бледная форма прежней страницы.
const pageLoad = defineLoad(() =>
  ((loading) =>
    (creating
      ? Promise.all([
          loading,
          untrack(() => tree.nodes.length) ? null : loadTree(),
        ]).then(() => startBlank(templates))
      : Promise.all([loading, api.get<PageDetails>(`/pages/${id}`)])
          // Ответ на прежний переход, пришедший позже нового, не подменяет открытую страницу.
          .then(([, next]) => void (next.page.id === id && accept(next)))
    )
      .then(focusTitle)
      .then(undefined, (error) =>
        isApiError(error) && error.status === 404
          ? void (missing = true)
          : Promise.reject(error)
      ))(api.get<string[]>('/templates').then((_) => (templates = _)))
);

$effect(() => void pageLoad.retry());

// Страницу поменяли из дерева (перенос, публикация, корзина): перечитываем, если своих правок нет.
$effect(() => {
  const changed = pageChanged.at;
  void (
    changed &&
    pageChanged.id === id &&
    !creating &&
    !dirty &&
    api
      .get<PageDetails>(`/pages/${id}`)
      .then((next) => void (next.page.id === id && accept(next)))
      .then(undefined, failed)
  );
});

// Смена шаблона меняет набор полей: показываем поля нового шаблона сразу, до сохранения.
$effect(() => {
  const template = draft?.template;
  void (
    template &&
    template !== fieldsTemplate &&
    fieldsOf(template)
      .then(
        (next) =>
          void (
            draft?.template === template &&
            ((fields = next),
            (fieldsTemplate = template),
            (values = Object.fromEntries(
              next.map((_) => [
                _.name,
                values[_.name] ?? details?.page.fields[_.name] ?? null,
              ])
            )))
          )
      )
      .then(undefined, failed)
  );
});

const changes = (): Partial<Page> =>
  Object.fromEntries(_EDITABLE.map((_) => [_, draft![_]]));

const ownValues = (): Record<string, FieldValue> =>
  Object.fromEntries(
    Object.entries(values).filter(
      (_): _ is [string, FieldValue] => _[1] !== null
    )
  );

const fieldsChanged = $derived(
  details !== null &&
    fields.some(
      (_) => (details!.page.fields[_.name] ?? null) !== (values[_.name] ?? null)
    )
);

const dirty = $derived(
  details !== null &&
    draft !== null &&
    (fieldsChanged ||
      parentId !== details.page.parentId ||
      _EDITABLE.some((_) => draft![_] !== details!.page[_]))
);

guardUnsaved(() => dirty && !busy);

// Раздел страницы в корзине: на сайте её нет и править её нельзя — только восстановив раздел.
const trashedSection = $derived(
  details && !creating && details.page.trashedAt === null
    ? (lineage(details.page.parentId).find((_) => _.trashed) ?? null)
    : null
);

const trashed = $derived(
  details?.page.trashedAt != null || trashedSection !== null
);

const status = $derived(
  details ? statusOf({ ...details.page, trashed }) : 'draft'
);

const persist = (): Promise<PageDetails> =>
  api
    .send<PageDetails>('PATCH', `/pages/${pageId}`, changes())
    .then((_) =>
      fieldsChanged
        ? api.send<PageDetails>('PUT', `/pages/${pageId}/fields`, values)
        : _
    )
    .then((_) =>
      parentId === details!.page.parentId
        ? _
        : api.send<PageDetails>('POST', `/pages/${pageId}/move`, { parentId })
    );

// Первое сохранение заготовки создаёт страницу; дальше редактор работает с ней по id.
const create = (publish: boolean): Promise<PageDetails> =>
  api
    .send<{ id: number }>('POST', '/pages', {
      ...changes(),
      parentId,
      publish,
      fields: ownValues(),
    })
    .then((_) => api.get<PageDetails>(`/pages/${_.id}`))
    .then((next) => {
      accept(next);
      return goto(resolve('/(app)/pages/[id]', { id: String(next.page.id) }), {
        replace: true,
      }).then(() => next);
    });

let form = $state<HTMLFormElement>();

// После действия кнопка, на которой был фокус, могла смениться другой: фокус переходит на её замену.
const refocus = (selector: string) =>
  tick().then(() => form?.querySelector<HTMLElement>(selector)?.focus());

// Ошибку поля показываем у поля и открываем его вкладку; остальные — уведомлением.
const fail = (error: unknown): void =>
  ((place) =>
    place
      ? ((fieldError = { field: place[0], text: describe(error) }),
        (tab = place[1]),
        void refocus(`#${place[0]}`))
      : failed(error))(
    isApiError(error) ? _FIELD_ERRORS[error.code] : undefined
  );

const invalid = (field: string): 'true' | undefined =>
  fieldError?.field === field ? 'true' : undefined;

const describedBy = (field: string, help?: string): string | undefined =>
  fieldError?.field === field ? `${field}-error` : help;

// Ошибка поля уходит, как только его начали править.
const clearError = (event: Event): void =>
  void (
    fieldError &&
    (event.target as HTMLElement).id === fieldError.field &&
    (fieldError = null)
  );

const valid = (): Promise<boolean> =>
  ((found) =>
    found
      ? ((tab = found.tab ?? tab), tick().then(() => (found.report(), false)))
      : Promise.resolve(true))(firstInvalid(form));

// В окне полосы правки на сайте: сохранили — страница сайта перезагрузится или откроет новую.
const tellSaved = (): void =>
  tellPage({
    type: 'saved',
    url: details?.page.published ? (details.view?.path ?? null) : null,
  });

$effect(() => tellPage({ type: 'dirty', dirty }));

// Кнопка «Сохранить» не гаснет через disabled: иначе фокус с неё улетает на body.
const save = (event?: SubmitEvent) => {
  event?.preventDefault();
  const created = creating;
  // Новую страницу сохраняют и без правок: пустой заголовок покажет, чего не хватает.
  return (dirty || creating) && !busy && fresh
    ? valid().then(
        (ok): unknown =>
          ok &&
          ((busy = true),
          (created ? create(false) : persist().then(accept))
            .then(
              () => (
                notify(t(created ? 'page.created' : 'page.saved')), loadTree()
              )
            )
            .then(tellSaved)
            .then(undefined, fail)
            .finally(() => (busy = false)))
      )
    : undefined;
};

const _FOCUS_AFTER: Readonly<Record<Action, string>> = {
  publish: '[data-act="unpublish"]',
  unpublish: '[data-act="publish"]',
  trash: '.banner',
  restore: '[data-act="trash"]',
};

// Действие над страницей сначала сохраняет правки: иначе ответ сервера затёр бы их в форме.
const act = (action: Action): Promise<void> =>
  (dirty || creating ? valid() : Promise.resolve(true)).then((ok) =>
    ok ? perform(action) : undefined
  );

const perform = (action: Action): Promise<void> => (
  (busy = true),
  (creating && action === 'publish'
    ? create(true)
    : (dirty ? persist() : Promise.resolve(details!)).then(() =>
        api.send<PageDetails>('POST', `/pages/${pageId}/${action}`)
      )
  )
    .then(accept)
    .then(
      () => (
        notify(
          t(_DONE[action]),
          'ok',
          action === 'trash'
            ? { label: t('common.undo'), run: () => act('restore') }
            : undefined
        ),
        loadTree()
      )
    )
    .then(tellSaved)
    .then(() => undefined, fail)
    .finally(() => ((busy = false), refocus(_FOCUS_AFTER[action])))
);

// Публикация впереди: «Опубликовать» выпустит страницу сразу и снимет расписание — спрашиваем.
const scheduledAhead = $derived(
  draft?.publishAt != null &&
    !details?.page.published &&
    Date.parse(draft.publishAt) > Date.now()
);

const publish = () =>
  scheduledAhead
    ? ask({
        title: t('page.publishNowTitle'),
        body: t('page.publishNowBody', { when: moment(draft!.publishAt!) }),
        confirm: t('page.publishNow'),
      }).then((confirmed) => (confirmed ? act('publish') : undefined))
    : act('publish');

let moreActions = $state<HTMLDetailsElement>();
// Ссылка предпросмотра черновика для клиента без входа в менеджер (ADR 0054).
let shareOpen = $state(false);
const closeMore = () => void (moreActions && (moreActions.open = false));

// Меню «…» ведёт себя как меню: Escape и щелчок мимо закрывают его, фокус — на кнопку «…».
const moreKey = (event: KeyboardEvent) =>
  void (
    moreActions?.open &&
    event.key === 'Escape' &&
    (event.preventDefault(),
    closeMore(),
    moreActions.querySelector<HTMLElement>('summary')?.focus())
  );

const moreOutside = (event: PointerEvent) =>
  void (
    moreActions?.open &&
    !moreActions.contains(event.target as Node) &&
    closeMore()
  );

// Раздел уходит в корзину вместе с вложенными: если они есть, сначала спрашиваем.
const trash = () =>
  (node ? confirmBranchTrash(node) : Promise.resolve(true)).then((confirmed) =>
    confirmed ? act('trash') : undefined
  );

// Строка статуса в колонке: что со страницей сейчас и когда это случилось или случится.
const publishingText = $derived(
  creating
    ? t('page.notSaved')
    : details?.page.published
      ? details.page.publishedAt
        ? t('page.publishedOn', { when: moment(details.page.publishedAt) })
        : t('pages.published')
      : draft?.publishAt
        ? t('page.scheduledFor', { when: moment(draft.publishAt) })
        : t('pages.draft')
);

// Расписание — на вкладке «Настройки»: из колонки «Документа» туда ведёт ссылка.
const toSchedule = () => (
  (tab = 'settings'),
  tick().then(() => document.querySelector<HTMLElement>('#publish-at')?.focus())
);

const onKey = (event: KeyboardEvent) =>
  void (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 's' &&
    // Под открытым диалогом страница не сохраняется, но и браузер не открывает своё «Сохранить как».
    (event.preventDefault(), modalOpen() || (!trashed && save()))
  );

// Родитель выбирается в порядке дерева с отступами; своя ветка не предлагается — в неё переместить нельзя.
const parents = $derived(branchOrder(id));
// Исходной для перевода может стать любая страница, кроме самой этой.
const translationTargets = $derived(
  branchOrder(null).filter((_) => _.node.id !== id)
);

// Наследуемое поле подсказывает, что именно подставится и откуда: «Пусто — возьмётся у «Раздел»: Скидки».
const hint = (field: Field): string =>
  ((inherited) =>
    inherited
      ? `${t('page.inheritedFrom')} ${quoted(inherited.from.title)}${
          field.type === 'richtext' ? '' : `: ${_shown(inherited.value)}`
        }`
      : field.inherit
        ? `${t('page.inherits')}${field.defaultValue === null ? '' : ` ${t('page.defaultIs')} ${field.defaultValue}`}`
        : field.defaultValue === null
          ? ''
          : `${t('page.defaultIs')} ${field.defaultValue}`)(
    details?.inherited?.[field.name]
  );

let tab = $state('document');

// Где правки: отметка на вкладке подсказывает, что ещё не сохранено.
const _DOCUMENT = [
  'title',
  'introText',
  'template',
  'alias',
  'menuTitle',
  'menuIndex',
  'hiddenFromMenu',
  'content',
  'linkTo',
] as const;
const _SETTINGS = [
  'kind',
  'contentType',
  'language',
  'translationOf',
  'publishAt',
  'unpublishAt',
  'cacheable',
] as const;

const _SEO = ['longTitle', 'description', 'searchable', 'socialImage'] as const;

const changed = $derived({
  seo:
    !creating &&
    draft !== null &&
    details !== null &&
    _SEO.some((_) => draft![_] !== details!.page[_]),
  document:
    !creating &&
    draft !== null &&
    details !== null &&
    (parentId !== details.page.parentId ||
      _DOCUMENT.some((_) => draft![_] !== details!.page[_])),
  fields: !creating && fieldsChanged,
  settings:
    !creating &&
    draft !== null &&
    details !== null &&
    _SETTINGS.some((_) => draft![_] !== details!.page[_]),
});

const node = $derived(tree.nodes.find((_) => _.id === id));

// Адрес родителя — начало адреса страницы: алиас дописывается к нему.
const parentPath = $derived(
  parentId === null ? '' : (tree.nodes.length, sitePathOf(parentId))
);

// Предпросмотр выдачи: заголовок как в <title>, адрес — как увидит посетитель.
const seoTitle = $derived(draft ? draft.longTitle || draft.title : '');
// Хост — из адреса сайта в настройках: локальный адрес менеджера в выдаче не появится.
const siteHost = $derived(
  site?.siteUrl && URL.canParse(site.siteUrl)
    ? new URL(site.siteUrl).host
    : location.host
);

// Длинный путь родителя не помещается: важнее всего ближайший родитель, полный путь — в подсказке.
const shownPrefix = $derived(
  parentPath.length > 24 ? `…/${parentPath.split('/').at(-1)}` : parentPath
);

// Вернули версию: форма — как на сервере, несохранённое (о нём спросили) уходит.
const restored = (next: PageDetails): Promise<unknown> => (
  accept(next), loadTree()
);

const forgetPath = (path: string) =>
  api
    .send<PageDetails>('DELETE', `/pages/${pageId}/old-paths`, { path })
    .then(
      (next) => details && (details = { ...details, oldPaths: next.oldPaths })
    )
    .then(undefined, failed);

const crumbs = $derived([
  { label: t('nav.pages'), href: resolve('/(app)/pages') },
  ...lineage(creating ? requestedParent : (details?.page.parentId ?? null)).map(
    (_) => ({
      label: _.title,
      href: resolve('/(app)/pages/[id]', { id: String(_.id) }),
    })
  ),
]);

const heading = $derived(
  creating
    ? draft?.title ||
        t(requestedKind === 'link' ? 'pages.newLink' : 'pages.new')
    : (details?.page.title ?? '')
);

// Заголовок вкладки (его читает и объявление перехода) — сразу по дереву: данные страницы ещё в пути.
// ИИ знает, какую страницу правят: адрес, раздел, шаблон и его поля.
$effect(() =>
  draft
    ? aiScope({
        area: t('aiFacts.page', { title: draft.title || heading }),
        facts: facts([
          details?.view?.path &&
            t('aiFacts.address', { path: details.view.path }),
          t('aiFacts.section', {
            path:
              crumbs
                .slice(1)
                .map((_) => _.label)
                .join(' › ') || t('aiFacts.topLevel'),
          }),
          draft.template && t('aiFacts.template', { name: draft.template }),
          draft.kind === 'link' && t('aiFacts.link'),
          fields.length > 0 &&
            t('aiFacts.fields', {
              list: fields.map((_) => `${_.name} (${_.label})`).join(', '),
            }),
        ]),
      })
    : undefined
);

const tabTitle = $derived(
  fresh || creating
    ? heading
    : (tree.nodes.find((_) => _.id === id)?.title ?? heading)
);

// Картинка для соцсетей: 1200×630 — размер, который они показывают без обрезки.
const _SOCIAL_SIZE = { width: 1200, height: 630 } as const;
</script>

<svelte:window onkeydown={(e) => (onKey(e), moreKey(e))} onpointerdown={moreOutside} />
<svelte:head><title>{tabTitle ? `${tabTitle} — ` : ''}{t('nav.pages')} — {t('app.name')}</title></svelte:head>

<!-- Статус — плашкой с узлом, как в дереве; дальше через волосяные разделители — id и адрес на сайте. -->
{#snippet statusLine()}
  <span class="status" data-status={creating ? 'new' : status}><i class="status-node" aria-hidden="true"></i>{creating ? t('page.notSaved') : t(_STATUS[status])}</span>
  {#if details?.page.publishAt && !details.page.published}
    <time class="when" datetime={details.page.publishAt} title={t('page.scheduledFor', { when: moment(details.page.publishAt) })}>{moment(details.page.publishAt)}</time>
  {/if}
  {#if !creating}<i class="sep" aria-hidden="true"></i><span class="id"><span class="key">id</span>{pageId}</span>{/if}
  {#if details?.view}
    <i class="sep" aria-hidden="true"></i>
    {#if details.page.published && !trashed}
      <a class="path" href={details.view.path} target="_blank" rel="noopener" title={`${t('page.open')}: ${details.view.path}`}><span class="path-text">{details.view.path}</span>{@html icons.external}<span class="sr-only">({t('page.open')})</span></a>
    {:else}
      <span class="path" title={details.view.path}><span class="path-text">{details.view.path}</span></span>
    {/if}
  {/if}
{/snippet}

{#snippet headerActions()}
  {#if !creating}
    <a class="button icon tool" href={api.previewUrl(id)} target="_blank" rel="noopener" aria-label={dirty ? t('page.previewSaved') : t('page.preview')} title={dirty ? t('page.previewSaved') : t('page.preview')}>{@html icons.eye}</a>
    {#if !trashed && details && !details.page.published}
      <button type="button" class="icon share secondary tool" aria-label={t('shareLinks.open')} title={t('shareLinks.open')} onclick={() => (shareOpen = true)}>{@html icons.share}</button>
    {/if}
  {/if}
  {#if trashedSection}
    <a class="button" href={resolve('/(app)/pages/[id]', { id: String(trashedSection.id) })}>{@html icons.restore}{t('page.toSection')}</a>
  {:else if trashed}
    <button type="button" data-act="restore" disabled={busy} onclick={() => act('restore')}>{@html icons.restore}{t('page.restore')}</button>
  {:else}
    {#if !creating}
      <a class="button icon child secondary tool" href={`${resolve('/(app)/pages/[id]', { id: 'new' })}?parent=${pageId}`} aria-label={t('pages.newChild')} title={t('pages.newChild')}>{@html icons.plus}</a>
      <button type="button" class="icon duplicate secondary tool" disabled={busy || dirty} aria-label={t('tree.duplicate')} title={dirty ? t('page.duplicateSaveFirst') : t('tree.duplicate')} onclick={() => node && duplicatePage(node)}>{@html icons.copy}</button>
      <button type="button" class="danger icon secondary tool" data-act="trash" disabled={busy} aria-label={t('page.toTrash')} title={t('page.toTrash')} onclick={trash}>
        {@html icons.trash}
      </button>
      <!-- Узкая строка: те же действия — в меню «…», чтобы путь и статус не сжимались в точку. -->
      <details class="more-actions" bind:this={moreActions} onfocusout={(e) => void (moreActions && !moreActions.contains(e.relatedTarget as Node | null) && closeMore())}>
        <summary class="button icon tool" aria-label={t('page.moreActions')} title={t('page.moreActions')}>{@html icons.more}</summary>
        <div class="more-menu" role="group" aria-label={t('page.moreActions')}>
          <a href={`${resolve('/(app)/pages/[id]', { id: 'new' })}?parent=${pageId}`} onclick={closeMore}>{@html icons.filePlus}{t('pages.newChild')}</a>
          {#if details && !details.page.published}
            <button type="button" onclick={() => (closeMore(), (shareOpen = true))}>{@html icons.share}{t('shareLinks.open')}</button>
          {/if}
          <button type="button" disabled={busy || dirty} title={dirty ? t('page.duplicateSaveFirst') : undefined} onclick={() => (closeMore(), node && duplicatePage(node))}>{@html icons.copy}{t('tree.duplicate')}</button>
          <button type="button" class="danger" disabled={busy} onclick={() => (closeMore(), trash())}>{@html icons.trash}{t('page.toTrash')}</button>
        </div>
      </details>
    {/if}
    {#if details?.page.published}
      <button type="button" data-act="unpublish" disabled={busy} onclick={() => act('unpublish')}>{t('page.unpublish')}</button>
    {:else}
      <button type="button" data-act="publish" disabled={busy} title={dirty ? t('page.publishHint') : undefined} onclick={publish}>{t(scheduledAhead ? 'page.publishNow' : 'page.publish')}</button>
    {/if}
    <button class="primary" aria-disabled={busy || (!dirty && !creating)} aria-keyshortcuts="Control+S" title={dirty ? `${t('common.unsaved')} · ${t('common.ctrl')}+S` : `${t('common.ctrl')}+S`}>
      {#if dirty}<span class="dirty" aria-hidden="true"></span>{/if}{t('page.save')}{#if dirty}<span class="sr-only">: {t('common.unsaved')}</span>{/if}
    </button>
  {/if}
{/snippet}

{#snippet problem(field: string)}
  {#if fieldError?.field === field}<small id={`${field}-error`} class="field-error">{fieldError.text}</small>{/if}
{/snippet}

{#snippet documentTab()}
  {#if draft}
    <!-- Текст страницы — сразу под заголовком и адресом: это главная работа; место в дереве,
         публикация и меню — в колонке справа, как в MODX. -->
    <div class="columns">
      <div class="main-column">
        <label class="title-field">
          <span>{t('page.title')}<span class="required" aria-hidden="true"> *</span></span>
          <input
            id="title"
            class="title-input"
            required
            maxlength={_MAX_TITLE}
            bind:value={() => draft!.title, retitle}
            placeholder={t('page.titlePlaceholder')}
            aria-invalid={invalid('title')}
            aria-describedby={describedBy('title')}
          />
          {@render problem('title')}
        </label>
        <!-- Алиас — часть адреса: показываем его в адресе целиком, а не отдельным словом. -->
        <label>
          {t('page.address')}
          <span class="address" class:invalid={invalid('alias')}>
            <span class="prefix" aria-hidden="true" title={`${parentPath}/`}><span>{shownPrefix}/</span></span>
            <input
              id="alias"
              data-ai="off"
              bind:value={draft.alias}
              placeholder={aliasFromTitle(draft.title, aliasLanguage) || t('page.aliasHint')}
              aria-invalid={invalid('alias')}
              aria-describedby={describedBy('alias', 'alias-help')}
            />
          </span>
          {#if invalid('alias')}
            {@render problem('alias')}
          {:else}
            <small id="alias-help">{t('page.addressHint')}</small>
          {/if}
        </label>
        {#if draft.kind === 'link'}
          <label>
            <span>{t('page.linkTo')}<span class="required" aria-hidden="true"> *</span></span>
            <input id="link-to" required bind:value={draft.linkTo} placeholder={t('page.linkHint')} aria-invalid={invalid('link-to')} aria-describedby={describedBy('link-to')} />
            {@render problem('link-to')}
            <small>{t('page.linkToHint')}</small>
          </label>
        {/if}
        {#if !asFile}
          <label>
            {t('page.introText')}
            <textarea rows="2" bind:value={draft.introText}></textarea>
            <small>{t('page.introHint')}</small>
          </label>
        {/if}
        {#if asFile}
          <section class="content" aria-labelledby="content-title" aria-describedby="file-help">
            <h2 id="content-title">{t('page.fileContent')}</h2>
            {#key `${route.params.id}:${details?.page.id}:${draft.contentType}`}
              <CodeEditor bind:value={draft.content} language={codeLanguage(draft.contentType)} label={t('page.fileContent')} compact readonly={typeLocked} />
            {/key}
            <small class="help" id="file-help">{t(typeLocked ? 'page.contentTypeLocked' : 'page.fileContentHint')}</small>
          </section>
        {:else if draft.kind === 'page'}
          <section class="content" aria-labelledby="content-title">
            <h2 id="content-title">{t('page.content')}</h2>
            {#key `${route.params.id}:${details?.page.id}`}
              <ContentEditor bind:value={draft.content} />
            {/key}
          </section>
        {/if}
      </div>
      <aside class="side-column" aria-label={t('page.place')}>
        <h2>{t('page.place')}</h2>
        <label>
          {t('page.parent')}
          <select bind:value={parentId}>
            <option value={null}>{t('pages.root')}</option>
            {#each parents as { node: parent, depth } (parent.id)}<option value={parent.id}>{' '.repeat(depth)}{parent.title} ({parent.id})</option>{/each}
          </select>
        </label>
        {#if !asFile}
          <label>
            {t('page.template')}
            <select bind:value={draft.template}>
              {#each templates as name (name)}<option value={name}>{name}</option>{/each}
            </select>
            <small>{t('page.templateHint')}</small>
          </label>
        {/if}
        <!-- Публикация — тем же узлом статуса, что в дереве сайта, с датами и ссылкой на расписание. -->
        <h2>{t('page.publishing')}</h2>
        <div class="publishing" data-status={creating ? 'new' : status}>
          <p class="state"><span class="status-node" aria-hidden="true"></span>{publishingText}</p>
          <p class="schedule">
            {#if details?.page.published}
              {#if draft.unpublishAt}<span>{t('page.unpublishOn', { when: moment(draft.unpublishAt) })}</span>{/if}
              <button type="button" class="link" onclick={toSchedule}>{t(draft.unpublishAt ? 'page.changeSchedule' : 'page.unpublishLater')}</button>
            {:else}
              <button type="button" class="link" onclick={toSchedule}>{t(draft.publishAt ? 'page.changeSchedule' : 'page.publishLater')}</button>
            {/if}
          </p>
        </div>
        {#if !asFile}
          <h2>{t('page.menu')}</h2>
          <label>{t('page.menuTitle')}<input maxlength={_MAX_TITLE} bind:value={draft.menuTitle} placeholder={draft.title} /><small>{t('page.menuTitleHint')}</small></label>
          <label>{t('page.menuIndex')}<input type="number" bind:value={draft.menuIndex} /><small>{t('page.menuIndexHint')}</small></label>
          <label class="option">
            <input type="checkbox" bind:checked={draft.hiddenFromMenu} />
            <span><strong>{t('page.hiddenFromMenu')}</strong><small class="help">{t('page.hiddenHint')}</small></span>
          </label>
        {/if}
      </aside>
    </div>
  {/if}
{/snippet}

{#snippet fieldsTab()}
  <p class="help tab-intro">{t('page.fieldsIntro')} <strong>{draft?.template}</strong>.</p>
  <div class="page-fields">
    {#each fields as field (field.name)}
      {#if field.type === 'boolean'}
        <label class="check">
          <input type="checkbox" checked={values[field.name] === true} onchange={(e) => (values[field.name] = e.currentTarget.checked)} />
          {field.label}
        </label>
      {:else if field.type === 'select'}
        <label>
          {field.label}
          <select bind:value={values[field.name]}>
            <option value={null}>—</option>
            {#each field.options as option (option)}<option value={option}>{option}</option>{/each}
          </select>
          {#if hint(field)}<small>{hint(field)}</small>{/if}
        </label>
      {:else if field.type === 'image'}
        <MediaField
          label={field.label}
          hint={hint(field)}
          bind:value={() => (typeof values[field.name] === 'string' ? (values[field.name] as string) : null), (_) => (values[field.name] = _)}
        />
      {:else if field.type === 'richtext'}
        <div class="wide">
          {#key `${details?.page.id}:${field.name}`}
            <TextBlock
              label={field.label}
              bind:value={() => _shown(values[field.name]), (_) => (values[field.name] = _ === '' ? null : _)}
            />
          {/key}
          {#if hint(field)}<small class="help">{hint(field)}</small>{/if}
        </div>
      {:else}
        <label>
          {field.label}
          <input
            type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            value={_shown(values[field.name])}
            oninput={(e) =>
              (values[field.name] =
                e.currentTarget.value === ''
                  ? null
                  : field.type === 'number'
                    ? Number(e.currentTarget.value)
                    : e.currentTarget.value)}
          />
          {#if hint(field)}<small>{hint(field)}</small>{/if}
        </label>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet seoTab()}
  {#if draft && details}
    <!-- Как страница выглядит в выдаче и в соцсетях — видно, пока пишешь. -->
    <div class="seo">
      <div class="seo-fields">
        <label>
          {t('page.longTitle')}
          <input maxlength={_MAX_TITLE} bind:value={draft.longTitle} placeholder={draft.title} aria-describedby="title-count" />
          <small id="title-count" class:over={seoTitle.length > 60}>{t('seo.titleHint')} {seoTitle.length}/60</small>
        </label>
        <label>
          {t('seo.description')}
          <textarea rows="3" maxlength={_MAX_DESCRIPTION} bind:value={draft.description} aria-describedby="description-count"></textarea>
          <small id="description-count" class:over={draft.description.length > 160}>{t('seo.descriptionHint')} {draft.description.length}/160</small>
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={draft.searchable} />
          <span><strong>{t('seo.searchable')}</strong><small class="help">{t('seo.searchableHint')}</small></span>
        </label>
        <MediaField label={t('seo.socialImage')} hint={t('seo.socialImageHint')} size={_SOCIAL_SIZE} bind:value={() => draft!.socialImage || null, (_) => (draft!.socialImage = _ ?? '')} />
      </div>
      <div class="previews" aria-label={t('seo.previews')}>
        <figure class="snippet">
          <figcaption>{t('seo.searchPreview')}</figcaption>
          <p class="snippet-url">{siteHost}{details.view?.path ?? ''}</p>
          <p class="snippet-title">{seoTitle}</p>
          <p class="snippet-text">{draft.description || t('seo.noDescription')}</p>
          {#if !draft.searchable}<p class="snippet-hidden">{t('seo.hiddenFromSearch')}</p>{/if}
        </figure>
        <figure class="card">
          <figcaption>{t('seo.socialPreview')}</figcaption>
          {#if draft.socialImage}<img src={`/media/${draft.socialImage}`} alt="" />{:else}<div class="card-empty">{t('seo.noImage')}</div>{/if}
          <p class="card-host">{siteHost}</p>
          <p class="card-title">{seoTitle}</p>
          {#if draft.description}<p class="card-text">{draft.description}</p>{/if}
        </figure>
      </div>
    </div>
    {#if details.oldPaths.length > 0}
      <section class="old-paths" aria-labelledby="old-paths-title">
        <h2 id="old-paths-title">{t('seo.oldPaths')}</h2>
        <p class="help">{t('seo.oldPathsHint')}</p>
        <ul>
          {#each details.oldPaths as path (path)}
            <li><code>{path}</code> → <code>{details.view?.path}</code><button type="button" class="icon" aria-label={`${t('seo.forget')}: ${path}`} title={t('seo.forget')} onclick={() => forgetPath(path)}>{@html icons.close}</button></li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
{/snippet}

{#snippet settingsTab()}
  {#if draft}
    <section class="form-section">
      <header>
        <h2>{t('page.sectionCache')}</h2>
        <p>{t('page.sectionCacheHint')}</p>
      </header>
      <div class="fields">
        <label class="option">
          <input type="checkbox" bind:checked={draft.cacheable} />
          <span><strong>{t('page.cacheable')}</strong><small class="help">{t('page.cacheableHint')}</small></span>
        </label>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t(site && site.languages.length > 0 ? 'page.sectionKind' : 'page.sectionKindOnly')}</h2>
        <p>{t('page.sectionKindHint')}</p>
      </header>
      <div class="fields">
        <div class="fields-2">
          <label>
            {t('page.kind')}
            <select bind:value={draft.kind}>
              <option value="page">{t('page.kindPage')}</option>
              <option value="link">{t('page.kindLink')}</option>
            </select>
            <small>{t('page.kindHint')}</small>
          </label>
          {#if draft.kind === 'page'}
            <label>
              {t('page.contentType')}
              <select value={customType || !CONTENT_TYPES.some((_) => _.type === draft!.contentType) ? '' : draft.contentType} disabled={typeLocked} onchange={(e) => pickType(e.currentTarget.value)}>
                {#each CONTENT_TYPES as option (option.type)}<option value={option.type} disabled={!designer && !inertType(option.type)}>{t(option.label)} · {option.type}{!designer && !inertType(option.type) ? ` — ${t('page.contentTypeAdminOnly')}` : ''}</option>{/each}
                <option value="" disabled={!designer}>{t('page.contentTypeOther')}</option>
              </select>
              <small>{t(typeLocked ? 'page.contentTypeLocked' : 'page.contentTypeHint')}</small>
            </label>
            {#if customType}
              <label>
                {t('page.contentTypeCustom')}
                <input id="content-type" bind:value={draft.contentType} placeholder="text/vcard" spellcheck="false" autocomplete="off" data-ai="off" aria-invalid={invalid('content-type')} aria-describedby={describedBy('content-type', 'content-type-help')} />
                {#if invalid('content-type')}
                  {@render problem('content-type')}
                {:else}
                  <small id="content-type-help">{t('page.contentTypeCustomHint')}</small>
                {/if}
              </label>
            {/if}
          {/if}
          {#if site && site.languages.length > 0}
            <label>
              {t('page.language')}
              <select id="language" bind:value={draft.language} aria-invalid={invalid('language')} aria-describedby={describedBy('language')}>
                <option value="">{t('page.languageInherit')}</option>
                {#each [site.language, ...site.languages] as language (language)}<option value={language}>{language}</option>{/each}
              </select>
              {@render problem('language')}
              <small>{t('page.languageHint')}</small>
            </label>
          {/if}
        </div>
      </div>
    </section>
    {#if site && site.languages.length > 0 && draft.kind === 'page' && !asFile}
      <section class="form-section">
        <header>
          <h2>{t('page.sectionTranslations')}</h2>
          <p>{t('page.sectionTranslationsHint')}</p>
        </header>
        <div class="fields">
          <label>
            {t('page.translationOf')}
            <select id="translation-of" bind:value={draft.translationOf} aria-invalid={invalid('translation-of')} aria-describedby={describedBy('translation-of')}>
              <option value={null}>{t('page.translationNone')}</option>
              {#each translationTargets as { node: target, depth } (target.id)}<option value={target.id}>{' '.repeat(depth)}{target.title} ({target.id})</option>{/each}
            </select>
            {@render problem('translation-of')}
            <small>{t('page.translationOfHint')}</small>
          </label>
          {#if details && details.translations.length > 0}
            <div class="translations">
              <span class="label">{t('page.translations')}</span>
              <ul>
                {#each details.translations as item (item.id)}
                  <li>
                    <code class="lang">{item.language || site.language}</code>
                    {#if item.id === details.page.id}<strong>{item.title}</strong>{:else}<a href={resolve('/(app)/pages/[id]', { id: String(item.id) })}>{item.title}</a>{/if}
                    {#if item.original}<span class="muted">· {t('page.translationOriginal')}</span>{/if}
                    {#if item.trashed}<span class="muted">· {t('pages.trashed')}</span>{:else if !item.published}<span class="muted">· {t('pages.draft')}</span>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </section>
    {/if}
    <section class="form-section">
      <header>
        <h2>{t('page.sectionSchedule')}</h2>
        <p>{t('page.sectionScheduleHint')}</p>
      </header>
      <div class="fields">
        <div class="fields-2">
          <label>
            {t('page.publishAt')}
            <input
              id="publish-at"
              type="datetime-local"
              value={_local(draft.publishAt)}
              onchange={(e) => (draft!.publishAt = _utc(e.currentTarget.value))}
              aria-invalid={invalid('publish-at')}
              aria-describedby={describedBy('publish-at')}
            />
            {@render problem('publish-at')}
          </label>
          <label>
            {t('page.unpublishAt')}
            <input
              id="unpublish-at"
              type="datetime-local"
              min={_local(draft.publishAt) || undefined}
              value={_local(draft.unpublishAt)}
              onchange={(e) => (draft!.unpublishAt = _utc(e.currentTarget.value))}
              aria-invalid={invalid('unpublish-at')}
              aria-describedby={describedBy('unpublish-at', 'unpublish-help')}
            />
            {@render problem('unpublish-at')}
            <small id="unpublish-help">{t('page.unpublishAtHint')}</small>
          </label>
        </div>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet historyTab()}
  {#if details}
    <PageHistory page={details.page} fields={details.fields} active={tab === 'history'} {dirty} onrestored={restored} />
  {/if}
{/snippet}

{#if missing}
  <EdgeState kind="missing" title={t('edge.missingTitle')} text={t('edge.missingText')}>
    {#snippet actions()}
      <a class="button primary" href={resolve('/(app)/pages')}>{t('overview.title')}</a>
      <button type="button" onclick={openPalette}>{@html icons.search}{t('edge.jump')}</button>
    {/snippet}
  </EdgeState>
{:else if pageLoad.state.error && !fresh}
  <div class="load-failed"><LoadState load={pageLoad} /></div>
{:else if draft && details}
  <!-- novalidate: проверяет save() — неверное поле может быть на скрытой вкладке. -->
  <form class="page-editor" novalidate inert={!fresh} aria-busy={!fresh} onsubmit={save} oninput={clearError} onchange={clearError} bind:this={form}>
    <PageHeader title={heading} {crumbs} meta={statusLine} actions={headerActions} titleHidden />

    {#if trashed}
      <p class="banner" role="status" tabindex="-1">
        {#if trashedSection}
          {t('page.inTrashSection')} <a href={resolve('/(app)/pages/[id]', { id: String(trashedSection.id) })}>{quoted(trashedSection.title)}</a>.
        {:else}
          {t('page.inTrash')}
        {/if}
      </p>
    {/if}

    <div class="body" inert={trashed}>
      <Tabs
        label={t('page.tabs')}
        bind:current={tab}
        tabs={[
          { id: 'document', label: t('page.tabDocument'), flag: changed.document, content: documentTab },
          ...(fields.length > 0 && !asFile ? [{ id: 'fields', label: t('page.tabFields'), flag: changed.fields, content: fieldsTab }] : []),
          ...(draft.kind === 'page' && !asFile ? [{ id: 'seo', label: t('page.tabSeo'), flag: changed.seo, content: seoTab }] : []),
          { id: 'settings', label: t('page.tabSettings'), flag: changed.settings, content: settingsTab },
          ...(creating ? [] : [{ id: 'history', label: t('page.tabHistory'), content: historyTab }]),
        ]}
      />
    </div>
  </form>
  {#if !creating && details && !details.page.published}
    <ShareLinksDialog bind:open={shareOpen} page={pageId} title={details.page.title} />
  {/if}
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  /* Текст файла пишут здесь целиком: редактору — высота, а не шесть строк блока. */
  .content :global(.editor-frame .cm-content) {
    min-height: 18rem;
  }

  .load-failed {
    padding-top: 2rem;
  }

  /* Следующая страница грузится: прежняя форма бледнеет, если ждать дольше мгновения. */
  .page-editor[aria-busy='true'] {
    animation: editor-wait 1ms 250ms forwards;
  }

  @keyframes editor-wait {
    to {
      opacity: 0.5;
    }
  }

  /* minmax(0, 1fr): длинный заголовок не распирает форму шире экрана телефона. */
  form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }

  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    max-width: 72rem;
  }

  .more-actions {
    position: relative;
    display: none;
  }

  .more-actions summary {
    list-style: none;
  }

  .more-actions summary::-webkit-details-marker {
    display: none;
  }

  .more-menu {
    position: absolute;
    top: calc(100% + 0.375rem);
    right: 0;
    z-index: 8;
    display: grid;
    gap: 0.125rem;
    min-width: 15rem;
    padding: 0.375rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .more-menu :is(a, button) {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    justify-content: flex-start;
    min-height: 2.25rem;
    padding: 0 0.65rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
  }

  .more-menu :is(a, button):hover:not(:disabled) {
    border: 0;
    background: var(--hover);
    color: var(--text);
  }

  .more-menu .danger,
  .more-menu .danger:hover:not(:disabled) {
    color: var(--danger);
  }

  .more-menu :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }

  .more-menu .danger :global(svg) {
    color: var(--danger);
  }

  /* Телефон: строка действий внизу экрана — меню «…» раскрывается вверх. */
  @media (width < 48rem) {
    .more-menu {
      top: auto;
      bottom: calc(100% + 0.375rem);
    }
  }

  /* Строка страницы уже ~52rem: создать, дублировать и корзина — в меню «…». */
  /* Инструменты страницы — без рамок: шесть одинаковых коробок спорили с «Опубликовать» и
     «Сохранить»; рамка и фон появляются под мышью и в фокусе. */
  .tool {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
  }

  .tool:hover,
  .more-actions[open] > .tool {
    border-color: var(--line);
    background: var(--hover);
    color: var(--text);
  }

  .tool.danger {
    color: var(--danger);
  }

  @container page-bar (width < 52rem) {
    .secondary {
      display: none;
    }

    .more-actions {
      display: block;
    }
  }

  .body[inert] {
    opacity: 0.6;
  }

  /* Мета строки: статус — плашка цвета своего узла (как в дереве), дальше id и адрес через волосяные
     разделители. Статус, дата и id не сжимаются; длинный адрес — с многоточием. */
  .status {
    display: inline-flex;
    flex: none;
    gap: 0.375rem;
    align-items: center;
    height: 1.375rem;
    padding: 0 0.5rem 0 0.4375rem;
    border-radius: 999px;
    background: var(--sunken);
    box-shadow: inset 0 0 0 0.0625rem var(--line);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.01em;
  }

  /* Текст плашки — цвет статуса, притемнённый к тексту: на мягкой подложке он держит контраст 4.5:1. */
  .status[data-status='published'] {
    background: var(--ok-soft);
    box-shadow: none;
    color: color-mix(in oklch, var(--ok), var(--text) 30%);
  }

  .status[data-status='scheduled'] {
    background: var(--warn-soft);
    box-shadow: none;
    color: color-mix(in oklch, var(--warn), var(--text) 35%);
  }

  /* Ещё не сохранена: пунктир, как у её узла, — страницы пока нет. */
  .status[data-status='new'] {
    background: transparent;
    box-shadow: none;
    outline: 0.0625rem dashed var(--field-line);
    outline-offset: -0.0625rem;
  }

  .when {
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    flex: none;
    width: 0.0625rem;
    height: 0.875rem;
    background: var(--line);
  }

  .id {
    display: inline-flex;
    flex: none;
    gap: 0.3em;
    align-items: baseline;
    color: var(--text);
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }

  .key {
    color: var(--muted);
  }

  /* Адрес на сайте — тихий: ссылкой его выдаёт значок, акцентом он становится под мышью. Сжимается сам,
     с многоточием; значок «открыть» остаётся видимым. */
  .path {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
    min-width: 0;
    color: var(--muted);
    font-family: var(--mono);
  }

  .path-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  a.path {
    border-radius: var(--radius-s);
    text-decoration: none;
    transition: color 140ms var(--ease);
  }

  a.path:hover {
    color: var(--accent);
  }

  a.path:hover .path-text {
    text-decoration: underline;
    text-decoration-thickness: 0.0625rem;
    text-underline-offset: 0.2em;
  }

  a.path :global(svg) {
    flex: none;
    width: 0.875rem;
    height: 0.875rem;
  }

  /* Точка сидит на залитой акцентом главной кнопке (она появляется только когда есть что сохранять),
     поэтому берёт цвет текста на акценте, а не сам акцент: иначе акцент-на-акценте — невидимый. */
  .dirty {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: var(--mark-text);
  }

  /* Вкладка «Документ»: тексты слева, место в дереве и меню — в узкой колонке справа, как в MODX. */
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 21rem);
    gap: 1.5rem 2.5rem;
  }

  .main-column,
  .side-column {
    display: grid;
    align-content: start;
    gap: 1.25rem;
  }

  /* Колонка — часть той же панели, а не карточка в карточке: отделена линией, как в MODX. */
  .side-column {
    padding-left: 2.5rem;
    border-left: 0.0625rem solid var(--line);
  }

  .side-column h2 {
    margin: 0 0 -0.375rem;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .side-column h2:not(:first-child) {
    margin-top: 0.75rem;
  }

  /* Публикация — строкой статуса, без рамки: колонка и так часть холстины. */
  .publishing {
    display: grid;
    gap: 0.35rem;
    font-size: 0.875rem;
  }

  .state {
    display: flex;
    gap: 0.55rem;
    align-items: baseline;
    margin: 0;
    font-weight: 550;
  }

  /* Узел статуса — общий класс темы; здесь только выравнивание по первой строке текста. */
  .state .status-node {
    align-self: flex-start;
    margin-top: 0.42em;
  }

  .schedule {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    margin: 0;
    color: var(--muted);
  }

  .side-column h2 + label {
    margin-top: 0;
  }

  /* Заголовок — главное поле страницы: крупно, как заголовок документа. */
  .title-input {
    min-width: 0;
    min-height: 3rem;
    font-size: 1.375rem;
    font-weight: 600;
  }

  /* Адрес: начало от родителя видно, правится только своя часть. */
  .address {
    display: flex;
    align-items: stretch;
    overflow: hidden;
    border: 0.0625rem solid var(--field-line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .address:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 0.1875rem color-mix(in oklch, var(--accent) 22%, transparent);
  }

  .address.invalid {
    border-color: var(--danger);
  }

  .prefix {
    display: flex;
    align-items: center;
    max-width: 55%;
    padding: 0 0.625rem 0 0.75rem;
    background: var(--sunken);
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-weight: 400;
    white-space: nowrap;
  }

  .prefix span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .address input {
    min-width: 6rem;
    border: 0;
    border-radius: 0;
    font-family: var(--mono);
    font-size: 0.875rem;
  }

  .address input:focus {
    box-shadow: none;
  }

  .tab-intro {
    margin: 0;
  }

  /* Поля страницы — в две широкие колонки: подпись, поле и подсказка читаются как форма, а не таблица. */
  .page-fields {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: 1.5rem 2rem;
    max-width: 56rem;
  }

  .content {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .content h2 {
    font-size: 0.875rem;
    font-weight: 550;
  }

  .seo {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 24rem);
    gap: 1.5rem 2rem;
  }

  .seo-fields,
  .previews {
    display: grid;
    align-content: start;
    gap: 1rem;
  }

  /* Длиннее рекомендуемого — предупреждение: сохранить можно, поисковик просто обрежет. */
  .over {
    color: var(--warn);
  }

  figure {
    margin: 0;
    padding: 0.9rem 1rem;
    border-radius: var(--radius);
    background: var(--sunken);
  }

  figcaption {
    margin-bottom: 0.5rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  figure p {
    margin: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .snippet-url,
  .card-host {
    color: var(--muted);
    font-size: 0.75rem;
  }

  .snippet-title {
    color: var(--accent);
    font-size: 1.0625rem;
    line-height: 1.3;
  }

  .snippet-text,
  .card-text {
    display: -webkit-box;
    overflow: hidden;
    font-size: 0.8125rem;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .snippet-hidden {
    margin-top: 0.4rem;
    color: var(--danger);
    font-size: 0.75rem;
  }

  .card img,
  .card-empty {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1.91 / 1;
    margin-bottom: 0.5rem;
    border-radius: calc(var(--radius) - 0.0625rem);
    background: var(--line);
    color: var(--muted);
    font-size: 0.75rem;
    object-fit: cover;
  }

  .card-title {
    font-weight: 600;
  }

  .old-paths {
    display: grid;
    gap: 0.5rem;
    padding-top: 1.25rem;
    border-top: 0.0625rem solid var(--line);
  }

  .old-paths h2 {
    font-size: 0.9375rem;
  }

  .old-paths p {
    margin: 0;
  }

  .old-paths ul {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .old-paths li {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .old-paths .icon {
    width: 2rem;
    min-height: 2rem;
  }

  .translations {
    display: grid;
    gap: 0.375rem;
  }

  .translations ul {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .translations li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
  }

  .translations .label {
    font-weight: 600;
  }

  .translations .lang {
    min-width: 2.5rem;
  }

  .banner {
    margin: 0;
    padding: 0.75rem 1rem;
    border: 0.0625rem solid color-mix(in oklch, var(--danger) 40%, var(--line));
    border-radius: var(--radius);
    background: color-mix(in oklch, var(--danger) 6%, var(--surface));
  }

  .banner:focus {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  .wide {
    display: grid;
    gap: 0.3rem;
    grid-column: 1 / -1;
  }

  /* Закреплённая шапка не закрывает поле, на которое перешёл фокус. */
  :global(html:has(.page-editor)) {
    scroll-padding-top: 9rem;
  }

  /* Колонки — по ширине панели, а не окна: при открытом дереве на 1024 им тесно. */
  @container (width < 46rem) {
    .columns,
    .seo {
      grid-template-columns: minmax(0, 1fr);
    }

    .side-column {
      padding: 1.5rem 0 0;
      border-top: 0.0625rem solid var(--line);
      border-left: 0;
    }
  }

  /* Телефон: действия закреплены внизу экрана — «Сохранить» всегда под рукой. */
  @media (width < 48rem) {
    form :global(.page-bar .actions) {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 16;
      justify-content: flex-end;
      padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
      border-top: 0.0625rem solid var(--line);
      background: var(--bg);
    }

    /* Вложенную страницу, копию и корзину на телефоне делают из меню дерева: в строке остаётся главное. */
    form :global(.page-bar .actions :is(.child, .duplicate, .share, [data-act='trash'])) {
      display: none;
    }

    form :global(.page-bar .actions .icon) {
      flex: none;
    }

    form :global(.page-bar .actions button) {
      white-space: nowrap;
    }

    :global(html:has(.page-editor)) {
      scroll-padding-top: 1rem;
      scroll-padding-bottom: 4.5rem;
    }
  }
</style>
