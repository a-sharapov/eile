<!-- @component
Terminanfrage: das Formular „Termin“ auf einer weißen Karte mit dem, was danach passiert; daneben Öffnungszeiten, Ihr Ansprechpartner und der Weg in die Ausstellung. Nach dem Absenden bleibt die Karte stehen und sagt, wie es weitergeht. Mit intro steht darüber eine Einladung in die Ausstellung (Startseite).
-->
<script lang="ts">
import Hours from '$components/Hours';
import Icon from '$components/Icon';
import Studio, { facts, filled, trust } from '$components/Studio';
import Today from '$components/Today';
import { image } from '$core';
import Form from '$core/Form';

let {
  /** Einladung über dem Formular (Startseite) */
  intro = false,
  /** Überschrift der Einladung */
  title = 'Kommen Sie in unsere Ausstellung',
  /** Text der Einladung */
  text = 'Fronten anfassen, Schubladen ausprobieren, Arbeitsplatten vergleichen: Mit Termin nehmen wir uns Zeit für Ihre Küche.',
  /** Überschrift der Karte mit dem Formular; leer — keine (die Seite trägt sie schon) */
  heading = 'Beratungstermin anfragen',
}: {
  intro?: boolean;
  title?: string;
  text?: string;
  heading?: string;
} = $props();

const studio = facts();
const t = trust();
const person = t.person;
const named = filled(person.name);
const portrait = $derived(filled(person.photo) ? image(person.photo) : null);
const direct = person.tel ?? studio.tel;
const directLabel = person.tel ? person.phone : studio.phone;
const consult = [
  { icon: 'uhr', value: t.consult.duration },
  { icon: 'check', value: t.consult.terms },
  {
    icon: 'planung',
    value: filled(t.consult.bring)
      ? `Mitbringen: ${t.consult.bring}`
      : t.consult.bring,
  },
];
const reachable = studio.located || !!studio.tel || !!studio.mail;
const level = intro ? 'h3' : 'h2';
// Ohne eigene Überschrift der Karte (Kontaktseite) stehen die Kästen daneben direkt unter der H1.
const sideLevel = intro || heading ? 'h3' : 'h2';
// Nach dem Absenden ersetzt das Formular sich selbst durch die Bestätigung: die Karte behält ihre Höhe,
// und ihr Kopf kommt unter der festen Kopfzeile ins Bild. Der Name des Tags ist zerlegt wie in Today.
const _TAG = 'script';
const _SENT = `<${_TAG}>document.addEventListener('cms:form-sent',e=>{const c=e.target.closest&&e.target.closest('.booking-card');if(!c)return;c.style.minHeight=c.offsetHeight+'px';requestAnimationFrame(()=>requestAnimationFrame(()=>c.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})))})</${_TAG}>`;
</script>

