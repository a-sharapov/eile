import { aside, type Chapter, c, code, h2, list, p, ui } from '../markup.ts';

const deploy: Chapter = {
  alias: 'go-live',
  title: 'The site on the internet: server, domain and HTTPS',
  menuTitle: 'Go live',
  lead: 'So far the site lives on your computer. Let’s move it to a server, connect a domain and turn on HTTPS. You’ll need a Linux server and a domain, and Eile does the rest by itself.',
  description:
    'How to put an Eile site on the internet: a VPS, a domain, moving site.db, systemd, HTTPS from Let’s Encrypt without a proxy, backups and updates.',
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
      'You need a small virtual server (VPS) with Linux: the cheapest plan with 1 GB of memory at any hosting provider will do. When you order it, choose Ubuntu or Debian. The host sends you the server’s IP address, for example <code>203.0.113.10</code>, and the password for the root user.',
      'You buy a domain from a registrar. This chapter uses <code>facade.example</code>; put your own domain wherever you see it. In the domain’s DNS settings, create two A records, one for <code>facade.example</code> and one for <code>www.facade.example</code>, both with the server’s IP address. The records take anywhere from a few minutes to a couple of hours to spread across the internet.'
    ),
    h2('ssh', 'Log in to the server'),
    p(
      'You talk to a server over SSH. It’s the same terminal, except the commands run on another computer. In the terminal on your own computer, type:'
    ),
    code('sh', '$ ssh root@203.0.113.10'),
    p(
      'Enter the password from your host. The prompt changes: from now on, your commands go to the server. Install Eile the same way as in chapter two:'
    ),
    code(
      'sh',
      '$ curl -fsSL https://github.com/a-sharapov/eile/releases/latest/download/install.sh | bash'
    ),
    p(
      'When you install as root, the program goes to <code>/usr/local/bin/cms</code>. Create a folder for the site and leave the server with the <code>exit</code> command:'
    ),
    code('sh', '$ mkdir -p /var/lib/cms\n$ exit'),
    h2('move', 'Move the site'),
    p(
      'The whole site is in <code>site.db</code>. First make a copy of it on your computer, in the <code>facade</code> folder:'
    ),
    code('sh', '$ cms backup facade-copy.db'),
    p(
      'You can make the copy while the site is running: it comes out complete, with no half-written records. Now send it to the server with <code>scp</code>, a command that copies files over SSH:'
    ),
    code('sh', '$ scp facade-copy.db root@203.0.113.10:/var/lib/cms/site.db'),
    h2('service', 'Run it as a service'),
    p(
      'If you start <code>cms</code> in the server’s terminal, the site stops as soon as you close the window. That’s why it runs as a service: Linux starts it when the server boots and restarts it if something goes wrong. Log in to the server again and create the service file:'
    ),
    code(
      'sh',
      '$ ssh root@203.0.113.10\n$ nano /etc/systemd/system/cms.service'
    ),
    p(
      'A simple editor opens. Paste the text below, replacing the domains and the email with your own, then press <kbd>Ctrl</kbd>+<kbd>O</kbd>, <kbd>Enter</kbd> and <kbd>Ctrl</kbd>+<kbd>X</kbd> to save and exit.'
    ),
    code(
      'ini',
      `[Unit]
Description=Eile CMS
After=network.target

[Service]
ExecStart=/usr/local/bin/cms --domain facade.example,www.facade.example --email you@example.com
Environment=CMS_DB=/var/lib/cms/site.db
DynamicUser=yes
StateDirectory=cms
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Restart=on-failure

[Install]
WantedBy=multi-user.target`,
      { file: '/etc/systemd/system/cms.service' }
    ),
    list(
      c('--domain facade.example,www.facade.example') +
        ': the addresses the site lives at. Eile gets an HTTPS certificate for them from Let’s Encrypt by itself, renews it and sends visitors from http to https.',
      c('--email') +
        ': Let’s Encrypt writes to this address if something is wrong with the certificate.',
      c('CMS_DB') + ': where the site database is.',
      c('AmbientCapabilities') +
        ': lets the program use ports 80 and 443, where websites run, without root rights.'
    ),
    p('Turn the service on:'),
    code('sh', '$ systemctl enable --now cms\n$ systemctl status cms'),
    p(
      'The second command should show <code>active (running)</code>. After a minute, open <code>https://facade.example</code>: the site is there, with a padlock in the address bar. The manager is at <code>https://facade.example/manager</code>, and you sign in with the same email and password you used at home, because they moved along with the database.'
    ),
    aside(
      'trouble',
      'The site doesn’t open over HTTPS',
      list(
        'Do the DNS records point to the server yet? Check with <code>ping facade.example</code>: the reply should show the server’s IP.',
        'Are ports 80 and 443 open? Some hosts have their own firewall in the control panel.',
        'What does the service say? <code>journalctl -u cms -n 50</code> shows the last lines of its log.'
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
      'Now and then, download a backup to your own computer: it’s one button in the ' +
        ui('Backups') +
        ' section of the manager header. A backup that sits only on the same server won’t help if that server breaks.'
    ),
    h2('updates', 'Updates'),
    p(
      'When a new version of Eile comes out, the manager shows it in the account menu. Updating on the server takes two commands:'
    ),
    code('sh', '$ cms update\n$ systemctl restart cms'),
    p(
      'The first one downloads the new version, checks its checksum and does a test run. The second restarts the site. Before you update an alpha version, it’s a good idea to make a backup with ' +
        c('cms backup') +
        '.'
    ),
    aside(
      'tip',
      'Moving to another server',
      p(
        'It’s this chapter all over again: install <code>cms</code>, copy the database, create the service. Two files and ten minutes.'
      )
    ),
    aside(
      'check',
      'Check yourself',
      list(
        '<code>https://facade.example</code> opens with a padlock;',
        '<code>http://facade.example</code> switches to https by itself;',
        'automatic backups are on, and you’ve downloaded one backup to your computer.'
      )
    ),
  ].join('\n'),
};

const next: Chapter = {
  alias: 'next',
  title: 'What’s next',
  lead: 'The studio’s site is up and running. Here’s what else Eile can do and where to look when you want more.',
  description:
    'What to learn after the Eile cookbook: site search, multiple languages, plugins, ready-made scaffolds, moving from MODX Evo and the documentation.',
  content: [
    p(
      'Over twelve chapters you installed Eile, built templates and components, added fields and settings, made a form that collects requests, brought a page to life with an island and put the site on the internet. That covers most small sites. Everything else is optional.'
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
    h2('scaffolds', 'Ready-made scaffolds'),
    p(
      'The <code>cms new</code> command sets up a ready-made site: a blog, a portfolio, a company site, a showcase or a shop. They make a good textbook: set up a scaffold in a separate folder and read through its elements.'
    ),
    code(
      'sh',
      '$ mkdir blog-example\n$ cd blog-example\n$ cms new blog\n$ cms --port 8081'
    ),
    p(
      'The ' +
        c('--port 8081') +
        ' option keeps the example from fighting over the port with the studio site, in case that one is running too.'
    ),
    h2('plugins', 'Plugins'),
    p(
      'A plugin changes how the whole site behaves. It can adjust the finished HTML before it goes out, redirect an address that doesn’t exist or react when a page is published. You write it in TypeScript right in ' +
        ui('Elements') +
        ' and turn it on with one button.'
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
