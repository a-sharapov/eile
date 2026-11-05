import { aside, type Chapter, c, code, h2, list, p, ui } from '../markup.ts';

const deploy: Chapter = {
  alias: 'go-live',
  title: 'The site on the internet: server, domain and HTTPS',
  menuTitle: 'Go live',
  lead: 'So far the site lives on your computer. Let’s move it to a server, connect a domain and turn on HTTPS. You’ll need a Linux server and a domain, and Eile does the rest by itself.',
  description:
    'How to put an Eile site on the internet: a VPS, a domain, moving site.db, a service in one command, HTTPS from Let’s Encrypt without a proxy, backups and updates.',
  content: [
    aside(
      'goal',
      'In this chapter',
      list(
        'rent a server and point a domain at it;',
        'move the site as a single file;',
        'run Eile as a service with HTTPS;',
        'set up backups and learn how to update.'
      )
    ),
    h2('server', 'Server and domain'),
    p(
      'You need a small virtual server (VPS) with Linux: a plan from 512 MB of memory will do, and 1 GB leaves room to spare. With less than a gigabyte and no swap file, <code>cms service install</code> warns you and shows how to add one. When you order it, choose Ubuntu or Debian. The host sends you the server’s IP address, for example <code>203.0.113.10</code>, and the password for the root user.',
      'You buy a domain from a registrar. This chapter uses <code>facade.example</code>; put your own domain wherever you see it. If the domain already has a site or mail at a previous host, check it while DNS is still untouched. On your own computer, run:'
    ),
    code('sh', '$ cms diagnose domain facade.example --to 203.0.113.10'),
    p(
      'The command tells you what breaks once the domain leads to the new server. Most often it’s mail: if it lives at the old host on the same address, messages go to the new server, which has no mail. At the end it lists the records to fix before the switch, step by step. A brand-new domain needs no check.',
      'Now, in the domain’s DNS settings at the registrar, create two A records, one for <code>facade.example</code> and one for <code>www.facade.example</code>, both with the server’s IP address. The records take anywhere from a few minutes to a couple of hours to spread across the internet.'
    ),
    h2('ssh', 'Log in to the server'),
    p(
      'You talk to a server over SSH. It’s the same terminal, except the commands run on another computer. In the terminal on your own computer, type:'
    ),
    code('sh', '$ ssh root@203.0.113.10'),
    p(
      'Enter the password from your host. The prompt changes: from now on, your commands go to the server. Install Eile the same way as in chapter two:'
    ),
    code('sh', '$ curl -fsSL https://eile.site/install.sh | bash'),
    p(
      'When you install as root, the program goes to <code>/usr/local/bin/cms</code>. Leave the server with the <code>exit</code> command:'
    ),
    code('sh', '$ exit'),
    h2('move', 'Move the site'),
    p(
      'The whole site is in <code>site.db</code>. First make a copy of it on your computer, in the <code>facade</code> folder:'
    ),
    code('sh', '$ cms backup facade-copy.db'),
    p(
      'You can make the copy while the site is running: it comes out complete, with no half-written records. Email, Telegram and the mail gateway belong to this computer, not the site, and are not part of the copy. If you have set them up already, take them along in a server settings file:'
    ),
    code('sh', '$ cms backup --server facade-server.enc'),
    p(
      'The command asks for a passphrase twice, at least 12 characters: the file is encrypted with it, since it holds the mail password and the bot token. Now send both files to the server with <code>scp</code>, a command that copies files over SSH:'
    ),
    code('sh', '$ scp facade-copy.db facade-server.enc root@203.0.113.10:'),
    h2('service', 'Run it as a service'),
    p(
      'If you start <code>cms</code> in the server’s terminal, the site stops as soon as you close the window. That’s why it runs as a service: Linux starts it when the server boots and restarts it if something goes wrong. Eile creates the service by itself. Log in to the server again and run one command, replacing the domains and the email with your own:'
    ),
    code(
      'sh',
      '$ ssh root@203.0.113.10\n$ cms service install --domain facade.example,www.facade.example --email you@example.com --from facade-copy.db'
    ),
    list(
      c('--domain facade.example,www.facade.example') +
        ': the addresses the site lives at. Eile gets an HTTPS certificate for them from Let’s Encrypt by itself, renews it and sends visitors from http to https, and from www to the address without it, the first in the list.',
      c('--email') +
        ': Let’s Encrypt writes to this address if something is wrong with the certificate.',
      c('--from facade-copy.db') +
        ': the copy of the site you brought along. Eile moves it to <code>/var/lib/cms/site.db</code>, and after that you can delete <code>facade-copy.db</code>.'
    ),
    p(
      'First the command checks that the domains point to this server, that ports 80 and 443 are free and that there is enough memory. If something is wrong, it tells you what to fix. Then it creates the service, starts it and waits for the site to answer. At the end you see <code>✓ The service cms is running</code> with the addresses of the site and the manager.',
      'After a minute, open <code>https://facade.example</code>: the site is there, with a padlock in the address bar. The manager is at <code>https://facade.example/manager</code>, and you sign in with the same email and password you used at home, because they moved along with the database.'
    ),
    p(
      'What’s left is the server settings from the file. The command asks for the same passphrase:'
    ),
    code(
      'sh',
      '$ cms restore --server facade-server.enc --db /var/lib/cms/site.db'
    ),
    p(
      'Email, Telegram and the mail gateway work right away: the service picks them up by itself, no restart needed. Then delete <code>facade-server.enc</code> from the server and from your folder: it is only for the move. If you have no such file, set up email and Telegram in the manager again.'
    ),
    p(
      '<code>cms service status</code> shows how the site is doing. To see the service file without changing anything, add <code>--print</code>. If your host offers uptime checks, give them the address <code>https://facade.example/_cms/health</code>: it answers 200 while the site runs and can read its database.'
    ),
    aside(
      'trouble',
      'The site doesn’t open over HTTPS',
      list(
        'Do the DNS records point to the server yet? Check with <code>ping facade.example</code>: the reply should show the server’s IP.',
        'Are ports 80 and 443 open? Some hosts have their own firewall in the control panel.',
        'What does the service say? <code>cms service logs</code> shows the last lines of its log.'
      )
    ),
    aside(
      'trouble',
      'Emails don’t go out',
      p(
        'Many hosts block the SMTP mail ports on new servers: on DigitalOcean, for example, ports 25, 465 and 587. Then in ' +
          ui('Settings') +
          ' → ' +
          ui('Notifications') +
          ', set ' +
          ui('Send through') +
          ' to a mail service — Brevo, Postmark, Mailgun, Resend or Amazon SES — and paste its API key. Emails go out over HTTPS, the same way the site itself is served. Verify the sender’s domain with the service: it shows SPF and DKIM records to add to the domain’s DNS. Then press ' +
          ui('Send a test') +
          '.'
      )
    ),
    h2('address', 'The site address in the settings'),
    p(
      'In the manager, open ' +
        ui('Settings') +
        ' → ' +
        ui('Site') +
        ' and enter the site address: <code>https://facade.example</code>. Eile uses it to build links for search engines, the sitemap and previews on social networks.'
    ),
    h2('backups', 'Backups'),
    p(
      'In ' +
        ui('Settings') +
        ' → ' +
        ui('Backups and updates') +
        ', turn on automatic backups, for example once a day at three in the morning, keeping the last seven. The server makes them by itself. If a backup fails, you get a notification.'
    ),
    p(
      'A backup that sits only on the same server won’t help if that server breaks. So in the same place, under ' +
        ui('Backups off the server') +
        ', connect a storage: for example DigitalOcean Spaces at the same host, or Backblaze B2. Enter the storage address, the bucket, the access key and its secret, press ' +
        ui('Check connection') +
        ' and save. From now on every automatic backup goes to the storage encrypted, and the storage keeps the last fourteen.'
    ),
    aside(
      'warn',
      'The recovery key',
      p(
        'When you first turn it on, the manager shows a recovery key once: 55 letters and digits. Save it in a password manager. If the server disappears altogether, only this key opens a backup from the storage on a new server: <code>cms restore --remote latest</code> asks for it.'
      )
    ),
    p(
      'Now and then, download a backup to your own computer too: it’s one button in the ' +
        ui('Backups') +
        ' section of the manager header.'
    ),
    h2('updates', 'Updates'),
    p(
      'When a new version of Eile comes out, the manager shows it in the account menu. Updating on the server takes one command:'
    ),
    code('sh', '$ cms update'),
    p(
      'It downloads the new version, checks its checksum, does a test run, snapshots the database and restarts the service. If the new version doesn’t come up, <code>cms update</code> puts the previous one back together with the database and tells you. Still, before you update, it’s a good idea to make your own backup with ' +
        c('cms backup') +
        '.'
    ),
    aside(
      'tip',
      'Moving to another server',
      p(
        'It’s this chapter all over again: install <code>cms</code>, bring the copy of the site and the settings file, run <code>cms service install</code> and <code>cms restore --server</code>. If the old server is already gone, <code>cms restore --remote latest</code> takes the backup from the storage, with the recovery key.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        '<code>https://facade.example</code> opens with a padlock;',
        '<code>http://facade.example</code> switches to https by itself;',
        'automatic backups are on and go to the storage, the recovery key is saved;',
        'you’ve downloaded one backup to your computer.'
      )
    ),
  ].join('\n'),
};

