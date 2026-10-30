// Контракт JSON API менеджера (src/contexts/manager/interface/api.ts).

export type Role = 'admin' | 'editor';

export type User = { id: number; email: string; name: string; role: Role };

export type ColorScheme = 'system' | 'light' | 'dark';

/** Оформление менеджера у пользователя: акцент (`#rrggbb`) и схема. */
export type Appearance = { accent: string; scheme: ColorScheme };

export type Session = {
  user: User | null;
  setup: boolean;
  appearance: Appearance | null;
  site: { name: string; url: string };
  /** Подключён ИИ — у полей есть «Сгенерировать с ИИ». */
  ai: boolean;
  /** Версия программы — в меню профиля. */
  version: string;
};

/** Что сделали со страницей — строка журнала правок. */
export type PageAction =
  | 'created'
  | 'edited'
  | 'published'
  | 'unpublished'
  | 'moved'
  | 'trashed'
  | 'restored'
  | 'duplicated';

export type Activity = {
  pageId: number;
  action: PageAction;
  userId: number;
  userName: string;
  at: string;
};

export type PageKind = 'page' | 'link';

export type PageNode = {
  id: number;
  parentId: number | null;
  kind: PageKind;
  title: string;
  menuTitle: string;
  alias: string;
  template: string;
  /** MIME-тип ответа; не `text/html` — страница-файл. */
  contentType: string;
  published: boolean;
  trashed: boolean;
  menuIndex: number;
  hiddenFromMenu: boolean;
  publishAt: string | null;
  unpublishAt: string | null;
};

export type FieldValue = string | number | boolean;

export type Page = {
  id: number;
  parentId: number | null;
  kind: PageKind;
  title: string;
  longTitle: string;
  menuTitle: string;
  description: string;
  introText: string;
  alias: string;
  template: string;
  contentType: string;
  content: string;
  linkTo: string;
  published: boolean;
  publishAt: string | null;
  unpublishAt: string | null;
  publishedAt: string | null;
  trashedAt: string | null;
  menuIndex: number;
  hiddenFromMenu: boolean;
  cacheable: boolean;
  searchable: boolean;
  socialImage: string;
  language: string;
  fields: Record<string, FieldValue>;
};

export type FieldType =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'image';

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  options: string[];
  defaultValue: FieldValue | null;
  inherit: boolean;
  templates: string[];
};

export type PageDetails = {
  page: Page;
  view: { path: string } | null;
  fields: Field[];
  /** Прежние адреса, которые ведут сюда 301-й переадресацией. */
  oldPaths: string[];
  /** Что возьмут пустые наследуемые поля и у какой страницы. */
  inherited?: Record<
    string,
    { value: FieldValue; from: { id: number; title: string } }
  >;
};

export type ElementKind = 'template' | 'component';

export type ElementSummary = {
  kind: ElementKind;
  name: string;
  revision: number;
};

export type Element = ElementSummary & { source: string };

/** Компонент набора: missing — не установлен, installed — как в наборе, changed — правлен на сайте. */
export type KitItem = {
  name: string;
  description: string;
  requires: string[];
  state: 'missing' | 'installed' | 'changed';
};

/** Где используется элемент: страницы и элементы, которые его импортируют. */
export type PageRef = { id: number; title: string; trashed: boolean };

export type Usage = {
  pages: PageRef[];
  elements: string[];
};

export type Settings = {
  name: string;
  language: string;
  languages: string[];
  homePageId: number | null;
  notFoundPageId: number | null;
  siteUrl: string;
  description: string;
  socialImage: string;
  aiSearch: boolean;
  aiTraining: boolean;
  robots: string;
  /** Слово в адресе порций списка: page — /blog/page-2. */
  pagingSegment: string;
  /** canonical у порций 2, 3…: self — на саму порцию, first — на первую. */
  pagingCanonical: 'self' | 'first';
  /** Память сервера под кэш страниц, МБ. */
  pageCacheMb: number;
};

export type Plugin = {
  name: string;
  source: string;
  enabled: boolean;
  revision: number;
};

export type MediaFile = {
  path: string;
  contentType: string;
  size: number;
  hash: string;
  width: number | null;
  height: number | null;
  /** Описание картинки (alt). */
  alt: string;
};

