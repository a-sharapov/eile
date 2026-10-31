import { basename } from 'node:path';

// Имена команды: `cms` и второе имя `eile` — ссылка на него рядом (install.sh, ADR 0023).
const _NAMES: ReadonlySet<string> = new Set(['cms', 'eile']);

/** Имя, под которым запустили программу; из исходников (`bun src/main.ts`) и под чужим именем — cms. */
export var programName = (argv0: string): string =>
  ((name) => (_NAMES.has(name) ? name : 'cms'))(basename(argv0));

export var PROGRAM = programName(process.argv0);

// Вызов cms в тексте — слово целиком, в том числе в цвете. Пути (/var/lib/cms), файлы (cms-<дата>.db,
// cms.old) и переменные (CMS_DB) — не вызовы.
const _ESC = String.fromCharCode(27);
const _CALL = new RegExp(
  `(?<=^|[\\s(\`'"|&;]|${_ESC}\\[[0-9;]*m)cms(?=$|[\\s)\`'",:;]|${_ESC}|\\.(?:\\s|$))`,
  'g'
);

/** Справка, подсказка или ошибка с вызовами `cms …` под тем именем, которым запустили программу. */
export var named =
  (name: string) =>
  (text: string): string =>
    name === 'cms' ? text : text.replace(_CALL, name);
