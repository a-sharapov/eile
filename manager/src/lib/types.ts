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
  offsite: OffsiteStatus;
  database: DatabaseStatus;
  /** Связанные папки: их файлы на диске сервера в копию базы не входят. */
  linked: LinkedFolder[];
};

export type LinkedFolder = {
  prefix: string;
  dir: string;
  present: boolean;
  files: number;
  bytes: number;
};

/** Хранилище S3 для копий вне сервера; секрет доступа и ключ копий менеджер не получает. */
export type OffsiteSettings = {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKey: string;
  virtualHosted: boolean;
  keep: number;
};

export type OffsiteStatus = {
  settings: OffsiteSettings;
  hasSecret: boolean;
  keyId: string | null;
  keyCreatedAt: string | null;
  last: { at: string; name: string; size: number } | null;
  failure: { at: string; message: string } | null;
  /** Только в ответе, который создал ключ копий: показать один раз. */
  recoveryKey?: string;
};

/** Копия в хранилище. */
export type RemoteCopy = { name: string; size: number; at: string | null };

/** Файл базы: размер, свободные страницы и последнее сжатие. */
export type DatabaseStatus = {
  size: number;
  free: number;
  worth: boolean;
  needs: number;
  diskFree: number | null;
  compacted: { at: string; before: number; after: number; ms: number } | null;
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
  /** Адрес на сайте со стилем адресов (ADR 0063); главную сайт отдаёт по `/`, её адрес — редиректом. */
  path: string;
  folder: boolean;
  aliasInPath: boolean;
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
  /** Папка (`isfolder` в Evo): при «адрес папки кончается на /» её адрес кончается на `/`. */
  folder: boolean;
  /** Алиас в адресах потомков (`alias_visible` в Evo); false — дети без него: /cities/riga → /riga. */
  aliasInPath: boolean;
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
  /** Окончание адреса страницы: пусто — /o-nas, `/` — /o-nas/, `.html` — /o-nas.html. */
  urlSuffix: string;
  /** Адрес папки кончается на `/`: /katalog/. */
  folderSlash: boolean;
  /** Плавные переходы между страницами сайта (View Transitions). */
  viewTransitions: boolean;
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
  /** Файл связанной папки на сервере: `file` — путь на диске, null — вариант размера (ADR 0065). */
  linked?: { prefix: string; file: string | null };
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
/** Своя настройка; пояснение — что это и где взять значение, видно только в менеджере. */
export type CustomSetting = { key: string; value: string; note: string };

/** Канал уведомлений. */
export type ChannelKind = 'telegram' | 'email';

export type Severity = 'critical' | 'error' | 'warning' | 'info';

export type Chat = { id: string; title: string };

/** Почтовый сервис с HTTP API — когда хостинг закрыл порты SMTP. */
export type MailProvider = 'brevo' | 'postmark' | 'mailgun' | 'resend' | 'ses';

/** Почта без пароля SMTP и без ключа API: от ключа сервер отдаёт только последние четыре знака. */
export type EmailStatus =
  | {
      transport: 'smtp';
      host: string;
      port: number;
      security: 'tls' | 'starttls' | 'none';
      user: string;
      from: string;
      to: string[];
      hasPassword: boolean;
    }
  | {
      transport: MailProvider;
      keyId: string;
      region: string;
      domain: string;
      stream: string;
      from: string;
      to: string[];
      keyHint: string;
    };

/** Настройки уведомлений без токена, пароля и ключа: их сервер не отдаёт. */
export type NotifyStatus = {
  telegram: { chats: Chat[]; proxy: string; hasToken: true } | null;
  email: EmailStatus | null;
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

/** Настройки статистики посещений: счёт, маячок ссылок-целей, срок хранения сводок и пояс суток. */
export type StatsSettings = {
  enabled: boolean;
  beacon: boolean;
  goalLinks: string[];
  /** 0 — хранить всегда. */
  retentionDays: number;
  /** IANA; пусто — пояс сервера. */
  timeZone: string;
};

export type StatsTotals = { visitors: number; views: number };

/** Строка разреза за период: у разрезов страницы visitors — 0, там считаются просмотры. */
export type StatsRow = StatsTotals & { value: string };

export type StatsDay = StatsTotals & { day: string };

/** Цель в разрезе: достигли (visitors) из посетителей с этим значением (base). */
export type GoalSlice = {
  value: string;
  visitors: number;
  events: number;
  base: number;
  rate: number;
};

/** Цель: заявка формы, ссылка-цель маячка или переход `/_cms/go/<код>`; у `go:` (любой переход) имя пустое. */
export type StatsGoal = {
  goal: string;
  kind: 'form' | 'link' | 'go';
  name: string;
  label: string;
  visitors: number;
  events: number;
  rate: number;
  sources: GoalSlice[];
  entries: GoalSlice[];
};

/** Отчёт статистики за период: дни включительно, `since` — первый день с данными. */
export type StatsReport = {
  from: string;
  to: string;
  today: string;
  since: string | null;
  enabled: boolean;
  totals: StatsTotals;
  previous: StatsTotals;
  daily: StatsDay[];
  pages: StatsRow[];
  languages: StatsRow[];
  sources: StatsRow[];
  referrers: StatsRow[];
  utmSources: StatsRow[];
  utmMediums: StatsRow[];
  utmCampaigns: StatsRow[];
  utmContents: StatsRow[];
  utmTerms: StatsRow[];
  entries: StatsRow[];
  devices: StatsRow[];
  browserLanguages: StatsRow[];
  goals: StatsGoal[];
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

export type ProofLevel = 'off' | 'light' | 'standard' | 'strong';

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
  /** Доказательство работы в браузере: выключено или сложность задачи (ADR 0053). */
  proof: ProofLevel;
  goal: string;
  /** Хранить ли с заявкой IP и браузер посетителя (ADR 0059). */
  storeClientInfo: boolean;
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
    /** `missing` — пришла из браузера без JS без доказательства работы. */
    proof?: 'missing';
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

/** Проверка правок агентов (ADR 0054): GET /review/settings. */
export type ReviewSettings = {
  agents: boolean;
  linkDays: number;
  /** Сколько предложений ждут решения во всех наборах. */
  pending: number;
};

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type ChangeSetStatus = 'open' | 'ready' | 'closed';

export type ReviewValue = string | number | boolean | null;

/** Строка сравнения «сейчас → предложено» — её считает сервер. */
export type ReviewDiffLine =
  | {
      kind: 'same' | 'old' | 'new';
      pieces: { text: string; changed: boolean }[];
    }
  | { kind: 'skip'; count: number };

export type ReviewChange = {
  key: string;
  before: ReviewValue;
  after: ReviewValue;
  /** Конфликт: каким место было, когда агент его увидел. */
  was?: ReviewValue;
  label?: string;
};

export type ReviewItem = {
  id: number;
  status: ProposalStatus;
  error: string;
  decidedBy: string;
  decidedAt: string | null;
  operations: string[];
  conflicts: string[];
  target:
    | { kind: 'page'; id: number; title: string; path: string; exists: boolean }
    | {
        kind: 'element';
        element: 'template' | 'component' | 'script';
        name: string;
      };
  changes: ReviewChange[];
  fields: ReviewChange[];
  tree: {
    before: { id: number; title: string } | null;
    after: { id: number; title: string } | null;
  } | null;
  content: ReviewDiffLine[] | null;
  source: ReviewDiffLine[] | null;
};

export type ChangeSetSummary = {
  id: number;
  agent: {
    userId: number;
    userName: string;
    tokenId: number | null;
    tokenName: string;
  };
  title: string;
  description: string;
  status: ChangeSetStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  closedAt: string | null;
  counts: Record<ProposalStatus, number>;
  conflicts: number;
  /** Страницы с ждущими предложениями: их показывает предпросмотр. */
  pages: number[];
};

export type ChangeSetView = ChangeSetSummary & { items: ReviewItem[] };

/** Ссылка предпросмотра в списке: целиком токен показан один раз, при создании. */
export type ShareLink = {
  id: number;
  target: { page: number; changeSet: number | null };
  label: string;
  createdBy: { id: number; name: string } | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  uses: number;
  live: boolean;
};

// Аналитика клиентского пути (ADR 0072): /manager/api/analytics/…

export type AnalyticsSettings = {
  enabled: boolean;
  /** Хранить историю столько месяцев после последнего события человека; 0 — бессрочно. */
  retentionMonths: number;
  /** Валюта отчётов, код ISO 4217; null — не задана. Задаёт только человек, вошедший в менеджер. */
  baseCurrency: string | null;
};

export type EventRole =
  | 'touch'
  | 'survey'
  | 'trial'
  | 'payment'
  | 'refund'
  | 'amendment'
  | 'lapse'
  | 'action'
  | 'summary'
  | 'erasure';

export type RoleSpec = {
  role: EventRole;
  subject: 'required' | 'forbidden';
  fields: { code: string; kind: string; required: boolean }[];
};

export type SetupGroup =
  | 'sender'
  | 'type'
  | 'property'
  | 'dictionary'
  | 'value'
  | 'schema'
  | 'referrer'
  | 'link'
  | 'milestone'
  | 'funnel';

type SetupBase = { name: string; note: string; archivedAt: string | null };

/** Ключ отправителя без самого ключа: подпись, последние четыре знака и даты. */
export type SenderKeyView = {
  id: number;
  sender: string;
  label: string;
  hint: string;
  createdAt: string;
  usedAt: string | null;
};

/** Ключ, как его выдают: сам ключ — только в этом ответе. */
export type IssuedSenderKey = SenderKeyView & { key: string };

export type AnalyticsSender = SetupBase & {
  code: string;
  enabled: boolean;
  /** Час сводки `ЧЧ:ММ` по UTC: к нему ждут сводку за прошедшие сутки; null — сводок не ждать. */
  summaryAt: string | null;
};

export type SenderView = AnalyticsSender & {
  keys: SenderKeyView[];
  hasKey: boolean;
};

export type EventType = SetupBase & {
  sender: string;
  code: string;
  role: EventRole;
  properties: { code: string; required: boolean }[];
};

export type PropertyKind =
  | 'string'
  | 'number'
  | 'money'
  | 'date'
  | 'boolean'
  | 'choice';

export type PropertyScope = 'event' | 'person';

/** Отметка сверки свойства: что ядро считает само и с чем сверяет присланное отправителем. */
export type ReconcileMark =
  | 'payment_number'
  | 'customer_since'
  | 'after_trial'
  | 'returning';

export type AnalyticsProperty = SetupBase & {
  scope: PropertyScope;
  code: string;
  kind: PropertyKind;
  dictionary: string | null;
  dimension: boolean;
  untrusted: boolean;
  /** Только у свойства событий нужного вида; одна отметка — у одного свойства сайта. */
  reconcile: ReconcileMark | null;
};

export type DictionaryPurpose = 'values' | 'answers' | 'parts';

export type UtmParameter =
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_content'
  | 'utm_term';

export type DictionaryValue = SetupBase & {
  dictionary: string;
  code: string;
  position: number;
  /** «Ждёт расхода» — только у значения части метки; у других назначений null. */
  awaitsSpend: boolean | null;
};

export type AnalyticsDictionary = SetupBase & {
  code: string;
  purpose: DictionaryPurpose;
  /** Часть метки: параметр UTM посещения; у других назначений null. */
  utm: UtmParameter | null;
  /** Часть метки: предел длины значения; у других назначений null. */
  length: number | null;
};

/** Части метки: код части → значение. */
export type Parts = Record<string, string>;

export type LabelSchema = SetupBase & {
  sender: string;
  separator: '__' | '--' | '.' | '~';
  length: number;
  parts: string[];
};

export type ReferrerRule = SetupBase & {
  code: string;
  kind: 'host' | 'any' | 'none';
  host: string | null;
  parts: Parts;
};

export type GoLink = SetupBase & {
  code: string;
  sender: string;
  target: string;
  parts: Parts;
};

export type MilestoneCondition =
  | { property: string; gte: number }
  | { property: string; eq: string | number | boolean };

export type Milestone = SetupBase & {
  code: string;
  sender: string;
  type: string;
  count: number;
  condition: MilestoneCondition | null;
  days: number | null;
  anchor: string | null;
  column: boolean;
  position: number;
};

export type FunnelStep =
  | { kind: 'visits'; page: string | null }
  | { kind: 'goal'; goal: string }
  | { kind: 'arrival' }
  | { kind: 'trial' }
  | { kind: 'payment'; number: number }
  | { kind: 'milestone'; milestone: string }
  | { kind: 'type'; sender: string; type: string };

export type Funnel = SetupBase & {
  code: string;
  strict: boolean;
  main: boolean;
  steps: FunnelStep[];
  position: number;
};

/** GET /analytics/setup: вся настройка; значения справочника, вехи и воронки — по порядку. */
export type SetupView = {
  revision: number;
  senders: SenderView[];
  types: EventType[];
  properties: AnalyticsProperty[];
  dictionaries: (AnalyticsDictionary & { values: DictionaryValue[] })[];
  schemas: LabelSchema[];
  referrers: ReferrerRule[];
  links: GoLink[];
  milestones: Milestone[];
  funnels: Funnel[];
  /** Встроенные проверки данных с поправками (этап 4); у старого сервера поля нет. */
  checks?: CheckView[];
  roles: RoleSpec[];
};

export type PersonState = 'new' | 'trial' | 'customer' | 'returned' | 'lapsed';

/** Касание и отправитель события, которое его принесло: метка разбирается по схеме этого отправителя. */
export type Touch = { label: string; at: string; sender: string };

/** Деньги по валютам в минимальных единицах: `{ EUR: 10900 }`. */
export type Amounts = Record<string, number>;

/** Возвращение: оплата после конца доступа, касание возврата и его части. */
export type ReturnFact = { at: string; touch: Touch | null; parts: Parts };

/** Веха на момент чтения: достиг, ещё в окне, не достиг; окно — от `from` до `until`. */
export type MilestoneView = {
  state: 'reached' | 'open' | 'missed';
  reachedAt: string | null;
  from: string | null;
  until: string | null;
};

/** Источник привлечения кодами: названия значений и ответа подставляет экран. */
export type Acquisition =
  | { kind: 'parts'; parts: Parts }
  | { kind: 'answer'; question: string; answer: string }
  | { kind: 'unknown' };

export type PersonFacts = {
  subject: string;
  test: boolean;
  senders: string[];
  firstAt: string;
  lastAt: string;
  events: number;
  invalid: number;
  /** Приход: первое касание, без касаний — первое событие. */
  arrivedAt: string;
  firstTouch: Touch | null;
  firstTouchConflict: boolean;
  lastTouch: Touch | null;
  firstParts: Parts;
  lastParts: Parts;
  acquisition: Acquisition;
  answers: Record<string, { answer: string; text: string | null; at: string }>;
  trialAt: string | null;
  trialEndsAt: string | null;
  payments: number;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
  paidUntil: string | null;
  firstTermEnd: string | null;
  lapsedAt: string | null;
  returnedAt: string | null;
  returns: ReturnFact[];
  revenue: Amounts;
  fees: Amounts;
  milestones: Record<string, MilestoneView>;
  /** Свойство-разрез → значение самого раннего события, тип которого его объявляет. */
  dims: Record<string, string | number | boolean>;
  traits: Record<string, string | number | boolean | null>;
};

export type PersonListed = PersonFacts & { state: PersonState };

export type PeoplePage = {
  people: PersonListed[];
  total: number;
  /** Людей, которых фон ещё пересчитывает по новой настройке. */
  stale: number;
};

export type AnalyticsEvent = {
  seq: number;
  sender: string;
  id: string;
  type: string;
  /** Название из справочника; null — незнакомый тип. */
  name: string | null;
  role: EventRole | null;
  at: string;
  receivedAt: string;
  subject: string | null;
  test: boolean;
  origin: 'http' | 'file';
  future: boolean;
  fields: Record<string, string | number | boolean>;
};

export type EventsPage = { events: AnalyticsEvent[]; next: number | null };

/** Событие с телом как пришло: экран показывает его только текстом. */
export type RawEvent = Omit<AnalyticsEvent, 'fields'> & { body: string };

export type ConflictEntry = {
  sender: string;
  id: string;
  count: number;
  firstAt: string;
  lastAt: string;
};

export type PersonCard = {
  person: PersonFacts & {
    /**
     * Оплаты больше нуля и возвраты меньше: момент, валюта, сумма в минимальных единицах; у возврата — момент
     * курса, момент его оплаты (нет — свой).
     */
    money: [at: string, currency: string, amount: number, pricedAt?: string][];
    /** Комиссии по времени: момент оплаты (уточнение без оплаты — свой), валюта комиссии, сумма. */
    feeMoney: [at: string, currency: string, fee: number][];
    /** Отрезки доступа: от оплаты до конца срока или «конца доступа»; null — конца ещё нет. */
    access: [from: string, to: string | null][];
    /** `отправитель/тип` → момент первого события. */
    firsts: Record<string, string>;
    unmatched: number;
  };
  state: PersonState;
  events: AnalyticsEvent[];
  next: number | null;
  conflicts: ConflictEntry[];
};

export type UnknownReport = {
  types: { sender: string; type: string; lastAt: string; count: number }[];
  questions: { question: string; count: number }[];
  answers: { question: string; answer: string; count: number }[];
  values: { property: string; value: string; count: number }[];
  traits: { trait: string; value: string; count: number }[];
  /** Значения частей меток не из справочника: счёт — первые и последние касания людей. */
  parts: { sender: string; part: string; value: string; count: number }[];
  /** Метки первых касаний не из реестра, после чистки: счёт — люди; до 1000 самых частых. */
  labels: { sender: string; label: string; count: number }[];
};

/** Доля: засчитанные из знаменателя; `open` — «ещё в окне», в знаменатель не входят. */
export type Share = { count: number; base: number; open: number };

/** «Мало данных»: новых людей меньше 30, новых клиентов меньше 10 (у `return` — вернувшихся меньше 10). */
export type LowData = { people: boolean; customers: boolean };

/** Пороги «мало данных» из настройки (`low_data`): шапка каждого отчёта. */
export type LowDataThresholds = { people: number; customers: number };

/** Значение строки: код; `~none` — не указано, `~unknown` — не из справочника (у `label` — не из реестра), `~rest` — остальные. */
export type ReportValue = string;

/**
 * Столбец «Источников», который есть у сайта; у вехи — код и название. Деньги этапа 3 — после «Продления»:
 * LTV — при роли «оплата» и базовой валюте, расход и цена человека — ещё и при строках расхода у сайта, CAC,
 * LTV / CAC и окупаемость — при всём этом. `payment7`, `payment30` — столбцы когорт по приходу.
 */
export type SourcesColumn =
  | {
      kind:
        | 'people'
        | 'trial'
        | 'payment'
        | 'customers'
        | 'revenue'
        | 'perCustomer'
        | 'renewal'
        | 'ltvCustomer'
        | 'ltvPerson'
        | 'spend'
        | 'cac'
        | 'costPerPerson'
        | 'ltvCac'
        | 'payback'
        | 'returned'
        | 'payments'
        | 'payment7'
        | 'payment30';
    }
  | { kind: 'milestone'; code: string; name: string };

/** Срок жизни LTV в месяцах; 0 — всё время. */
export type Lifetime = 0 | 3 | 6 | 12;

/** Выручка до комиссии (`gross`, по умолчанию) или после (`net`). */
export type FeesMode = 'gross' | 'net';

/** С чем сравнить: прошлый период той же длины встык или те же дни годом раньше. */
export type CompareKind = 'previous' | 'year';

/** LTV: выручка проживших срок на одного; `open` — ещё живут срок, в знаменатель не входят. */
export type Ltv = {
  /** Минимальные единицы базовой валюты; null — не прожил никто. */
  value: number | null;
  revenue: BaseSum;
  base: number;
  open: number;
  /** Проживших меньше 10 клиентов или 30 людей. */
  low: boolean;
};

/** Окупаемость: за сколько месяцев жизни (0 — сразу, CAC ноль; null — ещё нет); `lived` — у самого старого клиента. */
export type Payback = { months: number | null; lived: number };

/** Строка «Источников» при `attribution=first`; столбца нет у сайта — null. Итог — та же строка с пустым `value`. */
export type SourcesRow = {
  value: ReportValue;
  name: string | null;
  people: number;
  milestones: Record<string, Share>;
  trial: Share | null;
  /** Оплата за окно: первая оплата не позже прихода + окно. */
  payment: Share | null;
  customers: number | null;
  /** Оплаты минус возвраты периода по валютам; `{}` — денег не было, `{ EUR: 0 }` — было, в сумме ноль. */
  revenue: Amounts | null;
  perCustomer: { payments: number; customers: number } | null;
  renewal: Share | null;
  /** Выручка одной цифрой в базовой валюте; null — нет базовой валюты или роли «оплата». У строки без денег — ноль: «—» по пустому `revenue`. */
  revenueBase: BaseSum | null;
  ltvCustomer: Ltv | null;
  ltvPerson: Ltv | null;
  /** Расход строки долей дней; null — строк расхода у строки нет или расход не разложить (`spend.scope`). */
  spend: BaseSum | null;
  /** Значение «ждёт расхода» без расхода в периоде: «расход не введён», а не «—». */
  spendMissing: boolean;
  /** Расход / новые клиенты; расход есть, клиентов нет — null («нет клиентов»). */
  cac: number | null;
  costPerPerson: number | null;
  /** До сотых; CAC ноль — null («бесплатно»). */
  ltvCac: number | null;
  payback: Payback | null;
  lowData: LowData;
};

/** Строка «Источников» при `attribution=return`: оплаты и выручка — от возвращения до конца периода. */
export type ReturnRow = {
  value: ReportValue;
  name: string | null;
  returned: number;
  payments: number;
  revenue: Amounts;
  /** Выручка с возвращения в базовой валюте; null — нет базовой валюты. */
  revenueBase: BaseSum | null;
  lowData: LowData;
};

/** Расход отчёта: где он, почему не по строкам, разложен ли по дням, что не разложено. */
export type SpendSummary = {
  /** `rows` — по строкам; `total` — только итог (группа не по части); `none` — нигде (фильтр не по части, возврат). */
  scope: 'rows' | 'total' | 'none';
  reason: 'group' | 'filter' | 'return' | null;
  /** Период не по границам месяцев: «расход разложен по дням периода». */
  prorated: boolean;
  /** Расход без части группы: в итоге, ни в одной строке. */
  unassigned: BaseSum | null;
  /** Расход шире фильтра: не учтён нигде. */
  broader: BaseSum | null;
};

/** Шапка отчёта: дни — в поясе статистики. */
export type ReportHead = {
  from: string;
  to: string;
  timeZone: string;
  asOf: string;
  /** Людей ещё в пересчёте: больше нуля — экран пишет «пересчитывается». */
  stale: number;
  /** `part.<код>` и прочие → значение. */
  filters: Record<string, string>;
  test: boolean;
  /** Пороги, по которым приглушены строки этого ответа. */
  lowData: LowDataThresholds;
};

/** GET /analytics/sources: и `life`, `fees`, `compare`. */
export type SourcesReport = ReportHead & {
  group: string;
  window: 0 | 7 | 30;
  /** null — базовой валюты нет: экран просит её задать, денег одной цифрой нет. */
  baseCurrency: string | null;
  life: Lifetime;
  fees: FeesMode;
  /** Только при `fees=net`: «комиссия известна у 2 из 10 оплат». */
  feeCoverage: { payments: number; withFee: number } | null;
  /** null — у сайта нет строк расхода или базовой валюты: «Введите расходы, чтобы увидеть CAC и окупаемость». */
  spend: SpendSummary | null;
  /** Итог прошлого периода той же формы, что `total`. */
  compare: {
    kind: CompareKind;
    from: string;
    to: string;
    total: SourcesRow | ReturnRow;
  } | null;
} & (
    | {
        attribution: 'first';
        columns: SourcesColumn[];
        total: SourcesRow;
        rows: SourcesRow[];
        daily: { day: string; people: number; customers: number }[];
      }
    | {
        attribution: 'return';
        columns: SourcesColumn[];
        total: ReturnRow;
        rows: ReturnRow[];
        daily: { day: string; returned: number }[];
      }
  );

/** Деньги шага «оплата номер N»: по валютам и на человека; в базовой валюте — суммой и на заплатившего; до комиссии. */
export type StepMoney = {
  amounts: Amounts;
  perPerson: Amounts;
  base: BaseSum | null;
  perPersonBase: number | null;
};

/** Шаг воронки в отчёте; у шага-посещения при выключенном счёте посещений `count` — null. */
export type FunnelStepReport = {
  step: FunnelStep;
  side: 'visits' | 'people';
  count: number | null;
  open: number;
  skipped: number;
  /** Шаг «оплата номер N». */
  money: StepMoney | null;
  /** Шаг-посещение не получил части фильтров (признак, свойство, ответ, отправитель, страница входа). */
  unfiltered: boolean;
  lowData: boolean;
};

/** GET /analytics/funnel: и `compare`. */
export type FunnelReport = ReportHead & {
  funnel: { code: string; name: string; strict: boolean; main: boolean };
  baseCurrency: string | null;
  steps: FunnelStepReport[];
  /** С какого дня у сводок посещений есть разрез источника. */
  visitsSince: string | null;
  /** Шаги прошлого периода по порядку шагов: числа и деньги, обе стороны. */
  compare: {
    kind: CompareKind;
    from: string;
    to: string;
    steps: { count: number | null; money: StepMoney | null }[];
  } | null;
};

/** Итоги «Обзора» за период, без фильтров. */
export type OverviewTotals = {
  people: number;
  /** null — у сайта нет роли «оплата». */
  customers: number | null;
  /** До комиссии, по валютам. */
  revenue: Amounts | null;
  revenueBase: BaseSum | null;
  /** После комиссии; null — нет базовой валюты или ни у одной оплаты сайта нет комиссии. */
  revenueNet: BaseSum | null;
  /** Клиенты с доступом в конце периода (не позже «сейчас»); null — у сайта нет данных о доступе. */
  active: number | null;
  /** Все строки расхода долей дней; null — нет базовой валюты, строк у сайта или в периоде. */
  spend: BaseSum | null;
  cac: number | null;
};

/** GET /analytics/overview: период (по умолчанию 30 дней) и `test`; прошлый период той же длины — всегда. */
export type OverviewReport = ReportHead & {
  baseCurrency: string | null;
  current: OverviewTotals;
  previous: OverviewTotals;
  compare: { from: string; to: string };
  /** Смены версий отправителей с сутками сводки в периоде — отметки на графике. */
  versions: VersionMark[];
};

/** Когорты по первой оплате или по приходу. */
export type CohortBasis = 'payment' | 'arrival';

export type CohortMetric = 'cumulative' | 'monthly' | 'active';

/** Полная — прожили все; неполная — не все или месяц ещё идёт (в среднее не входит); будущая — пустая. */
export type CohortState = 'complete' | 'incomplete' | 'future';

export type CohortCell = {
  state: CohortState;
  /** Прожили месяц k целиком: «1 из 2» — `base` из `customers` строки. */
  base: number;
  /** Деньги — минимальные единицы базовой валюты на клиента; `active` — сколько с доступом из `base`. */
  value: number | null;
  unpriced: boolean;
  staleRate: boolean;
};

export type CohortRow = {
  /** Месяц первой оплаты, `ГГГГ-ММ`. */
  month: string;
  customers: number;
  /** Месяц ещё идёт: «идёт». */
  open: boolean;
  lowData: boolean;
  /** Месяцы жизни 0–12. */
  cells: CohortCell[];
};

/** Среднее месяца жизни по полным ячейкам без сумм без курса; у `active` — сколько с доступом из `customers`. */
export type CohortAverage = {
  value: number | null;
  cohorts: number;
  customers: number;
};

export type ArrivalCohortRow = {
  /** Месяц прихода; у среднего — пусто. */
  month: string;
  people: number;
  open: boolean;
  lowData: boolean;
  milestones: Record<string, Share>;
  trial: Share | null;
  payment7: Share | null;
  payment30: Share | null;
  /** Клиенты на сегодня. */
  customers: number | null;
};

/** GET /analytics/cohorts: период (по умолчанию `days=365`), `basis`, `metric`, `fees`, фильтры, `test`. */
export type CohortsReport =
  | (ReportHead & {
      basis: 'payment';
      metric: CohortMetric;
      /** Показатели, которые есть у сайта: `active` — с ролью «конец доступа» или `paid_until`. */
      metrics: CohortMetric[];
      fees: FeesMode;
      baseCurrency: string | null;
      rows: CohortRow[];
      average: CohortAverage[];
    })
  | (ReportHead & {
      basis: 'arrival';
      columns: SourcesColumn[];
      rows: ArrivalCohortRow[];
      average: ArrivalCohortRow;
    });

/** GET /analytics/milestones: вехи не в архиве по порядку — какая лучше предсказывает оплату. */
export type MilestoneComparison = ReportHead & {
  window: 0 | 7 | 30;
  people: number;
  milestones: {
    code: string;
    name: string;
    reached: number;
    missed: number;
    open: number;
    paidReached: Share | null;
    paidMissed: Share | null;
    lowData: boolean;
  }[];
};

export type AnswersColumn = {
  value: ReportValue;
  name: string | null;
  people: number;
};

/** GET /analytics/answers: строки — значения группы, столбцы — ответы; `cells` — ответ → людей. */
export type AnswersReport = ReportHead & {
  group: string;
  question: string;
  columns: AnswersColumn[];
  total: AnswersColumn & { cells: Record<string, number> };
  rows: (AnswersColumn & { cells: Record<string, number> })[];
};

/** Метка реестра: из каких частей, чей переход, кто и когда выдал. */
export type RegisteredLabel = {
  sender: string;
  label: string;
  name: string;
  parts: Parts;
  link: string | null;
  author: { name: string; agent: boolean } | null;
  createdAt: string;
};

/** POST /analytics/labels: 201 — новая, 200 и `existing` — такая уже была. */
export type LabelIssued = RegisteredLabel & {
  existing: boolean;
  links: { direct: string | null; site: string | null };
};

/** GET /analytics/labels. */
export type LabelsPage = { labels: RegisteredLabel[]; total: number };

/** GET /analytics/labels/check. */
export type LabelCheck = {
  from: 'utm' | 'go' | 'link' | 'label';
  sender: string | null;
  label: string;
  link: string | null;
  parts: {
    part: string;
    value: string | null;
    state: 'known' | 'archived' | 'unknown' | 'empty';
  }[];
  notes: ('invalid' | 'extra' | 'length' | 'schema')[];
  registered: RegisteredLabel | null;
};

export type IntakeRefusal = {
  at: string;
  reason: 'invalid' | 'unauthorized' | 'throttled';
  sender: string | null;
  id: string | null;
  errors: Record<string, string>;
};

export type IntakeSummary = {
  enabled: boolean;
  /** Принято событий с полуночи UTC. */
  today: number;
  lastAt: string | null;
  refusals: IntakeRefusal[];
};

/** Исход в счёте приёма: решение по событию, отметки `future` и `late` среди принятых, отказы 400, 401, 429, 503. */
export type TallyOutcome =
  | 'accepted'
  | 'duplicate'
  | 'conflict'
  | 'erased'
  | 'erasure'
  | 'future'
  | 'late'
  | 'invalid'
  | 'unauthorized'
  | 'throttled'
  | 'disabled';

/** Строка счёта приёма: сутки UTC приёма; отправитель `''` — ключ не узнан или не проверялся. */
export type IntakeDay = {
  day: string;
  sender: string;
  origin: 'http' | 'file';
  outcome: TallyOutcome;
  count: number;
};

/** GET /analytics/intake/daily: `days` (1–400), `from`, `to` — сутки UTC, по умолчанию 30. */
export type IntakeDaily = { from: string; to: string; days: IntakeDay[] };

/** Сводка отправителя за сутки UTC: последняя присланная за эти сутки. */
export type SummaryDay = {
  sender: string;
  day: string;
  test: boolean;
  seq: number;
  at: string;
  receivedAt: string;
  /** Код типа → число, как прислано. */
  counts: Record<string, number>;
  /** Валюта → минимальные единицы; null — отправитель выручку не шлёт. */
  revenue: Record<string, number> | null;
  failed: number | null;
  /** Версия после чистки; null — не прислана. */
  version: string | null;
};

/** Смена версии отправителя: сутки сводки, версия до и после, сошёлся ли счёт этого дня (null — не проверяли). */
export type VersionMark = {
  day: string;
  sender: string;
  name: string;
  from: string;
  to: string;
  matched: boolean | null;
};

/** GET /analytics/summaries: `sender`, `from`, `to` (сутки UTC, до 400), `test=1` — и тестовые. */
export type SummariesReport = {
  from: string;
  to: string;
  summaries: SummaryDay[];
  versions: VersionMark[];
};

/** Состояние строки дня проверки данных. */
export type CheckState = 'ok' | 'warning' | 'failure' | 'no_data';

/** Когда уведомлять: при сбое, при сбое и замечании, никогда. */
export type CheckNotify = 'failure' | 'any' | 'off';

/** Сутки строки: UTC, пояс отчётов, месяц. */
export type CheckZone = 'utc' | 'report' | 'month';

/** Показатель своей пороговой проверки. */
export type CheckMetric =
  | 'events'
  | 'role'
  | 'people'
  | 'customers'
  | 'revenue'
  | 'visitors'
  | 'goal';

/** Своя пороговая: показатель за 1, 7 или 30 суток пояса отчётов против порога. */
export type ThresholdRule = {
  metric: CheckMetric;
  sender: string | null;
  type: string | null;
  role: EventRole | null;
  goal: string | null;
  currency: string | null;
  compare: 'lt' | 'gt';
  /** Счёт; у выручки — минимальные единицы валюты правила. */
  threshold: number;
  days: 1 | 7 | 30;
  severity: 'warning' | 'failure';
};

/** Проверка: встроенная — с порогами ядра рядом с действующими, своя — с правилом. */
export type CheckView = {
  code: string;
  builtin: boolean;
  /** У встроенной пусто: название — по коду, на языке менеджера; у своей — владельца. */
  name: string;
  note: string;
  zone: CheckZone;
  /** null — не по расписанию: пороги «мало данных». */
  scope: 'sender' | 'site' | null;
  enabled: boolean;
  notify: CheckNotify;
  params: Record<string, number> | ThresholdRule;
  defaults: Record<string, number> | null;
  /** Есть поправка: её удаление возвращает значения ядра; у своей — false. */
  corrected: boolean;
  archivedAt: string | null;
};

/** Выписка месяца рядом с выручкой сайта: GET и PUT /analytics/statements. */
export type StatementView = {
  /** ГГГГ-ММ пояса отчётов. */
  month: string;
  currency: string;
  /** Минимальные единицы, со знаком. */
  amount: number;
  fees: 'gross' | 'net';
  note: string;
  site: number;
  difference: number;
  /** Расхождение в процентах от выписки; null — у выписки ноль. */
  share: number | null;
  author: { name: string; agent: boolean } | null;
  updatedAt: string;
};

export type StatementsReport = {
  from: string | null;
  to: string | null;
  statements: StatementView[];
};

export type StatementsSaved = {
  statements: StatementView[];
  created: number;
  changed: number;
};

/** Снятие вручную: кто, когда, агент ли, заметка о причине. */
export type CheckResolution = {
  at: string;
  by: string;
  agent: boolean;
  note: string;
};

/** Ячейка сетки «день × проверка». */
export type QualityCell = {
  day: string;
  state: CheckState;
  /** Причина кодом: missing, late, extra, intake_off, no_summary, low_volume, … */
  reason: string | null;
  value: number | null;
  resolved: CheckResolution | null;
  notified: boolean;
};

/** Строка сетки: проверка у отправителя (`scope`) или сайта (null). */
export type QualityRow = {
  check: string;
  scope: string | null;
  test: boolean;
  zone: CheckZone;
  /** Последний наступивший день и его состояние; null — строк ещё нет. */
  day: string | null;
  state: CheckState | null;
  lastOk: string | null;
  cells: QualityCell[];
};

/** Сверка сводки за сутки: по типам, валютам, неотправленные, версия. */
export type SummaryCheck = {
  sender: string;
  day: string;
  test: boolean;
  types: {
    type: string;
    /** null — тип незнаком настройке. */
    name: string | null;
    summary: number;
    site: number;
    erased: number;
    missing: number;
  }[];
  currencies: { currency: string; summary: number; site: number }[];
  failed: number | null;
  version: string | null;
};

/** Строка дня с подробностями; у проверок сводки — и сама сводка. */
export type CheckDayView = QualityCell & {
  check: string;
  scope: string | null;
  test: boolean;
  detail: Record<string, unknown>;
  version: string | null;
  evaluatedAt: string;
  summary: SummaryDay | null;
};

/** GET /analytics/quality: `days` (1–90, по умолчанию 30), `from`, `to`, `check`, `sender`, `test=1`, `detail=1`. */
export type QualityReport = {
  asOf: string;
  from: string;
  to: string;
  timeZone: string;
  /** Есть ли каналы сбоев с адресатами: без них уведомления не уходят. */
  channels: boolean;
  checks: CheckView[];
  rows: QualityRow[];
  summaries?: SummaryCheck[];
  open?: CheckDayView[];
  versions?: VersionMark[];
};

/** GET /analytics/quality/status: нерешённое в последние наступившие дни — для отметки в меню. */
export type QualityStatus = {
  failures: number;
  warnings: number;
  day: string | null;
};

/** Элемент в отчёте пробы набора: группа, ключ и название; у поправки встроенной проверки название пустое. */
export type SetItemNote = {
  group: SetupGroup | 'check';
  key: string;
  name: string;
};

export type SetWarning = {
  /** Путь в наборе: `senders[0]`; у правки элемента не из файла — пусто, у `newer_file` — `eile`. */
  path: string;
  code:
    | 'role_changed'
    | 'sender_created'
    | 'sender_disabled'
    | 'archive_kept'
    | 'summary_hour'
    | 'newer_file';
  message: string;
  group: SetupGroup | 'check' | null;
  key: string | null;
};

/**
 * POST /analytics/set/plan и POST /analytics/set: что создастся, изменится, останется. Ошибки по путям — ничего
 * не применено; загрузка с ошибками — 422 `{ error, errors, report }`.
 */
export type SetPlanReport = {
  name: string;
  dryRun: boolean;
  applied: boolean;
  revision: number | null;
  created: (SetItemNote & { archived: boolean })[];
  changed: (SetItemNote & { fields: string[] })[];
  unchanged: number;
  kept: Partial<Record<SetupGroup | 'check', number>>;
  warnings: SetWarning[];
  errors: Record<string, string>;
  untouched: (
    | 'intake'
    | 'retention'
    | 'base_currency'
    | 'keys'
    | 'labels'
    | 'rates'
    | 'spend'
    | 'statements'
    | 'events'
    | 'people'
    | 'results'
  )[];
};

/** GET /analytics/set/samples: образцы бинарника на языке запроса. */
export type SetSampleView = {
  code: string;
  title: string;
  description: string;
  counts: Partial<Record<SetupGroup | 'check', number>>;
};

export type ImportReport = {
  sender: string;
  dryRun: boolean;
  lines: number;
  empty: number;
  accepted: number;
  erasures: number;
  duplicates: number;
  conflicts: number;
  erased: number;
  rejected: number;
  errors: { line: number; path: string; message: string }[];
  warnings: Record<string, number>;
  /** Людей, чьи события приняты или стёрты; null — больше 100 000. */
  people: number | null;
};

export type SetupAuthor = { id: number; name: string; agent: boolean };

export type SetupLogEntry = {
  id: number;
  at: string;
  author: SetupAuthor | null;
  /**
   * `label` — метка реестра, ключ `отправитель/метка`; `rate` — курс `база/валюта/день`; `spend` — номер строки
   * расхода; `check` — поправка встроенной или своя проверка; `resolution` — снятие вручную, ключ
   * `проверка/отправитель/сутки` (у проверки сайта — без отправителя, у тестовой — ещё `/test`); `statement` —
   * выписка, ключ `месяц/валюта`.
   */
  item:
    | SetupGroup
    | 'check'
    | 'set'
    | 'settings'
    | 'key'
    | 'label'
    | 'rate'
    | 'spend'
    | 'resolution'
    | 'statement';
  key: string;
  action:
    | 'created'
    | 'changed'
    | 'archived'
    | 'restored'
    | 'removed'
    | 'applied';
  before: unknown;
  after: unknown;
};

export type ErasureEntry = {
  id: number;
  at: string;
  before: string;
  origin: 'event' | 'manager' | 'retention';
  sender: string | null;
  userName: string | null;
  events: number;
  people: number;
  marked: boolean;
};

export type LogPage<T> = {
  kind: 'setup' | 'erasures';
  entries: T[];
  next: number | null;
};

/** DELETE /analytics/people/:subject: сколько людей и событий стёрто. */
export type PeopleErased = { people: number; events: number };

// Деньги аналитики (ADR 0072, этап 3): /manager/api/analytics/rates и /analytics/spend.

/** Сумма в базовой валюте: минимальные единицы; суммы без курса — по валютам, в value не вошли. */
export type BaseSum = {
  value: number;
  unpriced: Record<string, number>;
  /** Хоть одна запись переведена по курсу более раннего месяца. */
  staleRate: boolean;
};

/** Курс: с дня `day` одна единица `currency` стоит `rate` единиц `base` — до следующей записи. */
export type ExchangeRate = {
  base: string;
  currency: string;
  day: string;
  rate: string;
  author: { name: string; agent: boolean } | null;
  updatedAt: string;
};

export type RatesReport = {
  baseCurrency: string | null;
  currencies: {
    currency: string;
    rates: ExchangeRate[];
    /** Месяцы с суммами в этой валюте и чем они переводятся; `day` null — курса нет. */
    months: {
      month: string;
      day: string | null;
      rate: string | null;
      stale: boolean;
    }[];
  }[];
  /** Курсы к другим базовым валютам — остались после смены базы. */
  other: { base: string; count: number }[];
};

export type RatesSaved = {
  rates: ExchangeRate[];
  created: number;
  changed: number;
};

/** Строка расхода: месяц, части метки ({} — общий расход), валюта и сумма в минимальных единицах. */
export type SpendRow = {
  id: number;
  month: string;
  parts: Record<string, string>;
  currency: string;
  amount: number;
  note: string;
  author: { name: string; agent: boolean } | null;
  createdAt: string;
  updatedAt: string;
};

/** Ввод строки расхода: без номера — запись по ключу «месяц, части, валюта», с номером — правка строки. */
export type SpendInput = {
  id?: number;
  month: string;
  parts: Record<string, string>;
  currency: string;
  amount: string | number;
  note?: string;
};

export type SpendView = SpendRow & {
  /** Вся строка в базовой валюте; null — нет базы или курса. */
  base: number | null;
  staleRate: boolean;
  states: Record<string, 'known' | 'archived' | 'unknown'>;
};

export type SpendHint = {
  month: string;
  part: string;
  value: string;
  name: string;
  people: number;
};

export type SpendReport = {
  baseCurrency: string | null;
  from: string;
  to: string;
  months: { month: string; total: BaseSum | null; rows: SpendView[] }[];
  hints: SpendHint[];
};

export type SpendSaved = {
  rows: SpendView[];
  created: number;
  changed: number;
};
