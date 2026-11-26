import type {
  Localized,
  ManagerLanguage,
} from '../../../shared/kernel/manager-language.ts';
import type { Day, DayPeriod, Month } from './days.ts';
import type { EventOrigin, TrackedEvent } from './envelope.ts';
import type { ErasureOrigin } from './events.ts';
import type { SenderKey } from './keys.ts';
import type { CurrencyMoment, ExchangeRate, PersonMoney } from './money.ts';
import type {
  HistoryEvent,
  Person,
  PersonFacts,
  PersonState,
} from './person.ts';
import type { CheckDay, CheckKey, DayEvent, IntakeSwitch } from './quality.ts';
import type { ReportNeeds, ReportPerson } from './report.ts';
import type { AnalyticsSettings } from './settings.ts';
import type {
  ItemChange,
  Parts,
  Setup,
  SetupAction,
  SetupAuthor,
  SetupLogDraft,
  SetupLogItem,
} from './setup.ts';
import type { SpendRow } from './spend.ts';
import type { Statement } from './statements.ts';
import type { SummaryEvent } from './summary.ts';
import type { ErasedDay, IntakeDay } from './tally.ts';

/**
 * Источник посещения со стороны аналитики — той же формы, что у статистики: корень передаёт её функции сюда,
 * и аналитика не импортирует `stats`. Значения — как пришли от посетителя, частями их делает `partsOfVisit`.
 */
export type VisitSource = {
  readonly utmSource: string;
  readonly utmMedium: string;
  readonly utmCampaign: string;
  readonly utmContent: string;
  readonly utmTerm: string;
  /** Хост чужого сайта без `www.`; пусто — прямой заход или свой сайт. */
  readonly referrer: string;
};

/** Откуда пришёл запрос перехода: без заголовка Referer, со своего сайта или с чужого. */
export type RefererKind = 'none' | 'own' | 'foreign';

/** Источники метки перехода: сам запрос и посещение дня этого посетителя. */
export type GoSources = {
  readonly request: VisitSource & { readonly referer: RefererKind };
  /** null — счёт посещений выключен, бот или сегодня просмотров не было. */
  readonly visit: VisitSource | null;
};

/** Посетители одного сочетания источника за период. */
export type OriginRow = {
  readonly source: VisitSource;
  readonly visitors: number;
};

/** Посетители периода: всего и по сочетаниям источника; со страницей входа сочетаний нет. */
export type VisitSums = {
  readonly total: number;
  readonly origins: readonly OriginRow[];
};

/** Чьи посетители: достигшие цели (`go:`, `go:<код>`, `form:<имя>`), вошедшие на странице. */
export type VisitFilter = { readonly goal?: string; readonly page?: string };

/**
 * Статистика посещений со стороны аналитики — той же формы, что отдаёт `stats`: корень собирает её
 * замыканиями. Дни — в поясе статистики; он же — пояс отчётов аналитики.
 */
export type SiteVisits = {
  /** Пояс суток статистики; пусто — пояс сервера. */
  readonly timeZone: () => string;
  /** Идёт ли счёт посещений: выключен — у шагов-посещений воронки счёта нет. */
  readonly enabled: () => boolean;
  /** Посетители периода; буфер счётчика статистика сначала пишет в базу. */
  readonly sums: (period: DayPeriod, filter?: VisitFilter) => VisitSums;
  /** С какого дня есть сводки посещений и с какого — их разрез `origin`. */
  readonly since: () => {
    readonly visits: Day | null;
    readonly origins: Day | null;
  };
};

/**
 * Люди для отчётов: постоянные запросы, коды настройки в текст SQL не подставляются. `needs` — какие факты
 * сверх постоянных отдать: ненужные приходят пустыми.
 */
