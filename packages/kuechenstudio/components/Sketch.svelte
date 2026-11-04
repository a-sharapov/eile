<!-- @component
Strichzeichnung einer Küche als Ansicht mit Maßketten, wie auf einem Planungsblatt: feine Linien im Hintergrund dunkler Flächen und an Stelle eines Fotos, solange keins hochgeladen ist. Linien in der Schriftfarbe der Umgebung. Motive: zeile, grifflos, landhaus, insel, kompakt, laden (Ladenfront mit dem Namen des Studios), luecke (Küche mit fehlendem Schrank für die Seite 404).
-->
<script lang="ts">
import { site } from '$core';

let {
  /** Motiv: zeile=Küchenzeile, grifflos=Grifflos, landhaus=Landhaus, insel=Mit Kochinsel, kompakt=Kleine Küche, laden=Ladenfront, luecke=Lücke (404) */
  motif = 'zeile',
  /** Beschreibung für Screenreader; leer — nur Schmuck */
  label = '',
  /** Nur Linien: ohne Beschriftung und Flächen, für den Hintergrund */
  plain = false,
  /** Ausschnitt: fit=ganze Zeichnung, fill=Rahmen füllen */
  crop = 'fit',
}: {
  motif?:
    | 'zeile'
    | 'grifflos'
    | 'landhaus'
    | 'insel'
    | 'kompakt'
    | 'laden'
    | 'luecke';
  label?: string;
  plain?: boolean;
  crop?: 'fit' | 'fill';
} = $props();

type Base = 'drawers' | 'door' | 'sink' | 'dishwasher' | 'hob' | 'oven' | 'gap';
type Wall = 'cabinet' | 'hood' | 'window' | 'shelf' | 'none';
type Tall = 'fridge' | 'ovens' | 'pantry';
type Column = { w: number; base?: Base; wall?: Wall; tall?: Tall };
type Fronts = 'stange' | 'grifflos' | 'landhaus';
type Line = { d: string; kind: string };
type Box = { x: number; y: number; w: number; h: number; kind: string };
type Label = {
  x: number;
  y: number;
  text: string;
  kind: string;
  anchor?: string;
  size?: number;
};
type Layer = { lines: Line[]; boxes: Box[]; labels: Label[] };
// over — was davor steht (Insel, Keramikspüle): eigene Fläche, verdeckt die Linien dahinter.
type Drawing = Layer & { over: Layer; box: string };

// Maße in Millimetern, wie auf dem Planungsblatt; y zählt vom Boden nach oben.
const TOP = 2600;
const PLINTH = 150;
const BASE = 870;
const WORKTOP = 910;
const WALL_LOW = 1450;
const WALL_HIGH = 2170;
const CEILING = 2500;
// Linien laufen über die Ecken hinaus, wie bei einer Handzeichnung.
const OVER = 22;

