import {
  aside,
  type Chapter,
  c,
  code,
  h2,
  list,
  p,
  shot,
  steps,
  ui,
} from '../markup.ts';

const KITCHEN_1 = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';
  import { image } from '$core';

  let { page } = $props();

  const price = page.fields.price;
  const plan = page.fields.plan;
  const photo = page.fields.photo ? image(page.fields.photo) : null;
  const eur = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
</script>

<Layout {page}>
  {#if photo}
    <img
      class="photo"
      src={photo.src}
      srcset={photo.srcset}
      sizes="(min-width: 48rem) 45rem, 100vw"
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
    />
  {/if}

  <h1>{page.title}</h1>

  <dl class="facts">
    {#if plan}
      <div><dt>Shape</dt><dd>{plan}</dd></div>
    {/if}
    {#if price}
      <div><dt>Price</dt><dd>from {eur.format(price)} per meter</dd></div>
    {/if}
  </dl>

  <Content of={page} />
</Layout>

<style>
  .photo {
    display: block;
    border-radius: 1.25rem;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 2.5rem;
    margin: 0;
  }

  dt {
    color: #6b6862;
    font-size: 0.875rem;
  }

  dd {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 650;
  }
</style>`;

const _KITCHENS = [
  {
    title: 'Olive',
    price: 1200,
    plan: 'Straight',
    photo: 'kitchens/olive.webp',
    alt: 'Straight kitchen with olive Shaker doors and a light countertop',
    text: 'Olive Shaker doors, a light oak-effect countertop and black bar handles. Works well on a wall three meters or longer.',
  },
  {
    title: 'Cashmere',
    price: 1450,
    plan: 'Straight',
    photo: 'kitchens/cashmere.webp',
    alt: 'Floor-to-ceiling cashmere kitchen with brass handles and a marble-effect backsplash',
    text: 'Smooth cashmere-colored doors all the way up to the ceiling, brass handles and a marble-effect backsplash. Lighting under the wall cabinets is included in the price.',
  },
  {
    title: 'Sage',
    price: 1650,
    plan: 'L-shaped',
    photo: 'kitchens/sage.webp',
    alt: 'L-shaped kitchen with matte sage doors and oak shelves',
    text: 'An L-shaped kitchen with matte sage-colored doors and oak shelves. The oven sits in a tall cabinet at eye level.',
  },
] as const;

const fields: Chapter = {
  alias: 'fields',
  title: 'Fields: price, shape and photo of a kitchen',
  menuTitle: 'Page fields',
  lead: 'A kitchen has a price per meter, a shape and a photo. Writing them into the text is awkward: you can’t sort by price or change it in one place. For data like this, pages have fields.',
  description:
    'Custom page fields in Eile: create a field, assign it to a template, fill it in and show it in the template; choices from a list and images from the media library.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'make a Kitchen template for kitchen pages;',
        'add the fields “Price per meter”, “Shape” and “Photo”;',
        'upload photos to the media library;',
        'create three kitchens inside Catalog.'
      )
    ),
    h2('why', 'Why fields get their own place'),
    p(
      'You could write the price right into the text: “Olive, €1,200 per meter”. But then the template doesn’t know where in the text the price is. It can’t show the price in large type, list it in the catalog or work out the cost of a kitchen three meters long.',
      'A field holds one value of a particular kind: a number, a line of text, a date, an option from a list, an image. The template knows the field’s name and shows it where it’s needed.'
    ),
    h2('kitchen', 'The kitchen template'),
    p(
      'We start with the template, because a field is attached to templates. Create a template named <code>Kitchen</code>:'
    ),
    code('svelte', KITCHEN_1, {
      file: 'The Kitchen template',
      save: 'template:Kitchen',
    }),
    list(
      c('page.fields.price') +
        ': the value of the field named <code>price</code>. The same goes for <code>plan</code> and <code>photo</code>. If a field is empty, it holds <code>null</code>.',
      c("new Intl.NumberFormat('en', …)") +
        ': formats the number as a price in euros, with a comma between thousands: 1200 becomes “€1,200”.',
      c('image(page.fields.photo)') +
        ': given the path of an image in the media library, <code>image</code> returns everything the ' +
        c('<img>') +
        ' tag needs: the address, smaller copies for different screens, the size and the description.',
      c('srcset') +
        ' and ' +
        c('sizes') +
        ': a phone’s browser downloads a small copy of the image, and a big screen’s browser downloads a large one. The page loads faster.',
      c('<dl>') +
        ', ' +
        c('<dt>') +
        ', ' +
        c('<dd>') +
        ': a list of names and values. It suits specifications better than paragraphs do.'
    ),
    h2('add-fields', 'Add the fields'),
    p(
      'On the ' +
        ui('Elements') +
        ' tab, click <b>+</b> next to the words “Page fields”. Fill in the form for the price:'
    ),
    list(
      `${ui('Label')}: “Price per meter, €”. This is how the field is labeled in the page editor.`,
      ui('Name for the template') +
        ': <code>price</code>. Use Latin letters; this is the exact name in ' +
        c('page.fields.price') +
        '.',
      `${ui('Type')}: ${ui('Number')}.`,
      `${ui('Templates')}: check <code>Kitchen</code>.`
    ),
    p(
      'Click ' +
        ui('Save field') +
        '. Add two more fields the same way, also for the Kitchen template:'
    ),
    list(
      '“Shape”, name <code>plan</code>, type ' +
        ui('Choice from a list') +
        ', with the options separated by commas: “Straight, L-shaped, U-shaped”;',
      `“Photo”, name <code>photo</code>, type ${ui('Image')}.`
    ),
    shot('en-field', 'The editor for the “Price per meter, €” field'),
    aside(
      'tip',
      'If the field is empty',
      p(
        'The field form has an ' +
          ui('If the field is empty') +
          ' block. There you set a default value and inheritance: an empty field takes its value from the section above. For example, you can set a “Lead time” field once on Catalog, and every kitchen inherits it.'
      )
    ),
    h2('media', 'Photos in the media library'),
    p(
      'Open ' +
        ui('Media') +
        ' and drag the kitchen photos there. Shots from the showroom will do, or renderings from the program you design projects in. Name the folder <code>kitchens</code>: the upload bar has a folder field, and the manager remembers it.'
    ),
    p(
      'Click an uploaded image. In the file card, write a one-sentence description: “Straight kitchen with olive Shaker doors and a light countertop”. A blind visitor’s screen reader will read it out, and the Kitchen template puts it into ' +
        c('alt') +
        '.'
    ),
    p(
      'The server makes smaller copies at 480, 960 and 1920 pixels by itself, a second or two after the upload. These are the copies that go into ' +
        c('srcset') +
        '.'
    ),
    h2('kitchens', 'Kitchens inside Catalog'),
    p(
      'Hover over Catalog in the tree and click <b>+</b>: the new page goes straight inside it. Switch its template to Kitchen, or there won’t be a fields tab.'
    ),
    steps(
      'Title: “Olive”. The address fills itself in: <code>olive</code>.',
      `In the ${ui('Place on the site')} block, choose the <code>Kitchen</code> template.`,
      'Write a couple of sentences about the kitchen.',
      'Open the ' +
        ui('Fields') +
        ' tab: price 1200, shape “Straight”, and pick the photo from the media library.',
      'Save and publish.'
    ),
    p(
      'Create “Cashmere” (straight, €1,450 per meter) and “Sage” (L-shaped, €1,650 per meter) the same way. The second and third kitchens get the Kitchen template on their own, because a new page takes its neighbors’ template.'
    ),
    shot(
      'en-kitchen',
      'The Olive kitchen page: photo, shape and price from the fields'
    ),
    aside(
      'trouble',
      'There’s no “Fields” tab',
      p(
        'The tab appears when the page’s template has fields. Check that the page uses the Kitchen template and that Kitchen is checked in each field’s settings.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        '<code>/catalog/olive</code> shows the photo, shape and price;',
        'you changed the price in the field, and it changed on the site;',
        'the photos have descriptions.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.code();
    _.field({
      name: 'price',
      label: 'Price per meter, €',
      type: 'number',
      templates: ['Kitchen'],
    });
    _.field({
      name: 'plan',
      label: 'Shape',
      type: 'select',
      options: ['Straight', 'L-shaped', 'U-shaped'],
      templates: ['Kitchen'],
    });
    _.field({
      name: 'photo',
      label: 'Photo',
      type: 'image',
      templates: ['Kitchen'],
    });
    _KITCHENS.forEach((kitchen) => {
      _.upload(kitchen.photo, kitchen.alt);
      _.page({
        title: kitchen.title,
        parent: 'Catalog',
        template: 'Kitchen',
        content: `<p>${kitchen.text}</p>`,
        fields: {
          price: kitchen.price,
          plan: kitchen.plan,
          photo: kitchen.photo,
        },
      });
    });
  },
  expect: [
    ['/catalog/olive', 'from €1,200 per meter'],
    ['/catalog/olive', '>Straight</dd>'],
    ['/catalog/olive', 'kitchens/olive.webp'],
  ],
};

const CATALOG = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';
  import { children, image, link } from '$core';

  let { page } = $props();

  const kitchens = children(page.id);
  const eur = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
</script>

<Layout {page}>
  <h1>{page.title}</h1>
  <Content of={page} />

  <ul class="cards">
    {#each kitchens as kitchen (kitchen.id)}
      {@const photo = kitchen.fields.photo ? image(kitchen.fields.photo) : null}
      <li>
        <a href={link(kitchen.id)}>
          {#if photo}
            <img src={photo.src} width={photo.width} height={photo.height} alt="" />
          {/if}
          <span class="name">{kitchen.title}</span>
          <span class="meta">
            {kitchen.fields.plan} · from {eur.format(kitchen.fields.price)} per meter
          </span>
        </a>
      </li>
    {/each}
  </ul>
</Layout>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 1rem;
    padding: 0;
    list-style: none;
  }

  .cards a {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem 0.75rem 1rem;
    border-radius: 1.25rem;
    background: #fff;
    color: inherit;
    text-decoration: none;
  }

  .cards img {
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 0.9rem;
  }

  .name {
    font-weight: 700;
  }

  .meta {
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const PROJECTS = `<script>
  import Layout from '$components/Layout';
  import Pagination from '$components/Pagination';
  import { link, listing } from '$core';

  let { page } = $props();

  const projects = listing(page.id, { perPage: 5 });
  const date = new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC',
  });
</script>

<Layout {page}>
  <h1>{page.title}</h1>

  {#each projects.items as project (project.id)}
    <article class="project">
      <h2><a href={link(project.id)}>{project.title}</a></h2>
      <p class="date">{date.format(new Date(project.publishedAt))}</p>
      {#if project.introText}<p>{project.introText}</p>{/if}
    </article>
  {:else}
    <p>No projects yet.</p>
  {/each}

  <Pagination
    items={projects.pager()}
    prev={projects.url(projects.number - 1)}
    next={projects.url(projects.number + 1)}
    label="Pages"
    prevLabel="Previous"
    nextLabel="Next"
  />
</Layout>

<style>
  .project {
    padding: 1.25rem 0;
    border-bottom: 1px solid #e2dfd9;
  }

  .project h2 {
    margin: 0;
    font-size: 1.375rem;
  }

  .project a {
    color: inherit;
  }

  .date {
    margin: 0.25rem 0 0;
    color: #6b6862;
    font-size: 0.9rem;
  }
</style>`;

const HOME = `<script>
  import Content from '$core/Content';
  import Layout from '$components/Layout';
  import { children, image, link, listing } from '$core';

  let { page } = $props();

  // Sections are found by address, so the template needs no page numbers.
  const top = children(null);
  const catalog = top.find((_) => _.path === '/catalog');
  const projects = top.find((_) => _.path === '/projects');
  const contacts = top.find((_) => _.path === '/contact');

  const kitchens = catalog ? children(catalog.id).slice(0, 3) : [];
  const fresh = projects
    ? listing(projects.id, { perPage: 2, paged: false }).items
    : [];
  const cover = kitchens[0]?.fields.photo ? image(kitchens[0].fields.photo) : null;
  const eur = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
</script>

<Layout {page}>
  <section class="hero">
    <h1>{page.longTitle || page.title}</h1>
    <Content of={page} />
    <p class="actions">
      {#if catalog}<a class="button" href={link(catalog.id)}>Browse the catalog</a>{/if}
      {#if contacts}<a href={link(contacts.id)}>Book a measuring visit</a>{/if}
    </p>
    {#if cover}
      <img
        src={cover.src}
        srcset={cover.srcset}
        sizes="(min-width: 48rem) 45rem, 100vw"
        width={cover.width}
        height={cover.height}
        alt={cover.alt}
      />
    {/if}
  </section>

  {#if kitchens.length}
    <h2>From the catalog</h2>
    <ul class="kitchens">
      {#each kitchens as kitchen (kitchen.id)}
        <li>
          <a href={link(kitchen.id)}>{kitchen.title}</a>
          <span>from {eur.format(kitchen.fields.price)} per meter</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if fresh.length}
    <h2>Finished projects</h2>
    {#each fresh as project (project.id)}
      <p class="project"><a href={link(project.id)}>{project.title}</a></p>
    {/each}
  {/if}
</Layout>

<style>
  .hero img {
    margin-top: 1.5rem;
    border-radius: 1.5rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.25rem;
  }

  .button {
    padding: 0.8rem 1.4rem;
    border-radius: 999px;
    background: #1f1e1c;
    color: #fff;
    text-decoration: none;
  }

  .actions a:not(.button) {
    color: inherit;
  }

  .kitchens {
    display: grid;
    gap: 0.5rem;
    padding: 0;
    list-style: none;
  }

  .kitchens li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    padding: 0.9rem 1.1rem;
    border-radius: 1rem;
    background: #fff;
  }

  .kitchens span {
    color: #6b6862;
  }

  .kitchens a,
  .project a {
    color: inherit;
  }
</style>`;

const _PROJECTS = [
  {
    title: 'Kitchen in a high-ceilinged period apartment',
    intro:
      'High ceilings, cabinets all the way to the top and a built-in fridge in the alcove by the window.',
  },
  {
    title: 'Corner kitchen for a 28 m² studio apartment',
    intro:
      'We fitted in a dishwasher, an oven and a breakfast bar that also separates the kitchen from the living area.',
  },
  {
    title: 'Island kitchen in a country house',
    intro:
      'The island with the cooktop faces the living room, and the extractor hood is hidden in the ceiling.',
  },
] as const;

const lists: Chapter = {
  alias: 'lists',
  title: 'Lists: catalog, projects and the home page',
  menuTitle: 'Page lists',
  lead: 'Catalog will build the kitchen cards with prices on its own, Projects will show the studio’s work five to a page, and the home page will become the studio’s shop window, with kitchens and recent projects.',
  description:
    'Page lists in Eile: child pages with children(), a paged feed with listing() and the Pagination component from the kit.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'show the kitchens as cards on the Catalog page;',
        'add a Projects section with finished work;',
        'split the projects into pages and add a pager;',
        'build the home page from kitchens and projects.'
      )
    ),
    h2('catalog', 'Kitchen cards'),
    p(
      'The kitchens live inside Catalog. So the template of the Catalog page needs to take the page’s children and draw a card for each one. Create a template named <code>Catalog</code>:'
    ),
    code('svelte', CATALOG, {
      file: 'The Catalog template',
      save: 'template:Catalog',
    }),
    list(
      c('children(page.id)') +
        ': the children of the current page, in tree order. In chapter five we called ' +
        c('children(null)') +
        ' for the top level; this is the same function.',
      c('kitchen.fields.price') +
        ': every page in the list has its own fields, just like ' +
        c('page') +
        ' in the kitchen template.',
      c('{@const photo = …}') +
        ': creates a value right inside ' +
        c('{#each}') +
        ', a separate one for each kitchen.',
      c('aspect-ratio: 4 / 3') +
        ' and ' +
        c('object-fit: cover') +
        ': all the card photos are the same height, even if the shots have different proportions.',
      c('grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr))') +
        ': the cards line up in as many columns as will fit. That’s one on a phone and three on a laptop.'
    ),
    p(
      'Open the Catalog page in the manager, choose the Catalog template for it and save. The cards follow the order of the tree: drag the kitchens to change it.'
    ),
    shot(
      'en-catalog',
      'The studio’s catalog: kitchen cards with shape and price'
    ),
    aside(
      'tip',
      'The kitchens kept their template',
      p(
        'A new page takes its parent’s template. If you create a kitchen inside Catalog now, it gets Catalog, and you’ll have to switch it to Kitchen by hand. That’s easy to forget, so keep an eye on the template in the ' +
          ui('Place on the site') +
          ' block.'
      )
    ),
    h2('projects', 'The projects section'),
    p(
      'Create a top-level page called “Projects” (address <code>projects</code>), and three pieces of work inside it. For each one, fill in the ' +
        ui('Summary') +
        ' field: one or two sentences that will appear in the list. Leave the projects on the Base template.'
    ),
    p(
      'For the pager, meaning the “Previous” and “Next” links between pages of the list, we’ll use a ready-made component. Click the ' +
        ui('Elements') +
        ' icon in the header, open the ' +
        ui('Component kit') +
        ' tab and click ' +
        ui('Install') +
        ' next to the <code>Pagination</code> component. It appears among the site’s components, and you can edit it like one of your own.'
    ),
    p('Now the <code>Projects</code> template:'),
    code('svelte', PROJECTS, {
      file: 'The Projects template',
      save: 'template:Projects',
    }),
    list(
      c('listing(page.id, { perPage: 5 })') +
        ': the child pages in batches of five, newest first. The most recently published project ends up on top.',
      c('projects.items') +
        ': the projects in the current batch. On the second page of the list, that’s projects six through ten.',
      c('{:else}') +
        ' inside ' +
        c('{#each}') +
        ': what to show if the list is empty.',
      c('projects.pager()') +
        ', ' +
        c('projects.url(…)') +
        ': the page numbers of the list and the addresses of the neighboring pages. The Pagination component draws a pager from them, and draws nothing when there is only one page.',
      c('label') +
        ', ' +
        c('prevLabel') +
        ', ' +
        c('nextLabel') +
        ': the pager’s wording, that is, its name for screen readers and the text of the two links.'
    ),
    p(
      'Choose the Projects template for the Projects page. Once there are more than five projects, the second batch opens at <code>/projects/page-2</code>: Eile understands addresses like that by itself.'
    ),
    h2('home', 'The home page as a shop window'),
    p(
      'A list can also come from another section. The home page will show a large heading, a button to the catalog, a big photo, three kitchens with prices and two recent projects. Create a template named <code>Home</code>:'
    ),
    code('svelte', HOME, { file: 'The Home template', save: 'template:Home' }),
    list(
      c("top.find((_) => _.path === '/catalog')") +
        ': among the top-level pages, finds the one whose address is <code>/catalog</code>. The ' +
        c('_') +
        ' sign here is just a name for “the page being checked”.',
      c('children(catalog.id).slice(0, 3)') +
        ': the first three kitchens from Catalog. Change the order in the tree, and these change too.',
      c('listing(projects.id, { perPage: 2, paged: false })') +
        ': two recent projects. ' +
        c('paged: false') +
        ' says this list isn’t split into pages, so the home page won’t get addresses like <code>/page-2</code>.',
      c('kitchens[0]?.fields.photo') +
        ': the first kitchen’s photo, for the cover. The ' +
        c('?.') +
        ' sign keeps the template from crashing if the catalog has no kitchens yet.'
    ),
    p(
      'Choose the Home template for the home page. The large heading comes from the ' +
        ui('Long title') +
        ' field on the ' +
        ui('Search and social') +
        ' tab: type “Kitchens made to your measurements” there. It also goes into the browser tab title, while the site menu keeps the short “Home”.'
    ),
    shot('en-home', 'The studio’s home page on the Home template'),
    aside(
      'tip',
      'A ready-made feed',
      p(
        'The kit also has PostList: a feed with images, dates and a pager, all in one line of code. Here we built the project list ourselves so you can see how it works. For a studio blog, PostList will save you time.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        '<code>/catalog</code> shows cards for all the kitchens with prices;',
        '<code>/projects</code> shows three projects, the newest on top;',
        'the home page shows three kitchens and the two latest projects.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.kit('Pagination');
    _.code();
    _.edit('Catalog', { template: 'Catalog' });
    _.page({ title: 'Projects', alias: 'projects', template: 'Projects' });
    _PROJECTS.forEach(
      (project) =>
        void _.page({
          title: project.title,
          parent: 'Projects',
          template: 'Base',
          introText: project.intro,
          content: `<p>${project.intro}</p>`,
        })
    );
    _.edit('Home', {
      template: 'Home',
      longTitle: 'Kitchens made to your measurements',
    });
  },
  expect: [
    ['/catalog', 'Sage'],
    ['/catalog', 'L-shaped · from €1,650 per meter'],
    ['/projects', 'Island kitchen in a country house'],
    ['/projects/kitchen-in-a-high-ceilinged-period-apartment', 'High ceilings'],
    ['/', 'Browse the catalog'],
    ['/', 'from €1,450 per meter'],
  ],
};

const FOOTER_2 = `<!-- @component
Footer: name, address, phone, showroom hours and year. The contact details come from the site’s custom settings.
-->
<script>
  import { site } from '$core';

  let {
    /** Line next to the name */
    note = 'kitchens made to order',
  } = $props();

  const { name, custom } = site();
  const tel = custom.phone.replace(/[^+\\d]/g, '');
  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <p><b>{name}</b> · {note}</p>
  <p>{custom.address} · <a href={\`tel:\${tel}\`}>{custom.phone}</a></p>
  <p>{custom.hours}</p>
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

  .footer p {
    margin: 0.25rem 0;
  }

  .footer a {
    color: inherit;
  }
</style>`;

const settings: Chapter = {
  alias: 'settings',
  title: 'Custom settings: address and phone in one place',
  menuTitle: 'Custom settings',
  lead: 'The studio’s phone number is needed in the footer, on the contact page and next to the measuring visit form. We’ll enter it once in the settings, and templates and page texts will take it from there.',
  description:
    'Custom site settings in Eile: values like a phone number and an address, shown in a template through site().custom and in page text through a [@…] tag.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'add the settings “phone”, “address” and “showroom hours”;',
        'show them in the footer;',
        'insert them into the text of the Contact page.'
      )
    ),
    h2('why', 'One value for the whole site'),
    p(
      'A phone number rarely changes, but when it does, it has to change everywhere at once. If it’s written in five places, one of them will be forgotten, and customers will call the old number. That’s why values like this live in one place, and every other place refers to it.'
    ),
    h2('add', 'Add the settings'),
    p(
      'Open ' +
        ui('Settings') +
        ' → ' +
        ui('Custom settings') +
        ' and click ' +
        ui('Add key') +
        '. Add three settings:'
    ),
    list(
      '<code>phone</code>: “+353 1 555 0123”;',
      '<code>address</code>: “12 Mill Lane, Dublin”;',
      '<code>hours</code>: “Showroom open daily, 10:00 to 20:00”.'
    ),
    p(
      'Write the key in Latin letters: templates find the value by it. Changes in the table are saved right away.'
    ),
    h2('footer', 'In the footer'),
    p('Replace the code of the Footer component:'),
    code('svelte', FOOTER_2, {
      file: 'The Footer component',
      save: 'component:Footer',
    }),
    list(
      c('const { name, custom } = site();') +
        ': takes the name and the custom settings from the site settings. ' +
        c('custom') +
        ' holds everything you added on the ' +
        ui('Custom settings') +
        ' tab, by key.',
      c("custom.phone.replace(/[^+\\d]/g, '')") +
        ': turns “+353 1 555 0123” into “+35315550123”. A ' +
        c('tel:') +
        ' link understands a number in this form: on a phone, tapping it starts a call.'
    ),
    aside(
      'trouble',
      'The footer says [@phone]',
      p(
        'That’s how Eile shows a setting that doesn’t exist. Check the key: the code says <code>phone</code>, so the settings must say <code>phone</code> too, in lowercase.'
      )
    ),
    h2('text', 'In the page text'),
    p(
      'In a template you get settings through ' +
        c('site().custom') +
        ', and page text has a shorthand for it: the key in square brackets after an at sign. Open Contact and write:'
    ),
    code(
      'html',
      `Showroom address: [@address]
Phone: [@phone]
[@hours]`,
      { file: 'Text of the Contact page' }
    ),
    p(
      'On the site, ' +
        c('[@phone]') +
        ' turns into the number. Change the number in the settings, and it changes both here and in the footer.'
    ),
    shot(
      'en-contacts',
      'The Contact page: address and phone filled in from the settings'
    ),
    aside(
      'tip',
      'For sites in several languages',
      p(
        'Next to the custom settings there is a ' +
          ui('Translations') +
          ' tab. There, one key holds a text in each of the site’s languages. In page text you write it as ' +
          c('{i18n.key}') +
          ', and in a template as ' +
          c('site.i18n.key') +
          '. The Eile site you’re reading now is built this way: all of its labels live in translations.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'the footer shows the address, phone number and showroom hours;',
        'on a mobile phone, the number in the footer starts a call;',
        'on Contact, the values came from the settings.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.setting('phone', '+353 1 555 0123');
    _.setting('address', '12 Mill Lane, Dublin');
    _.setting('hours', 'Showroom open daily, 10:00 to 20:00');
    _.code();
    _.edit('Contact', {
      content:
        '<p>Showroom address: [@address]<br>Phone: [@phone]<br>[@hours]</p>',
    });
  },
  expect: [
    ['/', 'href="tel:+35315550123"'],
    ['/contact', '12 Mill Lane, Dublin'],
  ],
};

export var DATA: readonly Chapter[] = [fields, lists, settings];