export type ReportStore = {
  /**
   * У кого есть что-то не раньше `from`: приход, оплаты, деньги, возвращения. `scan` — читать таблицу подряд:
   * длинному периоду нужны почти все строки.
   */
  readonly active: (
    from: string,
    test: boolean,
    scan: boolean,
    needs: ReportNeeds
  ) => ReportPerson[];
  /** Пришедшие в `[from, to)`. */
  readonly arrived: (
    from: string,
    to: string,
    test: boolean,
    scan: boolean,
    needs: ReportNeeds
  ) => ReportPerson[];
  /** Клиенты с первой оплатой в `[from, to)`; `from` null — с начала. По частичному индексу клиентов. */
  readonly paid: (
    from: string | null,
    to: string,
    test: boolean,
    needs: ReportNeeds
  ) => ReportPerson[];
  /** Все люди. */
  readonly all: (test: boolean, needs: ReportNeeds) => ReportPerson[];
  /** Самый ранний приход; null — людей нет. */
  readonly firstArrival: (test: boolean) => string | null;
  /** Люди целиком по псевдонимам — в порядке списка. */
  readonly facts: (subjects: readonly string[]) => PersonFacts[];
};

/** Выданная метка в реестре: из каких частей собрана, чей переход, кто и когда выдал. */
export type RegisteredLabel = {
  readonly sender: string;
  readonly label: string;
  readonly name: string;
  readonly parts: Parts;
  readonly link: string | null;
  /** Кто выдал; null — команда или тест. */
  readonly author: { readonly name: string; readonly agent: boolean } | null;
  readonly createdAt: string;
};

/** Реестр меток — данные сайта, не настройка: ревизии не повышает и в набор не идёт. */
export type LabelRegistry = {
  readonly get: (sender: string, label: string) => RegisteredLabel | null;
  /** Новые сверху; `sender` null — все. */
  readonly list: (sender: string | null) => RegisteredLabel[];
  readonly count: () => number;
  readonly add: (label: RegisteredLabel) => void;
  readonly rename: (sender: string, label: string, name: string) => void;
  readonly remove: (sender: string, label: string) => void;
  /** Метки первых касаний людей с отправителем и числом людей. */
  readonly touches: () => Tally<{
    readonly sender: string;
    readonly label: string;
  }>[];
};

export type AnalyticsSettingsRepository = {
  readonly get: () => AnalyticsSettings;
  readonly save: (settings: AnalyticsSettings, at: string) => void;
};

/** Справочники в базе: связаны кодами, а не номерами строк. */
export type SetupRepository = {
  /** Все элементы и ревизия — из базы, по порядку кодов. */
  readonly load: () => Setup;
  /** Изменённые элементы и новая ревизия; `at` — время правки для `created_at` и `updated_at`. */
  readonly commit: (
    revision: number,
    changes: readonly ItemChange[],
    at: string
  ) => void;
};

/** Строка журнала настройки, как её читают. */
export type SetupLogEntry = {
  readonly id: number;
  readonly at: string;
  readonly author: SetupAuthor | null;
  readonly item: SetupLogItem;
  readonly key: string;
  readonly action: SetupAction;
  readonly before: unknown;
  readonly after: unknown;
};

export type SetupLog = {
  readonly append: (entries: readonly SetupLogDraft[]) => void;
  /** Новые сверху; `before` — номер строки, с которой продолжить. */
  readonly list: (before: number | null, limit: number) => SetupLogEntry[];
};

/**
 * Данные сайта ссылаются на настройку кодами: события — на отправителя и тип, строки расхода — на часть метки и
 * её значение, строки дней — на проверку. Пока ссылаются, элемент только в архив.
 */
export type EventReferences = {
  readonly sender: (code: string) => boolean;
  readonly type: (sender: string, code: string) => boolean;
  /** Есть ли строка расхода с этой частью (`value` null) или с этим значением части. */
  readonly spend: (part: string, value: string | null) => boolean;
  /** Есть ли у проверки строки дней. */
  readonly results: (check: string) => boolean;
};

