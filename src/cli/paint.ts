// Цвет в терминале: акценты справки и MOTD. В трубу и в журнал — чистый текст.

export type Env = Readonly<Record<string, string | undefined>>;

/** NO_COLOR (непустой) выключает цвет, FORCE_COLOR включает (кроме «0» и «false»), иначе — только в TTY. */
export var colorsWanted = (env: Env, tty: boolean): boolean =>
  env.NO_COLOR
    ? false
    : env.FORCE_COLOR !== undefined
      ? !['0', 'false'].includes(env.FORCE_COLOR)
      : tty;

const _STYLES = {
  bold: '1',
  dim: '2',
  /** Знак и название — спокойный синий, читается и на тёмном, и на светлом фоне. */
  accent: '1;38;5;68',
  command: '1;36',
  flag: '33',
  path: '4',
  ok: '32',
  warn: '33',
  error: '1;31',
} as const;

export type Paint = Readonly<
  Record<keyof typeof _STYLES, (text: string) => string>
>;

export var definePaint = (enabled: boolean): Paint =>
  Object.fromEntries(
    Object.entries(_STYLES).map(({ 0: name, 1: code }) => [
      name,
      enabled
        ? (text: string) => `\x1b[${code}m${text}\x1b[0m`
        : (text: string) => text,
    ])
  ) as unknown as Paint;

const _ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Видимая ширина строки: без управляющих последовательностей цвета. */
export var visibleLength = (text: string): number =>
  [...text.replace(_ANSI, '')].length;

/** Добивает пробелами до видимой ширины: колонки ровные и с цветом, и без. */
export var padEnd = (text: string, width: number): string =>
  `${text}${' '.repeat(Math.max(0, width - visibleLength(text)))}`;
