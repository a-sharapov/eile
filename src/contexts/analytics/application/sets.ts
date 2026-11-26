import { fail } from '../../../shared/kernel/errors.ts';
import {
  isManagerLanguage,
  MANAGER_LANGUAGES,
  type ManagerLanguage,
} from '../../../shared/kernel/manager-language.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import { shownValue } from '../domain/codes.ts';
import type { AnalyticsEvent } from '../domain/events.ts';
import type {
  EventReferences,
  SetSample,
  SetupLog,
  SetupRepository,
  Transaction,
} from '../domain/ports.ts';
import {
  type AnalyticsSet,
  cleanName,
  draftSet,
  exportSet,
  parseSetName,
  readSetFile,
  SET_UNTOUCHED,
  SETUP_LIMITS,
  type SetDraft,
  type SetErrors,
  type SetFacts,
  type SetUntouched,
  type Setup,
  type SetupAuthor,
  type SetupGroup,
  type SetupHolds,
  type SetWarning,
  setLog,
} from '../domain/setup.ts';
import { cleanText } from '../domain/text.ts';

/** Отчёт пробы и загрузки набора: что создастся, изменится, останется, предупреждения, ошибки по путям. */
export type SetPlanReport = {
  readonly name: string;
  readonly dryRun: boolean;
  /** Применён: не проба и без ошибок; ревизия — новая, если что-то изменилось. */
  readonly applied: boolean;
  readonly revision: number | null;
  readonly created: SetDraft['created'];
  readonly changed: SetDraft['changed'];
  readonly unchanged: number;
  readonly kept: SetDraft['kept'];
  readonly warnings: readonly SetWarning[];
  readonly errors: SetErrors;
  /** Чего набор не несёт: приём, срок хранения, базовая валюта, ключи, реестр, курсы, расходы, выписки… */
  readonly untouched: readonly SetUntouched[];
};

/** Образец для выбора: код, тексты на языке и что внутри — элементов по группам. */
export type SampleView = {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly counts: Readonly<Partial<Record<SetupGroup, number>>>;
};

export type SetsPorts = {
  readonly setup: SetupRepository;
  /** Снимок настройки для пробы: в памяти, как у правок. */
  readonly current: () => Setup;
  readonly log: SetupLog;
  readonly references: EventReferences;
  readonly holds: SetupHolds;
  readonly transaction: Transaction;
  readonly clock: () => Date;
  readonly samples: readonly SetSample[];
  /** Версия этой Eile: пишется в выгрузку, файл новее — предупреждение пробы. */
  readonly version: string;
  /** Название сайта: имя выгрузки по умолчанию — `<название> <день>`. */
  readonly siteName: () => string;
  /** Набор записан: снимок настройки — заново, события — в шину. */
  readonly applied: (events: readonly AnalyticsEvent[]) => void;
};

type Input = Readonly<Record<string, unknown>>;

const _isRecord = (raw: unknown): raw is Input =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

// Поля запроса образца — ключами объекта, как поля обёртки набора.
const _SAMPLE_FIELDS = Object.keys({ sample: true, language: true });

const _isSampleRequest = (input: unknown): input is Input =>
  _isRecord(input) && input.format === undefined && input.sample !== undefined;

/** Образцы для выбора на языке: число элементов по группам — из самого набора, его чтением. */
export var sampleViews = (
  samples: readonly SetSample[],
  language: ManagerLanguage
): SampleView[] =>
  samples.map((sample) => ({
    code: sample.code,
    title: sample.title[language],
    description: sample.description[language],
    counts: Object.fromEntries(
      [
        ...Map.groupBy(readSetFile(sample.set(language)).steps, (_) => _.group),
      ].map(({ 0: group, 1: steps }) => [group, steps.length])
    ),
  }));

// Имя выгрузки по умолчанию: название сайта и сутки UTC выгрузки, как у файла; длинное название укорачивается.
const _defaultName = (site: string, day: string): string =>
  ((name) =>
    name === ''
      ? day
      : `${[...name]
          .slice(0, SETUP_LIMITS.name - day.length - 1)
          .join('')
          .trimEnd()} ${day}`)(cleanName(site).trim());

/**
 * Перенос набора (ADR 0072): выгрузка, проба без записи и загрузка целиком одной транзакцией; образцы бинарника
 * — тем же путём, что файл. Ключи, приём, срок хранения, базовую валюту, курсы, расходы и выписки набор не
 * несёт и не меняет, даже если в файле есть похожие поля: такие поля — ошибка набора.
 */
