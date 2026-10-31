<script module lang="ts">
// Знак входит один раз: переход между входом, сбросом пароля и настройкой его не повторяет.
let swept = $state(false);
</script>

<script lang="ts">
import type { Snippet } from 'svelte';
import { MediaQuery } from 'svelte/reactivity';
import {
  appearance,
  pickLanguage,
  pickScheme,
} from '#lib/appearance.svelte.ts';
import { t } from '#lib/i18n.ts';
import { icons, logo } from '#lib/icons.ts';
import { session } from '#lib/session.svelte.ts';
import LanguageSelect from './LanguageSelect.svelte';

let { title, children }: { title: string; children: Snippet } = $props();

const _LICENSE = 'GPL-3.0-or-later';
const systemDark = new MediaQuery('(prefers-color-scheme: dark)');
const dark = $derived(
  appearance.current.scheme === 'dark' ||
    (appearance.current.scheme === 'system' && systemDark.current)
);
// Куда входишь; если сайт назван как программа, это уже сказал знак.
const site = $derived(
  session.site.name === t('app.name') ? '' : session.site.name
);
</script>

<!-- Вход и первичная настройка: знак, форма на холстине по центру, внизу — версия и лицензия. -->
<div class="auth">
  <div class="corner">
    <LanguageSelect onpick={pickLanguage} />
    <button type="button" class="ghost theme" aria-label={t(dark ? 'auth.toLight' : 'auth.toDark')} title={t(dark ? 'auth.toLight' : 'auth.toDark')} onclick={() => pickScheme(dark ? 'light' : 'dark')}>
      {@html dark ? icons.sun : icons.moon}
    </button>
  </div>
  <main>
    <span class="logo" class:still={swept} role="img" aria-label={t('app.name')} onanimationend={() => (swept = true)}>{@html logo}</span>
    <section class="panel" aria-labelledby="auth-title">
      <header>
        <h1 id="auth-title">{title}</h1>
        {#if site}<p class="site" title={site}>{site}</p>{/if}
      </header>
      {@render children()}
    </section>
  </main>
  <footer>
    <span>{t('app.name')}{#if session.version}&nbsp;{session.version}{/if}</span>
    <span aria-hidden="true">·</span>
    <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer" title={t('auth.license')}>{_LICENSE}</a>
  </footer>
</div>

<style>
  /* Фон менеджера: за формой — мягкий свет (в тёмной схеме он дал бы полосы), у верхнего края — тон акцента. */
  .auth {
    display: grid;
    grid-template-rows: 1fr auto;
    min-height: 100dvh;
    background:
      radial-gradient(
        44rem 30rem at 50% 42%,
        light-dark(oklch(99.5% 0.004 var(--hue) / 0.9), transparent),
        transparent 70%
      ),
      radial-gradient(
        90rem 26rem at 50% -12rem,
        light-dark(
          color-mix(in oklch, var(--accent) 14%, transparent),
          color-mix(in oklch, var(--accent) 20%, transparent)
        ),
        transparent 75%
      ),
      var(--bg);
  }

  /* Язык и схема — в углу: их меняют до входа, но не ради них сюда пришли. */
  .corner {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .theme {
    width: var(--control);
    padding: 0;
  }

  .theme :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  main {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 2.25rem;
    padding: 5rem 1rem 2rem;
  }

  /* Знак входит одним движением слева направо — как и написан. */
  .logo {
    display: block;
    height: 2rem;
    color: var(--accent);
    animation: sweep 720ms cubic-bezier(0.16, 1, 0.3, 1) 80ms backwards;
  }

  .logo :global(svg) {
    display: block;
    width: auto;
    height: 100%;
  }

  @keyframes sweep {
    from {
      clip-path: inset(0 100% 0 0);
      translate: -0.5rem 0;
    }
  }

  /* Холстина формы: та же поверхность и волосяная рамка, что у рабочей холстины, тень — глубже и мягче. */
  .panel {
    display: grid;
    gap: 1.5rem;
    width: min(100%, 22.5rem);
    padding: 1.75rem;
    border: 0.0625rem solid var(--line);
    border-radius: 1.25rem;
    background: var(--surface);
    box-shadow:
      inset 0 0.0625rem 0 light-dark(transparent, oklch(100% 0 0 / 0.05)),
      0 0.0625rem 0.125rem oklch(20% 0.02 var(--hue) / 0.05),
      0 0.75rem 2rem -0.5rem
        light-dark(oklch(20% 0.04 var(--hue) / 0.12), oklch(8% 0.02 var(--hue) / 0.5)),
      0 2rem 4rem -1.5rem
        light-dark(oklch(20% 0.05 var(--hue) / 0.12), oklch(8% 0.02 var(--hue) / 0.4));
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }

  .site {
    overflow: hidden;
    max-width: 100%;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem 0.625rem;
    padding: 1.5rem 1rem 1.75rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  footer a {
    color: inherit;
    text-decoration: none;
  }

  footer a:hover {
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  @media (width < 30rem) {
    main {
      align-content: start;
      gap: 1.75rem;
      padding-top: 4.5rem;
    }

    .panel {
      padding: 1.5rem 1.25rem;
      border-radius: 1rem;
    }
  }

  .logo.still {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .logo {
      animation: none;
    }
  }
</style>
