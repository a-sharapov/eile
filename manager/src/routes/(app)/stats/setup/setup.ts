import { api, isApiError } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { quoted, t } from '#lib/i18n.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { SetupGroup, SetupView, ThresholdRule } from '#lib/types.ts';

// Действия над элементами настройки, общие для подвкладок: форма, архив, удаление с объяснением отказа.

/** Элемент любой группы так, как его отдаёт GET /analytics/setup. */
export type SetupRow = Readonly<Record<string, unknown>> & {
  readonly code: string;
  readonly name: string;
  readonly archivedAt: string | null;
};

/** Что открыть в форме: прежний элемент или новый — с подставленными полями (из «Незнакомых»). */
export type EditRequest = {
  readonly group: SetupGroup;
  readonly item: SetupRow | null;
  readonly preset?: Readonly<Record<string, unknown>>;
};

const _OWNER: Readonly<Partial<Record<SetupGroup, string>>> = {
  type: 'sender',
  property: 'scope',
  value: 'dictionary',
};

/**
 * Ключ элемента в теле запроса: код, у типа — ещё отправитель, у свойства — область, у значения — справочник; у
 * схемы метки — только отправитель.
 */
export var keyOf = (
  group: SetupGroup,
  item: SetupRow
): Record<string, unknown> =>
  group === 'schema'
    ? { sender: item.sender }
    : ((owner) => ({
        code: item.code,
        ...(owner === undefined ? {} : { [owner]: item[owner] }),
      }))(_OWNER[group]);

const _schemaName = (setup: SetupView, sender: string): string =>
  t('setupList.usedBySchema', {
    name: quoted(
      setup.schemas.find((_) => _.sender === sender)?.name ?? sender
    ),
  });

const _hasPart = (parts: Readonly<Record<string, string>>, code: string) =>
  Object.hasOwn(parts, code);

// Свои проверки, чьё правило ссылается на отправителя, тип или переход: пока ссылаются, удалить нельзя.
const _checksUsing = (
  setup: SetupView,
  uses: (rule: ThresholdRule) => boolean
): string[] =>
  (setup.checks ?? [])
    .filter((_) => !_.builtin && uses(_.params as ThresholdRule))
    .map((_) => t('setupList.usedByCheck', { name: quoted(_.name) }));

/**
 * Кто держит назначение справочника — как у сервера: свойство-выбор, схема метки, соответствие и переход. Пока
 * держат, назначение не меняется.
 */
export var purposeUsersOf = (setup: SetupView, code: string): string[] => [
  ...setup.properties
    .filter((_) => _.dictionary === code)
    .map((_) => t('setupList.usedByProperty', { name: quoted(_.name) })),
  ...setup.schemas
    .filter((_) => _.parts.includes(code))
    .map((_) => _schemaName(setup, _.sender)),
  ...setup.referrers
    .filter((_) => _hasPart(_.parts, code))
    .map((_) => t('setupList.usedByReferrer', { name: quoted(_.name) })),
  ...setup.links
    .filter((_) => _hasPart(_.parts, code))
    .map((_) => t('setupList.usedByLink', { name: quoted(_.name) })),
];

/**
 * Кто ссылается на элемент — словами, как таблица «Кто ссылается» сервера: пока ссылаются, удалить нельзя.
 * События сервер видит сам: у типа и отправителя с событиями отказ придёт и без ссылок здесь.
 */
export var usersOf = (
  setup: SetupView,
  group: SetupGroup,
  item: SetupRow
): string[] =>
  (
    ({
      sender: () => [
        ...setup.types
          .filter((_) => _.sender === item.code)
          .map((_) => t('setupList.usedByType', { name: quoted(_.name) })),
        ...setup.schemas
          .filter((_) => _.sender === item.code)
          .map((_) => _schemaName(setup, _.sender)),
        ...setup.links
          .filter((_) => _.sender === item.code)
          .map((_) => t('setupList.usedByLink', { name: quoted(_.name) })),
        ...setup.milestones
          .filter((_) => _.sender === item.code)
          .map((_) => t('setupList.usedByMilestone', { name: quoted(_.name) })),
        ..._checksUsing(setup, (_) => _.sender === item.code),
      ],
      type: () => [
        ...setup.milestones
          .filter(
            (_) =>
              _.sender === item.sender &&
              (_.type === item.code || _.anchor === item.code)
          )
          .map((_) => t('setupList.usedByMilestone', { name: quoted(_.name) })),
        ...setup.funnels
          .filter((_) =>
            _.steps.some(
              (step) =>
                step.kind === 'type' &&
                step.sender === item.sender &&
                step.type === item.code
            )
          )
          .map((_) => t('setupList.usedByFunnel', { name: quoted(_.name) })),
        ..._checksUsing(
          setup,
          (_) => _.sender === item.sender && _.type === item.code
        ),
      ],
      property: () =>
        item.scope === 'event'
          ? [
              ...setup.types
                .filter((_) => _.properties.some((p) => p.code === item.code))
                .map((_) =>
                  t('setupList.usedByType', { name: quoted(_.name) })
                ),
              ...setup.milestones
                .filter((_) => _.condition?.property === item.code)
                .map((_) =>
                  t('setupList.usedByMilestone', { name: quoted(_.name) })
                ),
            ]
          : [],
      dictionary: () => [
        ...purposeUsersOf(setup, item.code),
        ...(
          setup.dictionaries.find((_) => _.code === item.code)?.values ?? []
        ).map((_) => t('setupList.usedByValue', { name: quoted(_.name) })),
      ],
      value: () => [
        ...setup.referrers
          .filter(
            (_) =>
              _hasPart(_.parts, String(item.dictionary)) &&
              _.parts[String(item.dictionary)] === item.code
          )
          .map((_) => t('setupList.usedByReferrer', { name: quoted(_.name) })),
        ...setup.links
          .filter(
            (_) =>
              _hasPart(_.parts, String(item.dictionary)) &&
              _.parts[String(item.dictionary)] === item.code
          )
          .map((_) => t('setupList.usedByLink', { name: quoted(_.name) })),
        ...setup.milestones
          .filter(
            (_) =>
              _.condition !== null &&
              'eq' in _.condition &&
              _.condition.eq === item.code &&
              setup.properties.some(
                (property) =>
                  property.scope === 'event' &&
                  property.code === _.condition?.property &&
                  property.dictionary === item.dictionary
              )
          )
          .map((_) => t('setupList.usedByMilestone', { name: quoted(_.name) })),
      ],
      schema: () =>
        setup.links
          .filter((_) => _.sender === item.sender)
          .map((_) => t('setupList.usedByLink', { name: quoted(_.name) })),
      referrer: () => [],
      link: () => [
        ...setup.funnels
          .filter((_) =>
            _.steps.some(
              (step) => step.kind === 'goal' && step.goal === `go:${item.code}`
            )
          )
          .map((_) => t('setupList.usedByFunnel', { name: quoted(_.name) })),
        ..._checksUsing(setup, (_) => _.goal === `go:${item.code}`),
      ],
      milestone: () =>
        setup.funnels
          .filter((_) =>
            _.steps.some(
              (step) =>
                step.kind === 'milestone' && step.milestone === item.code
            )
          )
          .map((_) => t('setupList.usedByFunnel', { name: quoted(_.name) })),
      funnel: () => [],
    }) satisfies Record<SetupGroup, () => string[]>
  )[group]();