/** Курсы, расходы и выписки — данные сайта, не настройка: ревизии не повышают, в набор не идут. */
export type MoneyStore = {
  /** Все курсы: по базе, валюте и дню. */
  readonly rates: () => ExchangeRate[];
  readonly rate: (
    base: string,
    currency: string,
    day: Day
  ) => ExchangeRate | null;
  /** Запись по ключу: база, валюта и день. */
  readonly putRate: (rate: ExchangeRate) => void;
  readonly removeRate: (base: string, currency: string, day: Day) => void;
  readonly rateCount: () => number;
  /** Строки расхода месяцев от `from` до `to` включительно; null — без границы. По месяцу, частям, валюте. */
  readonly spend: (from: Month | null, to: Month | null) => SpendRow[];
  readonly spendRow: (id: number) => SpendRow | null;
  /** Строка по ключу: месяц, части и валюта. */
  readonly spendByKey: (
    key: Pick<SpendRow, 'month' | 'parts' | 'currency'>
  ) => SpendRow | null;
  readonly addSpend: (row: Omit<SpendRow, 'id'>) => SpendRow;
  readonly putSpend: (row: SpendRow) => void;
  readonly removeSpend: (id: number) => void;
  /** Строк расхода у сайта, а с месяцем — в этом месяце. */
  readonly spendCount: (month: Month | null) => number;
  /** Самый ранний месяц со строкой расхода; null — строк нет. */
  readonly firstSpendMonth: () => Month | null;
  /**
   * Деньги людей по валютам — для экрана курсов: моменты курса оплат, возвратов (момент их оплаты) и комиссий
   * (момент оплаты) до минуты без повторов — граница дня пояса на целой минуте. Тестовых людей нет.
   */
  readonly currencyMoments: () => readonly CurrencyMoment[];
  /** Деньги людей с суммами, без тестовых: по частичному индексу, а не по всей таблице людей. */
  readonly ledger: () => readonly PersonMoney[];
  /** Выписки месяцев от `from` до `to` включительно; null — без границы. По месяцу, валюте. */
  readonly statements: (from: string | null, to: string | null) => Statement[];
  readonly statement: (month: string, currency: string) => Statement | null;
  /** Запись по ключу: месяц и валюта. */
  readonly putStatement: (statement: Statement) => void;
  readonly removeStatement: (month: string, currency: string) => void;
};

/** Всё или ничего: исключение внутри `run` откатывает каждую запись. */
export type Transaction = <T>(run: () => T) => T;

/** Ключи отправителей — данные сервера: в копию сайта не попадают. */
export type SenderKeyRepository = {
  readonly all: () => SenderKey[];
  readonly add: (key: Omit<SenderKey, 'id'>) => SenderKey;
  /** Ключ отправителя по номеру; false — такого нет. */
  readonly remove: (sender: string, id: number) => boolean;
  readonly touch: (id: number, at: string) => void;
  readonly has: (hash: string) => boolean;
};

/** Секреты и отпечатки: выпуск ключа, хэш ключа и псевдонима, отпечаток тела, сверка за постоянное время. */
export type AnalyticsCrypto = {
  /** Новый ключ отправителя: `evk_` и 32 случайных байта в base64url. */
  readonly issue: () => string;
  /** SHA-256 в hex: так хранятся ключи и псевдонимы в отметках удаления. */
  readonly hash: (text: string) => string;
  /** SHA-256 в base64url: отпечаток канонического JSON тела. */
  readonly fingerprint: (text: string) => string;
  /** Равны ли два хэша; время сверки не зависит от того, где они расходятся. */
  readonly same: (a: string, b: string) => boolean;
};

/** Повтор с другим телом: остаётся первое событие, конфликт копит счётчик и последнее тело. */
export type RepeatConflict = {
  readonly sender: string;
  readonly id: string;
  /** Псевдоним первого события: конфликт виден в его карточке. */
  readonly subject: string | null;
  readonly body: string;
  readonly hash: string;
  readonly at: string;
};

export type EventStore = {
  /** Принятое событие отправителя с этим `id`; null — такого нет. */
  readonly find: (
    sender: string,
    id: string
  ) => { readonly hash: string; readonly subject: string | null } | null;
  /** Номер приёма нового события. */
  readonly add: (event: Omit<TrackedEvent, 'seq'>) => number;
  readonly conflict: (conflict: RepeatConflict) => void;
  /**
   * События псевдонима от всех отправителей с `at` не позже `before`, его строка в людях и конфликты; `test` —
   * только тестовые события. Ответ — сколько событий стёрто.
   */
  readonly erase: (subject: string, before: string, test: boolean) => number;
};

