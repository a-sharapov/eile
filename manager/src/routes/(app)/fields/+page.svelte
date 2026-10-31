<script lang="ts">
import { tick } from 'svelte';
import { api, CREATE_ONLY, isApiError } from '#lib/api.ts';
import { ask, modalOpen } from '#lib/dialog.svelte.ts';
import { loadFields } from '#lib/fields.svelte.ts';
import { guardUnsaved } from '#lib/guard.svelte.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type { Field, FieldType } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import { freshForm, invalidField } from '#lib/validity.ts';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

const _TYPES: Readonly<Record<FieldType, MessageKey>> = {
  text: 'fields.typeText',
  richtext: 'fields.typeRichtext',
  number: 'fields.typeNumber',
  boolean: 'fields.typeBoolean',
  date: 'fields.typeDate',
  select: 'fields.typeSelect',
  image: 'fields.typeImage',
};

type Form = {
  name: string;
  label: string;
  type: FieldType;
  options: string;
  defaultValue: string;
  inherit: boolean;
  templates: string[];
};

const _blank = (): Form => ({
  name: '',
  label: '',
  type: 'text',
  options: '',
  defaultValue: '',
  inherit: false,
  templates: [],
});

const _formOf = (field: Field): Form => ({
  ...field,
  options: field.options.join(', '),
  defaultValue: field.defaultValue === null ? '' : String(field.defaultValue),
  templates: [...field.templates],
});

let fields = $state<Field[]>([]);
let templates = $state<string[]>([]);
let form = $state(_blank());
// Имя поля, которое правим; null — новое поле. Имя существующего поля не меняется.
let editing = $state<string | null>(null);
let saved = $state(JSON.stringify(_blank()));

// Общий список — тот же, что в дереве элементов: после сохранения обновится и он.
const load = () => loadFields().then((_) => (fields = _));

const loading = defineLoad(() =>
  Promise.all([
    load(),
    api.get<string[]>('/templates').then((_) => (templates = _)),
  ])
);

$effect(() => void loading.retry());

const dirty = $derived(JSON.stringify(form) !== saved);

guardUnsaved(() => dirty);

const reset = (next: Form, name: string | null) => (
  (form = next), (editing = name), (saved = JSON.stringify(next))
);

// Пустая строка — нет умолчания; для number и boolean приводим к типу поля.
const _DEFAULT = {
  number: (raw: string) => Number(raw),
  boolean: (raw: string) => raw === 'true',
  _: (raw: string) => raw,
} as const;

const defaultValue = () =>
  form.defaultValue === ''
    ? null
    : (_DEFAULT[form.type as keyof typeof _DEFAULT] ?? _DEFAULT._)(
        form.defaultValue
      );

const options = $derived(
  form.options
    .split(',')
    .map((_) => _.trim())
    .filter(Boolean)
);

// Вариант переименовали или убрали — значение по умолчанию из него сбрасывается: иначе список
// показывал бы пустоту, а сервер отвечал бы «значение не подходит к типу поля».
$effect(
  () =>
    void (
      form.type === 'select' &&
      form.defaultValue !== '' &&
      !options.includes(form.defaultValue) &&
      (form.defaultValue = '')
    )
);

const edit = (field: Field) => reset(_formOf(field), field.name);

// Какое поле открыто, решает адрес (?name=…): строка таблицы, дерево элементов и обновление страницы
// приводят к одному и тому же, а несохранённые правки защищает общий вопрос перед уходом.

// Поле из дерева элементов: `?name=price` открывает его, пустое имя — новое поле.
$effect(() => {
  const wanted = page.url.searchParams.get('name');
  const field = fields.find((_) => _.name === wanted);
  void (
    wanted !== null &&
    (field
      ? editing !== field.name && edit(field)
      : wanted === '' &&
        editing !== null &&
        (reset(_blank(), null), void focusName()))
  );
});

// Ошибка сервера, относящаяся к полю формы: показываем у него, а не уведомлением.
const _FIELD_ERRORS: Readonly<Record<string, string>> = {
  'content.invalid_field_name': 'field-name',
  'content.field_exists': 'field-name',
  'content.invalid_field_options': 'field-options',
  'content.invalid_field_value': 'field-default',
};

let problem = $state<{ field: string; text: string } | null>(null);
let formElement = $state<HTMLFormElement>();

