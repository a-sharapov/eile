<script lang="ts">
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { openPalette } from '#lib/palette.svelte.ts';
import { resolve } from '$app/paths';
import type { HelpProps } from './help.ts';

let { shown, chapterShown, mod, admin }: HelpProps = $props();
</script>

  <!-- Благодарность — первой: идеи менеджера пришли отсюда. -->
  <aside class="thanks" aria-labelledby="thanks-title">
    <h2 id="thanks-title">Thank you, MODX</h2>
    <p>
      {t('app.name')} is inspired by <a href="https://modx.com" target="_blank" rel="noopener">MODX</a> Evolution: the site tree as the main
      tool, templates and chunks, custom page fields, and simplicity for the people who write the texts. Thanks to the authors and the
      MODX community for years of work and for ideas that live on here.
    </p>
  </aside>

  <p class="lead">
    This is how to run your site in the manager: create and publish pages, write text, work with images and
    find what you need in seconds. You don’t have to read it all in order — open a chapter from the contents or search the help for a word.
  </p>


  <!-- С чего начать -->
  <h2 id="start" hidden={!chapterShown('start')}>Getting started</h2>
  <section id="start-layout" data-topic hidden={!shown('start-layout')}>
    <h3>How the manager is laid out</h3>
    <ul>
      <li><strong>The header</strong> — sections, the “Go to” field for jumping anywhere, a link to the site and your menu on the right.</li>
      <li><strong>The page tree</strong> on the left — the whole site, nested as it is. The number to the right of a title is the page number (id). You can hide the tree with the {@html icons.panelClose} button and make it wider by dragging its edge.</li>
      <li><strong>The canvas</strong> on the right — the open screen: the overview, a page, the media library. At its top is a bar with the path, the status and action buttons.</li>
    </ul>
    <p>On a phone, the tree opens with the {@html icons.menu} button in the header and closes by itself once you choose a page.</p>
  </section>
  <section id="start-overview" data-topic hidden={!shown('start-overview')}>
    <h3>Site overview</h3>
    <p>
      The first screen after you sign in is the <a href={resolve('/(app)/pages')}>page table</a> in tree order. The title, address, menu
      title and template can be edited right in the row — a change is saved when you leave the field; Enter moves to the same column below, Esc cancels.
      The “In menu” and “Published” checkboxes take effect right away. The status buttons at the top highlight, for example, only drafts.
    </p>
    <p>
      The “Tree” view shows the site by section, and on the right — recent changes (what was done, by whom and when) and what
      needs attention: scheduled publications and drafts.
    </p>
  </section>
  <section id="start-statuses" data-topic hidden={!shown('start-statuses')}>
    <h3>What the page icons mean</h3>
    <p>The icon in the tree shows the page type, and the dot on its corner shows the status.</p>
    <ul class="legend">
      <li><span class="glyph" aria-hidden="true">{@html icons.file}</span><span><strong>Page</strong> — a regular site page, built by its template.</span></li>
      <li><span class="glyph" aria-hidden="true">{@html icons.fileCode}</span><span><strong>File</strong> — CSS, a feed, SVG, robots.txt: the site serves its text as is. Each type has its own icon.</span></li>
      <li data-status="published"><i class="status-node" aria-hidden="true"></i><span><strong>Published</strong> — visitors can see it.</span></li>
      <li data-status="draft"><i class="status-node" aria-hidden="true"></i><span><strong>Draft</strong> — it isn’t on the site; its title in the tree is in italics.</span></li>
      <li data-status="scheduled"><i class="status-node" aria-hidden="true"></i><span><strong>Scheduled</strong> — it goes live by itself at the set time.</span></li>
      <li data-status="trashed"><i class="status-node" aria-hidden="true"></i><span><strong>In trash</strong> — removed from the site; you can bring it back.</span></li>
      <li><span class="glyph" aria-hidden="true">{@html icons.eyeOff}</span><span><strong>Hidden from menu</strong> — the page opens at its address but isn’t in the site menu.</span></li>
      <li><span class="glyph" aria-hidden="true">{@html icons.link}</span><span><strong>Link</strong> — not a page but a jump to another address.</span></li>
    </ul>
  </section>

  <!-- Страницы -->
  <h2 id="pages" hidden={!chapterShown('pages')}>Pages</h2>
  <section id="pages-create" data-topic hidden={!shown('pages-create')}>
    <h3>Create a page</h3>
    <ol>
      <li>Click “New page” on the overview or the {@html icons.filePlus} icon above the tree. To create the page right inside a section, hover over the section in the tree and click <strong>+</strong>.</li>
      <li>Write the title — the address is built from it automatically until you change the address by hand. If you change the title of an existing page, its old address keeps leading to it.</li>
      <li>Write the text and click “Save” or press <kbd>{mod}</kbd>+<kbd>S</kbd>. The page is saved as a draft — visitors can’t see it yet.</li>
      <li>When everything is ready, click “Publish”.</li>
    </ol>
  </section>
  <section id="pages-editor" data-topic hidden={!shown('pages-editor')}>
    <h3>Page tabs</h3>
    <dl>
      <dt>Document</dt>
      <dd>Title, address, summary (a short text for lists) and the text. On the right — the place on the site (parent and template), publishing and the menu: the menu title and the order among sibling pages.</dd>
      <dt>Fields</dt>
      <dd>Custom fields shown by the template: price, cover image, date. The tab is there only if the template has such fields. An empty field marked “inherits from…” gets its value from the section above.</dd>
      <dt>Search and social</dt>
      <dd>Title and description for search engines, an image for social media and messengers, and a preview of how the page looks from outside. Here you can also hide a service page from search and see its old addresses.</dd>
      <dt>Settings</dt>
      <dd>Caching, kind (page or link) and content type, the branch language, scheduled publishing. You’ll rarely need to look here.</dd>
      <dt>Translations</dt>
      <dd>On a multilingual site, also in Settings: say which page this one translates. Search engines get hreflang links to every language, and a template can draw a language switcher with <code>translations()</code> from <code>$core</code>.</dd>
    </dl>
    <p>A dot on a tab means it has unsaved changes. If you try to leave the page without saving them, the manager asks first.</p>
  </section>
  <section id="pages-publish" data-topic hidden={!shown('pages-publish')}>
    <h3>Publish now or on a schedule</h3>
    <p>
      “Publish” and “Unpublish” are in the bar above the page. To have a page go live by itself, click “Schedule
      publishing” in the “Publishing” block: the “Settings” tab opens with the “Publish at” and “Unpublish at” fields.
      Save — and at the set time everything happens without you. If you click “Publish” on a scheduled page,
      the manager asks whether to publish it ahead of schedule.
    </p>
    <p>The eye {@html icons.eye} in the page bar is the preview: it shows the page as it looks on the site, even if it isn’t published yet. The preview shows the saved version.</p>
  </section>
  <section id="pages-menu" data-topic hidden={!shown('pages-menu')}>
    <h3>Site menu</h3>
    <p>
      A page appears in the menu under its “Menu title” — you can make it shorter than the main title. “Hide from menu” keeps
      the page available at its address but removes it from the menu. The menu order is the same as in the tree.
    </p>
  </section>
  <section id="pages-move" data-topic hidden={!shown('pages-move')}>
    <h3>Move and reorder</h3>
    <ul>
      <li>Drag a page in the tree: onto a row to nest it, or to the edge of a row to place it alongside.</li>
      <li>Or open the page menu (right-click the row or click the “…” button) → “Move to…”.</li>
      <li>With the keyboard: <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> moves the page among its siblings.</li>
    </ul>
    <p>After a move or an address change, the old address keeps leading to the page — visitors and search engines won’t hit a dead end. These addresses are listed on the “Search and social” tab.</p>
  </section>
  <section id="pages-link" data-topic hidden={!shown('pages-link')}>
    <h3>A link instead of a page</h3>
    <p>
      If a menu item should lead to another site or another section, create a link: the {@html icons.link} icon above the tree.
      In the “Link target” field, enter an address, a path like <code>/contacts</code> or a page number.
    </p>
  </section>
  <section id="pages-files" data-topic hidden={!shown('pages-files')}>
    <h3>Files: styles, feeds, robots.txt</h3>
    <p>
      A page can be served not as HTML but as a file: CSS, JavaScript, JSON, XML, an RSS feed, SVG or plain text.
      Choose the type in “Settings” → “Content type” and write the address with an extension: <code>style.css</code>, <code>feed.xml</code>.
    </p>
    <p>
      A file is served without a template — exactly the text written in the editor. <code>[~5~]</code> links, placeholders and
      <code>[[Name]]</code> components work in it: that’s how a feed puts together its entries. Files don’t appear in menus, the site map or search. Your own published
      <code>robots.txt</code> page replaces the one the site builds itself.
    </p>
    <p>
      The browser runs SVG, XML, feeds and JavaScript, so only an administrator can choose and edit them. Editors can use
      HTML, text, CSS, Markdown, CSV, calendar and JSON; when an editor saves HTML, the site strips scripts and event handlers from it.
    </p>
  </section>
  <section id="pages-copy" data-topic hidden={!shown('pages-copy')}>
    <h3>Copy a page</h3>
    <p>“Duplicate” {@html icons.copy} in the page bar or in its menu creates a copy next to the original — unpublished, with “(copy)” in the title. The cursor goes straight to the title.</p>
  </section>
  <section id="pages-trash" data-topic hidden={!shown('pages-trash')}>
    <h3>Trash</h3>
    <p>
      “Move to trash” removes a page from the site along with all its child pages. Changed your mind? Click “Undo” in the notification. The trash
      is at the bottom of the tree: open the page from there and click “Restore”. “Empty trash” deletes pages for good.
    </p>
  </section>

  <!-- Текст -->
  <h2 id="text" hidden={!chapterShown('text')}>Page text</h2>
  <section id="text-format" data-topic hidden={!shown('text-format')}>
    <h3>Formatting</h3>
    <p>Above the text is a toolbar: paragraph style, bold, italic, link, lists, quote and image. Much of it works right as you type:</p>
    <ul class="tricks">
      <li><kbd>##</kbd> and a space at the start of a line — a heading (<kbd>###</kbd> — a smaller one);</li>
      <li><kbd>-</kbd> and a space — a list, <kbd>1.</kbd> and a space — a numbered list;</li>
      <li><kbd>&gt;</kbd> and a space — a quote;</li>
      <li><kbd>{mod}</kbd>+<kbd>B</kbd> — bold, <kbd>{mod}</kbd>+<kbd>I</kbd> — italic, <kbd>{mod}</kbd>+<kbd>Z</kbd> — undo.</li>
    </ul>
    <p>The “HTML” button above the text shows the markup — for those who write it themselves.</p>
  </section>
  <section id="text-links" data-topic hidden={!shown('text-links')}>
    <h3>Links</h3>
    <p>
      Select some words and press <kbd>{mod}</kbd>+<kbd>K</kbd>. Start typing a page title and choose the page from the suggestions — such a
      link won’t break even if the page is renamed or moved. You can also enter an address: <code>https://…</code>,
      <code>/path</code>, <code>mailto:</code> or <code>tel:</code>. An empty address removes the link.
    </p>
  </section>
  <section id="text-images" data-topic hidden={!shown('text-images')}>
    <h3>Images</h3>
    <p>
      The {@html icons.image} icon on the toolbar opens the media library: choose an image or upload a new one right from there. The image
      description is filled in from the media library — edit it if you need a different one.
    </p>
  </section>
  <section id="text-blocks" data-topic hidden={!shown('text-blocks')}>
    <h3>Blocks and components</h3>
    <p>
      Page text is made of blocks. Below it is “Add block: Text / Component”. A component is a ready-made piece of the site’s
      design, such as a callout or a banner: choose it and fill in its fields. Move blocks with the arrows and delete them with the cross —
      a deleted block can be brought back from the notification. The “Hide on the site” box in a component or form block takes it off the
      site without deleting it: the block stays in the text marked “Hidden”, while visitors, search and the Markdown version of the page don’t see it.
    </p>
  </section>
  <section id="text-keys" data-topic hidden={!shown('text-keys')}>
    <h3>Placeholders in text</h3>
    <dl>
      <dt><code>{'{i18n.key}'}</code></dt>
      <dd>A translation: on the site it turns into text in the page’s language. The texts themselves are in “Settings” → “Translations”.</dd>
      <dt><code>[@key]</code></dt>
      <dd>A custom site setting, such as a phone number: change it in one place and it updates everywhere. The list is in “Settings” → “Custom settings”.</dd>
      <dt><code>[~5~]</code></dt>
      <dd>The address of page number 5 — this is how links to pages work.</dd>
    </dl>
  </section>

  <!-- Медиатека -->
  <h2 id="media" hidden={!chapterShown('media')}>Media library</h2>
  <section id="media-upload" data-topic hidden={!shown('media-upload')}>
    <h3>Upload files</h3>
    <p>
      Drag files anywhere onto the <a href={resolve('/(app)/media')}>media library</a> or click the upload strip. The folder is next
      to the strip, and the manager remembers it. Images automatically get smaller size variants (480, 960 and 1920 pixels): the site serves
      each screen the one that fits. If a file with that name already exists, the manager asks whether to replace it.
    </p>
  </section>
  <section id="media-card" data-topic hidden={!shown('media-card')}>
    <h3>File details and image description</h3>
    <p>
      Click a file to open its details: a preview, the size, the dimensions, where the file is used, and the “Copy URL”,
      “Open” and “Delete file” buttons. An image also has a description there: one sentence about what it shows. Screen readers read it to blind visitors,
      search engines read it too, and it’s filled in automatically when the image is inserted into text. Tiles without a description are marked “no description”.
    </p>
  </section>
  <section id="media-remove" data-topic hidden={!shown('media-remove')}>
    <h3>Delete a file</h3>
    <p>Before deleting, the manager shows which pages use the file — so an image doesn’t vanish from the site unexpectedly. The size variants are deleted along with the file.</p>
  </section>

  <!-- Формы и заявки -->
  <h2 id="forms" hidden={!chapterShown('forms')}>Forms and submissions</h2>
  <section id="forms-place" data-topic hidden={!shown('forms-place')}>
    <h3>Put a form on a page</h3>
    <p>
      In the page text, click “Add block: Form” and choose a form from the list. In the text, it’s a tag like
      <code>[#Form:callback]</code>: you can also type it in by hand. The form is rendered fresh for every visitor, while the
      page around it stays in the cache — so the site doesn’t slow down.
    </p>
  </section>
  <section id="forms-inbox" data-topic hidden={!shown('forms-inbox')}>
    <h3>Handle submissions</h3>
    <p>
      New submissions show up on the envelope in the header: the number counts unread ones. Click it to see today’s and this week’s counts and the latest submissions;
      “All submissions” opens the <a href={`${resolve('/(app)/forms')}?tab=inbox`}>list</a>: filters by form and status, search,
      and the j and k keys.
      A submission has “Call” and “Email” buttons, where the visitor came from (page, UTM tags), the “In progress” or
      “Done” status and a note for colleagues. Submissions that look like spam go to “Spam” and don’t trigger notifications.
    </p>
  </section>
  <section id="forms-keep" data-topic hidden={!shown('forms-keep')}>
    <h3>How long submissions are kept</h3>
    <p>
      Submissions are visitors’ personal data: they’re deleted automatically when the form’s retention period ends, after 30 days by default. Save what you need
      with the “Download CSV” button — the file opens in Excel.
    </p>
  </section>
  {#if admin}
    <section id="forms-build" data-topic hidden={!shown('forms-build')}>
      <h3>Build a form</h3>
      <p>
        <a href={resolve('/(app)/forms')}>“Forms”</a> in the top menu → “New form” starts with a ready-made set: name, phone, comment and consent. Add fields
        with the buttons at the bottom; each one has a label, a type, a required flag and rules: pattern, length, limits. On the right is the form as
        a visitor will see it. A hidden field remembers the page, ad tags, a URL parameter or a visitor’s cookie (a partner code, say) — the server
        fills in page and cookie values itself, so they can’t be tampered with; the CMS’s own cookies are never taken. To delete a form, use the trash icon on its card or “Delete” in the editor:
        the manager names the pages where the form is used, and its submissions stay for another 30 days.
      </p>
      <p>
        A field's <strong>condition</strong>, “Show if the field … equals …”, shows it only when it matters: an address only
        for courier delivery, say. A field hidden by its condition is not checked and stays out of the submission. A
        <strong>Step</strong> splits a long form into screens with Back and Next, and each step is checked before the next one.
        A <strong>File</strong> field takes files of the types you allow, up to 10 MB each (you can raise it to 20): they are kept with the submission
        and downloaded from its card.
      </p>
    </section>
    <section id="forms-notify" data-topic hidden={!shown('forms-notify')}>
      <h3>Notifications in Telegram and by email</h3>
      <p>
        In <a href={`${resolve('/(app)/settings')}?tab=notify`}>“Settings → Notifications”</a>, connect a Telegram bot (a token
        from @BotFather, then “Find chats”) and email (an SMTP server). Reports of site failures arrive there too, above a severity
        threshold you choose; repeats within 15 minutes are merged. A form can have its own channels and email subject.
        The notification language is set there too; by default it is the site language.
      </p>
      <p>
        An <strong>email to the sender</strong>, on the form’s Notifications tab, confirms a submission to the address from its email
        field: you write the subject and text, and {'{name}'} becomes the field’s value. It goes out through the same email, only for a
        real submission and at most once per address in 10 minutes. A <strong>webhook</strong>, on the Integrations tab, sends every
        accepted submission as JSON to another service, a CRM for example, signed with the form’s secret; whether it arrived shows on
        the submission.
      </p>
    </section>
  {/if}

  <!-- Быстрая работа -->
  <h2 id="speed" hidden={!chapterShown('speed')}>Working faster</h2>
  <section id="speed-jump" data-topic hidden={!shown('speed-jump')}>
    <h3>Go to</h3>
    <p>
      Press <kbd>{mod}</kbd>+<kbd>K</kbd> anywhere or click the “Go to” field in the header, start typing a page title, its address or number
      — and press <kbd>Enter</kbd>. Sections and actions like “New page” are there too{#if admin}, as well as templates, components,
      plugins and fields{/if}. With nothing typed, the window shows recently opened pages.
    </p>
    <p><button type="button" onclick={openPalette}>{@html icons.search}{t('palette.title')}</button></p>
  </section>
  <section id="speed-ai" data-topic hidden={!shown('speed-ai')}>
    <h3>Generate with AI</h3>
    <p>
      If an administrator has connected AI in “Settings” → “AI assistant”, fields get a magic wand {@html icons.wand}. Click it
      (or press <kbd>Alt</kbd>+<kbd>I</kbd> in the field), write briefly what you need — for example, “a one-sentence summary” or
      “shorter and livelier” — look at the result and click “Insert”. Don’t like it? Click “Another version”. To undo an insertion into a field, click
      “Undo” in the notification; in page text and code, press <kbd>{mod}</kbd>+<kbd>Z</kbd>.
    </p>
    <p>The AI knows which site this is, which field it’s working on and where it is, so the request can be very short. Reread the text before publishing.</p>
  </section>
  <section id="speed-agent" data-topic hidden={!shown('speed-agent')}>
    <h3>Assistant</h3>
    <p>
      The wand button {@html icons.wand} in the header opens a conversation with the AI. Ask for something on the site, such as
      “find pages without a description and write them” or “create a draft page with our offers”: the assistant finds the pages,
      changes them and tells you what it did. You see the steps as it works.
    </p>
    <p>
      The assistant works with your rights, so an editor cannot change code through it either. It creates new pages as drafts, and
      previous versions stay on the History tab: any change can be undone.
    </p>
    <p>
      After reading form submissions, the assistant does not change code, forms, fields or settings until the next request:
      visitors write those submissions, and a crafted one must not give it orders. Plugins, passwords, users and the site
      address are never changed by the assistant.
    </p>
  </section>
  <section id="speed-tree" data-topic hidden={!shown('speed-tree')}>
    <h3>Search the tree</h3>
    <p>The <kbd>/</kbd> key puts the cursor in the search box above the tree: you can find a page by its title, address or number.</p>
  </section>
  <section id="speed-site" data-topic hidden={!shown('speed-site')}>
    <h3>Editing right on the site</h3>
    <p>
      While you are signed in to the manager, a dark bar shows at the top of the site’s pages — only you see it, visitors don’t. “Edit”
      opens the page in a window over the site: save, and the window closes and the page shows the change. “Child page” creates a page
      inside this one. Collapse the bar with the button on the right — a small icon stays in the corner, and your choice is remembered.
    </p>
  </section>
  <section id="speed-many" data-topic hidden={!shown('speed-many')}>
    <h3>Several pages at once</h3>
    <p>
      Select pages in the tree: <kbd>{mod}</kbd>+click adds a page, <kbd>Shift</kbd>+click selects every page between two, <kbd>Space</kbd>
      marks the page under the cursor. A “Selected” bar appears above the tree: publish, unpublish, move or
      move to trash all of them at once. <kbd>Esc</kbd> clears the selection.
    </p>
  </section>

  <!-- Клавиши -->
  <h2 id="keys" hidden={!chapterShown('keys')}>Keyboard shortcuts</h2>
  <section id="keys-all" data-topic hidden={!shown('keys-all')}>
    <h3 class="sr-only">All shortcuts</h3>
    <table>
      <tbody>
        <tr><td><kbd>{mod}</kbd>+<kbd>S</kbd></td><td>Save</td></tr>
        <tr><td><kbd>{mod}</kbd>+<kbd>K</kbd></td><td>Go to; in text — insert a link</td></tr>
        <tr><td><kbd>/</kbd></td><td>Search the tree</td></tr>
        <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></td><td>Move through the tree, expand and collapse sections</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>Open a page from the tree</td></tr>
        <tr><td><kbd>Space</kbd></td><td>Select a page in the tree</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>F10</kbd></td><td>Page menu in the tree</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd></td><td>Move a page among its siblings</td></tr>
        <tr><td><kbd>{mod}</kbd>+<kbd>B</kbd>, <kbd>{mod}</kbd>+<kbd>I</kbd></td><td>Bold, italic</td></tr>
        <tr><td><kbd>{mod}</kbd>+<kbd>Z</kbd></td><td>Undo a text edit</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>I</kbd></td><td>Generate with AI (in a field, text or code)</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close a window or menu, clear the selection</td></tr>
      </tbody>
    </table>
  </section>

  <!-- Учётная запись -->
  <h2 id="account" hidden={!chapterShown('account')}>Your account</h2>
  <section id="account-menu" data-topic hidden={!shown('account-menu')}>
    <h3>Appearance, password, sign out</h3>
    <p>
      Your name on the right of the header opens a menu. “Appearance” sets the accent color and the theme (light, dark or matching the system); each
      user has their own. “Change password” asks for your current password and a new one — at least 10 characters. “Sign out” ends
      your session on this device. The manager language is there too: English, German or Russian; before you sign in, pick it
      at the bottom of the sign-in screen, and after that it stays with your account.
    </p>
  </section>
  <section id="account-keys" data-topic hidden={!shown('account-keys')}>
    <h3>API keys for agents</h3>
    <p>
      “API keys” in the same menu creates a key for an AI agent or a script: Claude Code, Cursor and Codex use it to connect to the
      site over MCP and work with your rights. The key is shown once, so copy it together with the ready-made connection command.
      Revoke a key you no longer need: agents with it lose access at once. A key cannot create other keys, change the password,
      manage users or download a copy of the site.
    </p>
  </section>

  <!-- Для администратора -->
  {#if admin}
    <h2 id="admin" hidden={!chapterShown('admin')}>For administrators</h2>
    <section id="admin-users" data-topic hidden={!shown('admin-users')}>
      <h3>Users and roles</h3>
      <p>
        An <strong>administrator</strong> can do everything. An <strong>editor</strong> works with pages and the media library. In the
        “<a href={resolve('/(app)/users')}>Users</a>” section you can add a user, set a password (hand it over in person), change
        a role or delete a user. Pages edited by a deleted user stay.
      </p>
    </section>
    <section id="admin-settings" data-topic hidden={!shown('admin-settings')}>
      <h3>Site settings</h3>
      <dl>
        <dt>Site</dt>
        <dd>Name, language and other languages, the home page and the 404 page, the site address, and the description and image for social media.</dd>
        <dt>Search and AI</dt>
        <dd>Custom robots.txt rules and links to check what search engines and AI see. Also synonyms for site search: one group of words per line, separated by commas. Site search understands word forms on its own, fixes typos and looks for a quoted phrase as a whole.</dd>
        <dt>Translations</dt>
        <dd>Texts in different languages by key — for <code>{'{i18n.key}'}</code>. Changes in the table are saved right away.</dd>
        <dt>Custom settings</dt>
        <dd>Values like a phone number or an address — for <code>[@key]</code>.</dd>
        <dt>AI assistant</dt>
        <dd>API URL, model and key (DeepSeek, OpenAI and others with the same API) and instructions for AI — the tone and rules for texts. The key is stored only on the server.</dd>
      </dl>
    </section>
    <section id="admin-elements" data-topic hidden={!shown('admin-elements')}>
      <h3>Elements</h3>
      <dl>
        <dt>Templates</dt>
        <dd>Decide how a page looks. Above a template’s code you can see which fields are assigned to it and how many pages use it.</dd>
        <dt>Components</dt>
        <dd>Pieces of the design that editors insert into text as blocks. A component’s description and parameters become a form in the editor.</dd>
        <dt>Plugins</dt>
        <dd>Change how the site behaves — redirects, for example. A button turns them on and off instantly.</dd>
        <dt>Page fields</dt>
        <dd>Custom fields for templates: text, rich text, number, yes/no, date, choice from a list, image; with a default value and inheritance from sections above.</dd>
      </dl>
      <p>If the code has an error, the manager won’t save it and shows the line — “Line N” takes you there. An element that’s used somewhere can’t be deleted: the manager shows where.</p>
    </section>
    <section id="admin-code" data-topic hidden={!shown('admin-code')}>
      <h3>Where code runs</h3>
      <p>The code of templates, components and plugins runs on the server: visitors get finished HTML. Only island code runs in the browser.</p>
      <dl>
        <dt>Component</dt>
        <dd>
          When the code builds part of a page: a list of pages, a calculation, data from <code>$core</code>. It runs while the
          page renders, and the result is cached with the page. If it needs the request itself — cookies, URL parameters, the
          current time — place the component with <code>{'<Uncached name="…"\u00a0/>'}</code> from <code>$core/Uncached</code>: it
          then renders on every request while the rest of the page stays cached.
        </dd>
        <dt>Plugin</dt>
        <dd>
          When the code should run at a certain moment rather than draw part of a page: <code>render</code> edits the finished
          HTML of any page before it is sent, <code>notFound</code> answers with a redirect address instead of a 404, and
          <code>on</code> reacts to site events — for example, calls a webhook when a page is published.
        </dd>
        <dt>Island</dt>
        <dd>
          The only way to run code in the browser: <code>{'<Island name="…"\u00a0/>'}</code> from <code>$core/Island</code>. It has
          no <code>$core</code> and gets server data through its parameters, which visitors can see: don’t pass secrets in them.
          An island can also sit inside a component placed with <code>Uncached</code>: its parameters are then worked out on every
          request — say, a price for the partner code in a cookie — while the page around it stays cached.
        </dd>
      </dl>
      <p>Components can import only <code>svelte</code>, <code>$core</code> and other components; plugins only <code>$core</code>.</p>
    </section>
    <section id="admin-backup" data-topic hidden={!shown('admin-backup')}>
      <h3>Backups</h3>
      <p>
        The “<a href={resolve('/(app)/backups')}>Backups</a>” section in the header: download the whole site as one file —
        a <strong>database file (.db)</strong> for an exact restore or <strong>records in JSON</strong> that you can
        open, compare and move to another server. You can also restore the site there from either kind: before replacing anything,
        the manager saves the previous state on the server next to the database. Keep backups somewhere other than this server.
      </p>
      <p>
        <strong>Automatic backups</strong> are turned on in “<a href={`${resolve('/(app)/settings')}?tab=upkeep`}>Settings → Backups and
        updates</a>”: once a day, twice, four times a day or every hour, into a folder on the server; older ones beyond the set number
        are deleted automatically. If a backup fails, you’ll get a failure notification.
      </p>
      <p>
        There’s also an <strong>update check</strong>: once a day the server asks the releases page whether there’s a new version, and
        it shows up in the profile menu. To update, run <code>cms update</code> on the server and restart it.
      </p>
    </section>
    <section id="admin-cli" data-topic hidden={!shown('admin-cli')}>
      <h3>Command line</h3>
      <p>The site program has commands for the server:</p>
      <ul>
        <li><code>cms help</code> — all commands with examples;</li>
        <li><code>cms backup</code> — a backup of the whole site in one file, <code>cms backup site.json</code> — as records in JSON;</li>
        <li><code>cms restore file</code> — restore the site from a backup;</li>
        <li><code>cms update</code> — update the program to a new version, <code>--check</code> — only check for one;</li>
        <li><code>cms elements pull folder</code> — templates, components, plugins, forms and fields as files, with an AGENTS.md guide for AI agents; <code>cms elements push folder</code> — back to the site;</li>
        <li><code>cms mcp</code> — an MCP server for an agent on this server, <code>cms diagnose</code> — the site diagnostics in the terminal;</li>
        <li><code>cms users password email</code> — a new password if an administrator forgot theirs.</li>
      </ul>
    </section>
  {/if}

  <!-- Если что-то пошло не так -->
  <h2 id="trouble" hidden={!chapterShown('trouble')}>If something goes wrong</h2>
  <section id="trouble-load" data-topic hidden={!shown('trouble-load')}>
    <h3>“Couldn’t load”</h3>
    <p>The server didn’t respond — check your internet connection and click “Retry”. Your edits on the open page aren’t lost: save them once the connection is back.</p>
  </section>
  <section id="trouble-site" data-topic hidden={!shown('trouble-site')}>
    <h3>The page isn’t on the site</h3>
    <ul>
      <li>Is it published? A draft has a ring-shaped node and an italic title.</li>
      <li>Is it scheduled for a later date?</li>
      <li>Is the section it belongs to in the trash?</li>
      <li>“Hide from menu” removes a page only from the menu — it still opens at its address.</li>
    </ul>
  </section>
  <section id="trouble-password" data-topic hidden={!shown('trouble-password')}>
    <h3>Forgot your password or sign-in is locked</h3>
    <p>
      Ask an administrator to set a new password for you. After five failed attempts from your computer, sign-in from it is locked for 15 minutes (other addresses aren’t affected) — wait and
      try again. If your session has ended, the manager offers to sign in again right in the notification.
    </p>
  </section>
  <section id="trouble-save" data-topic hidden={!shown('trouble-save')}>
    <h3>Changes won’t save</h3>
    <p>The error is shown next to the field that needs fixing, and its tab opens by itself. For example, an address may use only letters a–z, digits and hyphens, and it must differ from the addresses of sibling pages.</p>
  </section>
