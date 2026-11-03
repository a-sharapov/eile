// Памятка для моделей — одна на палочку, AGENTS.md папки элементов и MCP: правило меняется в одном месте.
// По-английски: модели точнее всего следуют английским указаниям, а пишут на языке сайта.

const _CORE_LIST =
  'link(id), page(id), children(parentId), current(), ancestors(id), listing(parentId, options), translations() → [{ language, url, title, current }] for a language switcher, site(), media(path), image(path) → { src, srcset, width, height, alt }, script(name), t(key), setting(key), search(query, options)';

// Скрипт сайта подключается из <svelte:head>: тег <script> на верхнем уровне разметки Svelte принял бы за второй блок кода.
const _SCRIPT_TAG =
  "A site script (a browser ES module, see scripts) is included in <svelte:head>: `<svelte:head><script type=\"module\" src={script('kitchen-stage')}></script></svelte:head>`; script(name) is null while there is no such script, so guard it with `{#if script('kitchen-stage')}…{/if}` if it may be missing. A <script> tag at the top level of the markup does not compile: Svelte takes it for a second code block.";

// Остров в регионе: его props считаются на каждом запросе и в кэш страницы не попадают (ADR 0036).
const _ISLAND_IN_UNCACHED =
  'A component rendered by Uncached may contain `<Island name="Price" props={{ price }} />`: the props are computed on every request (for example from request().cookie(...)) and never cached; an island cannot contain another island or Uncached.';

const _TEMPLATE = `This is a site template: a Svelte 5 component in runes mode (\`export let\` does not work) that renders the whole page.
- Props: \`let { page, site } = $props();\`
- page: title, longTitle, menuTitle, description, introText, content, path, kind, linkTo, language, publishedAt, createdAt, updatedAt, fields (the page's field values: \`page.fields.name\`).
- The page text is rendered with \`import Content from '$core/Content';\` and \`<Content of={page} />\`: it draws the components, forms and page links inside the text. \`{@html page.content}\` would show them as raw tags.
- site: name, language and the other settings; \`site.i18n.key\` is a translation into the page language, \`site.custom.key\` a custom site setting. The tags \`{i18n.key}\` and \`[@key]\` are not allowed in a template.
- As in Evo: \`<svelte:head><title>{page.longTitle || page.title} — {site.name}</title></svelte:head>\`; menu items show \`{item.menuTitle || item.title}\`.
- Site components are imported like \`import Menu from '$components/Menu';\`. The '$core' module: ${_CORE_LIST}.
- Built-in components: \`$core/Form\` (\`<Form name="callback" />\`), \`$core/Uncached\` (\`<Uncached name="Cart" props={{ currency: 'EUR' }} />\` renders on every request while the page stays cached), \`$core/Island\` (\`<Island name="Counter" props={{ start: 2 }} />\` hydrates in the browser).
- ${_ISLAND_IN_UNCACHED}
- ${_SCRIPT_TAG}
- Only $components/*, $core and svelte can be imported. Styles go in this file's <style>.`;

const _COMPONENT = `This is a site component: Svelte 5 in runes mode. Editors insert it into the page text as a block and fill in a form of its parameters.
- The file starts with a description: \`<!-- @component\nWhat it is, in one line.\n-->\`.
- Parameters are \`$props()\` with TypeScript types; above each one, a JSDoc with the form label: \`/** Title */\`. Options of a string union are labelled like this: \`/** Tone: note=Note, success=Success */\`. Optional parameters have a default value. Write the labels in the site language. \`hidden\` is reserved by the CMS for hiding a block: a parameter with this name never gets a value.
- Site data comes from '$core': ${_CORE_LIST}. In an island and inside Uncached, current() is null.
- ${_ISLAND_IN_UNCACHED}
- ${_SCRIPT_TAG}
- Only $components/*, $core and svelte can be imported. Styles go in this file's <style>.`;

// Скрипт — код сайта для браузера, а не файл медиатеки: правят его те же люди, что и шаблоны (ADR 0039).
const _SCRIPT = `This is a site script: a browser ES module (JavaScript, not TypeScript) served at /_cms/scripts/<name>.<hash>.js; the hash changes with every save, so browsers cache it forever.
- The name is lowercase latin letters, digits and hyphens: kitchen-stage. At most 2 MiB.
- It must parse as an ES module. Imports are allowed only from https:// URLs: no package names (import 'three'), no relative paths (./scene.js), no data: URLs. Bundle your dependencies into one script, for example \`bun build scene.js --format esm --minify --outfile kitchen-stage.js\`.
- It runs in the browser: there is no $core and no server data in it. Pass data through the page markup (data-* attributes, a <script type="application/json"> written by the template).
- ${_SCRIPT_TAG}
- A script cannot be deleted while a template or component calls script('its-name').`;

const _PLUGIN = `This is a site plugin, a TypeScript module:
\`export default { render?(html: string, { path, status }): string, notFound?(path: string): string | null, on?: { [event type]: (event) => void } }\`.
- render changes the finished HTML of a page, notFound returns a redirect address or null, on listens to site events.
- Only '$core' can be imported.`;

const _TEXT = `This is the page text: return an HTML fragment. Allowed: <p>, <h2>–<h4>, <ul>/<ol>/<li>, <blockquote>, <strong>, <em>, <a href>. Not allowed: <html>, <body>, <h1> (the template prints the title), styles, scripts, classes, images.
A link to a page of the site is written as [~id~]; substitutions: {i18n.key} is a translation, [@key] a custom site setting.`;