const showProblem = (error: unknown): void =>
  ((field) =>
    field
      ? ((problem = { field, text: describe(error) }),
        void tick().then(() =>
          document.querySelector<HTMLElement>(`#${field}`)?.focus()
        ))
      : failed(error))(
    isApiError(error) ? _FIELD_ERRORS[error.code] : undefined
  );

const invalid = (field: string): 'true' | undefined =>
  problem?.field === field ? 'true' : undefined;

// Новое поле с занятым именем затёрло бы описание существующего: предлагаем открыть его.
const taken = $derived(
  editing === null && fields.some((_) => _.name === form.name.trim())
);

// Проверка формы — своя: ошибка у поля текстом подсказки, а не «пузырём» браузера.
const _INVALID: Readonly<Record<string, string>> = {
  'field-name': t('fields.nameHint'),
  'field-options': t('fields.optionsHint'),
};

const valid = (): boolean =>
  ((bad) =>
    bad === null ||
    ((problem = bad),
    void tick().then(() =>
      document.querySelector<HTMLElement>(`#${bad.field}`)?.focus()
    ),
    false))(formElement ? invalidField(formElement, _INVALID) : null);

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  dirty &&
    !taken &&
    valid() &&
    api
      .send(
        'PUT',
        `/fields/${editing ?? form.name}`,
        {
          label: form.label,
          type: form.type,
          options,
          defaultValue: defaultValue(),
          inherit: form.inherit,
          templates: form.templates,
        },
        editing === null ? CREATE_ONLY : {}
      )
      .then(load)
      .then(() =>
        formElement
          ? freshForm(formElement, () => void reset(_blank(), null))
          : void reset(_blank(), null)
      )
      .then(() => notify(t('fields.saved')))
      .then(undefined, showProblem)
);

const focusName = () =>
  tick().then(() =>
    document.querySelector<HTMLElement>('#field-name')?.focus()
  );

const startNew = () =>
  (formElement
    ? freshForm(formElement, () => void reset(_blank(), null))
    : Promise.resolve(void reset(_blank(), null))
  )
    .then(() => goto(`${resolve('/(app)/fields')}?name=`, { replace: true }))
    .then(focusName);

const onKey = (event: KeyboardEvent) =>
  void (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 's' &&
    // Под открытым диалогом страница не сохраняется, но и браузер не открывает своё «Сохранить как».
    (event.preventDefault(), modalOpen() || formElement?.requestSubmit())
  );

// Удаление стирает значения поля на всех страницах: в вопросе — сколько их.
const remove = (name: string) =>
  api
    .get<{ pages: number }>(`/fields/${name}/usage`)
    .then((usage) =>
      ask({
        title: t('fields.removeTitle'),
        body:
          usage.pages > 0
            ? t('fields.removeBodyValues', { n: usage.pages })
            : t('fields.removeBodyEmpty'),
        items: [name],
        confirm: t('fields.remove'),
        tone: 'danger',
      })
    )
    .then(
      (confirmed): unknown =>
        confirmed &&
        api
          .send('DELETE', `/fields/${name}`)
          .then(load)
          .then(
            () => (
              notify(t('fields.removed')),
              reset(_blank(), null),
              goto(`${resolve('/(app)/fields')}?name=`, { replace: true })
            )
          )
    )
    .then(undefined, failed);
</script>

<svelte:head><title>{t('fields.title')} — {t('app.name')}</title></svelte:head>
<svelte:window onkeydown={onKey} />