const KITCHENS: Record<string, { fronts: Fronts; columns: Column[] }> = {
  zeile: {
    fronts: 'stange',
    columns: [
      { w: 600, tall: 'fridge' },
      { w: 600, tall: 'ovens' },
      { w: 800, base: 'drawers', wall: 'cabinet' },
      { w: 600, base: 'dishwasher', wall: 'cabinet' },
      { w: 900, base: 'sink', wall: 'window' },
      { w: 900, base: 'hob', wall: 'hood' },
      { w: 500, base: 'door', wall: 'cabinet' },
    ],
  },
  grifflos: {
    fronts: 'grifflos',
    columns: [
      { w: 600, tall: 'pantry' },
      { w: 600, tall: 'ovens' },
      { w: 1200, base: 'drawers', wall: 'shelf' },
      { w: 600, base: 'dishwasher', wall: 'none' },
      { w: 900, base: 'sink', wall: 'none' },
      { w: 900, base: 'hob', wall: 'hood' },
      { w: 600, base: 'drawers', wall: 'shelf' },
    ],
  },
  landhaus: {
    fronts: 'landhaus',
    columns: [
      { w: 600, tall: 'pantry' },
      { w: 500, base: 'door', wall: 'cabinet' },
      { w: 900, base: 'sink', wall: 'shelf' },
      { w: 600, base: 'dishwasher', wall: 'shelf' },
      { w: 900, base: 'oven', wall: 'hood' },
      { w: 600, base: 'drawers', wall: 'cabinet' },
    ],
  },
  insel: {
    fronts: 'stange',
    columns: [
      { w: 600, tall: 'fridge' },
      { w: 600, tall: 'pantry' },
      { w: 900, base: 'drawers', wall: 'cabinet' },
      { w: 900, base: 'sink', wall: 'window' },
      { w: 600, base: 'dishwasher', wall: 'cabinet' },
      { w: 800, base: 'drawers', wall: 'cabinet' },
    ],
  },
  kompakt: {
    fronts: 'stange',
    columns: [
      { w: 600, tall: 'fridge' },
      { w: 600, base: 'dishwasher', wall: 'cabinet' },
      { w: 600, base: 'sink', wall: 'cabinet' },
      { w: 600, base: 'hob', wall: 'hood' },
      { w: 400, base: 'drawers', wall: 'cabinet' },
    ],
  },
  luecke: {
    fronts: 'stange',
    columns: [
      { w: 600, tall: 'fridge' },
      { w: 800, base: 'drawers', wall: 'cabinet' },
      { w: 600, base: 'gap', wall: 'none' },
      { w: 900, base: 'sink', wall: 'window' },
      { w: 900, base: 'hob', wall: 'hood' },
      { w: 500, base: 'door', wall: 'cabinet' },
    ],
  },
};

const sy = (y: number): number => TOP - y;
const n = (value: number): string => String(Math.round(value * 10) / 10);

const edge = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: string,
  over = OVER
): Line =>
  ((length) =>
    ((dx, dy) => ({
      d: `M${n(x1 - dx)} ${n(sy(y1) + dy)}L${n(x2 + dx)} ${n(sy(y2) - dy)}`,
      kind,
    }))(((x2 - x1) / length) * over, ((y2 - y1) / length) * over))(
    Math.hypot(x2 - x1, y2 - y1) || 1
  );

const outline = (
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
  over = OVER
): Line[] => [
  edge(x, y, x + w, y, kind, over),
  edge(x + w, y, x + w, y + h, kind, over),
  edge(x + w, y + h, x, y + h, kind, over),
  edge(x, y + h, x, y, kind, over),
];

const fill = (
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string
): Box => ({
  x,
  y: sy(y + h),
  w,
  h,
  kind,
});

// Griff, Knopf oder Griffleiste — je nach Frontstil; side: Seite der Öffnung.
const handle = (
  fronts: Fronts,
  x: number,
  y: number,
  w: number,
  h: number,
  side: 'top' | 'left' | 'right'
): Line[] =>
  fronts === 'grifflos'
    ? []
    : fronts === 'landhaus'
      ? [
          ...outline(x + 55, y + 55, w - 110, h - 110, 'detail', 6),
          side === 'top'
            ? {
                d: `M${n(x + w / 2 - 18)} ${n(sy(y + h - 110))}a18 18 0 1 0 36 0a18 18 0 1 0 -36 0`,
                kind: 'detail',
              }
            : {
                d: `M${n(side === 'left' ? x + 110 : x + w - 146)} ${n(sy(y + h - 260))}a18 18 0 1 0 36 0a18 18 0 1 0 -36 0`,
                kind: 'detail',
              },
        ]
      : side === 'top'
        ? [
            edge(
              x + w / 2 - Math.min(160, w / 4),
              y + h - 70,
              x + w / 2 + Math.min(160, w / 4),
              y + h - 70,
              'detail',
              0
            ),
          ]
        : [
            edge(
              side === 'left' ? x + 70 : x + w - 70,
              y + h - 120,
              side === 'left' ? x + 70 : x + w - 70,
              y + h - 120 - Math.min(320, h / 3),
              'detail',
              0
            ),
          ];

const front = (
  fronts: Fronts,
  x: number,
  y: number,
  w: number,
  h: number,
  side: 'top' | 'left' | 'right'
): { lines: Line[]; boxes: Box[] } => ({
  lines: [
    ...outline(x + 4, y + 4, w - 8, h - 8, 'front', 10),
    ...handle(fronts, x + 4, y + 4, w - 8, h - 8, side),
  ],
  boxes: [fill(x + 4, y + 4, w - 8, h - 8, 'front')],
});