/** Строка журнала удалений; хэш псевдонима — отметка удаления, у тестового удаления и срока хранения его нет. */
export type Erasure = {
  readonly at: string;
  /** Момент удаления: события псевдонима не позже него не принимаются. */
  readonly before: string;
  readonly origin: ErasureOrigin;
  readonly sender: string | null;
  readonly userName: string | null;
  readonly events: number;
  readonly people: number;
  readonly subjectHash: string | null;
};

/** Строка журнала удалений, как её читают: вместо хэша псевдонима — есть ли отметка. */
export type ErasureEntry = Omit<Erasure, 'subjectHash'> & {
  readonly id: number;
  readonly marked: boolean;
};

export type ErasureLog = {
  readonly add: (erasure: Erasure) => void;
  /** Самый поздний момент удаления псевдонима по его хэшу; null — его не стирали. */
  readonly until: (subjectHash: string) => string | null;
  /** Новые сверху; `before` — номер строки, с которой продолжить. */
  readonly list: (before: number | null, limit: number) => ErasureEntry[];
  /** Строки с отметкой удаления — их восстановление копии переносит в восстановленную базу. */
  readonly marks: () => Erasure[];
  /** Есть ли уже такая строка: та же отметка, момент и время. */
  readonly has: (erasure: Erasure) => boolean;
  /** Хэш псевдонима → самый поздний момент его удаления. */
  readonly moments: () => ReadonlyMap<string, string>;
};

/** Таблица людей: человек псевдонима заново из его событий — в той же транзакции, что приём или удаление. */
export type PeopleIndex = {
  readonly fold: (subject: string) => void;
};

/** Событие журнала, как его читают: тело разобрано, роль не записана — её даёт справочник. */
export type StoredEvent = HistoryEvent & {
  readonly id: string;
  readonly subject: string | null;
  readonly receivedAt: string;
  readonly origin: EventOrigin;
};

/** Фильтр журнала событий; null — без условия. Страница — новые сверху, по времени, затем по приёму. */
export type EventFilter = {
  readonly sender: string | null;
  readonly type: string | null;
  /** Типы роли как `отправитель/код`: роль не хранится в событии. */
  readonly types: readonly string[] | null;
  readonly subject: string | null;
  /** С этого момента включительно. */
  readonly from: string | null;
  /** До этого момента, не включая его. */
  readonly to: string | null;
  readonly test: boolean | null;
  /** Номер приёма события, после которого продолжить. */
  readonly before: number | null;
  readonly limit: number;
};

/** Конфликт повтора, как его показывают: без тела — это чужой текст. */
export type ConflictEntry = {
  readonly sender: string;
  readonly id: string;
  readonly count: number;
  readonly firstAt: string;
  readonly lastAt: string;
};

/** Сколько раз встретилось значение. */
export type Tally<T> = T & { readonly count: number };

/** Чтение событий: история человека, журнал, «незнакомые», приём за день. */
export type EventJournal = {
  /** Все события псевдонима с телами. */
  readonly history: (subject: string) => HistoryEvent[];
  /** Истории псевдонимов от `first` до `last` включительно — одним проходом: так пересборка читает пачку. */
  readonly histories: (
    first: string,
    last: string
  ) => ReadonlyMap<string, HistoryEvent[]>;
  /** Самый поздний момент события псевдонима; null — событий нет. */
  readonly latest: (subject: string) => string | null;
  readonly page: (filter: EventFilter) => StoredEvent[];
  /** Событие по номеру приёма с телом как пришло; null — такого нет. */
  readonly one: (
    seq: number
  ) => (Omit<StoredEvent, 'body'> & { readonly body: string }) | null;
  /** Сколько разных псевдонимов в событиях. */
  readonly subjects: () => number;
  /** Псевдонимы событий и конфликтов повтора: по ним ищутся отметки удалений. */
  readonly pseudonyms: () => string[];
  /** Самое раннее событие типа с псевдонимом: удаление, которое ждало своей роли. */
  readonly earliest: (
    sender: string,
    type: string
  ) => {
    readonly subject: string;
    readonly at: string;
    readonly test: boolean;
  } | null;
  /** Псевдонимы, чьё последнее событие раньше `before`; не больше `limit`. */
  readonly expired: (before: string, limit: number) => string[];
  /** Принято с момента `since` и когда принято последнее. */
  readonly received: (since: string) => {
    readonly count: number;
    readonly last: string | null;
  };
  readonly conflicts: (subject: string) => ConflictEntry[];
  /** Событий по типам у отправителей и последнее из них. */
  readonly types: () => Tally<{
    readonly sender: string;
    readonly type: string;
    readonly lastAt: string;
  }>[];
  /** Пары «вопрос — ответ» в событиях типа. */
  readonly answers: (
    sender: string,
    type: string
  ) => Tally<{ readonly question: unknown; readonly answer: unknown }>[];
  /** Значения полей `data` из списка в событиях типа. */
  readonly values: (
    sender: string,
    type: string,
    properties: readonly string[]
  ) => Tally<{ readonly property: string; readonly value: unknown }>[];
};

