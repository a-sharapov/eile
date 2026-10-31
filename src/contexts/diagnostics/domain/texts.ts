import type { ManagerLanguage } from '../../../shared/kernel/manager-language.ts';

type Said = { readonly title: string; readonly hint: string };

/** Находки встроенных проверок; id — стабильные, по ним менеджер их и узнаёт. */
export type SiteFindingId =
  | 'links.broken'
  | 'links.unpublished'
  | 'links.redirected'
  | 'pages.no_home'
  | 'pages.no_description'
  | 'pages.duplicate_titles'
  | 'pages.orphans'
  | 'pages.long_title'
  | 'media.no_alt'
  | 'media.heavy'
  | 'settings.robots_block'
  | 'settings.no_site_url'
  | 'settings.no_404'
  | 'settings.forms_silent'
  | 'settings.undelivered'
  | 'settings.ai_search_off';

/** Тексты встроенных проверок на языке менеджера. */
export type CheckTexts = {
  readonly findings: Readonly<Record<SiteFindingId, Said>>;
  readonly form: (title: string) => string;
  readonly homePage: string;
  readonly siteUrl: string;
  readonly notFoundPage: string;
  readonly notifications: string;
  readonly aiSearch: string;
  /** У скольких ещё страниц такой же заголовок. */
  readonly sameTitle: (others: number) => string;
  readonly chars: (n: number) => string;
  readonly megabytes: string;
  readonly kilobytes: string;
  readonly checkFailed: (id: string) => string;
};

// Заголовок в выдаче поисковики обрезают примерно после 60 знаков.
export var TITLE_LIMIT = 60;

const _ru = (n: number, one: string, few: string, many: string): string =>
  `${n} ${({ one, few, many } as Record<string, string>)[new Intl.PluralRules('ru').select(n)] ?? many}`;

