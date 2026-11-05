<!-- Главная ветки языка: заголовок, установка и менеджер на первом экране, дальше — блоки из текста. -->
<script lang="ts">
import Install from '$components/Install';
import Layout from '$components/Layout';
import Shot from '$components/Shot';
import Window from '$components/Window';
import { media, site } from '$core';
import Content from '$core/Content';
import Island from '$core/Island';

let { page } = $props();
const t = site().i18n;
// Ролик есть не на каждом языке: нет файла — нет и кнопки. WebM и кадр-заставка — по желанию.
const lang = page.language || 'ru';
const video = media(`video/howto-${lang}.mp4`);
const webm = media(`video/howto-${lang}.webm`);
const poster = media(`video/howto-${lang}.webp`);
// Обе главные показывают менеджер на своём языке над сайтом студии из кукбука.
const en = page.language === 'en';

// Однобуквенное слово («в», «и», «a») не остаётся в конце строки: пробел после него неразрывный.
const _glue = (_: string): string =>
  _.replace(/(?<=^|[\s(«„])(\p{L})\s/gu, '$1\u00a0');
</script>

<Layout {page}>
  <section class="hero">
    <p class="kicker">{t.heroKicker}</p>
    <h1>{_glue(page.longTitle || page.title)}</h1>
    {#if page.introText}<p class="lead">{_glue(page.introText)}</p>{/if}
    <Install />
  </section>
  <div class="stage">
    <figure class="frame">
      <Window title={t.winManager}>
        <div class="screen">
          <Shot name={en ? 'editor-en' : 'editor-ru'} alt={t.shotEditor} eager />
          {#if video}
            <Island
              name="DemoVideo"
              props={{
                src: video,
                webm: webm ?? '',
                poster: poster ?? '',
                label: t.demoPlay,
                close: t.demoClose,
                title: t.demoTitle,
              }}
            />
          {/if}
        </div>
      </Window>
    </figure>
  </div>
  <div class="blocks"><Content of={page} /></div>
</Layout>

<style>
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    width: min(100% - 2 * var(--gutter), 64rem);
    margin: 0 auto;
    padding: clamp(3rem, 1.5rem + 4vw, 5rem) 0 clamp(2.5rem, 1.5rem + 2.5vw, 3.75rem);
    text-align: center;
  }

  .kicker {
    margin: 0 0 1rem;
    color: var(--accent);
    font: 650 0.8125rem/1 var(--sans);
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 14ch;
    margin: 0;
    font: 700 clamp(2.75rem, 1.5rem + 4.6vw, 5rem) / 1 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.035em;
    text-wrap: balance;
    /* Крупный текст в узком окне: длинное слово переносится, а не раздвигает страницу. */
    overflow-wrap: anywhere;
  }

  .lead {
    max-width: 40rem;
    margin: 1.25rem 0 2rem;
    color: var(--muted);
    font-size: clamp(1.125rem, 1rem + 0.45vw, 1.3125rem);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .stage {
    position: relative;
    padding: 0 var(--gutter);
  }

  /* Нижняя половина скриншота лежит на фоне: он стоит на странице, а не висит в воздухе. */
  .stage::before {
    content: '';
    position: absolute;
    inset: 42% 0 0;
    border-block: 1px solid var(--line);
    background: var(--bg);
  }

  .screen {
    position: relative;
  }

  /* Пока играет ролик, рамка принимает его пропорции 16:9: без полос по краям, и на телефоне вместо высокого кадра. */
  .screen:has(:global(.player)) {
    aspect-ratio: 16 / 9;
  }

  .screen:has(:global(.player)) :global(.shot) {
    display: none;
  }

  .frame {
    position: relative;
    max-width: var(--wide);
    margin: 0 auto;
    padding-bottom: clamp(2rem, 4vw, 4rem);
    animation: rise 1100ms var(--ease) 120ms both;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(2.5rem) scale(0.985);
      filter: blur(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .frame {
      animation: none;
    }
  }

  .blocks {
    padding-bottom: 2rem;
  }

  /* Текстовые блоки — заголовок раздела и вводный абзац над компонентом. */
  .blocks > :global(h2) {
    width: min(100% - 2 * var(--gutter), var(--wide));
    max-width: none;
    margin: clamp(6rem, 3rem + 7vw, 10rem) auto 0;
    font: 650 clamp(2rem, 1.3rem + 2.6vw, 3.375rem) / 1.04 var(--display);
    font-variation-settings: 'SHRP' 100;
    letter-spacing: -0.032em;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  /* Абзац держит строку читаемой длины, но стоит у левого края широкой колонки. */
  .blocks > :global(p) {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 1.25rem auto 0;
    padding-right: max(0px, calc(min(100% - 2 * var(--gutter), var(--wide)) - 42rem));
    color: var(--muted);
    font-size: clamp(1.0625rem, 1rem + 0.3vw, 1.25rem);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .blocks > :global(p) :global(code) {
    padding: 0.1em 0.35em;
    border-radius: 0.3em;
    background: var(--bg);
    color: var(--text);
  }
</style>
