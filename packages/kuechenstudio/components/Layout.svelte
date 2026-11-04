<!-- @component
Rahmen jeder Seite des Küchenstudios: schmale Leiste mit Anschrift, Telefon und E-Mail, weiße Kopfzeile mit Logo oder Name, Menü und „Beratungstermin anfragen“, auf dem Telefon Anrufen und Termin unten im Daumenbereich, dunkler Fußbereich, Daten für Suchmaschinen (HomeGoodsStore) und der Chat-Knopf eines eingebundenen Dienstes. Hier liegen Farben, Schriften, Knöpfe und Abstände der ganzen Website; die Akzentfarbe kommt aus accentColor.
-->
<script lang="ts">
import type { Snippet } from 'svelte';
import Hours from '$components/Hours';
import Icon from '$components/Icon';
import Studio, {
  accent,
  facts,
  filled,
  PLACEHOLDER,
  pageLink,
  scriptTag,
  setting,
  unfilled,
  widgets,
} from '$components/Studio';
import {
  ancestors,
  children as childrenOf,
  image,
  link,
  media,
  page as pageOf,
  site as settings,
} from '$core';

let {
  /** Seite der Vorlage */
  page,
  /** Ziel der Knöpfe „Beratungstermin anfragen“; leer — das Formular auf der Kontaktseite */
  booking = '',
  /** Startseite: der Knopf in der Kopfzeile erscheint erst, wenn der auf der Bühne aus dem Blick ist */
  home = false,
  children,
}: {
  page: {
    id: number;
    title: string;
    longTitle: string;
    menuTitle: string;
    path: string;
    content: string;
    fields: Record<string, unknown>;
  };
  booking?: string;
  home?: boolean;
  children: Snippet;
} = $props();

const site = settings();
const tone = accent();
const studio = facts();
const embeds = widgets();
const year = new Date().getFullYear();

// Schrift Jost (OFL) aus der Mediathek, Datei fonts/jost-latin.woff2. Fehlt sie, gilt die Systemschrift — die
// Seite lädt keine Schrift von fremden Servern.
const font = media('fonts/jost-latin.woff2');
const _LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const fontFace = font
  ? `<style>@font-face{font-family:Jost;font-style:normal;font-weight:400 700;font-display:swap;src:url(${font}) format('woff2');unicode-range:${_LATIN}}</style>`
  : '';
const plannerId = Number(setting('plannerPage'));
const contactId = Number(setting('contactPage'));
const contact = pageLink('contactPage');
const termin = $derived(booking || (contact ? `${contact}#form-termin` : null));
const impressum = pageLink('impressumPage');
const privacy = pageLink('privacyPage');
const plannerReady = embeds.planner.ready;
const isHome = $derived(page.id === site.homePageId);
const city = unfilled(studio.city) ? '' : studio.city;
// „Ihr Küchenstudio in Berlin“, „Küchen Schmidt – Küchenstudio in Berlin“: das Wort nur einmal.
const title = $derived(
  isHome
    ? city
      ? /küchenstudio/i.test(site.name)
        ? `${site.name} in ${city}`
        : `${site.name} – Küchenstudio in ${city}`
      : site.name
    : `${page.title} – ${site.name}`
);

// Logo aus der Mediathek (Einstellung studioLogo); ohne Logo der Name als Schrift.
const logoPath = setting('studioLogo');
const logo = filled(logoPath)
  ? (image(logoPath) ??
    ((url) =>
      url
        ? { src: url, srcset: '', width: undefined, height: undefined }
        : null)(media(logoPath)))
  : null;

// Menü: oberste Ebene ohne Startseite; „Online planen“ nur, wenn der Planer eingerichtet ist.
const branch = $derived(
  new Set([page.id, ...ancestors(page.id).map((_) => _.id)])
);
const nav = $derived(
  childrenOf(null)
    .filter(
      (_) => _.id !== site.homePageId && (plannerReady || _.id !== plannerId)
    )
    .map((_) => ({
      id: _.id,
      title: _.menuTitle || _.title,
      url: link(_.id),
      current: branch.has(_.id),
      here: _.id === page.id,
    }))
    .filter((_) => _.url)
);

// Chat-Knopf: auf der Seite des Planers nur auf Wunsch (chatOnPlanner), sonst verdeckt er oft den Planer.
const chat = $derived(
  embeds.chat.ready &&
    (embeds.chatOnPlanner || !(plannerReady && page.id === plannerId))
);
// Тег строкой, а не элементом со spread: Svelte добавил бы такому <script> inline-обработчики onload/onerror.
const chatTag = scriptTag(embeds.chat);
// Menü auf dem Telefon: verlässt der Fokus das Feld (Tab), schließt es sich, damit niemand dahinter weitertippt.
const _TAG = 'script';
const _MENU = `<${_TAG}>(()=>{const p=document.getElementById('site-menu');p&&p.addEventListener('focusout',e=>{const t=e.relatedTarget;if(t&&!p.contains(t)&&p.matches(':popover-open'))p.hidePopover()})})()</${_TAG}>`;

