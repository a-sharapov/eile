import { pipe } from '../shared/kernel/pipe.ts';

/** Результат конвертации элемента Evo в Svelte и то, что перенести не удалось. */
export type Converted = {
  readonly source: string;
  readonly components: readonly string[];
  readonly snippets: readonly string[];
};

// Стандартные поля документа Evo → поля PageView.
const _FIELDS: Readonly<Record<string, string>> = {
  id: 'id',
  pagetitle: 'title',
  longtitle: 'longTitle',
  description: 'description',
  introtext: 'introText',
  menutitle: 'menuTitle',
  alias: 'alias',
  publishedon: 'publishedAt',
  createdon: 'createdAt',
  editedon: 'updatedAt',
};

// В шаблоне настройки — prop `site`, в компоненте — функция `site()` из `$core`.
const _SETTINGS: Readonly<Record<string, (site: string) => string>> = {
  site_name: (site) => `{${site}.name}`,
  site_url: () => '/',
  base_url: () => '/',
};

// Вложенные ссылки Evo: на текущую страницу и на главную.
const _LINKS: Readonly<Record<string, string>> = {
  '[*id*]': "{@html link(page.id) ?? ''}",
  '[(site_start)]': '/',
};

const _TAG =
  /\[\*([^*\]]+)\*\]|\[\(([^)\]]+)\)\]|\{\{([^}]+)\}\}|\[~(\d+|\[\*id\*\]|\[\(site_start\)\])~\]|\[!([\s\S]+?)!\]|\[\[([\s\S]+?)\]\]|\[\+([^+\]]+)\+\]/g;

/** `footer-menu`, `Main menu` → `FooterMenu`, `MainMenu`: Svelte-компонент — PascalCase. */
export var pascalCase = (name: string): string =>
  pipe(
    (_: string) => _.replace(/[^A-Za-z0-9]+/g, ' ').trim(),
    (_: string) =>
      _.split(' ')
        .filter(Boolean)
        .map((word) => word[0]!.toUpperCase() + word.slice(1))
        .join(''),
    (_: string) => (/^[A-Z]/.test(_) ? _ : `E${_}`)
  )(name) || 'Element';

/** Имя TV → имя поля: `main-image` → `mainImage`. */
export var camelCase = (name: string): string =>
  pipe(pascalCase, (_: string) => _[0]!.toLowerCase() + _.slice(1))(name);

const _html = (text: string): string =>
  text ? `{@html ${JSON.stringify(text)}}` : '';

// `name:modifier=`x`` и `name? &a=`b`` — нужны только имя и параметры.
const _name = (raw: string): string => raw.trim().split(/[:?\s]/)[0]!;

