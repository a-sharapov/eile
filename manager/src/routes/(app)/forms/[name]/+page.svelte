<script lang="ts">
import { tick } from 'svelte';
import { api } from '#lib/api.ts';
import {
  blockGaps,
  blockSpan,
  emptyField,
  FIELD_KINDS,
  type FormBlock,
  formBlockId,
  moveBlock,
  serializeForm,
  stepOf,
} from '#lib/form-blocks.ts';
import { parseForm } from '#lib/form-parse.ts';
import { loadForms, removeForm } from '#lib/forms.svelte.ts';
import { guardUnsaved } from '#lib/guard.svelte.ts';
import { type MessageKey, quoted, t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import { defineSortable, toBody } from '#lib/sortable.svelte.ts';
import { branchOrder, loadTree } from '#lib/tree.svelte.ts';
import type {
  ChannelKind,
  FieldKind,
  FormDetail,
  SourceChoice,
} from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import TextBlock from '#lib/ui/TextBlock.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import FieldEditor from './FieldEditor.svelte';

const name = $derived(page.params.name ?? '');

type Settings = Pick<
  FormDetail,
  | 'title'
  | 'submitLabel'
  | 'successText'
  | 'successPage'
  | 'subject'
  | 'channels'
  | 'retentionDays'
  | 'minSeconds'
  | 'allowLinks'
  | 'goal'
  | 'confirmation'
  | 'webhook'
>;

let settings = $state<Settings | null>(null);
let blocks = $state<FormBlock[]>([]);
let saved = $state('');
let open = $state<number | null>(null);
let sources = $state<SourceChoice[]>([]);
let pageFields = $state<string[]>([]);
let preview = $state('');
let tab = $state('fields');
let busy = $state(false);

const snapshot = (): string =>
  JSON.stringify({ settings, source: serializeForm(blocks) });

const loading = defineLoad(() =>
  Promise.all([
    api.get<FormDetail>(`/forms/${name}`).then((form) => {
      const { fields: _fields, source, ...rest } = form;
      settings = rest;
      blocks = parseForm(source);
      saved = snapshot();
    }),
    api
      .get<{ sources: SourceChoice[]; fields: string[] }>('/forms/sources')
      .then((_) => ((sources = _.sources), (pageFields = _.fields))),
    loadTree(),
  ])
);
$effect(() => void (name && loading.retry()));

const dirty = $derived(settings !== null && snapshot() !== saved);
guardUnsaved(() => dirty);

const pages = $derived(
  branchOrder(null).map((_) => ({
    id: _.node.id,
    title: _.node.title,
    depth: _.depth,
  }))
);
const names = (except: FormBlock) =>
  blocks
    .filter((_) => _ !== except && _.kind === 'field')
    .map((_) => (_.kind === 'field' ? _.field.name : ''));

// Откуда письму отправителю взять адрес: поля почты и прочие текстовые, по умолчанию — первое поле почты.
const addressFields = $derived(
  blocks.flatMap((_) =>
    _.kind === 'field' && ['email', 'text', 'hidden'].includes(_.field.kind)
      ? [{ name: _.field.name, label: _.field.label.replace(/[{}]/g, '') }]
      : []
  )
);
const hasEmailField = $derived(
  blocks.some((_) => _.kind === 'field' && _.field.kind === 'email')
);

// Поля, от которых может зависеть показ этого: видимые посетителю, кроме него самого.
const others = (except: FormBlock) =>
  blocks.flatMap((_) =>
    _ !== except && _.kind === 'field' && _.field.kind !== 'hidden'
      ? [{ name: _.field.name, label: _.field.label.replace(/[{}]/g, '') }]
      : []
  );

// Предпросмотр — то же, что увидит посетитель: сервер рисует несохранённый HTML формы.
let timer = 0;
$effect(() => {
  const source = serializeForm(blocks);
  const submitLabel = settings?.submitLabel ?? '';
  clearTimeout(timer);
  timer = window.setTimeout(
    () =>
      void fetch(api.url('/forms/preview'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source, submitLabel }),
      })
        .then((_) => _.text())
        .then(
          (_) => void (preview = _),
          () => undefined
        ),
    300
  );
});