// Bild für Suchmaschinen: das Foto oben auf der Startseite, als volle Adresse (nur mit Adresse der Website).
const heroPath = pageOf(site.homePageId)?.fields.heroImage;
const heroUrl =
  site.siteUrl && typeof heroPath === 'string' && heroPath
    ? ((url) => (url ? `${site.siteUrl}${url}` : undefined))(media(heroPath))
    : undefined;

// Daten für Suchmaschinen: auf der Startseite und der Kontaktseite, nur ausgefüllte Angaben.
const storeData = $derived(
  isHome || page.id === contactId
    ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'HomeGoodsStore',
        name: site.name,
        description: site.description || undefined,
        url: site.siteUrl ? `${site.siteUrl}/` : undefined,
        telephone: studio.e164 || undefined,
        image: heroUrl,
        email: studio.mail ? studio.email : undefined,
        address: [studio.street, studio.zip, studio.city].some(unfilled)
          ? undefined
          : {
              '@type': 'PostalAddress',
              streetAddress: studio.street,
              postalCode: studio.zip,
              addressLocality: studio.city,
              addressCountry: 'DE',
            },
        openingHoursSpecification: ((specs) =>
          specs.length > 0 ? specs : undefined)(
          studio.hours.flatMap((_) =>
            _.spec.map((spec) => ({
              '@type': 'OpeningHoursSpecification',
              ...spec,
            }))
          )
        ),
        hasMap: studio.route ?? undefined,
      }).replaceAll('<', '\\u003c')
    : ''
);

// Hinweise nur für angemeldete Nutzer des Managers (siehe Stil .setup): was vor dem Start noch fehlt.
const blanks = $derived((page.content.match(PLACEHOLDER) ?? []).length);
// Eingetragen, aber nicht geladen: falsche Adresse oder Attribute, die nicht data-… sind.
const issues = (['planner', 'chat'] as const).flatMap((slot) => [
  ...(embeds[slot].rejected
    ? [
        `Die Adresse in ${slot}Script wird nicht geladen: erlaubt ist nur https://….`,
      ]
    : []),
  ...(embeds[slot].ignored.length > 0
    ? [
        `In ${slot}Attributes übergangen (erlaubt sind nur data-…): ${embeds[slot].ignored.slice(0, 6).join(', ')}.`,
      ]
    : []),
]);
// Abschnitte ohne erkannte Uhrzeit erscheinen als Text: der Inhaber soll das wissen.
const loose = studio.hours
  .filter((_) => !_.blank && _.spec.length === 0)
  .map((_) => _.days);
