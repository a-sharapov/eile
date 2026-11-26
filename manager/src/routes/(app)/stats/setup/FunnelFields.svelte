<script lang="ts">
import { ITEM_LIMITS } from '#lib/analytics.ts';
import { forms, loadForms } from '#lib/forms.svelte.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { can } from '#lib/session.svelte.ts';
import type { SetupView } from '#lib/types.ts';
import {
  type Draft,
  describedBy,
  EMPTY_STEP,
  nextKey,
  type StepDraft,
  type StepKind,
  sideOf,
  stepKindOf,
} from './drafts.ts';
import type { SetupRow } from './setup.ts';

// Воронка: шаги по порядку с «выше» и «ниже», строгий порядок, основная. Шаг-посещение (из сводок статистики)
// не встаёт ниже шага-человека (из событий): перестановка через границу не делается, вид, который нарушил бы её,
// переставляет шаг к границе, и под списком сказано почему.
let {
  draft = $bindable(),
  setup,
  existing,
  errors,
  id,
}: {
  draft: Draft;
  setup: SetupView;
  existing: SetupRow | null;
  errors: Readonly<Record<string, string>>;
  id: string;
} = $props();

const _KINDS: Readonly<Record<'visits' | 'people', readonly StepKind[]>> = {
  visits: ['visits', 'page', 'link', 'form'],
  people: ['arrival', 'trial', 'payment', 'milestone', 'type'],
};

const _LABELS: Readonly<Record<StepKind, MessageKey>> = {
  visits: 'funnels.kindVisits',
  page: 'funnels.kindPage',
  link: 'funnels.kindLink',
  form: 'funnels.kindForm',
  arrival: 'funnels.kindArrival',
  trial: 'funnels.kindTrial',
  payment: 'funnels.kindPayment',
  milestone: 'funnels.kindMilestone',
  type: 'funnels.kindType',
};

// Что уже стояло в воронке: переход, веха и тип в архиве остаются в выборе только у прежних шагов.
const used = $derived(
  ((existing?.steps ?? []) as Parameters<typeof stepKindOf>[0][]).map((_) =>
    JSON.stringify(_)
  )
);
const was = (step: object) => used.includes(JSON.stringify(step));
const links = $derived(
  setup.links.filter(
    (_) => _.archivedAt === null || was({ kind: 'goal', goal: `go:${_.code}` })
  )
);
const milestones = $derived(
  setup.milestones.filter(
    (_) =>
      _.archivedAt === null || was({ kind: 'milestone', milestone: _.code })
  )
);
const types = $derived(
  setup.types.filter(
    (_) =>
      _.archivedAt === null ||
      was({ kind: 'type', sender: _.sender, type: _.code })
  )
);
const main = $derived(
  setup.funnels.find((_) => _.main && _.code !== draft.code)
);

// Имена форм сайта — подсказкой к полю: список форм открыт тому, кто видит заявки.
$effect(
  () =>
    void (
      forms.items === null &&
      can('inbox.read') &&
      loadForms().catch(() => [])
    )
);

// Шаг, который правило не пустило на место или переставило, — с объяснением под списком.
let blocked = $state<number | null>(null);

const crosses = (index: number, other: number) =>
  ((upper, lower) =>
    upper !== undefined &&
    lower !== undefined &&
    sideOf(upper) === 'visits' &&
    sideOf(lower) === 'people')(
    draft.steps[Math.min(index, other)],
    draft.steps[Math.max(index, other)]
  );

const move = (index: number, step: -1 | 1) =>
  ((other, current) =>
    void (other < 0 || other >= draft.steps.length || current === undefined
      ? null
      : crosses(index, other)
        ? (blocked = current.key)
        : ((blocked = null),
          (draft.steps = draft.steps.map((_, at) =>
            at === index
              ? (draft.steps[other] ?? _)
              : at === other
                ? current
                : _
          )))))(index + step, draft.steps[index]);

const drop = (key: number) => (
  (blocked = null), (draft.steps = draft.steps.filter((_) => _.key !== key))
);

const add = () =>
  void (
    draft.steps.length < ITEM_LIMITS.funnelSteps.max &&
    ((blocked = null),
    (draft.steps = [...draft.steps, { ...EMPTY_STEP, key: nextKey() }]))
  );

