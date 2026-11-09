import { attempt } from '../../../shared/kernel/errors.ts';

// Упоминания файлов медиатеки в текстах страниц и значениях полей — одним проходом по всем текстам сайта,
// а не запросом на файл: так «не используется» считается сразу для тысяч файлов.

// Путь без пробелов: `/media/img/a.jpg?v=…`, `assets/images/4a_(5).jpg`, кириллица и %-коды.
const _PATH =
  /(?:[\p{L}\p{N}_\-.()@~%+]+\/)*[\p{L}\p{N}_\-.()@~%+]+\.[a-z0-9]{2,5}(?![\p{L}\p{N}])/giu;

// Значение в кавычках (атрибут, строка JSON) — целиком: в нём бывают пробелы, `Притыцкого 89.JPG`.
const _QUOTED = /"([^"\n]{1,512})"|'([^'\n]{1,512})'/g;

const _clean = (raw: string): string =>
  raw
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '')
    .replace(/^media\//, '');

const _decoded = (raw: string): string =>
  attempt(
    () => decodeURIComponent(raw),
    () => raw
  );

const _add = (found: Set<string>, raw: string): void =>
  ((path) =>
    void (path.includes('.') && (found.add(path), found.add(_decoded(path)))))(
    _clean(raw)
  );

/**
 * Пути, что встречаются в текстах: каждый путь без пробелов, значение в кавычках и само значение целиком
 * (поле с путём). Без `/media/`, `?v=` и начального `/`; с %-кодами и без них. Лишнее не мешает — по
 * множеству только проверяют, есть ли в нём путь файла.
 */
export var mediaReferences = (texts: Iterable<string>): Set<string> =>
  Iterator.from(texts).reduce(
    (found, text) => (
      void (text.length <= 512 && _add(found, text)),
      [...text.matchAll(_PATH)].forEach((_) => void _add(found, _[0])),
      [...text.matchAll(_QUOTED)].forEach(
        (_) => void _add(found, _[1] ?? _[2] ?? '')
      ),
      found
    ),
    new Set<string>()
  );
