import { attempt, fail } from '../../../shared/kernel/errors.ts';
import { parseUrlList, type UrlEntry } from '../domain/redirect-check.ts';

/** Скачать файл по адресу: sitemap из индекса или сам список. */
export type Load = (url: string) => Promise<Uint8Array>;

// Индекс sitemap ведёт на другие sitemap; глубже двух уровней и шире сотни файлов — уже не sitemap сайта.
const _DEPTH = 2;
const _FILES = 100;

const _GZIP = [0x1f, 0x8b];

const _text = (bytes: Uint8Array): string =>
  new TextDecoder().decode(
    bytes[0] === _GZIP[0] && bytes[1] === _GZIP[1]
      ? Bun.gunzipSync(new Uint8Array(bytes))
      : bytes
  );

type _Node = Readonly<Record<string, unknown>>;

const _list = (value: unknown): readonly unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

// Имена — без приставки пространства имён: <sm:urlset> и <urlset> одно и то же.
const _child = (node: unknown, name: string): unknown =>
  node !== null && typeof node === 'object'
    ? Object.entries(node as _Node).find(
        ({ 0: key }) => key === name || key.endsWith(`:${name}`)
      )?.[1]
    : undefined;

const _locs = (root: unknown, item: string): string[] =>
  _list(_child(root, item)).flatMap((_) =>
    ((loc) => (typeof loc === 'string' && loc.trim() ? [loc.trim()] : []))(
      _child(_, 'loc')
    )
  );

type _Sitemap =
  | { readonly kind: 'urls'; readonly urls: readonly string[] }
  | { readonly kind: 'index'; readonly sitemaps: readonly string[] };

const _sitemap = (xml: string): _Sitemap =>
  ((doc) =>
    ((urlset, index) =>
      urlset !== undefined
        ? { kind: 'urls', urls: _locs(urlset, 'url') }
        : index !== undefined
          ? { kind: 'index', sitemaps: _locs(index, 'sitemap') }
          : fail(
              'diagnostics.not_sitemap',
              'The XML is neither <urlset> nor <sitemapindex>'
            ))(_child(doc, 'urlset'), _child(doc, 'sitemapindex')))(
    attempt(
      () => Bun.XML.parse(xml),
      () => fail('diagnostics.not_sitemap', 'The file is not well-formed XML')
    )
  );

const _entries = (urls: readonly string[]): UrlEntry[] =>
  urls.map((input, index) => ({ input, expected: null, line: index + 1 }));

const _read = (text: string, load: Load, depth: number): Promise<UrlEntry[]> =>
  text.trimStart().startsWith('<')
    ? Promise.resolve(text)
        .then(_sitemap)
        .then((map) =>
          map.kind === 'urls'
            ? _entries(map.urls)
            : depth >= _DEPTH
              ? fail(
                  'diagnostics.sitemap_depth',
                  'Sitemap indexes nest too deep'
                )
              : map.sitemaps.slice(0, _FILES).reduce<Promise<UrlEntry[]>>(
                  (done, url) =>
                    done.then((entries) =>
                      load(url)
                        .then((bytes) => _read(_text(bytes), load, depth + 1))
                        .then((more) => [...entries, ...more])
                    ),
                  Promise.resolve([])
                )
        )
    : Promise.resolve(parseUrlList(text));

/**
 * Старые адреса из файла, ответа по адресу или stdin: список текстом, sitemap.xml или индекс sitemap (его
 * файлы скачивает `load`); `.gz` распаковывается.
 */
export var readUrlSource = (
  bytes: Uint8Array,
  load: Load
): Promise<UrlEntry[]> =>
  Promise.resolve(bytes).then((_) => _read(_text(_), load, 0));
