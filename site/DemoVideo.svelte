<!-- @component
Ролик вместо скриншота: кнопка поверх снимка, по нажатию на его месте играет видео со звуком. Без JS
кнопка открывает файл ролика. Остров: тексты и файлы приходят через props — MP4, по желанию WebM и
кадр-заставка. Фокус уходит в плеер и возвращается на кнопку, Esc закрывает ролик.
-->
<script lang="ts">
import { tick } from 'svelte';

let {
  src = '',
  webm = '',
  poster = '',
  label = '',
  close = '',
  title = '',
}: {
  src?: string;
  webm?: string;
  poster?: string;
  label?: string;
  close?: string;
  title?: string;
} = $props();

let playing = $state(false);
let video = $state<HTMLVideoElement>();
let button = $state<HTMLAnchorElement>();

const start = (event: MouseEvent) => {
  event.preventDefault();
  playing = true;
};

const stop = () => {
  playing = false;
  void tick().then(() => button?.focus());
};

const closeOnEscape = (event: KeyboardEvent) =>
  void (playing && event.key === 'Escape' && stop());

// Нажатие уже было: браузер разрешает видео со звуком. Фокус — в плеер, чтобы клавиши управляли им.
$effect(
  () =>
    void (
      playing &&
      video &&
      (video.focus(), video.play().catch(() => undefined))
    )
);
</script>

<svelte:window onkeydown={closeOnEscape} />

{#if playing}
  <div class="player">
    <video
      bind:this={video}
      controls
      autoplay
      playsinline
      preload="auto"
      poster={poster || undefined}
      aria-label={title}
    >
      {#if webm}<source src={webm} type="video/webm" />{/if}
      <source {src} type="video/mp4" />
    </video>
    <button type="button" class="close" aria-label={close} title={close} onclick={stop}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  </div>
{:else}
  <a class="play" href={src} onclick={start} bind:this={button}>
    <span class="disc" aria-hidden="true">
      <!-- Треугольник сдвинут вправо в самом контуре: на глаз по центру он, когда центр тяжести чуть левее
           середины круга, а не когда середина его рамки. -->
      <svg viewBox="0 0 24 24"><path d="M7.6 4.8v14.4L20 12Z" /></svg>
    </span>
    <span class="label">{label}</span>
  </a>
{/if}

<style>
  /* Кнопка и плеер лежат в теле окна (Window): скругление и тень — у окна. */
  .play,
  .player {
    position: absolute;
    inset: 0;
  }

  .play {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.9rem;
    color: var(--text);
    text-decoration: none;
    background: radial-gradient(closest-side, rgb(16 22 32 / 0.16), transparent);
  }

  /* Кольцо, а не свечение и не тень: поднимается над страницей только снимок (DESIGN.md). */
  .disc {
    display: grid;
    place-items: center;
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    background: var(--fill);
    color: var(--on-fill);
    box-shadow: 0 0 0 0.5rem color-mix(in oklab, var(--fill) 18%, transparent);
    transition: background 160ms var(--ease);
  }

  .disc svg {
    display: block;
    width: 3rem;
    height: 3rem;
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .label {
    padding: 0.45rem 1rem;
    border: 1px solid var(--line);
    border-radius: 2rem;
    background: var(--raised);
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .play:hover .disc,
  .play:focus-visible .disc {
    background: var(--fill-hover);
  }

  .play:focus-visible {
    outline: none;
  }

  .play:focus-visible .disc {
    outline: 2px solid var(--fill);
    outline-offset: 0.75rem;
  }

  .player {
    overflow: hidden;
    background: #0b0d10;
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border: 0;
    border-radius: 50%;
    background: rgb(11 13 16 / 0.6);
    color: #fff;
    cursor: pointer;
  }

  .close svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .close:hover {
    background: rgb(11 13 16 / 0.85);
  }

  @media (prefers-reduced-motion: reduce) {
    .disc {
      transition: none;
    }
  }
</style>
