import { GROUP_LABELS, type SetGroup } from '#lib/analytics.ts';
import {
  currentLanguage,
  type MessageKey,
  number,
  quoted,
  t,
} from '#lib/i18n.ts';
import { money } from '#lib/money.ts';
import type { CheckView, SetupLogEntry, SetupView } from '#lib/types.ts';
import {
  checkName,
  monthText,
  rowDayText,
  scopeName,
  zoneOfCheck,
} from '../quality/quality.ts';

// Журнал настройки словами (ADR 0072, «Набор, ссылки, архив и журнал»): что за строка, о чём она и что изменила.
// Строки этапа 4 — поправки и свои проверки, снятия вручную, выписки и загрузка набора.

export var LOG_ITEMS: Readonly<Record<SetupLogEntry['item'], MessageKey>> = {
  ...GROUP_LABELS,
  set: 'setupLog.itemSet',
  settings: 'setupLog.itemSettings',
  key: 'setupLog.itemKey',
  label: 'setupLog.itemLabel',
  rate: 'setupLog.itemRate',
  spend: 'setupLog.itemSpend',
  resolution: 'setupLog.itemResolution',
  statement: 'setupLog.itemStatement',
};

type Json = Readonly<Record<string, unknown>> | null;

const _DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ключ снятия: `проверка/сутки`, `проверка/отправитель/сутки`, у тестовой строки — ещё `/test`. */
export var resolutionKey = (
  key: string
): { check: string; scope: string | null; day: string; test: boolean } =>
  ((parts) =>
    ((test) =>
      ((rest) => ({
        check: rest[0] ?? '',
        scope: rest.length > 2 ? (rest[1] ?? null) : null,
        day: rest.find((_) => _DAY.test(_)) ?? rest.at(-1) ?? '',
        test,
      }))(test ? parts.slice(0, -1) : parts))(parts.at(-1) === 'test'))(
    key.split('/')
  );

/** Снятие словами: «События дошли · Бот, 24 нояб.: снято — «повтор после сбоя»». */
export var resolutionText = (
  entry: Pick<SetupLogEntry, 'key' | 'action' | 'before' | 'after'>,
  checks: readonly Pick<CheckView, 'code' | 'name'>[],
  setup: Pick<SetupView, 'senders'> | null
): string =>
  ((ref, record) =>
    t(
      entry.action === 'removed'
        ? 'setupLog.resolutionRemoved'
        : 'setupLog.resolutionCreated',
      {
        check: `${checkName(ref.check, checks)}${ref.scope === null ? '' : ` · ${scopeName(setup, ref.scope)}`}`,
        day: rowDayText(zoneOfCheck(ref.check), ref.day),
        note: quoted(String(record?.note ?? '')),
      }
    ))(resolutionKey(entry.key), (entry.after ?? entry.before) as Json);

/** Выписка словами: «октябрь 2026 г. · EUR: 1 250,00 € до комиссии». */
export var statementText = (
  record: Readonly<Record<string, unknown>>
): string =>
  t('setupLog.statementSummary', {
    month: monthText(`${String(record.month)}-01`),
    currency: String(record.currency),
    amount: money(
      Number(record.amount),
      String(record.currency),
      currentLanguage()
    ),
    fees: t(record.fees === 'net' ? 'statements.net' : 'statements.gross'),
  });

/** Набор словами: по группам — сколько элементов создано и изменено; нули не называются. */
export var setText = (entry: Pick<SetupLogEntry, 'before' | 'after'>): string =>
  ((was, now) =>
    Object.entries(now)
      .map(({ 0: group, 1: items }) =>
        ((created, changed) =>
          t(
            changed === 0
              ? 'setupLog.setGroupNew'
              : created === 0
                ? 'setupLog.setGroupChanged'
                : 'setupLog.setGroup',
            {
              group: Object.hasOwn(GROUP_LABELS, group)
                ? t(GROUP_LABELS[group as SetGroup])
                : group,
              created: number(created),
              changed: number(changed),
            }
          ))(
          Object.keys(items).filter((_) => !Object.hasOwn(was[group] ?? {}, _))
            .length,
          Object.keys(items).filter((_) => Object.hasOwn(was[group] ?? {}, _))
            .length
        )
      )
      .join('; '))(
    (entry.before ?? {}) as Readonly<
      Record<string, Readonly<Record<string, unknown>>>
    >,
    (entry.after ?? {}) as Readonly<
      Record<string, Readonly<Record<string, unknown>>>
    >
  );