/**
 * Строка файла событий: номер с единицы и текст без перевода строки; строка длиннее предела или не UTF-8 —
 * причина вместо текста, по-английски, как у приёмника.
 */
export type FileLine =
  | { readonly line: number; readonly text: string }
  | { readonly line: number; readonly error: string };

/** Строки файла по порядку, не больше `limit` за раз; пустой ответ — файл кончился. */
export type LineSource = {
  readonly next: (limit: number) => Promise<readonly FileLine[]>;
  /** Отпустить файл, даже если он не дочитан. */
  readonly close: () => void;
};

/**
 * Принятые строки пробного прогона: `id` → отпечаток тела, чтобы найти повтор внутри файла. Вне памяти
 * процесса: в файле бывают миллионы строк.
 */
export type ImportLedger = {
  readonly find: (id: string) => string | null;
  readonly add: (id: string, hash: string) => void;
  /** Пачка строк — одной транзакцией. */
  readonly batch: <T>(run: () => T) => T;
  /** Закрыть и удалить. */
  readonly close: () => void;
};

/** Счёт приёма по суткам UTC — данные сайта: прибавки идут в транзакции вызывающего. */
export type IntakeTally = {
  /** Прибавить строки: та же строка суток, отправителя, пути и исхода растёт на `count`. */
  readonly add: (rows: readonly IntakeDay[]) => void;
  /** Строки суток от `from` до `to` включительно: по суткам, отправителю, пути, исходу. */
  readonly daily: (from: Day, to: Day) => IntakeDay[];
  /** Стереть строки раньше суток `before`; ответ — сколько. */
  readonly expire: (before: Day) => number;
};

/**
 * Счёт стёртого по суткам UTC момента события — данные сайта: без сумм и псевдонимов. Каждое стёртое событие в
 * нём один раз: по отпечатку его тела (40 суток) повтор отправки и повтор удаления узнаются.
 */
export type ErasedTally = {
  readonly add: (rows: readonly ErasedDay[]) => void;
  /**
   * До `EventStore.erase` с теми же `subject`, `before`, `test`: события, которые он сотрёт, — по суткам,
   * отправителю, типу и их отпечатки; только с момента `since` и только ещё не посчитанные.
   */
  readonly erasing: (
    subject: string,
    before: string,
    test: boolean,
    since: string
  ) => void;
  /** Событие, которого в таблице не будет («стёрто», само удаление): +1, если его отпечатка ещё нет. */
  readonly once: (row: ErasedDay, hash: string) => void;
  /** Строки суток от `from` до `to` включительно. */
  readonly daily: (from: Day, to: Day) => ErasedDay[];
  /** Стереть строки и отпечатки раньше суток `before`; ответ — сколько строк счёта. */
  readonly expire: (before: Day) => number;
};

/**
 * Счёт отказов приёмника в памяти процесса: перебор ключа не превращается в запись на каждый ответ. В базу —
 * пачкой: фоном раз в минуту, при закрытии приложения и перед восстановлением копии.
 */
