<script lang="ts">
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { openPalette } from '#lib/palette.svelte.ts';
import { resolve } from '$app/paths';
import { EVENT_EXAMPLE, type HelpProps, SUMMARY_EXAMPLE } from './help.ts';

let { shown, chapterShown, mod, admin, analytics }: HelpProps = $props();
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
  <section id="pages-share" data-topic hidden={!shown('pages-share')}>
    <h3>Show a draft to a client</h3>
    <p>
      An unpublished page has {@html icons.share} “Link for a client” in the row above it. Create a link — say who it is for and how
      long it lives (7 days by default) — and send it: it opens the page without signing in to the manager, exactly as it will look
      on the site, with a “not published” badge. Forms are not sent in the preview, search engines do not index it, and the link
      opens no other page and not the manager. The link is shown in full once; the list of links with revoke is in the same window.
    </p>
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
      to the strip, and the manager remembers it. The server makes smaller copies of JPEG, PNG and WebP images by itself (480, 960 and 1920
      pixels, never wider than the original), a few seconds after the upload: the site serves each screen the one that fits. Uploads from
      agents and the API get them too. If a file with that name already exists, the manager asks whether to replace it.
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
    <p>
      A submission keeps the visitor’s IP address and browser: they help to tell spam apart. If the site’s privacy policy
      promises not to store IP addresses, an administrator turns this off on the form’s “Protection and storage” tab. The
      limit per address still works then: the address stays only in the server’s memory.
    </p>
  </section>
  {#if admin}
    <section id="forms-build" data-topic hidden={!shown('forms-build')}>
      <h3>Build a form</h3>
      <p>
        <a href={resolve('/(app)/forms')}>“Forms”</a> in the top menu → “New form” starts with a ready-made set: name, phone, comment and consent. Add fields
        with the buttons at the bottom; each one has a label, a type, a required flag and rules: pattern, length, limits. On the right is the form as
        a visitor will see it. Reorder blocks with the arrows or drag the handle on their left with a mouse or finger; a step moves
        together with its fields. With the keyboard: Space on the handle, up and down arrows, Space to drop, Esc to put it
        back. A hidden field remembers the page, ad tags, a URL parameter or a visitor’s cookie (a partner code, say) — the server
        fills in page and cookie values itself, so they can’t be tampered with; the CMS’s own cookies are never taken. If a hidden field
        gets a key, like <code>?plan=pro</code>, give it “Value labels” — lines such as “pro | Pro plan with support”: emails,
        notifications, the submission and the CSV show the label, and the webhook gets both the key and the label. To delete a form, use the trash icon on its card or “Delete” in the editor:
        the manager names the pages where the form is used, and its submissions stay for another 30 days.
      </p>
      <p>
        A field's <strong>condition</strong>, “Show if the field … equals …”, shows it only when it matters: an address only
        for courier delivery, say. A field hidden by its condition is not checked and stays out of the submission. A
        <strong>Step</strong> splits a long form into screens with Back and Next, and each step is checked before the next one.
        A <strong>File</strong> field takes files of the types you allow, up to 10 MB each (you can raise it to 20): they are kept with the submission
        and downloaded from its card.
      </p>
      <p>
        After sending, the visitor sees the thank-you text from the “After sending” tab instead of the form. For your own
        markup — a heading, a link, a button — add a text block <code>&lt;template data-sent&gt;…&lt;/template&gt;</code> in HTML mode:
        it replaces the text with and without the script, and an element with <code>tabindex="-1"</code> in it gets the focus.
      </p>
    </section>
    <section id="forms-spam" data-topic hidden={!shown('forms-spam')}>
      <h3>Spam protection without a captcha</h3>
      <p>
        Every form has an invisible bot trap, a one-time stamp, a minimum fill-in time and a limit on submissions from one address.
        One more step is the <strong>browser check</strong>: while the visitor fills in the form, their browser quietly solves a small
        puzzle, usually in a fraction of a second, and the line “Spam protection confirmed” appears under the button. There is no
        captcha, no cookie and no third-party service. Choose the level on the form’s “Protection and storage” tab: new forms use
        “Standard”, while forms created before this version keep the check off until you turn it on.
      </p>
      <p>
        A submission from a browser without JavaScript is not lost: the visitor sees the thank-you text, and the submission goes to
        Spam, marked “Sent without JavaScript”, without a notification. Look there now and then and move a real one to New.
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
        If your host blocks SMTP ports (new DigitalOcean and Hetzner servers often do), set “Send through” to a mail service
        with an HTTP API — Brevo, Postmark, Mailgun, Resend or Amazon SES — and paste its key: emails then go out over HTTPS,
        through port 443. Verify the sender’s domain with the service using SPF and DKIM records in DNS, or it will not send.
        The key stays on the server; the manager shows only its last four characters. “Send a test” sends an email the chosen way.
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

  <!-- Статистика -->
  <h2 id="stats" hidden={!chapterShown('stats')}>Statistics</h2>
  <section id="stats-read" data-topic hidden={!shown('stats-read')}>
    <h3>Reading the statistics</h3>
    <p>
      <a href={resolve('/(app)/stats')}>Statistics</a> in the top menu shows visitors and page views for 7, 30 or 90 days or your own
      dates, plus pages, sources, entry pages, devices and languages. The server counts by itself, without cookies: signed-in
      managers, bots and prefetching are not counted. A visitor is unique within a day: someone who came on three days counts
      three times. The source is the utm_source tag, otherwise the website the visitor came from; empty means a direct visit.
    </p>
  </section>
  <section id="stats-goals" data-topic hidden={!shown('stats-goals')}>
    <h3>Goals and conversion rate</h3>
    <p>
      A goal is an accepted submission of any form (spam excluded) or a click on a goal link. The conversion rate is the share of
      the day’s visitors with that source or entry page who reached the goal.
    </p>
    {#if admin}
      <p>
        Turn counting on and set goal links and the beacon in <a href={`${resolve('/(app)/settings')}?tab=stats`}>Settings → Statistics</a>;
        a sample paragraph for the site’s privacy policy is there too.
      </p>
    {/if}
  </section>

  <!-- Аналитика -->
  {#if analytics}
  <h2 id="analytics" hidden={!chapterShown('analytics')}>Customer analytics</h2>
  <section id="analytics-what" data-topic hidden={!shown('analytics-what')}>
    <h3>What it is for</h3>
    <p>
      Customer analytics answers an owner’s questions: where customers come from, which of them pay, how much each source brings
      in and whether the ads pay off. The data does not come from visitors’ browsers but from your bot, shop or app — the
      <strong>sender</strong>. For each step a person takes (arrives from a link, starts a trial, pays, gets a refund) it sends an
      event to the site. The site builds people from those events by itself and shows the reports on the tabs of
      <a href={resolve('/(app)/stats')}>Statistics</a>: Overview, Sources, Funnels, Cohorts, People, Labels, Spend, Quality and
      Setup.
    </p>
    <p>
      A person here is a pseudonym like <code>u_7f3a9c2b</code>, with no name, email or phone number; the sender makes the
      pseudonym up. People are never linked to visits of the site, and the site sets no cookie for this. Visitor statistics count
      the visitors of a day, analytics counts people from events. There is one bridge between them: a link button on the site
      carries the source of the visit to the sender inside a label (see Labels and links).
    </p>
  </section>
  <section id="analytics-start" data-topic hidden={!shown('analytics-start')}>
    <h3>Getting started</h3>
    {#if admin}
      <ol>
        <li>
          Open <a href={resolve('/(app)/stats/setup')}>Statistics → Setup</a>. On an empty site it offers a choice: the sample
          Subscription or Shop, Import a set from a file, or Start from scratch. A sample creates a sender, event types,
          dictionaries, a label schema, a milestone and a funnel; See what it creates lists all of it before anything is
          written, and Create writes it.
        </li>
        <li>
          On the Senders tab, give the sender your own name and issue a key with New key. The key is shown once: copy it and
          hand it to the sender’s developer together with the guide below.
        </li>
        <li>
          In <a href={`${resolve('/(app)/settings')}?tab=stats`}>Settings → Statistics</a>, Event intake, turn on Accept events,
          choose how long to keep history and publish the paragraph for the privacy policy on your site — a sample is right
          there. While intake is off, the site answers the sender with 503 and stores nothing.
        </li>
        <li>Set a base currency there too if you want revenue as one figure, LTV and CAC (see Money).</li>
      </ol>
    {:else}
      <p>The site administrator connects the sender, issues its key and turns event intake on.</p>
    {/if}
  </section>
  <section id="analytics-sender" data-topic hidden={!shown('analytics-sender')}>
    <h3>Guide for the sender’s developer</h3>
    <p>
      An event is a <code>POST</code> to <code>https://your-site/_cms/events</code> with a JSON body and the key in the
      <code>Authorization: Bearer</code> header. The key can do one thing only: send events of its sender. Keep it on a server,
      not in a browser or a phone app.
    </p>
    <pre>{EVENT_EXAMPLE}</pre>
    <dl>
      <dt><code>id</code></dt>
      <dd>The event’s own ID within the sender. The site recognises a repeat with the same <code>id</code> and does not count it twice: after a network error, just send the event again.</dd>
      <dt><code>type</code></dt>
      <dd>A type code from Setup → Event types. An unknown type is accepted and waits under Unknown.</dd>
      <dt><code>at</code></dt>
      <dd>When it happened, with a time zone: <code>Z</code> or <code>+02:00</code>.</dd>
      <dt><code>subject</code></dt>
      <dd>The person’s pseudonym: 6 to 128 characters <code>A-Z a-z 0-9 . _ : -</code>, not digits only. An email, a phone number or a messenger ID is refused on purpose.</dd>
      <dt><code>data</code></dt>
      <dd>The fields of the type’s role (a payment has <code>amount</code>, <code>currency</code>, <code>payment_id</code>) and the type’s properties.</dd>
      <dt><code>traits</code>, <code>test</code></dt>
      <dd>Traits of the person, such as the language; <code>"test": true</code> marks a test event: the Event log shows it as a test, and it does not go into people.</dd>
    </dl>
    <p>How the site answers:</p>
    <dl>
      <dt>200</dt>
      <dd>Accepted. <code>warnings</code> lists what the site did not recognise; <code>duplicate</code> means a repeat of an event it already has.</dd>
      <dt>400</dt>
      <dd>Something is wrong with the event, <code>errors</code> lists it by field. Sending the same again will not help: fix it.</dd>
      <dt>401</dt>
      <dd>The key is wrong or revoked, or the sender is turned off or archived.</dd>
      <dt>429</dt>
      <dd>This address sent five wrong keys within 15 minutes: wait as long as <code>Retry-After</code> says.</dd>
      <dt>503</dt>
      <dd>Intake is off on the site: try again later. A sender that retries loses no events.</dd>
      <dt>500</dt>
      <dd>A server error: retry with the same <code>id</code>.</dd>
    </dl>
    <p>
      <strong>Daily summary.</strong> Once a day, after the day’s events have gone out, the sender sends an event with the role
      Daily summary for the past UTC day, without <code>subject</code>. The site compares it with its own count (see Data
      quality):
    </p>
    <pre>{SUMMARY_EXAMPLE}</pre>
    <p>
      <code>counts</code> is how many events of each type the sender counted that day, <code>revenue</code> is payments minus
      refunds before fees per currency, <code>failed</code> is how many events it gave up on after all retries, and
      <code>version</code> is its version. The summary hour belongs to the sender: Expect the summary by … UTC, 06:00 by default.
      It is a deadline, not the sending time, so leave room for retries. For a sender without summaries, tick The sender sends no
      summaries.
    </p>
    <p>
      <strong>Sending missing events.</strong> If events got lost, export them from the sender as a JSON Lines file — one event
      per line, just as they go over the network — and upload it under <a href={resolve('/(app)/stats/people')}>Statistics →
      People</a> with Upload file (up to 16 MiB), or on the server with <code>cms events import history.jsonl --db site.db</code>.
      Repeats are not counted twice, so you can safely send all events of the day again.
    </p>
  </section>
  <section id="analytics-setup" data-topic hidden={!shown('analytics-setup')}>
    <h3>Setup: types, properties, dictionaries</h3>
    <p>
      An <strong>event type</strong> is the code the sender sends plus a role, which tells the reports what the event means.
      There are ten roles: Touch (the person came via a label), Survey, Trial, Payment, Refund, Payment amendment (the fee
      became known later), Access ended, Action (anything else that matters for milestones), Daily summary and Erasure (forget
      the person). <strong>Properties and traits</strong> are extra fields of events (a plan, a number of items) and of people
      (a language); a property marked Dimension becomes a grouping in the reports. <strong>Dictionaries</strong> hold codes of
      values with their names: plans, answers to a survey question, parts of the label.
    </p>
    <p>
      A <strong>milestone</strong> is “did this N times within so many days”, for example a first action within three days of
      arrival. A <strong>funnel</strong> runs from the visits and goals of the site to arrival, trial, milestones and payments.
      <strong>Unknown</strong> lists what the sender sends but the setup does not know yet — a type, a value, an answer — and lets
      you create the item right from the row.
    </p>
    <p>
      Codes never change. Archive what you no longer need: it disappears from the forms, and past events keep working. Only an
      item that nothing refers to can be deleted. Every change recounts people in the background; while that runs, the reports
      say people are being recounted. The Log shows who changed what.
    </p>
  </section>
  <section id="analytics-labels" data-topic hidden={!shown('analytics-labels')}>
    <h3>Labels and links</h3>
    <p>
      A <strong>label</strong> is a string that tells where a person came from, for example <code>google__search__autumn</code>.
      The sender’s Label schema says how to read it: the separator (<code>__</code>, <code>--</code>, a dot or <code>~</code>),
      the length and the parts in order — source, channel, campaign. The values of the parts are dictionaries with the purpose
      Part of the label. The sender puts the label into a touch event, for example from the bot’s start parameter or from the
      shop’s address.
    </p>
    <p>
      A <strong>link</strong> is a button on the site that leads to the sender. The address <code>/_cms/go/code</code> sends the
      visitor on to the target and builds the label from the link’s preset parts and the source of today’s visit: its UTM tags or
      the website the visitor came from. Nothing is stored on the visitor’s device. <strong>Referrers</strong> decide which parts a
      visit without UTM gets: from a search engine, a social network, another website or a direct visit.
    </p>
    <p>
      Under <a href={resolve('/(app)/stats/labels')}>Labels</a>, Generator builds a label for a campaign and saves it to the
      Registry with a name, which the report rows then show; Check shows how a label or an address will be read; Unknown labels
      lists labels of first touches that are not in the registry.
    </p>
  </section>
  <section id="analytics-reports" data-topic hidden={!shown('analytics-reports')}>
    <h3>Reading the reports</h3>
    <ul>
      <li>
        <strong>Overview</strong> puts the totals of a period next to the previous period of the same length: new people and
        customers, revenue, spend, CAC; the site’s visits are below. A triangle over a day means the sender reported a new
        version, with a note on whether the counts matched.
      </li>
      <li>
        <strong>Sources</strong> is a table by the parts of the label: new people, milestones, trial, paid within the window, new
        customers, revenue, payments per customer, renewal, and with a base currency LTV, spend, CAC and payback. A row opens up
        into the next part. Acquisition source is a person’s first touch; Return source is the touch before a payment after the
        access ended.
      </li>
      <li>
        Shares come with their counts: “4 of 9”. People whose window has not ended yet are “still in the window” and stay out of
        the base. The rows “not given”, “not in the dictionary” and “the rest” collect empty values, unknown ones and what did not
        fit into the list.
      </li>
      <li>
        <strong>“little data”</strong> marks a row with fewer than 30 new people or fewer than 10 customers: better not to draw
        conclusions from it. The thresholds are set under Quality → Checks, Low data thresholds, and apply at once.
      </li>
      <li><strong>Funnels</strong> go from the visits and goals of the site to people: arrival, trial, milestones, payments.</li>
      <li>
        <strong>Cohorts</strong>: By first payment shows the customers of the month of their first payment and revenue per
        customer by month of life; By arrival shows the new people of the month they arrived. An incomplete cell is marked ◌ and
        stays out of the average, as does the cohort of the month still running.
      </li>
      <li>
        <strong>People</strong> lists people and opens each one: touches, payments, milestones and events. Milestone comparison
        (which milestone predicts payment best) and the Event log with everything accepted are there too.
      </li>
    </ul>
  </section>
  <section id="analytics-money" data-topic hidden={!shown('analytics-money')}>
    <h3>Money: currency, rates, spend, LTV and CAC</h3>
    <p>
      Amounts arrive in the currency of the payment. Without a base currency the reports show each currency separately. The
      base currency is set in <a href={`${resolve('/(app)/settings')}?tab=stats`}>Settings → Statistics</a>, and only a person
      signed in to the manager can set it. Sources then adds revenue up as one figure and counts LTV, spend, CAC and payback.
    </p>
    <p>
      <a href={resolve('/(app)/stats/spend')}>Spend</a> is what you spent in a month on a source: values of label parts (say,
      “Instagram, paid”) or the whole site. Rows do not nest: an amount on “Instagram” is spend not split by channel, not the
      sum of other rows. Rates are the rates of other currencies to the base one, per month. An amount without a rate stays out
      of the total and shows separately; a month without its own rate uses the previous month’s, with a mark. Rates are entered
      by you or your script with an API key; spend also by the agent when you ask it.
    </p>
    <dl>
      <dt>LTV per customer</dt>
      <dd>Revenue of new customers over the Lifetime — 3, 6 or 12 months from the first payment, or the whole time — per customer who has already lived that long.</dd>
      <dt>LTV per person</dt>
      <dd>The same over all new people of the row, including those who never paid.</dd>
      <dt>CAC, cost per person</dt>
      <dd>The row’s spend per new customer and per new person.</dd>
      <dt>LTV / CAC, payback</dt>
      <dd>Above 1, a customer brings in more over the lifetime than they cost. Payback is the month of life in which revenue per customer caught up with CAC.</dd>
    </dl>
    <p>Revenue: Before fees / After fees takes off the payment provider’s fee, if the sender reports it.</p>
  </section>
  <section id="analytics-quality" data-topic hidden={!shown('analytics-quality')}>
    <h3>Data quality</h3>
    <p>
      The <a href={resolve('/(app)/stats/quality')}>Quality</a> tab opens Data quality: can you trust the numbers? Every day
      the site checks the data and compares the sender’s summary with its own count. A failure means data is lost or does not
      match (no summary, fewer events, other revenue); a warning means a rule is broken but no data is lost; no data means
      there is nothing to check yet: before the first summary, while intake is off, when there are too few touches.
    </p>
    <ul>
      <li>
        <strong>Overview</strong> has a tile per check (failures first) and a grid of checks by day for 30 days: ✓ OK,
        ! warning, ✕ failure, – no data, a tick in a circle — resolved by hand. A cell opens the day: what was compared, the
        numbers and the actions.
      </li>
      <li>
        The summary checks (Summary arrived, Events arrived, Revenue matches, Sender delivered everything) count UTC days and run
        5 minutes after the sender’s summary hour. The others run at 06:05 UTC the next day; Links arrive, Rates are entered and
        your own checks use days of the report time zone, Statement matches uses months.
      </li>
      <li>
        A failure of Events arrived: export that UTC day’s events from the sender and upload them with Upload missing events in
        the day window. Repeats are not counted twice, and the check closes by itself as soon as the counts match. Check again
        re-checks the day right away.
      </li>
      <li>
        Resolve by hand when the cause is known and the data cannot come back: the sender was down, it was a test day. A note is
        required, and the result shows who resolved it and when; Reopen removes the mark. If things get worse later — a warning
        turns into a failure — the resolution goes away by itself.
      </li>
      <li>
        <strong>Notifications</strong> go to the failure channels in <a href={`${resolve('/(app)/settings')}?tab=notify`}>Settings
        → Notifications</a> (Telegram, email): all failures of a morning in one message, about each check no more than once a
        day, a reminder after 7 days and “back to normal” when a failure closes by itself. Without channels the screen says
        notifications are not sent, and a failure shows only as a dot next to Statistics in the menu. While the connection is
        new — until the first summary, but no longer than 7 days — there are no notifications.
      </li>
      <li>
        <strong>Checks</strong> holds the thresholds of the built-in checks, Notify (on failure, on failure and warning, never)
        and whether each is on; Restore defaults undoes your changes. The Low data thresholds for the reports are here as well,
        and so are your own checks — Add check: a metric (events of one type, events with a role, new people, new customers,
        revenue, site visitors, visitors who reached a goal), below or above a threshold, over 1, 7 or 30 days, as a failure or a
        warning. For example, “fewer than one payment a day”.
      </li>
      <li>
        <strong>Statements</strong>, once Statement matches is on: the amount of a month from your bank or payment provider
        statement (Add statement), which the site compares with its own revenue. No statement by the 5th — it reminds you.
      </li>
      <li><strong>Intake</strong> shows whether intake is on, how much came in today, the latest refusals with errors by field and the count per day.</li>
    </ul>
  </section>
  <section id="analytics-transfer" data-topic hidden={!shown('analytics-transfer')}>
    <h3>Moving the setup and samples</h3>
    <p>
      In <a href={`${resolve('/(app)/stats/setup')}?tab=transfer`}>Setup → Transfer</a>, Download the set saves the whole
      analytics setup as one JSON file: senders with their summary hour, types, properties, dictionaries, schemas, referrers,
      links, milestones, funnels and checks, archived items included. Import a set takes a file of up to 2 MB and first shows a
      dry run: what is created, what changes (“before → after”), warnings and errors. Import writes all of it or nothing; site
      items missing from the file stay as they are.
    </p>
    <p>
      A set does not carry sender keys, the intake switch, retention, the base currency, the label registry, rates, spend,
      statements, events, people or check results. On a new site you issue keys again; a copy of the site or an event file moves
      the events. Only a person in the manager imports a set — neither an API key nor the agent can.
    </p>
    <p>
      The samples Subscription and Shop are here and on an empty setup: See what it creates, then Create. Names come in the
      manager’s language, codes are the same in every language. The samples have no links — the address of your bot or shop is
      your own, so add the link yourself.
    </p>
    <p>On the server the command line does the same. The database must already exist — the first start of the server or <code>cms new</code> creates it:</p>
    <pre>cms analytics export analytics.json --db site.db            # export the set; "-" prints it
cms analytics import analytics.json --dry-run --db site.db  # dry run: the database stays as it is
cms analytics import analytics.json --db site.db            # import
cms analytics import --sample shop --language de --db site.db
cms analytics samples                                       # list the samples</pre>
    <p>A set larger than 2 MB can only be imported with the command.</p>
  </section>
  <section id="analytics-agent" data-topic hidden={!shown('analytics-agent')}>
    <h3>The agent and analytics</h3>
    <p>
      The assistant in the manager and an agent over MCP read the analytics reports as numbers and codes from the setup: which
      source paid off, where a check failed and why. On request the agent adds types, properties, milestones, funnels and checks,
      creates labels for campaigns, enters spend and resolves a failed check with a note on the reason.
    </p>
    <p>
      Only you create a sender and its key, turn intake on, set retention and the base currency and import a set; rates and
      statements come from you or your script with an API key, never from the agent. Once the agent has read people
      (pseudonyms, labels, answers), Unknown or visitor statistics, it stops changing the analytics setup, labels and spend and
      resolving checks for the rest of the request — over MCP, for the rest of the session: other people write that text, and a
      cleverly crafted label must not give the agent orders. It tells you what it would change: do it yourself, or ask again in
      a new message to the assistant or a new conversation with the agent.
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
  <section id="account-review" data-topic hidden={!shown('account-review')}>
    <h3>Review of agent changes</h3>
    <p>
      An agent working through MCP changes the site at once. To look first, turn review on: for all agents — the administrator in
      <a href={resolve('/(app)/proposals')}>“Proposals”</a>, for your own token — “Changes wait for review” in “API tokens”. Then
      changes of pages, templates, components and scripts do not go live but collect in a change set, like a pull request. Forms,
      fields and settings are not changed by an agent in this mode at all.
    </p>
    <p>
      In “Proposals” each change set has the agent’s description and the difference for each change: text and source line by line,
      fields “now → proposed”, a move in the tree. {@html icons.eye} “Preview” shows the page with the changes, “Link for a client”
      shows the same without signing in. Accept all, the selected ones, or reject: accepted changes take the normal path, appear in
      the page history on behalf of the agent and are undone by restoring a version. If the page was changed after the proposal, the
      set marks a conflict: accept it anyway or reject it.
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
    <section id="admin-gateway" data-topic hidden={!shown('admin-gateway')}>
      <h3>Mail gateway</h3>
      <p>
        Through the gateway, other services — a platform, a CRM, your own backend — send emails with the site’s mail, without SMTP of
        their own. Turn it on with the “Mail gateway” checkbox in <a href={`${resolve('/(app)/settings')}?tab=notify`}>Settings → Notifications</a>,
        in the email section: it needs saved email settings and at least one token. A token is shown once, when issued — the server
        keeps only its hash; every client gets its own token with a label, and one you don’t need is revoked with the trash button.
      </p>
      <p>
        A client sends a <code>POST</code> to the gateway path (<code>/mailer/</code> by default, it also works without the trailing slash)
        with the header <code>Authorization: Bearer token</code> and JSON <code>{'{ to, subject, html, text, from, attachments }'}</code>:
        <code>to</code> is an address, a list or <code>{'{ address, name }'}</code>; attachments have <code>filename</code>,
        <code>contentType</code>, <code>contentBase64</code>, and images in the email a <code>contentId</code> (<code>cid:…</code> in the HTML),
        up to 40 of 2 MB each. The answer is <code>{'{"ok":true}'}</code> once the mail server has accepted the email; otherwise
        <code>ok: false</code> with an error code: <code>unauthorized</code>, <code>rate_limited</code>, <code>to_required</code>,
        <code>send_failed</code> and others.
      </p>
      <p>
        The sender of the email is the sender of the site’s mail or an address from “other allowed senders”; the gateway replaces any
        other address with its own and keeps the name. The limit is requests per minute from one address (15 by default). The gateway
        path covers a page with the same address. A <code>GET</code> on the gateway path shows whether it is ready, <code>?probe=1</code>
        also whether the mail server can be reached. Each request is a line in the server output and in “Recent requests”: the token
        label, how many recipients and the outcome, without addresses or subjects.
      </p>
    </section>
    <section id="admin-elements" data-topic hidden={!shown('admin-elements')}>
      <h3>Elements</h3>
      <dl>
        <dt>Templates</dt>
        <dd>Decide how a page looks. Above a template’s code you can see which fields are assigned to it and how many pages use it.</dd>
        <dt>Components</dt>
        <dd>Pieces of the design that editors insert into text as blocks. A component’s description and parameters become a form in the editor.</dd>
        <dt>Scripts</dt>
        <dd>JavaScript for the browser as ES modules: a Three.js scene, a widget, a counter. A template includes a script with <code>script('name')</code>; the address changes with every edit, so browsers always get the fresh version.</dd>
        <dt>Plugins</dt>
        <dd>Change how the site behaves — redirects, for example. A button turns them on and off instantly.</dd>
        <dt>Page fields</dt>
        <dd>Custom fields for templates: text, rich text, number, yes/no, date, choice from a list, image; with a default value and inheritance from sections above.</dd>
      </dl>
      <p>If the code has an error, the manager won’t save it and shows the line — “Line N” takes you there. An element that’s used somewhere can’t be deleted: the manager shows where.</p>
    </section>
    <section id="admin-code" data-topic hidden={!shown('admin-code')}>
      <h3>Where code runs</h3>
      <p>The code of templates, components and plugins runs on the server: visitors get finished HTML. Only the code of islands and site scripts runs in the browser.</p>
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
          A component that runs in the browser: <code>{'<Island name="…"\u00a0/>'}</code> from <code>$core/Island</code>. It has
          no <code>$core</code> and gets server data through its parameters, which visitors can see: don’t pass secrets in them.
          An island can also sit inside a component placed with <code>Uncached</code>: its parameters are then worked out on every
          request — say, a price for the partner code in a cookie — while the page around it stays cached.
        </dd>
        <dt>Script</dt>
        <dd>
          When the browser needs JavaScript of its own rather than a component: a Three.js scene, a widget, analytics. A script
          is an ES module of up to 2 MB under Elements. A template includes it in <code>{'<svelte:head>'}</code> with a
          <code>script</code> tag whose address is <code>script('name')</code>. A script can import only <code>https://</code>
          addresses: bundle libraries into the same file beforehand.
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
        <strong>Backups off the server</strong> are set up there too: the S3 storage address (DigitalOcean Spaces, Backblaze B2,
        Hetzner, MinIO, AWS), the bucket and the access key. Every backup is encrypted on the server and sent to the storage, which keeps
        the latest ones. When you first turn it on, the manager shows a <strong>recovery key</strong> once: save it. It opens a backup
        from storage on a new server (<code>cms restore --remote latest</code>) when this one is gone. A backup sealed with this
        server’s key can also be restored under “Backups”.
      </p>
      <p>
        The mail password or API key, the Telegram bot, the mail gateway, the storage and the AI key belong to the server, not the site: they are
        not in a backup. A passphrase-protected settings file moves them to a new server: <code>cms backup --server</code> here and
        <code>cms restore --server</code> there. “Database file” on the same tab shows how much of the database is free and compacts it.
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
        <li><code>cms restore file</code> — restore the site from a backup, <code>cms restore --remote latest</code> — from S3 storage;</li>
        <li><code>cms backup --server</code> and <code>cms restore --server file</code> — move the server settings to a new machine;</li>
        <li><code>cms compact</code> — compact the database and give its free pages back to the disk;</li>
        <li><code>cms update</code> — update the program to a new version, <code>--check</code> — only check for one;</li>
        <li><code>cms elements pull folder</code> — templates, components, scripts, plugins, forms and fields as files, with an AGENTS.md guide for AI agents; <code>cms elements push folder</code> — back to the site;</li>
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