const next: Chapter = {
  alias: 'next',
  title: 'What’s next',
  lead: 'The studio’s site is up and running. Here’s what else Eile can do and where to look when you want more.',
  description:
    'What to learn after the Eile cookbook: cookieless statistics, a draft for the client, AI agents and reviewing their edits, search, languages, scaffolds and packages, plugins, moving from WordPress and MODX Evo, and the documentation.',
  content: [
    p(
      'Over twelve chapters you installed Eile, built templates and components, added fields and settings, made a form that collects requests, brought a page to life with an island and put the site on the internet. That covers most small sites. Everything else is optional.'
    ),
    h2('statistics', 'Visitor statistics'),
    p(
      'Eile counts how many people visit and where they come from by itself, on the server. Open ' +
        ui('Settings') +
        ' → ' +
        ui('Statistics') +
        ', tick ' +
        ui('Count visitors') +
        ' and save. No cookies, no third-party counter and no consent banner: the visitor’s address and browser become a short hash, and its salt lives in server memory until midnight. Visitors, sources, UTM tags and goals show up in the ' +
        ui('Statistics') +
        ' section of the manager header. Form submissions count as goals by themselves.',
      'While you are signed in to the manager, you aren’t counted: check from another browser.'
    ),
    aside(
      'warn',
      'Privacy policy',
      p(
        'The site’s privacy policy has to mention the counting. A sample paragraph in German and English sits right there in the statistics settings. It covers only the statistics: have a lawyer check the whole policy.'
      )
    ),
    h2('client', 'A draft for the client'),
    p(
      'You can show an unpublished page to a client without a manager login. Open it and press ' +
        ui('Link for a client') +
        ' next to the preview. Say who it is for, set the number of days and press ' +
        ui('Create link') +
        '. Copy it right away: the full link is shown only once. The client sees the page with a “not published” label, and search engines leave it alone. When you no longer need the link, press ' +
        ui('Revoke') +
        '.'
    ),
    h2('agents', 'AI agents and reviewing their edits'),
    p(
      'An AI agent such as Claude Code connects to the site over MCP with one command. Run it in the site’s folder:'
    ),
    code('sh', '$ claude mcp add facade -- cms mcp --db site.db'),
    p(
      'To keep the agent’s edits from going live at once, open ' +
        ui('Proposals') +
        ' in the manager header and tick ' +
        ui('Changes of all agents wait for review') +
        '. From then on, pages, templates and components from the agent collect into a set: you see the diff and a preview, then press ' +
        ui('Accept all') +
        ' or ' +
        ui('Reject all') +
        '. The assistant inside the manager edits directly: you are watching it anyway.'
    ),
    h2('search', 'Site search'),
    p(
      'The ' +
        ui('Component kit') +
        ' has SearchForm (a search box for the header) and SearchResults (a results page that highlights the matches). Search understands Russian and English word endings: a search for “kitchens” also finds “kitchen”.'
    ),
    h2('languages', 'Multiple languages'),
    p(
      'You set the language on a branch of the tree: a page at <code>/en</code> with the language set to English, and everything inside it is in English. Template labels are translated in ' +
        ui('Settings') +
        ' → ' +
        ui('Translations') +
        '. The site you’re reading works this way: the Russian home page is at <code>/</code>, and the English one is at <code>/en</code>.'
    ),
    h2('scaffolds', 'Ready-made scaffolds and packages'),
    p(
      'The <code>cms new</code> command sets up a ready-made site: a blog, a portfolio, a company site, a showcase or a shop. There is also an official package, <code>kuechenstudio</code>: a site for a kitchen studio in Germany, in German, with an Impressum, a Datenschutz page and slots for an online planner and a chat. <code>cms new kuechenstudio</code> takes it from the release page and checks its checksum. Scaffolds make a good textbook: set one up in a separate folder and read through its elements.'
    ),
    code(
      'sh',
      '$ mkdir blog-example\n$ cd blog-example\n$ cms new blog\n$ cms --port 8081'
    ),
    p(
      'The ' +
        c('--port 8081') +
        ' option keeps the example from fighting over the port with the studio site, in case that one is running too. Your own site can become a package like that: ' +
        c('cms scaffold pack') +
        ' turns a folder into a .zip file, and ' +
        c('cms new ./studio.zip') +
        ' sets it up.'
    ),
    h2('plugins', 'Plugins'),
    p(
      'A plugin changes how the whole site behaves. It can adjust the finished HTML before it goes out, redirect an address that doesn’t exist or react when a page is published. You write it in TypeScript right in ' +
        ui('Elements') +
        ' and turn it on with one button.'
    ),
    h2('wordpress', 'Moving from WordPress'),
    p(
      'A WordPress site moves over from an export file: in the WordPress admin, open Tools → Export and download everything. In a new folder, start with a dry run: it writes nothing and only shows the report.'
    ),
    code(
      'sh',
      '$ cms import-wp wordpress.xml --media https://old-site.example --dry-run\n$ cms import-wp wordpress.xml --media https://old-site.example'
    ),
    p(
      'Pages with their tree, posts, images, menus and the SEO fields of Yoast, Rank Math, SEOPress and AIOSEO come along. Old addresses, even ones like <code>/?p=12</code>, become redirects. Layouts from builders such as Elementor can’t be moved: the text stays, and those pages are listed in the report. You can check the old addresses against the old site’s sitemap:'
    ),
    code(
      'sh',
      '$ cms diagnose redirects https://old-site.example/wp-sitemap.xml'
    ),
    p(
      'Each address should arrive with a single 301 or 308 at a live page. The command reports anything else as an error.'
    ),
    h2('evo', 'Moving from MODX Evo'),
    p(
      'If you have a site on MODX Evolution, you can move it over from a MySQL dump with ' +
        c('cms import-evo dump.sql') +
        '. The tree with its ids, the templates, chunks and TVs come along. PHP snippets have to be rewritten as components, and you now know how to do that.'
    ),
    h2('docs', 'Documentation'),
    list(
      'The ' +
        ui('Help') +
        ' section in the manager: how to run a site, in short notes organized by task.',
      '<code>cms help</code> in the terminal: every command, with examples.',
      'The <a href="https://github.com/a-sharapov/eile/blob/main/docs/glossary.md">glossary</a> (in Russian for now): every <code>$core</code> function and Eile term.',
      '<a href="https://github.com/a-sharapov/eile/tree/main/site">The source of this site</a>: it’s made with Eile, and you can read all of its templates.'
    ),
    aside(
      'tip',
      'Thanks for reading to the end',
      p(
        'If something in the cookbook was unclear or didn’t work, write to us on <a href="https://github.com/a-sharapov/eile/issues">GitHub</a>. The cookbook is edited like any other Eile site, and every message like that makes it better.'
      )
    ),
  ].join('\n'),
};

export var LAUNCH: readonly Chapter[] = [deploy, next];
