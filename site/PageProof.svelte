<!-- Остров: замер этой самой страницы в браузере посетителя — вес HTML, вес скриптов и время ответа. -->
<script lang="ts">
import { onMount } from 'svelte';

let {
  lead,
  note,
  html,
  js,
  reply,
  kb,
  ms,
  locale = 'ru',
}: {
  lead: string;
  note: string;
  html: string;
  js: string;
  reply: string;
  kb: string;
  ms: string;
  locale?: string;
} = $props();

let numbers = $state<{ html: string; js: string; reply: string } | null>(null);

const _kb = (bytes: number): string =>
  `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} ${kb}`;

onMount(() => {
  const page = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  const scripts = (
    performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  ).filter((_) => new URL(_.name).pathname.endsWith('.js'));
  numbers = page
    ? {
        html: _kb(page.encodedBodySize || page.transferSize),
        js: _kb(scripts.reduce((sum, _) => sum + (_.encodedBodySize || 0), 0)),
        reply: `${Math.max(1, Math.round(page.responseStart - page.requestStart))} ${ms}`,
      }
    : null;
});
</script>

<section class="proof" aria-live="polite">
  <p class="title">
    <span class="pulse" aria-hidden="true"></span>
    <span><b>{lead}</b> {note}</span>
  </p>
  <dl>
    <div><dt>{html}</dt><dd>{numbers?.html ?? '…'}</dd></div>
    <div><dt>{js}</dt><dd>{numbers?.js ?? '…'}</dd></div>
    <div><dt>{reply}</dt><dd>{numbers?.reply ?? '…'}</dd></div>
  </dl>
</section>

<style>
  .proof {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 1.25rem 2.5rem;
    align-items: center;
    margin-top: 1.25rem;
    padding: 1.4rem clamp(1.25rem, 0.5rem + 3vw, 3.5rem);
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--raised);
  }

  .title {
    display: flex;
    gap: 0.75rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.9375rem;
    line-height: 1.45;
  }

  .title b {
    display: block;
    color: var(--text);
    font-size: 1rem;
  }

  .pulse {
    flex: none;
    width: 0.6rem;
    height: 0.6rem;
    margin-top: 0.4rem;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0 0.25rem color-mix(in oklab, var(--ok) 20%, transparent);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.5rem;
    margin: 0;
  }

  dl div {
    padding-left: 1.25rem;
    border-left: 1px solid var(--line);
  }

  dt {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  dd {
    margin: 0.2rem 0 0;
    color: var(--text);
    font: 650 1.5rem/1.2 var(--display);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 52rem) {
    .proof {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 34rem) {
    dl {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.85rem;
    }
  }
</style>
