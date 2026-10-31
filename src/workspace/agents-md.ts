import { GUIDE } from '../contexts/assistant/index.ts';
import type { PageNode } from '../contexts/content/index.ts';
import type { ComponentSignature } from '../contexts/design/index.ts';
import type { WorkspaceServices } from './workspace.ts';

// Дерево в памятке — для ссылок [~id~] и выбора шаблона; большой сайт агент читает через MCP.
const _MAX_PAGES = 200;

const _props = (signature: ComponentSignature): string =>
  signature.props.length === 0
    ? ''
    : `Parameters: ${signature.props
        .map(
          (_) =>
            `${_.name}: ${_.options.length > 0 ? _.options.map((option) => `'${option.value}'`).join(' | ') : _.type}${_.required ? '' : ` = ${JSON.stringify(_.defaultValue)}`}${_.label && _.label !== _.name ? ` (${_.label})` : ''}`
        )
        .join('; ')}.`;

type _Row = { readonly node: PageNode; readonly depth: number };

// Обход в глубину по порядку меню: дети — под родителем, с отступом.
const _ordered = (tree: readonly PageNode[]): _Row[] =>
  ((groups) => {
    const walk = (parentId: number | null, depth: number): _Row[] =>
      (groups.get(parentId) ?? []).flatMap((node) => [
        { node, depth },
        ...walk(node.id, depth + 1),
      ]);
    return walk(null, 0);
  })(
    Map.groupBy(
      [...tree].sort((a, b) => a.menuIndex - b.menuIndex),
      (_) => _.parentId
    )
  );

const _pathOf = (tree: readonly PageNode[], home: number | null) =>
  ((byId) => {
    const path = (node: PageNode): string =>
      node.id === home
        ? '/'
        : `${((parent) => (parent && parent.id !== home ? path(parent) : ''))(
            node.parentId === null ? undefined : byId.get(node.parentId)
          )}/${node.alias}`;
    return path;
  })(new Map(tree.map((_) => [_.id, _])));

const _pages = (services: WorkspaceServices): string[] =>
  ((tree, home) =>
    ((ordered, pathOf) => [
      ...ordered
        .slice(0, _MAX_PAGES)
        .map(
          ({ node, depth }) =>
            `${'  '.repeat(depth)}- ${node.id} ${pathOf(node)} "${node.title}" (${node.kind === 'link' ? 'link' : node.template}${node.published ? '' : ', draft'})`
        ),
      ...(ordered.length > _MAX_PAGES
        ? [`- … and ${ordered.length - _MAX_PAGES} more pages`]
        : []),
    ])(_ordered(tree), _pathOf(tree, home)))(
    services.content.drafts.tree().filter((_) => !_.trashed),
    services.site.settings.get().homePageId
  );

// Описание компонента — одной строкой и без точки: дальше через точку идут параметры.
const _line = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().replace(/\.$/, '');

/** Как работать с папкой: команды с этой базой и адрес сайта для проверки страниц. */
export type AgentsOptions = {
  /** Путь к базе — относительно папки элементов: команды памятки запускаются из неё. */
  readonly db: string;
  readonly program: string;
};

/** AGENTS.md папки элементов: как с ней работать, правила CMS и что есть на этом сайте. */
export var agentsGuide = (
  services: WorkspaceServices,
  { db, program }: AgentsOptions
): string =>
  ((site, catalog, templates, forms) =>
    [
      `# ${site.name || 'Site'}: elements of an Eile site`,
      '',
      `This folder holds the elements of an Eile site: templates, components, plugins, forms and fields. They live in the site database \`${db}\`; the folder is a copy to edit with any tool. Pages, media and settings are not here: change them in the manager (${site.siteUrl || 'http://localhost:8080'}/manager) or through the MCP server \`${program} mcp --db ${db}\`.`,
      '',
      '## Workflow',
      '',
      `- \`${program} elements check . --db ${db}\` compiles everything and prints problems as \`file:line:column\`; nothing is saved.`,
      `- \`${program} elements push . --db ${db}\` saves the changed files to the site, all or nothing. A running server picks the change up by itself.`,
      `- \`${program} elements pull . --db ${db}\` refreshes the folder from the site: changed files are overwritten, so keep the folder in git.`,
      `- See a page as a visitor does: ${site.siteUrl || 'http://localhost:8080'}/path, or as Markdown: ${site.siteUrl || 'http://localhost:8080'}/path.md (the home page is /index.md).`,
      '- Add `--prune` to push to delete what has no file; fields are never deleted this way.',
      '',
      '## Layout',
      '',
      '- `templates/Name.svelte`: a page template; a page names its template.',
      '- `components/Name.svelte`: a component, imported as `$components/Name` or put into page text as `[[Name]]`.',
      '- `plugins/Name.ts`: a server plugin.',
      '- `forms/name.html` and `forms/name.json`: form markup and its settings (title, submitLabel, successText, successPage, subject, channels, retentionDays, minSeconds, allowLinks, goal).',
      '- `fields.json`: page fields.',
      '',
      '## Templates',
      '',
      GUIDE.template,
      '',
      '## Components',
      '',
      GUIDE.component,
      '',
      '## $core',
      '',
      GUIDE.core,
      '',
      '## Page text',
      '',
      GUIDE.text,
      '',
      '## Forms',
      '',
      GUIDE.form,
      '',
      '## Fields',
      '',
      GUIDE.fields,
      '',
      '## Plugins',
      '',
      GUIDE.plugin,
      '',
      '## This site',
      '',
      `- Name: ${site.name || '(none)'}; language: ${site.language}; address: ${site.siteUrl || '(taken from the request)'}.`,
      ...(site.description ? [`- About: ${site.description}`] : []),
      `- Templates: ${templates.map((_) => `${_.name} (pages: ${_.pages})`).join(', ') || 'none'}.`,
      ...(forms.length > 0
        ? [`- Forms: ${forms.map((_) => `${_.name} "${_.title}"`).join(', ')}.`]
        : []),
      '',
      '### Components',
      '',
      ...(catalog.length > 0
        ? catalog.map(
            (_) =>
              `- ${[_.name, _line(_.description), _props(_)].filter(Boolean).join('. ')}`
          )
        : ['- none yet']),
      '',
      '### Pages',
      '',
      'id, address, title and template; drafts are not on the site yet.',
      '',
      ..._pages(services),
      '',
    ].join('\n'))(
    services.site.settings.get(),
    services.design.components.catalog(),
    services.design.elements
      .list()
      .filter((_) => _.kind === 'template')
      .map((_) => ({
        name: _.name,
        pages: services.content.usage.template(_.name).length,
      })),
    services.forms.forms.list()
  );

/** CLAUDE.md, если его нет: Claude Code читает его, а правила — в AGENTS.md. */
export var CLAUDE_MD = '@AGENTS.md\n';