export type RefusalTally = {
  readonly add: (row: IntakeDay) => void;
  /** Ещё не записанное в базу. */
  readonly pending: () => IntakeDay[];
  readonly flush: () => void;
};

/** События типов с ролью «сводка»: их одна в сутки у отправителя, отдельной таблицы нет. */
export type SummaryStore = {
  /**
   * События без псевдонима этого типа отправителя с `at` не раньше `since`. Запрос — по типу параметром: список
   * типов через `json_each` планировщик ведёт мимо индекса `(sender, type, at)`.
   */
  readonly events: (
    sender: string,
    type: string,
    since: string
  ) => SummaryEvent[];
};

/** Уведомление владельцу о проверках данных: корень собирает из него сообщение notify. */
export type QualityNotice = {
  readonly severity: 'error' | 'warning' | 'info';
  readonly title: Localized;
  /** Строки «проверка · отправитель: что случилось» — по строке на проверку такта. */
  readonly lines: readonly {
    readonly label: Localized;
    readonly value: Localized;
  }[];
  readonly text: Localized;
  /** Подпись ссылки на экран «Качество данных». */
  readonly link: Localized;
  /** Путь в менеджере после MANAGER_PATH: `/stats/quality?day=2026-11-24`. */
  readonly path: string;
  /** Ключ отправки в журнале уведомлений: `analytics.quality:<момент такта>`. */
  readonly source: string;
};

/** Уведомления о проверках: каналы сбоев сайта, их собирает корень. */
export type QualityAlerts = {
  /** Есть ли куда слать: каналы сбоев настроены и у них есть адресаты. */
  readonly ready: () => boolean;
  /** Поставить в очередь; синхронно — внутри транзакции, которая отмечает уведомление в строке дня. */
  readonly send: (notice: QualityNotice) => void;
};

/** Набор-образец из бинарника: аналитика знает его код и тексты, но не имена внутри. */
export type SetSample = {
  readonly code: string;
  readonly title: Localized;
  readonly description: Localized;
  /** Набор с названиями на языке; коды у всех языков одни. */
  readonly set: (language: ManagerLanguage) => unknown;
};

/** Курсор такта: последнее виденное событие, ревизия настройки, последние строки журналов. */
export type QualityCursor = {
  readonly seq: number;
  readonly revision: number;
  readonly marks: {
    /** Последняя строка журнала настройки: курсы, расходы, выключатель. */
    readonly log: number;
    /** Последняя строка журнала удалений. */
    readonly erasures: number;
  };
};

/** Событие после курсора: чьи сутки стали «грязными»; `day` — `data.day` у сводки. */
export type ChangedEvent = {
  readonly sender: string;
  readonly type: string;
  readonly at: string;
  readonly test: boolean;
  readonly day: string | null;
};

