<script lang="ts">
import { aiScope, componentFacts, facts } from '#lib/ai.svelte.ts';
import type { SourcePoint } from '#lib/api.ts';
import { api, isApiError } from '#lib/api.ts';
import { catalog, loadCatalog } from '#lib/components.svelte.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { elements, loadElements } from '#lib/elements.svelte.ts';
import { fields } from '#lib/fields.svelte.ts';
import { pageRef, places } from '#lib/format.ts';
import { guardUnsaved } from '#lib/guard.svelte.ts';
import { t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describeSource, failed, notify } from '#lib/notices.svelte.ts';
import type { Element, Usage } from '#lib/types.ts';
import CodeEditor from '#lib/ui/CodeEditor.svelte';
import EdgeState from '#lib/ui/EdgeState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import SourceError from '#lib/ui/SourceError.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

let element = $state<Element | null>(null);
let source = $state('');
let error = $state<{ text: string; at?: SourcePoint } | null>(null);
let busy = $state(false);
let missing = $state(false);

const path = $derived(`/elements/${page.params.kind}/${page.params.name}`);
const dirty = $derived(element !== null && source !== element.source);

guardUnsaved(() => dirty && !busy);

// Ошибка относилась к несохранённой правке: вернули сохранённый код — ошибка больше не к месту.
$effect(() => void (!dirty && (error = null)));

$effect(() => {
  void api
    .get<Element>(path)
    .then(
      (_) => (
        (element = _), (source = _.source), (error = null), (missing = false)
      )
    )
    .then(undefined, (_) =>
      isApiError(_) && _.status === 404 ? void (missing = true) : failed(_)
    );
});

// Сохранённый компонент меняет каталог блоков: редактор контента должен увидеть новые параметры.
// «Строка N» ведёт к ошибке: строка — в середину экрана, фокус — в код, курсор уже на месте.
const revealProblem = () => (
  document
    .querySelector('.code .cm-problem-line')
    ?.scrollIntoView({ block: 'center' }),
  document.querySelector<HTMLElement>('.code .cm-content')?.focus({
    preventScroll: true,
  })
);

const save = () =>
  dirty && !busy
    ? ((busy = true),
      api
        .send<Element>('PUT', path, { source })
        .then(
          (_) => (
            (element = _),
            (error = null),
            notify(t('elements.saved', { n: _.revision })),
            loadElements(),
            void (_.kind === 'component' && loadCatalog(true))
          )
        )
        .then(undefined, (_: Error) => void (error = describeSource(_)))
        .finally(() => (busy = false)))
    : undefined;

// Где используется; если держат только страницы из корзины — подсказываем, как освободить элемент.
const _inUse = (usage: Usage): string =>
  `${t('elements.inUse')} ${places([...usage.elements, ...usage.pages.map(pageRef)])}.${
    usage.elements.length === 0 && usage.pages.every((_) => _.trashed)
      ? ` ${t('elements.inUseTrash')}`
      : ''
  }`;

// Ошибка «используется» ведёт к первому месту: страница или элемент, который держит удаляемый.
const _openFirst = (usage: Usage) =>
  ((href) =>
    href
      ? { label: t('elements.openPlace'), run: () => goto(href) }
      : undefined)(
    usage.pages[0]
      ? resolve('/(app)/pages/[id]', { id: String(usage.pages[0].id) })
      : usage.elements[0]
        ? resolve('/(app)/elements/[kind]/[name]', {
            kind: 'component',
            name: usage.elements[0],
          })
        : null
  );

const deleted = () => (
  notify(t('elements.removed')),
  loadElements(),
  loadCatalog(true),
  goto(resolve('/(app)/elements'))
);

// Договор шаблона перед глазами: какие поля на него назначены и сколько страниц на нём живёт —
// чтобы не идти за этим в другие разделы и не узнавать об использовании только при удалении.
let usage = $state<Usage | null>(null);

$effect(
  () =>
    void api
      .get<Usage>(`${path}/usage`)
      .then((_) => (usage = _))
      .then(undefined, () => (usage = null))
);

const templateFields = $derived(
  page.params.kind === 'template'
    ? fields.items.filter((_) => _.templates.includes(page.params.name ?? ''))
    : []
);

const kindOf = (name: string): 'template' | 'component' =>
  elements.items.find((_) => _.name === name)?.kind ?? 'template';

const livePages = $derived(usage?.pages.filter((_) => !_.trashed).length ?? 0);

// ИИ знает, что за файл, какие компоненты есть на сайте и какие поля у шаблона.
$effect(() => void loadCatalog().then(undefined, () => undefined));

$effect(() =>
  aiScope({
    area: t(
      page.params.kind === 'template'
        ? 'aiFacts.templateArea'
        : 'aiFacts.componentArea',
      { name: page.params.name ?? '' }
    ),
    facts: facts([
      componentFacts(
        (catalog.items ?? []).filter((_) => _.name !== page.params.name)
      ),
      page.params.kind === 'template' &&
        t('aiFacts.fields', {
          list:
            templateFields
              .map((_) => `page.fields.${_.name} (${_.label}, ${_.type})`)
              .join(', ') || t('aiFacts.none'),
        }),
      usage &&
        t(
          page.params.kind === 'template'
            ? 'aiFacts.templatePages'
            : 'aiFacts.componentPages',
          { n: livePages }
        ),
    ]),
  })
);

// Удалить можно только то, что нигде не используется: иначе сломаются страницы.
const remove = () =>
  api
    .get<Usage>(`${path}/usage`)
    .then((usage) =>
      usage.pages.length + usage.elements.length > 0
        ? notify(_inUse(usage), 'error', _openFirst(usage))
        : ask({
            title: t('elements.removeTitle'),
            body: t('elements.removeBody'),
            items: [page.params.name ?? ''],
            confirm: t('elements.remove'),
            tone: 'danger',
          }).then(
            (confirmed): unknown =>
              confirmed &&
              ((busy = true),
              api
                .send('DELETE', path)
                .then(deleted)
                .finally(() => (busy = false)))
          )
    )
    .then(undefined, failed);