const merge = (
  ...parts: { lines?: Line[]; boxes?: Box[]; labels?: Label[] }[]
) => ({
  lines: parts.flatMap((_) => _.lines ?? []),
  boxes: parts.flatMap((_) => _.boxes ?? []),
  labels: parts.flatMap((_) => _.labels ?? []),
});

const tag = (x: number, y: number, text: string): Label => ({
  x,
  y: sy(y),
  text,
  kind: 'tag',
});

const base = (fronts: Fronts, kind: Base, x: number, w: number) => {
  const h = BASE - PLINTH;
  const doors = (count: number) =>
    merge(
      ...Array.from({ length: count }, (_, index) =>
        front(
          fronts,
          x + (w / count) * index,
          PLINTH,
          w / count,
          h,
          index === 0 && count > 1 ? 'right' : 'left'
        )
      )
    );
  const drawers = merge(
    front(fronts, x, PLINTH, w, 280, 'top'),
    front(fronts, x, PLINTH + 280, w, 280, 'top'),
    front(fronts, x, PLINTH + 560, w, h - 560, 'top')
  );
  const TABLE: Record<Base, () => ReturnType<typeof merge>> = {
    drawers: () => drawers,
    door: () => doors(1),
    sink: () =>
      merge(doors(w > 600 ? 2 : 1), {
        // Armatur: Schwanenhals über der Arbeitsplatte
        lines: [
          {
            d: `M${n(x + w / 2 - 40)} ${n(sy(WORKTOP))}L${n(x + w / 2 - 40)} ${n(sy(WORKTOP + 230))}q0 -90 90 -90q80 0 80 80`,
            kind: 'detail',
          },
          edge(
            x + w / 2 - 70,
            WORKTOP + 2,
            x + w / 2 - 10,
            WORKTOP + 2,
            'detail',
            0
          ),
        ],
        labels: [tag(x + w / 2, PLINTH + h / 2, 'SP')],
      }),
    dishwasher: () =>
      merge(front(fronts, x, PLINTH, w, h, 'top'), {
        labels: [tag(x + w / 2, PLINTH + h / 2 - 80, 'GS')],
      }),
    hob: () =>
      merge(drawers, {
        lines: [
          edge(x + 90, WORKTOP + 8, x + w - 90, WORKTOP + 8, 'appliance', 0),
        ],
        labels: [tag(x + w / 2, WORKTOP + 60, 'KF')],
      }),
    oven: () =>
      merge(
        front(fronts, x, PLINTH, w, 230, 'top'),
        {
          lines: [
            ...outline(x + 20, PLINTH + 250, w - 40, h - 270, 'appliance', 8),
            ...outline(x + 90, PLINTH + 320, w - 180, h - 470, 'detail', 6),
            edge(x + 110, BASE - 70, x + w - 110, BASE - 70, 'appliance', 0),
          ],
          boxes: [fill(x + 90, PLINTH + 320, w - 180, h - 470, 'glass')],
          labels: [tag(x + w / 2, PLINTH + 440, 'BO')],
        },
        {
          lines: [
            edge(x + 90, WORKTOP + 8, x + w - 90, WORKTOP + 8, 'appliance', 0),
          ],
        }
      ),
    gap: () => ({
      lines: outline(x + 30, PLINTH, w - 60, h, 'gap', 0),
      boxes: [],
      labels: [
        { x: x + w / 2, y: sy(PLINTH + h / 2 - 90), text: '?', kind: 'gap' },
      ],
    }),
  };
  return TABLE[kind]();
};

