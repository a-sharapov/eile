// Контракт JSON API менеджера (src/contexts/manager/interface/api.ts).

import type { Language } from './i18n.ts';

export type Role = 'admin' | 'editor';

export type User = { id: number; email: string; name: string; role: Role };

export type ColorScheme = 'system' | 'light' | 'dark';

/** Оформление менеджера у пользователя: акцент (`#rrggbb`), схема и язык; null — как просит браузер. */
export type Appearance = {
  accent: string;
  scheme: ColorScheme;
  language: Language | null;
};

export type Session = {
  user: User | null;
  setup: boolean;
  appearance: Appearance | null;
  site: { name: string; url: string };
  /** Подключён ИИ — у полей есть «Сгенерировать с ИИ». */
  ai: boolean;
  aiVision: boolean;
  /** Версия программы — в меню профиля. */
  version: string;
  /** Почта уведомлений настроена: на входе есть «Забыли пароль?». */
  passwordReset: boolean;
  /** Новая версия программы — только администратору; null — новее нет или проверка выключена. */
  update: UpdateInfo | null;
};

/** Есть версия новее установленной. */
export type UpdateInfo = { current: string; latest: string; url: string };

/** Расписание автокопий: каждые `every` часов от `at`, хранить `keep` последних. */
export type BackupSchedule = {
  enabled: boolean;
  every: 1 | 6 | 12 | 24;
  at: string;
  keep: number;
  folder: string;
};

/** Автокопии и обновления: GET /upkeep. */
export type UpkeepStatus = {
  backups: {
    schedule: BackupSchedule;
    folder: string;
    last: { at: string; file: string; size: number; manual: boolean } | null;
    failure: { at: string; message: string } | null;
    next: string | null;
    running: boolean;
  };
  updates: UpdateStatus;
};

export type UpdateStatus = {
  enabled: boolean;
  locked: boolean;
  current: string;
  latest: UpdateInfo | null;
  checkedAt: string | null;
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
  /** Язык с учётом ветки и сайта. */
  language: string;
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
  /** Исходная страница, если эта — её перевод. */
  translationOf: number | null;
  fields: Record<string, FieldValue>;
};

/** Страница из набора переводов: исходная первой. */
export type TranslationNode = {
  id: number;
  title: string;
  /** Пусто — язык сайта. */
  language: string;
  published: boolean;
  trashed: boolean;
  original: boolean;
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
  /** Набор переводов; пусто — у страницы нет переводов. */
  translations: TranslationNode[];
  /** Что возьмут пустые наследуемые поля и у какой страницы. */
  inherited?: Record<
    string,
    { value: FieldValue; from: { id: number; title: string } }
  >;
};

/** Что помнит история страницы (content/domain/revision.ts REVISION_KEYS). */
export type RevisionKey =
  | 'kind'
  | 'title'
  | 'longTitle'
  | 'menuTitle'
  | 'description'
  | 'introText'
  | 'alias'
  | 'template'
  | 'contentType'
  | 'content'
  | 'linkTo'
  | 'socialImage'
  | 'language';

/** Версия страницы: какой она была до правки `at`; `changed` — ключи и `fields.имя`. */
export type RevisionSummary = {
  id: number;
  pageId: number;
  action: 'edited' | 'restored';
  /** null — правка сайта: каркас, импорт, плагин. */
  author: { id: number; name: string } | null;
  at: string;
  changed: string[];
  restoredFrom: string | null;
  size: number;
};

export type Revision = RevisionSummary & {
  snapshot: Pick<Page, RevisionKey | 'fields'>;
};

export type ElementKind = 'template' | 'component' | 'script';

export type ElementSummary = {
  kind: ElementKind;
  name: string;
  revision: number;
};

/** У скрипта — ещё и адрес текущей версии: `/_cms/scripts/<имя>.<хэш>.js`. */
export type Element = ElementSummary & { source: string; url?: string | null };

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
  /** Синонимы для поиска по сайту: строка — группа, варианты через запятую. */
  searchSynonyms: string;
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
  /** null — язык сайта. */
  language: 'en' | 'de' | 'ru' | null;
  gateway: GatewayStatus;
};

/** Токен почтового шлюза без самого токена: его видно только при выпуске. */
export type GatewayToken = {
  id: string;
  label: string;
  hint: string;
  createdAt: string;
  usedAt: string | null;
};

