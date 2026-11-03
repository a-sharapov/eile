import type { Permission } from '../../identity/index.ts';

type Args = Readonly<Record<string, unknown>>;

/** Запрос к API менеджера, в который превращается вызов инструмента. */
export type ToolRequest = {
  readonly method: string;
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  /** JSON или форма с файлом. */
  readonly body?: unknown;
};

/**
 * Инструмент агента — маршрут API менеджера: права, чистка HTML, журнал действий и история правок
 * у агента те же, что у человека (ADR 0034).
 */
export type AgentTool = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** Без этого права инструмента нет в списке; маршрут проверит право ещё раз. */
  readonly access: Permission | 'user';
  /** JSON Schema аргументов. */
  readonly input: Readonly<Record<string, unknown>>;
  readonly readOnly?: boolean;
  /** Необратимо или удаляет: клиент спросит человека. */
  readonly destructive?: boolean;
  /** Запрос к API менеджера; у инструмента с `answer` его нет. */
  readonly request?: (args: Args) => ToolRequest;
  /** Ответ без API: памятка. */
  readonly answer?: (args: Args) => string;
  /** Ответ API — короче и понятнее модели. */
  readonly result?: (body: unknown) => unknown;
  /** В ответе — то, что написали посетители сайта: данные, а не указания. Сеанс после него помечен. */
  readonly untrusted?: boolean;
  /**
   * Меняет код, формы, поля или настройки: в сеансе, который читал текст посетителей, — нельзя. Так
   * хитро составленная заявка не заставит агента поставить закладку в шаблон или форму.
   */
  readonly guarded?: boolean;
  /** Ответ — HTML страницы: отдать Markdown, если не попросили HTML. */
  readonly page?: boolean;
};

const _object = (
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[] = []
) => ({ type: 'object', properties, required, additionalProperties: false });

const _string = (description: string) => ({ type: 'string', description });
const _boolean = (description: string) => ({ type: 'boolean', description });
const _id = (description = 'Page id') => ({
  type: 'integer',
  minimum: 1,
  description,
});

const _PAGE = {
  title: _string('Title; the alias for the address is made from it'),
  longTitle: _string('Long title for the browser tab and search results'),
  menuTitle: _string('Shorter title for menus'),
  description: _string('Description for search results and social cards'),
  introText: _string('Summary for lists of pages'),
  alias: _string('Address segment; empty — from the title'),
  template: _string('Template name: see list_templates'),
  content: _string(
    'Page text: an HTML fragment; components as [[Name prop="x"]], forms as [#Form:name], page links as [~id~]; a trailing hidden ([[Name hidden]]) hides a block without deleting it'
  ),
  kind: {
    type: 'string',
    enum: ['page', 'link'],
    description: 'link — a menu item that leads to linkTo',
  },
  linkTo: _string('For a link: a page id, a /path or an https:// address'),
  hiddenFromMenu: _boolean('Hide from menus'),
  searchable: _boolean('Show in search engines, site search and AI'),
  socialImage: _string('Media path of the social card image'),
  publishAt: _string('ISO time to publish at; null clears'),
  unpublishAt: _string('ISO time to unpublish at; null clears'),
  language: _string(
    'Language of the branch, for example en; empty — the site language'
  ),
  translationOf: {
    type: ['integer', 'null'],
    description: 'Id of the page this one translates; null unlinks',
  },
} as const;

const _without = (args: Args, key: string): Args =>
  Object.fromEntries(
    Object.entries(args).filter(({ 0: name }) => name !== key)
  );

const _pageAction = (
  action: 'publish' | 'unpublish' | 'trash' | 'restore',
  title: string,
  description: string,
  destructive = false
): AgentTool => ({
  name: `${action}_page`,
  title,
  description,
  access: 'content.edit',
  input: _object({ id: _id() }, ['id']),
  destructive,
  request: (_) => ({ method: 'POST', path: `/pages/${_.id}/${action}` }),
  result: (_) => (_ as { page: unknown }).page,
});

