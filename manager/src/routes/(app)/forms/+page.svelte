<script lang="ts">
import { api, CREATE_ONLY } from '#lib/api.ts';
import { ask, askValue } from '#lib/dialog.svelte.ts';
import { fieldHtml, starterFields } from '#lib/form-blocks.ts';
import { ago, moment } from '#lib/format.ts';
import { forms, loadForms, removeForm } from '#lib/forms.svelte.ts';
import { currentLanguage, type MessageKey, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { refreshInbox } from '#lib/inbox.svelte.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { fileSize } from '#lib/media.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import { aliasFromTitle } from '#lib/translit.ts';
import type {
  InboxRow,
  SubmissionDetail,
  SubmissionStatus,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

const _PAGE = 50;

const _STATUSES: readonly { id: SubmissionStatus | ''; label: MessageKey }[] = [
  { id: '', label: 'inbox.statusAll' },
  { id: 'new', label: 'inbox.statusNew' },
  { id: 'in_work', label: 'inbox.statusWork' },
  { id: 'done', label: 'inbox.statusDone' },
  { id: 'spam', label: 'inbox.statusSpam' },
];

const _STATUS_LABEL: Readonly<Record<SubmissionStatus, MessageKey>> = {
  new: 'inbox.statusNew',
  in_work: 'inbox.statusWork',
  done: 'inbox.statusDone',
  spam: 'inbox.statusSpam',
};

const admin = $derived(session.user?.role === 'admin');
// Меню открывает формы, конверт и ссылки на заявку (?tab=inbox, ?id, ?form) — заявки. У редактора форм нет.
const tab = $derived(
  admin &&
    page.url.searchParams.get('tab') !== 'inbox' &&
    !page.url.searchParams.has('id') &&
    !page.url.searchParams.has('form')
    ? 'forms'
    : 'inbox'
);
const selected = $derived(Number(page.url.searchParams.get('id')) || null);

let form = $state(page.url.searchParams.get('form') ?? '');
// Ссылка формы из конверта меняет фильтр и тогда, когда раздел уже открыт.
$effect(() =>
  ((wanted) => void (wanted !== null && (form = wanted)))(
    page.url.searchParams.get('form')
  )
);
let status = $state<SubmissionStatus | ''>('');
let query = $state('');
let rows = $state<InboxRow[]>([]);
let more = $state(false);
let detail = $state<SubmissionDetail | null>(null);
let note = $state('');
let busy = $state(false);

const params = (before?: number): string =>
  new URLSearchParams(
    Object.entries({
      form,
      status,
      q: query.trim(),
      before: before ? String(before) : '',
    }).filter(({ 1: value }) => value !== '')
  ).toString();

const list = defineLoad(() =>
  Promise.all([
    api.get<InboxRow[]>(`/inbox?${params()}`).then((_) => {
      rows = _;
      more = _.length === _PAGE;
    }),
    forms.items === null ? loadForms() : Promise.resolve(forms.items),
  ])
);

// Фильтры перезагружают список; поиск — с паузой, пока печатают.
let timer = 0;
$effect(() => {
  void [form, status];
  void list.retry();
});
const search = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void list.retry(), 300);
};

const loadMore = () =>
  api
    .get<InboxRow[]>(`/inbox?${params(rows.at(-1)?.id)}`)
    .then((_) => ((rows = [...rows, ..._]), (more = _.length === _PAGE)))
    .then(undefined, failed);

// Открытая заявка — по ?id: ссылка из Telegram и письма ведёт прямо в неё.
$effect(() => {
  const id = selected;
  void (id === null
    ? (detail = null)
    : api.get<SubmissionDetail>(`/inbox/${id}`).then(
        (_) => {
          detail = _;
          note = _.note;
          rows = rows.map((row) =>
            row.id === _.id ? { ...row, read: true } : row
          );
          void refreshInbox();
        },
        (error) => ((detail = null), failed(error))
      ));
});

// Открытая заявка — в адресе; закрытая карточка оставляет вкладку заявок.
const open = (id: number | null) => {
  const next = new URL(page.url.href);
  next.searchParams.set('tab', 'inbox');
  void (id === null
    ? next.searchParams.delete('id')
    : next.searchParams.set('id', String(id)));
  return goto(next, { replace: true, reset: false });
};