// Правленое поле — в каноническом виде: исходная разметка больше не соответствует.
const touch = (block: FormBlock) =>
  void (block.kind === 'field' && (block.original = null));

const addField = (kind: FieldKind) => {
  const block: FormBlock = {
    id: formBlockId(),
    kind: 'field',
    field: { ...emptyField(kind), label: '', name: '' },
    original: null,
  };
  blocks = [...blocks, block];
  open = block.id;
  return tick().then(() =>
    document
      .querySelector<HTMLInputElement>(`[data-block="${block.id}"] input`)
      ?.focus()
  );
};

const addText = () => {
  blocks = [...blocks, { id: formBlockId(), kind: 'text', html: '' }];
};

// Шаг: всё, что ниже, до следующего шага, посетитель увидит отдельным экраном с «Далее».
const addStep = () => {
  const block: FormBlock = {
    id: formBlockId(),
    kind: 'step',
    title: tn(
      'formEditor.stepNumber',
      blocks.filter((_) => _.kind === 'step').length + 1
    ),
  };
  blocks = [...blocks, block];
  return tick().then(() =>
    document
      .querySelector<HTMLInputElement>(`[data-block="${block.id}"] input`)
      ?.select()
  );
};

let list = $state<HTMLOListElement>();

// После перестановки фокус остаётся на той же кнопке того же блока, а если она погасла — на соседней.
const focusIn = (id: number, selectors: readonly string[]) =>
  tick().then(() =>
    selectors
      .map((_) =>
        list?.querySelector<HTMLButtonElement>(`li[data-block="${id}"] ${_}`)
      )
      .find((_) => _ && !_.disabled)
      ?.focus()
  );

const move = (index: number, by: -1 | 1) => {
  const id = blocks[index]!.id;
  blocks = blocks.map((block, i) =>
    i === index
      ? blocks[index + by]!
      : i === index + by
        ? blocks[index]!
        : block
  );
  return focusIn(id, [
    `[data-control="${by < 0 ? 'up' : 'down'}"]`,
    `[data-control="${by < 0 ? 'down' : 'up'}"]`,
  ]);
};

const _NAMES: {
  readonly [K in FormBlock['kind']]: (
    block: Extract<FormBlock, { kind: K }>
  ) => string;
} = {
  text: () => t('formEditor.textBlock'),
  step: (_) =>
    _.title.trim() ? quoted(_.title.trim()) : t('formEditor.stepsEnd'),
  field: (_) =>
    ((label) => (label ? quoted(label) : kindLabel(_.field.kind)))(
      _.field.label.replace(/[{}]/g, '').trim()
    ),
};

/** Как назвать блок читалке и на ручке: подпись поля, название шага. */
const blockName = (block: FormBlock): string =>
  (_NAMES[block.kind] as (block: FormBlock) => string)(block);

const position = (index: number) => ({
  name: blocks[index] ? blockName(blocks[index]) : '',
  n: index + 1,
  total: blocks.length,
});

// Поле, переехавшее в другой шаг, — читалке и шаг: иначе переход через границу шага не слышен.
const where = (index: number, plain: MessageKey, inStep: MessageKey) =>
  ((step) =>
    step === null || blocks[index]?.kind === 'step'
      ? t(plain, position(index))
      : t(inStep, { ...position(index), step: quoted(step) }))(
    stepOf(blocks, index)
  );