const wall = (fronts: Fronts, kind: Wall, x: number, w: number) => {
  const h = WALL_HIGH - WALL_LOW;
  const TABLE: Record<Wall, () => ReturnType<typeof merge>> = {
    cabinet: () =>
      merge(
        ...((count) =>
          Array.from({ length: count }, (_, index) =>
            front(
              fronts,
              x + (w / count) * index,
              WALL_LOW,
              w / count,
              h,
              index === 0 && count > 1 ? 'right' : 'left'
            )
          ))(w > 600 ? 2 : 1),
        { lines: outline(x, WALL_LOW, w, h, 'carcass') }
      ),
    hood: () => ({
      lines: [
        {
          d: `M${n(x + 60)} ${n(sy(WALL_LOW + 80))}L${n(x + w - 60)} ${n(sy(WALL_LOW + 80))}L${n(x + w / 2 + 170)} ${n(sy(WALL_LOW + 330))}L${n(x + w / 2 - 170)} ${n(sy(WALL_LOW + 330))}Z`,
          kind: 'appliance',
        },
        ...outline(
          x + w / 2 - 130,
          WALL_LOW + 330,
          260,
          CEILING - WALL_LOW - 330,
          'appliance',
          0
        ),
      ],
      boxes: [],
      labels: [tag(x + w / 2, WALL_LOW + 130, 'DA')],
    }),
    window: () => ({
      lines: [
        ...outline(
          x + 60,
          WORKTOP + 160,
          w - 120,
          WALL_HIGH - WORKTOP - 160,
          'carcass'
        ),
        ...outline(
          x + 110,
          WORKTOP + 210,
          w - 220,
          WALL_HIGH - WORKTOP - 260,
          'detail',
          8
        ),
        edge(x + w / 2, WORKTOP + 210, x + w / 2, WALL_HIGH - 50, 'detail', 0),
        edge(x + 40, WORKTOP + 160, x + w - 40, WORKTOP + 160, 'carcass', 0),
      ],
      boxes: [
        fill(
          x + 110,
          WORKTOP + 210,
          w - 220,
          WALL_HIGH - WORKTOP - 260,
          'glass'
        ),
      ],
      labels: [],
    }),
    shelf: () => ({
      lines: [
        edge(x + 20, WALL_LOW + 80, x + w - 20, WALL_LOW + 80, 'carcass', 8),
        edge(x + 20, WALL_LOW + 440, x + w - 20, WALL_LOW + 440, 'carcass', 8),
        ...Array.from({ length: Math.floor((w - 100) / 150) }, (_, index) => ({
          // Gläser und Teller auf dem Bord
          d:
            index % 2 === 0
              ? `M${n(x + 80 + index * 150)} ${n(sy(WALL_LOW + 80))}l0 -150l90 0l0 150`
              : `M${n(x + 85 + index * 150)} ${n(sy(WALL_LOW + 440))}a70 110 0 1 1 1 0`,
          kind: 'detail',
        })),
      ],
      boxes: [],
      labels: [],
    }),
    none: () => ({ lines: [], boxes: [], labels: [] }),
  };
  return TABLE[kind]();
};

const tall = (fronts: Fronts, kind: Tall, x: number, w: number) => {
  const h = WALL_HIGH - PLINTH;
  const TABLE: Record<Tall, () => ReturnType<typeof merge>> = {
    fridge: () =>
      merge(
        front(fronts, x, PLINTH, w, 1150, 'right'),
        front(fronts, x, PLINTH + 1150, w, h - 1150, 'right'),
        {
          labels: [tag(x + w / 2, PLINTH + 1500, 'KS')],
        }
      ),
    ovens: () =>
      merge(
        front(fronts, x, PLINTH, w, 700, 'top'),
        front(fronts, x, WALL_HIGH - 420, w, 420, 'left'),
        {
          lines: [
            ...outline(x + 20, PLINTH + 720, w - 40, 590, 'appliance', 8),
            ...outline(x + 80, PLINTH + 790, w - 160, 400, 'detail', 6),
            edge(
              x + 100,
              PLINTH + 1255,
              x + w - 100,
              PLINTH + 1255,
              'appliance',
              0
            ),
            ...outline(x + 20, PLINTH + 1330, w - 40, 400, 'appliance', 8),
            ...outline(x + 80, PLINTH + 1390, w - 200, 280, 'detail', 6),
          ],
          boxes: [
            fill(x + 80, PLINTH + 790, w - 160, 400, 'glass'),
            fill(x + 80, PLINTH + 1390, w - 200, 280, 'glass'),
          ],
          labels: [
            tag(x + w / 2, PLINTH + 960, 'BO'),
            tag(x + w / 2, PLINTH + 1500, 'MW'),
          ],
        }
      ),
    pantry: () =>
      merge(
        front(fronts, x, PLINTH, w, 1150, 'left'),
        front(fronts, x, PLINTH + 1150, w, h - 1150, 'left')
      ),
  };
  return merge(TABLE[kind](), { lines: outline(x, PLINTH, w, h, 'carcass') });
};

