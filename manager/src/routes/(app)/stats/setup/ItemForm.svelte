<script lang="ts">
import { tick } from 'svelte';
import {
  CODE_LIMITS,
  CODE_PATTERN,
  DIMENSION_KINDS,
  ITEM_LIMITS,
  KIND_LABELS,
  KINDS,
  LABEL_LIMITS,
  PURPOSE_LABELS,
  RECONCILE_LABELS,
  ROLE_LABELS,
  ROLES,
  reconcileFor,
  UTM_PARAMETERS,
} from '#lib/analytics.ts';
import { api, isApiError } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { defineFieldErrors } from '#lib/field-errors.svelte.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import { describe, notify } from '#lib/notices.svelte.ts';
import type {
  DictionaryPurpose,
  IssuedSenderKey,
  PropertyKind,
  PropertyScope,
  SetupGroup,
  SetupView,
} from '#lib/types.ts';
import Modal from '../Modal.svelte';
import { partOf } from '../names.ts';
import {
  bodyOf,
  check,
  type Draft,
  describedBy,
  draftOf,
  effectOf,
  fieldOf,
  OWNER_FIELDS,
  partLimitOf,
} from './drafts.ts';
import FunnelFields from './FunnelFields.svelte';
import LinkFields from './LinkFields.svelte';
import MilestoneFields from './MilestoneFields.svelte';
import ReferrerFields from './ReferrerFields.svelte';
import SchemaFields from './SchemaFields.svelte';
import { type EditRequest, purposeUsersOf } from './setup.ts';

// Форма элемента настройки — одна на все группы: общие поля здесь, поля групп этапа 2 — своими компонентами;
// проверка до отправки, тело запроса и поле отказа сервера — в drafts.ts. Код не меняется: у прежнего элемента
// он только показан.
let {
  request,
  setup,
  onclose,
  onsaved,
}: {
  request: EditRequest | null;
  setup: SetupView;
  onclose: () => void;
  /** Сохранено; у нового отправителя — его ключ, показанный один раз; `code` — код сохранённого элемента. */
  onsaved: (key: IssuedSenderKey | null, code: string) => void;
} = $props();

let draft = $state<Draft>(draftOf('type', {}));
// Поле, ошибка которого зависит от соседних: условие вехи — от свойства и значения, окно — от «без срока».
const _FIELD_KEYS: Readonly<Record<string, readonly (keyof Draft)[]>> = {
  condition: ['condition', 'property', 'value'],
  days: ['days', 'forever'],
  host: ['host', 'rule'],
  summaryAt: ['summaryAt', 'noSummary'],
  reconcile: ['reconcile', 'kind'],
};
// Ошибка поля исчезает, как только его значение изменили, а не висит до следующей отправки.
const fieldErrors = defineFieldErrors((field) =>
  (_FIELD_KEYS[field] ?? [field as keyof Draft]).map((_) => draft[_])
);
const errors = $derived(fieldErrors.current);
let formError = $state<string | null>(null);
let busy = $state(false);
let element = $state<HTMLFormElement>();

const group = $derived<SetupGroup>(request?.group ?? 'type');
const existing = $derived(request?.item ?? null);
const context = $derived({ setup, existing });
const id = $props.id();

$effect(() => {
  const next = request;
  void (
    next &&
    (fieldErrors.clear(),
    (formError = null),
    (draft = draftOf(next.group, {
      ...(next.preset ?? {}),
      ...(next.item ?? {}),
    })))
  );
});

const _TITLES: Readonly<Record<SetupGroup, readonly [MessageKey, MessageKey]>> =
  {
    sender: ['setupForm.newSender', 'setupForm.editSender'],
    type: ['setupForm.newType', 'setupForm.editType'],
    property: ['setupForm.newProperty', 'setupForm.editProperty'],
    dictionary: ['setupForm.newDictionary', 'setupForm.editDictionary'],
    value: ['setupForm.newValue', 'setupForm.editValue'],
    schema: ['setupForm.newSchema', 'setupForm.editSchema'],
    referrer: ['setupForm.newReferrer', 'setupForm.editReferrer'],
    link: ['setupForm.newLink', 'setupForm.editLink'],
    milestone: ['setupForm.newMilestone', 'setupForm.editMilestone'],
    funnel: ['setupForm.newFunnel', 'setupForm.editFunnel'],
  };