export type GatewayOutcome =
  | 'sent'
  | 'disabled'
  | 'smtp_not_ready'
  | 'rate_limited'
  | 'unauthorized'
  | 'invalid_json'
  | 'too_large'
  | 'from_misconfigured'
  | 'to_required'
  | 'too_many_recipients'
  | 'subject_required'
  | 'body_required'
  | 'recipient_not_allowed'
  | 'send_failed';

/** Запрос к шлюзу в журнале: без адресов и темы. */
export type GatewayEntry = {
  at: string;
  token: string | null;
  recipients: number;
  attachments: number;
  outcome: GatewayOutcome;
};

/** Поля шлюза в общей форме уведомлений: сохраняются вместе с ней. */
export type GatewayForm = {
  on: boolean;
  path: string;
  rateLimit: string;
  senders: string;
  domains: string;
};

/** Почтовый шлюз: настройки, что готово и последние запросы. */
export type GatewayStatus = {
  enabled: boolean;
  path: string;
  rateLimit: number;
  senders: string[];
  domains: string[];
  tokens: GatewayToken[];
  checks: { enabled: boolean; token: boolean; sender: boolean; smtp: boolean };
  ready: boolean;
  recent: GatewayEntry[];
  /** Опубликованная страница с тем же адресом: шлюз её перекрывает. */
  shadows: { id: number; title: string } | null;
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
  | 'hidden'
  | 'file';

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
/** Сертификат HTTPS, который выпускает сам сервер (`--domain`); null — HTTPS не его забота. */
export type HttpsStatus = {
  domains: string[];
  notAfter: string | null;
  issuedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string;
  staging: boolean;
};

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

/** Правило переадресации: откуда, куда, код, заметка и сколько раз сработало. */
export type RedirectRule = {
  id: number;
  from: string;
  to: string;
  status: 301 | 302;
  note: string;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Прежний адрес страницы: с него сайт сам отвечает 301 на новый. */
export type MovedAddress = {
  path: string;
  pageId: number;
  title: string;
  movedAt: string;
};

export type RuleWarning = { code: string; detail: string };

export type SavedRule = { rule: RedirectRule; warnings: RuleWarning[] };

export type RedirectsImport = {
  added: number;
  updated: number;
  skipped: { line: number; code: string; message: string }[];
};

export type FindingSeverity = 'error' | 'warning' | 'info';
export type DiagnosticsGroup =
  | 'links'
  | 'pages'
  | 'media'
  | 'settings'
  | 'server';

/** Находка диагностики: что не так, почему важно и где это править. */
export type Finding = {
  id: string;
  group: DiagnosticsGroup;
  severity: FindingSeverity;
  title: string;
  hint: string;
  items: { label: string; detail?: string; fix?: { href: string } }[];
  count: number;
  fix?: { href: string };
};

export type DiagnosticsReport = {
  generatedAt: string;
  problems: number;
  tookMs: number;
  findings: Finding[];
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
  /** Письмо отправителю: адрес из поля, тема и текст с подстановками. */
  confirmation: {
    enabled: boolean;
    field: string;
    subject: string;
    text: string;
  };
  /** Вебхук: секрет выдаёт сервер; `renew` — попросить новый при сохранении. */
  webhook: { url: string; secret: string; renew?: boolean };
  createdAt: string;
  fields: FieldSpec[];
};

/** Доставка уведомления или письма из очереди. */
export type DeliveryRow = {
  id: number;
  channel: ChannelKind;
  recipient: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError: string;
  sentAt: string | null;
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
  /** `raw` — только у скрытого поля с подписями: значение, как пришло; в `value` — его подпись. */
  values: {
    name: string;
    label: string;
    kind: FieldKind;
    value: string;
    raw?: string;
  }[];
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
  deliveries: DeliveryRow[];
  /** Письмо отправителю. */
  confirmations: DeliveryRow[];
  /** Как заявка ушла на вебхук формы; null — не уходила. */
  webhook: {
    url: string;
    status: 'pending' | 'delivered' | 'failed';
    attempts: number;
    lastError: string;
    deliveredAt: string | null;
  } | null;
  /** Присланные файлы: скачиваются по ссылке, содержимое в заявку не входит. */
  files: {
    id: number;
    field: string;
    name: string;
    type: string;
    size: number;
  }[];
};
