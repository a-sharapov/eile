import { VERSION } from '../../../src/cli/version.ts';
import {
  aside,
  type Chapter,
  code,
  h2,
  kbd,
  list,
  p,
  shot,
  steps,
  ui,
} from '../markup.ts';

const intro: Chapter = {
  alias: 'before-you-start',
  title: 'What we’ll build and what you need',
  menuTitle: 'Before you start',
  lead: 'Over thirteen chapters we’ll build a website for Facade, a kitchen studio. It will have a kitchen catalog with prices, finished projects, a form for booking a measuring visit and its own address on the internet. You don’t need any programming experience: every step is shown and explained.',
  description:
    'The introduction to the Eile cookbook: the site we’ll build, what to install beforehand and how to read the chapters.',
  content: [
    h2('site', 'The site we’ll build'),
    p(
      'Facade makes kitchens to order, and it needs a website that shows people they can trust the studio with their kitchen. The site will have a home page, a page about the studio, a kitchen catalog with prices per meter, finished projects, contact details and a form where visitors book a measuring visit. The header will show on its own whether the showroom is open right now.',
      'It will be a real site, with an address like <code>facade.example</code> (you’ll use your own domain), a secure HTTPS connection and backups. We’ll set all of this up ourselves, one step at a time.'
    ),
    shot(
      'en-site-home',
      'The studio’s home page as it will look by the end of the cookbook'
    ),
    h2('who', 'Who this cookbook is for'),
    p(
      'Beginners. Maybe you wrote some HTML in a computer class at school, maybe you never have. Either way is fine.',
      'We’ll write a little code: page templates in a language called Svelte. You can copy every example whole, and under each one we go through what every line does. If you already know HTML, CSS and a bit of JavaScript, you’ll get through the chapters faster.'
    ),
    h2('you-need', 'What you need'),
    list(
      '<b>A computer with Linux or macOS.</b> On Windows, install <a href="https://learn.microsoft.com/windows/wsl/install">WSL</a>: it is Linux inside Windows, and everything in the cookbook works there.',
      '<b>A terminal.</b> This is the window where you type commands. On macOS it is called Terminal and lives in Applications → Utilities. On Ubuntu, press ' +
        kbd('Ctrl', 'Alt', 'T') +
        ' to open it.',
      '<b>A browser.</b> Any modern one: you’ll use it both to view the site and to edit it.',
      '<b>About an hour for the first four chapters.</b> After that, go at your own pace.'
    ),
    p(
      'You don’t need to install PHP, MySQL, Node.js or Docker. Eile comes as a single file, and the whole site lives in one database file. We’ll see what that means in practice in chapter two.'
    ),
    h2('how-to-read', 'How to read the chapters'),
    p(
      'The chapters go in order, and each one builds on the one before. It’s best not to skip any, but you can go back to earlier ones as often as you like.'
    ),
    p('Terminal commands look like this:'),
    code('sh', '$ cms version'),
    p(
      'Don’t type the <code>$</code> at the start of the line: it only marks the start of a command. Lines without it show what the computer answers.'
    ),
    p(
      'Template code has a label on top, so you can see which element of the site it goes into.'
    ),
    code('svelte', `<h1>{page.title}</h1>`, {
      file: 'Example: the Base template',
    }),
    p(
      'Names of manager buttons and sections are highlighted like this: ' +
        ui('Save') +
        '. That makes them easy to spot on the screen.'
    ),
    aside(
      'tip',
      'Tip',
      p(
        'Keep the site and the cookbook open side by side, in two browser windows. Take a step, look at the result, move on.'
      )
    ),
    aside(
      'trouble',
      'If something doesn’t work',
      p(
        'Many chapters end with a section on common mistakes. If your answer isn’t there, write to us on <a href="https://github.com/a-sharapov/eile/issues">GitHub</a>: describe what you did and what you saw. Eile is still in alpha, and reports like these help us improve it.'
      )
    ),
  ].join('\n'),
};