// Maßkette unter der Zeichnung: Schrägstriche an den Teilungen, Zahlen in Millimetern.
const chain = (
  cuts: number[],
  y: number,
  kind: string
): { lines: Line[]; labels: Label[] } => ({
  lines: [
    edge(cuts[0]!, y, cuts.at(-1)!, y, kind, 60),
    ...cuts.flatMap((x) => [
      edge(x, y - 45, x, y + 45, kind, 0),
      {
        d: `M${n(x - 28)} ${n(sy(y - 28))}L${n(x + 28)} ${n(sy(y + 28))}`,
        kind: `${kind} tick`,
      },
    ]),
  ],
  labels: cuts.slice(1).map((x, index) => ({
    x: (cuts[index]! + x) / 2,
    y: sy(y + 30),
    text: String(x - cuts[index]!),
    kind: 'dim',
  })),
});

const rise = (
  heights: number[],
  x: number
): { lines: Line[]; labels: Label[] } => ({
  lines: [
    edge(x, 0, x, heights.at(-1)!, 'dim', 60),
    ...heights.flatMap((y) => [
      edge(x - 45, y, x + 45, y, 'dim', 0),
      {
        d: `M${n(x - 28)} ${n(sy(y - 28))}L${n(x + 28)} ${n(sy(y + 28))}`,
        kind: 'dim tick',
      },
    ]),
  ],
  labels: heights.map((y, index) => ({
    x: x - 40,
    y: sy(((heights[index - 1] ?? 0) + y) / 2),
    text: String(y - (heights[index - 1] ?? 0)),
    kind: 'dim rise',
    anchor: 'end',
  })),
});

