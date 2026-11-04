<!-- @component
Eile рядом с WordPress: шесть тем в таблице, где сильнее WordPress и где Eile пока уступает, источники.
Строка темы — перевод «тема :: WordPress :: Eile», разметка в тексте — как у Rich; источники — `vsSources`
через «|», в строке «название :: адрес».
-->
<script lang="ts">
import Icon from '$components/Icon';
import Rich from '$components/Rich';
import { site } from '$core';

const t = site().i18n;

const _split = (raw: string, size: number): string[][] =>
  raw
    .split('|')
    .map((_) => _.split('::').map((part) => part.trim()))
    .filter((_) => _.length === size && _[0]);

const rows = [
  t.vsStack,
  t.vsBuilt,
  t.vsUpdates,
  t.vsSurface,
  t.vsPrivacy,
  t.vsMove,
]
  .map((_) => _split(_, 3)[0])
  .filter(Boolean) as string[][];
const strong = _split(t.vsStrong, 2);
const limits = _split(t.vsLimits, 2);
const sources = _split(t.vsSources, 2);
</script>

<div class="vs">
  <div class="table" role="table" aria-label={t.vsAria}>
    <div class="head" role="row">
      <span class="topic-head" role="columnheader">{t.vsTopic}</span>
      <span role="columnheader">WordPress</span>
      <span class="eile" role="columnheader">Eile</span>
    </div>
    {#each rows as { 0: topic, 1: wordpress, 2: eile }}
      <div class="row" role="row">
        <div class="topic" role="rowheader"><h3>{topic}</h3></div>
        <div class="cell" role="cell">
          <span class="who" aria-hidden="true">WordPress</span>
          <p><Rich text={wordpress} anchor="wp-source" refLabel={t.vsSourceRef} /></p>
        </div>
        <div class="cell" role="cell">
          <span class="who eile" aria-hidden="true">Eile</span>
          <p><Rich text={eile} anchor="wp-source" refLabel={t.vsSourceRef} /></p>
        </div>
      </div>
    {/each}
  </div>
  <p class="evo"><Rich text={t.vsEvo} /></p>

  <div class="sides">
    <section class="side wp">
      <h3>{t.vsStrongTitle}</h3>
      <dl>
        {#each strong as { 0: term, 1: text }}
          <div>
            <dt>{term}</dt>
            <dd><Rich {text} anchor="wp-source" refLabel={t.vsSourceRef} /></dd>
          </div>
        {/each}
      </dl>
    </section>
    <section class="side ours">
      <h3>{t.vsLimitsTitle}</h3>
      <dl>
        {#each limits as { 0: term, 1: text }}
          <div>
            <dt>{term}</dt>
            <dd><Rich {text} anchor="wp-source" refLabel={t.vsSourceRef} /></dd>
          </div>
        {/each}
      </dl>
    </section>
  </div>

  <section class="sources" aria-labelledby="wp-sources">
    <h3 id="wp-sources">{t.vsSourcesTitle}</h3>
    <ol>
      {#each sources as { 0: title, 1: href }, index}
        <li id={`wp-source-${index + 1}`}>
          <a {href}>{title}</a>
          <a class="back" href={`#wp-source-ref-${index + 1}`} aria-label={t.vsSourceBack} title={t.vsSourceBack}
            ><Icon name="arrow" /></a
          >
        </li>
      {/each}
    </ol>
    <p>{t.vsChecked}</p>
  </section>
</div>

<style>
  .vs {
    width: min(100% - 2 * var(--gutter), var(--wide));
    margin: 3rem auto 0;
  }

  .table {
    border-top: 1px solid var(--line-strong);
  }

  .head,
  .row {
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
  }

  .head {
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    font: 650 1.125rem/1.3 var(--display);
    letter-spacing: -0.015em;
  }

  .topic-head {
    color: var(--muted);
    font: 600 0.8125rem/1.9 var(--sans);
    letter-spacing: normal;
  }

  .eile {
    color: var(--accent);
  }

  .row {
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--line);
  }

  h3 {
    margin: 0;
    font: 650 1.125rem/1.3 var(--display);
    letter-spacing: -0.015em;
  }

  .who {
    display: none;
  }

  .cell p {
    margin: 0;
    color: var(--text);
    font-size: 0.9375rem;
    line-height: 1.55;
    text-wrap: pretty;
  }

  .evo {
    margin: 1.25rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .sides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 3rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    overflow: hidden;
  }

  .side {
    padding: clamp(1.5rem, 1rem + 2vw, 2.75rem);
  }

  .wp {
    border-right: 1px solid var(--line);
    background: var(--bg);
  }

  .ours {
    background: var(--raised);
  }

  .side h3 {
    font-size: 1.375rem;
    letter-spacing: -0.02em;
  }

  .side dl {
    display: grid;
    margin: 1.25rem 0 0;
  }

  .side dl div {
    padding: 0.9rem 0;
    border-top: 1px solid var(--line-strong);
  }

  .ours dl div {
    border-top-color: var(--line);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .sources {
    margin-top: 2rem;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .sources h3 {
    color: var(--text);
    font: 600 0.875rem/1.3 var(--sans);
    letter-spacing: normal;
  }

  .sources ol {
    columns: 2 20rem;
    column-gap: 2.5rem;
    margin: 0.75rem 0 0;
    padding-left: 1.5rem;
  }

  .sources li {
    padding: 0.15rem 0;
    break-inside: avoid;
    scroll-margin-top: 6rem;
  }

  .sources li::marker {
    font-family: var(--mono);
  }

  .sources li:target {
    color: var(--text);
  }

  .sources a {
    color: inherit;
    overflow-wrap: anywhere;
  }

  .sources .back {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    margin-left: 0.25rem;
    vertical-align: middle;
    border-radius: var(--radius-pill-code);
    text-decoration: none;
  }

  .sources .back :global(.icon) {
    rotate: -90deg;
  }

  .sources a:hover {
    color: var(--text);
  }

  .sources p {
    margin: 0.75rem 0 0;
  }

  /* 52–70rem: трём колонкам тесно, тема встаёт строкой над парой «WordPress — Eile». */
  @media (max-width: 70rem) {
    .head,
    .row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.6rem 2rem;
    }

    .topic-head {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .head {
      position: relative;
    }

    .topic {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 52rem) {
    .head {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.85rem;
      padding: 1.5rem 0;
    }

    .who {
      display: block;
      margin-bottom: 0.2rem;
      color: var(--muted);
      font: 600 0.8125rem/1.3 var(--sans);
    }

    .who.eile {
      color: var(--accent);
    }

    .sides {
      grid-template-columns: 1fr;
    }

    .wp {
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
  }
</style>
