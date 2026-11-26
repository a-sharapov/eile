<script lang="ts">
import { untrack } from 'svelte';
import { ITEM_LIMITS, isSitePage, length } from '#lib/analytics.ts';
import { buildLabel } from '#lib/analytics-reports.ts';
import { api, isApiError } from '#lib/api.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import type { LabelCheck, LabelIssued, Parts, SetupView } from '#lib/types.ts';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { partName, partOf, partValueName, senderName } from '../names.ts';
import ItemForm from '../setup/ItemForm.svelte';
import type { EditRequest } from '../setup/setup.ts';
import CheckResult from './CheckResult.svelte';

// Генератор меток: части по порядку схемы отправителя — значения из справочников (без архива), «Новое значение»
// заводит значение тут же; переход по желанию — его заданные части закрыты. Метка проверяется по ходу ввода,
// «Сохранить в реестр» выдаёт её и обе ссылки. Из «Незнакомых меток» генератор открывается с разобранной меткой.
let {
  setup,
  editable,
  onreload,
}: {
  setup: SetupView;
  editable: boolean;
  /** Перечитать настройку: новое значение части появляется в выборе. */
  onreload: () => Promise<void>;
} = $props();

const id = $props.id();
const _NEW = '~new';

const activeSender = (code: string) =>
  setup.senders.some((_) => _.code === code && _.archivedAt === null);

// Выдать метку можно по схеме не в архиве у отправителя не в архиве — как у сервера.
const schemas = $derived(
  setup.schemas.filter((_) => _.archivedAt === null && activeSender(_.sender))
);

let sender = $state(untrack(() => page.url.searchParams.get('sender') ?? ''));
const schema = $derived(
  schemas.find((_) => _.sender === sender) ??
    (schemas.length === 1 ? schemas[0] : undefined)
);

let link = $state('');
const links = $derived(
  setup.links.filter(
    (_) => _.sender === schema?.sender && _.archivedAt === null
  )
);
const chosenLink = $derived(links.find((_) => _.code === link) ?? null);

let values = $state<Record<string, string>>({});
// Значения из разобранной метки, которых нет в справочнике: их можно завести.
let pending = $state<Record<string, string>>({});
let name = $state('');
let sitePage = $state('/');
let busy = $state(false);
let issued = $state<LabelIssued | null>(null);
let formError = $state<string | null>(null);
let creating = $state<EditRequest | null>(null);
let creatingPart = '';

// Заданные части перехода закрыты: их значения — в метке, менять их нельзя.
const locked = $derived(
  Object.fromEntries(
    Object.entries(chosenLink?.parts ?? {}).filter(
      ({ 0: part }) => schema?.parts.includes(part) ?? false
    )
  ) as Parts
);

const chosen = $derived(
  Object.fromEntries(
    (schema?.parts ?? []).flatMap((part) =>
      Object.hasOwn(locked, part)
        ? [[part, locked[part]!]]
        : values[part]
          ? [[part, values[part]!]]
          : []
    )
  ) as Parts
);

const label = $derived(schema ? buildLabel(schema, chosen) : '');

const fieldErrors = defineFieldErrors(
  (field) =>
    (
      ({
        sender: () => sender,
        parts: () => [chosen, link],
        name: () => name,
        page: () => sitePage,
      }) as Readonly<Record<string, () => unknown>>
    )[field]?.() ?? null
);
const errors = $derived(fieldErrors.current);

const optionsOf = (part: string) =>
  (partOf(setup, part)?.values ?? []).filter(
    (_) => _.archivedAt === null || _.code === values[part]
  );

// Метка проверяется по ходу ввода: через 300 мс после правки — есть ли она в реестре и что скажет разбор.
let checked = $state<LabelCheck | null>(null);
// Сохранили — проверка заново: метка теперь в реестре.
let round = $state(0);
let timer = 0;
$effect(() => {
  const wanted = label;
  const owner = schema?.sender ?? '';
  void round;
  clearTimeout(timer);
  void (wanted === ''
    ? (checked = null)
    : (timer = window.setTimeout(
        () =>
          void api
            .get<LabelCheck>(
              `/analytics/labels/check?${new URLSearchParams({ sender: owner, text: wanted })}`
            )
            .then(
              (_) => void (wanted === label && (checked = _)),
              () => void (checked = null)
            ),
        300
      )));
  return () => clearTimeout(timer);
});