// Шаг тянется со всем, что в нём, и встаёт только на границу шагов (blockGaps).
const sorter = defineSortable({
  count: () => blocks.length,
  rows: () => [...(list?.querySelectorAll<HTMLElement>(':scope > li') ?? [])],
  span: (index) => blockSpan(blocks, index),
  gaps: (index) => blockGaps(blocks, index),
  move: (from, to) => void (blocks = moveBlock(blocks, from, to)),
  say: {
    picked: (index) =>
      ((block) =>
        t(
          block?.kind === 'step' && block.title.trim()
            ? 'formEditor.pickedStep'
            : 'sortable.picked',
          position(index)
        ))(blocks[index]),
    moved: (index) => where(index, 'sortable.moved', 'formEditor.movedInStep'),
    dropped: (index) =>
      where(index, 'sortable.dropped', 'formEditor.droppedInStep'),
    cancelled: (index) => t('sortable.cancelled', position(index)),
  },
  // Шапка менеджера и строка страницы закреплены сверху: прокрутка у края начинается под ними.
  top: () =>
    Math.max(
      0,
      ...[...document.querySelectorAll('.topbar, .page-bar')].map(
        (_) => _.getBoundingClientRect().bottom
      )
    ),
});

type Ghost = { kind: string; name: string };

const _GHOSTS: {
  readonly [K in FormBlock['kind']]: (
    block: Extract<FormBlock, { kind: K }>
  ) => Ghost;
} = {
  text: (_) => ({
    kind: t('formEditor.textBlock'),
    name: _.html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }),
  step: (_) => ({
    kind: t('formEditor.stepBlock'),
    name: _.title.trim() || t('formEditor.stepsEnd'),
  }),
  field: (_) => ({
    kind: kindLabel(_.field.kind),
    name: _.field.label.replace(/[{}]/g, '') || t('formEditor.untitled'),
  }),
};

// «Призрак» под пальцем: вид блока и название; у шага — сколько блоков едет вместе с ним.
const ghostOf = (index: number) =>
  ((block) =>
    block && {
      ...(_GHOSTS[block.kind] as (block: FormBlock) => Ghost)(block),
      more: blockSpan(blocks, index) - 1,
    })(blocks[index]);

const removeBlock = (index: number) => {
  const removed = blocks[index]!;
  blocks = blocks.filter((_, i) => i !== index);
  notify(t('blocks.removed'), 'ok', {
    label: t('common.undo'),
    run: () =>
      (blocks = [...blocks.slice(0, index), removed, ...blocks.slice(index)]),
  });
};

const save = () =>
  settings &&
  ((busy = true),
  api
    .send<FormDetail>('PUT', `/forms/${name}`, {
      ...settings,
      source: serializeForm(blocks),
    })
    // Сервер мог выдать секрет вебхука: настройки — из ответа.
    .then(({ fields: _fields, source: _source, ...rest }) => {
      settings = rest;
      saved = snapshot();
      notify(t('formEditor.saved'));
      return loadForms();
    })
    .then(undefined, failed)
    .finally(() => (busy = false)));

// Удалённая форма не держит уход со страницы вопросом о несохранённом.
const remove = () =>
  removeForm({ name, title: settings?.title || name })
    .then(
      (removed): unknown =>
        removed && ((saved = snapshot()), goto(resolve('/(app)/forms')))
    )
    .then(undefined, failed);

const copyTag = () =>
  navigator.clipboard
    .writeText(`[#Form:${name}]`)
    .then(() => notify(`${t('common.copied')} [#Form:${name}]`), failed);

const copySecret = () =>
  settings &&
  navigator.clipboard
    .writeText(settings.webhook.secret)
    .then(
      () => notify(`${t('common.copied')} ${t('formEditor.webhookSecret')}`),
      failed
    );

const toggleChannel = (channel: ChannelKind, on: boolean) =>
  settings &&
  (settings.channels = on
    ? [...new Set([...(settings.channels ?? []), channel])]
    : (settings.channels ?? []).filter((_) => _ !== channel));

const kindLabel = (kind: FieldKind): string =>
  t(FIELD_KINDS.find((_) => _.id === kind)?.label ?? 'formEditor.kindText');

