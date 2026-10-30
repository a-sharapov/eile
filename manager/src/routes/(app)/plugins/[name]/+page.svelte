<script lang="ts">
import { aiScope } from '#lib/ai.svelte.ts';
import type { SourcePoint } from '#lib/api.ts';
import { api, isApiError } from '#lib/api.ts';
import { ask } from '#lib/dialog.svelte.ts';
import { guardUnsaved } from '#lib/guard.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { describeSource, failed, notify } from '#lib/notices.svelte.ts';
import { loadPlugins } from '#lib/plugins.svelte.ts';
import type { Plugin } from '#lib/types.ts';
import CodeEditor from '#lib/ui/CodeEditor.svelte';
import EdgeState from '#lib/ui/EdgeState.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import SourceError from '#lib/ui/SourceError.svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

let plugin = $state<Plugin | null>(null);
let source = $state('');
let error = $state<{ text: string; at?: SourcePoint } | null>(null);
let busy = $state(false);
let missing = $state(false);

const path = $derived(`/plugins/${page.params.name}`);
const dirty = $derived(plugin !== null && source !== plugin.source);

guardUnsaved(() => dirty && !busy);

// Ошибка относилась к несохранённой правке: вернули сохранённый код — ошибка больше не к месту.
$effect(() => void (!dirty && (error = null)));

$effect(() => {
  void api
    .get<Plugin>(path)
    .then(
      (_) => (
        (plugin = _), (source = _.source), (error = null), (missing = false)
      )
    )
    .then(undefined, (_) =>
      isApiError(_) && _.status === 404 ? void (missing = true) : failed(_)
    );
});

const accept = (_: Plugin) => ((plugin = _), (error = null), loadPlugins());

// «Строка N» ведёт к ошибке: строка — в середину экрана, фокус — в код, курсор уже на месте.
const revealProblem = () => (
  document
    .querySelector('.code .cm-problem-line')
    ?.scrollIntoView({ block: 'center' }),
  document.querySelector<HTMLElement>('.code .cm-content')?.focus({
    preventScroll: true,
  })
);

$effect(() => aiScope({ area: `плагин «${page.params.name}»`, facts: [] }));

const save = () =>
  dirty && !busy
    ? ((busy = true),
      api
        .send<Plugin>('PUT', path, { source })
        .then(
          (_) => (notify(`${t('elements.saved')} ${_.revision}`), accept(_))
        )
        .then(undefined, (_: Error) => void (error = describeSource(_)))
        .finally(() => (busy = false)))
    : undefined;

const toggle = (enabled: boolean) =>
  api
    .send<Plugin>('PUT', path, { enabled })
    .then(
      (_) => (notify(t(_.enabled ? 'plugins.on' : 'plugins.off')), accept(_))
    )
    .then(undefined, failed);

const remove = () =>
  ask({
    title: t('plugins.removeTitle'),
    body: t('plugins.removeBody'),
    items: [page.params.name ?? ''],
    confirm: t('plugins.remove'),
    tone: 'danger',
  })
    .then(
      (confirmed): unknown =>
        confirmed &&
        ((busy = true),
        api
          .send('DELETE', path)
          .then(
            () => (
              notify(t('plugins.removed')),
              loadPlugins(),
              goto(resolve('/(app)/elements'))
            )
          )
          .finally(() => (busy = false)))
    )
    .then(undefined, failed);
</script>

<svelte:head><title>{page.params.name} — {t('nav.plugins')} — {t('app.name')}</title></svelte:head>

{#snippet meta()}
  <span>{t('plugins.one')}</span>
  {#if plugin}
    <span class="state" data-status={plugin.enabled ? 'published' : 'draft'}><i class="status-node" aria-hidden="true"></i>{t(plugin.enabled ? 'plugins.isOn' : 'plugins.isOff')}</span>
    <span class="revision">{t('elements.revision')} {plugin.revision}</span>
  {/if}
{/snippet}

{#snippet actions()}
  {#if plugin}
    <button type="button" title={t('plugins.enabledHint')} onclick={() => plugin && toggle(!plugin.enabled)}>{@html icons.plug}{t(plugin.enabled ? 'plugins.turnOff' : 'plugins.turnOn')}</button>
    <button type="button" class="icon danger" aria-label={`${t('plugins.remove')}: ${page.params.name}`} title={t('plugins.remove')} onclick={remove}>{@html icons.trash}</button>
  {/if}
  <button type="button" class="primary" aria-disabled={busy || !dirty} title={dirty ? t('common.unsaved') : undefined} onclick={save}>
    {#if dirty}<span class="dirty" aria-hidden="true"></span>{/if}{t('elements.save')}{#if dirty}<span class="sr-only">: {t('common.unsaved')}</span>{/if}
  </button>
{/snippet}

<PageHeader
  title={page.params.name ?? ''}
  crumbs={[{ label: t('nav.elements'), href: resolve('/(app)/elements') }, { label: t('plugins.title') }]}
  {meta}
  {actions}
/>
<p class="muted hint">{t('plugins.hint')}</p>
{#if error}<SourceError {error} onreveal={revealProblem} />{/if}
{#if missing}
  <EdgeState kind="missing" heading="h2" title={t('edge.elementMissingTitle')} text={t('edge.elementMissingText')}>
    {#snippet actions()}
      <a class="button primary" href={resolve('/(app)/elements')}>{t('nav.elements')}</a>
    {/snippet}
  </EdgeState>
{:else if plugin}
  {#key path}
    <div class="code"><CodeEditor bind:value={source} onsave={save} ai={{ kind: 'plugin', label: `${t('plugins.one')} ${page.params.name}` }} label={`${t('elements.code')}: ${page.params.name}`} language="typescript" problem={error?.at ?? null} /></div>
  {/key}
{/if}

<style>
  .state {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
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

  .hint {
    margin: -0.5rem 0 1rem;
    font-family: var(--mono);
    font-size: 0.8125rem;
    font-variant-ligatures: none;
  }

  .code {
    height: max(24rem, calc(100dvh - 11rem));
  }
</style>