const setTab = (next: 'inbox' | 'forms') =>
  goto(
    next === 'inbox'
      ? `${resolve('/(app)/forms')}?tab=inbox`
      : resolve('/(app)/forms'),
    { replace: true }
  );

const change = (patch: { status?: SubmissionStatus; note?: string }) =>
  detail &&
  api
    .send<SubmissionDetail>('PATCH', `/inbox/${detail.id}`, patch)
    .then((_) => {
      detail = { ...detail!, ..._ };
      rows = rows.map((row) =>
        row.id === _.id ? { ...row, status: _.status } : row
      );
      notify(t('inbox.saved'));
    })
    .then(undefined, failed);

const resend = () =>
  detail &&
  api
    .send('POST', `/inbox/${detail.id}/resend`)
    .then(() => notify(t('inbox.resent')))
    .then(undefined, failed);

const resendWebhook = () =>
  detail &&
  api
    .send('POST', `/inbox/${detail.id}/webhook`)
    .then(() => {
      detail = detail && {
        ...detail,
        webhook: detail.webhook && { ...detail.webhook, status: 'pending' },
      };
      notify(t('inbox.webhookResent'));
    })
    .then(undefined, failed);

const _DELIVERY_STATUS: Readonly<Record<string, MessageKey>> = {
  sent: 'inbox.deliverySent',
  delivered: 'inbox.deliverySent',
  failed: 'inbox.deliveryFailed',
};

const statusLabel = (status: string) =>
  t(_DELIVERY_STATUS[status] ?? 'inbox.deliveryPending');

const remove = () =>
  detail &&
  ask({
    title: t('inbox.removeTitle'),
    body: t('inbox.removeBody'),
    confirm: t('inbox.remove'),
    tone: 'danger',
  }).then(
    (confirmed): unknown =>
      confirmed &&
      api
        .send('DELETE', `/inbox/${detail!.id}`)
        .then(() => {
          rows = rows.filter((_) => _.id !== detail!.id);
          void refreshInbox();
          return open(null);
        })
        .then(undefined, failed)
  );

// Кнопки связи по значениям: телефон — позвонить, почта — написать, @ник — в Telegram.
const contacts = (item: SubmissionDetail) =>
  item.values.flatMap((value) =>
    value.kind === 'tel' || /^\+?[\d\s()-]{10,}$/.test(value.value)
      ? [
          {
            href: `tel:${value.value.replace(/[^\d+]/g, '')}`,
            label: t('inbox.call'),
            icon: icons.phone,
          },
        ]
      : value.kind === 'email'
        ? [
            {
              href: `mailto:${value.value}`,
              label: t('inbox.write'),
              icon: icons.mail,
            },
          ]
        : /^@[A-Za-z0-9_]{5,32}$/.test(value.value)
          ? [
              {
                href: `https://t.me/${value.value.slice(1)}`,
                label: 'Telegram',
                icon: icons.send,
              },
            ]
          : []
  );

// Клавиши: j / k — следующая и предыдущая заявка, как в почте.
const keys = (event: KeyboardEvent) =>
  ((step) => {
    const target = event.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable]');
    const index = rows.findIndex((_) => _.id === selected);
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
    void (
      step &&
      !typing &&
      tab === 'inbox' &&
      next &&
      (event.preventDefault(), open(next.id))
    );
  })(({ j: 1, k: -1 } as Record<string, number>)[event.key] ?? 0);

// Ссылка на файл идёт без заголовков fetch: язык заголовков таблицы — в адресе.
const csv = $derived(
  api.url(`/inbox.csv?${params()}&lang=${currentLanguage()}`)
);

const createForm = () =>
  askValue({
    title: t('forms.newTitle'),
    confirm: t('forms.create'),
    input: {
      label: t('forms.titleLabel'),
      type: 'text',
      hint: t('forms.titleHint'),
    },
  }).then((title) =>
    title
      ? ((name) =>
          api
            .send(
              'PUT',
              `/forms/${name}`,
              { title, source: starterFields().map(fieldHtml).join('\n') },
              CREATE_ONLY
            )
            .then(() => loadForms())
            .then(() => goto(resolve('/(app)/forms/[name]', { name }))))(
          aliasFromTitle(title).slice(0, 60) ||
            `form-${Date.now().toString(36)}`
        ).then(undefined, failed)
      : undefined
  );

