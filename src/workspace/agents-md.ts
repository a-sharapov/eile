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

// Адрес — из дерева: со стилем адресов сайта и без скрытых алиасов (ADR 0063); главная — `/`.
const _pathOf =
  (home: number | null) =>
  (node: PageNode): string =>
    node.id === home ? '/' : node.path;

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
    ])(_ordered(tree), _pathOf(home)))(
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
  ((site, catalog, templates, scripts, forms, translations, custom) =>
    [
      `# ${site.name || 'Site'}: elements of an Eile site`,
      '',
      `This folder holds the elements of an Eile site: templates, components, scripts, plugins, forms and fields. They live in the site database \`${db}\`; the folder is a copy to edit with any tool. Pages, media, settings and translations are not here: change them in the manager (${site.siteUrl || 'http://localhost:8080'}/manager) or through the MCP server \`${program} mcp --db ${db}\` (translations: update_translations).`,
      '',
      '## Workflow',
      '',
      `- \`${program} elements check . --db ${db}\` compiles everything and prints problems as \`file:line:column\`; nothing is saved.`,
      `- \`${program} elements push . --db ${db}\` saves the changed files to the site, all or nothing. A running server picks the change up by itself.`,
      `- \`${program} elements pull . --db ${db}\` refreshes the folder from the site: changed files are overwritten, so keep the folder in git.`,
      `- See a page as a visitor does: ${site.siteUrl || 'http://localhost:8080'}/path, or as Markdown: ${site.siteUrl || 'http://localhost:8080'}/path.md (the home page is /index.md).`,
      '- Add `--prune` to push to delete what has no file; fields are never deleted this way.',
      `- \`${program} media push <folder> --db ${db}\` puts a folder of media files (fonts, images, video) into the media library: the library path is the path from the folder root, \`--into <path>\` puts them under a path, \`media.json\` at the folder root holds alt texts (\`{ "images/a.jpg": { "alt": "…" } }\`). Matching files are skipped; image size variants are made by the server. \`${program} media link <folder> --into <prefix> --db ${db}\` links a folder on the server's disk instead: the database keeps only rows, the library path follows a rule (\`images/4a_(5).jpg\` → \`<prefix>/images/4a-5.jpg\`), and \`media()\`/\`image()\` also take the original path \`<prefix>/images/4a_(5).jpg\`; the folder is not part of a database backup.`,
      '',
      '## Layout',
      '',
      '- `templates/Name.svelte`: a page template; a page names its template.',
      '- `components/Name.svelte`: a component, imported as `$components/Name` or put into page text as `[[Name]]`.',
      "- `scripts/name.js`: a site script, a browser ES module; chunks of one build are scripts too and import each other as `./name.js`. A template includes the entry with `script('name')`. `check` prints syntax errors and references to missing scripts as `file:line:column`; push saves all scripts of the folder together, so their order does not matter.",
      '- `plugins/Name.ts`: a server plugin: hooks render, notFound, handle (its own answer to a request the site did not answer), schedule (a timed job in `cms serve`) and on (see Plugins below).',
      '- `forms/name.html` and `forms/name.json`: form markup and its settings (title, submitLabel, successText, successPage, subject, channels, retentionDays, minSeconds, allowLinks, proof, goal, storeClientInfo, confirmation, webhook; the webhook secret stays on the site).',
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
      '## Scripts',
      '',
      GUIDE.script,
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
      ...(scripts.length > 0 ? [`- Scripts: ${scripts.join(', ')}.`] : []),
      ...(forms.length > 0
        ? [`- Forms: ${forms.map((_) => `${_.name} "${_.title}"`).join(', ')}.`]
        : []),
      ...(translations.length > 0
        ? [
            `- Translations (site.i18n.key, t('key')): ${translations.join(', ')}.`,
          ]
        : []),
      ...(custom.length > 0
        ? [
            `- Custom settings (site.custom.key, setting('key')): ${custom.join(', ')}.`,
          ]
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
    services.design.elements
      .list()
      .filter((_) => _.kind === 'script')
      .map((_) => _.name),
    services.forms.forms.list(),
    services.site.translations.list().map((_): string => _.key),
    services.site.customSettings.list().map((_): string => _.key)
  );

/** CLAUDE.md, если его нет: Claude Code читает его, а правила — в AGENTS.md. */
export var CLAUDE_MD = '@AGENTS.md\n';