// Куда встать шагу, чтобы посещения остались выше людей: посещение под людьми — к первому шагу-человеку,
// человек над посещениями — сразу за последним шагом-посещением; иначе — на своё место.
const _placeOf = (
  side: 'visits' | 'people' | null,
  index: number,
  rest: readonly StepDraft[]
): number =>
  side === 'visits' && rest.slice(0, index).some((_) => sideOf(_) === 'people')
    ? rest.findIndex((_) => sideOf(_) === 'people')
    : side === 'people' && rest.slice(index).some((_) => sideOf(_) === 'visits')
      ? rest.findLastIndex((_) => sideOf(_) === 'visits') + 1
      : index;

// Новый вид шага, который нарушил бы границу, переставляет шаг к ней — и экран говорит почему.
const pickKind = (key: number, kind: StepKind) =>
  ((index) =>
    ((step, rest) =>
      ((place) => (
        (draft.steps = [...rest.slice(0, place), step, ...rest.slice(place)]),
        (blocked = place === index ? null : key)
      ))(_placeOf(sideOf(step), index, rest)))(
      { ...draft.steps[index]!, kind },
      draft.steps.filter((_) => _.key !== key)
    ))(draft.steps.findIndex((_) => _.key === key));

const label = (index: number) => t('funnels.stepLabel', { n: index + 1 });
</script>