const _pairs = (raw: string) =>
  [...raw.matchAll(/&([\w-]+)=`([^`]*)`/g)].map(({ 1: name, 2: value }) => ({
    name: camelCase(name!),
    value: value!,
  }));

// В шаблоне значение — выражением со строкой JS: в кавычках атрибута Svelte вычислил бы `{…}` из дампа.
const _attributes = (raw: string): string =>
  _pairs(raw)
    .map(({ name, value }) => ` ${name}={${JSON.stringify(value)}}`)
    .join('');

// В тексте страницы — тег контента `[[Name prop="x"]]`: он не компилируется, значения — данные.
const _tagProps = (raw: string): string =>
  _pairs(raw)
    .map(({ name, value }) => ` ${name}=${JSON.stringify(value)}`)
    .join('');

// Таблицы — обычные объекты: `[(__proto__)]` из дампа не должен найти в них Object.prototype.
const _own = <T>(
  table: Readonly<Record<string, T>>,
  key: string
): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

// Комментарий с текстом из дампа — строкой JS в `{@html}`: ни `-->`, ни `{…}` не станут кодом шаблона.
const _comment = (text: string): string =>
  _html(`<!-- ${text.replaceAll('--', '- -').trim()} -->`);

type Piece = {
  readonly code: string;
  readonly component?: string;
  readonly snippet?: string;
};

const _piece = (
  match: RegExpMatchArray,
  chunks: ReadonlyMap<string, string>,
  kind: 'template' | 'component'
): Piece => {
  const {
    1: field,
    2: setting,
    3: chunk,
    4: link,
    5: uncached,
    6: snippet,
    7: placeholder,
  } = match;
  const fieldName = field === undefined ? '' : _name(field);
  // Чанк Evo видел текущий документ; компонент получает его prop `page`, которого может не быть.
  const _access = kind === 'template' ? '.' : '?.';
  const component =
    chunk === undefined
      ? ''
      : (chunks.get(_name(chunk)) ?? pascalCase(_name(chunk)));
  return field !== undefined
    ? {
        code:
          fieldName === 'content'
            ? '<Content of={page} />'
            : `{${_own(_FIELDS, fieldName) ? `page${_access}${_own(_FIELDS, fieldName)}` : `page${_access}fields${_access}${camelCase(fieldName)}`}}`,
      }
    : setting !== undefined
      ? {
          code:
            _own(
              _SETTINGS,
              _name(setting)
            )?.(kind === 'template' ? 'site' : 'site()') ??
            _comment(`Evo setting: ${_name(setting)}`),
        }
      : chunk !== undefined
        ? { code: `<${component} {page}${_attributes(chunk)} />`, component }
        : link !== undefined
          ? { code: _own(_LINKS, link) ?? `{@html link(${link}) ?? ''}` }
          : placeholder !== undefined
            ? {
                code:
                  kind === 'component'
                    ? `{${camelCase(_name(placeholder))}}`
                    : _comment(`Evo placeholder: ${_name(placeholder)}`),
              }
            : {
                code: _comment(`Evo snippet: ${uncached ?? snippet}`),
                snippet: _name(uncached ?? snippet!),
              };
};

const _body = (
  text: string,
  chunks: ReadonlyMap<string, string>,
  kind: 'template' | 'component'
) => {
  const matches = [...text.matchAll(_TAG)];
  const folded = matches.reduce<{ code: string; at: number; pieces: Piece[] }>(
    (acc, match) => {
      const piece = _piece(match, chunks, kind);
      return {
        code: acc.code + _html(text.slice(acc.at, match.index)) + piece.code,
        at: match.index + match[0].length,
        pieces: [...acc.pieces, piece],
      };
    },
    { code: '', at: 0, pieces: [] }
  );
  return {
    code: folded.code + _html(text.slice(folded.at)),
    pieces: folded.pieces,
  };
};

const _between = (html: string, open: RegExp, close: string): string | null => {
  const start = open.exec(html);
  const end = html.toLowerCase().lastIndexOf(close);
  return start && end > start.index
    ? html.slice(start.index + start[0].length, end)
    : null;
};

const _script = (imports: readonly string[], props: string): string =>
  ['<script>', ...imports, props, '</script>', ''].join('\n');

/**
 * Шаблон или чанк Evo → Svelte. Текст идёт в `{@html "…"}`: фигурные скобки и `<script>` старых шаблонов
 * не ломают компилятор, а сервер просто склеивает строки.
 */
export var convertElement = (
  html: string,
  kind: 'template' | 'component',
  chunks: ReadonlyMap<string, string>
): Converted => {
  const head =
    kind === 'template' ? _between(html, /<head[^>]*>/i, '</head>') : null;
  const body =
    head === null ? html : (_between(html, /<body[^>]*>/i, '</body>') ?? '');
  const converted = {
    head: head === null ? null : _body(head, chunks, kind),
    body: _body(body, chunks, kind),
  };
  const pieces = [...(converted.head?.pieces ?? []), ...converted.body.pieces];
  const code =
    (converted.head
      ? `<svelte:head>${converted.head.code}</svelte:head>\n`
      : '') + converted.body.code;
  const components = [
    ...new Set(pieces.map((_) => _.component).filter((_): _ is string => !!_)),
  ];
  const placeholders = [
    ...new Set(
      [...body.matchAll(/\[\+([^+\]]+)\+\]/g)].map((_) =>
        camelCase(_name(_[1]!))
      )
    ),
  ];
  const imports = [
    ...(code.includes('<Content ')
      ? ["import Content from '$core/Content';"]
      : []),
    ...(code.includes('link(') || code.includes('site()')
      ? [
          `import { ${[code.includes('link(') && 'link', code.includes('site()') && 'site'].filter(Boolean).join(', ')} } from '$core';`,
        ]
      : []),
    ...components.map((_) => `import ${_} from '$components/${_}';`),
  ];
  const props =
    kind === 'template'
      ? 'let { page, site } = $props();'
      : `let { ${['page', ...placeholders].join(', ')} } = $props();`;
  return {
    source: _script(imports, props) + code + '\n',
    components,
    snippets: [
      ...new Set(pieces.map((_) => _.snippet).filter((_): _ is string => !!_)),
    ],
  };
};

/** Контент страницы: чанки — теги `[[Name]]` для `<Content>`; ссылки `[~id~]` остаются — их адрес подставит рендер. */
export var convertContent = (
  html: string,
  chunks: ReadonlyMap<string, string>
): { readonly html: string; readonly snippets: readonly string[] } => {
  const snippets = [
    ...html.matchAll(/\[!([\s\S]+?)!\]|\[\[([\s\S]+?)\]\]/g),
  ].map((_) => _name(_[1] ?? _[2]!));
  return {
    html: html
      // Сниппеты — до чанков: иначе в комментарий попали бы и теги `[[Name]]`, полученные из чанков.
      .replace(
        /\[!([\s\S]+?)!\]|\[\[([\s\S]+?)\]\]/g,
        (match) => `<!-- Evo snippet: ${match.replaceAll('--', '- -')} -->`
      )
      .replace(
        /\{\{([^}]+)\}\}/g,
        (_match, raw: string) =>
          `[[${chunks.get(_name(raw)) ?? pascalCase(_name(raw))}${_tagProps(raw)}]]`
      ),
    snippets: [...new Set(snippets)],
  };
};