// Открыли с меткой (из «Незнакомых меток»): части разбираются по схеме; знакомые значения встают в поля,
// незнакомые — предложением завести значение.
const prefill = $derived(page.url.searchParams.get('label') ?? '');
$effect(() => {
  const text = prefill;
  const owner = untrack(() => schema?.sender ?? '');
  void (
    text !== '' &&
    api
      .get<LabelCheck>(
        `/analytics/labels/check?${new URLSearchParams({ sender: owner, text })}`
      )
      .then(
        (_) =>
          void untrack(
            () => (
              (values = Object.fromEntries(
                _.parts.flatMap((part) =>
                  part.state === 'known' && part.value !== null
                    ? [[part.part, part.value]]
                    : []
                )
              )),
              (pending = Object.fromEntries(
                _.parts.flatMap((part) =>
                  part.state === 'unknown' && part.value !== null
                    ? [[part.part, part.value]]
                    : []
                )
              )),
              _.sender !== null && (sender = _.sender),
              (issued = null)
            )
          ),
        failed
      )
  );
});

const startCreate = (part: string, code = '') => (
  (creatingPart = part),
  (creating = {
    group: 'value',
    item: null,
    preset: { dictionary: part, code, name: code },
  })
);

const pick = (part: string, value: string, select: HTMLSelectElement) =>
  value === _NEW
    ? ((select.value = values[part] ?? ''), startCreate(part, pending[part]))
    : ((values = { ...values, [part]: value }), (issued = null));

// Значение заведено — настройка перечитывается, и оно сразу выбрано в своей части.
const created = (_key: unknown, code: string) =>
  ((part) => (
    (creating = null),
    onreload().then(
      () =>
        void ((values = { ...values, [part]: code }),
        (pending = Object.fromEntries(
          Object.entries(pending).filter(({ 0: key }) => key !== part)
        )))
    )
  ))(creatingPart);

const check = (): Record<string, string> =>
  Object.fromEntries(
    [
      ['sender', schema === undefined && t('labels.senderRequired')],
      ['parts', Object.keys(chosen).length === 0 && t('labels.partsRequired')],
      [
        'name',
        (length(name) < 1 || length(name) > ITEM_LIMITS.name) &&
          t('setupForm.nameHint', { n: ITEM_LIMITS.name }),
      ],
      [
        'page',
        sitePage.trim() !== '' &&
          !isSitePage(sitePage.trim()) &&
          t('labels.pageHint'),
      ],
    ].flatMap(({ 0: field, 1: problem }) =>
      typeof problem === 'string' ? [[field as string, problem]] : []
    )
  );

// Отказ сервера — у поля, о котором он; иначе — под формой.
const _SERVER_FIELDS: readonly (readonly [RegExp, string])[] = [
  [/\bname\b/, 'name'],
  [/\bpage\b/, 'page'],
  [/\bpart|value|link|schema/, 'parts'],
];

const save = (event: SubmitEvent) => {
  event.preventDefault();
  const found = check();
  void (Object.keys(found).length > 0
    ? fieldErrors.show(found)
    : busy ||
      ((busy = true),
      (formError = null),
      api
        .send<LabelIssued>('POST', '/analytics/labels', {
          sender: schema?.sender,
          parts: Object.fromEntries(
            Object.entries(chosen).filter(
              ({ 0: part }) => !Object.hasOwn(locked, part)
            )
          ),
          name: name.trim(),
          link: link || null,
          page: sitePage.trim() || '/',
        })
        .then(
          (_) => (
            (issued = _),
            (round += 1),
            notify(t(_.existing ? 'labels.existingSaved' : 'labels.saved'))
          ),
          (error) =>
            ((field) =>
              field === null
                ? void (formError = describe(error))
                : fieldErrors.show({ [field]: describe(error) }))(
              isApiError(error) && error.code === 'analytics.invalid_label'
                ? (_SERVER_FIELDS.find((_) => _[0].test(error.message))?.[1] ??
                    null)
                : isApiError(error) &&
                    error.code === 'analytics.sender_required'
                  ? 'sender'
                  : null
            )
        )
        .finally(() => (busy = false))));
};

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('common.copied')), failed);

const described = (field: string, hint = true) =>
  [
    errors[field] ? `${id}-${field}-error` : '',
    hint ? `${id}-${field}-hint` : '',
  ]
    .filter(Boolean)
    .join(' ') || undefined;