const _TAGS = `Tags inside the page text:
- \`[[Name prop="text" count=3 wide]]\` puts the site component Name here with these parameters (a bare name is true).
- \`[#Form:callback]\` puts the form "callback" here; it renders on every request with a fresh stamp.
- \`hidden\` at the end of a component or form tag (\`[[Name prop="x" hidden]]\`, \`[#Form:callback hidden]\`) hides the block without deleting it: it stays in the text but is not rendered anywhere (page, Markdown, search), and the component does not get it as a parameter. Remove the word to show the block again.
- \`[~5~]\` is the address of page 5: it survives renames and moves.
- \`{i18n.key}\` is a translation into the page language, \`[@key]\` a custom site setting.`;

const _CORE = `The '$core' module (all calls are synchronous):
- link(id) → address of a published page or the target of a link page; null when there is nowhere to go (Svelte then omits href).
- page(id) → the page or null; children(parentId | null, { includeHidden }) → pages in menu order; null is the top level.
- current() → the page being rendered; ancestors(id) → from the root down to the parent, for breadcrumbs.
- listing(parentId, { perPage, sort: 'published' | 'created' | 'title' | 'menu', depth, includeHidden, paged }) → { items, number, pages, total, url(n), pager(around) }; the page number comes from the address /blog/page-2.
- translations(id?) → [{ language, url, title, current }] for a language switcher.
- site() → settings with i18n and custom; t(key) → translation into the page language; setting(key) → custom setting.
- media(path) → versioned file URL; image(path) → { src, srcset, width, height, alt } from the media library.
- script(name) → URL of the current version of the site script, or null when there is none; a page that calls it is rendered anew when the script changes.
- search(query, { limit, parent, page }) → { query, corrected, items: [{ id, title, url, snippet }], total, number, pages, url(n), pager(around) }; snippet is escaped HTML with <mark>.
- request() → { path, query, header(name), cookie(name) }; read it only inside Uncached, otherwise the page is not cached. An Island inside Uncached gets props computed from it on every request.
Page fields: \`page.fields.name\` is the page's own value, else inherited from an ancestor (fields with inherit), else the default, else null.
SEO tags (canonical, description, Open Graph, JSON-LD, the Markdown link) are added to <head> by the CMS; a tag the template prints itself is not duplicated.`;

const _FORM = `A form is HTML5 markup: the fields go inside, the CMS adds <form>, the stamp, the honeypot and the submit button. The server checks a submission by the same attributes as the browser.
- A field is wrapped in \`<div class="field" data-field="text" data-label="Name">\` with \`<label for="f-name">\` and \`<input id="f-name" name="name">\`.
- Rules are attributes: required, type (email, tel, url, number, date), pattern, min/max/step, minlength/maxlength, <option>s, radio groups; data-message is the error text.
- \`data-show-if="field=value|value"\` on the wrapper shows it only for these values; \`data-show-if="field"\` — when the field is filled in.
- Steps: \`<fieldset class="form-step" data-step="Contacts">\`.
- Files: \`<input type="file" accept=".pdf,image/*" multiple data-max-size="10">\` (megabytes, at most 20).
- Hidden values filled in by the server: \`<input type="hidden" name="page" data-source="page.title">\`; sources: page.title, page.url, page.id, page.field:name, query:name, cookie:name, setting:key, utm, referrer, site.name, time.
- cookie:name is the visitor's cookie when the form is shown and when it is sent (a partner code, for example). Cookies of the CMS itself (cms_…, __Host-…, __Secure-…) are refused when the form is saved.
- Labels for the values of a hidden field, like the options of a select: \`<input type="hidden" name="plan" data-source="query:plan" data-label="Plan" data-labels="basic=Basic plan|pro=Pro plan with support">\`. {plan} in the confirmation email and the notification subject, the notification text, the submission in the manager and the CSV show the label; a value without a label shows as is; data-show-if still compares the value. The webhook keeps the value in \`values\` and adds \`labels: { plan: "Pro plan with support" }\`. Write the labels in the site language. data-labels is only for hidden fields; an entry that is not value=label or a value labelled twice is refused when the form is saved.
- A link to a page of the site inside the form is [~id~].
- Form settings beyond the markup: confirmation (an email to the submitter: enabled, field with the address, subject, plain text with {form} and {field name}; one per address and form in 10 minutes) and webhook (an https:// address that receives each accepted submission as JSON signed with X-Eile-Signature: sha256=HMAC).`;

const _FIELDS = `Fields are extra values of a page (template variables in Evo): name (camelCase), label, type (text, richtext, number, boolean, date, select, image), options for select, defaultValue, inherit (take the value from the nearest ancestor), templates (the templates whose pages have this field). A template reads them as \`page.fields.name\`.`;

/** Разделы памятки: правила вида элемента, текст страницы, формы, поля и `$core`. */
export var GUIDE = {
  template: _TEMPLATE,
  component: _COMPONENT,
  script: _SCRIPT,
  plugin: _PLUGIN,
  text: `${_TEXT}\n${_TAGS}`,
  form: _FORM,
  fields: _FIELDS,
  core: _CORE,
} as const;

/** HTML текста страницы для палочки: без тегов компонентов — их ставит редактор блоками. */
export var TEXT_RULES = _TEXT;
