import {
  aside,
  type Chapter,
  c,
  code,
  h2,
  kbd,
  list,
  p,
  shot,
  steps,
  ui,
} from '../markup.ts';

const BASE_1 = `<script>
  import Content from '$core/Content';

  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

<header class="top">
  <a class="logo" href="/">{site.name}</a>
</header>

<main>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</main>

<footer class="bottom">
  <p>{site.name} · kitchens made to order</p>
</footer>

<style>
  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  .top,
  main,
  .bottom {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .logo {
    color: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
  }

  h1 {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .bottom {
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const firstTemplate: Chapter = {
  alias: 'first-template',
  title: 'Your first template',
  lead: 'A template decides how a page looks. We’ll go through the Minimal template line by line and write our own, with a header, a title and the studio’s calm colors.',
  description:
    'What a template is in Eile, Svelte basics for beginners and your first template of your own.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'understand what a template is and where it gets its data;',
        'learn three Svelte techniques: expressions, conditions and lists;',
        'write the Base template and switch all pages to it;',
        'make a mistake on purpose and see what happens.'
      )
    ),
    h2('what-is', 'What a template is'),
    p(
      'In the manager, a page is data: a title, an address, text. A template is the frame that data goes into. It decides where the title sits, what color it is, what goes in the header and what goes in the footer. You can put one frame on as many pages as you like.',
      'Eile templates are written in Svelte. Svelte is ordinary HTML where you can insert data in curly braces. You don’t need to study it separately: we’ll cover everything you need as we go.'
    ),
    h2('minimal', 'The Minimal template'),
    p(
      'Above the page tree on the left there is an ' +
        ui('Elements') +
        ' tab. Open it: it lists templates, components, plugins and page fields. Click the <code>Minimal</code> template.'
    ),
    code(
      'svelte',
      `<script>
  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