const linkMissing = $derived(
  links.length === 0
    ? 'labels.directNoLinks'
    : links.length > 1 && link === ''
      ? 'labels.directPickLink'
      : 'labels.directNone'
);
</script>

{#snippet fieldError(field: string)}
  {#if errors[field]}<small id={`${id}-${field}-error`} class="field-error">{errors[field]}</small>{/if}
{/snippet}

{#if schemas.length === 0}
  <div class="frame empty">
    <p>{t('labels.noSchemas')}</p>
    {#if editable}<a class="button" href={`${resolve('/(app)/stats/setup')}?tab=schemas`}>{t('setupList.toSchemas')}</a>{/if}
  </div>
{:else}
  <div class="generator">
    <p class="intro">{t('labels.generatorIntro')}</p>
    <form class="form" novalidate onsubmit={save} oninput={() => (formError = null)}>
      <div class="row">
        {#if schemas.length > 1}
          <label>
            <span>{t('people.sender')}</span>
            <select bind:value={sender} onchange={() => ((values = {}), (pending = {}), (link = ''), (issued = null))} aria-invalid={errors.sender ? 'true' : undefined} aria-describedby={described('sender', false)}>
              <option value="" disabled>{t('setupForm.pick')}</option>
              {#each schemas as item (item.sender)}<option value={item.sender}>{senderName(setup, item.sender)}</option>{/each}
            </select>
            {@render fieldError('sender')}
          </label>
        {/if}
        {#if schema}
          <label>
            <span>{t('labels.link')} <small>{t('setupForm.optional')}</small></span>
            <select bind:value={link} onchange={() => (issued = null)} aria-describedby={`${id}-link-hint`}>
              <option value="">{t('labels.noLink')}</option>
              {#each links as item (item.code)}<option value={item.code}>{item.name}</option>{/each}
            </select>
            <small id={`${id}-link-hint`}>{t('labels.linkHint')}</small>
          </label>
        {/if}
      </div>

      {#if schema}
        <fieldset aria-describedby={described('parts')}>
          <legend>{t('labels.parts')}</legend>
          <div class="parts">
            {#each schema.parts as part (part)}
              <label>
                <span>{partName(setup, part)}</span>
                {#if Object.hasOwn(locked, part)}
                  <input readonly value={partValueName(setup, part, locked[part]!)} aria-describedby={`${id}-${part}-locked`} />
                  <small id={`${id}-${part}-locked`}>{t('labels.lockedByLink', { name: quoted(chosenLink?.name ?? link) })}</small>
                {:else}
                  <select value={values[part] ?? ''} onchange={(e) => pick(part, e.currentTarget.value, e.currentTarget)}>
                    <option value="">{t('labels.noValue')}</option>
                    {#each optionsOf(part) as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
                    {#if editable}<option value={_NEW}>{t('labels.newValue')}</option>{/if}
                  </select>
                  {#if pending[part]}
                    <small class="pending">
                      {t('labels.pendingValue', { value: pending[part]! })}
                      {#if editable}<button type="button" class="link" onclick={() => startCreate(part, pending[part])}>{t('labels.createPending', { value: pending[part]! })}</button>{/if}
                    </small>
                  {/if}
                {/if}
              </label>
            {/each}
          </div>
          {@render fieldError('parts')}
          <small id={`${id}-parts-hint`} class="help">{t('labels.partsHint')}</small>
        </fieldset>

        <div class="preview" aria-live="polite">
          <div class="label-line">
            <span class="caption">{t('labels.label')}</span>
            <code class="label" class:empty={label === ''}>{label || t('labels.labelEmpty')}</code>
            <span class="counter" class:full={label.length > schema.length}>{t('labels.length', { n: label.length, max: schema.length })}</span>
          </div>
          {#if checked && label !== ''}
            {#if checked.registered && issued?.label !== label}
              <p class="known">{@html icons.alert}<span>{t('labels.alreadyRegistered', { name: quoted(checked.registered.name) })}</span></p>
            {/if}
            {#if checked.notes.length > 0}<CheckResult {setup} result={checked} compact />{/if}
          {/if}
        </div>

        <div class="row">
          <label class="grow">
            <span>{t('labels.name')}</span>
            <input bind:value={name} maxlength={ITEM_LIMITS.name} required placeholder={t('labels.namePlaceholder')} aria-invalid={errors.name ? 'true' : undefined} aria-describedby={described('name')} />
            {@render fieldError('name')}
            <small id={`${id}-name-hint`}>{t('labels.nameHint')}</small>
          </label>
          <label class="grow">
            <span>{t('labels.page')}</span>
            <input class="code" bind:value={sitePage} maxlength={ITEM_LIMITS.page} spellcheck="false" autocomplete="off" aria-invalid={errors.page ? 'true' : undefined} aria-describedby={described('page')} />
            {@render fieldError('page')}
            <small id={`${id}-page-hint`}>{t('labels.pageHelp')}</small>
          </label>
        </div>

        {#if formError}<p class="field-error" role="alert">{formError}</p>{/if}
        {#if editable}
          <div class="actions">
            <button type="submit" class="primary" aria-disabled={busy}>{@html icons.saved}{t('labels.save')}</button>
          </div>
        {:else}
          <p class="help">{t('labels.readOnly')}</p>
        {/if}
      {/if}
    </form>

    {#if issued}
      <section class="issued" aria-labelledby={`${id}-issued`}>
        <h3 id={`${id}-issued`}>{t(issued.existing ? 'labels.existingTitle' : 'labels.issuedTitle')}</h3>
        {#if issued.existing}<p class="help">{t('labels.existingText', { name: quoted(issued.name) })}</p>{/if}
        <p class="issued-label"><code>{issued.label}</code></p>
        <dl>
          <div>
            <dt>{t('labels.directLink')}</dt>
            <dd>
              {#if issued.links.direct}
                <code class="url">{issued.links.direct}</code>
                <button type="button" onclick={() => copy(issued!.links.direct!)}>{@html icons.copy}{t('common.copy')}<span class="sr-only">: {t('labels.directLink')}</span></button>
              {:else}
                <span class="muted">{t(linkMissing)}</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt>{t('labels.siteLink')}</dt>
            <dd>
              {#if issued.links.site}
                <code class="url">{issued.links.site}</code>
                <button type="button" onclick={() => copy(issued!.links.site!)}>{@html icons.copy}{t('common.copy')}<span class="sr-only">: {t('labels.siteLink')}</span></button>
              {:else}
                <span class="muted">{t('labels.siteNone')}</span>
              {/if}
            </dd>
          </div>
        </dl>
        <p class="help">{t('labels.linksHint')}</p>
      </section>
    {/if}
  </div>
{/if}

<ItemForm request={creating} {setup} onclose={() => (creating = null)} onsaved={created} />

<style>
  .generator {
    display: grid;
    gap: 1.25rem;
    max-width: 60rem;
    min-width: 0;
  }

  .intro {
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  .form {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
    gap: 1rem;
  }

  .parts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
    gap: 0.85rem 1rem;
  }

  label > span small {
    color: var(--muted);
    font-weight: 400;
  }

  [readonly] {
    color: var(--muted);
  }

  .pending {
    color: var(--warn-text);
  }

  .pending button {
    display: inline;
    margin-left: 0.25rem;
    font-size: inherit;
  }

  .preview {
    display: grid;
    gap: 0.5rem;
    padding: 0.85rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--sunken);
  }

  .label-line {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.75rem;
    align-items: baseline;
  }

  .caption {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .label {
    flex: 1 1 14rem;
    min-width: 0;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  .label.empty {
    color: var(--muted);
    font-family: inherit;
    font-size: 0.875rem;
  }

  .counter {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .counter.full {
    color: var(--danger);
  }

  .known {
    display: flex;
    gap: 0.4rem;
    align-items: flex-start;
    margin: 0;
    font-size: 0.875rem;
  }

  .known :global(svg) {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin-top: 0.15rem;
    color: var(--warn-text);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .issued {
    display: grid;
    gap: 0.6rem;
    padding: 1rem 1.1rem;
    border: 0.0625rem solid color-mix(in oklch, var(--ok) 35%, var(--line));
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .issued h3 {
    font-size: 1rem;
  }

  .issued p {
    margin: 0;
  }

  .issued-label code {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  dl {
    display: grid;
    gap: 0.6rem;
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    align-items: center;
    min-width: 0;
    margin: 0;
  }

  .url {
    flex: 1 1 16rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  dd button {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.8125rem;
  }

  .empty {
    display: grid;
    gap: 0.75rem;
    justify-items: start;
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }

  @media (max-width: 34rem) {
    dl div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
    }
  }
</style>