const _CREATE: Readonly<Record<SetupGroup, MessageKey>> = {
  sender: 'setupForm.createSender',
  type: 'setupForm.createType',
  property: 'setupForm.createProperty',
  dictionary: 'setupForm.createDictionary',
  value: 'setupForm.createValue',
  schema: 'setupForm.createSchema',
  referrer: 'setupForm.createReferrer',
  link: 'setupForm.createLink',
  milestone: 'setupForm.createMilestone',
  funnel: 'setupForm.createFunnel',
};

// Широкое окно — где строка поля длинная: части схемы, адрес перехода, тип и условие вехи, шаги воронки.
const _WIDE: ReadonlySet<SetupGroup> = new Set([
  'schema',
  'link',
  'milestone',
  'funnel',
]);

const title = $derived(
  t(_TITLES[group][existing ? 1 : 0], {
    name: existing ? quoted(String(existing.name)) : '',
  })
);

const activeSenders = $derived(
  setup.senders.filter((_) => _.archivedAt === null)
);
// Схема — у отправителя без схемы: ключ схемы — код отправителя.
const schemaSenders = $derived(
  activeSenders.filter((s) => !setup.schemas.some((_) => _.sender === s.code))
);
const valueDictionaries = $derived(
  setup.dictionaries.filter(
    (_) =>
      _.purpose === 'values' &&
      (_.archivedAt === null || _.code === existing?.dictionary)
  )
);
const eventProperties = $derived(
  setup.properties.filter(
    (_) =>
      _.scope === 'event' &&
      (_.archivedAt === null ||
        (existing?.properties as Draft['properties'] | undefined)?.some(
          (p) => p.code === _.code
        ))
  )
);
const role = $derived(
  draft.role === '' ? null : setup.roles.find((_) => _.role === draft.role)
);
// Значение части — строже кода: свой предел и вид, подсказка их называет.
const partLimit = $derived(
  group === 'value' ? partLimitOf(setup, draft.owner) : null
);
// Назначение справочника не меняется, пока его держат свойство, схема, соответствие или переход.
const purposeUsers = $derived(
  group === 'dictionary' && existing ? purposeUsersOf(setup, existing.code) : []
);
const effectKey = $derived(request ? effectOf(group, draft, context) : null);
// Смену роли прежнего типа форма ещё и подтверждает: меняется смысл всех его событий.
const confirmRecount = $derived(
  group === 'type' &&
    existing !== null &&
    draft.role !== '' &&
    existing.role !== draft.role
);

const showErrors = (found: Record<string, string>) =>
  tick().then(
    () => (
      fieldErrors.show(found),
      tick().then(() =>
        element
          ?.querySelector<HTMLElement>(
            `[aria-invalid="true"], [data-error], #${CSS.escape(`${id}-error`)}`
          )
          ?.focus()
      )
    )
  );

const send = (next: Draft) =>
  group === 'sender'
    ? api
        .send<{ key: IssuedSenderKey | null }>(
          'PUT',
          `/analytics/senders/${encodeURIComponent(next.code)}`,
          bodyOf(group, next, setup)
        )
        .then((_) => _.key)
    : api
        .send('PUT', `/analytics/setup/${group}`, bodyOf(group, next, setup))
        .then(() => null);

const save = (event: SubmitEvent) => {
  event.preventDefault();
  const next = $state.snapshot(draft) as Draft;
  const found = check(group, next, context);
  void (Object.keys(found).length > 0
    ? showErrors(found)
    : busy ||
      (confirmRecount
        ? ask({
            title: t('setupForm.recountTitle'),
            body: t('setupForm.recountBody'),
            confirm: t('setupForm.recountConfirm'),
          })
        : Promise.resolve(true)
      ).then(
        (yes) =>
          void (
            yes &&
            ((busy = true),
            (formError = null),
            send(next)
              .then(
                (key) => (
                  notify(t('setupForm.saved')), onsaved(key, next.code)
                ),
                (error) =>
                  ((field) =>
                    field
                      ? showErrors({ [field]: describe(error) })
                      : void (formError = describe(error)))(
                    isApiError(error)
                      ? fieldOf(group, error.code, error.message)
                      : null
                  )
              )
              .finally(() => (busy = false)))
          )
      ));
};

