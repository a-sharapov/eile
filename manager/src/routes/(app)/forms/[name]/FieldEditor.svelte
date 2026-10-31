<script lang="ts">
import { FIELD_KINDS, type FieldDraft, patterns } from '#lib/form-blocks.ts';
import { t } from '#lib/i18n.ts';
import { transliterate } from '#lib/translit.ts';
import type { FieldKind, SourceChoice } from '#lib/types.ts';

let {
  field = $bindable(),
  sources,
  pageFields,
  pages,
  taken,
  others,
}: {
  field: FieldDraft;
  sources: readonly SourceChoice[];
  /** Поля страниц сайта — для источника «Страница: поле…». */
  pageFields: readonly string[];
  pages: readonly { id: number; title: string; depth: number }[];
  /** Имена других полей формы: имя поля в форме одно. */
  taken: readonly string[];
  /** Поля, от которых может зависеть показ этого. */
  others: readonly { name: string; label: string }[];
} = $props();

const uid = $props.id();

// Имя поля — латиница: из подписи, пока его не задали вручную.
const nameFrom = (label: string): string =>
  transliterate(label)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'field';

const follows = $derived(
  field.name === '' || field.name === nameFrom(field.label)
);

const setLabel = (label: string) => {
  const auto = follows;
  field.label = label;
  void (auto && (field.name = nameFrom(label)));
};

const has = (...kinds: FieldKind[]): boolean => kinds.includes(field.kind);
const textual = $derived(has('text', 'email', 'tel', 'url', 'textarea'));
const ranged = $derived(
  has('number', 'range', 'date', 'time', 'datetime-local')
);
const chosen = $derived(has('select', 'radio', 'checkbox'));
const duplicate = $derived(taken.includes(field.name));

// Источник скрытого поля: «page.field:» и подобные — с именем после двоеточия.
const sourceBase = $derived(
  sources.find((_) => _.needsKey && field.source.startsWith(_.value))?.value ??
    (sources.some((_) => _.value === field.source) ? field.source : '')
);
const sourceKey = $derived(
  sourceBase.endsWith(':') ? field.source.slice(sourceBase.length) : ''
);
const needsKey = $derived(sourceBase.endsWith(':'));
</script>