<fieldset aria-describedby={describedBy(id, errors, 'steps')}>
  <legend>{t('funnels.steps')}</legend>
  <ol class="rows">
    {#each draft.steps as step, index (step.key)}
      {@const side = sideOf(step)}
      <li class:blocked={blocked === step.key}>
        <span class="index" aria-hidden="true">{index + 1}</span>
        <span class="side">{side ? t(side === 'visits' ? 'funnels.sideVisits' : 'funnels.sidePeople') : ''}</span>
        <label class="kind">
          <span class="sr-only">{t('funnels.kindOf', { step: label(index) })}</span>
          <select value={step.kind} onchange={(e) => pickKind(step.key, e.currentTarget.value as StepKind)} aria-invalid={errors.steps && step.kind === '' ? 'true' : undefined}>
            <option value="" disabled>{t('funnels.pickKind')}</option>
            <optgroup label={t('funnels.groupVisits')}>
              {#each _KINDS.visits as kind (kind)}<option value={kind}>{t(_LABELS[kind])}</option>{/each}
            </optgroup>
            <optgroup label={t('funnels.groupPeople')}>
              {#each _KINDS.people as kind (kind)}<option value={kind}>{t(_LABELS[kind])}</option>{/each}
            </optgroup>
          </select>
        </label>
        <span class="param">
          {#if step.kind === 'page'}
            <label>
              <span class="sr-only">{t('funnels.page')}</span>
              <input class="code" bind:value={step.page} maxlength={ITEM_LIMITS.page} spellcheck="false" autocomplete="off" autocapitalize="none" placeholder="/" />
            </label>
          {:else if step.kind === 'link'}
            <label>
              <span class="sr-only">{t('funnels.link')}</span>
              <select bind:value={step.link}>
                <option value="">{t('funnels.anyLink')}</option>
                {#each links as link (link.code)}<option value={link.code}>{link.name}</option>{/each}
              </select>
            </label>
          {:else if step.kind === 'form'}
            <label>
              <span class="sr-only">{t('funnels.form')}</span>
              <input class="code" bind:value={step.form} list={`${id}-forms`} maxlength="64" spellcheck="false" autocomplete="off" autocapitalize="none" placeholder={t('funnels.formPlaceholder')} />
            </label>
          {:else if step.kind === 'payment'}
            <label class="number">
              <span class="sr-only">{t('funnels.number')}</span>
              <span aria-hidden="true">№</span>
              <input type="number" inputmode="numeric" min="1" max={ITEM_LIMITS.paymentNumber} step="1" bind:value={step.number} />
            </label>
          {:else if step.kind === 'milestone'}
            <label>
              <span class="sr-only">{t('funnels.milestone')}</span>
              <select bind:value={step.milestone} aria-invalid={errors.steps && step.milestone === '' ? 'true' : undefined}>
                <option value="" disabled>{t('setupForm.pick')}</option>
                {#each milestones as milestone (milestone.code)}<option value={milestone.code}>{milestone.name}</option>{/each}
              </select>
            </label>
          {:else if step.kind === 'type'}
            <label>
              <span class="sr-only">{t('funnels.type')}</span>
              <select bind:value={step.type} aria-invalid={errors.steps && step.type === '' ? 'true' : undefined}>
                <option value="" disabled>{t('setupForm.pick')}</option>
                {#each types as type (`${type.sender}/${type.code}`)}<option value={`${type.sender}/${type.code}`}>{setup.senders.length > 1 ? `${setup.senders.find((_) => _.code === type.sender)?.name ?? type.sender} · ` : ''}{type.name}</option>{/each}
              </select>
            </label>
          {/if}
        </span>
        <span class="buttons">
          <button type="button" class="ghost icon" aria-label={t('funnels.up', { step: label(index) })} title={t('dictionaries.upShort')} aria-disabled={index === 0 || crosses(index, index - 1)} onclick={() => move(index, -1)}>{@html icons.arrowUp}</button>
          <button type="button" class="ghost icon" aria-label={t('funnels.down', { step: label(index) })} title={t('dictionaries.downShort')} aria-disabled={index === draft.steps.length - 1 || crosses(index, index + 1)} onclick={() => move(index, 1)}>{@html icons.arrowDown}</button>
          <button type="button" class="ghost icon danger" aria-label={t('funnels.remove', { step: label(index) })} title={t('funnels.removeShort')} aria-disabled={draft.steps.length <= ITEM_LIMITS.funnelSteps.min} onclick={() => draft.steps.length > ITEM_LIMITS.funnelSteps.min && drop(step.key)}>{@html icons.close}</button>
        </span>
      </li>
    {/each}
  </ol>
  {#if forms.items}
    <datalist id={`${id}-forms`}>
      {#each forms.items as form (form.name)}<option value={form.name}>{form.title}</option>{/each}
    </datalist>
  {/if}
  {#if draft.steps.length < ITEM_LIMITS.funnelSteps.max}
    <button type="button" class="add" onclick={add}>{@html icons.plus}{t('funnels.addStep')}</button>
  {/if}
  {#if errors.steps}<small id={`${id}-steps-error`} class="field-error" data-error tabindex="-1">{errors.steps}</small>{/if}
  <p id={`${id}-steps-hint`} class="rule" class:alert={blocked !== null} role="status">{t(blocked === null ? 'funnels.orderHint' : 'funnels.orderRule')}</p>
</fieldset>

<label class="option">
  <input type="checkbox" bind:checked={draft.strict} />
  <span><strong>{t('funnels.strict')}</strong><small class="help">{t('funnels.strictHint')}</small></span>
</label>

<label class="option">
  <input type="checkbox" bind:checked={draft.main} />
  <span>
    <strong>{t('funnels.main')}</strong>
    <small class="help">{main && draft.main ? t('funnels.mainReplaces', { name: quoted(main.name) }) : t('funnels.mainHint')}</small>
  </span>
</label>

<style>
  .rows {
    display: grid;
    margin: 0;
    padding: 0;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    list-style: none;
  }

  .rows li {
    display: grid;
    grid-template-columns: 1.25rem 5.5rem minmax(11rem, 15rem) minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.45rem 0.4rem 0.45rem 0.6rem;
  }

  .rows li + li {
    border-top: 0.0625rem solid var(--line);
  }

  .rows li.blocked {
    background: var(--warn-soft);
  }

  .index {
    color: var(--muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .side {
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 550;
    overflow-wrap: break-word;
  }

  .param {
    min-width: 0;
  }

  .number {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    color: var(--muted);
    font-weight: 400;
  }

  .number input {
    width: 5rem;
  }

  .buttons {
    display: flex;
  }

  .buttons button {
    width: 2rem;
    min-height: 2rem;
  }

  .buttons :global(svg),
  .add :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .add {
    justify-self: start;
  }

  .rule {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-left: 0.1875rem solid var(--line);
    color: var(--muted);
    font-size: 0.8125rem;
    text-wrap: pretty;
  }

  .rule.alert {
    border-left-color: var(--warn);
    background: var(--warn-soft);
    color: var(--text);
  }

  /* Узкое окно: вид и его поле — во всю ширину строки, кнопки — справа от номера. */
  @media (max-width: 40rem) {
    .rows li {
      grid-template-columns: 1.25rem minmax(0, 1fr) auto;
    }

    .side {
      grid-column: 2;
      grid-row: 1;
    }

    .buttons {
      grid-column: 3;
      grid-row: 1;
    }

    .kind,
    .param {
      grid-column: 2 / span 2;
    }

    .param:empty {
      display: none;
    }
  }
</style>