const missing = [
  ...([studio.street, studio.zip, studio.city].some(unfilled)
    ? ['Anschrift']
    : []),
  ...(unfilled(studio.phone) ? ['Telefon'] : []),
  ...(unfilled(studio.email) ? ['E-Mail'] : []),
  ...(studio.hours.length === 0 || studio.hours.some((_) => _.blank)
    ? ['Öffnungszeiten']
    : []),
];
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="theme-color" content="#3a4049" />
  {#if font}
    <link rel="preload" href={font} as="font" type="font/woff2" crossorigin="anonymous" />
    {@html fontFace}
  {/if}
  {#if chat}
    <link rel="preconnect" href={embeds.chat.origin} />
    {@html chatTag}
  {/if}
  {#if storeData}{@html `<script type="application/ld+json">${storeData}</script>`}{/if}
</svelte:head>

<div
  class="site"
  class:home
  style:--accent={tone.fill}
  style:--on-accent={tone.on}
  style:--accent-edge={tone.edge}
  style:--accent-line={tone.line}
  style:--accent-dark={tone.dark}
  style:--on-accent-dark={tone.onDark}
  style:--accent-line-dark={tone.lineDark}
  style:--focus={tone.focus}
  style:--focus-dark={tone.focusDark}
>
  <a class="skip" href="#main">Zum Inhalt springen</a>
  <aside class="topbar" aria-label="Anschrift und Kontakt">
    <div class="topbar-inner">
      <p class="where" hidden={!studio.located} data-owner={studio.located ? undefined : ''}>
        <Icon name="ort" />
        <span><Studio value={studio.street} />, <Studio value={studio.zip} />{' '}<Studio value={studio.city} /></span>
      </p>
      <p class="reach-top">
        {#if studio.tel}<a href={studio.tel}><Icon name="telefon" />{studio.phone}</a>{/if}
        {#if studio.mail}<a class="top-mail" href={studio.mail}><Icon name="mail" /><span>{studio.email}</span></a>{/if}
      </p>
    </div>
  </aside>
  <header class="top">
    <div class="bar">
      <a class="brand" class:logo={!!logo} href="/" aria-current={isHome ? 'page' : undefined}>
        {#if logo}<img src={logo.src} srcset={logo.srcset || undefined} sizes="12rem" width={logo.width} height={logo.height} alt={site.name} />{:else}{site.name}{/if}
      </a>
      <nav class="nav" aria-label="Hauptmenü">
        <ul>
          {#each nav as item (item.id)}
            <li><a href={item.url} class:current={item.current} aria-current={item.here ? 'page' : undefined}>{item.title}</a></li>
          {/each}
        </ul>
      </nav>
      <div class="reach">
        {#if termin}<a class="pill head-cta" href={termin}><span class="long">Beratungstermin anfragen</span><span class="short">Termin anfragen</span></a>{/if}
        <button class="burger" type="button" popovertarget="site-menu" aria-label="Menü öffnen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
    </div>
  </header>

  <div class="panel" id="site-menu" popover>
    <div class="panel-head">
      <span class="brand">{site.name}</span>
      <button class="close" type="button" popovertarget="site-menu" popovertargetaction="hide" aria-label="Menü schließen">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
    <nav aria-label="Hauptmenü">
      <ul>
        <li><a href="/" aria-current={isHome ? 'page' : undefined}>Start</a></li>
        {#each nav as item (item.id)}
          <li><a href={item.url} aria-current={item.here ? 'page' : undefined}>{item.title}</a></li>
        {/each}
      </ul>
    </nav>
    {#if termin}<a class="pill panel-cta" href={termin}>Beratungstermin anfragen</a>{/if}
    {#if studio.tel}<a class="panel-phone" href={studio.tel}>{studio.phone}</a>{/if}
  </div>
  {@html _MENU}

  <main id="main">
    {@render children()}
  </main>

  <aside class="setup" hidden aria-label="Hinweise zur Einrichtung">
    <div class="setup-inner">
      <p class="setup-title">Noch einzurichten <span>(sehen nur Sie, weil Sie im Manager angemeldet sind; gestrichelt umrandet: was Besucher erst sehen, wenn es ausgefüllt ist)</span></p>
      <ul>
        {#if !embeds.planner.configured && !embeds.chat.configured}
          <li>Kein Online-Planer und kein Chat eingebunden. Nutzen Sie einen solchen Dienst, tragen Sie unter Einstellungen → Eigene Werte die Adresse des Skripts und die Attribute aus dessen Einbauanleitung ein: <code>plannerScript</code> und <code>plannerAttributes</code>, <code>chatScript</code> und <code>chatAttributes</code>. Bis dahin lädt die Website keine fremden Skripte.</li>
        {/if}
        {#each issues as issue (issue)}
          <li>{issue}</li>
        {/each}
        {#if page.id === plannerId && !plannerReady}
          <li>{embeds.planner.configured ? 'Der Planer ist in plannerEnabled ausgeschaltet oder seine Adresse wird nicht geladen.' : 'Solange kein Planer eingebunden ist,'} Besucher sehen hier eine Einladung, die Küche gemeinsam zu planen, und die Seite fehlt im Menü.</li>
        {/if}
        {#if missing.length > 0}
          <li>Unter Einstellungen → Eigene Werte fehlen noch: {missing.join(', ')}.</li>
        {/if}
        {#if loose.length > 0}
          <li>In studioHours ohne erkannte Uhrzeit (erscheint nur als Text): {loose.join('; ')}. Uhrzeiten schreiben Sie so: Mo-Fr 9-18; Sa 10-14.</li>
        {/if}
        {#if blanks > 0}
          <li>Diese Seite hat noch {blanks === 1 ? 'einen Platzhalter' : `${blanks} Platzhalter`} in [eckigen Klammern].</li>
        {/if}
        {#if !font}
          <li>Die Schrift Jost fehlt: Laden Sie <code>jost-latin.woff2</code> in den Ordner <code>fonts</code> der Mediathek. Bis dahin zeigt die Website eine Systemschrift.</li>
        {/if}
        {#if missing.length === 0 && blanks === 0 && issues.length === 0}
          <li>Auf dieser Seite ist alles ausgefüllt.</li>
        {/if}
      </ul>
      <p class="setup-links">
        <a href="/manager/settings?tab=custom">Eigene Werte öffnen</a>
        <a href="/manager/pages/{page.id}">Diese Seite bearbeiten</a>
      </p>
    </div>
  </aside>

  <footer class="bottom">
    <div class="columns">
      <div class="about">
        <p class="footer-name">{site.name}</p>
        {#if site.description}<p>{site.description}</p>{/if}
      </div>
      <div class="ends" hidden={!studio.located} data-owner={studio.located ? undefined : ''}>
        <h2>Ausstellung</h2>
        <address>
          <Studio value={studio.street} /><br />
          <Studio value={studio.zip} />{' '}<Studio value={studio.city} />
        </address>
        {#if studio.route}<a href={studio.route} target="_blank" rel="noopener">Route planen<span class="sr-only"> (öffnet einen Kartendienst in neuem Fenster)</span></a>{/if}
      </div>
      <div class="ends" hidden={!studio.open} data-owner={studio.open ? undefined : ''}>
        <h2>Öffnungszeiten</h2>
        <Hours />
      </div>
      <div>
        <h2>Kontakt</h2>
        <p class="contact-lines">
          {#if studio.tel}<a href={studio.tel}>{studio.phone}</a>{:else}<Studio value={studio.phone} quiet />{/if}
          {#if studio.mail}<a href={studio.mail}>{studio.email}</a>{:else}<Studio value={studio.email} quiet />{/if}
        </p>
        {#if termin}<p><a href={termin}>Beratungstermin anfragen</a></p>{/if}
      </div>
    </div>
    <div class="legal">
      <p>© {year} {site.name}</p>
      <p class="legal-links">
        {#if impressum}<a href={impressum}>Impressum</a>{/if}
        {#if privacy}<a href={privacy}>Datenschutz</a>{/if}
      </p>
    </div>
  </footer>

  <!-- Auf dem Telefon: Anrufen und Termin im Daumenbereich; verschwindet beim Ausfüllen und solange das Formular im Bild ist. -->
  {#if studio.tel || termin}
    <nav class="dock" aria-label="Schnellzugriff">
      {#if studio.tel}<a href={studio.tel}><Icon name="telefon" />Anrufen</a>{/if}
      {#if termin}<a class="dock-termin" href={termin}><Icon name="kalender" /><span class="dock-long">Termin anfragen</span><span class="dock-short">Termin</span></a>{/if}
    </nav>
  {/if}
</div>
<style>
  :global(:root) {
    --page-bg: #ffffff;
    --mist: #f4f4f2;
    --line: #e2e4e7;
    --ink: #262b31;
    --ink-2: #5d6570;
    --slate: #3a4049;
    --slate-deep: #2b3037;
    --on-slate: #ffffff;
    --on-slate-2: #c9ced6;
    --edge: #8b939d;
    --display: Jost, Futura, 'Futura PT', 'Avenir Next', Avenir, 'Century Gothic', system-ui, sans-serif;
    --sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif;
    --radius: 0.375rem;
    /* Eine einzige, leise Schattenstufe für Karten. */
    --shadow: 0 0.5rem 1.5rem -1rem rgb(38 43 49 / 0.35);
    --t-text: var(--ink);
    --t-muted: var(--ink-2);
    --t-border: var(--edge);
    --t-surface: #ffffff;
    --t-hover: var(--mist);
    --t-radius: var(--radius);
    --t-gap: 2rem;
    --t-success: #2b6b45;
    --t-danger: #a3271c;
    color-scheme: light;
    scrollbar-color: var(--edge) var(--mist);
  }

  :global(html) {
    scroll-padding-top: 6.5rem;
  }

  :global(body) {
    margin: 0;
    background: var(--page-bg);
    color: var(--ink);
    font: 1.0625rem/1.65 var(--sans);
    caret-color: var(--focus, var(--ink));
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  :global(::selection) {
    background: var(--slate);
    color: #ffffff;
  }

  :global(p, li, dd) {
    text-wrap: pretty;
  }

  :global(h1, h2, h3) {
    hyphens: auto;
    overflow-wrap: break-word;
    font-family: var(--display);
    font-weight: 500;
    line-height: 1.12;
    letter-spacing: -0.005em;
    text-wrap: balance;
  }

  :global(:focus-visible) {
    outline: 0.1875rem solid var(--focus, var(--ink));
    outline-offset: 0.1875rem;
  }

  /* Die Formulare bringen einen eigenen, schwächeren Rahmen mit; dieser ist überall mindestens 3:1. */
  :global(.cms-form :is(input, select, textarea, button):focus-visible) {
    outline: 0.1875rem solid var(--focus, var(--ink));
    outline-offset: 0.125rem;
  }

  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Links: Schrift in der Textfarbe, darunter eine Linie in der Akzentfarbe. */
  :global(a) {
    color: var(--ink);
    text-decoration-color: var(--accent-line);
    text-decoration-thickness: 0.09375rem;
    text-underline-offset: 0.24em;
  }

  :global(a:hover) {
    text-decoration-thickness: 0.1875rem;
  }

  /* Nur für den angemeldeten Inhaber: was Besucher erst sehen, wenn es ausgefüllt ist (gestrichelt umrandet). */
  :global(body:has(> script[data-eile-bar]) :is(div, p, section, figure, aside, dl)[data-owner][hidden]) {
    display: block;
  }

  :global(body:has(> script[data-eile-bar]) li[data-owner][hidden]) {
    display: list-item;
  }

  :global(body:has(> script[data-eile-bar]) span[data-owner][hidden]) {
    display: inline;
  }

  :global(body:has(> script[data-eile-bar]) [data-owner]) {
    outline: 0.0625rem dashed #8a7a5c;
    outline-offset: 0.25rem;
  }

  .site {
    --t-accent: var(--accent);
    --t-on-accent: var(--on-accent);
    --margin: 1.25rem;
    --page: min(75rem, 100cqi - 2 * var(--margin));
    --section: clamp(4rem, 2.75rem + 4.5vw, 7.5rem);
    container-type: inline-size;
    timeline-scope: --termin;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 40rem) {
    .site {
      --margin: 2rem;
    }
  }

  /* Gemeinsame Bausteine: Container, kleine Zeile über der Überschrift, Maßlinie darunter, Knöpfe, dunkle Flächen. */
  :global(.container) {
    width: var(--page);
    margin-inline: auto;
  }

  :global(.eyebrow) {
    margin: 0 0 0.875rem;
    color: var(--ink-2);
    font-family: var(--display);
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  /* Maßlinie wie auf einer Küchenzeichnung: waagerechter Strich, an beiden Enden Begrenzung und Schrägstrich. */
  :global(.rule) {
    --tick: linear-gradient(currentColor, currentColor);
    --slash: linear-gradient(45deg, transparent calc(50% - 0.06rem), currentColor calc(50% - 0.06rem) calc(50% + 0.06rem), transparent calc(50% + 0.06rem));
    display: block;
    width: 4.5rem;
    height: 0.875rem;
    margin: 1.125rem 0 1.375rem;
    color: var(--accent-line);
    background:
      var(--slash) 0 50% / 0.75rem 0.75rem no-repeat,
      var(--slash) 100% 50% / 0.75rem 0.75rem no-repeat,
      var(--tick) 0.3125rem 50% / 0.09375rem 100% no-repeat,
      var(--tick) calc(100% - 0.3125rem) 50% / 0.09375rem 100% no-repeat,
      var(--tick) 0 50% / 100% 0.09375rem no-repeat;
  }

  :global(.pill) {
    max-width: 100%;
    hyphens: auto;
    overflow-wrap: anywhere;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    box-sizing: border-box;
    min-height: 3rem;
    padding: 0.625rem 1.625rem;
    border: 0.125rem solid var(--accent);
    border-radius: 999rem;
    background: var(--accent);
    color: var(--on-accent);
    font-family: var(--display);
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
    text-decoration: none;
    box-shadow: inset 0 0 0 0.0625rem var(--accent-edge, transparent);
    cursor: pointer;
    transition: background-color 0.2s, border-color 0.2s;
  }

  :global(.pill:hover) {
    background-color: color-mix(in oklab, var(--accent) 86%, #000);
    border-color: color-mix(in oklab, var(--accent) 86%, #000);
  }

  :global(.pill.outline) {
    border-color: currentColor;
    background: transparent;
    color: var(--ink);
    box-shadow: none;
  }

  :global(.pill.outline:hover) {
    background: color-mix(in srgb, currentColor 8%, transparent);
    border-color: currentColor;
  }

  :global(.dark) {
    background: var(--slate);
    color: var(--on-slate);
  }

  :global(.dark .eyebrow) {
    color: var(--on-slate-2);
  }

  :global(.dark .rule) {
    color: var(--accent-line-dark);
  }

  :global(.dark .pill:not(.outline)) {
    border-color: var(--accent-dark);
    background-color: var(--accent-dark);
    color: var(--on-accent-dark);
  }

  :global(.dark .pill:not(.outline):hover) {
    background-color: color-mix(in oklab, var(--accent-dark) 88%, #fff);
  }

  :global(.dark .pill.outline) {
    color: var(--on-slate);
  }

  :global(.dark :where(a:not(.pill))) {
    color: var(--on-slate);
    text-decoration-color: var(--accent-line-dark);
  }

  :global(.dark :where(:focus-visible)) {
    outline-color: var(--focus-dark);
  }

  /* Text der Seiten: Nullspezifität, Komponenten im Text sind stärker. */
  :global(:where(.prose) :where(h2)) {
    margin: 3.5rem 0 0.875rem;
    font-size: clamp(1.75rem, 1.35rem + 1.4vw, 2.5rem);
    scroll-margin-top: 7rem;
  }

  :global(:where(.prose) :where(h3)) {
    margin: 2rem 0 0.5rem;
    font-size: 1.3125rem;
  }

  :global(:where(.prose) :where(p, ul, ol, blockquote)) {
    max-width: 68ch;
    overflow-wrap: break-word;
    margin: 0 0 1.125rem;
  }

  :global(:where(.prose) :where(ul)) {
    padding-left: 1.375rem;
    list-style: none;
  }

  :global(:where(.prose) :where(ul > li)) {
    position: relative;
  }

  :global(:where(.prose) :where(ul > li)::before) {
    content: '';
    position: absolute;
    top: 0.72em;
    left: -1.25rem;
    width: 0.625rem;
    height: 0.125rem;
    border-radius: 0.125rem;
    background: var(--accent-line);
  }

  :global(:where(.prose) :where(li + li)) {
    margin-top: 0.5rem;
  }

  :global(:where(.prose) :where(img)) {
    max-width: 100%;
    height: auto;
  }

  :global(:where(.prose) :where(strong)) {
    font-weight: 650;
  }

  :global(:where(.prose) :where(code)) {
    font-size: 0.9em;
  }

  :global(:where(.prose) :where(.cms-form)) {
    max-width: 40rem;
    margin-top: 1.5rem;
  }

  /* Hinweis an den Inhaber im Text („[Beispieltext: …]“): Besucher sehen ihn nicht. */
  :global(:where(.sample)) {
    display: none;
    padding: 0.75rem 1rem;
    border: 0.0625rem dashed #8a7a5c;
    border-radius: var(--radius);
    background: #f3eee4;
    color: var(--ink);
    font-size: 0.9375rem;
  }

  :global(body:has(> script[data-eile-bar]) .sample) {
    display: block;
  }

  :global(.cms-form) {
    gap: 1.25rem;
  }

  :global(.cms-form input:not([type='checkbox'], [type='radio']), .cms-form select, .cms-form textarea) {
    min-width: 0;
    max-width: 100%;
    background: #ffffff;
  }

  :global(.cms-form input:not([type='checkbox'], [type='radio']):hover, .cms-form select:hover, .cms-form textarea:hover) {
    border-color: var(--ink-2);
  }

  :global(.cms-form label),
  :global(.cms-form .hint) {
    overflow-wrap: anywhere;
  }

  :global(.cms-form input[type='checkbox']) {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: var(--accent);
  }

  :global(.cms-form .field > label) {
    font-family: var(--display);
    font-weight: 500;
  }

  :global(.cms-form button[type='submit']) {
    max-width: 100%;
    min-height: 3.25rem;
    white-space: normal;
    hyphens: auto;
    overflow-wrap: anywhere;
    padding: 0.625rem 2rem;
    border: 0.125rem solid var(--accent);
    border-radius: 999rem;
    font-family: var(--display);
    font-size: 1.0625rem;
    box-shadow: inset 0 0 0 0.0625rem var(--accent-edge, transparent);
  }

  :global(.cms-form button[type='submit']:hover) {
    background: color-mix(in oklab, var(--accent) 86%, #000);
  }

  .skip {
    position: absolute;
    top: -4rem;
    left: 1rem;
    z-index: 20;
    padding: 0.5rem 0.875rem;
    background: var(--ink);
    color: #ffffff;
  }

  .skip:focus {
    top: 0.75rem;
  }

  /* Schmale Leiste über der Kopfzeile: Anschrift, Telefon, E-Mail. */
  .topbar {
    background: var(--slate);
    color: var(--on-slate-2);
    font-size: 0.875rem;
  }

  .topbar-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 2rem;
    width: var(--page);
    min-height: 2.5rem;
    margin-inline: auto;
  }

  .topbar p {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1.75rem;
    min-width: 0;
    margin: 0;
  }

  .topbar p[hidden] {
    display: none;
  }

  .topbar a,
  .where {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: var(--on-slate);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .where {
    color: var(--on-slate-2);
  }

  .topbar a:hover {
    text-decoration: underline;
    text-decoration-color: var(--accent-line-dark);
  }

  .topbar :global(.icon) {
    width: 1rem;
    height: 1rem;
    color: var(--accent-line-dark);
  }

  .topbar :global(:focus-visible) {
    outline-color: var(--focus-dark);
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #ffffff;
    box-shadow: 0 0.0625rem 0 var(--line);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 1rem 2.5rem;
    width: var(--page);
    min-height: 5rem;
    margin-inline: auto;
  }

  /* Langer Name: darf zweizeilig werden, das Menü bleibt einzeilig im Bild. */
  .brand {
    flex: 1 1 14ch;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-family: var(--display);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.1;
    text-decoration: none;
  }

  .brand.logo {
    display: flex;
    align-items: center;
  }

  .brand img {
    display: block;
    width: auto;
    max-width: 100%;
    height: 2.5rem;
    object-fit: contain;
    object-position: left center;
  }

  .nav ul {
    display: flex;
    flex-wrap: nowrap;
    gap: 0 2rem;
    margin: 0;
    padding: 0;
    list-style: none;
    white-space: nowrap;
  }

  .nav a {
    position: relative;
    display: inline-block;
    padding: 0.625rem 0;
    color: var(--ink);
    font-family: var(--display);
    font-size: 1.0625rem;
    font-weight: 500;
    text-decoration: none;
  }

  .nav a:hover {
    text-decoration: underline;
    text-decoration-color: var(--accent-line);
  }

  /* Aktueller Bereich: eine Linie in der Akzentfarbe darunter, nicht nur eine andere Farbe. */
  .nav a.current::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0.25rem;
    height: 0.125rem;
    border-radius: 0.125rem;
    background: var(--accent-line);
  }

  .reach {
    display: flex;
    flex: none;
    align-items: center;
    gap: 1rem;
  }

  .reach .pill {
    min-height: 2.75rem;
    padding-inline: 1.375rem;
  }

  .short {
    display: none;
  }

  /* Startseite: oben steht der Knopf auf der Bühne; der in der Kopfzeile kommt erst beim Scrollen dazu. */
  @supports (animation-timeline: scroll()) {
    .home .head-cta,
    .home .dock {
      animation: arrive linear both;
      animation-timeline: scroll(root);
      animation-range: 0 36rem;
    }

    .home .head-cta {
      animation-name: arrive, slot;
    }
  }

  @supports not (animation-timeline: scroll()) {
    .home .head-cta,
    .home .dock {
      display: none;
    }
  }

  @keyframes arrive {
    0%,
    70% {
      opacity: 0;
      visibility: hidden;
    }

    100% {
      opacity: 1;
      visibility: visible;
    }
  }

  /* Vor dem Scrollen nimmt der Knopf keinen Platz ein: das Menü steht rechts bündig. */
  @keyframes slot {
    0%,
    70% {
      max-width: 0;
      padding-inline: 0;
      border-width: 0;
    }

    100% {
      max-width: 18rem;
    }
  }

  .head-cta {
    max-width: 18rem;
    overflow: hidden;
    white-space: nowrap;
  }

  .dock {
    display: none;
  }

  .burger,
  .close {
    display: none;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 0.0625rem solid var(--edge);
    border-radius: 999rem;
    background: #ffffff;
    color: var(--ink);
    cursor: pointer;
  }

  .burger svg,
  .close svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
  }

  .close {
    display: grid;
  }

  .panel {
    box-sizing: border-box;
    width: min(22rem, 100vw - 2rem);
    height: 100dvh;
    max-height: 100dvh;
    margin: 0 0 0 auto;
    padding: 1rem 1.5rem 2rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 0;
    background: #ffffff;
    color: var(--ink);
  }

  .panel::backdrop {
    background: rgb(38 43 49 / 0.55);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .panel ul {
    margin: 0 0 1.75rem;
    padding: 0;
    list-style: none;
  }

  .panel li a {
    display: block;
    padding: 0.875rem 0;
    border-bottom: 0.0625rem solid var(--line);
    color: var(--ink);
    font-family: var(--display);
    font-size: 1.3125rem;
    font-weight: 500;
    text-decoration: none;
  }

  .panel li a[aria-current='page'] {
    text-decoration: underline;
    text-decoration-color: var(--accent-line);
    text-decoration-thickness: 0.125rem;
    text-underline-offset: 0.35em;
  }

  .panel-cta {
    width: 100%;
  }

  .panel-phone {
    display: inline-block;
    margin-top: 1.25rem;
    font-family: var(--display);
    font-size: 1.25rem;
    font-weight: 500;
  }

  main {
    flex: 1;
    padding-bottom: var(--section);
  }

  /* Endet die Seite mit einem Band, schließt der Fußbereich direkt an. */
  main:has(> :global([data-band]:last-child)) {
    padding-bottom: 0;
  }

  /* Nur für angemeldete Nutzer: die Leiste des Managers steht dann am Ende der Seite. */
  :global(body:has(> script[data-eile-bar])) .setup {
    display: block;
  }

  .setup {
    background: #f3eee4;
    box-shadow: inset 0 0.0625rem 0 #d9cfbd;
  }

  .setup-inner {
    width: var(--page);
    margin-inline: auto;
    padding: 1.25rem 0 1.5rem;
    font-size: 0.9375rem;
  }

  .setup-title {
    margin: 0 0 0.5rem;
    font-family: var(--display);
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .setup-title span {
    color: var(--ink-2);
    font-family: var(--sans);
    font-size: 0.9375rem;
    font-weight: 400;
  }

  .setup ul {
    margin: 0 0 0.75rem;
    padding-left: 1.25rem;
  }

  .setup-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0;
    font-weight: 600;
  }

  .bottom {
    background: var(--slate-deep);
    color: var(--on-slate);
    font-size: 0.9375rem;
  }

  .bottom :global(a) {
    color: var(--on-slate);
    text-decoration-color: var(--accent-line-dark);
    overflow-wrap: anywhere;
  }

  .bottom :global(:focus-visible) {
    outline-color: var(--focus-dark);
  }

  .columns,
  .legal {
    width: var(--page);
    margin-inline: auto;
  }

  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 2.5rem;
    padding: 4.5rem 0 3.5rem;
  }

  .columns > * {
    flex: 1 1 12rem;
    min-width: 0;
  }

  .columns > .about {
    flex: 1.6 1 18rem;
  }

  .columns > [hidden] {
    display: none;
  }

  /* Endet die Seite mit der Einladung samt Anschrift und Zeiten, wiederholt der Fußbereich sie nicht. */
  .site:has(main > :global([data-band]:last-child)) .ends {
    display: none;
  }

  .columns h2 {
    margin: 0 0 1rem;
    color: var(--on-slate-2);
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .columns p,
  .columns address {
    margin: 0 0 0.75rem;
    font-style: normal;
  }

  .contact-lines {
    display: grid;
    gap: 0.25rem;
  }

  .footer-name {
    font-family: var(--display);
    font-size: 1.625rem;
    font-weight: 600;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .about p:not(.footer-name) {
    max-width: 22rem;
    color: var(--on-slate-2);
  }

  .legal {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 2rem;
    padding: 1.25rem 0 2rem;
    border-top: 0.0625rem solid rgb(255 255 255 / 0.14);
    color: var(--on-slate-2);
    font-size: 0.875rem;
  }

  .legal p {
    margin: 0;
  }

  .legal-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.pill) {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .nav a.current::after,
    :global(.rule) {
      forced-color-adjust: none;
      background-color: CanvasText;
      color: CanvasText;
    }

    :global(.pill) {
      border-color: ButtonText;
    }
  }

  @media (max-width: 72rem) {
    .nav {
      display: none;
    }

    .burger {
      display: grid;
    }
  }

  @media (max-width: 64rem) {
    .long {
      display: none;
    }

    .short {
      display: inline;
    }

    .bar {
      min-height: 4.25rem;
    }
  }

  @media (max-width: 40rem) {
    :global(html) {
      scroll-padding-bottom: calc(5rem + env(safe-area-inset-bottom));
    }

    .where,
    .top-mail {
      display: none !important;
    }

    .topbar-inner {
      justify-content: flex-end;
      min-height: 2.25rem;
    }

    .head-cta {
      display: none;
    }

    .site:has(.dock) {
      padding-bottom: calc(4rem + env(safe-area-inset-bottom));
    }

    .dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 15;
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom));
      background: rgb(43 48 55 / 0.97);
      animation: at-form linear none;
      animation-timeline: --termin;
      animation-range: cover;
    }

    .home .dock {
      animation-name: arrive, at-form;
      animation-timeline: scroll(root), --termin;
      animation-range: 0 36rem, cover;
      animation-fill-mode: both, none;
    }

    /* Beim Ausfüllen weg: die Leiste soll kein Feld und keinen Fokus verdecken. */
    .site:has(:is(input, select, textarea):focus) .dock {
      display: none;
    }

    .dock a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-width: 0;
      padding-inline: 0.5rem;
      overflow: hidden;
      overflow-wrap: anywhere;
      text-align: center;
      min-height: 3rem;
      border: 0.125rem solid rgb(255 255 255 / 0.6);
      border-radius: 999rem;
      color: #ffffff;
      font-family: var(--display);
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
    }

    .dock .dock-termin {
      border-color: var(--accent-dark);
      background: var(--accent-dark);
      color: var(--on-accent-dark);
    }

    .dock :global(:focus-visible) {
      outline-color: var(--focus-dark);
      outline-offset: 0.125rem;
    }
  }

  /* Solange das Terminformular im Bild ist, braucht es die Leiste nicht: es hat seinen eigenen Knopf. */
  @keyframes at-form {
    from,
    to {
      opacity: 0;
      visibility: hidden;
    }
  }

  .dock-short {
    display: none;
  }

  @media (max-width: 30rem) {
    .bar {
      gap: 0.75rem;
    }

    .brand {
      font-size: 1.1875rem;
    }

    .brand img {
      height: 2rem;
    }

    .columns {
      gap: 2rem;
      padding-top: 3.5rem;
    }
  }

  @media (max-width: 22rem) {
    .dock-long,
    .dock :global(.icon) {
      display: none;
    }

    .dock-short {
      display: inline;
    }
  }
</style>
