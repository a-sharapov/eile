<script lang="ts">
import { api } from '#lib/api.ts';
import { isHtml } from '#lib/content-types.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { compact, diffLines, textLines } from '#lib/diff.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type {
  Field,
  FieldValue,
  Page,
  PageDetails,
  Revision,
  RevisionKey,
  RevisionSummary,
} from '#lib/types.ts';

let {
  page,
  fields,
  active,
  dirty,
  onrestored,
}: {
  /** Сохранённая страница: с ней и сравнивается версия. */
  page: Page;
  fields: readonly Field[];
  /** Вкладка открыта: история грузится только тогда. */
  active: boolean;
  dirty: boolean;
  onrestored: (next: PageDetails) => void;
} = $props();

// Порядок — как на вкладках редактора: сначала то, что видно в «Документе».
const _LABELS: Readonly<Record<RevisionKey, MessageKey>> = {
  title: 'page.title',
  alias: 'page.address',
  template: 'page.template',
  linkTo: 'page.linkTo',
  menuTitle: 'page.menuTitle',
  introText: 'page.introText',
  content: 'page.content',
  longTitle: 'page.longTitle',
  description: 'seo.description',
  socialImage: 'seo.socialImage',
  kind: 'page.kind',
  contentType: 'page.contentType',
  language: 'page.language',
};

const _KEYS = (Object.keys(_LABELS) as RevisionKey[]).filter(
  (_) => _ !== 'content'
);

let list = $state<RevisionSummary[] | null>(null);
let selected = $state<Revision | null>(null);
let busy = $state(false);

const fieldLabel = (name: string): string =>
  fields.find((_) => _.name === name)?.label ?? name;

const labelOf = (key: string): string =>
  key.startsWith('fields.')
    ? fieldLabel(key.slice(7))
    : t(_LABELS[key as RevisionKey] ?? 'history.what');

const open = (summary: RevisionSummary | null): Promise<void> =>
  summary
    ? api
        .get<Revision>(`/pages/${summary.pageId}/revisions/${summary.id}`)
        .then((_) => void (selected = _))
    : Promise.resolve(void (selected = null));

// Сохранили или вернули версию — список обновляется, открытая версия остаётся открытой.
$effect(() => {
  const id = page.id;
  void (
    active &&
    api
      .get<RevisionSummary[]>(`/pages/${id}/revisions`)
      .then((next) =>
        page.id === id
          ? ((list = next),
            open(next.find((_) => _.id === selected?.id) ?? next[0] ?? null))
          : undefined
      )
      .then(undefined, failed)
  );
});

const _shown = (value: FieldValue | null | undefined): string =>
  value === undefined || value === null || value === ''
    ? '—'
    : value === true
      ? t('history.yes')
      : value === false
        ? t('history.no')
        : String(value);

const rows = $derived(
  selected
    ? [
        ..._KEYS
          .filter((_) => selected!.snapshot[_] !== page[_])
          .map((_) => ({
            key: _,
            label: labelOf(_),
            before: _shown(selected!.snapshot[_]),
            after: _shown(page[_]),
          })),
        ...[
          ...new Set([
            ...Object.keys(selected.snapshot.fields),
            ...Object.keys(page.fields),
          ]),
        ]
          .filter((_) => selected!.snapshot.fields[_] !== page.fields[_])
          .map((_) => ({
            key: `fields.${_}`,
            label: fieldLabel(_),
            before: _shown(selected!.snapshot.fields[_]),
            after: _shown(page.fields[_]),
          })),
      ]
    : []
);

const lines = (_: { content: string; contentType: string }): string[] =>
  isHtml(_.contentType) ? textLines(_.content) : _.content.split('\n');

const contentDiff = $derived(
  selected && selected.snapshot.content !== page.content
    ? compact(diffLines(lines(selected.snapshot), lines(page)))
    : null
);

const markupOnly = $derived(
  contentDiff !== null && contentDiff.every((_) => _.kind === 'skip')
);

const same = $derived(
  selected !== null && rows.length === 0 && contentDiff === null
);