/** Строки дней проверок, курсор такта и чтения, которые проверкам нужны сверх других портов. */
export type QualityStore = {
  /** Строки дней от `from` до `to` включительно. */
  readonly rows: (from: Day, to: Day) => CheckDay[];
  /** Строки одной проверки за сутки от `from` до `to` — по ключу таблицы: отметки версий «Обзора». */
  readonly rowsOf: (check: string, from: Day, to: Day) => CheckDay[];
  readonly row: (key: CheckKey) => CheckDay | null;
  /** Записать строку целиком: ключ тот же — заменить. */
  readonly put: (row: CheckDay) => void;
  /** Последняя строка с уведомлением у каждой не тестовой пары. */
  readonly notified: () => CheckDay[];
  /**
   * Отметить уведомление, если отметка строки всё ещё `previous` (null — её не было): false — отметил другой
   * процесс. Напоминание той же строкой меняет прежнюю отметку.
   */
  readonly mark: (
    key: CheckKey,
    at: string,
    episode: Day,
    previous: string | null
  ) => boolean;
  /** Отметить «снова в порядке», если его ещё нет. */
  readonly recover: (key: CheckKey, at: string) => boolean;
  /** Стереть строки раньше суток `before`; ответ — сколько. */
  readonly expire: (before: Day) => number;
  readonly cursor: () => QualityCursor | null;
  readonly keep: (cursor: QualityCursor) => void;
  /** Последнее событие и последние строки журналов: такт без работы стоит этих трёх чтений. */
  readonly marks: () => QualityCursor['marks'] & { readonly seq: number };
  /** События с номером приёма больше `after`. */
  readonly changes: (after: number) => ChangedEvent[];
  /** Что записано в журнал настройки после строки `after`. */
  readonly logged: (after: number) => SetupLogItem[];
  /** Переключения приёма в журнале настройки, по времени. */
  readonly switches: () => IntakeSwitch[];
  /** События с `at` от `from` до `to`, не включая его. */
  readonly events: (from: string, to: string) => DayEvent[];
  /** Конфликты повтора с последним повтором от `from` до `to`: по отправителям. */
  readonly conflicts: (
    from: string,
    to: string
  ) => Tally<{ readonly sender: string }>[];
  /** События отправителя с этим номером оплаты — по частичному индексу номера оплаты. */
  readonly payments: (
    sender: string,
    paymentId: string
  ) => {
    readonly seq: number;
    readonly type: string;
    readonly test: boolean;
  }[];
  /**
   * С каких суток UTC у сайта (`null`) есть события (по их моменту) или счёт приёма, у отправителя — его счёт
   * приёма; null — нет.
   */
  readonly started: (sender: string | null) => Day | null;
  /** Когда принято первое не тестовое событие; null — таких нет. */
  readonly firstEvent: () => string | null;
  /** Не тестовых событий типа отправителя с `at` от `from` до `to`, не включая его, — по индексу типа. */
  readonly count: (
    sender: string,
    type: string,
    from: string,
    to: string
  ) => number;
  /** Не тестовых людей с приходом от `from` до `to`. */
  readonly arrivals: (from: string, to: string) => number;
  /** Не тестовых людей с первой оплатой от `from` до `to` — по частичному индексу клиентов. */
  readonly firstPayments: (from: string, to: string) => number;
};

/** Где остановилась пересборка людей: ревизия, к которой она идёт, и последний пересчитанный псевдоним. */
export type PeopleBuild = {
  readonly revision: number;
  /** null — пересборка дошла до конца. */
  readonly cursor: string | null;
};

/** Фильтр списка людей; состояние считается на момент `now`. */
export type PeopleFilter = {
  readonly state: PersonState | null;
  readonly sender: string | null;
  /** Начало псевдонима. */
  readonly prefix: string | null;
  /** Только люди с разными первыми касаниями: узкий индекс их не держит, читаются строки. */
  readonly conflict: boolean;
  /** Показывать и тестовых. */
  readonly test: boolean;
  readonly now: string;
  readonly offset: number;
  readonly limit: number;
};

/** Таблица людей — производная: всегда собирается из событий заново. */
export type PeopleStore = {
  /** Строка человека; `revision` — по какой ревизии настройки он свёрнут. */
  readonly put: (person: Person, revision: number) => void;
  readonly remove: (subject: string) => void;
  /** Новые по последнему событию сверху. */
  readonly page: (filter: PeopleFilter) => {
    readonly people: PersonFacts[];
    readonly total: number;
  };
  readonly build: () => PeopleBuild | null;
  readonly mark: (build: PeopleBuild) => void;
  /** Следующие псевдонимы событий после `after` по порядку и ревизия их строки; null — строки нет. */
  readonly batch: (
    after: string,
    limit: number
  ) => { readonly subject: string; readonly revision: number | null }[];
  /** Строк, свёрнутых по этой ревизии. */
  readonly fresh: (revision: number) => number;
  /** Значения признаков из списка у людей. */
  readonly traits: (
    codes: readonly string[]
  ) => Tally<{ readonly trait: string; readonly value: unknown }>[];
  /**
   * Значения частей первого и последнего касаний людей с отправителем касания; счёт — касания, а касание,
   * которое у человека и первое, и последнее, — одно.
   */
  readonly parts: () => Tally<{
    readonly sender: string;
    readonly part: string;
    readonly value: unknown;
  }>[];
};