const kitchen = (key: string): Drawing => {
  const { fronts, columns } = KITCHENS[key] ?? KITCHENS.zeile!;
  const cuts = columns.reduce<number[]>(
    (acc, _) => [...acc, acc.at(-1)! + _.w],
    [0]
  );
  const total = cuts.at(-1)!;
  const units = merge(
    ...columns.map((column, index) => {
      const x = cuts[index]!;
      return column.tall
        ? tall(fronts, column.tall, x, column.w)
        : merge(
            column.base ? base(fronts, column.base, x, column.w) : {},
            column.base && column.base !== 'gap'
              ? {
                  lines: outline(x, PLINTH, column.w, BASE - PLINTH, 'carcass'),
                }
              : {},
            column.wall ? wall(fronts, column.wall, x, column.w) : {}
          );
    })
  );
  // Arbeitsplatte: durchgehend zwischen den Hochschränken
  const runs = columns
    .map((_, index) => ({ ..._, x: cuts[index]! }))
    .filter((_) => !_.tall)
    .reduce<{ x: number; w: number }[]>(
      (acc, _) =>
        acc.length && acc.at(-1)!.x + acc.at(-1)!.w === _.x
          ? [...acc.slice(0, -1), { x: acc.at(-1)!.x, w: acc.at(-1)!.w + _.w }]
          : [...acc, { x: _.x, w: _.w }],
      []
    );
  const worktop = merge(
    ...runs.map((_) => ({
      lines: outline(_.x - 10, BASE, _.w + 20, WORKTOP - BASE, 'carcass'),
      boxes: [fill(_.x - 10, BASE, _.w + 20, WORKTOP - BASE, 'worktop')],
    }))
  );
  const grips =
    fronts === 'grifflos'
      ? {
          lines: runs.flatMap((_) => [
            edge(_.x, BASE - 45, _.x + _.w, BASE - 45, 'detail', 0),
            edge(_.x, PLINTH + 560, _.x + _.w, PLINTH + 560, 'detail', 0),
          ]),
        }
      : {};
  // Insel mit erhöhter Theke vor der Zeile; Keramikspüle der Landhausküche vor den Türen.
  const left = total * 0.18;
  const width = total * 0.64;
  const sink = columns.findIndex((_) => _.base === 'sink');
  const over =
    key === 'insel'
      ? merge(
          {
            boxes: [
              fill(left - 30, 0, width + 60, 1150, 'paper'),
              fill(left - 30, BASE, width + 60, 40, 'worktop'),
              fill(left + width * 0.55, 1110, width * 0.45 + 30, 40, 'worktop'),
            ],
            lines: [
              ...outline(left, PLINTH, width, BASE - PLINTH, 'carcass'),
              ...outline(left - 30, BASE, width + 60, 40, 'carcass'),
              ...outline(
                left + width * 0.55,
                1110,
                width * 0.45 + 30,
                40,
                'carcass'
              ),
              edge(
                left + width * 0.55 + 40,
                910,
                left + width * 0.55 + 40,
                1110,
                'carcass',
                0
              ),
              edge(
                left + width - 40,
                910,
                left + width - 40,
                1110,
                'carcass',
                0
              ),
              edge(left, PLINTH, left + width, PLINTH, 'plinth', 0),
            ],
          },
          ...[0, 1, 2, 3].map((index) =>
            front(
              fronts,
              left + (width / 4) * index,
              PLINTH,
              width / 4,
              BASE - PLINTH,
              'top'
            )
          )
        )
      : fronts === 'landhaus' && sink >= 0
        ? ((x, w) => ({
            lines: outline(x + 60, BASE - 230, w - 120, 230, 'carcass', 12),
            boxes: [fill(x + 60, BASE - 230, w - 120, 230, 'paper')],
            labels: [],
          }))(cuts[sink]!, columns[sink]!.w)
        : merge();
  const room = {
    lines: [
      edge(-260, 0, total + 260, 0, 'room', 0),
      edge(-140, CEILING, total + 140, CEILING, 'ceiling', 0),
      edge(0, 0, total, 0, 'plinth', 0),
      edge(0, PLINTH, total, PLINTH, 'plinth', 0),
    ],
  };
  const dims = merge(
    chain(cuts, -190, 'dim'),
    chain([0, total], -400, 'dim'),
    rise([WORKTOP, WALL_HIGH], -230)
  );
  const all = merge(room, units, worktop, grips, dims);
  // Beschriftungen hinter der Insel sind verdeckt.
  const hidden = (_: Label) =>
    key === 'insel' &&
    _.kind === 'tag' &&
    _.x > left &&
    _.x < left + width &&
    _.y > sy(1150);
  return {
    ...all,
    labels: all.labels.filter((_) => !hidden(_)),
    over,
    box: `-520 0 ${total + 780} ${TOP + 520}`,
  };
};

// Ladenfront: Schild mit dem Namen des Studios, Schaufenster mit einer kleinen Küche, Tür.
const shop = (name: string): Drawing => {
  const W = 6200;
  const mini = (x: number, w: number): Line[] => [
    ...[0, 1, 2, 3].flatMap((index) =>
      outline(x + (w / 4) * index, 120, w / 4, 620, 'detail', 6)
    ),
    ...outline(x - 10, 740, w + 20, 40, 'detail', 6),
    ...[0, 1, 2].flatMap((index) =>
      outline(x + (w / 3) * index, 1250, w / 3, 520, 'detail', 6)
    ),
  ];
  return {
    lines: [
      edge(-400, 0, W + 400, 0, 'room', 0),
      ...outline(0, 0, W, 3600, 'carcass'),
      ...outline(250, 2750, W - 500, 560, 'carcass'),
      ...outline(400, 300, 3500, 2250, 'carcass'),
      edge(400, 2000, 3900, 2000, 'detail', 0),
      ...mini(900, 2500),
      ...outline(4400, 0, 1300, 2550, 'carcass'),
      ...outline(4560, 160, 980, 2230, 'detail', 8),
      edge(4640, 1100, 4640, 1500, 'appliance', 0),
      ...outline(5150, 1500, 260, 340, 'detail', 4),
      edge(200, 300, 4100, 300, 'carcass', 0),
      { d: `M${n(4300)} ${n(sy(0))}l0 -60l1500 0l0 60`, kind: 'carcass' },
    ],
    boxes: [
      fill(0, 0, W, 3600, 'paper'),
      fill(250, 2750, W - 500, 560, 'signboard'),
      fill(400, 300, 3500, 2250, 'glass'),
      fill(4560, 160, 980, 2230, 'glass'),
    ],
    labels: [
      // Langer Name wird kleiner gesetzt, damit er auf das Schild passt.
      {
        x: W / 2,
        y: sy(2945),
        text: name,
        kind: 'sign',
        size: Math.min(300, Math.round(9000 / Math.max(name.length, 1))),
      },
      { x: 5280, y: sy(1640), text: 'Termin', kind: 'tag small' },
    ],
    over: merge(),
    box: `-500 -200 ${W + 1000} ${3600 + 800}`,
  };
};

