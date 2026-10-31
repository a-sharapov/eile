<script lang="ts">
import { api } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { ago, moment } from '#lib/format.ts';
import { errorMessage, type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import { tree } from '#lib/tree.svelte.ts';
import type {
  MovedAddress,
  RedirectRule,
  RedirectsImport,
  RuleWarning,
  SavedRule,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';

type Draft = { from: string; to: string; status: 301 | 302; note: string };

const _EMPTY: Draft = { from: '', to: '', status: 301, note: '' };

let rules = $state<RedirectRule[]>([]);
let moved = $state<MovedAddress[]>([]);
let draft = $state<Draft>({ ..._EMPTY });
let editing = $state<{ id: number; draft: Draft } | null>(null);
let error = $state<string | null>(null);
let warnings = $state<RuleWarning[]>([]);
let imported = $state<RedirectsImport | null>(null);
let query = $state('');
let busy = $state(false);
let fromInput = $state<HTMLInputElement>();

const loading = defineLoad(() =>
  api
    .get<{ rules: RedirectRule[]; moved: MovedAddress[] }>('/redirects')
    .then((_) => ((rules = _.rules), (moved = _.moved)))
);
$effect(() => void loading.retry());

const shown = $derived(
  ((needle) =>
    needle === ''
      ? rules
      : rules.filter((_) =>
          [_.from, _.to, _.note].some((field) =>
            field.toLowerCase().includes(needle)
          )
        ))(query.trim().toLowerCase())
);

// Цель-страница `[~id~]` — по названию: в таблице и в подсказке под полем.
const pages = $derived(tree.nodes.filter((_) => !_.trashed));
const titleOf = (to: string): string | null =>
  ((match) =>
    match
      ? (pages.find((_) => _.id === Number(match[1]))?.title ?? null)
      : null)(/^\[~(\d+)~\]$/.exec(to.trim()));

const warningText = (warning: RuleWarning): string =>
  t(
    `redirects.warn.${warning.code.slice('redirects.'.length)}` as MessageKey
  ).replace('{detail}', warning.detail);

const kept = (rule: RedirectRule) =>
  void (rules = [...rules.filter((_) => _.id !== rule.id), rule].toSorted(
    (a, b) => a.from.localeCompare(b.from)
  ));

const saved = (result: SavedRule) => (
  kept(result.rule), (warnings = result.warnings), notify(t('redirects.saved'))
);

const add = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    ((busy = true),
    (error = null),
    api
      .send<SavedRule>('POST', '/redirects', draft)
      .then(
        (_) => (
          saved(_),
          (draft = { ..._EMPTY, status: draft.status }),
          fromInput?.focus()
        ),
        (_) => void (error = describe(_))
      )
      .finally(() => (busy = false)))
);

const edit = (rule: RedirectRule) =>
  void (editing = {
    id: rule.id,
    draft: {
      from: rule.from,
      to: rule.to,
      status: rule.status,
      note: rule.note,
    },
  });

const commit = () =>
  editing &&
  api
    .send<SavedRule>('PUT', `/redirects/${editing.id}`, editing.draft)
    .then((_) => (saved(_), (editing = null)), failed);

// В строке правки Enter сохраняет, Esc отменяет — как в таблице страниц.
const keys = (event: KeyboardEvent) =>
  void (event.key === 'Enter'
    ? (event.preventDefault(), commit())
    : event.key === 'Escape' && (editing = null));

const remove = (rule: RedirectRule) =>
  ask({
    title: t('redirects.removeTitle'),
    body: t('redirects.removeBody'),
    items: [`${rule.from} → ${rule.to}`],
    confirm: t('redirects.remove'),
    tone: 'danger',
  }).then(
    (confirmed): unknown =>
      confirmed &&
      api
        .send('DELETE', `/redirects/${rule.id}`)
        .then(
          () => (
            (rules = rules.filter((_) => _.id !== rule.id)),
            notify(t('redirects.removed'))
          ),
          failed
        )
  );

const forget = (address: MovedAddress) =>
  api
    .send('POST', '/redirects/forget', { path: address.path })
    .then(
      () => (
        (moved = moved.filter((_) => _.path !== address.path)),
        notify(t('redirects.forgotten'))
      ),
      failed
    );

const upload = (event: Event) =>
  ((input) =>
    ((file) =>
      file
        ?.text()
        .then((csv) =>
          api.send<RedirectsImport>('POST', '/redirects/import', { csv })
        )
        .then(
          (_) => (
            (imported = _),
            notify(
              t('redirects.imported')
                .replace('{added}', String(_.added))
                .replace('{updated}', String(_.updated))
            ),
            loading.retry()
          ),
          failed
        )
        .finally(() => (input.value = '')))(input.files?.[0]))(
    event.currentTarget as HTMLInputElement
  );

const lastHit = (rule: RedirectRule): string =>
  rule.lastHitAt
    ? `${t('redirects.lastHit')} ${moment(rule.lastHitAt)}`
    : t('redirects.never');
</script>

<datalist id="redirect-pages">
  {#each pages as node (node.id)}<option value={`[~${node.id}~]`}>{node.title}</option>{/each}
</datalist>

<p class="help intro">{t('redirects.intro')}</p>

<form class="add" novalidate onsubmit={add}>
  <label class="path">
    {t('redirects.from')}
    <input class="code" required placeholder="/old-page" autocomplete="off" spellcheck="false" bind:value={draft.from} bind:this={fromInput} />
  </label>
  <label class="path">
    {t('redirects.to')}
    <input class="code" required placeholder="/new-page" list="redirect-pages" autocomplete="off" spellcheck="false" bind:value={draft.to} />
    <small>{titleOf(draft.to) ? `${t('redirects.toPage')} «${titleOf(draft.to)}»` : t('redirects.toHint')}</small>
  </label>
  <label class="code-field">
    {t('redirects.code')}
    <select bind:value={draft.status}>
      <option value={301}>{t('redirects.code301')}</option>
      <option value={302}>{t('redirects.code302')}</option>
    </select>
  </label>
  <label class="note">
    {t('redirects.note')}
    <input maxlength="200" bind:value={draft.note} />
  </label>
  <button class="primary" aria-disabled={busy}>{@html icons.plus}{t('redirects.add')}</button>
</form>
{#if error}<p class="message error" role="alert">{error}</p>{/if}
{#if warnings.length > 0}
  <ul class="message warn" role="status">
    {#each warnings as warning (warning.code)}<li>{warningText(warning)}</li>{/each}
  </ul>
{/if}

<LoadState load={loading}>
  <div class="tools">
    <input class="search" type="search" placeholder={t('redirects.search')} aria-label={t('redirects.search')} bind:value={query} />
    <label class="button ghost file">
      {@html icons.upload}{t('redirects.import')}
      <input type="file" accept=".csv,text/csv" onchange={upload} />
    </label>
    <a class="button ghost" href={api.url('/redirects/export')} download>{@html icons.download}{t('redirects.export')}</a>
  </div>
  {#if imported && imported.skipped.length > 0}
    <div class="message warn" role="status">
      <p>{t('redirects.skipped')}:</p>
      <ul>
        {#each imported.skipped as row (row.line)}
          <li><span class="line">{t('redirects.line')} {row.line}</span> {errorMessage(row.code) ?? row.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if rules.length === 0}
    <p class="muted empty">{t('redirects.empty')}</p>
  {:else if shown.length === 0}
    <p class="muted empty">{t('redirects.notFound')}</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>{t('redirects.from')}</th>
            <th>{t('redirects.to')}</th>
            <th>{t('redirects.code')}</th>
            <th class="num">{t('redirects.hits')}</th>
            <th><span class="sr-only">{t('users.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each shown as rule (rule.id)}
            {#if editing?.id === rule.id}
              <tr class="editing">
                <td>
                  <input class="code" aria-label={t('redirects.from')} bind:value={editing.draft.from} onkeydown={keys} />
                  <input class="note-edit" aria-label={t('redirects.note')} placeholder={t('redirects.note')} maxlength="200" bind:value={editing.draft.note} onkeydown={keys} />
                </td>
                <td><input class="code" aria-label={t('redirects.to')} list="redirect-pages" bind:value={editing.draft.to} onkeydown={keys} /></td>
                <td>
                  <select aria-label={t('redirects.code')} bind:value={editing.draft.status}>
                    <option value={301}>301</option>
                    <option value={302}>302</option>
                  </select>
                </td>
                <td class="num">{rule.hits}</td>
                <td class="row-actions">
                  <button type="button" class="icon" aria-label={t('redirects.save')} title={t('redirects.save')} onclick={commit}>{@html icons.check}</button>
                  <button type="button" class="icon" aria-label={t('common.cancel')} title={t('common.cancel')} onclick={() => (editing = null)}>{@html icons.close}</button>
                </td>
              </tr>
            {:else}
              <tr>
                <td>
                  <code title={rule.from}>{rule.from}</code>
                  {#if rule.note}<small class="muted">{rule.note}</small>{/if}
                </td>
                <td>
                  <code title={rule.to}>{rule.to}</code>
                  {#if titleOf(rule.to)}<small class="muted">{titleOf(rule.to)}</small>{/if}
                </td>
                <td>{rule.status}</td>
                <td class="num" title={lastHit(rule)}>
                  {rule.hits.toLocaleString('ru')}
                  {#if rule.lastHitAt}<small class="muted">{ago(rule.lastHitAt)}</small>{/if}
                </td>
                <td class="row-actions">
                  <button type="button" class="icon" aria-label={`${t('redirects.edit')}: ${rule.from}`} title={t('redirects.edit')} onclick={() => edit(rule)}>{@html icons.pencil}</button>
                  <button type="button" class="icon danger" aria-label={`${t('redirects.remove')}: ${rule.from}`} title={t('redirects.remove')} onclick={() => remove(rule)}>{@html icons.trash}</button>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <section class="moved" aria-labelledby="moved-title">
    <h2 id="moved-title">{t('redirects.moved')}</h2>
    <p class="help">{t('redirects.movedHint')}</p>
    {#if moved.length === 0}
      <p class="muted empty">{t('redirects.movedEmpty')}</p>
    {:else}
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>{t('redirects.from')}</th>
              <th>{t('redirects.to')}</th>
              <th>{t('redirects.movedAt')}</th>
              <th><span class="sr-only">{t('users.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each moved as address (address.path)}
              <tr>
                <td><code title={address.path}>{address.path}</code></td>
                <td><a href={resolve('/(app)/pages/[id]', { id: String(address.pageId) })}>{address.title || `#${address.pageId}`}</a></td>
                <td><time datetime={address.movedAt} title={moment(address.movedAt)}>{ago(address.movedAt)}</time></td>
                <td class="row-actions">
                  <button type="button" class="icon danger" aria-label={`${t('redirects.forget')}: ${address.path}`} title={t('redirects.forget')} onclick={() => forget(address)}>{@html icons.trash}</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</LoadState>

<style>
  .intro {
    max-width: 46rem;
    margin: 0 0 1.25rem;
  }

  /* Форма добавления: поля в строку, на узком экране — столбиком, кнопка под ними. */
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .add label {
    flex: 1 1 10rem;
  }

  .add .path {
    flex-basis: 13rem;
  }

  .add .code-field {
    flex: 0 1 11rem;
  }

  .add button {
    margin-top: 1.4rem;
  }

  .message {
    margin: 0.75rem 0 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    font-size: 0.875rem;
  }

  .message.error {
    border: 0.0625rem solid color-mix(in oklab, var(--danger) 45%, var(--line));
    background: var(--danger-soft);
    color: var(--danger);
  }

  .message.warn {
    border: 0.0625rem solid color-mix(in oklab, var(--warn) 40%, var(--line));
    background: var(--warn-soft);
    color: var(--text);
  }

  ul.message,
  .message ul {
    padding-left: 1.25rem;
  }

  .message p {
    margin: 0;
  }

  .line {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 2rem 0 0.75rem;
  }

  .search {
    flex: 1 1 14rem;
    max-width: 22rem;
  }

  /* Кнопка выбора файла: сам input спрятан, подпись — кнопка. */
  .file {
    position: relative;
    cursor: pointer;
  }

  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .file:focus-within {
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.125rem;
  }

  .empty {
    margin: 0.5rem 0 0;
  }

  /* Широкая таблица прокручивается в своей рамке и не раздвигает вкладку: ширину не наследует от строк. */
  .scroll {
    position: relative;
    contain: inline-size;
    overflow-x: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
  }

  /* Адрес не рвётся посередине: длинный обрезается многоточием, целиком — в подсказке, таблица
     на узком экране прокручивается вбок. */
  td code {
    display: inline-block;
    max-width: 22rem;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    vertical-align: bottom;
    white-space: nowrap;
  }

  time {
    white-space: nowrap;
  }

  td small {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.75rem;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .editing td {
    vertical-align: top;
  }

  .editing input,
  .editing select {
    min-width: 9rem;
  }

  .note-edit {
    margin-top: 0.35rem;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
  }

  .row-actions .icon {
    width: 2rem;
    min-height: 2rem;
  }

  .moved {
    margin-top: 3rem;
  }

  .moved h2 {
    margin: 0 0 0.35rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .moved .help {
    max-width: 46rem;
    margin: 0 0 0.75rem;
  }

  @media (width < 40rem) {
    .add button {
      margin-top: 0;
    }
  }
</style>