const install: Chapter = {
  alias: 'install',
  title: 'Installing and the first run',
  menuTitle: 'Install',
  lead: 'We’ll install Eile with one command, start an empty site and sign in to the manager. It takes about ten minutes.',
  description:
    'How to install Eile on Linux or macOS, start a site and create the first administrator.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'install the <code>cms</code> program;',
        'start the site on your computer;',
        'create an administrator and sign in to the manager.'
      )
    ),
    h2('install-program', 'Install the program'),
    p(
      'Open a terminal, paste this whole command and press ' +
        kbd('Enter') +
        ':'
    ),
    code(
      'sh',
      '$ curl -fsSL https://github.com/a-sharapov/eile/releases/latest/download/install.sh | bash'
    ),
    p(
      'The command downloads the installer and runs it. The installer works out which system you have, downloads the matching build of Eile, checks its checksum (this confirms the file arrived whole and nobody swapped it) and puts the <code>cms</code> program where the terminal can find it.'
    ),
    p('Let’s check that everything is in place:'),
    code('sh', `$ cms version\nEile ${VERSION}`),
    p('Your version number may be newer. That’s fine.'),
    aside(
      'trouble',
      'The terminal says “command not found”',
      p(
        'The installer added the program’s location to the terminal settings, but the open window doesn’t know about it yet. Close the terminal, open a new one and run <code>cms version</code> again.'
      )
    ),
    h2('folder', 'A folder for the site'),
    p(
      'The site needs its own folder. Let’s create it and go into it. The <code>mkdir</code> command creates a folder, and <code>cd</code> moves into it:'
    ),
    code('sh', '$ mkdir facade\n$ cd facade'),
    p(
      'Run all the following commands from this folder. If you close the terminal, type <code>cd facade</code> again in the new window.'
    ),
    h2('run', 'Start the site'),
    code('sh', '$ cms'),
    p('The terminal answers with something like this:'),
    code(
      'sh',
      `  ●─┬─●  Eile ${VERSION}
    ├─◐  site and manager in one file
    └─○  pages, templates, media

  Site       http://localhost:8080/
  Manager    http://localhost:8080/manager
  Database   site.db
  Pages      1 page · ● published 1

  ▸ New database: a welcome page and a blank template.
    Ready-made sites (blog, portfolio, shop): cms new

  ▸ No users yet. Create the administrator at:
    http://localhost:8080/manager/setup?token=…`
    ),
    p('Let’s go through what it says.'),
    list(
      '<b>Site</b>: the address where the site opens in a browser. <code>localhost</code> means “this computer”, and <code>8080</code> is the port: the number of the door the program uses to let visitors in.',
      '<b>Manager</b>: the admin area where you’ll run the site.',
      '<b>Database</b>: the <code>site.db</code> file in your folder. It holds the whole site: pages, templates, images and users. Copy this file, and you have a copy of the entire site.',
      '<b>The administrator link</b>: you use it to create the first user. It works once.'
    ),
    p(
      'The site is available while the terminal window is open and the program is running. To stop it, press ' +
        kbd('Ctrl', 'C') +
        ' in the terminal. To start it again, type <code>cms</code> in the same folder.'
    ),
    h2('welcome', 'Look at the site'),
    p(
      'Open <a href="http://localhost:8080">http://localhost:8080</a> in your browser. You’ll see a page called “Welcome”. It is rendered by the Minimal template, which holds nothing except the page text. Every new Eile site starts like this.'
    ),
    h2('administrator', 'Create an administrator'),
    p(
      'Copy the long link from the terminal that starts with <code>http://localhost:8080/manager/setup</code> and open it in your browser. The ' +
        ui('First administrator') +
        ' form appears.'
    ),
    shot('en-setup', 'The form for creating the first administrator'),
    steps(
      'Enter a name: other manager users will see it.',
      'Enter your email. It becomes your login.',
      'Choose a password of at least 10 characters and write it down somewhere safe.',
      `Click ${ui('Create and sign in')}.`
    ),
    p(
      'Done, you’re in the manager. Next time, open it at <a href="http://localhost:8080/manager">http://localhost:8080/manager</a> and sign in with your email and password.'
    ),
    aside(
      'trouble',
      'The link says it was already used or is invalid',
      p(
        'The link works only once, and it changes every time you start the program until an administrator exists. Take a fresh one from the terminal. If the administrator has already been created, sign in the usual way at <code>/manager</code>.'
      )
    ),
    h2('look-around', 'Look around the manager'),
    shot(
      'en-manager',
      'The manager: page tree on the left, site overview on the right'
    ),
    list(
      '<b>The header</b> at the top holds the section icons. Hover over an icon to see its name: ' +
        ui('Pages') +
        ', ' +
        ui('Elements') +
        ', ' +
        ui('Forms') +
        ', ' +
        ui('Media') +
        ', ' +
        ui('Settings') +
        ' and others. On the right, the button with your initial opens the account menu.',
      '<b>The page tree</b> on the left: the whole site and how its pages nest. The number to the right of a page name is the page’s number, its id.',
      '<b>The canvas</b> on the right: whatever you have open. Right after you sign in, it shows an overview of all pages as a table.'
    ),
    p(
      'The question mark icon opens ' +
        ui('Help') +
        ': it briefly describes everything the manager can do. Take a look when you have a minute.'
    ),
    h2('name', 'Give the site a name'),
    p(
      'Right now the site is called Eile. Open ' +
        ui('Settings') +
        ' (the gear icon), type “Facade” in the name field on the ' +
        ui('Site') +
        ' tab, and save. The name appears in the browser tab title, and later in the site header too.'
    ),
    aside(
      'check',
      'Check yourself',
      list(
        '<code>cms version</code> answers with a version number;',
        'the site opens at <code>localhost:8080</code>;',
        'you’re signed in to the manager with your email.'
      )
    ),
  ].join('\n'),
  replay: (_) => _.rename('Facade'),
  expect: [['/', 'Welcome']],
};