const copyTag = (name: string) =>
  navigator.clipboard
    .writeText(`[#Form:${name}]`)
    .then(() => notify(`${t('common.copied')} [#Form:${name}]`), failed);
</script>

<svelte:window onkeydown={keys} />
<svelte:head><title>{t('nav.forms')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  {#if tab === 'inbox'}
    <a class="button ghost" href={csv} download>{@html icons.download}{t('inbox.csv')}</a>
  {:else}
    <button type="button" class="button primary" onclick={createForm}>{@html icons.plus}{t('forms.new')}</button>
  {/if}
{/snippet}

<PageHeader title={t(tab === 'forms' ? 'forms.title' : 'inbox.title')} crumbs={tab === 'forms' ? [] : [{ label: t('nav.forms') }]} {actions} />

{#if admin}
  <div class="segmented tabs" role="tablist" aria-label={t('nav.forms')}>
    <button type="button" role="tab" aria-selected={tab === 'forms'} onclick={() => setTab('forms')}>{@html icons.forms}{t('forms.title')}</button>
    <button type="button" role="tab" aria-selected={tab === 'inbox'} onclick={() => setTab('inbox')}>{@html icons.inbox}{t('inbox.title')}</button>
  </div>
{/if}

{#if tab === 'forms'}
  {#if forms.items === null}
    <p class="muted">{t('common.loading')}</p>
  {:else if forms.items.length === 0}
    <div class="frame empty">
      <p>{t('forms.empty')}</p>
      <button type="button" class="button primary" onclick={createForm}>{@html icons.plus}{t('forms.new')}</button>
    </div>
  {:else}
    <ul class="cards">
      {#each forms.items as item (item.name)}
        <li class="frame">
          <a class="title" href={resolve('/(app)/forms/[name]', { name: item.name })}>{item.title}</a>
          <span class="muted">{tn('forms.fieldsCount', item.fields)} · {t('forms.changed', { when: ago(item.updatedAt) })}</span>
          <div class="tag">
            <code>[#Form:{item.name}]</code>
            <button type="button" class="button ghost icon" aria-label={`${t('common.copy')} [#Form:${item.name}]`} title={t('forms.copyTag')} onclick={() => copyTag(item.name)}>{@html icons.copy}</button>
            <button type="button" class="button ghost icon danger remove" aria-label={`${t('formEditor.remove')}: ${item.title}`} title={t('formEditor.remove')} onclick={() => removeForm(item).then(undefined, failed)}>{@html icons.trash}</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{:else}
  <div class="inbox">
    <section class="list" aria-label={t('inbox.list')}>
      <div class="filters">
        <select bind:value={form} aria-label={t('inbox.form')}>
          <option value="">{t('inbox.allForms')}</option>
          {#each forms.items ?? [] as item (item.name)}<option value={item.name}>{item.title}</option>{/each}
        </select>
        <input type="search" bind:value={query} oninput={search} placeholder={t('inbox.search')} aria-label={t('inbox.search')} />
        <div class="segmented statuses" role="group" aria-label={t('inbox.status')}>
          {#each _STATUSES as item (item.id)}
            <button type="button" aria-pressed={status === item.id} onclick={() => (status = item.id)}>{t(item.label)}</button>
          {/each}
        </div>
      </div>
      <LoadState load={list}>
        {#if rows.length === 0}
          <p class="muted none">{form || status || query ? t('inbox.nothing') : t('inbox.empty')}</p>
        {:else}
          <ul class="rows">
            {#each rows as row (row.id)}
              <li>
                <button type="button" class="row" class:unread={!row.read} aria-current={row.id === selected ? 'true' : undefined} onclick={() => open(row.id)}>
                  <span class="line">
                    {#if !row.read}<span class="dot" aria-label={t('inbox.new')}></span>{/if}
                    <strong>{row.preview || row.formTitle}</strong>
                  </span>
                  <span class="muted meta">{row.formTitle} · {ago(row.createdAt)}{#if row.status !== 'new'} · {t(_STATUS_LABEL[row.status])}{/if}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if more}<button type="button" class="button ghost more" onclick={loadMore}>{t('inbox.more')}</button>{/if}
        {/if}
      </LoadState>
    </section>

    <section class="card frame" aria-label={t('inbox.card')}>
      {#if detail}
        <header>
          <div>
            <h2>{detail.formTitle}</h2>
            <span class="muted">№{detail.id} · {moment(detail.createdAt)}</span>
          </div>
          <select value={detail.status} aria-label={t('inbox.status')} onchange={(e) => change({ status: e.currentTarget.value as SubmissionStatus })}>
            {#each _STATUSES.slice(1) as item (item.id)}<option value={item.id}>{t(item.label)}</option>{/each}
          </select>
        </header>
        {#if contacts(detail).length > 0}
          <div class="contacts">
            {#each contacts(detail) as contact (contact.href)}
              <a class="button" href={contact.href} target={contact.href.startsWith('https:') ? '_blank' : undefined} rel="noopener">{@html contact.icon}{contact.label}</a>
            {/each}
          </div>
        {/if}
        <dl class="values">
          {#each detail.values.filter((_) => _.value !== '') as value (value.name)}
            {#if value.kind === 'file'}
              <div>
                <dt>{value.label}</dt>
                <dd>
                  <ul class="files">
                    {#each detail.files.filter((_) => _.field === value.name) as file (file.id)}
                      <li><a href={api.url(`/inbox/${detail.id}/files/${file.id}`)} download={file.name}>{@html icons.download}{file.name}</a> <span class="muted">{fileSize(file.size)}</span></li>
                    {/each}
                  </ul>
                </dd>
              </div>
            {:else}
              <div><dt>{value.label}</dt><dd>{value.value}{#if value.raw !== undefined && value.raw !== value.value} <span class="muted code">{value.raw}</span>{/if}</dd></div>
            {/if}
          {/each}
        </dl>
        <h3>{t('inbox.context')}</h3>
        <dl class="values small">
          {#if detail.context.pageTitle}
            <div><dt>{t('inbox.page')}</dt><dd>{#if detail.context.pageId}<a href={resolve('/(app)/pages/[id]', { id: String(detail.context.pageId) })}>{detail.context.pageTitle}</a>{:else}{detail.context.pageTitle}{/if}</dd></div>
          {/if}
          {#if detail.context.referrer}<div><dt>{t('inbox.referrer')}</dt><dd class="code">{detail.context.referrer}</dd></div>{/if}
          {#each Object.entries(detail.context.utm) as entry (entry[0])}<div><dt class="code">{entry[0]}</dt><dd>{entry[1]}</dd></div>{/each}
          <div><dt>IP</dt><dd class="code">{detail.ip || '—'}</dd></div>
          <div><dt>{t('inbox.browser')}</dt><dd class="muted">{detail.userAgent || '—'}</dd></div>
        </dl>
        <h3>{t('inbox.deliveries')}</h3>
        {#if detail.deliveries.length === 0}
          <p class="muted">{detail.status === 'spam' ? t('inbox.spamNoNotice') : t('inbox.noDeliveries')}</p>
        {:else}
          <ul class="deliveries">
            {#each detail.deliveries as delivery (delivery.id)}
              <li data-status={delivery.status}>
                <span>{delivery.channel === 'telegram' ? 'Telegram' : t('notify.email')}</span>
                <span class="muted">{t(delivery.status === 'sent' ? 'inbox.deliverySent' : delivery.status === 'failed' ? 'inbox.deliveryFailed' : 'inbox.deliveryPending')}</span>
                {#if delivery.lastError && delivery.status !== 'sent'}<span class="code error">{delivery.lastError}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if detail.deliveries.some((_) => _.status !== 'sent')}
            <button type="button" class="button" onclick={resend}>{@html icons.send}{t('notify.retry')}</button>
          {/if}
        {/if}
        {#if detail.confirmations.length > 0 || detail.webhook}
          <ul class="deliveries">
            {#each detail.confirmations as delivery (delivery.id)}
              <li data-status={delivery.status}>
                <span>{t('inbox.confirmation')}</span>
                <span class="code">{delivery.recipient}</span>
                <span class="muted">{statusLabel(delivery.status)}</span>
                {#if delivery.lastError && delivery.status !== 'sent'}<span class="code error">{delivery.lastError}</span>{/if}
              </li>
            {/each}
            {#if detail.webhook}
              <li data-status={detail.webhook.status}>
                <span>{t('inbox.webhook')}</span>
                <span class="muted">{statusLabel(detail.webhook.status)}</span>
                {#if detail.webhook.lastError && detail.webhook.status !== 'delivered'}<span class="code error">{detail.webhook.lastError}</span>{/if}
              </li>
            {/if}
          </ul>
          {#if detail.webhook?.status === 'failed'}
            <button type="button" class="button" onclick={resendWebhook}>{@html icons.send}{t('notify.retry')}</button>
          {/if}
        {/if}
        <h3><label for="inbox-note">{t('inbox.note')}</label></h3>
        <textarea id="inbox-note" rows="3" bind:value={note} placeholder={t('inbox.notePlaceholder')}></textarea>
        <div class="buttons">
          <button type="button" class="button primary" aria-disabled={busy || note === detail.note} onclick={() => note !== detail?.note && change({ note })}>{t('inbox.saveNote')}</button>
          {#if admin}<button type="button" class="button danger" onclick={remove}>{@html icons.trash}{t('inbox.remove')}</button>{/if}
        </div>
      {:else}
        <p class="muted pick">{rows.length > 0 ? t('inbox.pick') : ''}</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  /* Переключатель — как вкладки дерева: «таблетка» на подложке. */
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    justify-self: start;
    width: fit-content;
    gap: 0.125rem;
    padding: 0.1875rem;
    border-radius: calc(var(--radius) + 0.1875rem);
    background: var(--hover);
  }

  .segmented button {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 550;
    cursor: pointer;
  }

  .segmented button:hover:not([aria-selected='true'], [aria-pressed='true']) {
    background: var(--hover);
    color: var(--text);
  }

  .segmented [aria-selected='true'],
  .segmented [aria-pressed='true'] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    color: var(--text);
    font-weight: 600;
  }

  .tabs {
    margin-bottom: 1rem;
  }

  .tabs :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .inbox {
    display: grid;
    grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }

  .filters {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }


  .rows {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Строка — кнопка: сбрасываем центровку и тень кнопок менеджера. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
    justify-items: start;
    gap: 0.15rem;
    width: 100%;
    box-shadow: none;
    white-space: normal;
    padding: 0.6rem 0.75rem;
    border: 0.0625rem solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--hover);
  }

  .row[aria-current] {
    border-color: color-mix(in oklch, var(--accent) 45%, var(--line));
    background: var(--accent-soft);
  }

  .row strong {
    overflow: hidden;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row.unread strong {
    font-weight: 700;
  }

  .line {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .dot {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .meta {
    font-size: 0.8125rem;
  }

  .more {
    margin-top: 0.5rem;
  }

  .none,
  .pick {
    margin: 1rem 0;
  }

  .card {
    display: grid;
    gap: 0.85rem;
    padding: 1.25rem 1.35rem;
    position: sticky;
    top: 1rem;
  }

  .card header {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
  }

  .card header select {
    flex: none;
    width: auto;
    min-width: 9rem;
  }

  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.125rem;
  }

  h3 {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: var(--muted);
  }

  .contacts,
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .values {
    display: grid;
    gap: 0.5rem;
    margin: 0;
  }

  .values div {
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) 1fr;
    gap: 0.75rem;
  }

  .values dt {
    color: var(--muted);
  }

  .values dd {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .small {
    font-size: 0.875rem;
  }

  .files {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .files a {
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
  }

  .files a :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .deliveries {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .deliveries li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
  }

  .deliveries li[data-status='failed'] span:first-child {
    color: var(--danger);
  }

  .error {
    flex-basis: 100%;
    color: var(--danger);
    font-size: 0.8125rem;
  }

  textarea {
    width: 100%;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: 0.85rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cards li {
    display: grid;
    gap: 0.4rem;
    padding: 1rem 1.15rem;
  }

  .cards .title {
    color: var(--text);
    font-weight: 650;
    text-decoration: none;
  }

  .cards .title:hover {
    color: var(--accent);
  }

  .tag {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .tag .remove {
    margin-inline-start: auto;
  }

  .empty {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.5rem;
  }

  @media (max-width: 56rem) {
    .inbox {
      grid-template-columns: 1fr;
    }

    .card {
      position: static;
    }
  }
</style>
