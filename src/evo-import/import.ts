import type {
  ContentService,
  FieldType,
  FieldValue,
} from '../contexts/content/index.ts';
import type { DesignService } from '../contexts/design/index.ts';
import type { SiteService } from '../contexts/site/index.ts';
import { attempt, fail, isDomainError } from '../shared/kernel/errors.ts';
import {
  camelCase,
  convertContent,
  convertElement,
  pascalCase,
} from './convert.ts';
import { evoPrefix, type SqlRow, type SqlTables } from './sql-dump.ts';

export type ImportReport = {
  readonly pages: number;
  readonly templates: number;
  readonly components: number;
  readonly fields: number;
  readonly values: number;
  /** Сниппеты PHP: их вызовы остались комментариями, переписать их — работа разработчика. */
  readonly snippets: readonly string[];
  readonly warnings: readonly string[];
};

type Services = {
  readonly content: ContentService;
  readonly design: DesignService;
  readonly site: SiteService;
};

// Типы TV Evo → типы полей; неизвестное — текст.
const _TV_TYPES: Readonly<Record<string, FieldType>> = {
  richtext: 'richtext',
  textareamini: 'richtext',
  number: 'number',
  date: 'date',
  dropdown: 'select',
  listbox: 'select',
  option: 'select',
  // image остаётся текстом: значения TV — адреса /assets/…, а не файлы медиатеки.
  _: 'text',
};

const _BLANK_TEMPLATE = 'Blank';

const _text = (row: SqlRow, column: string): string =>
  String(row[column] ?? '');
const _int = (row: SqlRow, column: string): number => Number(row[column] ?? 0);

// unix-время Evo, 0 — «не задано».
const _moment = (seconds: number): string | null =>
  seconds > 0 ? new Date(seconds * 1000).toISOString() : null;

/** Имена без повторов: `Header`, `Header2`… */
const _unique = (names: readonly string[]): string[] =>
  names.reduce<string[]>(
    (taken, name) => [
      ...taken,
      taken.includes(name)
        ? `${name}${taken.filter((_) => _.startsWith(name)).length + 1}`
        : name,
    ],
    []
  );

const _options = (elements: string): string[] =>
  elements
    .split('||')
    .map((_) => _.split('==').at(-1)!.trim())
    .filter(Boolean);

const _depth = (rows: readonly SqlRow[]): ((row: SqlRow) => number) => {
  const parentOf = new Map(rows.map((_) => [_int(_, 'id'), _int(_, 'parent')]));
  const depth = (id: number, seen: number): number =>
    id === 0 || seen > rows.length
      ? 0
      : 1 + depth(parentOf.get(id) ?? 0, seen + 1);
  return (row) => depth(_int(row, 'id'), 0);
};

const _value = (type: FieldType, raw: string): FieldValue | null =>
  raw === ''
    ? null
    : type === 'number'
      ? Number(raw)
      : type === 'date'
        ? (/^\d+$/.test(raw)
            ? new Date(Number(raw) * 1000).toISOString()
            : raw
          ).slice(0, 10)
        : raw;

