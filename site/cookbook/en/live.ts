import {
  consent,
  formSource,
  input,
  textarea,
} from '../../../src/scaffolds/form-html.ts';
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

const LAYOUT_2 = `<!-- @component
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
  :global(:root) {
    --t-accent: #1f1e1c;
    --t-radius: 0.75rem;
  }

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

const form: Chapter = {
  alias: 'form',
  title: 'A form: measuring visit requests',
  menuTitle: 'Measuring visit',
  lead: 'A visitor leaves their name, phone number, address and a convenient date, and the request arrives in the manager and in Telegram. We’ll build the form without writing any code and put it on the contact page.',
  description:
    'Forms and submissions in Eile: build a form in the manager, put it on a page, receive submissions and get notifications in Telegram.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'build a measuring visit request form in the form editor;',
        'put it on the Contact page;',
        'send a test request and find it in the manager;',
        'connect notifications in Telegram.'
      )
    ),
    h2('build', 'Build the form'),
    steps(
      'Open ' +
        ui('Forms') +
        ' in the manager header and click ' +
        ui('New form') +
        '.',
      'Title: “Measuring visit request”. The name for placing the form on a page is built from the title automatically.',
      `Click ${ui('Create')}.`
    ),
    p(
      'The form starts with a ready set of fields: name, phone, comment and consent to data processing. On the right you can see the form the way a visitor will.'
    ),
    p(
      'Below the fields there is an ' +
        ui('Add to form') +
        ' block with a button for each field type. Click ' +
        ui('Text') +
        ', then ' +
        ui('Date') +
        '. Click a new field to open its settings:'
    ),
    list(
      'give the text field the label “Address” and check “Required”: whoever comes to measure needs to know where to go;',
      'give the date field the label “Preferred date”.'
    ),
    p(
      'You can reorder fields with the arrows: put the address and the date right after the phone. Keep the consent field. A site that collects names and phone numbers needs the visitor’s consent to process that data.'
    ),
    p(
      'On the ' +
        ui('After sending') +
        ' tab, write what the visitor will see: “Thank you! We’ll call you back within an hour to arrange a time for the measuring visit.” Save the form.'
    ),
    shot(
      'en-form',
      'The “Measuring visit request” form editor and its preview'
    ),
    h2('place', 'Put it on a page'),
    p(
      'Open the Contact page. Below the text, click ' +
        ui('Add block') +
        ', choose ' +
        ui('Form') +
        ' and pick “Measuring visit request” from the list. Save.'
    ),
    p(
      'In the page HTML, a form block is the tag ' +
        c('[#Form:form-name]') +
        '. You can also type it by hand: the editor of each form shows its tag at the top, next to a button that copies it.'
    ),
    p(
      'The form takes the site’s colors from the CSS variables ' +
        c('--t-accent') +
        ' and ' +
        c('--t-radius') +
        '. Let’s set them in the frame so the button turns graphite, like the other buttons on the site. Replace the code of the Layout component:'
    ),
    code('svelte', LAYOUT_2, {
      file: 'The Layout component',
      save: 'component:Layout',
    }),
    p(
      'The only new part is ' +
        c(':global(:root) { … }') +
        ' at the start of the styles: variables for the whole page.'
    ),
    h2('requests', 'Requests'),
    p(
      'Open Contact on the site, fill in the form and send it. The form works without JavaScript, and when JavaScript is available, it sends the request without reloading the page.'
    ),
    p(
      'In the manager, the envelope in the header now shows the number 1. Click it to see the new request. It has everything the visitor filled in, the page they came from, and ' +
        ui('Call') +
        ' and ' +
        ui('Email') +
        ' buttons. Mark the request ' +
        ui('In progress') +
        ' when you call back, and ' +
        ui('Done') +
        ' once the measuring visit is booked.'
    ),
    aside(
      'tip',
      'Spam',
      p(
        'You don’t need a CAPTCHA. The form sets an invisible trap for bots, checks how many seconds it took to fill in and limits the number of requests from one address. Suspicious requests go to “Spam” and don’t trigger notifications.'
      )
    ),
    h2('telegram', 'Notifications in Telegram'),
    steps(
      'In Telegram, send the command <code>/newbot</code> to <a href="https://t.me/BotFather">@BotFather</a> and choose a name. It sends you a token: a long string with a colon in it.',
      'Open your new bot and send it anything, for example “hi”. Until you do, the bot can’t message you first.',
      'In the manager, open ' +
        ui('Settings') +
        ' → ' +
        ui('Notifications') +
        ', paste the token and click “Find chats”. Choose your chat and save.'
    ),
    p(
      'Send one more request from the site: it will arrive in Telegram. The site will also write to you there if something breaks.'
    ),
    aside(
      'trouble',
      'The form isn’t on the page',
      list(
        'Does the template output the text through ' +
          c('<Content of={page} />') +
          '? With ' +
          c('{@html page.content}') +
          ' the form tag stays a plain tag.',
        'Did you save the page after adding the block?'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'the Contact page has a form with the address and the preferred date;',
        'the test request shows up in the manager;',
        'the form button is graphite.'
      )
    ),
  ].join('\n'),
  replay: (_) => {
    _.form('measuring-visit-request', {
      title: 'Measuring visit request',
      source: formSource(
        input('text', 'name', 'Name', { required: true, maxLength: 100 }),
        input('tel', 'phone', 'Phone', { required: true }),
        input('text', 'address', 'Address', { required: true, maxLength: 300 }),
        input('date', 'date', 'Preferred date'),
        textarea('comment', 'Comment', { maxLength: 1000 }),
        consent('consent', 'I agree to the processing of personal data', '')
      ),
      submitLabel: 'Book a measuring visit',
      successText:
        'Thank you! We’ll call you back within an hour to arrange a time for the measuring visit.',
    });
    _.code();
    _.edit('Contact', {
      content:
        '<p>Showroom address: [@address]<br>Phone: [@phone]<br>[@hours]</p>[#Form:measuring-visit-request]',
    });
  },
  expect: [
    ['/contact', 'name="address"'],
    ['/', '--t-accent'],
  ],
};

const SHOWROOM = `<!-- @component
Whether the showroom is open: worked out again on every request, in Dublin time.
-->
<script>
  let {
    /** Opening hour */
    opens = 10,
    /** Closing hour */
    closes = 20,
  } = $props();

  const hour = Number(
    new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Europe/Dublin',
    }).format(new Date())
  );
  const open = hour >= opens && hour < closes;