const pages: Chapter = {
  alias: 'pages',
  title: 'Pages and the site tree',
  menuTitle: 'Pages',
  lead: 'An Eile site grows like a tree: every page has a place, an address and a number. Let’s create the studio’s pages and publish them.',
  description:
    'How to create, publish and arrange pages in Eile: the site tree, addresses, drafts and the menu.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'see how the page tree works;',
        'turn the welcome page into the studio’s home page;',
        'create the About, Catalog and Contact pages;',
        'learn about addresses, drafts and publishing.'
      )
    ),
    h2('tree', 'How the tree works'),
    p(
      'A site is laid out like the table of contents of a book, with sections inside chapters and subsections inside sections. There are top-level pages, and they can hold pages of their own. For example, the kitchen pages will live inside Catalog.',
      'A page inside another page is called a child page, and the page that holds it is its parent. The address depends on the place in the tree: the Olive kitchen inside Catalog will open at <code>/catalog/olive</code>.'
    ),
    p(
      'Every page has a number, the id. It never changes, even if you rename or move the page. Templates and links use this number to find the page.'
    ),
    h2('home', 'The home page'),
    p(
      'The tree has one page so far, “Welcome”. It is the home page: the site shows it at the address <code>/</code>. Let’s turn it into the studio’s home page.'
    ),
    steps(
      'Click “Welcome” in the tree. The page editor opens on the right.',
      `In the ${ui('Title')} field, type “Home”.`,
      'Delete the page text and write your own, for example: “We build kitchens to order, made to your measurements. We come out to measure, draw up a design and assemble the kitchen ourselves.”',
      'Click ' +
        ui('Save') +
        ' or press ' +
        kbd('Ctrl', 'S') +
        ' (' +
        kbd('⌘', 'S') +
        ' on a Mac).'
    ),
    p(
      'Refresh the tab with the site. The text has changed. The Minimal template is very plain, so for now the page looks like an ordinary document. We’ll make it look good in the next chapter.',
      'The home page address is still <code>welcome</code>. You don’t need to change it: the home page always opens at <code>/</code>, and which page is the home page is set in ' +
        ui('Settings') +
        '.'
    ),
    h2('new-page', 'A new page'),
    p('Let’s create a page about the studio.'),
    steps(
      'Click ' +
        ui('New page') +
        ' on the overview, or the sheet-with-a-plus icon above the tree.',
      'Type the title: “About”. Look at the ' +
        ui('Address') +
        ' field: it has filled itself in with <code>about</code>.',
      'Write a couple of paragraphs about the studio. Press ' +
        kbd('Enter') +
        ' to end a paragraph.',
      `Click ${ui('Save')}.`
    ),
    p(
      'The page is saved, but it isn’t on the site yet: it’s a draft. Draft titles in the tree are in italics. Open <code>localhost:8080/about</code>, and the site will tell you there is no such page.'
    ),
    p(
      'Click ' +
        ui('Publish') +
        ' in the bar above the page. Now the address opens.'
    ),
    aside(
      'tip',
      'Why drafts are useful',
      p(
        'While a page is a draft, you can take your time finishing it: visitors won’t see half-written text. To see how it will look, use the eye button in the page bar: that’s the preview.'
      )
    ),
    h2('address', 'The page address'),
    p(
      'The address is built from the title until you change it by hand. It can contain only the letters a to z, digits and hyphens. A short address is easier to read out over the phone: a title like “Our work and what clients say about the studio” is better shortened by hand to <code>work</code>.'
    ),
    p(
      'If you change the address of a page that is already published, the old address keeps leading to it. Links you’ve already sent to someone won’t break.'
    ),
    h2('other-pages', 'The other pages'),
    p('Create and publish two more pages the same way:'),
    list(
      '“Catalog” with the text “The kitchens we make most often. We’ll adapt any of them to your measurements and color.” The address fills itself in: <code>catalog</code>;',
      '“Contact” with the address <code>contact</code>. Any text will do for now: we’ll add the studio’s address and phone number in chapter nine.'
    ),
    p(
      'Pages appear in the tree in the order you created them. Later, the same order becomes the order of the site menu. Drag “Contact” with the mouse if you want to put it somewhere else.'
    ),
    shot('en-tree', 'The studio’s tree: Home, About, Catalog and Contact'),
    h2('trash', 'If you no longer need a page'),
    p(
      'The page menu (right-click a row in the tree, or use the three-dots button) has a ' +
        ui('Move to trash') +
        ' item. The page disappears from the site together with all pages inside it, and you can restore it from the trash at the bottom of the tree. Only ' +
        ui('Empty trash') +
        ' deletes pages for good.'
    ),
    aside(
      'trouble',
      'The page isn’t on the site',
      list(
        'Is it published? A draft’s title in the tree is in italics.',
        'Does the address match what you type? You can see it in the ' +
          ui('Address') +
          ' field.',
        'Is the section it lives in sitting in the trash?'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'the site’s home page shows your text about the studio;',
        'the addresses <code>/about</code>, <code>/catalog</code> and <code>/contact</code> open;',
        'you know where to find a page’s number in the tree.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.edit('Welcome', {
      title: 'Home',
      content:
        '<p>We build kitchens to order, made to your measurements. We come out to measure, draw up a design and assemble the kitchen ourselves.</p>',
    });
    _.page({
      title: 'About',
      alias: 'about',
      content:
        '<p>Facade has been making kitchens to order since 2014. Our showroom on Mill Lane has five kitchens on display: you can touch them, open the drawers and compare the cabinet doors.</p><p>We do the measuring, design, manufacturing and installation ourselves, with no subcontractors. Every kitchen comes with a five-year warranty.</p>',
    });
    _.page({
      title: 'Catalog',
      alias: 'catalog',
      content:
        '<p>The kitchens we make most often. We’ll adapt any of them to your measurements and color.</p>',
    });
    _.page({
      title: 'Contact',
      alias: 'contact',
      content: '<p>The address and phone number will appear here soon.</p>',
    });
  },
  expect: [
    ['/', 'made to your measurements'],
    ['/about', 'five kitchens'],
    ['/catalog', 'adapt any of them'],
  ],
};

export var START: readonly Chapter[] = [intro, install, pages];