/** Переносит сайт Evo из дампа в пустой сайт: дерево, элементы, TV, значения, настройки. */
export var importEvo = (
  { content, design, site }: Services,
  tables: SqlTables
): ImportReport => {
  const prefix =
    evoPrefix(tables) ??
    fail('evo.no_site_content', 'The dump has no site_content table');
  // REPLACE INTO в дампе перезаписывает строку с тем же ключом: побеждает последняя.
  const rows = (name: string, key = 'id'): readonly SqlRow[] => [
    ...new Map(
      (tables.get(`${prefix}${name}`) ?? []).map(
        (row, index) => [String(row[key] ?? `#${index}`), row] as const
      )
    ).values(),
  ];
  const warnings: string[] = [];
  const snippets = new Set<string>();

  // Ошибка одной записи не останавливает перенос: она попадает в отчёт.
  const tryTo = (label: string, run: () => void): boolean =>
    attempt(
      () => (run(), true),
      (error) => (
        warnings.push(
          `${label}: ${isDomainError(error) ? error.message : String(error)}`
        ),
        false
      )
    );

  const chunkRows = rows('site_htmlsnippets');
  const chunkNames = _unique(
    chunkRows.map((_) => pascalCase(_text(_, 'name')))
  );
  const chunks = new Map(
    chunkRows.map((row, i) => [_text(row, 'name'), chunkNames[i]!])
  );

  const savedComponents = chunkRows.filter((row, i) => {
    const converted = convertElement(
      _text(row, 'snippet'),
      'component',
      chunks
    );
    converted.snippets.forEach((_) => void snippets.add(_));
    return tryTo(`chunk ${_text(row, 'name')}`, () =>
      design.components.save(chunkNames[i]!, converted.source)
    );
  }).length;

  const templateRows = rows('site_templates');
  const templateNames = _unique(
    templateRows.map((_) => pascalCase(_text(_, 'templatename')))
  );
  const templates = new Map(
    templateRows.map((row, i) => [_int(row, 'id'), templateNames[i]!])
  );

  const savedTemplates = templateRows.filter((row, i) => {
    const converted = convertElement(_text(row, 'content'), 'template', chunks);
    converted.snippets.forEach((_) => void snippets.add(_));
    return tryTo(`template ${_text(row, 'templatename')}`, () =>
      design.templates.save(templateNames[i]!, converted.source)
    );
  }).length;

  // Документы с template = 0 в Evo выводили только [*content*].
  design.templates.save(
    _BLANK_TEMPLATE,
    "<script>\nimport Content from '$core/Content';\nlet { page } = $props();\n</script>\n<Content of={page} />\n"
  );

  const assigned = rows('site_tmplvar_templates').reduce<Map<number, string[]>>(
    (map, row) =>
      new Map(map).set(_int(row, 'tmplvarid'), [
        ...(map.get(_int(row, 'tmplvarid')) ?? []),
        templates.get(_int(row, 'templateid')) ?? _BLANK_TEMPLATE,
      ]),
    new Map()
  );

  const tvs = new Map(
    rows('site_tmplvars')
      .map((row) => {
        const name = camelCase(_text(row, 'name'));
        const type = _TV_TYPES[_text(row, 'type')] ?? _TV_TYPES._!;
        const fallback = _text(row, 'default_text');
        const inherit = fallback.startsWith('@INHERIT');
        const options = _options(_text(row, 'elements'));
        const saved = tryTo(`TV ${_text(row, 'name')}`, () =>
          content.fields.save({
            name,
            label: _text(row, 'caption') || name,
            type: type === 'select' && options.length === 0 ? 'text' : type,
            options,
            defaultValue:
              inherit || fallback.startsWith('@')
                ? null
                : _value(type, fallback),
            inherit,
            templates: assigned.get(_int(row, 'id')) ?? [],
          })
        );
        return saved ? ([_int(row, 'id'), { name, type }] as const) : null;
      })
      .filter((_) => _ !== null)
  );

  const pageRows = rows('site_content');
  const depth = _depth(pageRows);
  const imported = pageRows
    .toSorted((a, b) => depth(a) - depth(b) || _int(a, 'id') - _int(b, 'id'))
    .filter((row) =>
      tryTo(`page ${_int(row, 'id')}`, () => {
        const id = _int(row, 'id');
        const alias = _text(row, 'alias');
        content.pages.import(id, {
          parentId: _int(row, 'parent') || null,
          kind: _text(row, 'type') === 'reference' ? 'link' : 'page',
          title: _text(row, 'pagetitle') || `Page ${id}`,
          longTitle: _text(row, 'longtitle'),
          menuTitle: _text(row, 'menutitle'),
          description: _text(row, 'description'),
          introText: _text(row, 'introtext'),
          ...(alias && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$/.test(alias)
            ? { alias }
            : {}),
          template: templates.get(_int(row, 'template')) ?? _BLANK_TEMPLATE,
          // sitemap.xml, rss.xml, robots.txt в Evo — документы со своим contentType.
          ...(/^[\w.+-]+\/[\w.+-]+$/.test(_text(row, 'contentType'))
            ? { contentType: _text(row, 'contentType') }
            : {}),
          content:
            _text(row, 'type') === 'reference' ? '' : _text(row, 'content'),
          linkTo:
            _text(row, 'type') === 'reference' ? _text(row, 'content') : '',
          menuIndex: _int(row, 'menuindex'),
          hiddenFromMenu: _int(row, 'hidemenu') === 1,
          cacheable: _int(row, 'cacheable') !== 0,
          publishAt: _moment(_int(row, 'pub_date')),
          unpublishAt: _moment(_int(row, 'unpub_date')),
          publish: _int(row, 'published') === 1,
          trashed: _int(row, 'deleted') === 1,
        });
      })
    );

  // Чанки в контенте — вызовы компонентов; ссылки [~id~] остаются как есть: id сохранены, адрес подставит рендер.
  imported.forEach((row) => {
    const html = _text(row, 'content');
    const converted = convertContent(html, chunks);
    converted.snippets.forEach((_) => void snippets.add(_));
    void (
      converted.html !== html &&
      _text(row, 'type') !== 'reference' &&
      tryTo(`content of page ${_int(row, 'id')}`, () =>
        content.pages.edit(_int(row, 'id'), { content: converted.html })
      )
    );
  });

  const values = rows('site_tmplvar_contentvalues').filter((row) => {
    const tv = tvs.get(_int(row, 'tmplvarid'));
    return (
      tv !== undefined &&
      tryTo(`TV value ${tv.name} of page ${_int(row, 'contentid')}`, () =>
        content.pages.setFields(_int(row, 'contentid'), {
          [tv.name]: _value(tv.type, _text(row, 'value')),
        })
      )
    );
  }).length;

  const settings = new Map(
    rows('system_settings').map((_) => [
      _text(_, 'setting_name'),
      _text(_, 'setting_value'),
    ])
  );
  const pageSetting = (name: string): number | null => {
    const id = Number(settings.get(name) ?? 0);
    return id > 0 && content.drafts.view(id) ? id : null;
  };
  tryTo('settings', () =>
    site.settings.update({
      ...(settings.get('site_name')
        ? { name: settings.get('site_name')! }
        : {}),
      homePageId: pageSetting('site_start'),
      notFoundPageId: pageSetting('error_page'),
    })
  );

  return {
    pages: imported.length,
    templates: savedTemplates,
    components: savedComponents,
    fields: tvs.size,
    values,
    snippets: [...snippets].sort(),
    warnings,
  };
};
