import type { Rendered } from '../domain/document.ts';

export type { Rendered };

/** Скомпилированный элемент; что внутри, знает только рендерер. */
export type View = unknown;

/** Вид и ключи всех элементов его графа импортов: `template/Base`, `component/Menu`. */
export type LoadedView = {
  readonly view: View;
  readonly elements: readonly string[];
};

export type TemplateViews = {
  readonly template: (name: string) => Promise<LoadedView>;
  readonly component: (name: string) => Promise<LoadedView>;
  /** URL клиентского модуля острова. */
  readonly island: (name: string) => Promise<string>;
  /** URL модуля с `hydrate` рантайма Svelte. */
  readonly hydrator: () => Promise<string>;
};

export type ViewRenderer = {
  /** Синхронный SSR; `context` компоненты читают через getContext. */
  readonly render: (
    view: View,
    props: Readonly<Record<string, unknown>>,
    context: ReadonlyMap<string, unknown>,
    /** Оставить маркеры гидрации: HTML острова. */
    hydratable?: boolean
  ) => Rendered;
};

/** Место второй фазы: некэшируемый регион, остров или модуль (форма); рендерится на каждом запросе. */
export type Region = {
  readonly kind: 'uncached' | 'island' | 'module';
  readonly name: string;
  readonly props: Readonly<Record<string, unknown>>;
};

/** Первая фаза рендера: HTML с маркерами регионов. */
export type Snapshot = Rendered & {
  readonly regions: readonly Region[];
  /** Язык страницы для `<html lang>`; пусто — язык сайта. */
  readonly language?: string;
  /** Не `text/html` — страница-файл: вторая фаза не оборачивает её в документ. */
  readonly contentType: string;
};

export type CachedPage = {
  /** Страница без регионов хранится готовым документом, с регионами — снимком для второй фазы. */
  readonly content: { readonly html: string } | { readonly snapshot: Snapshot };
  readonly contentType: string;
  readonly tags: ReadonlySet<string>;
};

/** Готовые страницы по каноническому пути. */
export type PageCache = {
  readonly get: (path: string) => CachedPage | undefined;
  readonly set: (path: string, page: CachedPage) => void;
  /** Удаляет записи, у которых есть хоть один из тегов. */
  readonly invalidate: (tags: readonly string[]) => void;
  readonly clear: () => void;
  /** Сколько страниц лежит и сколько памяти они занимают из бюджета, в байтах. */
  readonly size: () => {
    readonly pages: number;
    readonly bytes: number;
    readonly budget: number;
  };
};

/** Кэш страниц для владельца сайта: заполненность и ответы с запуска сервера или с ручного сброса. */
export type PageCacheStats = ReturnType<PageCache['size']> & {
  readonly hits: number;
  readonly misses: number;
  /** Страницы, которые не кэшируются: снята галочка или шаблон читает запрос. */
  readonly bypass: number;
  readonly since: string;
  /** Счёт идёт с ручного сброса, а не с запуска. */
  readonly manual: boolean;
};

/** Хуки расширений: последнее слово о HTML и редирект вместо 404. */
export type Hooks = {
  readonly render: (
    html: string,
    context: { readonly path: string; readonly status: number }
  ) => Promise<string>;
  readonly notFound: (path: string) => Promise<string | null>;
};

/** Запрос посетителя глазами компонентов. */
export type RequestInfo = {
  readonly path: string;
  /** `https://example.com` — для абсолютных адресов, если в настройках не задан адрес сайта. */
  readonly origin: string;
  readonly query: Readonly<Record<string, string>>;
  readonly header: (name: string) => string | null;
  readonly cookie: (name: string) => string | null;
};

/** Переводы и свои настройки сайта — для `{i18n.key}`, `[@key]`, `t()` и `setting()`. */
export type Dictionary = {
  /** Текст ключа на языке (или на языке сайта); null — ключа нет. */
  readonly text: (key: string, language: string) => string | null;
  readonly value: (key: string) => string | null;
};

/** Страница, на которой стоит модуль: для скрытых полей формы и адреса возврата. */
export type ModulePage = {
  readonly id: number;
  readonly title: string;
  readonly path: string;
};

/** Модуль сайта по тегу `[#Form:callback]` или `$core/Form`: рисуется на каждом запросе. */
export type ModuleRenderer = (
  name: string,
  request: RequestInfo,
  page: ModulePage | null
) => Rendered;

export type Modules = Readonly<Record<string, ModuleRenderer>>;
