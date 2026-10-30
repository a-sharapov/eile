/** Значение из дампа MySQL. */
export type SqlValue = string | number | null;

export type SqlRow = Readonly<Record<string, SqlValue>>;

/** Таблицы дампа: строки по именам колонок. */
export type SqlTables = ReadonlyMap<string, readonly SqlRow[]>;

const _ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  '0': '\0',
  Z: '\x1a',
  _: '',
};

type Cursor = { readonly sql: string; at: number };

// Разбор — автомат по символам: так проще всего не ошибиться в кавычках и экранировании mysqldump.
const _skipSpace = (c: Cursor): void => {
  while (c.at < c.sql.length && /\s/.test(c.sql[c.at]!)) c.at++;
};

const _string = (c: Cursor): string => {
  let out = '';
  c.at++;
  while (c.at < c.sql.length) {
    const ch = c.sql[c.at]!;
    if (ch === '\\') {
      const next = c.sql[c.at + 1]!;
      out += _ESCAPES[next] ?? next;
      c.at += 2;
    } else if (ch === "'" && c.sql[c.at + 1] === "'") {
      out += "'";
      c.at += 2;
    } else if (ch === "'") {
      c.at++;
      return out;
    } else {
      out += ch;
      c.at++;
    }
  }
  return out;
};

const _bare = (c: Cursor): SqlValue => {
  const start = c.at;
  while (c.at < c.sql.length && !/[,)\s]/.test(c.sql[c.at]!)) c.at++;
  const word = c.sql.slice(start, c.at);
  return word.toUpperCase() === 'NULL' ? null : Number(word);
};

const _tuple = (c: Cursor): SqlValue[] => {
  const values: SqlValue[] = [];
  c.at++;
  while (c.at < c.sql.length) {
    _skipSpace(c);
    const ch = c.sql[c.at];
    if (ch === ')') {
      c.at++;
      return values;
    }
    if (ch === ',') {
      c.at++;
      continue;
    }
    values.push(ch === "'" ? _string(c) : _bare(c));
  }
  return values;
};

// Незакрытый CREATE или ALTER тянется до конца текста одним совпадением, а не пересматривает хвост.
const _CREATE =
  /CREATE TABLE(?: IF NOT EXISTS)? `([^`]+)` \(((?:[^\n]|\n(?!\)))*)(?:\n\)|$)/g;
const _INSERT =
  /(?:INSERT|REPLACE)(?: IGNORE)? INTO `([^`]+)`\s*(?:\(([^)]*)\))?\s*VALUES\s*/gi;

// Установщик Evo достраивает схему ALTER-ами: ADD COLUMN `x` … [AFTER `y` | FIRST].
const _ALTER =
  /ALTER TABLE `([^`]+)`\s+ADD(?: COLUMN)?\s+`([^`]+)`([^;]*)(?:;|$)/gi;
const _AFTER = /AFTER `([^`]+)`/i;
const _FIRST = /\bFIRST\s*$/i;

const _addColumn = (
  columns: readonly string[],
  name: string,
  after: string | undefined,
  first: boolean
): string[] =>
  columns.includes(name)
    ? [...columns]
    : first
      ? [name, ...columns]
      : after !== undefined && columns.includes(after)
        ? columns.flatMap((_) => (_ === after ? [_, name] : [_]))
        : [...columns, name];

const _columnsOf = (body: string): string[] =>
  body
    .split('\n')
    .map((_) => /^\s*`([^`]+)`/.exec(_)?.[1])
    .filter((_): _ is string => _ !== undefined);

/** Строки всех INSERT дампа; порядок колонок — из CREATE TABLE или из списка в самом INSERT. */
export var parseDump = (sql: string): SqlTables => {
  const created = new Map(
    [...sql.matchAll(_CREATE)].map((_) => [_[1]!, _columnsOf(_[2]!)] as const)
  );
  const columns = [...sql.matchAll(_ALTER)].reduce(
    (map, { 1: table, 2: name, 3: rest }) =>
      map.has(table!)
        ? new Map(map).set(
            table!,
            _addColumn(
              map.get(table!)!,
              name!,
              _AFTER.exec(rest ?? '')?.[1],
              _FIRST.test(rest ?? '')
            )
          )
        : map,
    created
  );
  const tables = new Map<string, SqlRow[]>();
  for (const match of sql.matchAll(_INSERT)) {
    const table = match[1]!;
    const names =
      match[2]?.split(',').map((_) => _.trim().replaceAll('`', '')) ??
      columns.get(table) ??
      [];
    const c: Cursor = { sql, at: match.index + match[0].length };
    const rows = tables.get(table) ?? [];
    while (c.at < sql.length) {
      _skipSpace(c);
      if (sql[c.at] !== '(') break;
      const values = _tuple(c);
      rows.push(
        Object.fromEntries(names.map((name, i) => [name, values[i] ?? null]))
      );
      _skipSpace(c);
      if (sql[c.at] === ',') c.at++;
    }
    tables.set(table, rows);
  }
  return tables;
};

/** Префикс таблиц Evo (`modx_`) — всё, что стоит перед `site_content`. */
export var evoPrefix = (tables: SqlTables): string | null => {
  const name = [...tables.keys()].find((_) => _.endsWith('site_content'));
  return name === undefined ? null : name.slice(0, -'site_content'.length);
};
