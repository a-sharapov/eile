import { fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS, isCode } from '../domain/codes.ts';
import { goTarget, LABEL_LIMITS, type LabelNote } from '../domain/labels.ts';
import type {
  GoSources,
  LabelRegistry,
  RegisteredLabel,
  SetupLog,
  Transaction,
} from '../domain/ports.ts';
import {
  type CheckedPart,
  checkParts,
  directLink,
  type LabelFrom,
  type LabelInput,
  labelName,
  planLabel,
  REGISTRY_LIMITS,
  readLabelText,
  siteLink,
} from '../domain/registry.ts';
import { labelKey } from '../domain/report.ts';
import type { Setup, SetupAuthor, SetupLogDraft } from '../domain/setup.ts';
import { queryCode, queryLimit, queryOffset } from './query.ts';

export type LabelsPorts = {
  readonly setup: () => Setup;
  /** Включён ли приём событий: без него метка перехода — только из заданных заранее частей. */
  readonly enabled: () => boolean;
  readonly registry: LabelRegistry;
  readonly log: SetupLog;
  readonly transaction: Transaction;
  readonly clock: () => Date;
  /** Адрес сайта из настроек: от него строится ссылка на сайт с UTM. */
  readonly siteUrl: () => string;
};

/** Выданная метка: запись реестра и обе ссылки; `existing` — такая метка уже была, запись прежняя. */
export type LabelIssued = RegisteredLabel & {
  readonly existing: boolean;
  readonly links: {
    /** Адрес назначения перехода с меткой: к отправителю, мимо сайта. */
    readonly direct: string | null;
    /** Страница сайта с UTM частей: кнопка перехода на ней соберёт ту же метку. */
    readonly site: string | null;
  };
};

export type LabelsQuery = {
  readonly sender?: unknown;
  /** Начало метки или начало слова названия. */
  readonly q?: unknown;
  readonly offset?: unknown;
  readonly limit?: unknown;
};

export type LabelsPage = {
  readonly labels: readonly RegisteredLabel[];
  /** Меток под фильтром. */
  readonly total: number;
};

/** Проверка метки или адреса: откуда взята метка, части по схеме с состоянием, замечания, запись реестра. */
export type LabelCheck = {
  readonly from: LabelFrom;
  readonly sender: string | null;
  readonly label: string;
  /** Переход, из адреса которого взята метка. */
  readonly link: string | null;
  readonly parts: readonly CheckedPart[];
  readonly notes: readonly LabelNote[];
  readonly registered: RegisteredLabel | null;
};

const _keyOf = (sender: string, label: string): string => `${sender}/${label}`;

const _authorOf = (author: SetupAuthor | null): RegisteredLabel['author'] =>
  author === null ? null : { name: author.name, agent: author.agent };

const _entry = (
  at: string,
  author: SetupAuthor | null,
  action: SetupLogDraft['action'],
  before: RegisteredLabel | null,
  after: RegisteredLabel | null
): SetupLogDraft => ({
  at,
  author,
  item: 'label',
  key: _keyOf((after ?? before)?.sender ?? '', (after ?? before)?.label ?? ''),
  action,
  before,
  after,
});

// Ключ записи из адреса: код отправителя и метка — знаки адреса, до предела метки.
const _refOf = (
  sender: unknown,
  label: unknown
): { readonly sender: string; readonly label: string } =>
  isCode(sender, CODE_LIMITS.sender) &&
  typeof label === 'string' &&
  label !== '' &&
  label.length <= LABEL_LIMITS.label
    ? { sender, label }
    : fail(
        'analytics.label_not_found',
        `There is no label ${String(label)} of sender ${String(sender)}`
      );

const _matches = (label: RegisteredLabel, q: string): boolean =>
  label.label.startsWith(q) ||
  label.name
    .toLocaleLowerCase()
    .split(/[\s\p{P}]+/u)
    .some((_) => _.startsWith(q));

/**
 * Метки сайта: куда и с какой меткой ведёт переход, реестр выданных меток и проверка метки или адреса. Реестр —
 * данные сайта, но не настройка: ревизии не повышает; его правки пишет журнал настройки строкой `item: 'label'`.
 */