export type PropValue = string | number | boolean;

export type PropSignature = {
  name: string;
  type: 'string' | 'number' | 'boolean';
  label: string;
  defaultValue: PropValue | null;
  required: boolean;
  options: { value: string; label: string }[];
};

/** Компонент, который можно вставить в контент блоком `[[Name …]]`. */
export type ComponentSignature = {
  name: string;
  description: string;
  props: PropSignature[];
};

/** Перевод: ключ `{i18n.key}` и текст на каждом языке сайта. */
export type Translation = { key: string; values: Record<string, string> };

/** Своя настройка: `[@key]` подставляет значение в шаблоны и контент. */
export type CustomSetting = { key: string; value: string };

/** Канал уведомлений. */
export type ChannelKind = 'telegram' | 'email';

export type Severity = 'critical' | 'error' | 'warning' | 'info';

export type Chat = { id: string; title: string };

/** Настройки уведомлений без токена и пароля: их сервер не отдаёт. */
export type NotifyStatus = {
  telegram: { chats: Chat[]; proxy: string; hasToken: true } | null;
  email: {
    host: string;
    port: number;
    security: 'tls' | 'starttls' | 'none';
    user: string;
    from: string;
    to: string[];
    hasPassword: boolean;
  } | null;
  forms: ChannelKind[];
  incidents: ChannelKind[];
  level: Severity;
};

/** Строка журнала сбоев: повторы — счётчиком. */
export type IncidentRecord = {
  id: number;
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
  firstAt: string;
  lastAt: string;
};

/** Строка очереди отправки. */
export type Delivery = {
  id: number;
  channel: ChannelKind;
  recipient: string;
  message: { title: string };
  source: string | null;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  nextAt: string;
  lastError: string;
  createdAt: string;
  sentAt: string | null;
};

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'range'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'consent'
  | 'hidden';

/** Поле формы, как его видит сервер по HTML. */
export type FieldSpec = {
  name: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  pattern: string | null;
  min: string | null;
  max: string | null;
  step: string | null;
  minLength: number | null;
  maxLength: number | null;
  multiple: boolean;
  options: { value: string; label: string }[];
  source: string | null;
  message: string | null;
};

/** Кэш страниц сайта: заполненность и ответы с запуска сервера или с ручного сброса. */
export type PageCacheStats = {
  pages: number;
  bytes: number;
  budget: number;
  hits: number;
  misses: number;
  bypass: number;
  since: string;
  manual: boolean;
};

export type FormSummary = {
  name: string;
  title: string;
  revision: number;
  updatedAt: string;
  fields: number;
};

export type FormDetail = FormSummary & {
  source: string;
  submitLabel: string;
  successText: string;
  successPage: number | null;
  subject: string;
  channels: ChannelKind[] | null;
  retentionDays: number;
  minSeconds: number;
  allowLinks: boolean;
  goal: string;
  createdAt: string;
  fields: FieldSpec[];
};

export type SourceChoice = { value: string; label: string; needsKey?: boolean };

export type SubmissionStatus = 'new' | 'in_work' | 'done' | 'spam';

/** Строка списка заявок. */
export type InboxRow = {
  id: number;
  form: string;
  formTitle: string;
  status: SubmissionStatus;
  read: boolean;
  createdAt: string;
  preview: string;
};

export type InboxSummary = {
  unread: number;
  today: number;
  week: number;
  byForm: { form: string; title: string; unread: number; total: number }[];
  daily: number[];
  latest: InboxRow[];
};

/** Заявка целиком: значения с подписями, контекст, доставка уведомлений. */
export type SubmissionDetail = {
  id: number;
  form: string;
  formTitle: string;
  values: { name: string; label: string; kind: FieldKind; value: string }[];
  context: {
    pageId: number | null;
    pageTitle: string;
    url: string;
    referrer: string;
    utm: Record<string, string>;
  };
  ip: string;
  userAgent: string;
  status: SubmissionStatus;
  note: string;
  readAt: string | null;
  createdAt: string;
  deliveries: {
    id: number;
    channel: ChannelKind;
    recipient: string;
    status: 'pending' | 'sent' | 'failed';
    attempts: number;
    lastError: string;
    sentAt: string | null;
  }[];
};