</script>

<p class="now" class:open>
  {#if open}
    Showroom open until {closes}:00, come and see the kitchens in person
  {:else}
    Showroom closed, we open at {opens}:00
  {/if}
</p>

<style>
  .now {
    margin: 0;
    padding: 0.55rem 1.5rem;
    background: #1f1e1c;
    color: #f1efeb;
    font-size: 0.875rem;
    text-align: center;
  }

  .open {
    background: #3d4733;
  }
</style>`;

const HEADER_2 = `<!-- @component
Header: whether the showroom is open, the site name and the menu.
-->
<script>
  import Nav from '$components/Nav';
  import { site } from '$core';
  import Uncached from '$core/Uncached';
</script>

<Uncached name="Showroom" props={{ opens: 10, closes: 20 }} />

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

const CALC = `<!-- @component
Calculator: kitchen length in meters and an approximate price. Runs right in the browser.
-->
<script>
  let {
    /** Price per linear meter, € */
    price = 0,
  } = $props();

  let length = $state(3);
  const eur = new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
</script>

<div class="calc">
  <label for="length">Kitchen length: <b>{length.toLocaleString('en')} m</b></label>
  <input id="length" type="range" min="1.5" max="6" step="0.1" bind:value={length} />
  <p>About <b>{eur.format(Math.round(price * length))}</b> without appliances or installation</p>
</div>

<style>
  .calc {
    display: grid;
    gap: 0.6rem;
    margin: 1.5rem 0;
    padding: 1.25rem 1.4rem;
    border-radius: 1.25rem;
    background: #fff;
  }

  input {
    width: 100%;
    accent-color: #1f1e1c;
  }

  p {
    margin: 0;
  }
</style>`;

const KITCHEN_2 = `<script>
  import Content from '$core/Content';
  import Island from '$core/Island';
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

  {#if price}
    <Island name="Calc" props={{ price }} />
  {/if}

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

const live: Chapter = {
  alias: 'live-parts',
  title: 'Live parts: “showroom open” and a kitchen calculator',
  menuTitle: 'Live parts',
  lead: 'Eile builds a page once and then serves it from memory instantly. Some things have to change, though: whether the showroom is open right now, or what a 3.4-meter kitchen will cost. That’s what uncached regions and islands are for.',
  description:
    'Page caching in Eile, Uncached regions for things that change on every request, and Island components for interactivity in the browser.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'see how Eile speeds up the site with a cache;',
        'make a “Showroom open” strip that is worked out again on every request;',
        'make a price calculator that runs right in the browser.'
      )
    ),
    h2('cache', 'How the cache works'),
    p(
      'When a visitor opens a page for the first time, Eile builds it from the template and remembers the finished HTML. The next visitors get it from memory in a fraction of a millisecond. As soon as you edit the page or the template, Eile drops the remembered copy and builds the page again.',
      'That works well for everything that changes from one edit to the next. The “Showroom open” strip, though, changes on its own as the clock moves. If Eile remembered it at ten in the morning, it would show the ten o’clock state all day.'
    ),
    h2('region', 'An uncached region'),
    p(
      'For spots like this there are regions. A region is a piece of the page that is built again on every request, while everything around it still comes from memory. Let’s make a <code>Showroom</code> component:'
    ),
    code('svelte', SHOWROOM, {
      file: 'The Showroom component',
      save: 'component:Showroom',
    }),
    list(
      c('new Date()') +
        ': the current moment. ' +
        c('Intl.DateTimeFormat') +
        ' with ' +
        c("timeZone: 'Europe/Dublin'") +
        ' turns it into the hour in Dublin, wherever the server happens to be.',
      c('class:open') +
        ': adds the <code>open</code> class when the showroom is open. That’s how the strip changes color.'
    ),
    p(
      'Now let’s put the strip into the header as a region. Replace the code of Header:'
    ),
    code('svelte', HEADER_2, {
      file: 'The Header component',
      save: 'component:Header',
    }),
    p(
      c('<Uncached name="Showroom" …/>') +
        ' says “don’t remember this component, draw it every time”. Parameters go in ' +
        c('props') +
        '.'
    ),
    aside(
      'tip',
      'How to check it',
      p(
        'In the header, change ' +
          c('closes: 20') +
          ' to an hour that has already passed, save and refresh the site. The strip will say the showroom is closed. Then change it back.'
      )
    ),
    h2('island', 'An island: the kitchen calculator'),
    p(
      'A region is built on the server. The calculator, however, has to respond to the slider without a page reload, so it has to run in the browser. That’s what islands are for. An island is a component that the server draws as usual and the browser then brings to life. JavaScript goes only to the pages that have an island, and the rest of the site stays without a single script.'
    ),
    p('The <code>Calc</code> component:'),
    code('svelte', CALC, {
      file: 'The Calc component',
      save: 'component:Calc',
    }),
    list(
      c('let length = $state(3);') +
        ': state, a number that can change. The kitchen starts out three meters long.',
      c('bind:value={length}') +
        ': links the slider and the variable both ways. Move the slider, and <code>length</code> changes, along with everything that depends on it.',
      c('{eur.format(Math.round(price * length))}') +
        ': the price is recalculated every time the slider moves.'
    ),
    p(
      'Let’s put the island on the kitchen page. Replace the code of the Kitchen template:'
    ),
    code('svelte', KITCHEN_2, {
      file: 'The Kitchen template',
      save: 'template:Kitchen',
    }),
    p(
      c('<Island name="Calc" props={{ price }} />') +
        ': the price goes to the island as a parameter. An island can’t use ' +
        c('$core') +
        ', because it lives in the browser, where there is no site database. Pass everything it needs through ' +
        c('props') +
        '.'
    ),
    shot('en-calc', 'A kitchen page with the price calculator'),
    aside(
      'trouble',
      'The manager won’t save the island',
      p(
        'Most likely it has ' +
          c("import … from '$core'") +
          '. Remove the import and pass the data as a parameter.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        'above the header there is a strip saying “Showroom open” or “Showroom closed”;',
        'on a kitchen page, the slider changes the length and the price;',
        'the source of the home page has no ' +
          c('<script>') +
          ' except the markup for search engines.'
      )
    ),
  ].join('\n'),
  expect: [
    ['/', 'Showroom'],
    ['/catalog/cashmere', 'cms-island'],
  ],
};

export var LIVE: readonly Chapter[] = [form, live];