</script>

<svelte:head><title>{page.params.name} — {t('nav.elements')} — {t('app.name')}</title></svelte:head>

{#snippet meta()}
  <span>{t(page.params.kind === 'template' ? 'elements.template' : 'elements.component')}</span>
  {#if element}<span class="revision">{t('elements.revision')} {element.revision}</span>{/if}
{/snippet}

{#snippet actions()}
  {#if element}
    <button type="button" class="icon danger" aria-label={`${t('elements.remove')}: ${page.params.name}`} title={t('elements.remove')} onclick={remove}>{@html icons.trash}</button>
  {/if}
  <button type="button" class="primary" aria-disabled={busy || !dirty} title={dirty ? t('common.unsaved') : undefined} onclick={save}>
    {#if dirty}<span class="dirty" aria-hidden="true"></span>{/if}{t('elements.save')}{#if dirty}<span class="sr-only">: {t('common.unsaved')}</span>{/if}
  </button>
{/snippet}

<PageHeader
  title={page.params.name ?? ''}
  crumbs={[
    { label: t('nav.elements'), href: resolve('/(app)/elements') },
    { label: t(page.params.kind === 'template' ? 'elements.templates' : 'elements.components') },
  ]}
  {meta}
  {actions}
/>
<!-- Подсказка — под заголовком, как у плагинов: в строке холстины ей тесно. -->
<p class="muted hint">{t('elements.hint')}</p>
{#if element}
  <div class="contract">
    {#if page.params.kind === 'template'}
      <p>
        <span class="muted">{t('elements.templateFields')}:</span>
        {#each templateFields as field (field.name)}<a class="code" href={`${resolve('/(app)/fields')}?name=${field.name}`}>page.fields.{field.name}</a>{:else}<span class="muted">{t('elements.noFields')}</span>{/each}
      </p>
    {/if}
    {#if usage}
      <p>
        <span class="muted">{t('elements.usedOn')}:</span>
        <span>{tn('elements.pagesShort', livePages)}</span>
        {#if usage.elements.length > 0}<span class="muted">·</span> {#each usage.elements as name (name)}<a class="code" href={resolve('/(app)/elements/[kind]/[name]', { kind: kindOf(name), name })}>{name}</a>{/each}{/if}
      </p>
    {/if}
    {#if page.params.kind === 'template'}
      <details class="cheat">
        <summary>{t('elements.cheatTitle')}</summary>
        <dl>
          <dt><code>{'{page.title}'}</code>, <code>{'{page.longTitle}'}</code>, <code>{'{page.menuTitle}'}</code></dt><dd>{t('elements.cheatTitles')}</dd>
          <dt><code>{'{@html page.content}'}</code>, <code>{'{page.introText}'}</code>, <code>{'{page.description}'}</code></dt><dd>{t('elements.cheatContent')}</dd>
          <dt><code>{t('elements.cheatFieldsCode')}</code></dt><dd>{t('elements.cheatFields')}</dd>
          <dt><code>{'{site.name}'}</code>, <code>{t('elements.cheatCustomCode')}</code>, <code>{t('elements.cheatI18nCode')}</code></dt><dd>{t('elements.cheatSite')}</dd>
          <dt><code>import Menu from '$components/Menu'</code></dt><dd>{t('elements.cheatComponents')}</dd>
        </dl>
      </details>
    {/if}
  </div>
{/if}
{#if error}<SourceError {error} onreveal={revealProblem} />{/if}
{#if missing}
  <EdgeState kind="missing" heading="h2" title={t('edge.elementMissingTitle')} text={t('edge.elementMissingText')}>
    {#snippet actions()}
      <a class="button primary" href={resolve('/(app)/elements')}>{t('nav.elements')}</a>
    {/snippet}
  </EdgeState>
{:else if element}
  {#key path}
    <div class="code"><CodeEditor bind:value={source} onsave={save} ai={{ kind: page.params.kind === 'template' ? 'template' : 'component', label: `${t(page.params.kind === 'template' ? 'elements.template' : 'elements.component')} ${page.params.name}` }} label={`${t('elements.code')}: ${page.params.name}`} problem={error?.at ?? null} /></div>
  {/key}
{/if}

<style>
  /* Договор шаблона: строки-ссылки и шпаргалка по тому, что приходит в шаблон. */
  .contract {
    display: grid;
    gap: 0.35rem;
    margin: -0.25rem 0 1rem;
    font-size: 0.8125rem;
  }

  .contract p {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.6rem;
    align-items: baseline;
    margin: 0;
  }

  .contract a {
    font-size: 0.75rem;
  }

  .cheat summary {
    width: fit-content;
    color: var(--accent);
    cursor: pointer;
  }

  .cheat dl {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    gap: 0.35rem 1rem;
    margin: 0.5rem 0 0;
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    background: var(--sunken);
  }

  .cheat dt {
    font-weight: 400;
  }

  .cheat dd {
    margin: 0;
    color: var(--muted);
  }

  @media (width < 48rem) {
    .cheat dl {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .hint {
    margin: -0.5rem 0 1rem;
    font-size: 0.875rem;
  }

  .dirty {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--mark);
  }

  .revision {
    font-family: var(--mono);
  }

  /* Редактор кода — на всю оставшуюся высоту окна. */
  /* div: «code» у ссылок договора — только моноширинный шрифт, высота — у блока редактора. */
  div.code {
    height: max(24rem, calc(100dvh - 9.5rem));
  }
</style>