type Placed = SetupRow & { readonly position: number };

/**
 * Поменять соседей местами: порядок — их `position`, две правки. При одинаковых номерах тот, кто должен встать
 * ниже, получает номер на единицу больше.
 */
export var swap = (
  group: SetupGroup,
  item: Placed,
  other: Placed,
  step: -1 | 1
): Promise<unknown> =>
  ((mine, theirs) =>
    api
      .send('PUT', `/analytics/setup/${group}`, {
        ...keyOf(group, item),
        position: mine,
      })
      .then(() =>
        api.send('PUT', `/analytics/setup/${group}`, {
          ...keyOf(group, other),
          position: theirs,
        })
      ))(
    item.position !== other.position
      ? other.position
      : item.position + Number(step > 0),
    item.position !== other.position
      ? item.position
      : other.position + Number(step < 0)
  );

const _base = (group: SetupGroup, item: SetupRow): string =>
  group === 'sender'
    ? `/analytics/senders/${encodeURIComponent(item.code)}`
    : `/analytics/setup/${group}`;

/** В архив и обратно: элемент в архиве не предлагается в формах, но действует в событиях. */
export var archive = (
  group: SetupGroup,
  item: SetupRow,
  archived: boolean
): Promise<boolean> =>
  api
    .send(
      'POST',
      `${_base(group, item)}/archive`,
      group === 'sender' ? { archived } : { ...keyOf(group, item), archived }
    )
    .then(
      () => (
        notify(
          t(archived ? 'setupList.archived' : 'setupList.restored', {
            name: quoted(item.name),
          })
        ),
        true
      ),
      (error) => (failed(error), false)
    );

// Удалить не дали — объясняем словами, кто держит элемент, и предлагаем архив вместо удаления.
const _inUse = (
  setup: SetupView,
  group: SetupGroup,
  item: SetupRow
): Promise<boolean> =>
  ((users) =>
    ask({
      title: t('setupList.inUseTitle', { name: quoted(item.name) }),
      body: t(
        users.length > 0 ? 'setupList.inUseUsers' : 'setupList.inUseEvents'
      ),
      items: users,
      confirm: t('setupList.archiveInstead'),
    }).then((yes) =>
      yes && item.archivedAt === null ? archive(group, item, true) : false
    ))(usersOf(setup, group, item));

/**
 * Удалить элемент без ссылок — после подтверждения; на него ссылаются (здесь видно или сервер отказал `in_use`) —
 * объяснение словами, кто держит, и архив вместо удаления.
 */
export var remove = (
  setup: SetupView,
  group: SetupGroup,
  item: SetupRow
): Promise<boolean> =>
  usersOf(setup, group, item).length > 0
    ? _inUse(setup, group, item)
    : _confirmRemove(setup, group, item);

const _confirmRemove = (
  setup: SetupView,
  group: SetupGroup,
  item: SetupRow
): Promise<boolean> =>
  ask({
    title: t('setupList.removeTitle', { name: quoted(item.name) }),
    body: t(
      group === 'sender' ? 'setupList.removeSenderBody' : 'setupList.removeBody'
    ),
    confirm: t('setupList.remove'),
    tone: 'danger',
  }).then((yes) =>
    yes
      ? api
          .send(
            'POST',
            `${_base(group, item)}/remove`,
            group === 'sender' ? undefined : keyOf(group, item)
          )
          .then(
            () => (
              notify(t('setupList.removed', { name: quoted(item.name) })), true
            ),
            (error) =>
              isApiError(error) && error.code === 'analytics.in_use'
                ? _inUse(setup, group, item)
                : (failed(error), false)
          )
      : false
  );
