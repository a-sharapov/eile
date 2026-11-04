<!-- @component
Снимок в главе кукбука: экран менеджера или сайта из примера кукбука, из медиатеки (`screens/cook-<имя>-light.webp` и
`-dark.webp`) с подписью. Пока снимка нет, ничего не выводит.
-->
<script lang="ts">
import Shot from '$components/Shot';
import { image, site } from '$core';

let {
  /** Имя снимка: setup, manager, tree… */
  name = '',
  /** Подпись под снимком; она же описание для читалки экрана */
  caption = '',
}: { name?: string; caption?: string } = $props();

const found = image(`screens/cook-${name}-light.webp`);
// У экранов менеджера есть тёмный снимок, у страниц сайта студии — нет: по нему и заголовок окна.
const manager = Boolean(image(`screens/cook-${name}-dark.webp`));
const t = site().i18n;
const title = manager ? t.winManager : t.winStudio;
</script>

{#if found}
  <figure class="cook-shot">
    <Shot
      name={`cook-${name}`}
      alt={caption}
      {title}
      sizes="(min-width: 64rem) 44rem, calc(94vw - 1rem)"
    />
    {#if caption}<figcaption>{caption}</figcaption>{/if}
  </figure>
{/if}

<style>
  .cook-shot {
    margin: 2rem 0;
  }

  figcaption {
    max-width: 60ch;
    margin: 0.75rem auto 0;
    color: var(--muted);
    font-size: 0.875rem;
    line-height: 1.45;
    text-align: center;
  }
</style>
