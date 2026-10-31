import { attempt, fail, isDomainError } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { parseCsv, rulesToCsv } from '../domain/csv.ts';
import type { RuleRepository, SitePages } from '../domain/ports.ts';
import {
  indexRules,
  isExternal,
  matchRule,
  pageTarget,
  parseRule,
  prefixOf,
  type RedirectRule,
  type RedirectsEvent,
  type RuleDraft,
  type RuleIndex,
  type RuleInput,
  type RuleMatch,
  refuseChains,
} from '../domain/redirect.ts';

/** Предупреждение при сохранении: правило записано, но человеку стоит знать. */
export type RuleWarning = { readonly code: string; readonly detail: string };

export type SavedRule = {
  readonly rule: RedirectRule;
  readonly warnings: readonly RuleWarning[];
};

/** Итог импорта: что добавлено, что обновлено и какие строки пропущены — с номером и причиной. */
export type ImportReport = {
  readonly added: number;
  readonly updated: number;
  readonly skipped: readonly {
    readonly line: number;
    readonly code: string;
    readonly message: string;
  }[];
};

export type Clock = () => Date;

const _changed: RedirectsEvent = { type: 'redirects.rules_changed' };

export var defineRedirectsService = ({
  rules,
  pages,
  bus,
  clock,
}: {
  rules: RuleRepository;
  pages: SitePages;
  bus: EventBus;
  clock: Clock;
}) => {
  let index: RuleIndex | null = null;
  const indexed = (): RuleIndex => (index ??= indexRules(rules.all()));
  const now = (): string => clock().toISOString();

  // Цель — страница сайта: её нет или она в корзине — правило вело бы в 404.
  const refuseMissingPage = (draft: RuleDraft): RuleDraft =>
    ((id) =>
      id === null
        ? draft
        : ((page) =>
            page && !page.trashed
              ? draft
              : fail(
                  'redirects.page_not_found',
                  `No page ${id} for ${draft.to}`
                ))(pages.page(id)))(pageTarget(draft.to));

  // Старый адрес страницы уже ведёт на её новый адрес: цель через него — ещё одна переадресация.
  const refuseOldAddress = (draft: RuleDraft): RuleDraft =>
    !isExternal(draft.to) &&
    pageTarget(draft.to) === null &&
    !draft.to.endsWith('*') &&
    pages.movedFrom(draft.to.replace(/[?#].*$/, '')) !== null
      ? fail(
          'redirects.chain',
          `${draft.to} is an old page address: point to the page itself`
        )
      : draft;

  const refuseTaken = (draft: RuleDraft, id: number | null): RuleDraft =>
    ((taken) =>
      taken && taken.id !== id
        ? fail(
            'redirects.rule_exists',
            `There is already a rule for ${draft.from}`
          )
        : draft)(rules.byFrom(draft.from));

  const warningsOf = (draft: RuleDraft): RuleWarning[] => {
    const base = prefixOf(draft.from);
    const shadow = base === null ? pages.at(draft.from) : null;
    const under = base === null ? 0 : pages.under(base);
    const target = pageTarget(draft.to);
    const page = target === null ? null : pages.page(target);
    const internal =
      target === null && !isExternal(draft.to) && !draft.to.endsWith('*');
    return [
      ...(shadow ? [{ code: 'redirects.shadowed', detail: shadow.title }] : []),
      ...(under > 0
        ? [{ code: 'redirects.shadowed_many', detail: String(under) }]
        : []),
      ...(page && !page.published
        ? [{ code: 'redirects.target_draft', detail: page.title }]
        : []),
      ...(internal &&
      draft.to !== '/' &&
      pages.at(draft.to.replace(/[?#].*$/, '')) === null
        ? [{ code: 'redirects.target_missing', detail: draft.to }]
        : []),
    ];
  };

  // Проверка и запись без события: импорт шлёт одно событие на весь файл.
  const write = (input: RuleInput, id: number | null): SavedRule =>
    pipe<RuleInput, SavedRule>(
      parseRule,
      (draft: RuleDraft) => refuseTaken(draft, id),
      (draft: RuleDraft) => (
        refuseChains(
          draft,
          rules.all().filter((_) => _.id !== id)
        ),
        draft
      ),
      refuseMissingPage,
      refuseOldAddress,
      (draft: RuleDraft) =>
        ((saved) => ({ rule: rules.get(saved)!, warnings: warningsOf(draft) }))(
          id === null
            ? rules.insert(draft, now())
            : (rules.update(id, draft, now()), id)
        )
    )(input);

  const changed = (): void => ((index = null), bus.publish(_changed));

  const load = (id: number): RedirectRule =>
    rules.get(id) ?? fail('redirects.rule_not_found', `No rule ${id}`);

  const row = (cells: readonly string[]): RuleInput => ({
    from: cells[0] ?? '',
    to: cells[1] ?? '',
    status: cells[2] ? Number(cells[2]) : undefined,
    note: cells[3] ?? '',
  });

  return {
    rules: {
      list: (): RedirectRule[] => rules.all(),
      create: (input: RuleInput): SavedRule =>
        ((saved) => (changed(), saved))(write(input, null)),
      edit: (id: number, input: RuleInput): SavedRule =>
        ((saved) => (changed(), saved))(write(input, load(id).id)),
      remove: (id: number): void => (rules.remove(load(id).id), changed()),
      export: (): string => rulesToCsv(rules.all()),
      /** Строки с адресом, который уже есть, обновляют правило; ошибочные пропускаются с причиной. */
      import: (text: string): ImportReport => {
        const rows = parseCsv(text);
        const body =
          rows[0]?.cells[0]?.toLowerCase() === 'from' ? rows.slice(1) : rows;
        const report = rules.transaction(() =>
          body.reduce<ImportReport>(
            (report, { line, cells }) =>
              attempt(
                () =>
                  ((existing) => (
                    write(row(cells), existing?.id ?? null),
                    existing
                      ? { ...report, updated: report.updated + 1 }
                      : { ...report, added: report.added + 1 }
                  ))(
                    attempt(
                      () => rules.byFrom(parseRule(row(cells)).from),
                      () => null
                    )
                  ),
                (error) =>
                  isDomainError(error)
                    ? {
                        ...report,
                        skipped: [
                          ...report.skipped,
                          { line, code: error.code, message: error.message },
                        ],
                      }
                    : (() => {
                        throw error;
                      })()
              ),
            { added: 0, updated: 0, skipped: [] }
          )
        );
        void (report.added + report.updated > 0 && changed());
        return report;
      },
    },
    /** Правило для адреса посетителя; null — правил для него нет. */
    match: (path: string): RuleMatch | null => matchRule(indexed(), path),
    /** Переадресация сработала: счётчик и время — видно, живо ли правило. */
    hit: (id: number): void => rules.hit(id, now()),
  };
};

export type RedirectsService = ReturnType<typeof defineRedirectsService>;