<section class="booking" class:intro id="termin" aria-labelledby={intro || heading ? 'booking-title' : undefined} data-band={intro ? '' : undefined}>
  <div class="container">
    {#if intro}
      <div class="invite">
        <h2 id="booking-title">{title}</h2>
        <span class="rule" aria-hidden="true"></span>
        <p>{text}</p>
      </div>
    {/if}
    <div class="grid">
      <div class="card booking-card">
        {#if heading}<svelte:element this={level} class="card-title" id={intro ? undefined : 'booking-title'}>{heading}</svelte:element>{/if}
        <p class="card-lead">Sagen Sie uns, worum es geht und wann es Ihnen passt. Wir rufen Sie an und bestätigen den Termin.</p>
        <ul class="consult">
          {#each consult as item, index (index)}
            <li hidden={!filled(item.value)} data-owner={filled(item.value) ? undefined : ''}><Icon name={item.icon} /><Studio value={item.value} /></li>
          {/each}
        </ul>
        <Form name="termin" />
        <div class="next">
          <p class="next-title">So geht es weiter</p>
          <ol>
            <li>Wir rufen Sie {#if filled(t.callback)}<Studio value={t.callback} />{' '}{/if}an und bestätigen den Termin.{#if !filled(t.callback)}{' '}<span hidden data-owner><Studio value={t.callback || '[z. B. innerhalb eines Werktags]'} /></span>{/if}</li>
            <li hidden={!studio.located} data-owner={studio.located ? undefined : ''}>Sie kommen in unsere Ausstellung: <Studio value={studio.street} />, <Studio value={studio.zip} />{' '}<Studio value={studio.city} />.</li>
            <li>Sie brauchen nichts vorzubereiten. Maße, Grundriss oder Fotos helfen, wenn Sie welche haben.</li>
          </ol>
          {#if studio.tel}<p class="call">Lieber gleich sprechen? <a href={studio.tel}>{studio.phone}</a></p>{/if}
        </div>
      </div>

      <div class="aside">
        <div class="side hours-box" hidden={!studio.open} data-owner={studio.open ? undefined : ''}>
          <svelte:element this={sideLevel} class="side-title">Öffnungszeiten</svelte:element>
          <Today />
          <Hours />
        </div>

        <div class="side person" hidden={!named} data-owner={named ? undefined : ''}>
          <svelte:element this={sideLevel} class="side-title">Ihr Ansprechpartner</svelte:element>
          <div class="who">
            {#if portrait}
              <img src={portrait.src} srcset={portrait.srcset || undefined} sizes="4.5rem" width={portrait.width} height={portrait.height} alt="" loading="lazy" decoding="async" />
            {:else}
              <span class="avatar"><Icon name="person" /></span>
            {/if}
            <div>
              <p class="name"><Studio value={person.name || '[Vorname Nachname: contactName]'} /></p>
              <p class="role"><Studio value={person.role || '[Aufgabe: contactRole]'} quiet /></p>
              {#if direct}<p><a href={direct}>{directLabel}</a></p>{/if}
            </div>
          </div>
        </div>

        <div class="side reach" hidden={!reachable} data-owner={reachable ? undefined : ''}>
          <svelte:element this={sideLevel} class="side-title">So finden Sie uns</svelte:element>
          <p class="line" hidden={!studio.located} data-owner={studio.located ? undefined : ''}><Icon name="ort" /><span><Studio value={studio.street} /><br /><Studio value={studio.zip} />{' '}<Studio value={studio.city} />{#if studio.route}<br /><a href={studio.route} target="_blank" rel="noopener">Route planen<span class="sr-only"> (öffnet einen Kartendienst in neuem Fenster)</span></a>{/if}</span></p>
          <p class="line" hidden={!studio.tel} data-owner={studio.tel ? undefined : ''}><Icon name="telefon" />{#if studio.tel}<a href={studio.tel}>{studio.phone}</a>{:else}<Studio value={studio.phone} />{/if}</p>
          <p class="line" hidden={!studio.mail} data-owner={studio.mail ? undefined : ''}><Icon name="mail" />{#if studio.mail}<a href={studio.mail}>{studio.email}</a>{:else}<Studio value={studio.email} />{/if}</p>
        </div>
      </div>
    </div>
  </div>
  {@html _SENT}
</section>

<style>
  .booking {
    scroll-margin-top: 6rem;
    view-timeline: --termin block;
  }

  .intro {
    padding: var(--section) 0;
    background: var(--mist);
  }

  .invite {
    max-width: 40rem;
    margin-bottom: 3rem;
  }

  .invite h2 {
    margin: 0;
    font-size: clamp(2rem, 1.5rem + 1.8vw, 3rem);
  }

  .invite p:not(.eyebrow) {
    margin: 0;
    color: var(--ink-2);
    font-size: 1.125rem;
  }

  /* Karte breit, daneben Öffnungszeiten oben (neben „Ihr Wunsch“ mit dem Wunschtermin), darunter Ansprechpartner und Weg. */
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    gap: 1.5rem clamp(2rem, 1rem + 3vw, 4rem);
    align-items: start;
  }

  /* Die Spalte daneben begleitet das lange Formular beim Scrollen. */
  .aside {
    position: sticky;
    top: 7rem;
    display: grid;
    gap: 1.5rem;
  }

  .card {
    box-sizing: border-box;
    scroll-margin-top: 7rem;
    padding: clamp(1rem, 0.5rem + 2vw, 2.75rem);
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius);
    background: #ffffff;
    box-shadow: var(--shadow);
  }

  .card-title {
    margin: 0 0 0.5rem;
    font-size: clamp(1.5rem, 1.25rem + 0.8vw, 2rem);
  }

  .card-lead {
    max-width: 36rem;
    margin: 0 0 1rem;
    color: var(--ink-2);
  }

  .consult:not(:has(li:not([hidden]))) {
    display: none;
  }

  .consult {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin: 0 0 1.5rem;
    padding: 0;
    list-style: none;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .consult li:not([hidden]) {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .consult :global(.icon) {
    color: var(--accent-line);
  }

  :global(body:has(> script[data-eile-bar])) .next span[hidden] {
    display: inline;
  }

  :global(body:has(> script[data-eile-bar])) .consult,
  :global(body:has(> script[data-eile-bar])) .consult li[hidden] {
    display: flex;
  }

  :global(body:has(> script[data-eile-bar])) .side[hidden] {
    display: block;
  }

  /* Formular in zwei Gruppen: „Ihr Wunsch“ und „Wie erreichen wir Sie?“. */
  .card :global(.cms-form) {
    max-width: none;
    gap: 1.5rem;
  }

  /* Linie über der Gruppe als Schatten: eine Rahmenlinie würde die Legende durchschneiden. */
  .card :global(.cms-form fieldset.group) {
    display: block;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    box-shadow: inset 0 0.0625rem 0 var(--line);
  }

  .card :global(.cms-form fieldset.group legend) {
    float: none;
    width: 100%;
    margin: 0 0 1rem;
    padding: 1.5rem 0 0;
    font-family: var(--display);
    font-size: 1.1875rem;
    font-weight: 600;
  }

  .card :global(.cms-form .group-fields) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 1.125rem 1.25rem;
  }

  .card :global(.cms-form .group-fields > .field) {
    align-content: start;
  }

  .card :global(.cms-form .group-fields > .field:has(textarea, select[name='topic'])) {
    grid-column: 1 / -1;
  }

  .card :global(.cms-form .field-consent),
  .card :global(.cms-form .field-submit) {
    grid-column: 1 / -1;
  }

  .card :global(.cms-form .required) {
    color: var(--accent-line);
  }

  /* Nach dem Absenden: Bestätigung groß, der Hinweis zum Ausfüllen fällt weg, die nächsten Schritte bleiben. */
  .card :global(.cms-form-sent) {
    position: relative;
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    padding: 1.5rem 0 0.5rem;
    background: none;
    font-family: var(--display);
    font-size: 1.375rem;
    line-height: 1.35;
  }

  .card :global(.cms-form-sent)::before {
    content: '';
    flex: none;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--accent);
  }

  /* Haken in der Schriftfarbe der Akzentfläche: als Maske, damit er jeder Akzentfarbe folgt. */
  .card :global(.cms-form-sent)::after {
    content: '';
    position: absolute;
    top: 2.125rem;
    left: 0.625rem;
    width: 1.5rem;
    height: 1.5rem;
    background: var(--on-accent);
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / contain no-repeat;
  }

  /* Die Bestätigung bekommt den Fokus nur, damit Screenreader sie vorlesen; sie ist kein Bedienelement. */
  .card :global(.cms-form-sent:focus) {
    outline: none;
  }

  .card :global(.cms-form-sent p) {
    margin: 0.25rem 0 0;
  }

  .card:has(:global(.cms-form-sent)) .card-lead,
  .card:has(:global(.cms-form-sent)) .consult {
    display: none;
  }

  .next {
    margin-top: 2rem;
    padding: clamp(0.75rem, 4vw, 1.5rem);
    hyphens: auto;
    overflow-wrap: anywhere;
    border-radius: var(--radius);
    background: var(--mist);
    font-size: 0.9375rem;
  }

  .next-title {
    margin: 0 0 0.75rem;
    font-family: var(--display);
    font-size: 1.0625rem;
    font-weight: 600;
  }

  .next ol {
    margin: 0;
    padding-left: 1.25em;
  }

  .next li + li {
    margin-top: 0.375rem;
  }

  .call {
    margin: 1rem 0 0;
    font-weight: 600;
  }

  .side {
    padding-top: 0.25rem;
  }

  .side-title {
    margin: 0 0 1rem;
    font-size: 1.25rem;
  }

  .hours-box :global(.today) {
    margin-bottom: 0.875rem;
    color: var(--ink);
  }

  .person {
    padding-top: 1.5rem;
    border-top: 0.0625rem solid var(--line);
  }

  .who {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .who img,
  .avatar {
    flex: none;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar {
    display: grid;
    place-items: center;
    background: var(--slate);
    color: #ffffff;
  }

  .avatar :global(.icon) {
    width: 1.75rem;
    height: 1.75rem;
  }

  .who p {
    margin: 0;
  }

  .name {
    font-family: var(--display);
    font-size: 1.125rem;
    font-weight: 600;
  }

  .role {
    color: var(--ink-2);
    font-size: 0.9375rem;
  }

  .reach {
    padding-top: 1.5rem;
    border-top: 0.0625rem solid var(--line);
  }

  .line:not([hidden]) {
    display: flex;
  }

  .line {
    gap: 0.75rem;
    min-width: 0;
    margin: 0 0 0.75rem;
    overflow-wrap: anywhere;
  }

  .line > :global(:not(.icon)) {
    min-width: 0;
  }

  .line :global(.icon) {
    margin-top: 0.2em;
    color: var(--accent-line);
  }

  /* Telefon: Öffnungszeiten vor dem Formular (neben „Ihr Wunsch“ geht nicht), der Rest danach. */
  @media (max-width: 56rem) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .aside {
      display: contents;
    }

    .hours-box {
      order: -1;
    }
  }

  @media (max-width: 40rem) {
    .card :global(.cms-form .group-fields) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