export var defineSets = ({
  setup,
  current,
  log,
  references,
  holds,
  transaction,
  clock,
  samples,
  version,
  siteName,
  applied,
}: SetsPorts) => {
  const now = (): string => clock().toISOString();

  const facts = (at: string): SetFacts => ({
    holds,
    events: (sender, type) => references.type(sender, type),
    version,
    at,
  });

  // Образец — по коду и языку запроса, `language` во входе важнее; незнакомый — 404.
  const sampleSet = (input: Input, language: ManagerLanguage): unknown =>
    ((extra) =>
      extra !== undefined
        ? fail(
            'analytics.invalid_set',
            `A sample request is { sample, language }, not "${cleanText(extra, 60)}"`
          )
        : ((sample, chosen) => sample.set(chosen))(
            samples.find((_) => _.code === input.sample) ??
              fail(
                'analytics.sample_not_found',
                `There is no sample set "${cleanText(shownValue(input.sample), 60)}": one of ${samples.map((_) => _.code).join(', ')}`
              ),
            input.language === undefined
              ? language
              : isManagerLanguage(input.language)
                ? input.language
                : fail(
                    'analytics.invalid_set',
                    `The language of a sample is one of ${MANAGER_LANGUAGES.join(', ')}`
                  )
          ))(Object.keys(input).find((_) => !_SAMPLE_FIELDS.includes(_)));

  const setOf = (input: unknown, language: ManagerLanguage): unknown =>
    _isSampleRequest(input) ? sampleSet(input, language) : input;

  const reportOf = (
    draft: SetDraft,
    outcome: Pick<SetPlanReport, 'dryRun' | 'applied' | 'revision'>
  ): SetPlanReport => ({
    name: draft.name,
    ...outcome,
    created: draft.created,
    changed: draft.changed,
    unchanged: draft.unchanged,
    kept: draft.kept,
    warnings: draft.warnings,
    errors: draft.errors,
    untouched: SET_UNTOUCHED,
  });

  return {
    /** Вся настройка без ключей одним файлом; `name` — имя набора, по умолчанию `<название сайта> <день UTC>`. */
    export: (name?: unknown): AnalyticsSet =>
      ((at) =>
        exportSet(current(), {
          name:
            name === undefined || name === null
              ? _defaultName(siteName(), at.slice(0, 10))
              : parseSetName(name),
          eile: version,
          exportedAt: at,
        }))(now()),
    /** Проба: набор применяется к нынешней настройке в памяти, база не меняется. */
    plan: (input: unknown, language: ManagerLanguage): SetPlanReport =>
      pipe(
        (_: unknown) => readSetFile(setOf(_, language)),
        (plan) => draftSet(plan, facts(now()))(current()),
        (draft) =>
          reportOf(draft, { dryRun: true, applied: false, revision: null })
      )(input),
    /**
     * Загрузка: та же проба на настройке из базы в своей транзакции, затем — набор целиком одной ревизией и
     * одной строкой журнала с автором. Ошибки — ничего не записано, отчёт их называет.
     */
    apply: (
      input: unknown,
      language: ManagerLanguage,
      author: SetupAuthor | null = null
    ): SetPlanReport =>
      pipe(
        (_: unknown) => readSetFile(setOf(_, language)),
        (plan) =>
          ((at) =>
            transaction(() =>
              ((draft) =>
                ((ok) => (
                  void (
                    ok &&
                    draft.changes.length > 0 &&
                    (setup.commit(
                      draft.result.state.revision,
                      draft.changes,
                      at
                    ),
                    log.append(setLog(plan.name, draft.changes, author, at)))
                  ),
                  { draft, ok }
                ))(Object.keys(draft.errors).length === 0))(
                draftSet(plan, facts(at))(setup.load())
              )
            ))(now()),
        ({ draft, ok }) => (
          void (ok && draft.changes.length > 0 && applied(draft.result.events)),
          reportOf(draft, {
            dryRun: false,
            applied: ok,
            revision: ok ? draft.result.state.revision : null,
          })
        )
      )(input),
    /** Образцы бинарника на языке: код, название, описание, что внутри. */
    samples: (language: ManagerLanguage): SampleView[] =>
      sampleViews(samples, language),
  };
};

export type Sets = ReturnType<typeof defineSets>;
