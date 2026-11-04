<!-- @component
Видео YouTube или Vimeo в тексте страницы: плеер по ссылке на ролик. YouTube — с youtube-nocookie.com, без
cookie до запуска. Другая ссылка остаётся ссылкой.
-->
<script lang="ts">
let {
  /** Ссылка на ролик: youtube.com, youtu.be или vimeo.com */
  url,
  /** Название ролика для читалок */
  title = '',
}: {
  url: string;
  title?: string;
} = $props();

// Адрес плеера по ссылке на ролик; null — это не YouTube и не Vimeo.
const player = $derived(
  ((youtube, vimeo) =>
    youtube
      ? `https://www.youtube-nocookie.com/embed/${youtube[1]}`
      : vimeo
        ? `https://player.vimeo.com/video/${vimeo[1]}`
        : null)(
    /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,20})/.exec(
      url
    ),
    /^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{3,12})/.exec(
      url
    )
  )
);
</script>

{#if player}
  <div class="video">
    <iframe
      src={player}
      title={title || url}
      loading="lazy"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    ></iframe>
  </div>
{:else if url}
  <p><a href={url}>{title || url}</a></p>
{/if}

<style>
  .video {
    margin: 1.5em 0;
    aspect-ratio: 16 / 9;
  }

  iframe {
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0.25rem;
  }
</style>
