<!-- @component
Liniensymbol der Website, 24er Raster, eine Strichstärke: beratung, aufmass, planung, montage, geraete, lieferung, service, telefon, mail, ort, uhr, kalender, check, person, pfeil. Nur Schmuck: der Text daneben sagt, worum es geht.
-->
<script lang="ts">
let {
  /** Name des Symbols */
  name = 'check',
}: { name?: string } = $props();

const _ICONS: Readonly<Record<string, readonly string[]>> = {
  beratung: [
    'M4 4.5h10a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5H8.5L5 16v-3H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5Z',
    'M18.5 8.5H20a1.5 1.5 0 0 1 1.5 1.5v5.5A1.5 1.5 0 0 1 20 17h-1v3l-3.5-3H11a1.5 1.5 0 0 1-1.5-1.5V15',
    'M6 8.5h6',
  ],
  aufmass: [
    'M5.5 7h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z',
    'M8.5 15.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    'M14.5 16h7v3h-7',
    'M17 16v1.5M19.5 16v1.5',
  ],
  planung: [
    'M3.5 3.5h17v17h-17z',
    'M3.5 12.5h6.5',
    'M10 12.5a4 4 0 0 1 4 4',
    'M14 3.5v5h6.5',
  ],
  montage: [
    'M15.4 3.7a4.3 4.3 0 0 0-5 5.7l-6.3 6.3a1.9 1.9 0 0 0 2.7 2.7l6.3-6.3a4.3 4.3 0 0 0 5.7-5l-2.6 2.6-2.4-.6-.6-2.4Z',
  ],
  service: [
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
    'M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3',
  ],
  geraete: [
    'M5.5 3.5h13a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5Z',
    'M4 8h16',
    'M7.5 11h9v6h-9z',
    'M7.5 5.75h.01M10.5 5.75h.01',
  ],
  lieferung: [
    'M2.5 6.5h11v10h-11z',
    'M13.5 9.5h4l3 3.5v3.5h-7',
    'M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM17 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
  ],
  telefon: [
    'M6.6 3.5h2.6l1.5 4.2-2 1.4a12 12 0 0 0 6.2 6.2l1.4-2 4.2 1.5v2.6c0 1.2-1 2.1-2.2 2.1A16.5 16.5 0 0 1 4.5 5.7c0-1.2.9-2.2 2.1-2.2Z',
  ],
  mail: [
    'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
    'm3.5 7 8.5 6.5L20.5 7',
  ],
  ort: [
    'M12 21s-6.5-5.9-6.5-11a6.5 6.5 0 0 1 13 0c0 5.1-6.5 11-6.5 11Z',
    'M12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z',
  ],
  uhr: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z', 'M12 7.5V12l3 2'],
  kalender: [
    'M5.5 5.5h13a1.5 1.5 0 0 1 1.5 1.5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5Z',
    'M4 10h16M8.5 3.5v4M15.5 3.5v4',
  ],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  person: [
    'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5',
  ],
  pfeil: ['M5 12h14M13 6l6 6-6 6'],
};

const paths = $derived(_ICONS[name] ?? _ICONS.check!);
</script>

<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  {#each paths as d (d)}<path {d} />{/each}
</svg>

<style>
  .icon {
    display: inline-block;
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    vertical-align: -0.2em;
  }
</style>