// Значки палитры «Добавить в форму»: по одному на вид поля, рядом с подписью.
const _KIND_ICONS: Readonly<Record<FieldKind, string>> = {
  text: icons.fields,
  email: icons.at,
  tel: icons.phone,
  url: icons.link,
  number: icons.hash,
  date: icons.calendar,
  time: icons.clock,
  'datetime-local': icons.calendarClock,
  range: icons.slider,
  textarea: icons.paragraph,
  select: icons.select,
  radio: icons.radio,
  checkbox: icons.checks,
  consent: icons.consent,
  file: icons.paperclip,
  hidden: icons.eyeOff,
};

// Ctrl+S — сохранить, как в редакторе страницы.
const keys = (event: KeyboardEvent) =>
  void (
    (event.ctrlKey || event.metaKey) &&
    event.key === 's' &&
    (event.preventDefault(), dirty && save())
  );
</script>

<svelte:window onkeydown={keys} />
<svelte:head><title>{settings?.title ?? name} — {t('nav.forms')} — {t('app.name')}</title></svelte:head>

{#snippet actions()}
  <button type="button" class="button ghost" onclick={copyTag} title={t('forms.copyTag')}>{@html icons.copy}<code>[#Form:{name}]</code></button>
  <button type="button" class="button danger ghost" onclick={remove}>{@html icons.trash}{t('formEditor.remove')}</button>
  <button type="button" class="button primary" aria-disabled={busy || !dirty} onclick={() => dirty && save()}>{t('formEditor.save')}</button>
{/snippet}

<PageHeader
  title={settings?.title || name}
crumbs={[{ label: t('nav.forms'), href: resolve('/(app)/forms') }]}
  {actions}
/>

{#snippet fieldsTab()}
  <div class="composer">
    <div class="blocks">
      <ol bind:this={list}>
        {#each blocks as block, index (block.id)}
          <li data-block={block.id} data-kind={block.kind} {...sorter.row(index)}>
            {#snippet controls()}
              <div class="controls">
                <button type="button" class="icon" data-control="up" disabled={index === 0} aria-label={t('blocks.up')} title={t('blocks.up')} onclick={() => move(index, -1)}>{@html icons.arrowUp}</button>
                <button type="button" class="icon" data-control="down" disabled={index === blocks.length - 1} aria-label={t('blocks.down')} title={t('blocks.down')} onclick={() => move(index, 1)}>{@html icons.arrowDown}</button>
                <button type="button" class="icon danger" aria-label={t('blocks.remove')} title={t('blocks.remove')} onclick={() => removeBlock(index)}>{@html icons.close}</button>
              </div>
            {/snippet}
            <button type="button" class="grip" {...sorter.handle(index)} aria-label={t('sortable.grip', { name: blockName(block) })} aria-describedby="sort-hint" title={t('sortable.gripTitle')}>{@html icons.grip}</button>
            <div class="body">
              {#if block.kind === 'text'}
                <TextBlock bind:value={block.html} label={t('formEditor.textBlock')} placeholder={t('formEditor.textHint')} actions={controls} />
              {:else if block.kind === 'step'}
                <div class="step-card">
                  <div class="head">
                    <label class="step-title">
                      <span class="kind muted">{t('formEditor.stepBlock')}</span>
                      <input bind:value={block.title} maxlength="120" aria-label={t('formEditor.stepTitle')} />
                    </label>
                    {@render controls()}
                  </div>
                  <small class="muted">{t('formEditor.stepHint')}</small>
                </div>
              {:else}
                <div class="field-card" class:open={open === block.id}>
                  <div class="head">
                    <button type="button" class="summary" aria-expanded={open === block.id} onclick={() => (open = open === block.id ? null : block.id)}>
                      {@html icons.chevron}
                      <span class="kind muted">{kindLabel(block.field.kind)}</span>
                      <strong>{block.field.label.replace(/[{}]/g, '') || t('formEditor.untitled')}</strong>
                      {#if block.field.required}<span class="req" title={t('formEditor.required')}>*</span>{/if}
                      <code class="muted">{block.field.name}</code>
                    </button>
                    {@render controls()}
                  </div>
                  {#if open === block.id}
                    <div oninput={() => touch(block)} onchange={() => touch(block)} role="group">
                      <FieldEditor bind:field={block.field} {sources} {pageFields} {pages} taken={names(block)} others={others(block)} />
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
      <span id="sort-hint" class="sr-only">{t('sortable.hint')}</span>
      <div class="sr-only" aria-live="assertive" aria-atomic="true">{sorter.state.message}</div>
      {#if sorter.state.mode === 'pointer' && sorter.state.from !== null}
        {@const ghost = ghostOf(sorter.state.from)}
        {#if ghost}
          <div class="drag-ghost" class:stack={ghost.more > 0} style:translate={`${sorter.state.x}px ${sorter.state.y}px`} aria-hidden="true" {@attach toBody}>
            {@html icons.grip}<span class="kind muted">{ghost.kind}</span><strong>{ghost.name}</strong>{#if ghost.more > 0}<span class="more">+{ghost.more}</span>{/if}
          </div>
        {/if}
      {/if}
      <div class="add frame">
        <span class="muted">{t('formEditor.add')}</span>
        <div class="kinds">
          <button type="button" onclick={addText}>{@html icons.text}{t('formEditor.textBlock')}</button>
          <button type="button" onclick={addStep}>{@html icons.listOrdered}{t('formEditor.stepBlock')}</button>
          {#each FIELD_KINDS as kind (kind.id)}
            <button type="button" onclick={() => addField(kind.id)}>{@html _KIND_ICONS[kind.id]}{t(kind.label)}</button>
          {/each}
        </div>
      </div>
    </div>
    <aside class="preview">
      <span class="muted label">{t('formEditor.preview')}</span>
      <iframe title={t('formEditor.preview')} sandbox="" srcdoc={preview}></iframe>
    </aside>
  </div>
{/snippet}

{#snippet afterTab()}
  {#if settings}
    <section class="form-section">
      <header><h2>{t('formEditor.afterTitle')}</h2><p>{t('formEditor.afterHint')}</p></header>
      <div class="fields">
        <label>{t('formEditor.title')}<input bind:value={settings.title} required maxlength="200" /></label>
        <label>{t('formEditor.submitLabel')}<input bind:value={settings.submitLabel} maxlength="100" /></label>
        <label>{t('formEditor.successText')}<textarea rows="3" bind:value={settings.successText} maxlength="1000"></textarea></label>
        <label>
          {t('formEditor.successPage')}
          <select bind:value={settings.successPage}>
            <option value={null}>{t('formEditor.noPage')}</option>
            {#each pages as item (item.id)}<option value={item.id}>{' '.repeat(item.depth)}{item.title}</option>{/each}
          </select>
          <small>{t('formEditor.successPageHint')}</small>
        </label>
        <label>
          {t('formEditor.goal')}
          <input class="code" bind:value={settings.goal} maxlength="100" spellcheck="false" />
          <small>{t('formEditor.goalHint')}</small>
        </label>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet notifyTab()}
  {#if settings}
    <section class="form-section">
      <header><h2>{t('formEditor.notifyTitle')}</h2><p>{t('formEditor.notifyHint')}</p></header>
      <div class="fields">
        <label>
          {t('formEditor.subject')}
          <input bind:value={settings.subject} maxlength="200" />
          <small>{t('formEditor.subjectHint')}</small>
        </label>
        <label class="option">
          <input type="checkbox" checked={settings.channels === null} onchange={(e) => settings && (settings.channels = e.currentTarget.checked ? null : [])} />
          <span><strong>{t('formEditor.channelsDefault')}</strong><small class="help">{t('formEditor.channelsDefaultHint')}</small></span>
        </label>
        {#if settings.channels !== null}
          <fieldset class="channels">
            <legend>{t('formEditor.channels')}</legend>
            <label><input type="checkbox" checked={settings.channels.includes('telegram')} onchange={(e) => toggleChannel('telegram', e.currentTarget.checked)} /> Telegram</label>
            <label><input type="checkbox" checked={settings.channels.includes('email')} onchange={(e) => toggleChannel('email', e.currentTarget.checked)} /> {t('notify.email')}</label>
          </fieldset>
        {/if}
        <p class="muted"><a href={`${resolve('/(app)/settings')}?tab=notify`}>{t('formEditor.channelsSettings')}</a></p>
      </div>
    </section>
    <section class="form-section">
      <header><h2>{t('formEditor.confirmTitle')}</h2><p>{t('formEditor.confirmHint')}</p></header>
      <div class="fields">
        <label class="option">
          <input type="checkbox" bind:checked={settings.confirmation.enabled} />
          <span><strong>{t('formEditor.confirmEnabled')}</strong></span>
        </label>
        {#if settings.confirmation.enabled}
          <label>
            {t('formEditor.confirmField')}
            <select bind:value={settings.confirmation.field}>
              <option value="">{t('formEditor.confirmFieldDefault')}</option>
              {#each addressFields as item (item.name)}<option value={item.name}>{item.label || item.name} ({item.name})</option>{/each}
            </select>
            {#if settings.confirmation.field === '' && !hasEmailField}<small class="warning">{t('formEditor.confirmNoField')}</small>{/if}
          </label>
          <label>
            {t('formEditor.confirmSubject')}
            <input bind:value={settings.confirmation.subject} maxlength="200" />
            <small>{t('formEditor.confirmSubjectHint')}</small>
          </label>
          <label>
            {t('formEditor.confirmText')}
            <textarea rows="6" bind:value={settings.confirmation.text} maxlength="5000" required></textarea>
            <small>{t('formEditor.confirmTextHint')}</small>
          </label>
        {/if}
      </div>
    </section>
  {/if}
{/snippet}

{#snippet integrationsTab()}
  {#if settings}
    <section class="form-section">
      <header><h2>{t('formEditor.webhookTitle')}</h2><p>{t('formEditor.webhookHint')}</p></header>
      <div class="fields">
        <label>
          {t('formEditor.webhookUrl')}
          <input class="code" type="url" bind:value={settings.webhook.url} maxlength="2000" spellcheck="false" placeholder="https://" />
          <small>{t('formEditor.webhookUrlHint')}</small>
        </label>
        <div class="secret">
          <span class="secret-label">{t('formEditor.webhookSecret')}</span>
          {#if settings.webhook.secret}
            <div class="secret-row">
              <code>{settings.webhook.secret}</code>
              <button type="button" class="button ghost" onclick={copySecret}>{@html icons.copy}{t('common.copy')}</button>
              <button type="button" class="button ghost" aria-pressed={settings.webhook.renew === true} onclick={() => settings && (settings.webhook = { ...settings.webhook, renew: !settings.webhook.renew })}>{t('formEditor.webhookRenew')}</button>
            </div>
            <small class="muted">{settings.webhook.renew ? t('formEditor.webhookRenewPending') : t('formEditor.webhookSecretHint')}</small>
          {:else}
            <small class="muted">{t('formEditor.webhookNoSecret')}</small>
          {/if}
        </div>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet protectTab()}
  {#if settings}
    <section class="form-section">
      <header><h2>{t('formEditor.protectTitle')}</h2><p>{t('formEditor.protectHint')}</p></header>
      <div class="fields">
        <label>
          {t('formEditor.minSeconds')}
          <input type="number" min="0" max="60" bind:value={settings.minSeconds} />
          <small>{t('formEditor.minSecondsHint')}</small>
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={settings.allowLinks} />
          <span><strong>{t('formEditor.allowLinks')}</strong><small class="help">{t('formEditor.allowLinksHint')}</small></span>
        </label>
      </div>
    </section>
    <section class="form-section">
      <header><h2>{t('formEditor.storeTitle')}</h2><p>{t('formEditor.storeHint')}</p></header>
      <div class="fields">
        <label>
          {t('formEditor.retention')}
          <input type="number" min="1" max="3650" bind:value={settings.retentionDays} />
        </label>
      </div>
    </section>
  {/if}
{/snippet}

<LoadState load={loading}>
  <Tabs
    label={settings?.title ?? name}
    bind:current={tab}
    tabs={[
      { id: 'fields', label: t('formEditor.tabFields'), content: fieldsTab },
      { id: 'after', label: t('formEditor.tabAfter'), content: afterTab },
      { id: 'notify', label: t('formEditor.tabNotify'), content: notifyTab },
      { id: 'protect', label: t('formEditor.tabProtect'), content: protectTab },
      { id: 'integrations', label: t('formEditor.tabIntegrations'), content: integrationsTab },
    ]}
  />
</LoadState>

<style>
  .step-card {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.75rem;
    border: 0.0625rem dashed var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .step-card .head {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .step-title {
    display: flex;
    flex: 1;
    gap: 0.6rem;
    align-items: center;
  }

  .step-title input {
    flex: 1;
    font-weight: 600;
  }

  .blocks {
    --grip-w: 1.5rem;
    min-width: 0;
  }

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
    gap: 1.5rem;
    align-items: start;
  }

  ol {
    --gap: 0.6rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--gap);
    margin: 0 0 0.75rem;
    padding: 0;
    list-style: none;
  }

  /* Слева от каждого блока — ручка; справа — сам блок. */
  li {
    --grip-h: 2rem;
    --grip-center: 1.25rem;
    position: relative;
    display: grid;
    grid-template-columns: var(--grip-w) minmax(0, 1fr);
    gap: 0.25rem;
    align-items: start;
  }

  .body {
    min-width: 0;
  }

  /* Ручка стоит по центру заголовка блока: у поля, шага и текста он разной высоты. */
  li[data-kind='field'] {
    --grip-center: 1.6625rem;
  }

  li[data-kind='step'] {
    --grip-center: 2.3rem;
  }

  .grip {
    display: grid;
    place-items: center;
    width: var(--grip-w);
    height: var(--grip-h);
    min-height: 0;
    margin-top: calc(var(--grip-center) - var(--grip-h) / 2);
    padding: 0;
    border: 0;
    border-radius: var(--radius-s);
    background: none;
    box-shadow: none;
    color: var(--muted);
    cursor: grab;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .grip:hover {
    background: var(--hover);
    color: var(--text);
  }

  .grip[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .grip :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* Палец — цель не меньше 2.75rem. */
  @media (pointer: coarse) {
    .blocks {
      --grip-w: 2rem;
    }

    li {
      --grip-h: 2.75rem;
    }
  }

  /* Что едет — бледнеет на своём месте; поднятое с клавиатуры — в рамке акцента. */
  li[data-sort='moving'] {
    opacity: 0.4;
  }

  li[data-sort='picked'] > .body {
    border-radius: var(--radius-l);
    outline: 0.125rem solid var(--accent);
    outline-offset: 0.1875rem;
  }

  /* Встал на место — коротко проступает кольцо акцента; без движения его нет. */
  @media (prefers-reduced-motion: no-preference) {
    li[data-sort='settled'] > .body {
      border-radius: var(--radius-l);
      animation: settle 700ms var(--ease);
    }
  }

  @keyframes settle {
    from {
      box-shadow: 0 0 0 0.1875rem
        color-mix(in oklch, var(--accent) 35%, transparent);
    }

    to {
      box-shadow: 0 0 0 0.1875rem transparent;
    }
  }

  /* Место, куда встанет блок, — линия акцента посреди промежутка, как в дереве страниц. */
  li[data-drop]::after {
    position: absolute;
    right: 0;
    left: calc(var(--grip-w) + 0.25rem);
    height: 0.125rem;
    border-radius: 0.0625rem;
    background: var(--accent);
    content: '';
    pointer-events: none;
  }

  li[data-drop='before']::after {
    top: calc(var(--gap) / -2 - 0.0625rem);
  }

  li[data-drop='after']::after {
    bottom: calc(var(--gap) / -2 - 0.0625rem);
  }

  /* «Призрак» под указателем: лежит в body, ручка — под пальцем. */
  .drag-ghost {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    max-width: 22rem;
    margin: -1.1rem 0 0 -1.0625rem;
    padding: 0.4rem 0.75rem 0.4rem 0.5rem;
    border: 0.0625rem solid color-mix(in oklch, var(--accent) 45%, var(--line));
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
    font-size: 0.875rem;
    white-space: nowrap;
    pointer-events: none;
  }

  /* Шаг едет со своими полями — под карточкой виден край второй. */
  .drag-ghost.stack {
    box-shadow:
      0.25rem 0.25rem 0 -0.0625rem var(--surface),
      0.25rem 0.25rem 0 0 color-mix(in oklch, var(--accent) 45%, var(--line)),
      var(--shadow);
  }

  .drag-ghost :global(svg) {
    flex: none;
    align-self: center;
    width: 1rem;
    height: 1rem;
    color: var(--accent);
  }

  .drag-ghost strong {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .drag-ghost .more {
    flex: none;
    padding: 0 0.4rem;
    border-radius: var(--radius-s);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .field-card {
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .field-card.open {
    border-color: color-mix(in oklch, var(--accent) 40%, var(--line));
  }

  .head {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.35rem 0.5rem 0.35rem 0.25rem;
  }

  .summary {
    display: flex;
    flex: 1;
    justify-content: flex-start;
    box-shadow: none;
    gap: 0.5rem;
    align-items: baseline;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .summary:hover {
    background: var(--hover);
  }

  .summary :global(svg) {
    flex: none;
    align-self: center;
    width: 1rem;
    height: 1rem;
    transition: rotate 0.15s;
  }

  .summary[aria-expanded='true'] :global(svg) {
    rotate: 90deg;
  }

  .kind {
    flex: none;
    font-size: 0.8125rem;
  }

  .summary strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .req {
    color: var(--danger);
  }

  .summary code {
    margin-left: auto;
    font-size: 0.8125rem;
  }

  .field-card.open .head {
    border-bottom: 0.0625rem solid var(--line);
  }

  .controls {
    display: flex;
    gap: 0.125rem;
  }

  .controls button {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .controls button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .controls button.danger:hover {
    color: var(--danger);
  }

  .controls :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* Палитра — под карточками, а не под ручками. */
  .add {
    display: grid;
    gap: 0.5rem;
    margin-left: calc(var(--grip-w) + 0.25rem);
    padding: 0.85rem 1rem;
  }

  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .kinds button {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    min-height: 2rem;
    padding: 0 0.7rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .kinds button:hover {
    border-color: color-mix(in oklch, var(--accent) 40%, var(--line));
    color: var(--accent);
  }

  .kinds :global(svg) {
    width: 0.95rem;
    height: 0.95rem;
  }

  .preview {
    position: sticky;
    top: 1rem;
    display: grid;
    gap: 0.4rem;
  }

  .label {
    font-size: 0.8125rem;
  }

  iframe {
    width: 100%;
    height: min(70vh, 40rem);
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: #fff;
  }

  .secret {
    display: grid;
    gap: 0.35rem;
  }

  .secret-label {
    font-weight: 600;
  }

  .secret-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .secret-row code {
    overflow-wrap: anywhere;
    padding: 0.3rem 0.5rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.8125rem;
  }

  .warning {
    color: var(--danger);
  }

  .channels {
    display: flex;
    gap: 1.25rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .channels legend {
    margin-bottom: 0.35rem;
    font-weight: 600;
  }

  @media (max-width: 75rem) {
    .composer {
      grid-template-columns: 1fr;
    }

    .preview {
      position: static;
    }
  }
</style>
