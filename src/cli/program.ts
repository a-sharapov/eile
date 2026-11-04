// Имена команды: `cms` и второе имя `eile` — ссылка на него рядом (install.sh, ADR 0023), на Windows —
// жёсткая ссылка `eile.exe` (ADR 0049).
const _NAMES: ReadonlySet<string> = new Set(['cms', 'eile']);

/**
 * Имя, под которым запустили программу; из исходников (`bun src/main.ts`) и под чужим именем — cms.
 * На Windows argv0 — набранное `eile` или `C:\…\eile.exe`: каталог отрезается по обоим разделителям,
 * `.exe` и регистр не в счёт.
 */
export var programName = (argv0: string): string =>
  ((name) => (_NAMES.has(name) ? name : 'cms'))(
    (argv0.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '').toLowerCase()
  );

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