export var CHECK_TEXTS: Readonly<Record<ManagerLanguage, CheckTexts>> = {
  en: {
    findings: {
      'links.broken': {
        title: 'Links to nowhere',
        hint: 'The page or file doesn’t exist or is in the trash: visitors get a 404. Fix the link or restore the page.',
      },
      'links.unpublished': {
        title: 'Links to drafts',
        hint: 'The page isn’t published: until it is, the link leads to a 404.',
      },
      'links.redirected': {
        title: 'Links through a redirect',
        hint: 'The address redirects elsewhere: an extra request for visitors and search engines. Link to the page directly.',
      },
      'pages.no_home': {
        title: 'No home page, or it isn’t published',
        hint: 'The site address without a path answers 404. Choose the home page in the settings.',
      },
      'pages.no_description': {
        title: 'Pages without a description',
        hint: 'No description and no summary: search engines and messengers will show a random piece of text under the title.',
      },
      'pages.duplicate_titles': {
        title: 'Identical titles',
        hint: 'Such pages look the same in search results. Give them different titles.',
      },
      'pages.orphans': {
        title: 'Pages no one can reach',
        hint: 'Hidden from the menu, not linked from anywhere, and not listed by its parent: visitors won’t find it.',
      },
      'pages.long_title': {
        title: 'Long titles',
        hint: `Search engines cut titles after ~${TITLE_LIMIT} characters, and with the site name it is even longer.`,
      },
      'media.no_alt': {
        title: 'Images without a description',
        hint: 'Screen readers read the description, and image search sees it. Describe what the image shows.',
      },
      'media.heavy': {
        title: 'Heavy files',
        hint: 'An image over a megabyte without smaller copies, or a file over 10 MB, loads slowly on a phone. Compress it or upload it again.',
      },
      'settings.robots_block': {
        title: 'The whole site is closed to search engines',
        hint: 'The extra robots.txt lines contain “Disallow: /” for all robots. The site will drop out of search.',
      },
      'settings.no_site_url': {
        title: 'Site address not set',
        hint: 'Without it, canonical links, the sitemap and links in emails use the request address, which can be an internal one behind a proxy.',
      },
      'settings.no_404': {
        title: 'No custom 404 page',
        hint: 'A visitor at a wrong address sees a bare “Not Found” without a menu. Choose a 404 page in the settings.',
      },
      'settings.forms_silent': {
        title: 'Forms without notifications',
        hint: 'Submissions of these forms are visible only in the manager: neither Telegram nor email is set up for them.',
      },
      'settings.undelivered': {
        title: 'Undelivered notifications',
        hint: 'A channel refused messages, so submissions or failures may have gone unnoticed. The channel error is in the notification settings.',
      },
      'settings.ai_search_off': {
        title: 'The site is closed to AI search',
        hint: 'AI assistants won’t cite the site in their answers. If that isn’t intended, turn it on in the search settings.',
      },
    },
    form: (title) => `Form “${title}”`,
    homePage: 'Site home page',
    siteUrl: 'Site address',
    notFoundPage: '404 page',
    notifications: 'Notifications',
    aiSearch: 'AI search',
    sameTitle: (others) =>
      others === 1 ? '1 more like this' : `${others} more like this`,
    chars: (n) => (n === 1 ? '1 character' : `${n} characters`),
    megabytes: 'MB',
    kilobytes: 'KB',
    checkFailed: (id) => `Check “${id}” didn’t run`,
  },
  de: {
    findings: {
      'links.broken': {
        title: 'Links ins Leere',
        hint: 'Die Seite oder Datei gibt es nicht, oder sie liegt im Papierkorb: Besucher sehen eine 404. Korrigieren Sie den Link oder stellen Sie die Seite wieder her.',
      },
      'links.unpublished': {
        title: 'Links auf Entwürfe',
        hint: 'Die Seite ist nicht veröffentlicht: Solange das so bleibt, führt der Link zu einer 404.',
      },
      'links.redirected': {
        title: 'Links über eine Weiterleitung',
        hint: 'Die Adresse leitet weiter: eine zusätzliche Anfrage für Besucher und Suchmaschinen. Verlinken Sie die Seite direkt.',
      },
      'pages.no_home': {
        title: 'Keine Startseite oder nicht veröffentlicht',
        hint: 'Die Adresse der Website ohne Pfad antwortet mit 404. Wählen Sie die Startseite in den Einstellungen.',
      },
      'pages.no_description': {
        title: 'Seiten ohne Beschreibung',
        hint: 'Weder Beschreibung noch Zusammenfassung: Suchmaschinen und Messenger zeigen unter dem Titel ein zufälliges Textstück.',
      },
      'pages.duplicate_titles': {
        title: 'Gleiche Titel',
        hint: 'In den Suchergebnissen sind solche Seiten nicht zu unterscheiden. Geben Sie ihnen verschiedene Titel.',
      },
      'pages.orphans': {
        title: 'Unerreichbare Seiten',
        hint: 'Im Menü ausgeblendet, nirgends verlinkt und nicht in der Liste der übergeordneten Seite: Besucher finden sie nicht.',
      },
      'pages.long_title': {
        title: 'Lange Titel',
        hint: `Suchmaschinen kürzen den Titel nach ~${TITLE_LIMIT} Zeichen, mit dem Namen der Website wird er noch länger.`,
      },
      'media.no_alt': {
        title: 'Bilder ohne Beschreibung',
        hint: 'Screenreader lesen die Beschreibung vor, die Bildersuche wertet sie aus. Beschreiben Sie, was auf dem Bild zu sehen ist.',
      },
      'media.heavy': {
        title: 'Große Dateien',
        hint: 'Ein Bild über einem Megabyte ohne verkleinerte Kopien oder eine Datei über 10 MB lädt auf dem Handy lange. Komprimieren Sie sie oder laden Sie sie neu hoch.',
      },
      'settings.robots_block': {
        title: 'Die ganze Website ist für Suchmaschinen gesperrt',
        hint: 'In den zusätzlichen Zeilen der robots.txt steht „Disallow: /“ für alle Robots. Die Website verschwindet aus der Suche.',
      },
      'settings.no_site_url': {
        title: 'Adresse der Website nicht angegeben',
        hint: 'Ohne sie entstehen Canonical-Links, Sitemap und Links in E-Mails aus der Adresse der Anfrage – hinter einem Proxy ist das oft eine interne.',
      },
      'settings.no_404': {
        title: 'Keine eigene 404-Seite',
        hint: 'Wer eine falsche Adresse aufruft, sieht ein nacktes „Not Found“ ohne Menü. Wählen Sie eine 404-Seite in den Einstellungen.',
      },
      'settings.forms_silent': {
        title: 'Formulare ohne Benachrichtigungen',
        hint: 'Anfragen dieser Formulare sind nur im Manager zu sehen: Weder Telegram noch E-Mail sind für sie eingerichtet.',
      },
      'settings.undelivered': {
        title: 'Nicht zugestellte Benachrichtigungen',
        hint: 'Ein Kanal hat Nachrichten abgelehnt – Anfragen oder Störungen könnten untergegangen sein. Den Fehler des Kanals finden Sie in den Benachrichtigungseinstellungen.',
      },
      'settings.ai_search_off': {
        title: 'Die Website ist für KI-Suche gesperrt',
        hint: 'KI-Assistenten verweisen in ihren Antworten nicht auf die Website. Wenn das nicht beabsichtigt ist, schalten Sie es in den Sucheinstellungen ein.',
      },
    },
    form: (title) => `Formular „${title}“`,
    homePage: 'Startseite der Website',
    siteUrl: 'Adresse der Website',
    notFoundPage: '404-Seite',
    notifications: 'Benachrichtigungen',
    aiSearch: 'KI-Suche',
    sameTitle: (others) =>
      others === 1 ? 'noch 1 solche' : `noch ${others} solche`,
    chars: (n) => `${n} Zeichen`,
    megabytes: 'MB',
    kilobytes: 'KB',
    checkFailed: (id) => `Prüfung „${id}“ wurde nicht ausgeführt`,
  },
  ru: {
    findings: {
      'links.broken': {
        title: 'Ссылки в никуда',
        hint: 'Страницы или файла нет, или он в корзине: посетитель увидит 404. Поправьте ссылку или верните страницу.',
      },
      'links.unpublished': {
        title: 'Ссылки на черновики',
        hint: 'Страница не опубликована: пока это так, ссылка ведёт на 404.',
      },
      'links.redirected': {
        title: 'Ссылки через переадресацию',
        hint: 'Адрес переадресуется дальше: лишний запрос посетителю и поисковику. Поставьте ссылку на страницу напрямую.',
      },
      'pages.no_home': {
        title: 'Главная не выбрана или не опубликована',
        hint: 'Адрес сайта без пути отвечает 404. Выберите главную в настройках.',
      },
      'pages.no_description': {
        title: 'Страницы без описания',
        hint: 'Ни описания, ни анонса: поисковик и мессенджер возьмут под заголовок случайный кусок текста.',
      },
      'pages.duplicate_titles': {
        title: 'Одинаковые заголовки',
        hint: 'В выдаче такие страницы не отличить друг от друга. Сделайте заголовки разными.',
      },
      'pages.orphans': {
        title: 'Страницы, до которых не дойти',
        hint: 'Скрыта из меню, на неё нет ссылок, и список родителя её не выводит: посетитель её не найдёт.',
      },
      'pages.long_title': {
        title: 'Длинные заголовки',
        hint: `Поисковики обрежут заголовок после ~${TITLE_LIMIT} знаков; вместе с названием сайта он ещё длиннее.`,
      },
      'media.no_alt': {
        title: 'Картинки без описания',
        hint: 'Описание читает читалка экрана и видит поисковик по картинкам. Опишите, что на картинке.',
      },
      'media.heavy': {
        title: 'Тяжёлые файлы',
        hint: 'Картинка больше мегабайта без уменьшенных копий или файл больше 10 МБ долго грузится на телефоне. Сожмите или загрузите заново.',
      },
      'settings.robots_block': {
        title: 'Поисковикам закрыт весь сайт',
        hint: 'В дополнительных строках robots.txt стоит «Disallow: /» для всех роботов. Сайт пропадёт из поиска.',
      },
      'settings.no_site_url': {
        title: 'Не задан адрес сайта',
        hint: 'Без него canonical, карта сайта и ссылки в письмах строятся по адресу запроса — за прокси он бывает внутренним.',
      },
      'settings.no_404': {
        title: 'Нет своей страницы 404',
        hint: 'Посетитель с неверного адреса видит голое «Not Found» без меню. Выберите страницу 404 в настройках.',
      },
      'settings.forms_silent': {
        title: 'Формы без уведомлений',
        hint: 'Заявки этих форм видно только в менеджере: ни Telegram, ни почта не настроены для них.',
      },
      'settings.undelivered': {
        title: 'Недоставленные уведомления',
        hint: 'Канал не принял сообщения — заявки или сбои могли пройти мимо. Ошибка канала — в настройках уведомлений.',
      },
      'settings.ai_search_off': {
        title: 'Сайт закрыт для ИИ-поиска',
        hint: 'Ответы ИИ-ассистентов не будут ссылаться на сайт. Если это не нарочно — включите в настройках поиска.',
      },
    },
    form: (title) => `Форма «${title}»`,
    homePage: 'Главная страница сайта',
    siteUrl: 'Адрес сайта',
    notFoundPage: 'Страница 404',
    notifications: 'Уведомления',
    aiSearch: 'ИИ-поиск',
    sameTitle: (others) => `таких ещё ${others}`,
    chars: (n) => _ru(n, 'знак', 'знака', 'знаков'),
    megabytes: 'МБ',
    kilobytes: 'КБ',
    checkFailed: (id) => `Проверка «${id}» не выполнилась`,
  },
};