{#snippet actions()}
  {#if editing}
    <button type="button" class="icon danger" aria-label={`${t('fields.remove')}: ${editing}`} title={t('fields.remove')} onclick={() => remove(editing!)}>{@html icons.trash}</button>
  {/if}
  <!-- Неактивная кнопка не отправляет форму: иначе браузер счёл бы поля «тронутыми» и окрасил их. -->
  <button type="submit" form="field-form" class="primary" aria-disabled={!dirty || taken} onclick={(e) => void ((!dirty || taken) && e.preventDefault())} aria-keyshortcuts="Control+S" title={dirty ? `${t('common.unsaved')} · ${t('common.ctrl')}+S` : `${t('common.ctrl')}+S`}>
    {#if dirty}<span class="dirty" aria-hidden="true"></span>{/if}{t('fields.save')}{#if dirty}<span class="sr-only">: {t('common.unsaved')}</span>{/if}
  </button>
{/snippet}

<PageHeader title={t('fields.title')} crumbs={[{ label: t('nav.elements'), href: resolve('/(app)/elements') }]} {actions} sticky />
<div class="page">
<LoadState load={loading}>
  <form class="panel editor" novalidate onsubmit={save} oninput={() => (problem = null)} id="field-form" bind:this={formElement}>
    <div class="editor-head">
      <h2>{editing ? `${t('fields.editing')} ${editing}` : t('fields.new')}</h2>
      {#if editing}
        <button type="button" onclick={startNew}>{@html icons.plus}{t('fields.new')}</button>
      {/if}
    </div>
    <section class="form-section">
      <header>
        <h2>{t('fields.sectionWhat')}</h2>
        <p>{t('fields.sectionWhatHint')}</p>
      </header>
      <div class="fields">
        <div class="fields-2">
          <label>
            <span>{t('fields.name')}<span class="required" aria-hidden="true"> *</span></span>
            <input
              id="field-name"
              class="code"
              required
              pattern="[a-z][A-Za-z0-9]*"
              title={t('fields.nameHint')}
              readonly={editing !== null}
              aria-invalid={taken || invalid('field-name') ? 'true' : undefined}
              aria-describedby="name-help"
              bind:value={form.name}
            />
            {#if taken}
              <small id="name-help" class="field-error">{t('fields.taken')} <a href={`${resolve('/(app)/fields')}?name=${form.name.trim()}`}>{t('elements.openExisting')}</a></small>
            {:else if invalid('field-name')}
              <small id="name-help" class="field-error">{problem?.text}</small>
            {:else}
              <small id="name-help">{editing ? t('fields.nameLocked') : t('fields.nameHint')}</small>
            {/if}
          </label>
          <label>{t('fields.label')}<input bind:value={form.label} /><small>{t('fields.labelHint')}</small></label>
        </div>
        <div class="fields-2">
          <label>
            {t('fields.type')}
            <select bind:value={form.type}>{#each Object.entries(_TYPES) as entry (entry[0])}<option value={entry[0]}>{t(entry[1])}</option>{/each}</select>
          </label>
          {#if form.type === 'select'}
            <label>
              <span>{t('fields.options')}<span class="required" aria-hidden="true"> *</span></span>
              <input id="field-options" required bind:value={form.options} aria-invalid={invalid('field-options')} aria-describedby="options-help" />
              {#if invalid('field-options')}<small id="options-help" class="field-error">{problem?.text}</small>{:else}<small id="options-help">{t('fields.optionsHint')}</small>{/if}
            </label>
          {/if}
        </div>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('fields.sectionValue')}</h2>
        <p>{t('fields.sectionValueHint')}</p>
      </header>
      <div class="fields">
        <label class="narrow">
          {t('fields.default')}
          {#if form.type === 'boolean'}
            <select id="field-default" bind:value={form.defaultValue} aria-invalid={invalid('field-default')}>
              <option value="">—</option>
              <option value="true">{t('common.yes')}</option>
              <option value="false">{t('common.no')}</option>
            </select>
          {:else if form.type === 'select'}
            <select id="field-default" bind:value={form.defaultValue} aria-invalid={invalid('field-default')}>
              <option value="">—</option>
              {#each options as option (option)}<option value={option}>{option}</option>{/each}
            </select>
          {:else}
            <input id="field-default" type={form.type === 'number' ? 'number' : form.type === 'date' ? 'date' : 'text'} step="any" bind:value={form.defaultValue} aria-invalid={invalid('field-default')} />
          {/if}
          {#if invalid('field-default')}<small class="field-error">{problem?.text}</small>{/if}
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={form.inherit} />
          <span><strong>{t('fields.inherit')}</strong><small class="help">{t('fields.inheritHint')}</small></span>
        </label>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2 id="templates-label">{t('fields.templates')}</h2>
        <p>{t('fields.templatesHint')}</p>
      </header>
      <div class="fields templates" role="group" aria-labelledby="templates-label">
        {#each templates as name (name)}
          <label class="check"><input type="checkbox" value={name} bind:group={form.templates} /><code>{name}</code></label>
        {/each}
        {#if form.templates.length === 0}<small class="no-templates">{t('fields.noTemplates')}</small>{/if}
      </div>
    </section>
  </form>
</LoadState>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
    max-width: 72rem;
  }

  .dirty {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--mark);
  }

  .editor-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }


  .no-templates {
    flex-basis: 100%;
    color: var(--warn);
  }

  .templates {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-content: start;
  }


  .editor {
    gap: 0;
  }

  .editor-head h2 {
    font-size: 1.125rem;
  }

  .narrow {
    max-width: 18rem;
  }
</style>
