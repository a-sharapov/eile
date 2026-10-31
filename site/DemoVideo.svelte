<!-- @component
Ролик вместо скриншота: кнопка поверх снимка, по нажатию на его месте играет видео со звуком. Без JS
кнопка открывает файл ролика. Остров: тексты приходят через props.
-->
<script lang="ts">
let {
  src = '',
  label = '',
  close = '',
  title = '',
}: { src?: string; label?: string; close?: string; title?: string } = $props();

let playing = $state(false);
let video = $state<HTMLVideoElement>();

const start = (event: MouseEvent) => {
  event.preventDefault();
  playing = true;
};

// Нажатие уже было: браузер разрешает видео со звуком.
$effect(() => void (playing && video?.play().catch(() => undefined)));
</script>

{#if playing}
  <div class="player">
    <video bind:this={video} {src} controls autoplay playsinline preload="auto" aria-label={title}></video>
    <button type="button" class="close" aria-label={close} title={close} onclick={() => (playing = false)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  </div>
{:else}
  <a class="play" href={src} onclick={start}>
    <span class="disc" aria-hidden="true">
      <!-- Треугольник сдвинут вправо в самом контуре: на глаз по центру он, когда центр тяжести чуть левее
           середины круга, а не когда середина его рамки. -->
      <svg viewBox="0 0 24 24"><path d="M7.6 4.8v14.4L20 12Z" /></svg>
    </span>
    <span class="label">{label}</span>
  </a>
{/if}

<style>
  .play,
  .player {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-l);
  }

  .play {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.9rem;
    color: var(--text);
    text-decoration: none;
    background: radial-gradient(closest-side, rgb(16 22 32 / 0.16), transparent);
    transition: background 200ms var(--ease);
  }

  .disc {
    display: grid;
    place-items: center;
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    background: var(--fill);
    color: var(--on-fill);
    box-shadow:
      0 0 0 0.5rem color-mix(in oklab, var(--fill) 18%, transparent),
      0 1.25rem 2.5rem -0.75rem rgb(16 36 72 / 0.5);
    transition: transform 220ms var(--ease);
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
    box-shadow: 0 0.5rem 1.5rem -0.75rem rgb(16 28 48 / 0.35);
  }

  .play:hover .disc,
  .play:focus-visible .disc {
    transform: scale(1.06);
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
    box-shadow: var(--shadow-shot);
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