const toggleProperty = (code: string, on: boolean) =>
  (draft.properties = on
    ? [...draft.properties, { code, required: false }]
    : draft.properties.filter((_) => _.code !== code));

const requireProperty = (code: string, required: boolean) =>
  (draft.properties = draft.properties.map((_) =>
    _.code === code ? { ..._, required } : _
  ));

const _SCOPES: readonly PropertyScope[] = ['event', 'person'];
const _PURPOSES: readonly DictionaryPurpose[] = ['values', 'answers', 'parts'];
const _PURPOSE_HINTS: Readonly<Record<DictionaryPurpose, MessageKey>> = {
  values: 'setupForm.purposeValuesHint',
  answers: 'setupForm.purposeAnswersHint',
  parts: 'setupForm.purposePartsHint',
};

const _OWNER_LABELS: Readonly<Partial<Record<SetupGroup, MessageKey>>> = {
  type: 'setupForm.sender',
  property: 'setupForm.scope',
  value: 'setupForm.dictionary',
  schema: 'setupForm.sender',
};

const ownerName = (next: Draft): string =>
  group === 'property'
    ? t(
        next.owner === 'person'
          ? 'setupForm.scopePerson'
          : 'setupForm.scopeEvent'
      )
    : group === 'value'
      ? (setup.dictionaries.find((_) => _.code === next.owner)?.name ??
        next.owner)
      : (setup.senders.find((_) => _.code === next.owner)?.name ?? next.owner);

// Отметка сверки — у одного свойства сайта: занятая другим свойством видна, но не выбирается.
const reconcileOwner = (mark: string) =>
  setup.properties.find(
    (_) =>
      _.reconcile === mark &&
      !(_.scope === draft.owner && _.code === draft.code)
  );

// Параметр UTM — у одной части: занятый другой частью виден, но не выбирается.
const utmOwner = (utm: string) =>
  setup.dictionaries.find(
    (_) => _.purpose === 'parts' && _.utm === utm && _.code !== draft.code
  );

const described = (field: string, hint = true) =>
  describedBy(id, errors, field, hint);
</script>