const drawing = $derived(
  motif === 'laden' ? shop(site().name) : kitchen(motif)
);
const groups = (kinds: string[]) =>
  drawing.lines.filter((_) => kinds.some((kind) => _.kind.startsWith(kind)));
</script>

<svg
  class="sketch"
  class:plain
  class:fill={crop === 'fill'}
  viewBox={drawing.box}
  preserveAspectRatio={crop === 'fill' ? 'xMidYMid slice' : 'xMidYMid meet'}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  <g class="boxes">
    {#each drawing.boxes as box, index (index)}
      <rect class={box.kind} x={box.x} y={box.y} width={box.w} height={box.h} />
    {/each}
  </g>
  {#each [['room', 'ceiling', 'plinth'], ['carcass'], ['front', 'appliance'], ['detail', 'gap'], ['dim']] as kinds, step (step)}
    <g class="lines step-{step}">
      {#each groups(kinds) as line, index (index)}
        <path class={line.kind} d={line.d} pathLength="1" />
      {/each}
    </g>
  {/each}
  <g class="over step-3">
    {#each drawing.over.boxes as box, index (index)}
      <rect class={box.kind} x={box.x} y={box.y} width={box.w} height={box.h} />
    {/each}
    {#each drawing.over.lines as line, index (index)}
      <path class={line.kind} d={line.d} pathLength="1" />
    {/each}
  </g>
  {#if !plain}
    <g class="labels">
      {#each drawing.labels as text, index (index)}
        <text class={text.kind} x={text.x} y={text.y} text-anchor={text.anchor ?? 'middle'} style:font-size={text.size ? `${text.size}px` : undefined}>{text.text}</text>
      {/each}
    </g>
  {/if}
</svg>

<style>
  .sketch {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    color: currentColor;
  }

  .sketch.fill {
    height: 100%;
    overflow: hidden;
  }

  path {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  .carcass,
  .room {
    stroke-width: 1.5;
  }

  .front,
  .appliance {
    stroke-width: 1;
  }

  .detail,
  .plinth {
    stroke-width: 0.8;
    opacity: 0.85;
  }

  .ceiling {
    stroke-width: 0.8;
    stroke-dasharray: 0.012 0.008;
    opacity: 0.5;
  }

  .dim {
    stroke-width: 0.7;
    opacity: 0.75;
  }

  .tick {
    stroke-width: 1.2;
  }

  .gap {
    stroke-dasharray: 0.02 0.015;
  }

  rect {
    stroke: none;
  }

  rect.front {
    fill: color-mix(in oklab, currentColor 7%, transparent);
  }

  rect.worktop {
    fill: color-mix(in oklab, currentColor 18%, transparent);
  }

  rect.glass {
    fill: color-mix(in oklab, currentColor 6%, transparent);
  }

  rect.paper {
    fill: var(--paper, transparent);
  }

  rect.signboard {
    fill: color-mix(in oklab, currentColor 14%, transparent);
  }

  .plain rect {
    fill: none;
  }

  text {
    fill: currentColor;
    font-family: var(--display, system-ui, sans-serif);
    font-size: 78px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .tag {
    font-size: 70px;
    opacity: 0.7;
  }

  .tag.small {
    font-size: 54px;
  }

  .rise {
    dominant-baseline: middle;
  }

  text.gap {
    font-size: 260px;
    opacity: 0.6;
  }

  .sign {
    font-size: 300px;
    font-weight: 600;
    letter-spacing: 0.06em;
    dominant-baseline: middle;
  }
</style>