<div class="field-editor">
  <div class="grid">
    <label>
      <span>{t('formEditor.label')}<span class="required" aria-hidden="true"> *</span></span>
      <input value={field.label} oninput={(e) => setLabel(e.currentTarget.value)} required maxlength="200" />
      {#if field.kind === 'consent'}<small>{t('formEditor.consentHint')}</small>{/if}
    </label>
    <label>
      <span>{t('formEditor.name')}</span>
      <input class="code" bind:value={field.name} pattern="[A-Za-z_][A-Za-z0-9_\-]*" required spellcheck="false" autocomplete="off" aria-invalid={duplicate || undefined} aria-describedby="{uid}-name" />
      <small id="{uid}-name" class:field-error={duplicate}>{duplicate ? t('formEditor.nameTaken') : t('formEditor.nameHint')}</small>
    </label>
  </div>
  <div class="grid">
    <label>
      <span>{t('formEditor.kind')}</span>
      <select bind:value={field.kind}>
        {#each FIELD_KINDS as kind (kind.id)}<option value={kind.id}>{t(kind.label)}</option>{/each}
      </select>
    </label>
    {#if field.kind !== 'hidden'}
      <label class="option check">
        <input type="checkbox" bind:checked={field.required} />
        <span>{t('formEditor.required')}</span>
      </label>
    {/if}
  </div>

  {#if textual || has('select')}
    <label>
      <span>{t(has('select') ? 'formEditor.selectPlaceholder' : 'formEditor.placeholder')}</span>
      <input bind:value={field.placeholder} maxlength="200" />
    </label>
  {/if}

  {#if chosen}
    <label>
      <span>{t('formEditor.options')}<span class="required" aria-hidden="true"> *</span></span>
      <textarea rows="4" bind:value={field.options} required></textarea>
      <small>{t('formEditor.optionsHint')}</small>
    </label>
  {/if}

  {#if ranged}
    <div class="grid three">
      <label><span>{t('formEditor.min')}</span><input bind:value={field.min} /></label>
      <label><span>{t('formEditor.max')}</span><input bind:value={field.max} /></label>
      {#if has('number', 'range')}<label><span>{t('formEditor.step')}</span><input bind:value={field.step} /></label>{/if}
    </div>
  {/if}

  {#if textual}
    <div class="grid">
      <label>
        <span>{t('formEditor.maxLength')}</span>
        <input type="number" min="1" max="5000" bind:value={field.maxLength} />
      </label>
      {#if !has('textarea')}
        <label>
          <span>{t('formEditor.pattern')}</span>
          <input class="code" bind:value={field.pattern} list="{uid}-patterns" spellcheck="false" />
          <datalist id="{uid}-patterns">{#each patterns() as pattern (pattern.value)}<option value={pattern.value}>{pattern.label}</option>{/each}</datalist>
          <small>{t('formEditor.patternHint')}</small>
        </label>
      {/if}
    </div>
  {/if}

  {#if field.kind === 'file'}
    <div class="grid">
      <label>
        <span>{t('formEditor.accept')}</span>
        <input class="code" bind:value={field.accept} list="{uid}-accept" spellcheck="false" placeholder=".pdf, image/*" />
        <datalist id="{uid}-accept"><option value=".pdf"></option><option value="image/*"></option><option value=".pdf, .doc, .docx"></option><option value=".jpg, .jpeg, .png"></option></datalist>
        <small>{t('formEditor.acceptHint')}</small>
      </label>
      <label>
        <span>{t('formEditor.maxSize')}</span>
        <input type="number" min="1" max="20" step="1" bind:value={field.maxSize} placeholder="10" />
        <small>{t('formEditor.maxSizeHint')}</small>
      </label>
    </div>
    <label class="option">
      <input type="checkbox" bind:checked={field.multiple} />
      <span>{t('formEditor.multiple')}</span>
    </label>
  {/if}

  {#if field.kind === 'consent'}
    <label>
      <span>{t('formEditor.consentPage')}</span>
      <select bind:value={field.consentPage}>
        <option value={null}>{t('formEditor.noPage')}</option>
        {#each pages as item (item.id)}<option value={item.id}>{' '.repeat(item.depth)}{item.title}</option>{/each}
      </select>
    </label>
  {/if}

  {#if field.kind === 'hidden'}
    <div class="grid">
      <label>
        <span>{t('formEditor.source')}</span>
        <select value={sourceBase} onchange={(e) => (field.source = e.currentTarget.value)}>
          <option value="">{t('formEditor.sourceConstant')}</option>
          {#each sources as source (source.value)}<option value={source.value}>{source.label}</option>{/each}
        </select>
      </label>
      {#if needsKey}
        <label>
          <span>{t('formEditor.sourceKey')}</span>
          <input class="code" value={sourceKey} list="{uid}-keys" oninput={(e) => (field.source = `${sourceBase}${e.currentTarget.value.trim()}`)} spellcheck="false" />
          {#if sourceBase === 'page.field:'}<datalist id="{uid}-keys">{#each pageFields as name (name)}<option value={name}></option>{/each}</datalist>{/if}
        </label>
      {:else if sourceBase === ''}
        <label><span>{t('formEditor.value')}</span><input bind:value={field.value} /></label>
      {/if}
    </div>
    <small class="muted">{t('formEditor.hiddenHint')}</small>
  {:else}
    <label>
      <span>{t('formEditor.hint')}</span>
      <input bind:value={field.hint} maxlength="300" />
    </label>
    <label>
      <span>{t('formEditor.message')}</span>
      <input bind:value={field.message} maxlength="200" placeholder={t('formEditor.messagePlaceholder')} />
    </label>
    {#if others.length > 0}
      <div class="grid">
        <label>
          <span>{t('formEditor.showIf')}</span>
          <select bind:value={field.showField}>
            <option value="">{t('formEditor.showAlways')}</option>
            {#each others as other (other.name)}<option value={other.name}>{other.label || other.name}</option>{/each}
          </select>
        </label>
        {#if field.showField}
          <label>
            <span>{t('formEditor.showValues')}</span>
            <input bind:value={field.showValues} maxlength="200" />
            <small>{t('formEditor.showValuesHint')}</small>
          </label>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .field-editor {
    display: grid;
    gap: 0.85rem;
    padding: 0.85rem 0.9rem 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.85rem;
    align-items: start;
  }

  .three {
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  }

  label {
    display: grid;
    gap: 0.3rem;
  }

  .check {
    align-self: center;
    margin-top: 1.4rem;
  }

  small {
    color: var(--muted);
    font-size: 0.8125rem;
  }
</style>
