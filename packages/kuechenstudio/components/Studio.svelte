<!-- @component
Ein Wert aus den Einstellungen des Studios. Platzhalter in [eckigen Klammern] erscheinen als gestricheltes Feld, das noch auszufüllen ist. Das Modul liefert außerdem Anschrift, Öffnungszeiten, die Akzentfarbe mit lesbaren Varianten für helle und dunkle Flächen und die Einbauplätze für Planer und Chat an alle Vorlagen und Komponenten.
-->
<script module lang="ts">
import { link, site } from '$core';

// Fehlt eine eigene Einstellung, liefert Eile „[@key]“: dann gilt sie als leer.
export const setting = (key: string): string =>
  ((value) =>
    typeof value === 'string' && !/^\[@[^\]]*\]$/.test(value)
      ? value.trim()
      : '')(site().custom[key]);

/** Platzhalter, die der Inhaber noch ausfüllen muss: alles in [eckigen Klammern], außer Eile-Tags. */
export const PLACEHOLDER = /\[(?![[~#@!])[^\]\n]{2,160}\]/g;

export const unfilled = (text: string): boolean =>
  text === '' || new RegExp(PLACEHOLDER.source).test(text);

export type Part = { readonly text: string; readonly blank: boolean };

/** Text in Stücke: normaler Text und Leerfelder. */
export const parts = (text: string): Part[] =>
  text
    .split(/(\[(?![[~#@!])[^\]\n]{2,160}\])/)
    .filter((_) => _ !== '')
    .map((_) =>
      /^\[.*\]$/.test(_)
        ? { text: _.slice(1, -1), blank: true }
        : { text: _, blank: false }
    );

const _DAYS: Readonly<Record<string, string>> = {
  Mo: 'Monday',
  Di: 'Tuesday',
  Mi: 'Wednesday',
  Do: 'Thursday',
  Fr: 'Friday',
  Sa: 'Saturday',
  So: 'Sunday',
};
const _ORDER = Object.keys(_DAYS);
const _DAY = /^(Mo|Di|Mi|Do|Fr|Sa|So)(?:\s*[-–—]\s*(Mo|Di|Mi|Do|Fr|Sa|So))?$/;
// „9:00-18:30“, „9–18 Uhr“, „9.30 Uhr — 18 Uhr“: Minuten und „Uhr“ sind freiwillig.
const _TIME =
  /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:Uhr)?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:Uhr)?$/;

const _time = (raw: string): RegExpExecArray | null =>
  ((match) =>
    match &&
    Number(match[1]) <= 24 &&
    Number(match[3]) <= 24 &&
    Number(match[2] ?? 0) < 60 &&
    Number(match[4] ?? 0) < 60
      ? match
      : null)(_TIME.exec(raw.trim()));

const _clock = (hours: string, minutes: string | undefined): string =>
  `${hours.padStart(2, '0')}:${minutes ?? '00'}`;

const _span = (raw: string): string[] | null =>
  ((match) =>
    match
      ? _ORDER.slice(
          _ORDER.indexOf(match[1]!),
          _ORDER.indexOf(match[2] ?? match[1]!) + 1
        )
      : null)(_DAY.exec(raw.trim()));

export type Opening = {
  /** „Mo–Fr“ oder freier Text wie „Termine nach Vereinbarung“ */
  readonly days: string;
  /** „10:00–18:30 Uhr“; leer — freier Text */
  readonly times: string;
  readonly blank: boolean;
  /** Für schema.org; leer — die Zeile ist freier Text */
  readonly spec: readonly {
    readonly dayOfWeek: readonly string[];
    readonly opens: string;
    readonly closes: string;
  }[];
};

// Ein Abschnitt: „Mo-Fr 10:00-18:30“, „Sa 10-14“ nicht; mehrere Zeiten mit Komma: „Mo-Fr 9:00-12:30, 14:00-18:00“.
const _opening = (segment: string): Opening => {
  const match = /^(.+?)\s+(\d.*)$/.exec(segment.trim());
  const days = match ? match[1]!.split(',').map(_span) : [null];
  const times = match ? match[2]!.split(',').map(_time) : [null];
  const valid = days.every((_) => _ !== null) && times.every((_) => _ !== null);
  return valid
    ? {
        days: match![1]!.replace(/\s*[-–—]\s*/g, '–').replace(/\s*,\s*/g, ', '),
        times: `${times.map((_) => `${_clock(_![1]!, _![2])}–${_clock(_![3]!, _![4])}`).join(', ')} Uhr`,
        blank: false,
        spec: times.map((_) => ({
          dayOfWeek: days
            .flat()
            .map((day) => `https://schema.org/${_DAYS[day!]}`),
          opens: _clock(_![1]!, _![2]),
          closes: _clock(_![3]!, _![4]),
        })),
      }
    : { days: segment.trim(), times: '', blank: false, spec: [] };
};

/** Öffnungszeiten aus der Einstellung studioHours: Abschnitte mit Semikolon. */
export const openings = (raw: string): Opening[] =>
  raw === ''
    ? []
    : unfilled(raw)
      ? [
          {
            days: raw.replace(/^\[|\]$/g, ''),
            times: '',
            blank: true,
            spec: [],
          },
        ]
      : raw
          .split(/\s*;\s*|\n+/)
          .filter((_) => _.trim() !== '')
          .map(_opening);

const _HEX = /^#[0-9a-f]{6}$/i;

const _rgb = (hex: string): number[] =>
  [1, 3, 5].map((_) => Number.parseInt(hex.slice(_, _ + 2), 16));

const _hex = (rgb: readonly number[]): string =>
  `#${rgb.map((_) => Math.round(_).toString(16).padStart(2, '0')).join('')}`;

const _luminance = (hex: string): number =>
  ((channels) =>
    0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!)(
    _rgb(hex).map((_) =>
      ((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))(
        _ / 255
      )
    )
  );

export const contrast = (a: string, b: string): number =>
  ((x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))(
    _luminance(a),
    _luminance(b)
  );

// OKLab/OKLCH (Björn Ottosson): heller oder dunkler machen, ohne den Farbton zu verlieren.
const _linear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const _gamma = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

type _Lab = readonly [number, number, number];

const _oklab = (hex: string): _Lab =>
  ((r, g, b) =>
    ((l, m, s) => [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ])(
      Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
      Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
      Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    ))(...(_rgb(hex).map((_) => _linear(_ / 255)) as [number, number, number]));

// sRGB des Labwerts; null — außerhalb des darstellbaren Bereichs.
const _srgb = (lab: _Lab): number[] | null =>
  ((l, m, s) =>
    ((rgb) => (rgb.every((_) => _ >= -0.0005 && _ <= 1.0005) ? rgb : null))([
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]))(
    (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3,
    (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3,
    (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3
  );

const _CHROMA = Array.from({ length: 21 }, (_, index) => 1 - index / 20);

// Farbe mit anderer Helligkeit L, gleicher Farbton; die Buntheit sinkt nur, bis die Farbe darstellbar ist.
const _withLightness = (hex: string, lightness: number): string =>
  ((lab) =>
    _hex(
      (
        _CHROMA
          .map((k) => _srgb([lightness, lab[1] * k, lab[2] * k]))
          .find((_) => _ !== null) ?? [lightness, lightness, lightness]
      ).map((_) => Math.min(255, Math.max(0, _gamma(_) * 255)))
    ))(_oklab(hex));

const _chroma = (hex: string): number =>
  ((lab) => Math.hypot(lab[1], lab[2]))(_oklab(hex));

const _LEVELS = Array.from({ length: 51 }, (_, index) => index / 50);

// Die erste Helligkeit von der Farbe aus nach oben (up) oder unten, bei der sie die Bedingung erfüllt.
const _shift = (
  hex: string,
  up: boolean,
  fits: (color: string) => boolean
): string | null =>
  fits(hex)
    ? hex
    : ((start) =>
        _LEVELS
          .filter((_) => (up ? _ > start : _ < start))
          .sort((a, b) => (up ? a - b : b - a))
          .map((_) => _withLightness(hex, _))
          .find(fits) ?? null)(_oklab(hex)[0]);

/** Weiß der Seite, Schrift und das dunkle Schiefergrau der Bänder: die Akzentfarbe wird an ihnen gemessen. */
export const PAGE = '#ffffff';
export const INK = '#262b31';
export const SLATE = '#3a4049';
/** Hellgrau der Bänder: Linien und Fokus müssen auch darauf sichtbar bleiben */
export const MIST = '#f4f4f2';
/** Akzent, wenn accentColor fehlt oder kein #RRGGBB ist: Messing */
export const BRASS = '#c49a55';
const _WHITE = '#ffffff';

// Schrift auf einer Fläche: Weiß oder die dunkle Schrift, je nachdem, was besser lesbar ist.
const _on = (fill: string): string =>
  contrast(fill, _WHITE) >= contrast(fill, INK) ? _WHITE : INK;

export type Accent = {
  /** Knopf auf hellem Grund: die Farbe des Inhabers; mittlere Töne dunkler, bis Weiß darauf lesbar ist */
  readonly fill: string;
  /** Schrift auf fill, mindestens 4,5:1 */
  readonly on: string;
  /** Rand des Knopfs, wenn er sich vom Weiß kaum abhebt; sonst transparent */
  readonly edge: string;
  /** Linien, Unterstreichungen, Symbole auf hellem Grund: mindestens 2:1 */
  readonly line: string;
  /** Knopf auf Schiefergrau: die Farbe, in OKLCH aufgehellt; zu grau geworden — Weiß */
  readonly dark: string;
  /** Schrift auf dark */
  readonly onDark: string;
  /** Linien und Symbole auf Schiefergrau: mindestens 2,5:1 */
  readonly lineDark: string;
  /** Fokusrahmen auf hellem Grund (Weiß und Hellgrau): mindestens 3:1 */
  readonly focus: string;
  /** Fokusrahmen auf Schiefergrau: mindestens 3:1 */
  readonly focusDark: string;
};

const _fill = (color: string): string =>
  _shift(color, false, (_) => contrast(_, _on(_)) >= 4.5) ?? INK;

// Auf Schiefergrau: so hell, dass die dunkle Schrift 4,5:1 und der Knopf 3:1 zum Grund hält (Y ≥ 0,29).
const _dark = (color: string): string =>
  ((lifted) => (lifted && _chroma(lifted) >= 0.03 ? lifted : _WHITE))(
    _shift(
      color,
      true,
      (_) => contrast(_, INK) >= 4.5 && contrast(_, SLATE) >= 3
    )
  );

export const accent = (): Accent =>
  ((color) =>
    ((fill, dark) => ({
      fill,
      on: _on(fill),
      edge: contrast(fill, PAGE) < 1.6 ? 'rgb(38 43 49 / 0.35)' : 'transparent',
      line: _shift(color, false, (_) => contrast(_, MIST) >= 2) ?? INK,
      dark,
      onDark: _on(dark),
      lineDark: _shift(color, true, (_) => contrast(_, SLATE) >= 2.5) ?? _WHITE,
      focus: _shift(color, false, (_) => contrast(_, MIST) >= 3) ?? INK,
      focusDark: _shift(color, true, (_) => contrast(_, SLATE) >= 3) ?? _WHITE,
    }))(_fill(color), _dark(color)))(
    ((value) => (_HEX.test(value) ? value.toLowerCase() : BRASS))(
      setting('accentColor')
    )
  );

/** Seite aus einer Einstellung mit ihrer ID: Adresse oder null. */
export const pageLink = (key: string): string | null =>
  ((id) => (Number.isInteger(id) && id > 0 ? link(id) : null))(
    Number(setting(key))
  );

export type Facts = {
  readonly street: string;
  readonly zip: string;
  readonly city: string;
  readonly phone: string;
  /** tel:-Adresse; null — Telefonnummer fehlt noch */
  readonly tel: string | null;
  readonly email: string;
  readonly mail: string | null;
  readonly hours: Opening[];
  /** Link „Route planen“; null — Anschrift fehlt noch */
  readonly route: string | null;
  /** Straße, PLZ und Ort sind ausgefüllt */
  readonly located: boolean;
  /** Öffnungszeiten sind eingetragen (nicht leer, kein Platzhalter) */
  readonly open: boolean;
  /** Telefon in E.164 für JSON-LD; leer — fehlt noch */
  readonly e164: string;
};

// Deutsche Nummer in E.164: „030 1234567“ → +49301234567, „+49 (0) 30 …“ → +4930…, „0049 …“ → +49….
const _e164 = (phone: string): string =>
  ((digits) =>
    digits.startsWith('+')
      ? digits
      : digits.startsWith('00')
        ? `+${digits.slice(2)}`
        : digits.startsWith('0')
          ? `+49${digits.slice(1)}`
          : digits)(phone.replace(/\(0\)/g, '').replace(/[^\d+]/g, ''));

const _https = (raw: string): string | null =>
  /^https:\/\/[^\s"<>]+$/.test(raw) ? raw : null;

export const facts = (): Facts => {
  const street = setting('studioStreet');
  const zip = setting('studioZip');
  const city = setting('studioCity');
  const phone = setting('studioPhone');
  const email = setting('studioEmail');
  const address = [street, `${zip} ${city}`.trim()].join(', ');
  const hours = openings(setting('studioHours'));
  const located = ![street, zip, city].some(unfilled);
  return {
    street,
    zip,
    city,
    phone,
    tel: unfilled(phone) ? null : `tel:${_e164(phone)}`,
    email,
    mail: unfilled(email) || !email.includes('@') ? null : `mailto:${email}`,
    hours,
    located,
    open: hours.length > 0 && !hours.some((_) => _.blank),
    e164: unfilled(phone) ? '' : _e164(phone),
    route:
      _https(setting('studioMap')) ??
      ([street, zip, city].some(unfilled)
        ? null
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`),
  };
};

/** Ausgefüllt: weder leer noch Platzhalter in [eckigen Klammern]. */
export const filled = (text: string): boolean => !unfilled(text);

const _FOCUS: Readonly<Record<string, string>> = {
  oben: '50% 15%',
  unten: '50% 85%',
  links: '20% 50%',
  rechts: '80% 50%',
};

/** Bildausschnitt aus einem Feld (oben, mitte, unten, links, rechts) für object-position. */
export const focus = (value: unknown): string =>
  (typeof value === 'string' ? _FOCUS[value.trim()] : undefined) ?? '50% 50%';

const _WEEKDAY: Readonly<Record<string, number>> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** Öffnungszeiten je Wochentag (0 — Sonntag, wie Date.getDay) für „Heute geöffnet bis …“ im Browser. */
export const openToday = (hours: readonly Opening[]): string =>
  JSON.stringify(
    hours
      .flatMap((_) => _.spec)
      .reduce<Record<number, string[][]>>(
        (acc, spec) =>
          spec.dayOfWeek.reduce(
            (days, url) =>
              ((day) => ({
                ...days,
                [day]: [...(days[day] ?? []), [spec.opens, spec.closes]],
              }))(_WEEKDAY[url.replace('https://schema.org/', '')] ?? -1),
            acc
          ),
        {}
      )
  );

export type Trust = {
  /** Ansprechpartner: Name, Aufgabe, Telefon (tel:), Foto; leer — Block erscheint öffentlich nicht */
  readonly person: {
    readonly name: string;
    readonly role: string;
    readonly phone: string;
    readonly tel: string | null;
    readonly photo: string;
  };
  readonly since: string;
  readonly craft: string;
  /** Link zu Bewertungen (https), sonst null */
  readonly reviews: string | null;
  readonly consult: {
    readonly duration: string;
    readonly terms: string;
    readonly bring: string;
  };
  /** Wann das Studio nach einer Anfrage anruft */
  readonly callback: string;
};

/** Vertrauen: nur was der Inhaber selbst einträgt, Rohwerte (mit Platzhaltern) für die Vorschau des Inhabers. */
export const trust = (): Trust => {
  const phone = setting('contactPhone');
  return {
    person: {
      name: setting('contactName'),
      role: setting('contactRole'),
      phone,
      tel: filled(phone) ? `tel:${_e164(phone)}` : null,
      photo: setting('contactPhoto'),
    },
    since: setting('studioSince'),
    craft: setting('studioCraft'),
    reviews: _https(setting('reviewsLink')),
    consult: {
      duration: setting('consultDuration'),
      terms: setting('consultTerms'),
      bring: setting('consultBring'),
    },
    callback: setting('callbackTime'),
  };
};

// Symbol zu einer Leistung nach dem Wort im Titel; sonst ein Haken.
const _KINDS: readonly (readonly [RegExp, string])[] = [
  [/berat/i, 'beratung'],
  [/aufma|mess/i, 'aufmass'],
  [/plan/i, 'planung'],
  [/montag|einbau/i, 'montage'],
  [/liefer/i, 'lieferung'],
  [/ger(ä|ae)t/i, 'geraete'],
  [/service|kundendienst/i, 'service'],
];

/** Name des Symbols (Icon) für eine Leistung oder einen Schritt. */
export const iconFor = (title: string): string =>
  _KINDS.find((_) => _[0].test(title))?.[1] ?? 'check';

/** Anker einer Überschrift im Text: „Lieferung und Montage“ → lieferung-und-montage. */
export const anchor = (title: string): string =>
  title
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Zeitzone des Studios für „Heute geöffnet“: Einstellung studioTimeZone, sonst Europe/Berlin. */
export const timeZone = (): string =>
  ((value) =>
    /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value) ? value : 'Europe/Berlin')(
    setting('studioTimeZone')
  );

const _YES = /^(ja|j|an|ein|1|true|yes|on)$/i;

// Adresse eines fremden Skripts: nur https; http nur für einen Entwicklungsrechner.
const _script = (raw: string): string | null =>
  ((url) =>
    url &&
    url.username === '' &&
    url.password === '' &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)))
      ? url.href
      : null)(URL.canParse(raw) ? new URL(raw) : null);

// Attribute wie im Einbaucode: data-name="Wert", getrennt durch Zeilen oder Leerzeichen. Der ganze Einbaucode
// geht auch: übernommen werden src und alle data-…, der Rest wird übergangen.
const _ATTRIBUTE = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const _DATA = /^data-[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Teile des Einbaucodes, die die Vorlage selbst setzt: kein Grund für einen Hinweis.
const _OWN = /^(<\/?script.*|>.*|src|defer|async|type)$/;
const _MAX_ATTRIBUTES = 40;
const _MAX_VALUE = 4000;

export type Attribute = readonly [name: string, value: string];

export type Attributes = {
  readonly list: readonly Attribute[];
  /** src aus dem eingefügten Einbaucode, sonst leer */
  readonly src: string;
  /** Übergangene Namen, die nicht data-… sind (z. B. onload) */
  readonly ignored: readonly string[];
};

export const attributes = (raw: string): Attributes =>
  [...raw.matchAll(_ATTRIBUTE)].reduce<Attributes>(
    (acc, match) => {
      const name = match[1]!.toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      const fits =
        _DATA.test(name) &&
        value.length <= _MAX_VALUE &&
        acc.list.length < _MAX_ATTRIBUTES &&
        !acc.list.some((_) => _[0] === name);
      return fits
        ? { ...acc, list: [...acc.list, [name, value] as const] }
        : name === 'src' && acc.src === ''
          ? { ...acc, src: value }
          : _OWN.test(name) || acc.ignored.includes(name)
            ? acc
            : { ...acc, ignored: [...acc.ignored, name] };
    },
    { list: [], src: '', ignored: [] }
  );

export type Widget = {
  /** Adresse gültig und eingeschaltet: das Skript wird geladen */
  readonly ready: boolean;
  /** Etwas ist eingetragen (Adresse oder Einbaucode) */
  readonly configured: boolean;
  /** Eingetragene Adresse wird abgelehnt (kein https) */
  readonly rejected: boolean;
  readonly src: string;
  readonly origin: string;
  readonly attributes: readonly Attribute[];
  readonly ignored: readonly string[];
};

// Ein Einbauplatz für ein fremdes Skript: <prefix>Script, <prefix>Attributes, <prefix>Enabled.
const _widget = (prefix: 'chat' | 'planner'): Widget => {
  const parsed = attributes(setting(`${prefix}Attributes`));
  const raw = setting(`${prefix}Script`) || parsed.src;
  const src = unfilled(raw) ? null : _script(raw);
  return {
    ready: src !== null && _YES.test(setting(`${prefix}Enabled`)),
    configured: raw !== '' && !unfilled(raw),
    rejected: raw !== '' && !unfilled(raw) && src === null,
    src: src ?? '',
    origin: src ? new URL(src).origin : '',
    attributes: parsed.list,
    ignored: parsed.ignored,
  };
};

export type Widgets = {
  /** Chat-Knopf auf allen Seiten */
  readonly chat: Widget;
  /** Planer auf der Seite „Online planen“ */
  readonly planner: Widget;
  /** Chat auch auf der Seite des Planers */
  readonly chatOnPlanner: boolean;
  /** Freigehaltene Höhe des Planers, px */
  readonly plannerHeight: number;
};

export const widgets = (): Widgets => ({
  chat: _widget('chat'),
  planner: _widget('planner'),
  chatOnPlanner: _YES.test(setting('chatOnPlanner')),
  plannerHeight: ((height) =>
    Number.isFinite(height) && height >= 320 && height <= 2400
      ? Math.round(height)
      : 800)(Number(setting('plannerHeight') || 800)),
});

/** Der Planer ist eingerichtet und eingeschaltet. */
export const plannerOn = (): boolean => widgets().planner.ready;

/** Für Attribute im HTML: & " < > maskiert. */
export const escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/** Tag des fremden Skripts: Adresse, data-… und defer, alles maskiert; leer, wenn der Platz aus ist. */
export const scriptTag = (widget: Widget): string =>
  widget.ready
    ? `<script src="${escapeAttribute(widget.src)}"${widget.attributes
        .map(({ 0: name, 1: value }) => ` ${name}="${escapeAttribute(value)}"`)
        .join('')} defer></` + 'script>'
    : '';
</script>

<script lang="ts">
let {
  /** Text; [eckige Klammern] werden zum Leerfeld */
  value = '',
  /** Unausgefüllt: Besucher sehen nichts, nur der angemeldete Inhaber das Leerfeld */
  quiet = false,
}: { value?: string; quiet?: boolean } = $props();

const hide = $derived(quiet && unfilled(value));
</script>

{#if hide}<span class="owner-only" hidden data-owner>{#each parts(value || '[leer]') as part, index (index)}{#if part.blank}<span class="blank">{part.text}</span>{:else}{part.text}{/if}{/each}</span>{:else}{#each parts(value) as part, index (index)}{#if part.blank}<span class="blank">{part.text}</span>{:else}{part.text}{/if}{/each}{/if}

<style>
  /* Leerfeld: gestrichelt umrandet und hell hinterlegt — hier fehlt noch etwas. Auf hellem und dunklem Grund gleich lesbar. */
  :global(body:has(> script[data-eile-bar])) .owner-only[hidden] {
    display: inline;
  }

  .blank {
    padding: 0.05em 0.35em;
    border-radius: 0.25rem;
    background: #f3eee4;
    outline: 0.0625rem dashed #8a7a5c;
    outline-offset: -0.0625rem;
    color: #262b31;
    font-style: normal;
    font-weight: inherit;
    letter-spacing: normal;
    text-transform: none;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
</style>