{@html page.content}`,
      { file: 'The Minimal template' }
    ),
    p('Let’s take it apart.'),
    list(
      c('<script>…</script>') +
        ': the service part, where data is prepared. The line ' +
        c('let { page, site } = $props();') +
        ' says “the template receives the page <code>page</code> and the site <code>site</code>”. Every template has it.',
      c('<svelte:head>') +
        ': what goes into the document head. The ' +
        c('<title>') +
        ' tag sets the text on the browser tab.',
      c('{page.title}') +
        ': curly braces mean “insert the value here”. ' +
        c('page.title') +
        ' is the page title, ' +
        c('site.name') +
        ' is the site name.',
      c('page.longTitle || page.title') +
        ': “the long title, and if there isn’t one, the regular title”. Read the two bars ' +
        c('||') +
        ' as “or”.',
      `${c('{@html page.content}')}: the page text you write in the manager.`
    ),
    h2('svelte', 'Three Svelte techniques'),
    p(
      'Everything we need in this cookbook rests on three techniques. You’ve already seen the first one: an expression in curly braces.'
    ),
    code('svelte', `<p>The site is called {site.name}</p>`),
    p('The second shows a piece only if a condition holds.'),
    code(
      'svelte',
      `{#if page.introText}
  <p class="intro">{page.introText}</p>
{/if}`
    ),
    p(
      'The summary appears only if you filled it in. No empty paragraph will show up on the page.'
    ),
    p('The third repeats a piece for every item in a list.'),
    code(
      'svelte',
      `<ul>
  {#each ['espresso', 'cappuccino', 'filter coffee'] as drink}
    <li>{drink}</li>
  {/each}
</ul>`
    ),
    p(
      'You get a list of three items. Inside the ' +
        c('{#each}') +
        ' block, the word <code>drink</code> takes each value in turn.'
    ),
    h2('base', 'Your own Base template'),
    steps(
      'On the ' +
        ui('Elements') +
        ' tab, click <b>+</b> next to the word “Templates”.',
      'Type the name <code>Base</code>. Element names use Latin letters and start with a capital letter.',
      'Click ' +
        ui('Create') +
        '. An editor opens with a starter template: delete it and paste the code below.',
      'Save with ' + ui('Save') + ' or ' + kbd('Ctrl', 'S') + '.'
    ),
    code('svelte', BASE_1, {
      file: 'The Base template',
      save: 'template:Base',
    }),
    p('Here’s what is new compared to Minimal:'),
    list(
      c("import Content from '$core/Content';") +
        ': brings in the built-in Content component. It outputs the page text and turns links to other pages, inserted components and forms into ready HTML. That’s why from now on we write ' +
        c('<Content of={page} />') +
        ' instead of ' +
        c('{@html page.content}') +
        '.',
      c('<header>') +
        ', ' +
        c('<main>') +
        ', ' +
        c('<footer>') +
        ': the header, the main part and the footer. These are ordinary HTML tags.',
      c('<style>') +
        ': styles, meaning colors, fonts and spacing. A template’s styles apply only to its own markup. ' +
        c(':global(body)') +
        ' is there to set the background for the whole page.'
    ),
    h2('assign', 'Put the template on the pages'),
    p(
      'The template exists, but the pages still use Minimal. Let’s switch them. The fastest way is the overview: open ' +
        ui('Pages') +
        ' in the header and pick Base in the template column for each page. The value is saved as soon as you leave the cell.'
    ),
    p(
      'The other way is to open a page, choose the template in the ' +
        ui('Place on the site') +
        ' block on the right, then save.'
    ),
    shot('en-base', 'The studio’s home page on the Base template'),
    p(
      'A new page gets its parent’s template, or at the top level, its neighbors’ template. Since all pages now use Base, new ones will too.'
    ),
    h2('error', 'A mistake in a template'),
    p(
      'Let’s make a mistake on purpose, so it won’t scare you later. In the Base template, delete one closing curly brace, for example in ' +
        c('{site.name}') +
        ', and save.'
    ),
    p(
      'The manager won’t save the template and will show the line with the error. Meanwhile the site keeps running on the previous version, and visitors won’t notice a thing. Put the brace back and save again.'
    ),
    aside(
      'tip',
      'This is an Eile rule',
      p(
        'A template that doesn’t compile never reaches the site. So you can experiment freely: the worst that can happen is an error message in the manager.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'all pages use the Base template;',
        'the site has a header with the name “FACADE” and a warm gray background;',
        'you’ve seen the error message and know the site didn’t break.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.code();
    ['Home', 'About', 'Catalog', 'Contact'].forEach(
      (title) => void _.edit(title, { template: 'Base' })
    );
  },
  expect: [
    ['/', 'class="logo'],
    ['/about', '<h1'],
  ],
};

const NAV = `<!-- @component
Site menu: top-level pages.
-->
<script>
  import { children, current, link } from '$core';

  const here = current();
  const items = children(null);
</script>

<nav class="nav">
  {#each items as item (item.id)}
    <a
      href={link(item.id)}
      aria-current={here?.id === item.id ? 'page' : undefined}
    >
      {item.menuTitle || item.title}
    </a>
  {/each}
</nav>

<style>
  .nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
  }

  .nav a {
    color: inherit;
    text-decoration: none;
  }

  .nav a[aria-current] {
    font-weight: 700;
  }
</style>`;

const HEADER = `<!-- @component
Header: site name and menu.
-->
<script>
  import Nav from '$components/Nav';
  import { site } from '$core';
</script>

<header class="header">
  <a class="logo" href="/">{site().name}</a>
  <Nav />
</header>

<style>
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .logo {
    color: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
  }
</style>`;

const FOOTER_1 = `<!-- @component
Footer: name, a line about the studio and the year.
-->
<script>
  import { site } from '$core';

  let {
    /** Line next to the name */
    note = 'kitchens made to order',
  } = $props();

  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <p><b>{site().name}</b> · {note}</p>
  <p>© {year}</p>
</footer>

<style>
  .footer {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const BASE_2 = `<script>
  import Content from '$core/Content';
  import Footer from '$components/Footer';
  import Header from '$components/Header';

  let { page, site } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site.name}</title>
</svelte:head>

<Header />

<main>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</main>

<Footer note="kitchens made to your measurements" />

<style>
  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
  }

  h1 {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
</style>`;

const components: Chapter = {
  alias: 'components',
  title: 'Components: header, menu and footer',
  menuTitle: 'Components',
  lead: 'It’s handy to keep the header and the footer as separate pieces that you can plug into any template. These pieces are called components. We’ll make three: a menu, a header and a footer.',
  description:
    'Components in Eile: how to move the header, menu and footer out of a template, pass them parameters and get data from $core.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'learn how a component differs from a template;',
        'make a menu that builds itself from the tree;',
        'move the header and footer into components;',
        'pass a parameter to a component.'
      )
    ),
    h2('why', 'Why components'),
    p(
      'Soon the site will have other templates: for kitchens, for the catalog, for projects. Every one of them needs the header and footer. If you copy them into each template, then changing the phone number in the footer means editing five places without missing one.',
      'A component solves this. You write the header once and plug it in with one line. Change the component, and every template gets the new header.'
    ),
    h2('nav', 'A menu from the tree'),
    p(
      'Let’s start with the menu. It should show the top-level pages and update itself when you add a page. Create a component: on the ' +
        ui('Elements') +
        ' tab, click <b>+</b> next to the word “Components” and type the name <code>Nav</code>.'
    ),
    code('svelte', NAV, { file: 'The Nav component', save: 'component:Nav' }),
    p('Here’s what happens in it:'),
    list(
      c('<!-- @component … -->') +
        ': the component’s description. The manager shows it next to the name, and a month from now it will remind you what the component is for.',
      c("import { children, current, link } from '$core';") +
        ': takes three functions from <code>$core</code>. <code>$core</code> is the module that templates and components use to get the site’s data.',
      c('children(null)') +
        ': the top-level pages, in the order they stand in the tree. Pass a page id instead of <code>null</code> to get that page’s children.',
      c('link(item.id)') +
        ': the address of a page by its number. Rename the page, and the link changes by itself.',
      c('current()') +
        ': the page the visitor is looking at right now. We compare numbers to mark the current menu item, and it turns bold.',
      c('(item.id)') +
        ' after ' +
        c('as item') +
        ': the key of a list item. Svelte uses it to tell the items apart.'
    ),
    aside(
      'tip',
      'A menu from the kit',
      p(
        'Click the ' +
          ui('Elements') +
          ' icon in the header: an overview of elements opens on the right, with a ' +
          ui('Component kit') +
          ' tab. It has a Menu component with drop-down submenus and a menu button for phones. Our Nav is simpler, but you can see every line of it. Once you’re comfortable with it, try Menu.'
      )
    ),
    h2('header', 'The header'),
    p('Now a new component, <code>Header</code>:'),
    code('svelte', HEADER, {
      file: 'The Header component',
      save: 'component:Header',
    }),
    p(
      'A component plugs in another component the same way a template does: ' +
        c("import Nav from '$components/Nav';") +
        ' and then ' +
        c('<Nav />') +
        '. We get the site name with ' +
        c('site().name') +
        ': a component doesn’t receive <code>site</code> as a parameter, so it asks <code>$core</code> for it.'
    ),
    h2('footer', 'A footer with a parameter'),
    p(
      'The footer will have a parameter: the line next to the name. This way one component can look different in different templates.'
    ),
    code('svelte', FOOTER_1, {
      file: 'The Footer component',
      save: 'component:Footer',
    }),
    p(
      'A component receives parameters through ' +
        c('$props()') +
        ', the same way a template receives <code>page</code>. The value after the <code>=</code> sign is the default: if nobody passes the parameter, the footer says “kitchens made to order”. The manager shows the ' +
        c('/** … */') +
        ' comment above the parameter as a hint.'
    ),
    h2('assemble', 'Build the template from components'),
    p('Now the Base template gets shorter. Replace all of its code:'),
    code('svelte', BASE_2, {
      file: 'The Base template',
      save: 'template:Base',
    }),
    p(
      'We passed our own line to the footer: ' +
        c('<Footer note="kitchens made to your measurements" />') +
        '. You write parameters like tag attributes.'
    ),
    shot(
      'en-components',
      'The header with the menu and the footer on the studio site'
    ),
    aside(
      'trouble',
      'The manager says the component doesn’t exist',
      p(
        'Check the name: in ' +
          c("'$components/Header'") +
          ' it must match the name in ' +
          ui('Elements') +
          ' letter for letter, starting with a capital. Also save the components before the template that plugs them in.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'the site header shows the name and a menu of four pages;',
        'the current page’s menu item stands out;',
        'the footer shows “kitchens made to your measurements” and the current year.'
      )
    ),
  ].join('\n'),
  expect: [
    ['/', 'kitchens made to your measurements'],
    ['/catalog', 'aria-current="page"'],
  ],
};

