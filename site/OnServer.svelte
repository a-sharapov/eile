<!-- @component
Сайт на сервере: шесть коротких пунктов о том, как он ставится, обновляется, переезжает и живёт там.
Замер, на который опирается заголовок раздела, стоит выше — прямо под шкалой скорости.
-->
<script lang="ts">
import Rich from '$components/Rich';
import { site } from '$core';

const t = site().i18n;

const facts = [
  [t.srvInstall, t.srvInstallText],
  [t.srvUpdate, t.srvUpdateText],
  [t.srvHealth, t.srvHealthText],
  [t.srvOffsite, t.srvOffsiteText],
  [t.srvMove, t.srvMoveText],
  [t.srvWindows, t.srvWindowsText],
];
</script>

<dl class="server">
  {#each facts as { 0: term, 1: text }}
    <div>
      <dt>{term}</dt>
      <dd><Rich {text} /></dd>
    </div>
  {/each}
</dl>

<style>
  .server {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2.25rem 2.5rem;
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
  }

  .server div {
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  dt {
    font: 600 1.0625rem/1.35 var(--sans);
  }

  dd {
    margin: 0.4rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  @media (max-width: 56rem) {
    .server {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 34rem) {
    .server {
      grid-template-columns: minmax(0, 1fr);
      gap: 1.5rem;
    }
  }
</style>