{#snippet fieldError(field: string)}
  {#if errors[field]}<small id={`${id}-${field}-error`} class="field-error">{errors[field]}</small>{/if}
{/snippet}

<Modal open={request !== null} {title} wide={_WIDE.has(group)} {onclose}>
  <form id={`${id}-form`} class="form" novalidate onsubmit={save} bind:this={element} oninput={() => (formError = null)}>
    {#if group in OWNER_FIELDS}
      <label>
        <span>{t(_OWNER_LABELS[group]!)}</span>
        {#if existing}
          <input readonly value={ownerName(draft)} />
        {:else}
          <select bind:value={draft.owner} aria-invalid={errors.owner ? 'true' : undefined} aria-describedby={described('owner', group === 'schema')}>
            <option value="" disabled>{t('setupForm.pick')}</option>
            {#if group === 'type'}
              {#each activeSenders as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
            {:else if group === 'schema'}
              {#each schemaSenders as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
            {:else if group === 'property'}
              {#each _SCOPES as scope (scope)}<option value={scope}>{t(scope === 'person' ? 'setupForm.scopePerson' : 'setupForm.scopeEvent')}</option>{/each}
            {:else}
              {#each setup.dictionaries.filter((_) => _.archivedAt === null) as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
            {/if}
          </select>
        {/if}
        {@render fieldError('owner')}
        {#if group === 'schema' && !existing}<small id={`${id}-owner-hint`}>{t(schemaSenders.length === 0 ? 'schemas.noFreeSenders' : 'schemas.senderHint')}</small>{/if}
      </label>
    {/if}

    {#if group !== 'schema'}
      <label>
        <span>{t('setupForm.code')}</span>
        {#if existing}
          <input class="code" readonly value={draft.code} aria-describedby={`${id}-code-hint`} />
          <small id={`${id}-code-hint`}>{t('setupForm.codeFixed')}</small>
        {:else}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="code" bind:value={draft.code} required maxlength={partLimit ?? CODE_LIMITS[group]} pattern={CODE_PATTERN} spellcheck="false" autocomplete="off" autocapitalize="none" autofocus={!request?.preset?.code} aria-invalid={errors.code ? 'true' : undefined} aria-describedby={errors.code ? `${id}-code-error` : `${id}-code-hint`} />
          <!-- Неверный код — подсказка краснеет: она и говорит, что ожидается; занятый код — своя причина. -->
          {#if errors.code}
            <small id={`${id}-code-error`} class="field-error">{errors.code}</small>
          {:else}
            <small id={`${id}-code-hint`}>{partLimit === null ? t('setupForm.codeHint', { n: CODE_LIMITS[group] }) : t('setupForm.partValueHint', { n: partLimit })}</small>
          {/if}
        {/if}
      </label>
    {/if}

    <label>
      <span>{t('setupForm.name')}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={draft.name} required maxlength={ITEM_LIMITS.name} autofocus={existing !== null || Boolean(request?.preset?.code)} aria-invalid={errors.name ? 'true' : undefined} aria-describedby={described('name', false)} />
      {@render fieldError('name')}
    </label>

    <label>
      <span>{t('setupForm.note')} <small>{t('setupForm.optional')}</small></span>
      <textarea rows="2" bind:value={draft.note} maxlength={ITEM_LIMITS.note} aria-invalid={errors.note ? 'true' : undefined} aria-describedby={described('note', false)}></textarea>
      {@render fieldError('note')}
    </label>

    {#if group === 'sender'}
      <label class="option">
        <input type="checkbox" bind:checked={draft.enabled} />
        <span><strong>{t('setupForm.enabled')}</strong><small class="help">{t('setupForm.enabledHint')}</small></span>
      </label>
      <fieldset class="summary" aria-describedby={described('summaryAt')}>
        <legend>{t('senders.summaryAt')}</legend>
        <label class="inline">
          <input type="time" step="60" bind:value={draft.summaryAt} disabled={draft.noSummary} aria-invalid={errors.summaryAt ? 'true' : undefined} aria-label={t('senders.summaryAtField')} />
          <span>UTC</span>
        </label>
        <label class="check"><input type="checkbox" bind:checked={draft.noSummary} />{t('senders.noSummary')}</label>
        {@render fieldError('summaryAt')}
        <small id={`${id}-summaryAt-hint`} class="help">{t('senders.summaryAtHelp')}</small>
      </fieldset>
      {#if !existing}<p class="help">{t('setupForm.senderKeyHint')}</p>{/if}
    {/if}

    {#if group === 'type'}
      <label>
        <span>{t('analytics.role')}</span>
        <select bind:value={draft.role} aria-invalid={errors.role ? 'true' : undefined} aria-describedby={described('role')}>
          <option value="" disabled>{t('setupForm.pick')}</option>
          {#each ROLES as item (item)}<option value={item}>{t(ROLE_LABELS[item])}</option>{/each}
        </select>
        {@render fieldError('role')}
        <small id={`${id}-role-hint`}>
          {#if role}
            {#if role.fields.length === 0}
              {t('setupForm.roleNoFields')}
            {:else}
              {t('setupForm.roleFields')} {#each role.fields as field, index (field.code)}<code>{field.code}</code>{field.required ? ` (${t('setupForm.requiredShort')})` : ''}{index < role.fields.length - 1 ? ', ' : ''}{/each}
            {/if}
            {#if role.subject === 'forbidden'}<span class="block">{t('setupForm.roleNoSubject')}</span>{/if}
          {:else}
            {t('setupForm.roleHint')}
          {/if}
        </small>
      </label>

      <fieldset aria-describedby={described('properties')}>
        <legend>{t('setupForm.properties')}</legend>
        {#if eventProperties.length === 0}
          <p class="help">{t('setupForm.noProperties')}</p>
        {:else}
          <ul class="properties">
            {#each eventProperties as property (property.code)}
              {@const picked = draft.properties.find((_) => _.code === property.code)}
              <li>
                <label class="check">
                  <input type="checkbox" checked={picked !== undefined} onchange={(e) => toggleProperty(property.code, e.currentTarget.checked)} />
                  <span>{property.name} <code class="muted">{property.code}</code></span>
                </label>
                {#if picked}
                  <label class="check required">
                    <input type="checkbox" checked={picked.required} onchange={(e) => requireProperty(property.code, e.currentTarget.checked)} />
                    {t('setupForm.required')}
                  </label>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {@render fieldError('properties')}
        <small id={`${id}-properties-hint`} class="help">{t('setupForm.propertiesHint')}</small>
      </fieldset>
    {/if}

    {#if group === 'property'}
      <label>
        <span>{t('setupForm.kind')}</span>
        <select bind:value={draft.kind} aria-invalid={errors.kind ? 'true' : undefined} aria-describedby={described('kind', false)}>
          <option value="" disabled>{t('setupForm.pick')}</option>
          {#each KINDS as kind (kind)}<option value={kind}>{t(KIND_LABELS[kind])}</option>{/each}
        </select>
        {@render fieldError('kind')}
      </label>
      {#if draft.kind === 'choice'}
        <label>
          <span>{t('setupForm.dictionary')}</span>
          <select bind:value={draft.dictionary} aria-invalid={errors.dictionary ? 'true' : undefined} aria-describedby={described('dictionary')}>
            <option value="" disabled>{t('setupForm.pick')}</option>
            {#each valueDictionaries as item (item.code)}<option value={item.code}>{item.name} · {item.code}</option>{/each}
          </select>
          {@render fieldError('dictionary')}
          <small id={`${id}-dictionary-hint`}>{t('setupForm.dictionaryHint')}</small>
        </label>
      {/if}
      <label class="option" class:off={!DIMENSION_KINDS.includes(draft.kind as PropertyKind)}>
        <input type="checkbox" bind:checked={draft.dimension} disabled={!DIMENSION_KINDS.includes(draft.kind as PropertyKind)} />
        <span><strong>{t('setupForm.dimension')}</strong><small class="help">{t('setupForm.dimensionHint')}</small></span>
      </label>
      <label class="option" class:off={draft.kind !== 'string'}>
        <input type="checkbox" bind:checked={draft.untrusted} disabled={draft.kind !== 'string'} />
        <span><strong>{t('setupForm.untrusted')}</strong><small class="help">{t('setupForm.untrustedHint')}</small></span>
      </label>
      {#if draft.owner === 'event' && reconcileFor(draft.kind).length > 0}
        <label>
          <span>{t('reconcile.label')}</span>
          <select bind:value={draft.reconcile} aria-invalid={errors.reconcile ? 'true' : undefined} aria-describedby={described('reconcile')}>
            <option value="">{t('reconcile.none')}</option>
            {#each reconcileFor(draft.kind) as mark (mark)}
              {@const owner = reconcileOwner(mark)}
              <option value={mark} disabled={owner !== undefined}>{owner ? t('reconcile.usedBy', { mark: t(RECONCILE_LABELS[mark]), name: quoted(owner.name) }) : t(RECONCILE_LABELS[mark])}</option>
            {/each}
          </select>
          {@render fieldError('reconcile')}
          <small id={`${id}-reconcile-hint`}>{t('reconcile.hint')}</small>
        </label>
      {/if}
      <p class="help sensitive">{t('setupForm.sensitive')}</p>
    {/if}

    {#if group === 'dictionary'}
      <fieldset aria-describedby={described('purpose', purposeUsers.length > 0)}>
        <legend>{t('setupForm.purpose')}</legend>
        {#each _PURPOSES as purpose (purpose)}
          {@const locked = purposeUsers.length > 0 && purpose !== existing?.purpose}
          <label class="option" class:off={locked}>
            <input type="radio" name={`${id}-purpose`} value={purpose} bind:group={draft.purpose} disabled={locked} />
            <span><strong>{t(PURPOSE_LABELS[purpose])}</strong><small class="help">{t(_PURPOSE_HINTS[purpose])}</small></span>
          </label>
        {/each}
        {#if errors.purpose}<small id={`${id}-purpose-error`} class="field-error" data-error tabindex="-1">{errors.purpose}</small>{/if}
        {#if purposeUsers.length > 0}<small id={`${id}-purpose-hint`} class="help">{t('dictionaries.purposeLocked', { users: purposeUsers.join(', ') })}</small>{/if}
      </fieldset>
      {#if draft.purpose === 'parts'}
        <div class="pair">
          <label>
            <span>{t('dictionaries.utm')}</span>
            <select bind:value={draft.utm} aria-invalid={errors.utm ? 'true' : undefined} aria-describedby={described('utm')}>
              <option value="">{t('dictionaries.utmNone')}</option>
              {#each UTM_PARAMETERS as utm (utm)}
                {@const owner = utmOwner(utm)}
                <option value={utm} disabled={owner !== undefined}>{owner ? t('dictionaries.utmUsed', { utm, name: quoted(owner.name) }) : utm}</option>
              {/each}
            </select>
            {@render fieldError('utm')}
            <small id={`${id}-utm-hint`}>{t('dictionaries.utmHint')}</small>
          </label>
          <label>
            <span>{t('dictionaries.length')}</span>
            <input type="number" inputmode="numeric" min="1" max={LABEL_LIMITS.part} step="1" bind:value={draft.length} aria-invalid={errors.length ? 'true' : undefined} aria-describedby={described('length')} />
            {@render fieldError('length')}
            <small id={`${id}-length-hint`}>{t('dictionaries.lengthHelp', { n: LABEL_LIMITS.part })}</small>
          </label>
        </div>
      {:else}
        <p class="help sensitive">{t('setupForm.sensitive')}</p>
      {/if}
    {/if}

    {#if group === 'value'}
      <label>
        <span>{t('setupForm.position')} <small>{t('setupForm.optional')}</small></span>
        <input type="number" inputmode="numeric" min="0" max={ITEM_LIMITS.position} step="1" bind:value={draft.position} aria-invalid={errors.position ? 'true' : undefined} aria-describedby={described('position')} />
        {@render fieldError('position')}
        <small id={`${id}-position-hint`}>{t('setupForm.positionHelp')}</small>
      </label>
      {#if partOf(setup, draft.owner)}
        <label class="option">
          <input type="checkbox" bind:checked={draft.awaitsSpend} />
          <span><strong>{t('setupForm.awaitsSpend')}</strong><small class="help">{t('setupForm.awaitsSpendHint')}</small></span>
        </label>
      {/if}
    {/if}

    {#if group === 'schema'}<SchemaFields bind:draft {setup} {errors} {id} />{/if}
    {#if group === 'referrer'}<ReferrerFields bind:draft {setup} {existing} {errors} {id} />{/if}
    {#if group === 'link'}<LinkFields bind:draft {setup} {existing} {errors} {id} />{/if}
    {#if group === 'milestone'}<MilestoneFields bind:draft {setup} {existing} {errors} {id} />{/if}
    {#if group === 'funnel'}<FunnelFields bind:draft {setup} {existing} {errors} {id} />{/if}

    {#if effectKey}<p class="notice" class:warn={confirmRecount} role="note"><strong>{t('setupForm.effects')}</strong> {t(effectKey)}</p>{/if}

    {#if formError}<p id={`${id}-error`} class="field-error" role="alert" tabindex="-1">{formError}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" onclick={onclose}>{t('common.cancel')}</button>
    <button type="submit" form={`${id}-form`} class="primary" aria-disabled={busy}>{existing ? t('setupForm.save') : t(_CREATE[group])}</button>
  {/snippet}
</Modal>

<style>
  .form {
    display: grid;
    gap: 1rem;
  }

  label > span small {
    color: var(--muted);
    font-weight: 400;
  }

  .properties {
    display: grid;
    gap: 0.35rem;
    max-height: 15rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    overflow: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    list-style: none;
  }

  .properties li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  .properties .check {
    font-size: 0.875rem;
  }

  .properties .required {
    color: var(--muted);
  }

  .option.off {
    opacity: 0.6;
    cursor: default;
  }

  .summary {
    display: grid;
    gap: 0.4rem;
    justify-items: start;
  }

  .inline {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
  }

  .inline input {
    width: 8rem;
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 1rem;
  }

  .notice {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: var(--sunken);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  /* Смена роли прежнего типа меняет смысл всех его событий — это предупреждение, а не справка. */
  .notice.warn {
    border-color: color-mix(in oklab, var(--warn) 40%, var(--line));
    background: var(--warn-soft);
  }

  .sensitive {
    margin: 0;
  }

  [readonly] {
    color: var(--muted);
  }

  .block {
    display: block;
  }
</style>
