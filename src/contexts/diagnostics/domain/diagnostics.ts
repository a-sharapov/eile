import type { ManagerLanguage } from '../../../shared/kernel/manager-language.ts';

/** error — сайт работает неправильно; warning — стоит поправить; info — на заметку, в счётчик не идёт. */
export type Severity = 'error' | 'warning' | 'info';

/** Группа отчёта: ссылки, страницы, медиа, настройки, сервер. */
export type GroupId = 'links' | 'pages' | 'media' | 'settings' | 'server';

/** Куда идти чинить: адрес в менеджере (`/pages/12`, `/settings?tab=search`) и подпись ссылки. */
export type Fix = { readonly href: string; readonly label?: string };

/** Что именно затронуто: страница, файл, форма — с местом, где это править. */
export type FindingItem = {
  readonly label: string;
  /** Подробность: ссылка, адрес, размер. */
  readonly detail?: string;
  readonly fix?: Fix;
};

/** Находка проверки: одна проблема и всё, что ею затронуто. Тексты — для человека, на языке менеджера. */
export type Finding = {
  /** Стабильный id: `links.broken`. */
  readonly id: string;
  readonly group: GroupId;
  readonly severity: Severity;
  readonly title: string;
  /** Почему это важно и что сделать. */
  readonly hint: string;
  readonly items: readonly FindingItem[];
  /** Сколько затронуто всего; в `items` — не больше первых ста. */
  readonly count: number;
  readonly fix?: Fix;
};

/** Проверка: данные она берёт сама, тексты пишет на языке менеджера. Ошибка в ней — тоже находка, а не 500. */
export type Check = {
  readonly id: string;
  readonly run: (language: ManagerLanguage) => readonly Finding[];
};

export type DiagnosticsReport = {
  readonly generatedAt: string;
  /** Ошибки и предупреждения: число на вкладке «Диагностика». */
  readonly problems: number;
  /** Сколько миллисекунд считался отчёт. */
  readonly tookMs: number;
  readonly findings: readonly Finding[];
};

const _MAX_ITEMS = 100;

const _RANK: Readonly<Record<Severity, number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

const _GROUPS: readonly GroupId[] = [
  'links',
  'pages',
  'media',
  'settings',
  'server',
];

/** Находка с items: пустой список — проблемы нет. */
export var finding = (
  base: Omit<Finding, 'items' | 'count'>,
  items: readonly FindingItem[]
): Finding[] =>
  items.length === 0
    ? []
    : [{ ...base, items: items.slice(0, _MAX_ITEMS), count: items.length }];

/** Находки по порядку: группа, затем важность, затем сколько затронуто. */
export var ordered = (findings: readonly Finding[]): Finding[] =>
  findings.toSorted(
    (a, b) =>
      _GROUPS.indexOf(a.group) - _GROUPS.indexOf(b.group) ||
      _RANK[a.severity] - _RANK[b.severity] ||
      b.count - a.count
  );

export var problemsOf = (findings: readonly Finding[]): number =>
  findings
    .filter((_) => _.severity !== 'info')
    .reduce((sum, _) => sum + _.count, 0);