export var defineLabels = ({
  setup,
  enabled,
  registry,
  log,
  transaction,
  clock,
  siteUrl,
}: LabelsPorts) => {
  const found = (sender: unknown, label: unknown): RegisteredLabel =>
    ((ref) =>
      registry.get(ref.sender, ref.label) ??
      fail(
        'analytics.label_not_found',
        `There is no label ${ref.label} of sender ${ref.sender}`
      ))(_refOf(sender, label));

  return {
    /**
     * Адрес назначения перехода `code` с меткой; null — такого перехода нет (удалён или не было). Переход в архиве
     * работает: старые кнопки сайта не должны вести на ошибку. `sources` зовётся, только когда переход есть, —
     * статистика засчитывает с ним цель.
     */
    target: (code: string, sources: () => GoSources): string | null =>
      ((current) =>
        ((link) =>
          link === undefined
            ? null
            : goTarget(current, link, enabled(), sources()))(
          current.links.find((_) => _.code === code)
        ))(setup()),
    /** Реестр страницами, новые сверху; `q` — начало метки или начало слова названия. */
    list: (query: LabelsQuery = {}): LabelsPage =>
      ((sender, q) =>
        ((labels) => ({
          labels: labels.slice(
            queryOffset(query.offset),
            queryOffset(query.offset) + queryLimit(query.limit)
          ),
          total: labels.length,
        }))(
          q === ''
            ? registry.list(sender)
            : registry.list(sender).filter((_) => _matches(_, q))
        ))(
        queryCode(query.sender, CODE_LIMITS.sender, 'sender'),
        typeof query.q === 'string' ? query.q.trim().toLocaleLowerCase() : ''
      ),
    /**
     * Выдать метку: из частей по схеме отправителя, с заданными частями перехода; такая уже есть — прежняя запись
     * с `existing`. Реестр полон — `analytics.too_many`.
     */
    create: (
      input: LabelInput,
      author: SetupAuthor | null = null
    ): LabelIssued =>
      transaction(() =>
        ((snapshot) =>
          ((plan) =>
            ((links, before) =>
              before !== null
                ? { ...before, existing: true, links }
                : registry.count() >= REGISTRY_LIMITS.labels
                  ? fail(
                      'analytics.too_many',
                      `The registry holds up to ${REGISTRY_LIMITS.labels} labels: remove unused ones first`
                    )
                  : ((record) => (
                      registry.add(record),
                      log.append([
                        _entry(
                          record.createdAt,
                          author,
                          'created',
                          null,
                          record
                        ),
                      ]),
                      { ...record, existing: false, links }
                    ))({
                      sender: plan.sender,
                      label: plan.label,
                      name: plan.name,
                      parts: plan.parts,
                      link: plan.link?.code ?? null,
                      author: _authorOf(author),
                      createdAt: clock().toISOString(),
                    } satisfies RegisteredLabel))(
              {
                direct: directLink(snapshot, plan),
                site: siteLink(snapshot, plan, siteUrl()),
              },
              registry.get(plan.sender, plan.label)
            ))(planLabel(snapshot, input)))(setup())
      ),
    /** Переименовать метку реестра; та же метка, то же название — без строки журнала. */
    rename: (
      sender: unknown,
      label: unknown,
      name: unknown,
      author: SetupAuthor | null = null
    ): RegisteredLabel =>
      transaction(() =>
        ((before, next) =>
          before.name === next
            ? before
            : ((after) => (
                registry.rename(before.sender, before.label, next),
                log.append([
                  _entry(
                    clock().toISOString(),
                    author,
                    'changed',
                    before,
                    after
                  ),
                ]),
                after
              ))({ ...before, name: next }))(
          found(sender, label),
          labelName(name)
        )
      ),
    /** Удалить метку из реестра; ссылки с ней работают как прежде, в отчётах она станет «не из реестра». */
    remove: (
      sender: unknown,
      label: unknown,
      author: SetupAuthor | null = null
    ): void =>
      transaction(
        () =>
          void ((before) => (
            registry.remove(before.sender, before.label),
            log.append([
              _entry(clock().toISOString(), author, 'removed', before, null),
            ])
          ))(found(sender, label))
      ),
    /** Проверка метки или адреса до 2000 знаков: части с состоянием, замечания и запись реестра. */
    check: (sender: unknown, text: unknown): LabelCheck =>
      ((snapshot) =>
        ((reading) => ({
          from: reading.from,
          sender: reading.sender,
          label: reading.label,
          link: reading.link,
          ...checkParts(snapshot, reading),
          registered:
            reading.sender === null || reading.label === ''
              ? null
              : registry.get(reading.sender, labelKey(reading.label)),
        }))(readLabelText(snapshot, text, sender)))(setup()),
  };
};

export type Labels = ReturnType<typeof defineLabels>;