const restore = (revision: Revision) =>
  ask({
    title: t('history.restoreTitle'),
    body: [
      `${t('history.restoreBody')} ${moment(revision.at)}.`,
      t('history.restoreKeeps'),
      ...(dirty ? [t('history.restoreUnsaved')] : []),
    ].join(' '),
    confirm: t('history.restoreConfirm'),
  }).then(
    (confirmed) =>
      void (
        confirmed &&
        ((busy = true),
        api
          .send<PageDetails>(
            'POST',
            `/pages/${revision.pageId}/revisions/${revision.id}/restore`
          )
          .then(onrestored)
          .then(() => notify(t('history.restoredNotice')))
          .then(undefined, failed)
          .finally(() => (busy = false)))
      )
  );
</script>

<div class="history">
  <p class="help intro">{t('history.intro')}</p>
  {#if dirty}<p class="unsaved" role="status">{t('history.unsaved')}</p>{/if}
  {#if list === null}
    <p class="muted">{t('common.loading')}</p>
  {:else if list.length === 0}
    <p class="empty muted">{t('history.empty')}</p>
  {:else}
    <div class="layout">
      <ol class="versions frame" aria-label={t('history.list')}>
        {#each list as item (item.id)}
          <li>
            <button type="button" class="version" aria-current={selected?.id === item.id ? 'true' : undefined} onclick={() => open(item).then(undefined, failed)}>
              <time datetime={item.at} title={moment(item.at)}>{ago(item.at)}</time>
              <span class="who">{item.author?.name ?? t('history.site')}</span>
              <span class="what">{item.action === 'restored' && item.restoredFrom ? `${t('history.restoredFrom')} ${moment(item.restoredFrom)}` : item.changed.map(labelOf).join(', ')}</span>
            </button>
          </li>
        {/each}
      </ol>

      {#if selected}
        <section class="detail" aria-labelledby="history-title">
          <header>
            <div>
              <h3 id="history-title">{t('history.before')} {moment(selected.at)}</h3>
              <p class="muted">{selected.author?.name ?? t('history.site')}</p>
            </div>
            <button type="button" disabled={busy || same} onclick={() => restore(selected!)}>{@html icons.restore}{t('history.restore')}</button>
          </header>

          {#if same}
            <p class="muted">{t('history.same')}</p>
          {/if}

          {#if rows.length > 0}
            <div class="frame">
              <table>
                <thead>
                  <tr><th scope="col">{t('history.what')}</th><th scope="col">{t('history.inVersion')}</th><th scope="col">{t('history.now')}</th></tr>
                </thead>
                <tbody>
                  {#each rows as row (row.key)}
                    <tr><th scope="row">{row.label}</th><td class="old" data-label={t('history.inVersion')}>{row.before}</td><td class="new" data-label={t('history.now')}>{row.after}</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          {#if contentDiff}
            <h4>{t('page.content')}</h4>
            {#if markupOnly}
              <p class="muted">{t('history.markupOnly')}</p>
            {:else}
              <div class="diff frame">
                <p class="legend" aria-hidden="true"><span class="key old">− {t('history.inVersion')}</span><span class="key new">+ {t('history.now')}</span></p>
                {#each contentDiff as line, index (index)}
                  {#if line.kind === 'skip'}
                    <p class="line skip"><span></span><span>{t('history.unchanged')}: {line.count}</span></p>
                  {:else}
                    <p class="line {line.kind}">
                      <span class="sign" aria-hidden="true">{line.kind === 'old' ? '−' : line.kind === 'new' ? '+' : ''}</span>
                      <span class="sr-only">{line.kind === 'old' ? t('history.inVersion') : line.kind === 'new' ? t('history.now') : ''}</span>
                      <span class="text">{#each line.pieces as piece, i (i)}{#if piece.changed && line.kind !== 'same'}<mark>{piece.text}</mark>{:else}{piece.text}{/if}{/each}</span>
                    </p>
                  {/if}
                {/each}
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .history {
    display: grid;
    gap: 1rem;
    container-type: inline-size;
    padding-top: 1.5rem;
  }

  .intro,
  .unsaved,
  .empty {
    max-width: 46rem;
    margin: 0;
  }

  .unsaved {
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid color-mix(in oklch, var(--warn) 35%, var(--line));
    border-radius: var(--radius);
    background: var(--warn-soft);
    color: var(--text);
    font-size: 0.875rem;
  }

  /* Список версий слева, сравнение справа; на узкой холстине — друг под другом. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  @container (width >= 48rem) {
    .layout {
      grid-template-columns: 17rem minmax(0, 1fr);
    }

    .versions {
      position: sticky;
      top: calc(var(--topbar) + 4.5rem);
    }
  }

  .versions {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .versions li + li {
    border-top: 0.0625rem solid var(--line);
  }

  /* Вся строка — цель щелчка: когда, кто, что изменилось. Выбранная — тоном акцента, как вариант выбора. */
  .version {
    display: grid;
    justify-content: stretch;
    justify-items: start;
    gap: 0.15rem;
    width: 100%;
    height: auto;
    padding: 0.7rem 0.9rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text);
    font-weight: 400;
    text-align: left;
  }

  .version:hover {
    background: var(--hover);
  }

  .version[aria-current='true'] {
    background: color-mix(in oklch, var(--accent-soft) 55%, var(--surface));
  }

  .version:focus-visible {
    outline-offset: -0.125rem;
  }

  time {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .who,
  .what {
    width: 100%;
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .what {
    color: var(--muted);
  }

  .detail {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .detail header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem 1rem;
  }

  h3 {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.015em;
  }

  h4 {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .detail header p {
    margin: 0.15rem 0 0;
    font-size: 0.8125rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th,
  td {
    padding: 0.6rem 0.9rem;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  thead th {
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  tbody tr + tr {
    border-top: 0.0625rem solid var(--line);
  }

  tbody th {
    width: 28%;
    font-weight: 550;
  }

  td.old {
    color: var(--muted);
  }

  /* Узкая холстина: строка таблицы — карточкой из трёх строк, «в версии» и «сейчас» подписаны. */
  @container (width < 34rem) {
    thead {
      display: none;
    }

    tr,
    th,
    td {
      display: block;
    }

    tbody th {
      width: auto;
      padding-bottom: 0.15rem;
    }

    td {
      padding-top: 0.15rem;
    }

    td::before {
      display: block;
      color: var(--muted);
      font-size: 0.75rem;
      content: attr(data-label);
    }
  }

  /* Сравнение текста: «было в версии» — тон опасного, «сейчас» — тон опубликованного. */
  .diff {
    padding: 0.35rem 0;
    font-size: 0.875rem;
    line-height: 1.55;
  }

  .line {
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr);
    margin: 0;
    padding: 0.2rem 0.9rem 0.2rem 0;
  }

  .legend {
    display: flex;
    gap: 1rem;
    margin: 0;
    padding: 0.25rem 0.9rem 0.5rem 1.75rem;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .key.old {
    color: var(--danger);
  }

  .key.new {
    color: var(--ok);
  }

  .sign {
    color: var(--muted);
    text-align: center;
  }

  .text {
    overflow-wrap: anywhere;
  }

  .line.old {
    background: color-mix(in oklch, var(--danger) 7%, var(--surface));
  }

  .line.new {
    background: color-mix(in oklch, var(--ok) 8%, var(--surface));
  }

  .line.old .sign {
    color: var(--danger);
  }

  .line.new .sign {
    color: var(--ok);
  }

  mark {
    border-radius: 0.2rem;
    color: inherit;
  }

  .line.old mark {
    background: color-mix(in oklch, var(--danger) 22%, transparent);
    text-decoration: line-through;
    text-decoration-color: color-mix(in oklch, var(--danger) 60%, transparent);
  }

  .line.new mark {
    background: color-mix(in oklch, var(--ok) 24%, transparent);
  }

  .skip {
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