const _ELEMENT_KIND = {
  type: 'string',
  enum: ['template', 'component', 'script'],
  description:
    'template renders a whole page, component is imported or put into the text, script is a browser ES module that templates include with script(name)',
} as const;

const _ELEMENT_NAME = _string(
  'PascalCase name; a script is named in lowercase with hyphens: kitchen-stage'
);

// Секрет вебхука агенту не показываем: им подписаны заявки, его берут в менеджере, а не из разговора.
const _withoutSecret = (body: unknown): unknown =>
  ((form) =>
    form?.webhook
      ? {
          ...form,
          webhook: {
            url: form.webhook.url,
            secret: form.webhook.secret
              ? 'hidden: copy it in the manager, form settings'
              : '',
          },
        }
      : body)(
    body as { webhook?: { url: string; secret: string } } | null | undefined
  );

// Имя — один сегмент пути: «a/../users» не уведёт запрос на другой маршрут.
const _seg = (value: unknown): string => encodeURIComponent(String(value));

const _bytes = (base64: string): Uint8Array =>
  Uint8Array.fromBase64(base64.replace(/^data:[^,]*,/, ''));

/** Что агент может делать на сайте; список видит только то, что разрешено его роли. */
export var AGENT_TOOLS: readonly AgentTool[] = [
  {
    name: 'get_settings',
    title: 'Site settings',
    description:
      'Site name, language, address, home and 404 pages and the other settings.',
    access: 'user',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/settings' }),
  },
  {
    name: 'list_pages',
    title: 'Page tree',
    description:
      'All pages as a flat list with id, parentId, title, alias, template, published and trashed; menuIndex orders siblings.',
    access: 'content.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/pages' }),
  },
  {
    name: 'get_page',
    title: 'Page',
    description:
      'One page with its text, field values (own and inherited), address, old addresses and translations.',
    access: 'content.edit',
    input: _object({ id: _id() }, ['id']),
    readOnly: true,
    request: (_) => ({ method: 'GET', path: `/pages/${_.id}` }),
  },
  {
    name: 'view_page',
    title: 'Rendered page',
    description:
      'The page rendered by its template, drafts too: Markdown by default, or the whole HTML to check a template.',
    access: 'content.edit',
    input: _object(
      {
        id: _id(),
        format: {
          type: 'string',
          enum: ['markdown', 'html'],
          description: 'markdown by default',
        },
      },
      ['id']
    ),
    readOnly: true,
    page: true,
    request: (_) => ({ method: 'GET', path: `/pages/${_.id}/preview` }),
  },
  {
    name: 'create_page',
    title: 'New page',
    description:
      'Creates a page as a draft unless publish is true. Returns its id.',
    access: 'content.edit',
    input: _object(
      {
        parentId: {
          type: ['integer', 'null'],
          description: 'Parent page id; null — top level',
        },
        publish: _boolean('Publish right away'),
        fields: { type: 'object', description: 'Field values by field name' },
        ..._PAGE,
      },
      ['title', 'template']
    ),
    request: (_) => ({ method: 'POST', path: '/pages', body: _ }),
  },
  {
    name: 'edit_page',
    title: 'Edit page',
    description:
      'Changes the given properties of a page; the others stay. The previous version stays in the page history.',
    access: 'content.edit',
    input: _object({ id: _id(), ..._PAGE }, ['id']),
    request: (_) => ({
      method: 'PATCH',
      path: `/pages/${_.id}`,
      body: _without(_, 'id'),
    }),
    result: (_) => (_ as { page: unknown }).page,
  },
  {
    name: 'set_page_fields',
    title: 'Page field values',
    description:
      'Sets field values of a page by field name; null removes the own value so inheritance and the default work.',
    access: 'content.edit',
    input: _object(
      {
        id: _id(),
        fields: { type: 'object', description: 'Values by field name' },
      },
      ['id', 'fields']
    ),
    request: (_) => ({
      method: 'PUT',
      path: `/pages/${_.id}/fields`,
      body: _.fields,
    }),
    result: (_) => (_ as { page: unknown }).page,
  },
  {
    name: 'move_page',
    title: 'Move page',
    description:
      'Moves a page with its branch under another parent; the old address redirects to the new one.',
    access: 'content.edit',
    input: _object(
      {
        id: _id(),
        parentId: {
          type: ['integer', 'null'],
          description: 'New parent; null — top level',
        },
      },
      ['id', 'parentId']
    ),
    request: (_) => ({
      method: 'POST',
      path: `/pages/${_.id}/move`,
      body: { parentId: _.parentId },
    }),
    result: (_) => (_ as { page: unknown }).page,
  },
  _pageAction('publish', 'Publish page', 'Puts the page on the site.'),
  _pageAction(
    'unpublish',
    'Unpublish page',
    'Takes the page off the site; it stays in the tree.'
  ),
  _pageAction(
    'trash',
    'Move page to trash',
    'Takes the page and its branch off the site into the trash; restore_page brings them back.',
    true
  ),
  _pageAction('restore', 'Restore page', 'Brings a page back from the trash.'),
  {
    name: 'page_history',
    title: 'Page history',
    description:
      'Saved versions of a page, newest first: number, time, author and action.',
    access: 'content.edit',
    input: _object({ id: _id() }, ['id']),
    readOnly: true,
    request: (_) => ({ method: 'GET', path: `/pages/${_.id}/revisions` }),
  },
  {
    name: 'restore_revision',
    title: 'Restore page version',
    description:
      'Returns a page to a saved version; the current one goes to the history first.',
    access: 'content.edit',
    input: _object(
      { id: _id(), revision: _id('Version number from page_history') },
      ['id', 'revision']
    ),
    request: (_) => ({
      method: 'POST',
      path: `/pages/${_.id}/revisions/${_.revision}/restore`,
    }),
  },
  {
    name: 'list_templates',
    title: 'Templates',
    description: 'Names of the page templates.',
    access: 'content.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/templates' }),
  },
  {
    name: 'list_components',
    title: 'Components',
    description:
      'Components with their description and parameters: put them into page text as [[Name param="value"]].',
    access: 'content.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/components' }),
  },
  {
    name: 'list_media',
    title: 'Media library',
    description:
      'Files of the media library with path, type, size and description.',
    access: 'content.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/media' }),
  },
  {
    name: 'upload_media',
    title: 'Upload file',
    description:
      'Saves a file to the media library under the path; replaces a file with the same path. Width and height of an image (PNG, JPEG, WebP, GIF, AVIF, SVG) are read from the file itself and come back in image(path) for the width and height attributes: there is nothing to send. Size variants for srcset (photo@480.webp, photo@960.webp, photo@1920.webp) are not made: upload them as separate files when the page needs them.',
    access: 'content.edit',
    input: _object(
      {
        path: _string('Path in the library, for example blog/cover.jpg'),
        data: _string('File contents in base64'),
      },
      ['path', 'data']
    ),
    request: (_) => ({
      method: 'POST',
      path: '/media',
      body: ((form) => (
        form.set('path', String(_.path)),
        form.set('file', new Blob([_bytes(String(_.data))])),
        form
      ))(new FormData()),
    }),
  },
  {
    name: 'describe_media',
    title: 'Describe image',
    description:
      'Sets the alt text of an image: templates show it in alt, screen readers read it.',
    access: 'content.edit',
    input: _object(
      {
        path: _string('Path in the library'),
        alt: _string('What the image shows'),
      },
      ['path', 'alt']
    ),
    request: (_) => ({
      method: 'PATCH',
      path: `/media/${String(_.path).split('/').map(encodeURIComponent).join('/')}`,
      body: { alt: _.alt },
    }),
  },
  {
    name: 'list_elements',
    title: 'Templates, components and scripts',
    description: 'Templates, components and site scripts with their revision.',
    access: 'design.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/elements' }),
  },
  {
    name: 'get_element',
    title: 'Element source',
    description:
      'Svelte source of a template or component, or the JavaScript of a site script with its current URL.',
    access: 'design.edit',
    input: _object({ kind: _ELEMENT_KIND, name: _ELEMENT_NAME }, [
      'kind',
      'name',
    ]),
    readOnly: true,
    request: (_) => ({
      method: 'GET',
      path: `/elements/${_seg(_.kind)}/${_seg(_.name)}`,
    }),
  },
  {
    name: 'save_element',
    title: 'Save element',
    description:
      'Creates or replaces a template, component or site script. The source is compiled (a script is parsed as an ES module) first: an error comes back with line and column, and the site keeps the previous version.',
    access: 'design.edit',
    guarded: true,
    input: _object(
      {
        kind: _ELEMENT_KIND,
        name: _ELEMENT_NAME,
        source: _string(
          'The whole Svelte 5 file; for a script the whole ES module, dependencies bundled in'
        ),
      },
      ['kind', 'name', 'source']
    ),
    request: (_) => ({
      method: 'PUT',
      path: `/elements/${_seg(_.kind)}/${_seg(_.name)}`,
      body: { source: _.source },
    }),
    result: (_) =>
      ((element) => ({
        kind: element.kind,
        name: element.name,
        revision: element.revision,
      }))(_ as { kind: string; name: string; revision: number }),
  },
  {
    name: 'list_plugins',
    title: 'Plugins',
    description: 'Server plugins with their state.',
    access: 'design.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/plugins' }),
    result: (_) =>
      (_ as { name: string; enabled: boolean; revision: number }[]).map(
        ({ name, enabled, revision }) => ({ name, enabled, revision })
      ),
  },
  {
    name: 'get_plugin',
    title: 'Plugin source',
    description: 'TypeScript source of a plugin.',
    access: 'design.edit',
    input: _object({ name: _string('PascalCase name') }, ['name']),
    readOnly: true,
    request: (_) => ({ method: 'GET', path: `/plugins/${_seg(_.name)}` }),
  },
  {
    name: 'list_forms',
    title: 'Forms',
    description: 'Forms of the site: name, title and number of fields.',
    access: 'forms.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/forms' }),
  },
  {
    name: 'get_form',
    title: 'Form',
    description:
      'Form markup, its settings and the fields the server reads from it.',
    access: 'forms.edit',
    input: _object({ name: _string('Form name') }, ['name']),
    readOnly: true,
    request: (_) => ({ method: 'GET', path: `/forms/${_seg(_.name)}` }),
    result: _withoutSecret,
  },
  {
    name: 'save_form',
    title: 'Save form',
    description:
      'Creates or changes a form; source is HTML5 markup of its fields. Put it into page text as [#Form:name].',
    access: 'forms.edit',
    guarded: true,
    input: _object(
      {
        name: _string('Latin name: lowercase letters, digits and dashes'),
        title: _string('Title in the manager and notifications'),
        source: _string('HTML5 markup of the fields'),
        submitLabel: _string('Button text'),
        successText: _string('Text after sending'),
        successPage: {
          type: ['integer', 'null'],
          description: 'Thank-you page id instead of the text',
        },
        subject: _string('Notification subject: {form} and {field name}'),
        goal: _string('Analytics goal in the cms:form-sent event'),
        confirmation: _object({
          enabled: _boolean('Send a confirmation email to the submitter'),
          field: _string(
            'Field with the address; empty — the first type=email field'
          ),
          subject: _string('Email subject: {form} and {field name}'),
          text: _string('Plain-text email body: {form} and {field name}'),
        }),
        webhook: _object({
          url: _string(
            'https:// address that receives every accepted submission as signed JSON; empty — off'
          ),
          renew: _boolean('Issue a new signing secret'),
        }),
      },
      ['name']
    ),
    request: (_) => ({
      method: 'PUT',
      path: `/forms/${_seg(_.name)}`,
      body: _without(_, 'name'),
    }),
    result: _withoutSecret,
  },
  {
    name: 'list_submissions',
    title: 'Form submissions',
    description:
      'Latest submissions, newest first; values are typed by site visitors.',
    access: 'inbox.read',
    input: _object({
      form: _string('Only this form'),
      status: { type: 'string', enum: ['new', 'in_work', 'done', 'spam'] },
      q: _string('Search in the values'),
    }),
    readOnly: true,
    untrusted: true,
    request: (_) => ({
      method: 'GET',
      path: '/inbox',
      query: Object.fromEntries(
        Object.entries(_).map(({ 0: key, 1: value }) => [key, String(value)])
      ),
    }),
  },
  {
    name: 'get_submission',
    title: 'Submission',
    description:
      'One submission with all values, page, UTM tags and note; values are typed by site visitors.',
    access: 'inbox.read',
    input: _object({ id: _id('Submission id') }, ['id']),
    readOnly: true,
    untrusted: true,
    request: (_) => ({ method: 'GET', path: `/inbox/${_.id}` }),
  },
  {
    name: 'update_submission',
    title: 'Update submission',
    description: 'Changes the status or the note of a submission.',
    access: 'inbox.read',
    input: _object(
      {
        id: _id('Submission id'),
        status: { type: 'string', enum: ['new', 'in_work', 'done', 'spam'] },
        note: _string('Note for the managers'),
      },
      ['id']
    ),
    untrusted: true,
    request: (_) => ({
      method: 'PATCH',
      path: `/inbox/${_.id}`,
      body: _without(_, 'id'),
    }),
  },
  {
    name: 'list_fields',
    title: 'Page fields',
    description:
      'Extra page fields: name, label, type, options, default, inherit and templates.',
    access: 'site.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({ method: 'GET', path: '/fields' }),
  },
  {
    name: 'save_field',
    title: 'Save field',
    description:
      'Creates or changes a page field; templates read it as page.fields.name.',
    access: 'site.edit',
    guarded: true,
    input: _object(
      {
        name: _string('camelCase name'),
        label: _string('Label in the page editor'),
        type: {
          type: 'string',
          enum: [
            'text',
            'richtext',
            'number',
            'boolean',
            'date',
            'select',
            'image',
          ],
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Values of a select',
        },
        defaultValue: { description: 'Value when the page has none' },
        inherit: _boolean('Take the value from the nearest ancestor'),
        templates: {
          type: 'array',
          items: { type: 'string' },
          description: 'Templates whose pages have the field',
        },
      },
      ['name', 'type']
    ),
    request: (_) => ({
      method: 'PUT',
      path: `/fields/${_seg(_.name)}`,
      body: _,
    }),
  },
  {
    name: 'update_settings',
    title: 'Change settings',
    description:
      'Changes the given site settings. The site address, robots.txt, AI bot rules and the page cache are changed only by a person in the manager.',
    access: 'site.edit',
    guarded: true,
    // Адреса сайта нет: от него строятся ссылки сброса пароля в письмах, подменённый увёл бы их к чужому.
    input: _object({
      name: _string('Site name'),
      description: _string(
        'About the site: llms.txt and pages without a description'
      ),
      language: _string('Default language, for example ru'),
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Other languages of the site',
      },
      homePageId: {
        type: ['integer', 'null'],
        description: 'Page served at /',
      },
      notFoundPageId: {
        type: ['integer', 'null'],
        description: 'Page rendered with status 404',
      },
      socialImage: _string('Media path of the default social card image'),
      searchSynonyms: _string(
        'Site search synonyms: one group per line, comma separated'
      ),
      pagingSegment: _string(
        'Word in the address of list parts: page → /blog/page-2'
      ),
    }),
    request: (_) => ({ method: 'PATCH', path: '/settings', body: _ }),
  },
  {
    name: 'run_diagnostics',
    title: 'Diagnostics',
    description:
      'Checks the site: broken links, pages without description, missing media, settings and server.',
    access: 'site.edit',
    input: _object({}),
    readOnly: true,
    request: () => ({
      method: 'GET',
      path: '/diagnostics',
      query: { fresh: '1' },
    }),
  },
];