const LAYOUT = `<!-- @component
Site frame: tab title, header, footer and shared styles. The template puts its own part inside.
-->
<script>
  import Footer from '$components/Footer';
  import Header from '$components/Header';
  import { site } from '$core';

  let { page, children } = $props();
</script>

<svelte:head>
  <title>{page.longTitle || page.title} — {site().name}</title>
</svelte:head>

<Header />

<main>
  {@render children()}
</main>

<Footer note="kitchens made to your measurements" />

<style>
  :global(body) {
    margin: 0;
    background: #f1efeb;
    color: #1f1e1c;
    font: 18px/1.6 system-ui, sans-serif;
  }

  :global(h1) {
    font-size: 2.75rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  :global(img) {
    max-width: 100%;
    height: auto;
  }

  main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0 1.5rem 2rem;
  }
</style>`;

const BASE_3 = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';

  let { page } = $props();
</script>

<Layout {page}>
  <h1>{page.longTitle || page.title}</h1>
  <Content of={page} />
</Layout>`;

const layout: Chapter = {
  alias: 'layout',
  title: 'The frame: one layout for every template',
  menuTitle: 'Site frame',
  lead: 'Soon there will be several templates. So that each one doesn’t repeat the header, footer and styles, we’ll gather them into a frame, and templates will put only their own part inside it.',
  description:
    'The Layout frame component in Eile: a shared site layout and nested content through children.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'make a Layout component shared by all templates;',
        'learn how a component accepts nested markup;',
        'cut Base down to a few lines.'
      )
    ),
    h2('problem', 'What repeats'),
    p(
      'Look at Base. It has the tab title, the header, the footer and the page styles. The kitchen template and the projects template will need all of that too. Only the middle differs: a kitchen has a photo and a price, and projects have a list of work.',
      'So we’ll move everything they share into a frame component. The frame draws the header and footer, and in the middle it puts whatever the template passed to it.'
    ),
    h2('layout', 'The Layout component'),
    p('Create a component named <code>Layout</code>:'),
    code('svelte', LAYOUT, {
      file: 'The Layout component',
      save: 'component:Layout',
    }),
    p('Two things matter here.'),
    list(
      c('let { page, children } = $props();') +
        ': the frame receives the page (for the tab title) and <code>children</code>, which is everything the template puts between the frame’s opening and closing tags.',
      c('{@render children()}') +
        ': “draw here what was passed inside”. This is exactly where the middle of each template ends up.'
    ),
    p(
      'The styles for headings and images sit inside ' +
        c(':global(…)') +
        ', so they apply to the whole page. Without it, the frame’s styles would only affect its own markup.'
    ),
    h2('base', 'Base inside the frame'),
    p('Replace the code of Base:'),
    code('svelte', BASE_3, {
      file: 'The Base template',
      save: 'template:Base',
    }),
    p(
      'Eight lines instead of fifty. ' +
        c('<Layout {page}>') +
        ' is short for ' +
        c('<Layout page={page}>') +
        ': when the parameter has the same name as the value, you don’t have to repeat it.'
    ),
    p(
      'The site looks exactly as it did at the end of the last chapter. That’s intended: we only changed how the site is built. In return, the next template will take a couple of minutes.'
    ),
    aside(
      'tip',
      'How the ready-made sites are built',
      p(
        'Eile’s scaffolds (<code>cms new blog</code>, <code>cms new company</code> and others) are built exactly the same way: a Layout component with short templates inside it. If you want to look at a large example, set up a scaffold in a separate folder and open its ' +
          ui('Elements') +
          '.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'the site looks the same as before;',
        'Base has no header, footer or styles;',
        'you can explain what ' + c('{@render children()}') + ' does.'
      )
    ),
  ].join('\n'),
  expect: [
    ['/', 'kitchens made to your measurements'],
    ['/contact', '<h1'],
  ],
};

export var TEMPLATES: readonly Chapter[] = [firstTemplate, components, layout];
