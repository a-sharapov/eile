<script lang="ts">
import type { Snippet } from 'svelte';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import type {
  ComponentSignature,
  PropSignature,
  PropValue,
} from '#lib/types.ts';

let {
  name,
  props = $bindable({}),
  hidden = $bindable(false),
  signature,
  actions,
}: {
  name: string;
  props: Record<string, PropValue>;
  /** Блок остаётся в тексте, но сайт его не выводит: `[[Name hidden]]`. */
  hidden?: boolean;
  /** null — такого компонента нет: тег сохранится как есть. */
  signature: ComponentSignature | null;
  actions?: Snippet;
} = $props();

const known = $derived(new Set(signature?.props.map((_) => _.name) ?? []));
const extra = $derived(Object.entries(props).filter((_) => !known.has(_[0])));

// Пустое поле — значение по умолчанию: параметр не пишется в тег.
const set = (prop: PropSignature, raw: string | boolean) => {
  const value =
    raw === ''
      ? undefined
      : prop.type === 'number' && typeof raw === 'string'
        ? Number(raw)
        : raw;
  const rest = Object.fromEntries(
    Object.entries(props).filter((_) => _[0] !== prop.name)
  );
  props =
    value === undefined || Number.isNaN(value)
      ? rest
      : { ...rest, [prop.name]: value };
};

const shown = (prop: PropSignature): string =>
  props[prop.name] === undefined ? '' : String(props[prop.name]);

// Пустое умолчание подсказывать нечем: «По умолчанию: » без значения только путает.
const fallback = (prop: PropSignature): string =>
  prop.defaultValue === null || prop.defaultValue === ''
    ? ''
    : `${t('blocks.default')} ${prop.defaultValue}`;
</script>

<div class="component-block" class:hidden role="group" aria-label={`${t('blocks.component')} ${name}${hidden ? `, ${t('blocks.hidden')}` : ''}`}>
  <div class="head">
    <span class="title"><code>{name}</code>{#if signature?.description}{' '}<span class="muted">— {signature.description.split('\n')[0]}</span>{/if}</span>
    {#if hidden}<span class="hidden-mark">{@html icons.eyeOff}{t('blocks.hidden')}</span>{/if}
    {@render actions?.()}
  </div>
  <div class="body">
    {#if signature === null}
      <p class="muted note">{t('blocks.missing')}</p>
    {:else if signature.props.length === 0}
      <p class="muted note">{t('blocks.noProps')}</p>
    {:else}
      <div class="grid">
        {#each signature.props as prop (prop.name)}
          {#if prop.type === 'boolean'}
            <label class="check">
              <input
                type="checkbox"
                checked={(props[prop.name] ?? prop.defaultValue ?? false) === true}
                onchange={(e) => set(prop, e.currentTarget.checked)}
              />
              {prop.label}
            </label>
          {:else if prop.options.length > 0}
            <!-- Умолчание отмечено в самом списке: выбрать его — значит не писать параметр в тег. -->
            <label>
              {prop.label}
              <select value={shown(prop) || String(prop.defaultValue ?? '')} onchange={(e) => set(prop, e.currentTarget.value === String(prop.defaultValue) ? '' : e.currentTarget.value)}>
                {#if prop.defaultValue === null}<option value="">—</option>{/if}
                {#each prop.options as option (option.value)}
                  <option value={option.value}>{option.label}{option.value === prop.defaultValue ? ` (${t('blocks.byDefault')})` : ''}</option>
                {/each}
              </select>
            </label>
          {:else}
            <label class:wide={prop.type === 'string'}>
              <span>{prop.label}{#if prop.required}<span class="required" aria-hidden="true"> *</span>{/if}</span>
              {#if prop.type === 'number'}
                <input type="number" step="any" value={shown(prop)} placeholder={fallback(prop)} required={prop.required} oninput={(e) => set(prop, e.currentTarget.value)} />
              {:else}
                <textarea rows="1" value={shown(prop)} placeholder={fallback(prop)} required={prop.required} oninput={(e) => set(prop, e.currentTarget.value)}></textarea>
              {/if}
            </label>
          {/if}
        {/each}
      </div>
    {/if}
    {#if extra.length > 0}
      <p class="muted note">{t('blocks.extra')} <code>{extra.map((_) => `${_[0]}=${_[1]}`).join(' ')}</code></p>
    {/if}
  </div>
  <label class="check hide">
    <input type="checkbox" bind:checked={hidden} />
    {t('blocks.hide')}
  </label>
  {#if hidden}<p class="muted note">{t('blocks.hiddenNote')}</p>{/if}
</div>

<style>
  .component-block,
  .body {
    display: grid;
    gap: 0.75rem;
  }

  /* Скрытый блок читается приглушённым, но правится как обычно: под мышью и в фокусе — в полную силу. */
  .hidden .body,
  .hidden .title {
    opacity: 0.6;
    transition: opacity 150ms ease-out;
  }

  .hidden:hover .body,
  .hidden:focus-within .body,
  .hidden:hover .title,
  .hidden:focus-within .title {
    opacity: 1;
  }

  .hidden .title code {
    font-style: italic;
  }

  .hidden-mark {
    display: inline-flex;
    flex: none;
    gap: 0.3rem;
    align-items: center;
    height: 1.375rem;
    padding: 0 0.55rem;
    border: 0.0625rem solid var(--line);
    border-radius: 99rem;
    background: var(--sunken);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .hidden-mark :global(svg) {
    width: 0.875rem;
    height: 0.875rem;
  }

  .hide {
    justify-self: start;
    font-size: 0.8125rem;
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .hidden .body,
    .hidden .title {
      transition: none;
    }
  }

  .head :global(.controls) {
    flex: none;
  }

  .head {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 2rem;
  }

  .title {
    margin-right: auto;
    min-width: 0;
    font-size: 0.875rem;
  }

  .title code {
    font-weight: 600;
  }

  textarea {
    min-height: 2.25rem;
    field-sizing: content;
    resize: none;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .required {
    color: var(--danger);
  }

  .note {
    margin: 0;
    font-size: 0.8125rem;
  }
</style>
