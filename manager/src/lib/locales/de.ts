import type { Dictionary } from '../i18n.ts';

// Строки менеджера на немецком: ключи — те же, что в ru.ts.
export var messages: Dictionary['messages'] = {
  'app.name': 'Eile',
  'app.updateAvailable': 'Version {version} ist verfügbar',
  'app.updateHint': 'Aktualisieren: cms update auf dem Server',
  'nav.pages': 'Seiten',
  'nav.more': 'Mehr',
  'nav.elements': 'Elemente',
  'nav.fields': 'Felder',
  'nav.settings': 'Einstellungen',
  'nav.users': 'Benutzer',
  'nav.siteShort': 'Website',
  'nav.signOut': 'Abmelden',
  'nav.help': 'Hilfe',
  'nav.backups': 'Sicherungen',
  'help.title': 'So arbeiten Sie mit der Website',
  'help.search': 'In der Hilfe suchen',
  'help.contents': 'Kapitel der Hilfe',
  'help.chapterStart': 'Erste Schritte',
  'help.chapterPages': 'Seiten',
  'help.chapterText': 'Text der Seite',
  'help.chapterMedia': 'Mediathek',
  'help.chapterForms': 'Formulare und Anfragen',
  'help.chapterStats': 'Statistik',
  'help.chapterAnalytics': 'Kundenanalyse',
  'help.chapterSpeed': 'Schneller arbeiten',
  'help.chapterKeys': 'Tastenkürzel',
  'help.chapterAccount': 'Ihr Konto',
  'help.chapterAdmin': 'Für Administratoren',
  'help.chapterTrouble': 'Wenn etwas schiefgeht',
  'help.nothing':
    'Dazu gibt es nichts in der Hilfe. Versuchen Sie ein anderes Wort oder öffnen Sie ein Kapitel im Inhaltsverzeichnis.',
  'nav.site': 'Website öffnen',
  'login.title': 'Anmeldung',
  'login.email': 'E-Mail',
  'login.password': 'Passwort',
  'login.submit': 'Anmelden',
  'login.forgot': 'Passwort vergessen?',
  'login.resetDone':
    'Passwort geändert. Melden Sie sich mit dem neuen Passwort an.',
  'forgot.title': 'Passwort zurücksetzen',
  'forgot.lead':
    'Wir senden Ihnen per E-Mail einen Link, über den Sie ein neues Passwort festlegen können.',
  'forgot.submit': 'Link anfordern',
  'forgot.sent':
    'Wenn diese E-Mail-Adresse im Manager hinterlegt ist, ist die Nachricht mit dem Link schon unterwegs. Der Link gilt 30 Minuten.',
  'forgot.unavailable':
    'Das Zurücksetzen per E-Mail ist nicht eingerichtet. Bitten Sie einen Administrator, ein neues Passwort festzulegen.',
  'forgot.toLogin': 'Zur Anmeldung',
  'reset.title': 'Neues Passwort',
  'reset.password': 'Neues Passwort',
  'reset.hint': 'Mindestens 10 Zeichen.',
  'reset.submit': 'Passwort speichern',
  'reset.invalid': 'Der Link ist abgelaufen oder wurde bereits verwendet.',
  'reset.again': 'Neue E-Mail anfordern',
  'setup.title': 'Erster Administrator',
  'setup.lead':
    'Es gibt noch keine Benutzer. Legen Sie ein Administratorkonto an.',
  'setup.name': 'Name',
  'setup.submit': 'Anlegen und anmelden',
  'setup.closed':
    'Der Manager ist bereits eingerichtet: Ein Administrator existiert. Melden Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort an.',
  'setup.toLogin': 'Zur Anmeldung',
  'setup.noToken':
    'Öffnen Sie den Einrichtungslink aus dem Serverprotokoll – er enthält das Token.',
  'pages.new': 'Neue Seite',
  'pages.newLink': 'Neuer Link',
  'pages.siteTree': 'Seiten der Website',
  'elements.overviewTitle': 'Website-Elemente',
  'blocks.removed': 'Block entfernt',
  'page.moreActions': 'Weitere Aktionen',
  'page.previewSaved':
    'Vorschau der gespeicherten Version – ungespeicherte Änderungen sind darin nicht enthalten',
  'users.makeAdmin': 'Zum Administrator machen',
  'users.makeEditor': 'Zum Redakteur machen',
  'pages.nestedInTrash':
    'Unterseiten, die mit dieser Seite im Papierkorb liegen',
  'page.trashBranchTitle': 'Bereich in den Papierkorb verschieben?',
  'page.trashBranchBody':
    'Die Unterseiten wandern mit in den Papierkorb und verschwinden von der Website. Wird der Bereich wiederhergestellt, kommen alle zurück. Unterseiten: {n}.',
  'password.newHint': 'Mindestens 10 Zeichen.',
  'password.lockHint':
    'Nach fünf Fehlversuchen wird die Anmeldung von diesem Computer für 15 Minuten gesperrt.',
  'plugins.enabledHint': 'Wirkt sofort, ohne „Speichern“.',
  'plugins.isOn': 'Läuft auf der Website',
  'plugins.isOff': 'Ausgeschaltet',
  'plugins.turnOn': 'Einschalten',
  'plugins.turnOff': 'Ausschalten',
  'page.inheritedFrom': 'Leer – übernommen von',
  'pages.newChild': 'Neue Unterseite',
  'pages.toEditor': 'Zum Editor',
  'tree.search': 'Seite suchen',
  'tree.toolbar': 'Aktionen für den Baum',
  'tree.newLink': 'Neuer Link',
  'tree.expandAll': 'Alle aufklappen',
  'tree.collapseAll': 'Alle zuklappen',
  'tree.refresh': 'Baum aktualisieren',
  'pages.legendTitle': 'Seite',
  'tree.searchHint':
    'Titel, Alias oder ID. Die Taste / setzt den Cursor hierher.',
  'tree.nothing': 'Nichts gefunden.',
  'tree.results': 'Gefundene Seiten',
  'tree.moved': 'Seite verschoben',
  'tree.duplicated': 'Kopie erstellt – sie ist noch nicht veröffentlicht',
  'tree.copySuffix': '(Kopie)',
  'tree.menu': 'Aktionen für die Seite',
  'tree.more': 'Aktionen',
  'tree.open': 'Öffnen',
  'tree.newChild': 'Unterseite anlegen',
  'tree.duplicate': 'Duplizieren',
  'tree.up': 'Nach oben',
  'tree.down': 'Nach unten',
  'tree.moveTo': 'Verschieben nach…',
  'tree.moveTitle': 'Seite verschieben',
  'tree.moveConfirm': 'Verschieben',
  'tree.parent': 'Neue übergeordnete Seite',
  'tree.onSite': 'Auf der Website öffnen',
  'tree.dragHint':
    'Ziehen Sie eine Seite auf eine Zeile, um sie dort unterzuordnen, oder an den Rand einer Zeile, um sie daneben einzuordnen. Mit der Tastatur: Shift+F10 öffnet das Seitenmenü, Alt mit Pfeil nach oben oder unten verschiebt die Seite. Leertaste, Strg+Klick oder Shift+Klick wählen mehrere Seiten für gemeinsame Aktionen aus.',
  'keys.space': 'Leertaste',
  'overview.title': 'Website-Übersicht',
  'overview.view': 'Ansicht',
  'overview.viewMap': 'Baum',
  'overview.viewTable': 'Tabelle',
  'overview.viewJournal': 'Protokoll',
  'journal.title': 'Änderungsprotokoll',
  'journal.hint':
    'Wer wann was mit Seiten gemacht hat — die letzten tausend Änderungen.',
  'journal.when': 'Wann',
  'journal.who': 'Wer',
  'journal.what': 'Was',
  'journal.page': 'Seite',
  'journal.gone': 'endgültig gelöscht (ID {id})',
  'overview.viewDiagnostics': 'Diagnose',
  'overview.problems': 'Probleme auf der Website',
  'diagnostics.title': 'Website-Diagnose',
  'diagnostics.problems': 'Gefundene Probleme',
  'diagnostics.none': 'Keine Probleme gefunden',
  'diagnostics.noneHint':
    'Links, Seiten, Mediathek und Einstellungen sind in Ordnung. Der Bericht wird nach jeder Änderung aktualisiert.',
  'diagnostics.checked': 'Geprüft',
  'diagnostics.took': '{n} ms',
  'diagnostics.refresh': 'Erneut prüfen',
  'diagnostics.fix': 'Beheben',
  'diagnostics.affected': 'Betroffen',
  'diagnostics.more': 'Angezeigt werden die ersten 100 von {n}',
  'diagnostics.group.links': 'Links',
  'diagnostics.group.pages': 'Seiten',
  'diagnostics.group.media': 'Mediathek',
  'diagnostics.group.settings': 'Einstellungen',
  'diagnostics.group.server': 'Server',
  'diagnostics.severity.error': 'Fehler',
  'diagnostics.severity.warning': 'Warnung',
  'diagnostics.severity.info': 'Hinweis',
  'table.caption':
    'Seiten der Website in Baumreihenfolge; Titel, Adresse, Menü, Vorlage und Veröffentlichung lassen sich direkt in der Zeile bearbeiten',
  'pager.label': 'Seiten der Liste',
  'pager.range': '{from}–{to} von {total}',
  'pager.prev': 'Vorherige Seite',
  'pager.next': 'Nächste Seite',
  'pager.page': 'Seite {n}',
  'pager.size': 'Anzeigen',
  'pager.all': 'alle',
  'table.inside': 'Im Bereich',
  'table.template': 'Vorlage oder Typ',
  'table.inMenu': 'Im Menü',
  'table.notInMenu': 'Dateien erscheinen nicht im Menü',
  'table.open': 'Seite öffnen',
  'table.hint':
    'Eine Änderung wird gespeichert, sobald Sie das Feld verlassen. Enter – zur selben Spalte eine Zeile tiefer, Esc – abbrechen.',
  'overview.map': 'Website-Karte',
  'overview.filter': 'Auf der Karte zeigen',
  'overview.recent': 'Letzte Änderungen',
  'overview.noRecent':
    'Noch keine Änderungen. Hier erscheinen Änderungen an Seiten: was geändert wurde, von wem und wann.',
  'overview.attention': 'Zu erledigen',
  'overview.allDrafts': 'Alle Entwürfe auf der Karte',
  'overview.hidden': 'weitere Unterseiten: {n}',
  'overview.emptyMap':
    'Die Website hat noch keine Seiten. Beginnen Sie mit der Startseite – alle weiteren werden ihr untergeordnet.',
  'overview.firstPage': 'Startseite anlegen',
  'activity.created': 'Erstellt',
  'activity.edited': 'Bearbeitet',
  'activity.published': 'Veröffentlicht',
  'activity.unpublished': 'Zurückgezogen',
  'activity.moved': 'Verschoben',
  'activity.trashed': 'In den Papierkorb',
  'activity.restored': 'Wiederhergestellt',
  'activity.duplicated': 'Kopie',
  'overview.site': 'Website',
  'overview.published': 'Veröffentlicht',
  'overview.draftsCount': 'Entwürfe',
  'overview.scheduledCount': 'Geplant',
  'overview.trashed': 'Im Papierkorb',
  'overview.noScheduled':
    'Keine Seite wartet auf eine geplante Veröffentlichung.',
  'overview.noDrafts': 'Keine Entwürfe – alles ist veröffentlicht.',
  'overview.counts': 'Veröffentlicht:',
  'overview.drafts': 'Entwürfe:',
  'overview.scheduled': 'geplant:',
  'overview.scheduledTitle': 'Geplante Veröffentlichungen',
  'overview.draftsTitle': 'Entwürfe',
  'overview.allPublished':
    'Alles ist veröffentlicht. Wählen Sie eine Seite im Baum, um sie zu bearbeiten.',
  'overview.empty': 'Noch keine Seiten – legen Sie die erste an.',
  'pages.empty': 'Wählen Sie eine Seite im Baum oder legen Sie eine neue an.',
  'pages.root': 'Oberste Ebene',
  'pages.draft': 'Entwurf',
  'pages.published': 'Veröffentlicht',
  'pages.trashed': 'Im Papierkorb',
  'pages.scheduled': 'Geplant',
  'pages.hidden': 'Im Menü ausgeblendet',
  'pages.trash': 'Papierkorb',
  'pages.emptyTrash': 'Papierkorb leeren',
  'pages.showTrash': 'Papierkorb anzeigen',
  'pages.expand': 'Aufklappen',
  'pages.collapse': 'Zuklappen',
  'pages.emptyTrashTitle': 'Endgültig löschen?',
  'pages.emptyTrashBody':
    'Die Seiten und alles, was darin liegt, werden unwiderruflich gelöscht.',
  'pages.emptyTrashConfirm': 'Endgültig löschen',
  'pages.trashEmptied': 'Papierkorb geleert',
  'pages.trashEmpty': 'Der Papierkorb ist leer',
  'pages.legend': 'Legende',
  'page.title': 'Titel',
  'page.alias': 'Alias',
  'page.aliasHint': 'Leer – aus dem Titel',
  'page.template': 'Vorlage',
  'page.longTitle': 'Langer Titel',
  'page.menuTitle': 'Menütitel',
  'page.description': 'Beschreibung',
  'page.introText': 'Zusammenfassung',
  'page.content': 'Inhalt',
  'page.kind': 'Art',
  'page.kindPage': 'Seite',
  'page.kindLink': 'Link',
  'page.linkTo': 'Linkziel',
  'page.linkHint': 'https://…, /pfad oder Seiten-ID',
  'page.parent': 'Übergeordnete Seite',
  'page.menuIndex': 'Position im Menü',
  'page.hiddenFromMenu': 'Im Menü ausblenden',
  'page.cacheable': 'Cachen',
  'page.publishAt': 'Veröffentlichen am',
  'page.unpublishAt': 'Zurückziehen am',
  'page.fields': 'Seitenfelder',
  'page.main': 'Allgemein',
  'page.seo': 'Für Suche und Menü',
  'page.publishing': 'Veröffentlichung',
  'page.save': 'Speichern',
  'page.saved': 'Gespeichert',
  'page.publish': 'Veröffentlichen',
  'page.unpublish': 'Zurückziehen',
  'page.toTrash': 'In den Papierkorb',
  'page.restore': 'Wiederherstellen',
  'page.preview': 'Vorschau',
  'page.open': 'Auf der Website öffnen',
  'page.created': 'Seite angelegt',
  'page.duplicateSaveFirst':
    'Speichern Sie zuerst Ihre Änderungen – die Kopie entsteht aus der gespeicherten Seite',
  'page.longTitleHint':
    'Für den Fenstertitel und <h1>, falls er vom Titel abweicht.',
  'page.descriptionHint': 'Für Suchmaschinen: meta description.',
  'page.introHint': 'Kurzer Text für Listen und Übersichten.',
  'page.kindHint':
    'Ein Link zeigt keinen eigenen Inhalt, sondern führt zu einer anderen Adresse.',
  'page.contentType': 'Inhaltstyp',
  'page.contentTypeHint':
    'HTML wird über die Vorlage erzeugt. Andere Typen sind Dateien: Die Website liefert den Text unverändert aus, ohne Vorlage, und zeigt ihn nicht im Menü.',
  'page.contentTypeOther': 'Anderer Typ…',
  'page.contentTypeLocked':
    'Typ und Text dieser Datei ändert nur ein Administrator: Der Browser führt darin Skripte aus.',
  'page.contentTypeAdminOnly': 'nur für Administratoren',
  'page.contentTypeCustom': 'MIME-Typ',
  'page.contentTypeCustomHint':
    'Zum Beispiel text/vcard oder application/ld+json.',
  'page.fileContent': 'Dateiinhalt',
  'page.fileContentHint':
    'Wird unverändert ausgeliefert. Es funktionieren Links [~id~], {i18n.key}, [@key] und Komponenten [[Name]].',
  'contentType.html': 'HTML – Seite mit Vorlage',
  'contentType.plain': 'Text',
  'contentType.markdown': 'Markdown',
  'contentType.css': 'CSS',
  'contentType.javascript': 'JavaScript',
  'contentType.json': 'JSON',
  'contentType.xml': 'XML',
  'contentType.rss': 'RSS-Feed',
  'contentType.atom': 'Atom-Feed',
  'contentType.svg': 'SVG',
  'contentType.csv': 'CSV',
  'contentType.calendar': 'iCalendar-Kalender',
  'contentType.manifest': 'Web-App-Manifest',
  'page.menuIndexHint':
    'Kleiner – weiter oben unter den Nachbarseiten; einfacher ist Ziehen im Baum.',
  'page.cacheableHint':
    'Die fertige Seite bleibt im Speicher und wird sofort ausgeliefert, ohne neu erzeugt zu werden, bis sie geändert wird.',
  'page.tabs': 'Abschnitte der Seite',
  'page.tabDocument': 'Dokument',
  'page.tabFields': 'Felder',
  'page.tabSettings': 'Einstellungen',
  'page.tabSeo': 'Suche & Social',
  'page.tabHistory': 'Verlauf',
  'history.intro':
    'So sah die Seite vor jeder Änderung aus. Änderungen einer Person innerhalb von 10 Minuten ergeben eine Version; gespeichert werden die letzten 30, bei langen Seiten so viele, wie in 512 KB passen, aber mindestens 5.',
  'history.empty':
    'Noch keine Änderungen. Eine Version entsteht, wenn Text, Titel, Adresse, Vorlage oder Felder geändert werden; die ersten 10 Minuten nach dem Anlegen einer Seite zählen noch zur Erstellung.',
  'history.list': 'Versionen der Seite',
  'history.site': 'Website',
  'history.restoredFrom': 'Zurück zur Version vom {when}',
  'history.before': 'Vor der Änderung vom {when}',
  'history.inVersion': 'In der Version',
  'history.now': 'Jetzt',
  'history.what': 'Was',
  'history.same': 'Stimmt mit der aktuellen Seite überein.',
  'history.markupOnly':
    'Der Text ist gleich – nur das Markup hat sich geändert.',
  'history.unchanged': 'Unverändert',
  'history.restore': 'Diese Version wiederherstellen',
  'history.restoreTitle': 'Version wiederherstellen?',
  'history.restoreBody':
    'Die Seite erhält wieder den Stand vor der Änderung vom',
  'history.restoreKeeps':
    'Der jetzige Stand bleibt im Verlauf – Sie können zu ihm zurückkehren.',
  'history.restoreUnsaved':
    'Ungespeicherte Änderungen an der Seite gehen verloren.',
  'history.restoreConfirm': 'Wiederherstellen',
  'history.restoredNotice': 'Version wiederhergestellt',
  'history.unsaved':
    'Die Seite hat ungespeicherte Änderungen: Verglichen wird mit der gespeicherten Version, und das Wiederherstellen verwirft sie.',
  'history.yes': 'ja',
  'history.no': 'nein',
  'page.titlePlaceholder': 'Seitentitel',
  'page.address': 'Adresse',
  'page.addressHint':
    'Wird aus dem Titel gebildet, solange Sie die Adresse nicht von Hand ändern. Kleinbuchstaben a–z ohne Umlaute, Ziffern und Bindestriche, bei Dateien mit Endung: feed.xml.',
  'page.linkToHint':
    'Besucher gelangen direkt dorthin; die Seite zeigt keinen eigenen Text.',
  'page.place': 'Einordnung',
  'page.templateHint':
    'Die Vorlage bestimmt, wie die Seite aussieht und welche Felder sie hat.',
  'page.menu': 'Menü',
  'page.menuTitleHint': 'Kürzer als der Titel, falls nötig. Leer – der Titel.',
  'page.hiddenHint':
    'Die Seite ist über ihre Adresse erreichbar, steht aber nicht im Menü.',
  'page.sectionKind': 'Art, Typ und Sprache',
  'page.sectionKindOnly': 'Art und Typ',
  'page.unpublishAtHint': 'Später als „Veröffentlichen am“.',
  'page.sectionKindHint':
    'Eine normale Seite, eine Datei wie CSS oder ein RSS-Feed oder ein Link auf eine andere Adresse.',
  'page.sectionSchedule': 'Zeitgesteuerte Veröffentlichung',
  'page.sectionScheduleHint':
    'Die Seite wird zur angegebenen Zeit von selbst veröffentlicht und zurückgezogen. Leer – von Hand.',
  'page.sectionCache': 'Caching',
  'page.sectionCacheHint':
    'Normalerweise eingeschaltet. Schalten Sie es aus, wenn die Seite Inhalte zeigt, die sich von Aufruf zu Aufruf ändern.',
  'page.sectionAddress': 'Adressen',
  'page.sectionAddressHint':
    'Wie diese Seite und ihre Unterseiten zu ihren Adressen kommen. Meist unverändert lassen: So bleiben die Adressen einer von Evo umgezogenen Website erhalten.',
  'page.folder': 'Ordner',
  'page.folderHint':
    'Enden Ordneradressen laut Website-Einstellungen auf /, endet auch die Adresse dieser Seite auf /: /katalog/. Wird von selbst gesetzt, sobald die Seite eine Unterseite bekommt.',
  'page.aliasInPath': 'Alias in Adressen der Unterseiten',
  'page.aliasInPathHint':
    'Aus – Unterseiten stehen ohne diesen Alias in der Adresse: /cities/riga/ → /riga/. Die Adresse der Seite selbst bleibt gleich.',
  'page.fieldsIntro': 'Zusatzfelder, die die Vorlage ausgibt',
  'page.language': 'Sprache',
  'page.languageInherit': 'Wie übergeordnete Seite',
  'page.languageHint':
    'Sprache des Zweigs: Unterseiten übernehmen sie, Übersetzungen {i18n.…} werden in dieser Sprache ausgegeben.',
  'page.sectionTranslations': 'Übersetzungen',
  'page.sectionTranslationsHint':
    'Seiten mit demselben Inhalt in verschiedenen Sprachen: Verknüpft erhalten Suchmaschinen hreflang-Links, und eine Vorlage kann einen Sprachumschalter zeichnen.',
  'page.translationOf': 'Übersetzung von',
  'page.translationNone': 'Keine Übersetzung',
  'page.translationOfHint':
    'Wählen Sie die Ausgangsseite, meist in der Hauptsprache der Website. Eine Übersetzung einer Übersetzung kommt in dieselbe Gruppe.',
  'page.translations': 'Übersetzungsgruppe',
  'page.translationOriginal': 'Original',
  'seo.title': 'Titel für Suchmaschinen',
  'seo.description': 'Beschreibung für Suchmaschinen',
  'seo.titleHint':
    'Vollständiger Titel: in den Suchergebnissen, im Browser-Tab und als Überschrift auf der Seite, falls die Vorlage ihn ausgibt. Am besten bis 60 Zeichen.',
  'seo.descriptionHint':
    'Text unter dem Titel in den Suchergebnissen und bei KI-Diensten; am besten bis 160 Zeichen.',
  'seo.searchable': 'In Suche und KI zeigen',
  'seo.searchableHint':
    'Schalten Sie das für Hilfsseiten aus: Diese erhalten noindex und fehlen in sitemap.xml und llms.txt.',
  'seo.socialImage': 'Bild für soziale Netzwerke',
  'seo.socialImageHint':
    'Leer – das Website-Bild aus den Einstellungen wird verwendet. Am besten 1200×630.',
  'seo.previews': 'So sieht die Seite nach außen aus',
  'seo.searchPreview': 'In der Suche',
  'seo.socialPreview': 'In sozialen Netzwerken und Messengern',
  'seo.noDescription':
    'Keine Beschreibung – die Suchmaschine nimmt einen Ausschnitt aus dem Seitentext.',
  'seo.noImage': 'Kein Bild',
  'seo.hiddenFromSearch': 'Für Suchmaschinen verborgen: noindex',
  'seo.oldPaths': 'Alte Adressen',
  'seo.oldPathsHint':
    'Über diese Adressen gelangen Besucher und Suchmaschinen per 301-Weiterleitung hierher.',
  'seo.forget': 'Adresse entfernen',
  'page.notSaved': 'Neu, noch nicht gespeichert',
  'page.advanced': 'Erweitert',
  'page.publishHint': 'Speichert die Änderungen und veröffentlicht',
  'page.publishNow': 'Jetzt veröffentlichen',
  'page.publishNowTitle': 'Vorzeitig veröffentlichen?',
  'page.publishNowBody':
    'Die Seite ist geplant; der Zeitplan wird verworfen, und sie erscheint sofort auf der Website. Geplant war: {when}.',
  'page.publishLater': 'Veröffentlichung planen',
  'page.unpublishOn': 'Wird zurückgezogen am {when}',
  'page.unpublishLater': 'Zurückziehen planen',
  'page.changeSchedule': 'Ändern',
  'page.inTrashSection':
    'Der Bereich dieser Seite liegt im Papierkorb, deshalb ist sie nicht auf der Website. Um die Seite zu bearbeiten, stellen Sie diesen Bereich wieder her:',
  'page.toSection': 'Zum Bereich',
  'page.inTrash':
    'Die Seite liegt im Papierkorb und ist nicht auf der Website. Stellen Sie sie wieder her, um sie zurückzuholen.',
  'page.publishedNotice': 'Veröffentlicht',
  'page.unpublishedNotice': 'Veröffentlichung zurückgezogen',
  'page.trashedNotice': 'In den Papierkorb verschoben',
  'page.restoredNotice': 'Wiederhergestellt',
  'page.status': 'Status',
  'page.scheduledFor': 'Erscheint am {when}',
  'page.publishedOn': 'Veröffentlicht am {when}',
  'page.inherits': 'Wird von der übergeordneten Seite übernommen, wenn leer.',
  'page.defaultIs': 'Standard:',
  'page.notFound':
    'Diese Seite gibt es nicht – vielleicht wurde sie aus dem Papierkorb gelöscht.',
  'page.toTree': 'Zum Baum',
  'elements.templates': 'Vorlagen',
  'elements.template': 'Vorlage',
  'elements.component': 'Komponente',
  'elements.notFound': 'Dieses Element gibt es nicht.',
  'elements.toList': 'Zur Liste',
  'elements.components': 'Komponenten',
  'elements.new': 'Neu',
  'elements.newTemplate': 'Neue Vorlage',
  'elements.newComponent': 'Neue Komponente',
  'elements.scripts': 'Skripte',
  'elements.script': 'Skript',
  'elements.newScript': 'Neues Skript',
  'elements.scriptNameHint':
    'Kleinbuchstaben a–z, Ziffern und Bindestriche: kitchen-stage.',
  'elements.create': 'Erstellen',
  'elements.name': 'Name (PascalCase)',
  'elements.nameHint':
    'Buchstaben A–Z ohne Umlaute, am Anfang ein Großbuchstabe: Header, BlogCard.',
  'elements.taken': 'Dieser Name ist bereits vergeben.',
  'elements.openExisting': 'Öffnen',
  'elements.revision': 'Revision',
  'elements.remove': 'Löschen',
  'elements.removeTitle': 'Element löschen?',
  'elements.removeBody':
    'Es wird nirgends verwendet. Gelöschtes lässt sich nicht wiederherstellen.',
  'elements.removed': 'Element gelöscht',
  'elements.inUse': 'Löschen nicht möglich: verwendet in',
  'elements.openPlace': 'Öffnen',
  'elements.inUseTrash':
    'Auch Seiten im Papierkorb verwenden das Element: Leeren Sie den Papierkorb oder stellen Sie die Seiten wieder her und entfernen Sie das Element.',
  'pages.inTrashShort': 'im Papierkorb',
  'media.usedOn': 'Die Datei wird verwendet:',
  'media.usedBySite': 'Website-Bild für soziale Netzwerke',
  'media.unused':
    'Die Datei wird nirgends verwendet. Ihre Größenvarianten werden ebenfalls gelöscht.',
  'plugins.remove': 'Plugin löschen',
  'plugins.removeTitle': 'Plugin löschen?',
  'plugins.removeBody':
    'Seine Hooks wirken sofort nicht mehr. Gelöschtes lässt sich nicht wiederherstellen.',
  'plugins.removed': 'Plugin gelöscht',
  'common.andMore': 'und {n} weitere',
  'elements.notFoundPlugin': 'Dieses Plugin gibt es nicht.',
  'elements.empty':
    'Wählen Sie links im Baum ein Element oder legen Sie mit „+“ an einer Gruppe ein neues an.',
  'elements.aboutTemplates':
    'Svelte-Komponenten, die eine ganze Seite rendern.',
  'elements.aboutComponents':
    'Teile von Vorlagen und Inhaltsblöcke: Import $components/Name.',
  'elements.aboutPlugins':
    'TypeScript-Module mit den Hooks render, notFound, handle (eigene Antwort auf eine Anfrage) und schedule (geplanter Auftrag) sowie Abonnements auf Ereignisse.',
  'elements.aboutFields':
    'Zusatzfelder für Seiten, werden Vorlagen zugewiesen.',
  'elements.aboutScripts':
    'ES-Module für den Browser: Eine Vorlage bindet sie mit script(name) ein, untereinander importieren sie sich als ./name.js.',
  'plugins.one': 'Plugin',
  'nav.forms': 'Formulare',
  'inbox.title': 'Anfragen',
  'inbox.all': 'Alle Anfragen',
  'inbox.unread': 'Neu',
  'inbox.today': 'Heute',
  'inbox.week': 'Letzte 7 Tage',
  'inbox.daily': 'Anfragen der letzten 14 Tage',
  'inbox.new': 'Ungelesen',
  'inbox.emptyBell':
    'Noch keine Anfragen. Ein Formular kommt mit dem Block „Formular“ oder dem Tag [#Form:name] auf eine Seite.',
  'inbox.list': 'Liste der Anfragen',
  'inbox.card': 'Anfrage',
  'inbox.form': 'Formular',
  'inbox.allForms': 'Alle Formulare',
  'inbox.search': 'In Anfragen suchen',
  'inbox.status': 'Status',
  'inbox.statusAll': 'Alle',
  'inbox.statusNew': 'Neu',
  'inbox.statusWork': 'In Bearbeitung',
  'inbox.statusDone': 'Erledigt',
  'inbox.statusSpam': 'Spam',
  'inbox.empty':
    'Noch keine Anfragen – sie erscheinen hier, sobald ein Besucher ein Formular absendet.',
  'inbox.nothing': 'Keine Anfragen für diese Filter.',
  'inbox.pick':
    'Wählen Sie links eine Anfrage – mit den Tasten j und k blättern Sie durch die Liste.',
  'inbox.csv': 'CSV herunterladen',
  'inbox.call': 'Anrufen',
  'inbox.write': 'Schreiben',
  'inbox.context': 'Herkunft',
  'inbox.page': 'Seite',
  'inbox.referrer': 'Kam von',
  'inbox.browser': 'Browser',
  'inbox.proof': 'Spamschutz',
  'inbox.proofMissing':
    'Ohne JavaScript gesendet und nicht geprüft, deshalb liegt die Anfrage im Spam.',
  'inbox.deliveries': 'Benachrichtigungen',
  'inbox.deliverySent': 'zugestellt',
  'inbox.deliveryFailed': 'nicht zugestellt',
  'inbox.deliveryPending': 'wartet auf Versand',
  'inbox.noDeliveries':
    'Keine Benachrichtigungen: Es sind keine Kanäle eingerichtet.',
  'inbox.spamNoNotice':
    'Sieht nach Spam aus – es wurde keine Benachrichtigung gesendet.',
  'inbox.confirmation': 'E-Mail an den Absender',
  'inbox.webhook': 'Webhook',
  'inbox.note': 'Notiz',
  'inbox.notePlaceholder':
    'Zum Beispiel: zurückgerufen, Antwort bis Freitag erwartet',
  'inbox.saveNote': 'Notiz speichern',
  'inbox.saved': 'Anfrage gespeichert',
  'inbox.resent': 'Benachrichtigung wird erneut gesendet',
  'inbox.webhookResent': 'Anfrage wird erneut an den Webhook gesendet',
  'inbox.remove': 'Löschen',
  'inbox.removeTitle': 'Anfrage löschen?',
  'inbox.removeBody':
    'Die Anfrage mit den persönlichen Daten des Besuchers wird endgültig gelöscht.',
  'forms.title': 'Formulare',
  'forms.new': 'Neues Formular',
  'forms.newTitle': 'Neues Formular',
  'forms.create': 'Erstellen',
  'forms.titleLabel': 'Bezeichnung',
  'forms.titleHint':
    'Zum Beispiel: „Rückruf“. Der Name für das Tag wird aus der Bezeichnung gebildet.',
  'forms.empty':
    'Noch keine Formulare. Beginnen Sie mit einem fertigen Formular: Name, Telefon, Kommentar und Einwilligung.',
  'forms.fieldsCount': '{n} Feld|{n} Felder',
  'forms.changed': 'geändert {when}',
  'forms.copyTag': 'Tag für die Seite kopieren',
  'forms.removed': 'Formular gelöscht',
  'formsBlock.title': 'Formular',
  'formsBlock.choose': 'Welches Formular',
  'formsBlock.edit': 'Formular bearbeiten',
  'formsBlock.missing': 'nicht vorhanden',
  'formsBlock.missingHint':
    'Dieses Formular gibt es nicht – wählen Sie ein anderes oder legen Sie es unter „Formulare“ an.',
  'formsBlock.none':
    'Noch keine Formulare – legen Sie das erste unter „Formulare“ an.',
  'formEditor.tabFields': 'Felder',
  'formEditor.tabAfter': 'Nach dem Absenden',
  'formEditor.tabNotify': 'Benachrichtigungen',
  'formEditor.tabProtect': 'Schutz und Speicherung',
  'formEditor.tabIntegrations': 'Integrationen',
  'formEditor.save': 'Speichern',
  'formEditor.saved': 'Formular gespeichert',
  'formEditor.remove': 'Löschen',
  'formEditor.removeTitle': 'Formular löschen:',
  'formEditor.removeBody':
    'Die Anfragen des Formulars bleiben unter „Anfragen“ und werden 30 Tage nach Eingang automatisch gelöscht.',
  'formEditor.removeUsedBody':
    'Das Formular steht auf diesen Seiten und verschwindet von dort. Die Anfragen des Formulars bleiben unter „Anfragen“ und werden 30 Tage nach Eingang automatisch gelöscht.',
  'formEditor.add': 'Zum Formular hinzufügen',
  'formEditor.textBlock': 'Text',
  'formEditor.stepBlock': 'Schritt',
  'formEditor.stepNumber': 'Schritt {n}',
  'formEditor.stepTitle': 'Titel des Schritts',
  'formEditor.stepHint':
    'Die Felder darunter, bis zum nächsten Schritt, sieht der Besucher auf einer eigenen Seite mit „Zurück“ und „Weiter“. Ein Schritt ohne Titel beendet die Schritte: Alles darunter ist wieder immer sichtbar. Ohne JavaScript erscheint das Formular vollständig.',
  'formEditor.stepsEnd': 'Ende der Schritte',
  'formEditor.pickedStep':
    'Schritt {name} mit allem, was darin ist, aufgenommen, Position {n} von {total}. Pfeil nach oben und unten verschieben ihn hinter den nächsten Schritt, Leertaste legt ihn ab, Esc stellt ihn zurück.',
  'formEditor.movedInStep': '{name}: Position {n} von {total}, Schritt {step}',
  'formEditor.droppedInStep':
    'Abgelegt: {name}, Position {n} von {total}, Schritt {step}',
  'formEditor.showIf': 'Anzeigen, wenn das Feld',
  'formEditor.showAlways': 'Immer',
  'formEditor.showValues': 'gleich',
  'formEditor.showValuesHint':
    'Werte durch Kommas getrennt; leer bedeutet: Das Feld ist ausgefüllt oder angehakt. Ein ausgeblendetes Feld wird nicht geprüft und kommt nicht in die Anfrage.',
  'formEditor.accept': 'Dateitypen',
  'formEditor.acceptHint':
    'Endungen und Typen durch Kommas getrennt; leer bedeutet: beliebig.',
  'formEditor.maxSize': 'Höchstens, MB',
  'formEditor.maxSizeHint': 'Bis 20 MB pro Datei; leer bedeutet 10.',
  'formEditor.multiple': 'Mehrere Dateien erlaubt',
  'formEditor.textHint': 'Überschrift oder Erläuterung für Besucher',
  'formEditor.preview': 'So sieht das Formular für Besucher aus',
  'formEditor.untitled': 'Ohne Beschriftung',
  'formEditor.label': 'Beschriftung',
  'formEditor.name': 'Feldname',
  'formEditor.nameHint':
    'Buchstaben ohne Umlaute, Ziffern und _: Unter diesem Namen erscheint das Feld in der Anfrage und im E-Mail-Betreff – {Feldname}.',
  'formEditor.nameTaken': 'Diesen Namen gibt es in diesem Formular bereits.',
  'formEditor.kind': 'Typ',
  'formEditor.required': 'Pflichtfeld',
  'formEditor.placeholder': 'Platzhalter',
  'formEditor.selectPlaceholder': 'Erste Zeile der Liste',
  'formEditor.options': 'Optionen',
  'formEditor.optionsHint':
    'Eine pro Zeile. Um einen anderen Wert zu speichern: „wert | Beschriftung“.',
  'formEditor.min': 'Mindestens',
  'formEditor.max': 'Höchstens',
  'formEditor.step': 'Schrittweite',
  'formEditor.maxLength': 'Länge (Zeichen)',
  'formEditor.pattern': 'Muster',
  'formEditor.patternHint':
    'Regulärer Ausdruck nach HTML5 – Browser und Server prüfen damit. Wählen Sie einen fertigen aus der Liste.',
  'formEditor.consentHint':
    'Wörter in {geschweiften Klammern} werden zum Link auf die Seite unten.',
  'formEditor.consentPage': 'Datenschutzseite',
  'formEditor.noPage': 'Keine',
  'formEditor.source': 'Herkunft des Werts',
  'formEditor.sourceConstant': 'Fester Wert',
  'formEditor.sourceKey': 'Name',
  'formEditor.value': 'Wert',
  'formEditor.hiddenHint':
    'Besucher sehen das Feld nicht. Werte der Seite und der Website setzt der Server selbst ein – sie lassen sich nicht fälschen.',
  'formEditor.valueLabels': 'Beschriftungen der Werte',
  'formEditor.valueLabelsHint':
    'Eine pro Zeile: „wert | Beschriftung“. E-Mails, Benachrichtigungen, die Anfrage und die CSV zeigen statt des Werts die Beschriftung; ein Wert ohne Beschriftung erscheint unverändert.',
  'formEditor.hint': 'Hinweis unter dem Feld',
  'formEditor.message': 'Fehlertext',
  'formEditor.messagePlaceholder': 'Leer – Standardtext von Browser und Server',
  'formEditor.kindText': 'Textzeile',
  'formEditor.kindEmail': 'E-Mail',
  'formEditor.kindTel': 'Telefon',
  'formEditor.kindUrl': 'Link',
  'formEditor.kindNumber': 'Zahl',
  'formEditor.kindDate': 'Datum',
  'formEditor.kindTime': 'Uhrzeit',
  'formEditor.kindDateTime': 'Datum und Uhrzeit',
  'formEditor.kindRange': 'Schieberegler',
  'formEditor.kindTextarea': 'Mehrzeiliger Text',
  'formEditor.kindSelect': 'Auswahlliste',
  'formEditor.kindRadio': 'Einfachauswahl',
  'formEditor.kindCheckbox': 'Mehrfachauswahl',
  'formEditor.kindConsent': 'Einwilligung',
  'formEditor.kindFile': 'Datei',
  'formEditor.kindHidden': 'Verstecktes Feld',
  'formEditor.afterTitle': 'Nach dem Absenden',
  'formEditor.afterHint':
    'Was Besucher sehen, wenn das Formular abgeschickt ist, und wie es in der Analyse markiert wird.',
  'formEditor.title': 'Bezeichnung des Formulars',
  'formEditor.submitLabel': 'Text der Schaltfläche',
  'formEditor.successText': '„Danke“-Text',
  'formEditor.successTextHint':
    'Eigenes Markup – Überschrift, Links, Schaltflächen – kommt als Block <template data-sent>…</template> in das HTML des Formulars und ersetzt diesen Text.',
  'formEditor.successPage': 'Oder zu einer Seite weiterleiten',
  'formEditor.successPageHint':
    'Eine „Danke“-Seite eignet sich gut für Analyseziele.',
  'formEditor.goal': 'Kennung für die Analyse',
  'formEditor.goalHint':
    'Wird im Ereignis cms:form-sent mitgegeben: Ein Ziel an Matomo oder GA senden Sie mit einem eigenen Skript.',
  'formEditor.notifyTitle': 'Benachrichtigungen über Anfragen',
  'formEditor.notifyHint':
    'Wohin die Anfrage geht und wie die Nachricht heißt.',
  'formEditor.subject': 'Betreff',
  'formEditor.subjectHint':
    '{form} – Bezeichnung des Formulars, {Feldname} – sein Wert: „Rückruf: {name}“.',
  'formEditor.channelsDefault': 'Kanäle – wie in den Einstellungen',
  'formEditor.channelsDefaultHint':
    'Anfragen folgen der Zuordnung unter „Einstellungen → Benachrichtigungen“.',
  'formEditor.channels': 'Eigene Kanäle dieses Formulars',
  'formEditor.channelsSettings': 'Telegram und E-Mail einrichten',
  'formEditor.confirmTitle': 'E-Mail an den Absender',
  'formEditor.confirmHint':
    'Eine Bestätigung an die Adresse aus der Anfrage: „Vielen Dank, Ihre Bestellung ist eingegangen.“ Sie wird über die E-Mail aus „Einstellungen → Benachrichtigungen“ gesendet, nur für Anfragen, die alle Prüfungen bestanden haben, und höchstens einmal pro Adresse in 10 Minuten.',
  'formEditor.confirmEnabled': 'E-Mail an den Absender senden',
  'formEditor.confirmField': 'Adresse aus dem Feld',
  'formEditor.confirmFieldDefault': 'Das erste E-Mail-Feld',
  'formEditor.confirmNoField':
    'Das Formular hat kein E-Mail-Feld: Fügen Sie eines hinzu oder wählen Sie das Feld mit der Adresse.',
  'formEditor.confirmSubject': 'Betreff',
  'formEditor.confirmSubjectHint':
    'Leer bedeutet den Namen des Formulars. {form} und {Feldname} wie im Betreff der Benachrichtigung.',
  'formEditor.confirmText': 'E-Mail-Text',
  'formEditor.confirmTextHint':
    'Reiner Text ohne Formatierung. {form} ist der Name des Formulars, {Feldname} der Wert des Feldes: „Guten Tag, {name}!“',
  'formEditor.protectTitle': 'Spamschutz',
  'formEditor.protectHint':
    'Bot-Falle, Einmal-Token und Sendelimit wirken immer; hier steht, was vom Formular abhängt.',
  'formEditor.minSeconds': 'Frühestens nach (Sekunden)',
  'formEditor.minSecondsHint': 'Schneller füllen nur Bots aus.',
  'formEditor.allowLinks': 'Links in Feldern sind kein Spam',
  'formEditor.allowLinksHint':
    'Für Formulare, über die Links zu einem Portfolio oder einer Website geschickt werden.',
  'formEditor.proof': 'Prüfung im Browser',
  'formEditor.proofHint':
    'Der Browser löst unbemerkt eine kleine Rechenaufgabe, während das Formular ausgefüllt wird – ohne Captcha, Cookies oder fremden Dienst. Die Zeiten sind Mittelwerte auf einem Mittelklasse-Smartphone, ein Computer ist um ein Vielfaches schneller. Eine Anfrage aus einem Browser ohne JavaScript landet markiert im Spam.',
  'formEditor.proofOff': 'Aus',
  'formEditor.proofLight': 'Leicht – etwa 0,05 s auf dem Smartphone',
  'formEditor.proofStandard': 'Standard – etwa 0,2 s auf dem Smartphone',
  'formEditor.proofStrong': 'Stark – etwa 0,4 s auf dem Smartphone',
  'formEditor.proofOffHint':
    'Aus – Bot-Falle, Einmal-Token und Mindestzeit bleiben. Einen Bot, der das Formular ohne Browser absendet, erkennen sie nicht immer.',
  'formEditor.storeTitle': 'Aufbewahrung der Anfragen',
  'formEditor.storeHint':
    'Anfragen mit personenbezogenen Daten werden nach Ablauf der Frist gelöscht – so verlangt es die DSGVO.',
  'formEditor.retention': 'Aufbewahrung (Tage)',
  'formEditor.storeClientInfo':
    'IP-Adresse und Browser des Besuchers speichern',
  'formEditor.storeClientInfoHint':
    'Sie stehen bei der Anfrage und im CSV und helfen, Spam zu erkennen. Schalten Sie es aus, wenn die Datenschutzerklärung zusagt, keine IP-Adressen zu speichern.',
  'formEditor.storeClientInfoOffHint':
    'Anfragen werden ohne IP-Adresse und Browser gespeichert; Benachrichtigungen und Webhook enthalten sie ohnehin nicht. Das Sendelimit pro Adresse wirkt weiter: Die Adresse bleibt nur im Arbeitsspeicher des Servers und wird nicht in die Datenbank geschrieben.',
  'formEditor.webhookTitle': 'Webhook',
  'formEditor.webhookHint':
    'Jede angenommene Anfrage geht als JSON an diese Adresse, zum Beispiel an ein CRM. Spam wird nicht gesendet; eine fehlgeschlagene Zustellung wird bis zu fünfmal wiederholt, das Ergebnis steht bei der Anfrage.',
  'formEditor.webhookUrl': 'Adresse',
  'formEditor.webhookUrlHint':
    'https://…; leer lassen, um den Webhook abzuschalten. http:// nur für localhost.',
  'formEditor.webhookSecret': 'Signaturschlüssel',
  'formEditor.webhookSecretHint':
    'Der Header X-Eile-Signature enthält sha256= und den HMAC-SHA256 des Anfrageinhalts mit diesem Schlüssel. Der Empfänger berechnet ihn selbst und vergleicht.',
  'formEditor.webhookNoSecret':
    'Der Schlüssel erscheint, sobald die Adresse gespeichert ist.',
  'formEditor.webhookRenew': 'Neuer Schlüssel',
  'formEditor.webhookRenewPending':
    'Beim Speichern wird ein neuer Schlüssel ausgegeben; mit dem alten stimmt die Signatur dann nicht mehr.',
  'elements.tabSite': 'Website-Elemente',
  'kit.title': 'Komponenten-Baukasten',
  'kit.about':
    'Fertige Menüs, Breadcrumbs, Beitragsliste mit Seitennavigation und Dialogfenster. Eine Komponente wird in die Website-Elemente übernommen – danach können Sie sie wie eine eigene bearbeiten.',
  'kit.missing': 'Nicht installiert',
  'kit.installed': 'Installiert',
  'kit.changed': 'Auf der Website geändert',
  'kit.install': 'Installieren',
  'kit.replace': 'Original wiederherstellen',
  'kit.requires': 'Wird zusammen installiert mit {names}',
  'kit.done': 'Installiert:',
  'kit.replaceTitle': 'Komponente aus dem Baukasten wiederherstellen?',
  'kit.replaceBody':
    'Der Quelltext auf der Website weicht vom Baukasten ab. Ihre Änderungen daran gehen verloren – zurückholen lassen sie sich nur aus einer Sicherung.',
  'elements.save': 'Speichern',
  'elements.saved': 'Gespeichert, Revision {n}',
  'elements.errorAt': 'Zeile {line}, Spalte {column}',
  'elements.code': 'Code',
  'elements.templateFields': 'Vorlagenfelder',
  'elements.noFields': 'keine zugewiesen',
  'elements.usedOn': 'Verwendet',
  'elements.pagesShort': '{n} Seite der Website|{n} Seiten der Website',
  'elements.cheatTitle': 'Was die Vorlage erhält',
  'elements.cheatTitles': 'Titel, langer Titel, Menütitel.',
  'elements.cheatContent':
    'Seitentext (HTML), Zusammenfassung, Beschreibung für Suchmaschinen.',
  'elements.cheatFields':
    'Wert eines Seitenfelds: eigener, geerbter oder Standardwert.',
  'elements.cheatSite':
    'Name der Website, eigene Einstellungen und Übersetzungen in der Sprache der Seite.',
  'elements.cheatComponents':
    'Komponenten werden per Import eingebunden; ihre Parameter sind Attribute.',
  'elements.hint':
    "Strg+S – speichern. Komponenten importieren: import X from '$components/X'.",
  'elements.scriptHint':
    'Strg+S speichert. Ein ES-Modul für den Browser, bis 2 MB. Importiert werden dürfen andere Skripte der Website als ./name.js (Teile eines Builds mit Code-Splitting) und https://-Adressen; bündeln Sie alle anderen Abhängigkeiten in Skripte.',
  'elements.scriptInclude': 'Einbinden im <svelte:head> einer Vorlage',
  'elements.scriptUrl': 'Adresse der aktuellen Version',
  'elements.scriptUnused':
    'noch in keiner Vorlage oder Komponente eingebunden, und kein Skript verweist darauf',
  'nav.plugins': 'Plugins',
  'nav.media': 'Medien',
  'media.title': 'Mediathek',
  'media.drop': 'Dateien hierher ziehen oder klicken, um sie auszuwählen',
  'media.folder': 'Ordner',
  'media.uploadFolder': 'Hochladen in',
  'media.folderHint':
    'Ein Ordner aus der Liste oder ein neuer: Buchstaben ohne Umlaute, Ziffern, Bindestriche; Unterordner mit „/“.',
  'media.uploadingOf': 'Wird hochgeladen: {n} von {total}…',
  'media.into': 'Dateien landen im Ordner {folder}.',
  'media.replaceTitle': 'Dateien ersetzen?',
  'media.replaceBody':
    'Dateien mit diesen Namen gibt es in diesem Ordner bereits. Die alten Versionen gehen verloren, Links darauf öffnen die neuen.',
  'media.replace': 'Ersetzen',
  'media.upload': 'Hochladen',
  'media.uploaded': 'Hochgeladene Dateien:',
  'media.copy': 'Adresse kopieren',
  'media.closeDetails': 'Dateidetails schließen (Esc)',
  'media.size': 'Größe',
  'media.dimensions': 'Abmessungen',
  'media.type': 'Typ',
  'media.variantsShort': 'Varianten',
  'media.show': 'Anzeigen',
  'media.showAll': 'Ohne Filter',
  'media.showNoAlt': 'Bilder ohne Beschreibung',
  'media.showUnused': 'Auf keiner Seite',
  'media.loadingUsage': 'Texte und Felder der Seiten werden geprüft…',
  'media.unusedHint':
    'Diese Dateien stehen in keinem Seitentext, keinem Seitenfeld und nicht als Bild für soziale Netzwerke. Eine Vorlage kann eine Datei selbst einsetzen (aus einer Variablen) — vor dem Löschen prüfen.',
  'media.altBatchButton': 'Mit KI beschreiben: {n}',
  'media.altBatchHint':
    'Die KI beschreibt die Bilder ohne Beschreibung auf dieser Listenseite; speichern Sie, was passt',
  'media.altNoVision':
    'Das verbundene Modell sieht keine Bilder: Beschreibungen im Stapel sind nicht verfügbar',
  'media.altBatchTitle': 'Bildbeschreibungen',
  'media.altBatchIntro':
    'Die KI beschreibt die Bilder dieser Listenseite nacheinander. Prüfen und korrigieren Sie den Text — gespeichert wird, was angehakt ist.',
  'media.altRequest':
    'Beschreibe in einem kurzen Satz für das alt-Attribut, was das Bild zeigt: ohne Wörter wie „Bild“ oder „Foto“ und ohne Dateinamen.',
  'media.altProgress': '{n} von {total} fertig',
  'media.altWaiting': 'Wartet',
  'media.altWorking': 'Die KI schreibt…',
  'media.altKeep': 'Speichern',
  'media.altSaveChecked': 'Angehakte speichern: {n}',
  'media.altBatchSaved': 'Beschreibungen gespeichert: {n}',
  'media.altBatchStopped': 'Die KI hat angehalten: {reason}',
  'media.alt': 'Bildbeschreibung',
  'media.altHint':
    'Was auf dem Bild zu sehen ist, in einem Satz. Screenreader lesen sie vor, Suchmaschinen sehen sie; sie wird eingesetzt, wenn das Bild in einen Text eingefügt wird.',
  'media.altSaved': 'Beschreibung gespeichert',
  'media.noAlt': 'ohne Beschreibung',
  'media.usage': 'Wo verwendet',
  'media.unusedShort': 'Nirgends: Die Datei kann bedenkenlos gelöscht werden.',
  'media.openFile': 'Öffnen',
  'media.copied': 'Adresse kopiert',
  'media.remove': 'Datei löschen',
  'media.variants':
    'Für JPEG, PNG und WebP erstellt der Server Varianten mit 480, 960 und 1920 px als webp, nie breiter als das Original.',
  'media.linked': 'im Ordner',
  'media.linkedTitle': 'Eine Datei in einem Ordner auf dem Server',
  'media.linkedFrom': 'Auf der Festplatte',
  'media.linkedHint':
    'Die Datei liegt in einem verknüpften Ordner auf dem Server (cms media link): In der Datenbank steht nur ihre Beschreibung. Hier lässt sie sich nicht löschen oder ersetzen – ändern Sie die Datei im Ordner und führen Sie cms media link erneut aus. Die Bildbeschreibung lässt sich bearbeiten.',
  'media.origin': 'Herkunft',
  'media.originAll': 'Alle Dateien',
  'media.originUploaded': 'Hochgeladen',
  'media.originLinked': 'Aus einem Ordner auf dem Server',
  'media.empty': 'Die Mediathek ist noch leer.',
  'plugins.title': 'Plugins',
  'plugins.new': 'Neues Plugin',
  'plugins.empty': 'Wählen Sie ein Plugin oder legen Sie ein neues an.',
  'plugins.hint':
    "export default { render(html, { path, status }), notFound(path), handle(request, context), schedule: { every: '12h', run(context) }, on: { [Ereignistyp]: (event) => … } }. Import – nur $core.",
  'fields.title': 'Seitenfelder',
  'fields.typeText': 'Textzeile',
  'fields.typeRichtext': 'Formatierter Text',
  'fields.typeNumber': 'Zahl',
  'fields.typeBoolean': 'Ja / Nein',
  'fields.typeDate': 'Datum',
  'fields.typeSelect': 'Auswahlliste',
  'plugins.on': 'Plugin eingeschaltet',
  'plugins.off': 'Plugin ausgeschaltet',
  'fields.name': 'Name für die Vorlage',
  'fields.label': 'Beschriftung',
  'fields.type': 'Typ',
  'fields.options': 'Optionen, durch Komma getrennt',
  'fields.default': 'Standardwert',
  'fields.inherit': 'Von übergeordneten Seiten erben',
  'fields.templates': 'Vorlagen',
  'fields.save': 'Feld speichern',
  'fields.new': 'Neues Feld',
  'fields.taken': 'Dieses Feld gibt es bereits.',
  'fields.noTemplates': 'Ohne Vorlage erscheint das Feld auf keiner Seite.',
  'fields.optionsHint': 'Durch Komma getrennt: rot, grün, blau.',
  'fields.remove': 'Feld löschen',
  'fields.removeTitle': 'Feld löschen?',
  'fields.removeBodyValues':
    'Seine Werte gehen auf allen Seiten verloren, auf denen sie gesetzt sind. Betroffene Seiten: {n}.',
  'fields.removeBodyEmpty':
    'Keine Seite hat einen eigenen Wert für dieses Feld.',
  'fields.removed': 'Feld gelöscht',
  'fields.saved': 'Feld gespeichert',
  'settings.title': 'Website-Einstellungen',
  'settings.name': 'Name der Website',
  'settings.language': 'Sprache der Website',
  'settings.home': 'Startseite',
  'settings.notFound': '404-Seite',
  'settings.none': '– keine –',
  'settings.save': 'Speichern',
  'settings.saved': 'Einstellungen gespeichert',
  'settings.autosave': 'Änderungen in der Tabelle werden sofort gespeichert',
  'settings.tabAi': 'KI-Assistent',
  'settings.tabNotify': 'Benachrichtigungen',
  'settings.tabUpkeep': 'Wartung',
  'settings.tabRedirects': 'Weiterleitungen',
  'redirects.intro':
    'Weiterleitung von einer Adresse ohne Seite auf die richtige. /old und /old/ sind dieselbe Adresse. Ein Sternchen am Ende steht für den ganzen Bereich: /blog/* → /news/* überträgt auch den Rest der Adresse. Eine Adresse mit Query wie /?p=12 (alte WordPress-Links) ist eine eigene Regel: Sie greift nur, wenn die Adresse diese Parameter enthält, und noch vor der Seite, denn eine Seite sieht die Query nicht. Eine Seite der Website hat Vorrang vor einer Regel, eine Regel vor früheren Seitenadressen.',
  'redirects.from': 'Von',
  'redirects.to': 'Nach',
  'redirects.toHint':
    'Adresse, vollständige URL oder Seite [~id~] – sie wird auch nach dem Verschieben gefunden. Auch mit Anker: /faq#lieferung',
  'redirects.code': 'Code',
  'redirects.code301': '301 – dauerhaft',
  'redirects.code302': '302 – vorübergehend',
  'redirects.note': 'Notiz',
  'redirects.add': 'Hinzufügen',
  'redirects.search': 'Regel suchen',
  'redirects.empty':
    'Noch keine Regeln. Legen Sie die erste an – etwa von der alten Adresse einer Aktion auf die neue.',
  'redirects.notFound': 'Nichts gefunden.',
  'redirects.hits': 'Aufrufe',
  'redirects.never': 'noch keine',
  'redirects.lastHit': 'zuletzt am {when}',
  'redirects.edit': 'Regel bearbeiten',
  'redirects.save': 'Regel speichern',
  'redirects.remove': 'Regel löschen',
  'redirects.removeTitle': 'Regel löschen?',
  'redirects.removeBody':
    'Die Adresse antwortet dann wieder mit 404 – oder führt zur Seite, falls sie früher deren Adresse war.',
  'redirects.saved': 'Regel gespeichert',
  'redirects.removed': 'Regel gelöscht',
  'redirects.import': 'CSV importieren',
  'redirects.export': 'CSV exportieren',
  'redirects.imported': 'Aus CSV: {added} hinzugefügt, {updated} aktualisiert',
  'redirects.skipped': 'Übersprungene Zeilen',
  'redirects.line': 'Zeile {n}',
  'redirects.toPage': 'Seite „{title}“',
  'redirects.moved': 'Frühere Seitenadressen',
  'redirects.movedHint':
    'Die Website antwortet selbst mit 301 von der alten Adresse einer Seite auf die neue – nach einer Alias-Änderung oder dem Verschieben. Eine nicht mehr benötigte Adresse können Sie entfernen.',
  'redirects.movedEmpty': 'Noch keine Seite wurde verschoben.',
  'redirects.movedAt': 'Verschoben',
  'redirects.forget': 'Adresse entfernen',
  'redirects.forgotten': 'Adresse entfernt',
  'redirects.warn.shadowed':
    'Die Seite „{detail}“ unter dieser Adresse hat Vorrang vor der Regel: Die Regel greift erst, wenn es die Seite nicht mehr gibt.',
  'redirects.warn.shadowed_many':
    'Seiten unter dieser Adresse: {detail}. Sie haben Vorrang vor der Regel – sie greift nur für Adressen ohne Seite.',
  'redirects.warn.target_draft':
    'Die Seite „{detail}“ ist nicht veröffentlicht: Solange das so bleibt, greift die Regel nicht.',
  'redirects.warn.target_missing':
    'Unter der Adresse {detail} gibt es keine Seite – prüfen Sie das Ziel der Regel.',
  'cache.title': 'Seiten-Cache',
  'cache.hint':
    'Fertige Seiten liegen im Arbeitsspeicher des Servers und werden automatisch verworfen, sobald sich etwas ändert, das darauf zu sehen ist. Manuell leeren müssen Sie selten: wenn auf der Seite ein Datum oder etwas anderes steht, das sich mit der Zeit ändert.',
  'cache.pages': 'Seiten im Cache',
  'cache.memory': 'Speicher',
  'cache.of': 'von {total}',
  'cache.share': 'Antworten aus dem Cache',
  'cache.bypass': 'Ohne Cache',
  'cache.sinceStart': 'Gezählt seit dem Serverstart am',
  'cache.sinceReset': 'Gezählt seit dem manuellen Leeren am',
  'cache.answered': 'Seitenantworten: {n}',
  'cache.size': 'Cache-Größe',
  'cache.mb': 'MB',
  'cache.sizeHint':
    'Wie viel Arbeitsspeicher des Servers fertige Seiten belegen dürfen: 64 MB reichen für etwa 3000 Seiten mit je 10 KB Text. Ist der Speicher voll und der Anteil der Antworten aus dem Cache niedrig, erhöhen Sie den Wert. Die neue Größe gilt nach dem Speichern der Einstellungen.',
  'cache.clear': 'Cache leeren',
  'cache.refresh': 'Aktualisieren',
  'cache.cleared':
    'Cache geleert: Seiten werden beim ersten Aufruf neu erstellt',
  'cache.cdn':
    '„Ohne Cache“ – Seiten ohne Häkchen bei „Cachen“ oder mit einer Vorlage, die Daten des Aufrufs ausliest. Den Cache von Browsern und CDNs (etwa Cloudflare) leert diese Schaltfläche nicht.',
  'https.title': 'HTTPS',
  'https.hint':
    'Das Zertifikat von Let’s Encrypt holt der Server selbst (Start mit --domain) und verlängert es 30 Tage vor Ablauf – ohne Neustart. Solange es kein Zertifikat gibt, ist die Website über HTTP erreichbar.',
  'https.domains': 'Domains',
  'https.until': 'Gültig bis',
  'https.daysLeft': 'noch {n} Tag|noch {n} Tage',
  'https.issued': 'Ausgestellt',
  'https.notYet': 'Noch nicht ausgestellt',
  'https.staging':
    'Testumgebung von Let’s Encrypt (--acme-staging): Browser vertrauen einem solchen Zertifikat nicht. Starten Sie den Server für die Website ohne diesen Schalter.',
  'https.failed': 'Letzter Versuch',
  'https.retry':
    'Der Server versucht es selbst erneut: ohne Zertifikat nach einer Stunde, bei der Verlängerung nach einem Tag. Prüfen Sie, ob das DNS der Domains auf diesen Server zeigt und Port 80 offen ist.',
  'notify.telegram': 'Telegram',
  'notify.telegramHint':
    'Der Bot schickt Anfragen von der Website und meldet Störungen. Erstellen Sie einen Bot bei @BotFather, schreiben Sie ihm /start oder fügen Sie ihn einer Arbeitsgruppe hinzu – dann „Chats suchen“.',
  'notify.telegramOn': 'Über Telegram benachrichtigen',
  'notify.telegramOnHint': 'Erforderlich: Bot-Token und mindestens ein Chat.',
  'notify.token': 'Bot-Token',
  'notify.tokenKept':
    'Gespeichert – geben Sie ein neues ein, um es zu ersetzen',
  'notify.tokenHint':
    'Sie erhalten es von @BotFather. Das Token liegt auf dem Server und gelangt nicht in Sicherungen.',
  'notify.proxy': 'Proxy',
  'notify.proxyHint':
    'Falls der Server api.telegram.org nicht erreicht: HTTP-Proxy im Format http://host:port. Leer – direkt.',
  'notify.chats': 'Chats',
  'notify.noChats':
    'Noch keine Chats: Schreiben Sie dem Bot und klicken Sie auf „Chats suchen“.',
  'notify.findChats': 'Chats suchen',
  'notify.botFound': 'Bot erreichbar:',
  'notify.noNewChats':
    'Keine neuen Chats. Schreiben Sie dem Bot /start oder fügen Sie ihn einer Gruppe hinzu und versuchen Sie es erneut.',
  'notify.addChat': 'Hinzufügen',
  'notify.removeChat': 'Entfernen',
  'notify.test': 'Test senden',
  'notify.testSent': 'Test gesendet – sehen Sie im Kanal nach.',
  'notify.off': 'Deaktivieren',
  'notify.offTitle': 'Kanal deaktivieren?',
  'notify.offBody':
    'Anfragen und Störungen kommen hier nicht mehr an. Token oder Passwort löscht der Server.',
  'notify.email': 'E-Mail',
  'notify.emailHint':
    'E-Mails gehen über Ihren Mailserver (SMTP) – GMX, WEB.DE, Google mit App-Passwort oder einen eigenen – oder über einen Maildienst mit HTTP-API: Brevo, Postmark, Mailgun, Resend, Amazon SES.',
  'notify.emailOn': 'Per E-Mail benachrichtigen',
  'notify.emailOnHint':
    'Erforderlich: SMTP-Server oder Maildienst, Absender und Empfänger.',
  'notify.host': 'SMTP-Server',
  'notify.security': 'Verschlüsselung',
  'notify.securityTls': 'TLS sofort (Port 465)',
  'notify.securityStarttls': 'STARTTLS (Port 587)',
  'notify.securityNone': 'Ohne Verschlüsselung (Port 25)',
  'notify.port': 'Port',
  'notify.user': 'Benutzername',
  'notify.password': 'Passwort',
  'notify.passwordKept':
    'Gespeichert – geben Sie ein neues ein, um es zu ersetzen',
  'notify.passwordHint':
    'Bei Maildiensten das App-Passwort, nicht das Passwort des Postfachs. Ohne Benutzernamen werden E-Mails ohne Anmeldung versendet.',
  'notify.from': 'Absender',
  'notify.to': 'An',
  'notify.toHint': 'Bis zu zehn Adressen, durch Komma getrennt.',
  'notify.transport': 'Versand über',
  'notify.transportSmtp': 'Eigener Mailserver (SMTP)',
  'notify.transportHint':
    'Ihr Hoster sperrt die SMTP-Ports (bei neuen Servern von DigitalOcean und Hetzner üblich)? Wählen Sie einen Maildienst mit HTTP-API: Die E-Mails gehen per HTTPS raus, über Port 443 wie die Website selbst.',
  'notify.keyBrevo': 'API-Schlüssel',
  'notify.keyBrevoHint':
    'In Brevo: SMTP & API → API-Schlüssel → „Neuen API-Schlüssel erstellen“. Nötig ist ein API-Schlüssel (xkeysib-…); ein SMTP-Schlüssel (xsmtpsib-…) funktioniert nicht.',
  'notify.keyPostmark': 'Server-API-Token',
  'notify.keyPostmarkHint':
    'In Postmark: Ihr Server → Reiter API Tokens. Ein Server-Token, kein Konto-Token.',
  'notify.keyMailgun': 'API-Schlüssel',
  'notify.keyMailgunHint':
    'In Mailgun: Sending → Domain settings → Sending API keys. Der API-Schlüssel des Kontos funktioniert auch.',
  'notify.keyResend': 'API-Schlüssel',
  'notify.keyResendHint':
    'In Resend: API Keys → Create API Key; Sending access genügt. Der Schlüssel beginnt mit re_.',
  'notify.keySes': 'Geheimer Zugriffsschlüssel',
  'notify.keySesHint':
    'Zugriffsschlüssel eines IAM-Benutzers mit Versandrecht (ses:SendEmail und ses:SendRawEmail). Temporäre Schlüssel (ASIA…) funktionieren nicht.',
  'notify.keyKept':
    'Schlüssel …{hint} ist gespeichert – geben Sie einen neuen ein, um ihn zu ersetzen',
  'notify.keyId': 'Zugriffsschlüssel-ID',
  'notify.awsRegion': 'AWS-Region',
  'notify.awsRegionHint':
    'Die Region, in der die Domain in SES verifiziert ist: eu-central-1 ist Frankfurt.',
  'notify.mailgunRegion': 'Region',
  'notify.mailgunRegionUs': 'USA (api.mailgun.net)',
  'notify.mailgunRegionEu': 'EU (api.eu.mailgun.net)',
  'notify.mailgunDomain': 'Versanddomain',
  'notify.mailgunDomainHint':
    'Die in Mailgun angelegte Domain: mg.example.com. Leer – die Domain des Absenders.',
  'notify.stream': 'Message Stream',
  'notify.streamHint': 'Leer – outbound, der Stream für Transaktions-E-Mails.',
  'notify.verifyDomain':
    'Verifizieren Sie die Absenderdomain beim Dienst: Er zeigt DNS-Einträge für SPF und DKIM (bei SES: DKIM und optional MAIL FROM). Tragen Sie sie beim Domain-Registrar ein. Bis die Domain verifiziert ist, versendet der Dienst nichts, und E-Mails ohne SPF und DKIM landen häufiger im Spam.',
  'notify.viaSmtp': 'E-Mails gehen über den SMTP-Server {host}:{port}.',
  'notify.viaApi':
    'E-Mails gehen über {provider} (HTTP-API), Schlüssel …{hint}.',
  'notify.routes': 'Was wohin',
  'notify.routesHint':
    'Anfragen aus Formularen und Störungen der Website gehen an die gewählten Kanäle. Ein Formular kann eigene Kanäle festlegen.',
  'notify.routeForms': 'Anfragen aus Formularen',
  'notify.routeIncidents': 'Störungen der Website',
  'notify.level': 'Störungen melden ab Stufe',
  'notify.levelCritical':
    'Kritisch: Website antwortet mit Fehler, Benachrichtigung nicht zugestellt',
  'notify.levelError': 'Fehler: Plugin, Region oder Zeitplan ausgefallen',
  'notify.levelWarning': 'Warnung: Passwort-Raten, Neustart nach einer Störung',
  'notify.levelInfo': 'Alles: auch neue Benutzer des Managers',
  'notify.levelHint': 'Alles Übrige nur ins Protokoll unten.',
  'notify.language': 'Sprache der Benachrichtigungen',
  'notify.languageSite': 'Wie die Website',
  'notify.languageHint':
    'In ihr kommen Fehler und die Beschriftungen von Anfragen an. Formularfelder bleiben wie auf der Website, das Protokoll unten ist in Ihrer Sprache.',
  'notify.save': 'Benachrichtigungen speichern',
  'notify.saved': 'Benachrichtigungen gespeichert',
  'notify.journal': 'Störungsprotokoll',
  'notify.journalHint':
    'Störungen dieses Servers der letzten 30 Tage. Wiederholungen innerhalb von 15 Minuten werden zu einer Benachrichtigung zusammengefasst.',
  'notify.journalEmpty': 'Keine Störungen.',
  'notify.undelivered': 'Nicht zugestellt',
  'notify.failed': 'keine Versuche mehr',
  'notify.nextTry': 'nächster Versuch am {when}',
  'notify.retry': 'Erneut senden',
  'notify.retried': 'Wird erneut gesendet',
  'notify.severityCritical': 'Kritisch',
  'notify.severityError': 'Fehler',
  'notify.severityWarning': 'Warnung',
  'notify.severityInfo': 'Info',
  'gateway.on': 'Mail-Gateway',
  'gateway.onHint':
    'Andere Dienste – eine Plattform, ein CRM, Ihr eigenes Backend – senden E-Mails über das Postfach der Website: ein POST mit JSON und Token.',
  'gateway.path': 'Adresse des Gateways',
  'gateway.pathHint':
    'Lateinische Buchstaben, Ziffern und Bindestriche. Die Adresse antwortet auch ohne Schrägstrich am Ende; vor einer Seite mit derselben Adresse hat das Gateway Vorrang.',
  'gateway.rateLimit': 'Anfragen pro Minute von einer Adresse',
  'gateway.rateLimitHint':
    '0 heißt ohne Grenze. Es zählen E-Mails und Verbindungstests (?probe=1).',
  'gateway.senders': 'Weitere erlaubte Absender',
  'gateway.sendersHint':
    'Ein Client unterschreibt die E-Mail mit dem Absender oben oder einer dieser Adressen; jede andere Adresse wird durch den Absender ersetzt, der Name bleibt. Durch Komma getrennt.',
  'gateway.domains': 'Domains der Empfänger',
  'gateway.domainsHint':
    'Leer heißt beliebig. Sonst lehnt das Gateway eine E-Mail an eine Adresse außerhalb dieser Domains und ihrer Subdomains ab.',
  'gateway.tokens': 'Tokens',
  'gateway.noTokens':
    'Noch keine Tokens: Ohne Token nimmt das Gateway keine einzige E-Mail an.',
  'gateway.tokenLabel': 'Wer sendet',
  'gateway.tokenLabelPlaceholder': 'Zum Beispiel Plattform',
  'gateway.issue': 'Neuer Token',
  'gateway.issued':
    'Kopieren Sie den Token jetzt: Der Server behält nur seinen Hash und kann ihn nicht noch einmal zeigen.',
  'gateway.copyToken': 'Token kopieren',
  'gateway.copyAddress': 'Adresse kopieren',
  'gateway.copied': 'Kopiert',
  'gateway.created': 'erstellt {when}',
  'gateway.used': 'letzte Anfrage {when}',
  'gateway.unused': 'noch keine Anfragen',
  'gateway.revoke': 'Widerrufen',
  'gateway.revokeTitle': 'Token {name} widerrufen?',
  'gateway.revokeBody':
    'Der Dienst mit diesem Token kann sofort keine E-Mails mehr über die Website senden.',
  'gateway.revoked': 'Token widerrufen',
  'gateway.ready': 'Aktiv: nimmt E-Mails unter {url} an',
  'gateway.off': 'Aus.',
  'gateway.offClaimed':
    'Aus: Clients mit Token erhalten 503. Widerrufen Sie die Tokens, um die Adresse der Website zurückzugeben.',
  'gateway.notReady': 'Nicht bereit – es fehlt: {what}.',
  'gateway.missingSmtp': 'gespeicherte E-Mail-Einstellungen',
  'gateway.missingSender': 'eine Absenderadresse',
  'gateway.missingToken': 'ein Token',
  'gateway.shadows':
    'Unter dieser Adresse ist die Seite {title} veröffentlicht: Solange das Gateway die Adresse hält, sehen Besucher die Seite nicht.',
  'gateway.test': 'E-Mail an mich senden',
  'gateway.testSent': 'Die E-Mail ging über das Gateway an {email}.',
  'gateway.recent': 'Letzte Anfragen',
  'gateway.recentHint': 'Seit dem Serverstart, ohne Adressen und Betreff.',
  'gateway.noToken': 'ohne Token',
  'gateway.recipients': '{n} Empfänger|{n} Empfänger',
  'gateway.outcomeSent': 'gesendet',
  'aiSettings.title': 'KI-Anbindung',
  'aiSettings.intro':
    'Jeder Dienst mit einer API wie bei OpenAI: DeepSeek, OpenAI, OpenRouter oder ein eigenes Modell. Ist die KI angebunden, erscheint an den Feldern ein Zauberstab.',
  'aiSettings.url': 'API-Adresse',
  'aiSettings.urlHint':
    'Basisadresse, z. B. https://api.deepseek.com; der Pfad /chat/completions wird automatisch ergänzt.',
  'aiSettings.model': 'Modell',
  'aiSettings.modelHint':
    'Name des Modells beim Dienst: deepseek-flash – schnell, deepseek-v4-pro – klüger, aber langsamer.',
  'aiSettings.key': 'API-Schlüssel',
  'aiSettings.keyHint':
    'Der Schlüssel liegt nur auf dem Server: Er gelangt weder in den Browser noch in Sicherungen.',
  'aiSettings.keyKept': 'Schlüssel gespeichert',
  'aiSettings.keySavedHint':
    'Der Schlüssel ist auf dem Server gespeichert. Geben Sie nur dann einen neuen ein, wenn Sie ihn ersetzen möchten.',
  'aiSettings.instructions': 'Anweisungen für die KI',
  'aiSettings.instructionsPlaceholder':
    'Zum Beispiel: Wir siezen, schreiben kurz und ohne Behördendeutsch; den Markennamen nie übersetzen',
  'aiSettings.vision': 'Das Modell sieht Bilder',
  'aiSettings.visionHint':
    'Einschalten, wenn das Modell Bilder annimmt: Dann schreibt es die Beschreibung eines Bildes der Mediathek, indem es das Bild selbst ansieht. Modelle ohne Bildverständnis antworten mit einem Fehler.',
  'aiSettings.instructionsHint':
    'Ton, Stil, zu vermeidende Wörter: Sie gehen mit jedem Auftrag an die KI.',
  'aiSettings.connect': 'Verbinden',
  'aiSettings.update': 'Speichern',
  'aiSettings.test': 'Verbindung testen',
  'aiSettings.works': 'Funktioniert, das Modell hat geantwortet:',
  'aiSettings.worksSilent': 'Funktioniert: Das Modell hat geantwortet.',
  'aiSettings.saved': 'KI-Anbindung gespeichert',
  'aiSettings.disconnect': 'KI trennen',
  'aiSettings.disconnectTitle': 'KI trennen?',
  'aiSettings.disconnectBody':
    'Adresse, Modell und Schlüssel werden vom Server gelöscht, die Zauberstäbe an den Feldern verschwinden.',
  'aiSettings.disconnected': 'KI getrennt',
  'aiSettings.howTitle': 'So funktioniert es',
  'aiSettings.howIntro':
    'Zauberstab am Feld oder Alt+I im Feld: kurzer Auftrag – Vorschau – „Einfügen“.',
  'aiSettings.how1':
    'Den Zauberstab gibt es bei Titeln und Beschreibungen der Seite, im Seitentext, bei Vorlagenfeldern, SEO, Einstellungen, Übersetzungen, der Bildbeschreibung und im Code von Vorlagen, Komponenten und Plugins.',
  'aiSettings.how2':
    'Die KI erhält Ihren Auftrag, Beschriftung und Hinweis des Felds, seinen aktuellen Wert, Name und Sprache der Website, den Ort (Seite, Vorlage) und die Anweisungen oben.',
  'aiSettings.how3':
    'Bei Vorlagen und Komponenten kennt die KI die Regeln für Vorlagen, die Komponenten der Website und die Vorlagenfelder; Code erzeugen nur Administratoren.',
  'aiSettings.how4':
    'Das Einfügen lässt sich rückgängig machen: in Feldern mit „Rückgängig“ in der Meldung, in Text und Code mit Strg+Z.',
  'backup.title': 'Sicherungen',
  'backup.cliTitle': 'Zeitgesteuerte Sicherungen',
  'backup.cliIntro':
    'Der Server sichert die Website selbst nach Zeitplan und behält die letzten Sicherungen. Einschalten lässt sich das in den Einstellungen.',
  'backup.cliHint':
    'Oder per Zeitplaner des Servers, wenn die Sicherungen an einem anderen Ort liegen sollen: Ersetzen Sie die Pfade durch Ihre eigenen, alte Dateien löschen Sie selbst. Alle Befehle: cms help backup.',
  'backup.scheduleSetup': 'Zeitplan einrichten',
  'backup.scheduleOff': 'Automatische Sicherungen sind ausgeschaltet.',
  'backup.schedule': 'Zeitplan',
  'backup.downloadTitle': 'Sicherung herunterladen',
  'backup.downloadIntro':
    'Die ganze Website in einer Datei: Seiten, Elemente, Mediathek, Einstellungen, Übersetzungen und Benutzer. Bewahren Sie Sicherungen nicht auf diesem Server auf.',
  'backup.db': 'Datenbankdatei (.db)',
  'backup.dbHint':
    'Exakte Kopie. Lässt sich hier schnell wiederherstellen; auf dem Server genügt es, die Datei anstelle der Datenbank einzusetzen.',
  'backup.json': 'Datensätze als JSON',
  'backup.jsonHint':
    'Dieselben Datensätze als Text: Sie können die Datei öffnen, zwei Sicherungen vergleichen oder sie auf einen anderen Server übertragen. Die Dateien der Mediathek stecken darin, deshalb ist sie größer.',
  'backup.restoreSection': 'Aus Sicherung wiederherstellen',
  'backup.restoreIntro':
    'Die ganze Website wird wieder so, wie sie in der Sicherung war. Beide Formate eignen sich: .db und JSON.',
  'backup.chooseFile': 'Sicherungsdatei wählen…',
  'backup.restoring': 'Wird wiederhergestellt…',
  'backup.restoreHint':
    'Vor dem Ersetzen sichert der Manager den aktuellen Stand neben der Datenbank auf dem Server. Wenn Sie in der Sicherung nicht vorkommen, müssen Sie sich danach neu anmelden.',
  'backup.restoreTitle': 'Website aus Sicherung wiederherstellen?',
  'backup.restoreBody':
    'Seiten, Elemente, Mediathek, Einstellungen und Benutzer werden durch den Inhalt der Datei ersetzt. Der aktuelle Stand wird auf dem Server neben der Datenbank gesichert. Stellen Sie nur eigene Sicherungen wieder her: Eine fremde bringt ihre eigenen Administratoren mit, und ihre Vorlagen und Plugins werden auf dem Server ausgeführt.',
  'backup.restoreConfirm': 'Wiederherstellen',
  'backup.doneTitle': 'Website wiederhergestellt',
  'backup.donePages': 'Seiten in der wiederhergestellten Website:',
  'backup.doneSaved':
    'Der Stand vor der Wiederherstellung ist auf dem Server gesichert:',
  'backup.linkedTitle': 'Verknüpfte Ordner sind nicht in der Sicherung',
  'backup.linkedBody':
    'Die Dateien dieser Ordner liegen auf der Festplatte des Servers, die Datenbanksicherung enthält nur ihre Beschreibungen. Sichern Sie die Ordner getrennt, zusammen mit der Datenbanksicherung: Ohne sie öffnen sich ihre Bilder und Videos nicht.',
  'backup.linkedFolder': '{prefix}/ ← {dir} · {files} Dateien · {size}',
  'backup.linkedMissing': 'der Ordner fehlt auf der Festplatte',
  'backup.reload': 'Manager neu öffnen',
  'upkeep.backupsTitle': 'Automatische Sicherungen',
  'upkeep.backupsHint':
    'Der Server sichert die Website selbst und behält die letzten Sicherungen: Seiten, Elemente, Mediathek, Einstellungen und Benutzer – ohne Anmeldesitzungen und KI-Schlüssel. Bewahren Sie mindestens eine Sicherung außerhalb dieses Servers auf.',
  'upkeep.enabled': 'Nach Zeitplan sichern',
  'upkeep.enabledHint':
    'Uhrzeit nach der Serveruhr. Gesichert wird, solange die Website läuft.',
  'upkeep.every': 'Wie oft',
  'upkeep.every24': 'Einmal täglich',
  'upkeep.every12': 'Zweimal täglich',
  'upkeep.every6': 'Viermal täglich',
  'upkeep.every1': 'Stündlich',
  'upkeep.at': 'Uhrzeit',
  'upkeep.atHint': 'Erste Sicherung des Tages; danach im gewählten Abstand.',
  'upkeep.atHourly': 'Jede Stunde zu dieser Minute.',
  'upkeep.keep': 'Sicherungen behalten',
  'upkeep.keepHint':
    'Ältere werden automatisch gelöscht, andere Dateien im Verzeichnis bleiben unberührt.',
  'upkeep.folder': 'Verzeichnis',
  'upkeep.folderHint':
    'Leer – backups neben der Datenbank. Ein relativer Pfad gilt ab dem Verzeichnis der Datenbank.',
  'upkeep.save': 'Zeitplan speichern',
  'upkeep.saved': 'Sicherungszeitplan gespeichert',
  'upkeep.runNow': 'Jetzt sichern',
  'upkeep.running': 'Sicherung läuft…',
  'upkeep.done': 'Sicherung erstellt',
  'upkeep.last': 'Letzte Sicherung',
  'upkeep.never': 'Noch keine',
  'upkeep.manual': 'manuell',
  'upkeep.next': 'Nächste',
  'upkeep.nextOff': 'Keine zeitgesteuerten Sicherungen',
  'upkeep.where': 'Speicherort',
  'upkeep.failed': 'Letzte Sicherung fehlgeschlagen',
  'upkeep.updatesTitle': 'Updates',
  'upkeep.updatesHint':
    'Einmal täglich fragt der Server auf der Release-Seite nach, ob es eine neue Version gibt. Gesendet wird nur die Abfrage der Versionsliste – nichts über die Website.',
  'upkeep.check': 'Nach Updates suchen',
  'upkeep.checkHint':
    'Eine neue Version erscheint bei Administratoren im Profilmenü.',
  'upkeep.checkLocked': 'Auf dem Server deaktiviert: CMS_NO_UPDATE_CHECK=1.',
  'upkeep.installed': 'Installiert',
  'upkeep.available': 'Verfügbar',
  'upkeep.notes': 'Was ist neu',
  'upkeep.howTo':
    'Aktualisieren Sie per Befehl auf dem Server und starten Sie ihn dann neu:',
  'upkeep.upToDate': 'Das ist die neueste Version.',
  'upkeep.notChecked': 'Noch nicht geprüft.',
  'upkeep.checkedAt': 'Geprüft',
  'upkeep.checkNow': 'Jetzt prüfen',
  'offsite.title': 'Sicherungen außerhalb des Servers',
  'offsite.hint':
    'Der Server schickt Sicherungen der Website in einen S3-Speicher: DigitalOcean Spaces, Backblaze B2, Hetzner, MinIO, AWS. Die Sicherung wird hier verschlüsselt, bevor sie den Server verlässt: Der Speicher bekommt nur eine verschlüsselte Datei.',
  'offsite.enabled': 'Sicherungen in den Speicher schicken',
  'offsite.enabledHint':
    'Nach jeder automatischen Sicherung und nach „Jetzt sichern“.',
  'offsite.noSchedule':
    'Automatische Sicherungen sind aus: In den Speicher kommt eine Sicherung nur mit „Jetzt sichern“.',
  'offsite.endpoint': 'Adresse des Speichers',
  'offsite.endpointHint':
    'Zum Beispiel https://fra1.digitaloceanspaces.com. Leer bedeutet AWS S3 nach Region.',
  'offsite.region': 'Region',
  'offsite.regionHint': 'fra1, eu-central-003, fsn1; leer bedeutet us-east-1.',
  'offsite.bucket': 'Bucket',
  'offsite.prefix': 'Ordner im Bucket',
  'offsite.prefixHint':
    'Liegen im Bucket Sicherungen mehrerer Websites, bekommt jede einen eigenen Ordner.',
  'offsite.accessKey': 'Zugriffsschlüssel',
  'offsite.secret': 'Geheimer Schlüssel',
  'offsite.secretSaved': 'Gespeichert',
  'offsite.secretHint':
    'Leer lassen, um den gespeicherten zu behalten. Er bleibt nur auf diesem Server: Der Manager zeigt ihn nie, in einer Sicherung der Website ist er nicht enthalten.',
  'offsite.virtualHosted': 'Bucket im Hostnamen',
  'offsite.virtualHostedHint':
    'bucket.host statt host/bucket, falls der Speicher das verlangt.',
  'offsite.keep': 'Im Speicher behalten',
  'offsite.keepHint':
    'Die letzten Sicherungen dieser Website; ältere werden gelöscht, andere Dateien im Ordner bleiben.',
  'offsite.save': 'Speicher sichern',
  'offsite.saved': 'Speichereinstellungen gesichert',
  'offsite.check': 'Verbindung prüfen',
  'offsite.checking': 'Prüfe…',
  'offsite.checkOk':
    'Der Speicher antwortet: Auflisten, Schreiben und Löschen funktionieren.',
  'offsite.last': 'Letzter Upload',
  'offsite.never': 'Noch keiner',
  'offsite.failed': 'Der letzte Upload ist fehlgeschlagen',
  'offsite.key': 'Sicherungsschlüssel',
  'offsite.keyNone': 'Wird beim Einschalten erzeugt',
  'offsite.keyCreated': 'erzeugt {when}',
  'offsite.rotate': 'Neuer Schlüssel',
  'offsite.rotateTitle': 'Neuen Sicherungsschlüssel erzeugen?',
  'offsite.rotateBody':
    'Neue Sicherungen werden mit dem neuen Schlüssel versiegelt. Sicherungen, die schon im Speicher liegen, öffnet nur der alte Wiederherstellungsschlüssel: Bewahren Sie ihn auf, bis neue Sicherungen die alten ersetzt haben.',
  'offsite.rotateConfirm': 'Schlüssel erzeugen',
  'offsite.recoveryTitle': 'Wiederherstellungsschlüssel sichern',
  'offsite.recoveryBody':
    'Er öffnet die Sicherungen im Speicher, wenn es diesen Server nicht mehr gibt. Der Manager zeigt ihn nur jetzt: Speichern Sie ihn im Passwortmanager oder drucken Sie ihn aus. Ohne ihn kann niemand die Sicherungen im Speicher öffnen.',
  'offsite.recoveryUse':
    'Auf einem neuen Server: cms restore --remote latest fragt nach diesem Schlüssel.',
  'offsite.recoveryCopy': 'Schlüssel kopieren',
  'offsite.recoveryCopied': 'Wiederherstellungsschlüssel kopiert',
  'offsite.recoveryDone': 'Schlüssel gesichert',
  'database.title': 'Datenbankdatei',
  'database.hint':
    'Gelöschte Einträge und Dateien hinterlassen freie Seiten in der Datenbank, die Datei schrumpft nicht von selbst. Der Server verdichtet sie nachts, wenn mehr als ein Fünftel frei ist. Das geht auch jetzt: Die Website hält dafür den Bruchteil einer Sekunde inne.',
  'database.size': 'Größe',
  'database.free': 'Frei',
  'database.freeValue': '{size} ({share} %)',
  'database.compacted': 'Letzte Verdichtung',
  'database.compactedValue': '{when}: {before} → {after}',
  'database.never': 'Noch keine',
  'database.compact': 'Jetzt verdichten',
  'database.compacting': 'Verdichte…',
  'database.done': 'Datenbank verdichtet: {before} → {after}',
  'database.nothing': 'Keine freien Seiten: nichts zu verdichten.',
  'backup.remoteTitle': 'Sicherungen im Speicher',
  'backup.remoteIntro':
    'Sicherungen, die dieser Server in den S3-Speicher geschickt hat, neueste zuerst. Hier lässt sich eine Sicherung mit dem Schlüssel dieses Servers wiederherstellen; eine mit anderem Schlüssel stellt cms restore --remote mit ihrem Wiederherstellungsschlüssel wieder her.',
  'backup.remoteOff': 'Der Speicher für Sicherungen ist nicht eingerichtet.',
  'backup.remoteSetup': 'Speicher einrichten',
  'backup.remoteEmpty': 'Noch keine Sicherungen im Speicher.',
  'backup.remoteRestore': 'Wiederherstellen',
  'backup.remoteRestoreTitle':
    'Website aus der Sicherung im Speicher wiederherstellen?',
  'settings.keyHint':
    'Buchstaben ohne Umlaute, Ziffern und _, am Anfang ein Buchstabe: phone, footerText.',
  'settings.replaceTitle': 'Diesen Schlüssel gibt es bereits. Wert ersetzen?',
  'settings.replaceBody':
    'Der bisherige Wert geht überall verloren, wo der Schlüssel verwendet wird.',
  'settings.replace': 'Ersetzen',
  'settings.tabSite': 'Website',
  'settings.sectionSite': 'Website',
  'settings.sectionSiteHint':
    'Wie die Website heißt und welche Seiten sie unter „/“ und bei einer falschen Adresse ausliefert.',
  'settings.viewTransitions': 'Sanfte Übergänge zwischen Seiten',
  'settings.viewTransitionsHint':
    'Die Seiten der Website wechseln sanft in Browsern, die das können (Chrome und Edge 126+, Safari 18.2+); andere öffnen die Seiten wie gewohnt. Vorlagen müssen nicht geändert werden.',
  'settings.notFoundHint':
    'Besucher sehen sie, wenn es eine Adresse nicht gibt; die Antwort kommt mit Status 404.',
  'settings.sectionLanguages': 'Sprachen',
  'settings.sectionLanguagesHint':
    'Die Standardsprache gilt für <html lang> und Übersetzungen. Weitere Sprachen weisen Sie Zweigen des Baums in den Seiteneinstellungen zu.',
  'settings.sectionSnippet': 'Wie andere die Website sehen',
  'settings.sectionSnippetHint':
    'Adresse, Beschreibung und Bild – für Suchmaschinen, soziale Netzwerke und KI, wenn eine Seite keine eigenen hat.',
  'settings.aiHint':
    'Zwei verschiedene Dinge: die Website in KI-Antworten mit Links zeigen und erlauben, mit ihren Texten zu trainieren.',
  'settings.sectionPaging': 'Seitenweise Listen',
  'settings.sectionPagingHint':
    'Die Beitragsliste und andere Listen werden auf mehrere Seiten mit eigenen Adressen aufgeteilt: Suchmaschinen sehen jede davon.',
  'settings.pagingSegment': 'Wort in der Adresse',
  'settings.pagingSegmentHint':
    'Kleinbuchstaben ohne Umlaute, durch Bindestriche getrennt. Zweite Seite des Blogs:',
  'settings.pagingCanonical': 'Kanonische Adresse der Seiten 2, 3…',
  'settings.pagingCanonicalSelf': 'Die Seite selbst – wie von Google empfohlen',
  'settings.pagingCanonicalFirst': 'Erste Seite der Liste',
  'settings.pagingCanonicalHint':
    'Wenn die Suchmaschine die Folgeseiten mit der ersten zusammenführt, wählen Sie „Erste Seite der Liste“.',
  'settings.sectionAddresses': 'Adressstil',
  'settings.sectionAddressesHint':
    'Womit die Seitenadressen enden. Nützlich für eine von Evo umgezogene Website: Ihre Adressen bleiben erhalten.',
  'settings.urlSuffix': 'Adressendung',
  'settings.urlSuffixExample': 'ueber-uns',
  'settings.urlSuffixNone': 'Ohne Endung',
  'settings.urlSuffixOther': 'Andere Endung…',
  'settings.urlSuffixHint':
    'Leer – /ueber-uns, .html – /ueber-uns.html, / – /ueber-uns/. Wie die Website unter Evo; eine Änderung ändert die Adressen aller Seiten der Website.',
  'settings.urlSuffixCustom': 'Endung',
  'settings.urlSuffixCustomHint':
    'Ein Punkt und bis zu 10 Kleinbuchstaben a–z oder Ziffern: .htm, .php.',
  'settings.folderSlash': 'Ordneradressen enden auf /',
  'settings.folderSlashHint':
    'Ordnerseiten bekommen einen Schrägstrich am Ende: /katalog/. Eine Seite wird von selbst zum Ordner, sobald sie eine Unterseite bekommt.',
  'settings.sectionRobots': 'robots.txt',
  'settings.sectionRobotsHint':
    'Die Datei entsteht automatisch: Der Manager ist gesperrt, sitemap.xml ist angegeben, KI – je nach Auswahl oben.',
  'settings.tabSearch': 'Suche und KI',
  'settings.tabTranslations': 'Übersetzungen',
  'settings.tabCustom': 'Eigene Werte',
  'settings.languageHint':
    'Standardsprache: de, en, fr… Seiten und Zweige übernehmen sie, wenn keine eigene gewählt ist.',
  'settings.languages': 'Weitere Sprachen der Website',
  'settings.languagesHint':
    'Durch Kommas getrennt, zum Beispiel: en, fr. Leer – die Website ist einsprachig. Jede Sprache hat in den Übersetzungen eine eigene Spalte.',
  'settings.siteUrl': 'Website-Adresse',
  'settings.siteUrlHint':
    'Für canonical, sitemap.xml und soziale Netzwerke. Leer – wird aus der aufgerufenen Adresse übernommen.',
  'settings.socialImage': 'Bild für soziale Netzwerke',
  'settings.socialImageHint':
    'Für Seiten ohne eigenes Bild. Am besten 1200×630.',
  'settings.description': 'Beschreibung der Website',
  'settings.descriptionHint':
    'Für die Startseite, llms.txt und KI: worum es auf der Website geht, in ein bis zwei Sätzen.',
  'settings.ai': 'KI',
  'settings.aiSearch': 'Website in Antworten der KI-Suche zeigen',
  'settings.aiSearchHint':
    'ChatGPT Search, Claude, Perplexity – Antworten mit Links zu Ihren Seiten.',
  'settings.aiTraining': 'KI-Training mit den Texten der Website erlauben',
  'settings.aiTrainingHint':
    'GPTBot, ClaudeBot, Google-Extended, Common Crawl. Ausgeschaltet wird ein Verbot in die robots.txt eingetragen.',
  'settings.robots': 'Eigene Regeln für robots.txt',
  'settings.robotsHint':
    'Werden unverändert ans Ende der Datei angehängt, zum Beispiel: Disallow: /tmp.',
  'settings.sectionSiteSearch': 'Suche auf der Website',
  'settings.sectionSiteSearchHint':
    'Die Suche versteht Wortformen, korrigiert Tippfehler und sucht eine Phrase in Anführungszeichen als Ganzes. Synonyme sagen ihr, welche Wörter für Ihre Besucher dasselbe bedeuten.',
  'settings.synonyms': 'Synonyme',
  'settings.synonymsExample': 'Sofa, Couch\nKüche, Einbauküche',
  'settings.synonymsHint':
    'Eine Gruppe pro Zeile, Varianten durch Kommas getrennt; eine Variante kann eine Phrase sein. Wer nach „Couch“ sucht, findet auch Seiten über Sofas.',
  'settings.files': 'Prüfen, was Suchmaschinen und KI sehen:',
  'translations.intro':
    'Im Seitentext schreiben Sie einen Schlüssel als {i18n.key}, in der Vorlage als {site.i18n.key}; auf der Website wird daraus Text in der Sprache der Seite – und fehlt er in dieser Sprache, Text in der Standardsprache. Übersetzungen sind kein Muss: Text kann auch direkt in der Seite stehen. Umschalt+Enter beginnt eine neue Zeile: Eine Liste, etwa Antwortmöglichkeiten, steht mit einem Eintrag pro Zeile.',
  'translations.search': 'Schlüssel oder Text suchen',
  'translations.newKey': 'Neuer Schlüssel',
  'translations.newText': 'Text',
  'translations.cleared': 'Leere Übersetzung gelöscht',
  'translations.clearBody':
    'Das war der letzte Text dieses Schlüssels: Ohne Text wird die Übersetzung gelöscht. Wo der Schlüssel verwendet wird, steht dann der Schlüssel selbst in geschweiften Klammern.',
  'translations.removed': 'Übersetzung gelöscht',
  'translations.add': 'Schlüssel hinzufügen',
  'translations.missing':
    'Keine Übersetzung: Auf der Website erscheint der Text in der Hauptsprache',
  'translations.key': 'Schlüssel',
  'translations.default': 'Standard',
  'translations.empty': 'Noch keine Übersetzungen.',
  'translations.saved': 'Übersetzung gespeichert',
  'translations.remove': 'Übersetzung löschen',
  'translations.removeTitle': 'Übersetzung löschen?',
  'translations.removeBody':
    'Wo der Schlüssel verwendet wird, steht auf der Website dann der Schlüssel selbst in geschweiften Klammern.',
  'custom.intro':
    'Ein Wert, den Sie an einer Stelle ändern – etwa Telefonnummer oder Anschrift: Im Seitentext schreiben Sie seinen Schlüssel als [@key], in Vorlagen und Komponenten als {site.custom.key}. Ein Wert kann mehrere Zeilen haben (Umschalt+Enter), etwa ein Kontakt pro Zeile.',
  'custom.key': 'Schlüssel',
  'custom.newKey': 'Neuer Schlüssel',
  'custom.removed': 'Einstellung gelöscht',
  'custom.value': 'Wert',
  'custom.note': 'Erläuterung',
  'custom.notePlaceholder': 'Wozu und woher',
  'custom.add': 'Schlüssel hinzufügen',
  'custom.empty': 'Noch keine eigenen Einstellungen.',
  'custom.saved': 'Einstellung gespeichert',
  'custom.remove': 'Einstellung löschen',
  'custom.removeTitle': 'Einstellung löschen?',
  'custom.removeBody':
    'Wo der Schlüssel verwendet wird, steht auf der Website dann der Schlüssel selbst in eckigen Klammern.',
  'common.copied': 'Kopiert:',
  'common.copy': 'Kopieren',
  'users.title': 'Benutzer des Managers',
  'agent.open': 'KI-Assistent',
  'agent.title': 'Assistent',
  'agent.new': 'Neues Gespräch',
  'agent.intro':
    'Bitten Sie um etwas auf der Website: Der Assistent findet die Seiten und Elemente selbst und ändert sie. Er arbeitet mit Ihren Rechten, Änderungen an Seiten bleiben in ihrem Verlauf.',
  'agent.example1':
    'Finde Seiten ohne Beschreibung und schreibe die Beschreibungen',
  'agent.example2': 'Lege einen Entwurf „Angebote“ im Bereich Neuigkeiten an',
  'agent.example3':
    'Prüfe die Website mit der Diagnose und sag mir, was zu tun ist',
  'agent.placeholder': 'Was soll auf der Website passieren?',
  'agent.hint': 'Enter sendet, Umschalt+Enter fügt eine Zeile ein',
  'agent.send': 'Senden',
  'agent.working': 'Arbeite…',
  'agent.steps': 'Was der Assistent getan hat',
  'agent.stopped':
    'Nach {n} Schritten angehalten. Schreiben Sie „weiter“, um fertig zu werden.',
  'tokens.title': 'API-Schlüssel',
  'tokens.body':
    'Ein Schlüssel gibt einem KI-Agenten oder Skript Ihre Rechte im Manager. Agenten wie Claude, Cursor und Codex verbinden sich damit per MCP mit der Website.',
  'tokens.name': 'Wofür der Schlüssel ist',
  'tokens.namePlaceholder': 'Claude Code auf dem Laptop',
  'tokens.issue': 'Erstellen',
  'tokens.issued':
    'Der Schlüssel ist erstellt. Kopieren Sie ihn jetzt: Er wird nicht noch einmal angezeigt.',
  'tokens.copyToken': 'Schlüssel kopieren',
  'tokens.address': 'MCP-Adresse',
  'tokens.copyAddress': 'Adresse kopieren',
  'tokens.claudeCode': 'Befehl für Claude Code',
  'tokens.copyCommand': 'Befehl kopieren',
  'tokens.copiedNotice': 'Kopiert',
  'tokens.empty': 'Noch keine Schlüssel.',
  'tokens.created': 'erstellt {when}',
  'tokens.used': 'zuletzt genutzt {when}',
  'tokens.unused': 'noch nicht genutzt',
  'tokens.revoke': 'Widerrufen',
  'tokens.revokeTitle': 'Schlüssel {name} widerrufen?',
  'tokens.revokeBody':
    'Agenten und Skripte mit diesem Schlüssel verlieren sofort den Zugriff auf die Website.',
  'tokens.revoked': 'Schlüssel widerrufen',
  'tokens.limits':
    'Mit einem Schlüssel lassen sich keine weiteren Schlüssel erstellen, das Passwort ändern, Benutzer verwalten oder eine Kopie der Website herunterladen: Dafür melden Sie sich im Manager an.',
  'password.title': 'Passwort ändern',
  'password.body':
    'Danach müssen Sie sich auf anderen Geräten neu anmelden; hier bleiben Sie im Manager angemeldet.',
  'password.current': 'Aktuelles Passwort',
  'password.new': 'Neues Passwort',
  'password.save': 'Ändern',
  'password.changed': 'Passwort geändert',
  'password.wrongCurrent': 'Das aktuelle Passwort stimmt nicht.',
  'users.email': 'E-Mail',
  'users.name': 'Name',
  'users.role': 'Rolle',
  'users.password': 'Passwort (ab 10 Zeichen)',
  'users.create': 'Hinzufügen',
  'users.created': 'Benutzer hinzugefügt',
  'users.remove': 'Löschen',
  'users.resetPassword': 'Neues Passwort',
  'users.admin': 'Administrator',
  'users.new': 'Neuer Benutzer',
  'users.newHint':
    'Die Anmeldung erfolgt mit E-Mail und Passwort. Das Passwort lässt sich später über „Neues Passwort“ ändern.',
  'users.emailInvalid': 'E-Mail im Format name@example.com.',
  'users.namePlaceholder':
    'So erscheint der Benutzer im Manager. Leer – die E-Mail-Adresse.',
  'users.passwordLabel': 'Passwort',
  'users.passwordHint':
    'Mindestens 10 Zeichen. Geben Sie es persönlich weiter.',
  'users.you': '(das sind Sie)',
  'users.removeTitle': 'Benutzer löschen?',
  'users.removeBody':
    'Der Benutzer kann sich nicht mehr im Manager anmelden. Seiten, die er bearbeitet hat, bleiben erhalten.',
  'users.passwordTitle': 'Neues Passwort',
  'users.passwordSet': 'Passwort geändert, alte Sitzungen beendet',
  'users.roleSet': 'Rolle geändert',
  'users.roleTitle': 'Rolle ändern?',
  'users.roleAdminBody':
    'Administratoren bearbeiten Vorlagen, Plugins, Felder, Einstellungen und Benutzer.',
  'users.roleEditorBody':
    'Redakteure sehen nur Seiten und Mediathek; Vorlagen, Einstellungen und Benutzer sind dann nicht mehr zugänglich.',
  'users.actions': 'Aktionen',
  'users.removed': 'Benutzer gelöscht',
  'media.removeTitle': 'Datei löschen?',
  'media.removeBody':
    'Dort fehlt dann das Bild. Die Größenvarianten werden ebenfalls gelöscht.',
  'media.removed': 'Datei gelöscht',
  'users.editor': 'Redakteur',
  'common.cancel': 'Abbrechen',
  'common.close': 'Schließen',
  'password.show': 'Passwort anzeigen',
  'password.currentMissing': 'Geben Sie das aktuelle Passwort ein.',
  'login.passwordMissing': 'Geben Sie das Passwort ein.',
  'auth.toDark': 'Dunkler Modus',
  'auth.toLight': 'Heller Modus',
  'auth.license': 'Lizenz',
  'language.title': 'Sprache der Oberfläche',
  'language.label': 'Sprache',
  'login.emailMissing': 'Geben Sie die E-Mail-Adresse ein.',
  'password.hide': 'Passwort verbergen',
  'common.back': 'Zurück',
  'common.notFound': 'Das gibt es hier nicht.',
  'common.forbidden': 'Dieser Bereich ist nur für Administratoren zugänglich.',
  'edge.missingTitle': 'Diese Seite gibt es nicht',
  'edge.missingText':
    'Vielleicht wurde sie aus dem Papierkorb gelöscht, oder die Adresse ist falsch. Suchen Sie die gewünschte Seite im Baum oder über den Schnellzugriff.',
  'edge.forbiddenTitle': 'Dieser Bereich ist für Administratoren',
  'edge.forbiddenText':
    'Seiten und Mediathek stehen auch Ihnen offen. Wenn Sie hier Zugriff brauchen, bitten Sie einen Administrator, Ihre Rolle zu ändern.',
  'edge.elementMissingTitle': 'Dieses Element gibt es nicht',
  'edge.elementMissingText':
    'Vielleicht wurde es gelöscht oder umbenannt. Alle Vorlagen, Komponenten und Plugins finden Sie unter „Elemente“.',
  'edge.notFoundTitle': 'Hier ist nichts',
  'edge.notFoundText':
    'Diese Adresse gibt es im Manager nicht. Beginnen Sie mit der Übersicht der Website: Von dort aus erreichen Sie alles Weitere.',
  'edge.errorTitle': 'Die Ansicht ließ sich nicht öffnen',
  'edge.errorText':
    'Der Manager konnte sie nicht anzeigen. Laden Sie die Seite neu; passiert es wieder, geben Sie dem Entwickler die Antwort des Servers weiter:',
  'edge.jump': 'Schnellzugriff',
  'edge.reload': 'Neu laden',
  'common.unsaved': 'Ungespeicherte Änderungen',
  'common.leave': 'Ungespeicherte Änderungen gehen verloren.',
  'common.unsavedTitle': 'Ohne Speichern verlassen?',
  'common.leaveConfirm': 'Ohne Speichern verlassen',
  'common.undo': 'Rückgängig',
  'common.pageNotFound': 'Diese Seite gibt es im Manager nicht.',
  'common.toStart': 'Zu den Seiten',
  'common.skip': 'Zum Inhalt',
  'common.loading': 'Wird geladen…',
  'common.breadcrumbs': 'Pfad',
  'common.moreCrumbs': 'Weitere Pfadebenen',
  'appearance.title': 'Darstellung',
  'appearance.body':
    'Die Akzentfarbe färbt Hauptschaltflächen, Auswahl, Links und Fokus; alles andere bleibt ruhig und neutral. Die Helligkeit wählt der Manager selbst, damit Text bei jeder Farbe lesbar bleibt.',
  'appearance.accent': 'Akzentfarbe',
  'appearance.presetModx': 'MODX-Blau',
  'appearance.presetTeal': 'Türkis',
  'appearance.presetGreen': 'Grün',
  'appearance.presetAmber': 'Bernstein',
  'appearance.presetTerracotta': 'Terrakotta',
  'appearance.presetRaspberry': 'Himbeere',
  'appearance.presetViolet': 'Violett',
  'appearance.presetGraphite': 'Graphit',
  'appearance.custom': 'Eigene Farbe',
  'appearance.roleAccent': 'Auswahl',
  'appearance.rolePrimary': 'Speichern',
  'appearance.roleMark': 'Link',
  'appearance.scheme': 'Farbschema',
  'appearance.system': 'Wie im System',
  'appearance.light': 'Hell',
  'appearance.dark': 'Dunkel',
  'appearance.save': 'Speichern',
  'appearance.saved': 'Darstellung gespeichert',
  'shell.tree': 'Baum',
  'palette.title': 'Schnellzugriff',
  'ai.title': 'Mit KI generieren',
  'ai.short': 'KI',
  'ai.field': 'Feld',
  'ai.request': 'Was soll generiert werden',
  'ai.placeholderText':
    'Zum Beispiel: kürzer und lebendiger, für die Startseite',
  'ai.placeholderLong':
    'Zum Beispiel: zwei Sätze zum Versand, ohne Behördendeutsch',
  'ai.placeholderRich':
    'Zum Beispiel: Text zur Garantie – drei Absätze und eine Liste der Bedingungen',
  'ai.placeholderCode':
    'Zum Beispiel: Footer mit der Telefonnummer aus den Einstellungen ergänzen',
  'ai.quick': 'Schnellaufträge',
  'ai.quickShorter': 'Kürzer',
  'ai.quickLively': 'Lebendiger',
  'ai.quickFix': 'Fehler korrigieren',
  'ai.quickEnglish': 'Ins Englische übersetzen',
  'ai.thinking': 'KI schreibt…',
  'ai.generate': 'Generieren',
  'ai.again': 'Noch eine Variante',
  'ai.insert': 'Einfügen',
  'ai.keyEnter': 'Strg ↵',
  'ai.inserted': 'Eingefügt',
  'ai.sends': 'Die KI erhält Ihren Auftrag, das Feld und Angaben zur Website',
  'ai.shortcutHint': 'Alt+I – mit KI generieren',
  'bulk.publishShort': 'Veröffentlichen',
  'bulk.unpublishShort': 'Nicht mehr veröffentlichen',
  'bulk.templateShort': 'Vorlage…',
  'bulk.showInMenu': 'Im Menü zeigen',
  'bulk.hideFromMenu': 'Aus dem Menü nehmen',
  'bulk.moveShort': 'Verschieben…',
  'bulk.trashShort': 'In den Papierkorb',
  'bulk.templateTitle':
    'Welche Vorlage sollen die ausgewählten Seiten bekommen?',
  'bulk.templateConfirm': 'Übernehmen',
  'bulk.templated': 'Vorlage geändert bei Seiten:',
  'bulk.menuShown': 'Im Menü gezeigt, Seiten:',
  'bulk.menuHidden': 'Aus dem Menü genommen, Seiten:',
  'table.selectAll': 'Alle Zeilen dieser Listenseite auswählen',
  'table.selectPage': 'Auswählen: {title}',
  'bulk.title': 'Aktionen für die Auswahl',
  'bulk.selected': 'Ausgewählt:',
  'bulk.publish': 'Auswahl veröffentlichen',
  'bulk.unpublish': 'Auswahl zurückziehen',
  'bulk.move': 'Auswahl verschieben…',
  'bulk.trash': 'Auswahl in den Papierkorb',
  'bulk.clear': 'Auswahl aufheben (Esc)',
  'bulk.select': 'Auswählen',
  'bulk.deselect': 'Abwählen',
  'bulk.published': 'Seiten veröffentlicht:',
  'bulk.unpublished': 'Veröffentlichung zurückgezogen:',
  'bulk.trashed': 'In den Papierkorb verschoben:',
  'bulk.moved': 'Seiten verschoben:',
  'bulk.trashTitle': 'Ausgewählte Seiten in den Papierkorb verschieben?',
  'bulk.trashBody':
    'Sie verschwinden von der Website, ihre Unterseiten gehen mit. Unterseiten: {n}.',
  'bulk.publishNowBody':
    'Unter den ausgewählten Seiten sind geplante: Diese erscheinen jetzt statt zum geplanten Zeitpunkt.',
  'bulk.moveTitle': 'Ausgewählte Seiten verschieben – wohin?',
  'palette.open': 'Gehe zu',
  'palette.placeholder': 'Seite, Vorlage, Komponente, Feld oder Bereich',
  'palette.placeholderEditor': 'Seite oder Bereich',
  'palette.results': 'Ergebnisse',
  'palette.nothing':
    'Nichts gefunden. Versuchen Sie einen Teil des Titels, den Alias oder die ID.',
  'palette.pages': 'Seiten',
  'palette.elements': 'Elemente',
  'palette.sections': 'Bereiche',
  'palette.actions': 'Aktionen',
  'palette.recent': 'Zuletzt geöffnete Seiten',
  'palette.keyMove': 'auswählen',
  'palette.keyOpen': 'öffnen',
  'shell.sidebar': 'Seitenleiste',
  'shell.treeShow': 'Baum einblenden',
  'shell.treeHide': 'Baum ausblenden',
  'shell.resize': 'Breite des Baums',
  'shell.account': 'Konto',
  'shell.menu': 'Hauptmenü',
  'common.network':
    'Keine Verbindung zum Server. Ihre Änderungen auf der Seite sind nicht verloren: Versuchen Sie es noch einmal.',
  'common.loadNetwork': 'Nicht geladen: keine Verbindung zum Server.',
  'common.retry': 'Wiederholen',
  'common.error': 'Fehler',
  'common.yes': 'Ja',
  'common.no': 'Nein',
  'fields.typeImage': 'Bild',
  'fields.nameLocked':
    'Der Name lässt sich nicht ändern: Unter ihm sind die Werte der Seiten gespeichert.',
  'fields.nameHint':
    'Ohne Umlaute, mit einem Kleinbuchstaben am Anfang: Die Vorlage liest das Feld als page.fields.price.',
  'fields.editing': 'Feld',
  'fields.labelPlaceholder': 'Preis',
  'fields.labelHint': 'So ist das Feld im Formular der Seite beschriftet.',
  'fields.sectionWhat': 'Was für ein Feld',
  'fields.sectionWhatHint':
    'Name für die Vorlage, Beschriftung für Redakteure und Typ des Werts.',
  'fields.sectionValue': 'Wenn das Feld leer ist',
  'fields.sectionValueHint':
    'Was die Vorlage erhält, wenn das Feld einer Seite leer ist.',
  'fields.inheritHint':
    'Ein leeres Feld übernimmt den Wert der nächsten übergeordneten Seite, bei der er gesetzt ist: das Banner eines Bereichs gilt so für alle seine Seiten.',
  'fields.templatesHint': 'Das Feld erscheint bei Seiten mit diesen Vorlagen.',
  'editor.toolbar': 'Textformatierung',
  'editor.blockType': 'Absatzformat',
  'editor.paragraph': 'Absatz',
  'editor.h2': 'Überschrift 2',
  'editor.h3': 'Überschrift 3',
  'editor.h4': 'Überschrift 4',
  'editor.strong': 'Fett',
  'editor.em': 'Kursiv',
  'editor.link': 'Link',
  'editor.linkTitle': 'Link',
  'editor.linkAddress': 'Seite oder Adresse: https://…, /pfad, mailto:…',
  'editor.linkConfirm': 'Übernehmen',
  'editor.linkHint':
    'Beginnen Sie, den Titel einer Seite einzugeben: So bleibt der Link auch nach dem Umbenennen intakt. Strg+K öffnet dieses Fenster, eine leere Adresse entfernt den Link.',
  'editor.linkToPage': 'Link zur Seite',
  'editor.linkNoPage':
    'Diese Seite gibt es nicht – auf der Website bleibt der Link leer.',
  'editor.linkUnknown':
    'Diese Seite gibt es nicht, und eine Adresse ist es auch nicht. Wählen Sie eine Seite aus den Vorschlägen oder geben Sie https://…, /pfad, mailto: oder tel: ein.',
  'editor.linkBecomes': 'Der Link lautet:',
  'editor.linkUnsafe':
    'Diese Adresse ist nicht zulässig: Ein Link führt zu https://…, /pfad, mailto: oder tel:.',
  'editor.bullets': 'Aufzählung',
  'editor.numbers': 'Nummerierte Liste',
  'editor.quote': 'Zitat',
  'editor.image': 'Bild aus der Mediathek',
  'editor.mode': 'Bearbeitungsmodus',
  'editor.visual': 'Visuell',
  'editor.tooComplex':
    'Das Markup enthält, was der visuelle Editor nicht kennt (Klassen, Tabellen, Kommentare): Es wird als HTML bearbeitet.',
  'blocks.text': 'Text',
  'blocks.textHint':
    'Beginnen Sie zu schreiben. „## “ – Überschrift, „- “ – Liste.',
  'blocks.component': 'Komponente',
  'blocks.add': 'Block hinzufügen:',
  'blocks.insertHere': 'Hier einfügen:',
  'blocks.insertBelow': 'Darunter einfügen',
  'blocks.position': 'Block {n} von {total}',
  'blocks.others': 'Weitere Komponenten – ohne Beschreibung',
  'blocks.describeHint':
    'Komponenten für Inhalte beschreibt man mit dem Kommentar <!-- @component … --> am Anfang des Quelltexts.',
  'blocks.up': 'Nach oben',
  'blocks.down': 'Nach unten',
  'blocks.remove': 'Block entfernen',
  'blocks.empty':
    'Noch kein Inhalt: Fügen Sie Text oder eine Komponente der Website hinzu.',
  'blocks.noComponents': 'Die Website hat noch keine Komponenten.',
  'blocks.missing':
    'Diese Komponente gibt es nicht: Der Block wird unverändert gespeichert.',
  'blocks.noProps': 'Ohne Parameter.',
  'blocks.extra': 'Weitere Parameter:',
  'blocks.default': 'Standard:',
  'blocks.byDefault': 'Standard',
  'blocks.hidden': 'Ausgeblendet',
  'blocks.hide': 'Auf der Website ausblenden',
  'blocks.hiddenNote':
    'Der Block bleibt im Seitentext, aber Besucher, die Suche und die Markdown-Version sehen ihn nicht.',
  'sortable.grip': 'Verschieben: {name}',
  'sortable.gripTitle': 'Zum Verschieben ziehen',
  'sortable.hint':
    'Leertaste nimmt auf, Pfeil nach oben und unten verschieben, Leertaste legt ab, Esc stellt zurück. Mit Maus oder Finger am Griff ziehen.',
  'sortable.picked':
    'Aufgenommen: {name}, Position {n} von {total}. Pfeil nach oben und unten verschieben, Leertaste legt ab, Esc stellt zurück.',
  'sortable.moved': '{name}: Position {n} von {total}',
  'sortable.dropped': 'Abgelegt: {name}, Position {n} von {total}',
  'sortable.cancelled':
    'Verschieben abgebrochen: {name} wieder auf Position {n} von {total}',
  'picker.image': 'Bild aus der Mediathek',
  'picker.file': 'Datei aus der Mediathek',
  'picker.search': 'Nach Namen suchen',
  'picker.allFolders': 'Alle Ordner',
  'picker.files': 'Dateien',
  'picker.empty':
    'In der Mediathek gibt es noch keine passenden Dateien – laden Sie die erste hoch.',
  'picker.upload': 'Vom Computer hochladen',
  'picker.uploading': 'Wird hochgeladen…',
  'picker.uploadHint': 'in den Ordner {folder}',
  'picker.ratioOff':
    'Das Seitenverhältnis passt nicht: Soziale Netzwerke schneiden die Ränder ab. Am besten passt {size}.',
  'picker.tooSmall':
    'Das Bild ist kleiner als nötig und wirkt in sozialen Netzwerken unscharf. Am besten passt {size}.',
  'picker.nothing': 'Nichts gefunden.',
  'picker.alt': 'Was auf dem Bild zu sehen ist',
  'picker.altHint':
    'Für Menschen, die das Bild nicht sehen können. Leer – das Bild ist reine Dekoration.',
  'picker.choose': 'Auswählen',
  'picker.replace': 'Ersetzen',
  'picker.clear': 'Entfernen',
  'units.bytes': '{n} B',
  'units.kilobytes': '{n} KB',
  'units.megabytes': '{n} MB',
  'starter.componentAbout':
    'Was die Komponente tut, in einem Satz: Er erscheint im Blockkatalog.',
  'starter.componentProps':
    'Die Beschriftung eines Parameters im Seiteneditor ist der Kommentar /** … */ darüber.',
  'starter.componentTitle': 'Titel',
  'starter.pluginHooks':
    'Hooks sind optional: Behalten Sie die, die Sie brauchen.',
  'starter.scriptAbout':
    'Ein ES-Modul für den Browser. Importiert werden dürfen andere Skripte der Website als ./name.js und https://-Adressen.',
  'aiFacts.components': 'Komponenten der Website: {list}',
  'aiFacts.none': 'keine',
  'aiFacts.media': 'Mediathek',
  'aiFacts.file': 'Datei: {path}',
  'aiFacts.size': 'Abmessungen: {size}',
  'aiFacts.usedOn': 'Verwendet auf den Seiten: {pages}',
  'aiFacts.blindImage':
    'Das Bild selbst siehst du nicht – beschreibe es vorsichtig anhand des Dateinamens und der Seiten',
  'aiFacts.page': 'Seite „{title}“',
  'aiFacts.address': 'Adresse: {path}',
  'aiFacts.section': 'Bereich: {path}',
  'aiFacts.topLevel': 'oberste Ebene der Website',
  'aiFacts.template': 'Vorlage: {name}',
  'aiFacts.link':
    'Das ist keine Seite, sondern ein Link auf eine andere Adresse',
  'aiFacts.fields': 'Felder der Vorlage: {list}',
  'aiFacts.templateArea': 'Vorlage „{name}“',
  'aiFacts.componentArea': 'Komponente „{name}“',
  'aiFacts.scriptArea': 'Skript „{name}“',
  'aiFacts.templatePages': 'Seiten der Website mit dieser Vorlage: {n}',
  'aiFacts.componentPages': 'Seiten der Website mit dieser Komponente: {n}',
  'aiFacts.settings': 'Einstellungen der Website',
  'aiFacts.plugin': 'Plugin „{name}“',
  'common.ctrl': 'Strg',
  'common.quoted': '„{text}“',
  'formStarter.name': 'Name',
  'formStarter.phone': 'Telefon',
  'formStarter.phonePlaceholder': '+49 30 1234567',
  'formStarter.phoneMessage':
    'Bitte eine Telefonnummer angeben: +49 30 1234567',
  'formStarter.comment': 'Kommentar',
  'formStarter.consent':
    'Ich stimme der {Verarbeitung personenbezogener Daten} zu',
  'formStarter.choose': 'Bitte wählen…',
  'formPattern.phone': 'Telefon',
  'formPattern.digits': 'Nur Ziffern',
  'formPattern.postcodeRu': 'Russische Postleitzahl',
  'formPattern.innRu': 'Russische Steuernummer (INN)',
  'formPattern.postcodeDe': 'Deutsche Postleitzahl',
  'formPattern.zipUs': 'US-Postleitzahl (ZIP)',
  'elements.cheatFieldsCode': '{page.fields.name}',
  'elements.cheatCustomCode': '{site.custom.key}',
  'elements.cheatI18nCode': '{site.i18n.key}',
  'nav.stats': 'Statistik',
  'stats.title': 'Statistik',
  'stats.period': 'Zeitraum',
  'stats.days7': '7 Tage',
  'stats.days30': '30 Tage',
  'stats.days90': '90 Tage',
  'stats.custom': 'Eigene Daten',
  'stats.from': 'Von',
  'stats.to': 'Bis',
  'stats.show': 'Anzeigen',
  'stats.refresh': 'Aktualisieren',
  'stats.settings': 'Statistik-Einstellungen',
  'stats.offTitle': 'Die Statistik ist aus',
  'stats.offText':
    'Eile zählt Besucher direkt auf dem Server: ohne Cookies, ohne gespeicherte Adressen und ohne Einwilligungsbanner. Schalten Sie die Zählung in den Einstellungen ein und erwähnen Sie sie in der Datenschutzerklärung der Website.',
  'stats.offEditor':
    'Die Zählung kann ein Administrator der Website einschalten.',
  'stats.offWithData':
    'Die Zählung ist aus: neue Aufrufe werden nicht gezählt, frühere Daten stehen unten.',
  'stats.emptyTitle': 'Noch keine Besucher',
  'stats.emptyText':
    'Die Zählung ist an. Der erste Aufruf erscheint hier sofort: Öffnen Sie die Website in einem anderen Browser, ohne im Manager angemeldet zu sein. Angemeldete Manager, Bots und Vorabladen werden nicht gezählt.',
  'stats.firstDay':
    'Die Zählung läuft seit heute: Der Vergleich mit dem Vorzeitraum folgt später.',
  'stats.since': 'Daten seit {date}.',
  'stats.visitors': 'Besucher',
  'stats.views': 'Seitenaufrufe',
  'stats.visitorsCount': '{n} Besucher|{n} Besucher',
  'stats.viewsCount': '{n} Seitenaufruf|{n} Seitenaufrufe',
  'stats.perVisitor': 'Aufrufe pro Besucher',
  'stats.conversions': 'Conversions',
  'stats.rate': 'Conversion-Rate',
  'stats.delta': '{delta} ggü. Vorzeitraum',
  'stats.visitorsHint':
    'Ein Besucher zählt einmal pro Tag: Wer an drei Tagen kommt, zählt dreimal.',
  'stats.chartTitle': 'Nach Tagen',
  'stats.chartLabel':
    'Besucher und Seitenaufrufe nach Tagen vom {from} bis {to}',
  'stats.chartKeys': 'Pfeiltasten links und rechts wechseln den Tag',
  'stats.table': 'Tabelle nach Tagen',
  'stats.day': 'Tag',
  'stats.pages': 'Seiten',
  'stats.page': 'Seite',
  'stats.sources': 'Quellen',
  'stats.source': 'Quelle',
  'stats.direct': 'Direkt',
  'stats.allSources': 'Alle',
  'stats.referrers': 'Websites',
  'stats.mediums': 'Kanäle',
  'stats.campaigns': 'Kampagnen',
  'stats.contents': 'Inhalte',
  'stats.terms': 'Suchbegriffe',
  'stats.sourcesHint':
    'Die Quelle ist das Tag utm_source, sonst die Website, von der der Besucher kam; bekannte Dienste stehen unter einem Namen (google.de und utm_source=google sind Google). Unter „Websites“ stehen die Hosts unverändert; Kanäle, Kampagnen, Inhalte und Suchbegriffe sind die Tags utm_medium, utm_campaign, utm_content und utm_term.',
  'stats.entries': 'Einstiegsseiten',
  'stats.entriesHint': 'Die erste Seite eines Besuchers am Tag.',
  'stats.devices': 'Geräte',
  'stats.deviceDesktop': 'Desktop',
  'stats.deviceMobile': 'Smartphone',
  'stats.deviceTablet': 'Tablet',
  'stats.languages': 'Sprachen',
  'stats.pageLanguages': 'Seitensprache',
  'stats.browserLanguages': 'Browsersprache',
  'stats.none': 'In diesem Zeitraum nichts.',
  'stats.more': 'Alle anzeigen ({n})',
  'stats.less': 'Weniger anzeigen',
  'stats.goals': 'Ziele',
  'stats.goalsHint':
    'Ein Ziel ist eine angenommene Formularanfrage (ohne Spam), ein Klick auf einen Ziel-Link oder auf einen Weiterleitungslink der Analyse (/_cms/go/…). „Alle Weiterleitungslinks“ zählt einen Klick auf irgendeinen davon: Wer zwei Buttons drückt, zählt einmal. Die Conversion-Rate ist der Anteil der Tagesbesucher, die es erreicht haben.',
  'stats.goalsEmpty':
    'Keine Ziele in diesem Zeitraum. Formularanfragen und Weiterleitungslinks /_cms/go/… zählen von selbst, Link-Klicks, sobald der Beacon in den Einstellungen an ist.',
  'stats.goalForm': 'Formular',
  'stats.goalLink': 'Link',
  'stats.goalGo': 'Weiterleitungslink',
  'stats.goalAllLinks': 'Alle Weiterleitungslinks',
  'stats.events': 'Insgesamt',
  'stats.bySource': 'Nach Quelle',
  'stats.byEntry': 'Nach Einstiegsseite',
  'stats.reached': 'Erreicht',
  'stats.base': 'Besucher',
  'settings.tabStats': 'Statistik',
  'statsSettings.title': 'Besucherstatistik',
  'statsSettings.intro':
    'Gezählt wird auf dem Server, ohne Cookies, localStorage oder Browser-Fingerprints. Adresse und Browser des Besuchers werden mit dem Salt des Tages zu einem kurzen Hash; das Salt liegt nur im Speicher des Servers und verschwindet um Mitternacht samt den Besuchern des Tages.',
  'statsSettings.enabled': 'Besucher zählen',
  'statsSettings.enabledHint':
    'Auf dem Gerät des Besuchers wird nichts gespeichert oder ausgelesen. Erwähnen Sie die Zählung in der Datenschutzerklärung der Website: ein Muster steht unten.',
  'statsSettings.timeZone': 'Zeitzone des Tages',
  'statsSettings.timeZoneHint':
    'Ein Statistiktag beginnt um Mitternacht in dieser Zeitzone. Leer — die Zeitzone des Servers.',
  'statsSettings.retention': 'Zusammenfassungen aufbewahren',
  'statsSettings.retentionForever': 'Unbegrenzt',
  'statsSettings.retentionDays': '{n} Tag|{n} Tage',
  'statsSettings.retentionHint':
    'Tageszusammenfassungen sind Zahlen ohne Personendaten; sie gehören zur Sicherung der Website.',
  'statsSettings.goalsTitle': 'Ziele',
  'statsSettings.goalsIntro':
    'Angenommene Anfragen aller Formulare sind von selbst Ziele. Einen Link-Klick sieht der Server nicht: Ihn meldet der Beacon, ein Skript unter einem Kilobyte ohne Cookies.',
  'statsSettings.beacon': 'Beacon für Ziel-Links',
  'statsSettings.beaconHint':
    'Eile fügt ihn selbst am Ende jeder Seite ein, Vorlagen bleiben unverändert. Das Skript liest nichts vom Gerät, sendet aber selbst eine Anfrage; rechtlich ist das weniger eindeutig als die Zählung auf dem Server, deshalb bleibt er aus, bis Sie ihn einschalten.',
  'statsSettings.links': 'Ziel-Links',
  'statsSettings.linksHint':
    'Eine pro Zeile, der Anfang einer Adresse: https://app.example.com/signup, /kontakt, tel: oder mailto:.',
  'statsSettings.save': 'Statistik-Einstellungen speichern',
  'statsSettings.saved': 'Statistik-Einstellungen gespeichert',
  'statsSettings.privacyTitle': 'Datenschutzerklärung',
  'statsSettings.privacyIntro':
    'Ein Musterabsatz zur Zählung von Eile, auf Deutsch und Englisch. Er beschreibt nur die Statistik: Lassen Sie die ganze Erklärung rechtlich prüfen.',
  'statsSettings.view': 'Statistik öffnen',
  'nav.proposals': 'Vorschläge',
  'proposals.title': 'Vorschläge von Agenten',
  'proposals.intro':
    'Ist die Prüfung an, gehen Änderungen von Agenten über MCP und API-Schlüssel nicht sofort live: Seiten, Templates, Komponenten und Skripte sammeln sich in Änderungssätzen, wie ein Pull Request. Sehen Sie sich Unterschiede und Vorschau an, dann nehmen Sie an oder lehnen ab.',
  'proposals.settings': 'Prüfung von Änderungen',
  'proposals.allAgents': 'Änderungen aller Agenten warten auf Prüfung',
  'proposals.allAgentsHint':
    'MCP und API-Schlüssel. Der Assistent im Manager ändert sofort: Sie sehen ihm zu. Die Prüfung für einen einzelnen Schlüssel schaltet sein Besitzer im Profilmenü unter „API-Schlüssel“ ein.',
  'proposals.linkDays': 'Vorschaulinks gelten, Tage',
  'proposals.settingsSaved': 'Prüfeinstellungen gespeichert',
  'proposals.pendingTab': 'Offen',
  'proposals.closedTab': 'Entschieden',
  'proposals.empty': 'Keine Vorschläge warten auf eine Entscheidung.',
  'proposals.emptyOff':
    'Die Prüfung ist aus: Änderungen von Agenten gehen sofort live. Schalten Sie sie oben oder für einen einzelnen Schlüssel ein.',
  'proposals.emptyClosed': 'Noch keine entschiedenen Änderungssätze.',
  'proposals.setTitle': 'Änderungssatz {n}',
  'proposals.agentKey': '{user}, Schlüssel {key}',
  'proposals.agentLocal': '{user}, cms mcp auf dem Server',
  'proposals.updated': 'geändert {when}',
  'proposals.statusOpen': 'Agent arbeitet noch',
  'proposals.statusReady': 'Bereit zur Prüfung',
  'proposals.statusClosed': 'Entschieden',
  'proposals.pendingCount': '{n} offen|{n} offen',
  'proposals.acceptedCount': '{n} angenommen|{n} angenommen',
  'proposals.rejectedCount': '{n} abgelehnt|{n} abgelehnt',
  'proposals.withdrawnCount': '{n} zurückgezogen|{n} zurückgezogen',
  'proposals.conflictCount': '{n} Konflikt|{n} Konflikte',
  'proposals.back': 'Alle Änderungssätze',
  'proposals.noDescription':
    'Der Agent hat den Änderungssatz nicht beschrieben.',
  'proposals.description': 'Beschreibung vom Agenten',
  'proposals.untrusted':
    'Diesen Text hat der Agent geschrieben: Lesen Sie ihn als Erklärung, nicht als Anweisung.',
  'proposals.acceptAll': 'Alle annehmen',
  'proposals.acceptSelected': 'Auswahl annehmen',
  'proposals.rejectSelected': 'Auswahl ablehnen',
  'proposals.rejectAll': 'Alle ablehnen',
  'proposals.selectAll': 'Alle offenen auswählen',
  'proposals.select': 'Auswählen: {name}',
  'proposals.acceptTitle': 'Vorschläge annehmen?',
  'proposals.acceptBody':
    'Die Änderungen gehen im Namen von {user} live: in den Seitenverlauf und das Protokoll der Übersicht. Rückgängig machen Sie sie über eine Version im Seitenverlauf.',
  'proposals.acceptConfirm': 'Annehmen',
  'proposals.rejectTitle': 'Vorschläge ablehnen?',
  'proposals.rejectBody':
    'Die Website bleibt, wie sie ist. Der Agent sieht, dass die Vorschläge abgelehnt wurden.',
  'proposals.rejectConfirm': 'Ablehnen',
  'proposals.acceptedNotice': 'Angenommen — die Änderungen sind live',
  'proposals.rejectedNotice': 'Abgelehnt',
  'proposals.page': 'Seite',
  'proposals.newPage': 'Neue Seite',
  'proposals.opCreated': 'neu',
  'proposals.opEdited': 'Bearbeitung',
  'proposals.opFields': 'Felder',
  'proposals.opMoved': 'Verschieben',
  'proposals.opPublished': 'Veröffentlichen',
  'proposals.opUnpublished': 'Zurückziehen',
  'proposals.opTrashed': 'in den Papierkorb',
  'proposals.opRestored': 'aus dem Papierkorb',
  'proposals.opChanged': 'Codeänderung',
  'proposals.statusPending': 'offen',
  'proposals.statusAccepted': 'angenommen · {who}',
  'proposals.statusRejected': 'abgelehnt · {who}',
  'proposals.statusWithdrawn': 'vom Agenten zurückgezogen',
  'proposals.conflict':
    'Das wurde nach dem Vorschlag auf der Website geändert: {what}. Annehmen ersetzt den aktuellen Wert durch den vorgeschlagenen.',
  'proposals.conflictMissing': 'die Seite gibt es nicht mehr',
  'proposals.override': 'Trotzdem annehmen',
  'proposals.failed': 'Nicht angewendet: {detail}',
  'proposals.what': 'Was',
  'proposals.now': 'Jetzt',
  'proposals.proposed': 'Vorgeschlagen',
  'proposals.was': 'der Agent sah: {value}',
  'proposals.tree': 'Platz im Baum',
  'proposals.topLevel': 'oberste Ebene',
  'proposals.source': 'Quelltext',
  'proposals.sameSource': 'Der Quelltext ist derselbe wie auf der Website.',
  'proposals.published': 'Veröffentlicht',
  'proposals.trashed': 'Im Papierkorb',
  'proposals.preview': 'Vorschau',
  'proposals.previewOn': 'Vorschau auf Seite',
  'proposals.share': 'Link für Kunden',
  'proposals.previewLimits':
    'Die Vorschau zeigt die Seite mit den Änderungen des Satzes: Text und Felder, vorgeschlagene Templates und Komponenten. Menüs und Listen zeigen die Website wie jetzt; Skripte und Inseln sind die Live-Versionen.',
  'proposals.elementTemplate': 'Template',
  'proposals.elementComponent': 'Komponente',
  'proposals.elementScript': 'Skript',
  'proposals.diffNow': 'jetzt',
  'proposals.diffProposed': 'vorgeschlagen',
  'proposals.unchanged': 'unverändert',
  'proposals.yes': 'ja',
  'proposals.no': 'nein',
  'shareLinks.title': 'Vorschaulinks',
  'shareLinks.body':
    'Ein Link zeigt den Entwurf ohne Anmeldung im Manager: nur diese Seite, mit dem Hinweis „nicht veröffentlicht“ und noindex für Suchmaschinen. Widerrufen Sie ihn, wenn er nicht mehr gebraucht wird.',
  'shareLinks.bodySet':
    'Der Link zeigt die Seite mit den noch nicht angenommenen Änderungen des Satzes. Der Code des Agenten läuft in der Vorschau in einer Sandbox.',
  'shareLinks.label': 'Für wen',
  'shareLinks.labelPlaceholder': 'Kunde: Küche nach Maß',
  'shareLinks.days': 'Tage',
  'shareLinks.create': 'Link erstellen',
  'shareLinks.issued':
    'Der Link ist erstellt. Kopieren Sie ihn jetzt: Er wird nicht noch einmal vollständig angezeigt.',
  'shareLinks.copy': 'Link kopieren',
  'shareLinks.copied': 'Link kopiert',
  'shareLinks.empty': 'Noch keine Links.',
  'shareLinks.expires': 'bis {when}',
  'shareLinks.expired': 'abgelaufen {when}',
  'shareLinks.uses': '{n}-mal geöffnet|{n}-mal geöffnet',
  'shareLinks.unnamed': 'Ohne Bezeichnung',
  'shareLinks.revoke': 'Widerrufen',
  'shareLinks.revokeTitle': 'Link widerrufen?',
  'shareLinks.revokeBody': 'Die Vorschau öffnet sich damit sofort nicht mehr.',
  'shareLinks.revoked': 'Link widerrufen',
  'shareLinks.open': 'Link für Kunden',
  'tokens.review': 'Änderungen warten auf Prüfung',
  'tokens.reviewHint':
    'Seiten und Elemente über diesen Schlüssel werden zu Vorschlägen unter „Vorschläge“.',
  'tokens.reviewAll': 'Die Prüfung ist für alle Agenten an.',
  // Аналитика клиентского пути (ADR 0072): люди, карточка, журнал событий, настройка.
  'analytics.sections': 'Bereiche der Statistik',
  'analytics.helpFor': 'Hilfe: {name}',
  'analytics.visits': 'Besuche',
  'analytics.people': 'Personen',
  'analytics.setup': 'Einrichtung',
  'analytics.forbiddenTitle':
    'Die Analyse des Kundenwegs ist nicht für Ihre Rolle',
  'analytics.forbiddenText':
    'Hier stehen Quellen, Trichter, Labels und die Geschichte der Personen aus Ereignissen samt Umsatz: Sie sieht, wer das Recht auf Personen hat. Die Besuche der Website sind für alle Manager offen.',
  'analytics.toVisits': 'Zu den Besuchen',
  'analytics.role': 'Rolle',
  'analytics.roleTouch': 'Kontakt',
  'analytics.roleSurvey': 'Umfrage',
  'analytics.roleTrial': 'Testphase',
  'analytics.rolePayment': 'Zahlung',
  'analytics.roleRefund': 'Erstattung',
  'analytics.roleAmendment': 'Zahlungskorrektur',
  'analytics.roleLapse': 'Zugang beendet',
  'analytics.roleAction': 'Aktion',
  'analytics.roleSummary': 'Tagesübersicht',
  'analytics.roleErasure': 'Löschung',
  'analytics.stateNew': 'Neu',
  'analytics.stateTrial': 'Testphase',
  'analytics.stateCustomer': 'Kunde',
  'analytics.stateReturned': 'Zurückgekehrt',
  'analytics.stateLapsed': 'Abgewandert',
  'analytics.kindString': 'Zeichenkette',
  'analytics.kindNumber': 'Zahl',
  'analytics.kindMoney': 'Geldbetrag',
  'analytics.kindDate': 'Datum',
  'analytics.kindBoolean': 'Ja oder nein',
  'analytics.kindChoice': 'Auswahl aus einem Verzeichnis',
  'analytics.purposeValues': 'Optionen einer Eigenschaft',
  'analytics.purposeAnswers': 'Antworten auf eine Umfragefrage',
  'analytics.purposeParts': 'Teil der Kennung',
  'analytics.groupSender': 'Absender',
  'analytics.groupType': 'Ereignistyp',
  'analytics.groupProperty': 'Eigenschaft',
  'analytics.groupDictionary': 'Verzeichnis',
  'analytics.groupValue': 'Wert',
  'analytics.groupSchema': 'Kennungsschema',
  'analytics.groupReferrer': 'Verweisregel',
  'analytics.groupLink': 'Weiterleitungslink',
  'analytics.groupMilestone': 'Meilenstein',
  'analytics.groupFunnel': 'Trichter',
  'analytics.referrerHost': 'Website nach Host',
  'analytics.referrerAny': 'Jede andere Website',
  'analytics.referrerNone': 'Direkter Aufruf',
  'analytics.hostValue': 'Host des Verweises',
  'analytics.sender': 'Absender',
  'analytics.test': 'Test',
  'analytics.testMark': 'Test',
  'analytics.future': 'aus der Zukunft',
  'analytics.futureHint':
    'Die Ereigniszeit liegt mehr als eine Stunde nach dem Empfang: Die Uhr des Absenders geht vor.',
  'analytics.unknownType': 'unbekannter Typ {code}',
  'analytics.unknownTypeTitle': 'Unbekannter Typ {code}',
  'analytics.noRole': 'keine: Der Typ steht nicht im Verzeichnis',
  'analytics.showBody': 'Inhalt',
  'analytics.body': 'Originalinhalt',
  'analytics.bodyTitle': 'Originalinhalt des Ereignisses',
  'analytics.bodyHint':
    'Der Inhalt, wie der Absender ihn geschickt hat. Fremde Systeme schreiben ihn, deshalb steht er hier nur als Text.',
  'analytics.copyBody': 'Inhalt kopieren',
  'analytics.eventAt': 'Zeit des Ereignisses',
  'analytics.receivedAt': 'Empfangen',
  'analytics.originFile': 'aus einer Datei',
  'analytics.originHttp': 'über das Netz',
  'people.title': 'Personen',
  'people.filters': 'Filter für Personen',
  'people.state': 'Zustand',
  'people.allStates': 'Alle Zustände',
  'people.sender': 'Absender',
  'people.allSenders': 'Alle Absender',
  'people.subjectStart': 'Pseudonym beginnt mit',
  'people.showTest': 'Testpersonen zeigen',
  'people.resetFilters': 'Filter zurücksetzen',
  'people.offWithData':
    'Der Ereignisempfang ist aus: Die Website nimmt keine neuen Ereignisse an, der Verlauf unten bleibt, wie er war.',
  'people.toSwitch': 'In den Einstellungen einschalten',
  'people.stale':
    'Nach der neuen Einrichtung wird noch {n} Person neu berechnet — die Liste aktualisiert sich selbst.|Nach der neuen Einrichtung werden noch {n} Personen neu berechnet — die Liste aktualisiert sich selbst.',
  'people.turnOn': 'Empfang einschalten',
  'people.offTitle': 'Der Ereignisempfang ist aus',
  'people.offText':
    'Personen entstehen aus den Ereignissen eines Bots, Shops oder einer App. Schalten Sie den Empfang im Tab „Statistik“ der Einstellungen ein, ergänzen Sie aber vorher die Datenschutzerklärung: Ein Muster steht dort.',
  'people.offTextReader':
    'Personen entstehen aus den Ereignissen eines Bots, Shops oder einer App, sobald ein Administrator den Ereignisempfang einschaltet.',
  'people.toSenders': 'Zu den Absendern',
  'people.noEventsTitle': 'Noch keine Ereignisse',
  'people.noEventsText':
    'Der Empfang ist an, aber es kam noch kein Ereignis. Legen Sie einen Absender an und geben Sie seinen Schlüssel dem Bot oder Shop — oder laden Sie den Verlauf als Datei hoch.',
  'people.staleTitle': 'Personen werden neu berechnet',
  'people.staleText':
    'Die Einrichtung hat sich geändert, der Server baut die Personen nach den neuen Rollen neu auf. Das dauert meist Sekunden; die Liste aktualisiert sich selbst.',
  'people.nobody': 'Auf diese Filter passt niemand.',
  'people.testOnly':
    'Noch keine echten Personen: Es gibt Ereignisse, aber nur Testereignisse. Personen nur aus Testereignissen erscheinen mit „Testpersonen zeigen“.',
  'people.noneYet':
    'Es gibt keine Personen: Ihre Verläufe wurden gelöscht, die übrigen Ereignisse haben kein Pseudonym.',
  'people.total': '{n} Person|{n} Personen',
  'people.subject': 'Pseudonym',
  'people.senders': 'Absender',
  'people.firstTouch': 'Erster Kontakt',
  'people.payments': 'Zahlungen',
  'people.revenue': 'Umsatz',
  'people.lastEvent': 'Letztes Ereignis',
  'people.noLabel': 'ohne Kennung',
  'people.touchConflict': 'verschiedene erste Kontakte',
  'person.testOnly': 'nur Testereignisse',
  'person.eventsCount': '{n} Ereignis|{n} Ereignisse',
  'person.span': 'vom {from} bis {to}',
  'person.touchConflict':
    'Die Absender haben verschiedene erste Kontakte geschickt: Verwendet wird der früheste nach Ereigniszeit.',
  'person.repeatConflicts':
    '{n} Ereignis kam erneut mit anderem Inhalt: Das erste bleibt.|{n} Ereignisse kamen erneut mit anderem Inhalt: Die ersten bleiben.',
  'person.invalid':
    '{n} Ereignis passt nicht zur Rolle seines Typs: Es zählt für die Person nicht.|{n} Ereignisse passen nicht zur Rolle ihres Typs: Sie zählen für die Person nicht.',
  'person.origin': 'Woher die Person kam',
  'person.lastTouch': 'Letzter Kontakt',
  'person.payments': 'Zahlungen',
  'person.fees': 'Gebühren',
  'person.firstPaid': 'Erste Zahlung',
  'person.lastPaid': 'Letzte Zahlung',
  'person.paidUntil': 'Bezahlt bis',
  'person.lapsedAt': 'Zugang beendet',
  'person.returnedAt': 'Zurückgekehrt',
  'person.trial': 'Testphase',
  'person.unmatched': 'Ohne eigene Zahlung',
  'person.unmatchedHint':
    'Erstattungen und Korrekturen in ihrer eigenen Währung gezählt',
  'person.answers': 'Antworten der Umfrage',
  'person.noAnswers': 'Keine Antworten auf die Umfrage.',
  'person.outside': 'nicht im Verzeichnis',
  'person.traits': 'Merkmale',
  'person.noTraits': 'Keine Merkmale.',
  'person.conflicts': 'Wiederholungskonflikte',
  'person.conflictsHint':
    'Der Absender hat unter einer schon angenommenen id einen anderen Inhalt geschickt: Das erste Ereignis bleibt, der letzte abweichende Inhalt ist gespeichert.',
  'person.conflictCount': 'Mal',
  'person.conflictLast': 'Zuletzt',
  'person.feed': 'Ereignisse',
  'person.more': 'Mehr zeigen',
  'person.eraseHeading': 'Verlauf löschen',
  'person.eraseIntro':
    'Löscht alle Ereignisse dieses Pseudonyms von allen Absendern — etwa auf Wunsch der Person. Sie lassen sich nicht zurückholen.',
  'person.erase': 'Verlauf löschen',
  'person.eraseTitle': 'Verlauf dieser Person löschen?',
  'person.eraseBody':
    'Alle Ereignisse der Person von allen Absendern werden endgültig gelöscht. Es bleibt nur ein Löschvermerk — ein nicht umkehrbarer Hashwert des Pseudonyms und der Zeitpunkt —, damit eine erneute Sendung, eine alte Datei oder eine Sicherung den Verlauf nicht zurückbringt.',
  'person.erased': '{n} Ereignis gelöscht|{n} Ereignisse gelöscht',
  'person.missingTitle': 'Diese Person gibt es nicht',
  'person.missingText':
    'Dieses Pseudonym hat keine Ereignisse: Der Verlauf wurde gelöscht, oder die Adresse hat einen Tippfehler.',
  'person.toPeople': 'Zu den Personen',
  'eventLog.title': 'Ereignisprotokoll',
  'eventLog.filters': 'Filter des Ereignisprotokolls',
  'eventLog.type': 'Typ',
  'eventLog.allTypes': 'Alle Typen',
  'eventLog.allRoles': 'Alle Rollen',
  'eventLog.from': 'Von',
  'eventLog.to': 'Bis',
  'eventLog.testFilter': 'Testereignisse',
  'eventLog.testAll': 'Alle Ereignisse',
  'eventLog.testNo': 'Ohne Testereignisse',
  'eventLog.testOnly': 'Nur Testereignisse',
  'eventLog.hint':
    'Neueste zuerst. Die Rolle folgt dem aktuellen Typverzeichnis, die Daten der Ereigniszeit in UTC.',
  'eventLog.noOlder': 'Es gibt keine älteren Ereignisse.',
  'eventLog.nothing': 'Auf diese Filter passen keine Ereignisse.',
  'eventLog.empty': 'Noch keine Ereignisse.',
  'eventLog.newest': 'Zu den neuesten',
  'eventLog.at': 'Zeit',
  'eventLog.fields': 'Felder der Rolle',
  'eventLog.pages': 'Seiten des Protokolls',
  'eventLog.older': 'Älter',
  'eventImport.open': 'Datei hochladen',
  'eventImport.title': 'Ereignisse aus einer Datei laden',
  'eventImport.intro':
    'Eine Datei im Format JSON Lines: ein Ereignis pro Zeile, wie der Absender sie schickt. Erst eine Prüfung ohne Schreiben, dann das Hochladen; dieselbe Datei noch einmal zu laden verdoppelt nichts.',
  'eventImport.off':
    'Der Ereignisempfang ist aus: Die Datei wird weder geprüft noch hochgeladen.',
  'eventImport.noSender':
    'Die Website hat keinen aktiven Absender, und Ereignisse aus einer Datei werden in seinem Namen angenommen.',
  'eventImport.toSenders': 'Absender anlegen',
  'eventImport.pickSender': 'Absender wählen',
  'eventImport.senderHint':
    'Die Zeilen der Datei nennen keinen Absender: Das tut diese Auswahl, wie der Schlüssel bei einem Ereignis über das Netz.',
  'eventImport.oneSender': 'Absender: {name}, der einzige der Website.',
  'eventImport.file': 'Datei',
  'eventImport.fileHint':
    'Bis 16 MiB, eine Zeile bis 64 KB. Größere Dateien laden Sie auf dem Server mit cms events import.',
  'eventImport.picked': 'Datei gewählt: {size}.',
  'eventImport.tooLarge':
    'Die Datei hat {size}, mehr als 16 MiB. Laden Sie sie auf dem Server so hoch:',
  'eventImport.checkedTitle': 'Prüfung ohne Schreiben',
  'eventImport.checkedText':
    'Nichts wurde geschrieben: So wird das Hochladen dieser Datei verlaufen.',
  'eventImport.loadedTitle': 'Hochgeladen',
  'eventImport.loadedText':
    'Die Ereignisse sind angenommen, die Personen neu berechnet.',
  'eventImport.people':
    'Personen mit angenommenen oder gelöschten Ereignissen: {n}.',
  'eventImport.lines': 'Zeilen',
  'eventImport.accepted': 'Angenommen',
  'eventImport.duplicates': 'Wiederholungen',
  'eventImport.conflicts': 'Konflikte',
  'eventImport.erasures': 'Löschungen',
  'eventImport.erased': 'Vorher gelöscht',
  'eventImport.rejected': 'Abgelehnt',
  'eventImport.empty': 'Leer',
  'eventImport.errors': 'Fehler',
  'eventImport.line': 'Zeile',
  'eventImport.path': 'Feld',
  'eventImport.reason': 'Grund',
  'eventImport.moreErrors':
    'Gezeigt sind die ersten {shown} von {total} Fehlern: Beheben Sie sie und prüfen Sie die Datei erneut.',
  'eventImport.warnings': 'Warnungen zu angenommenen Zeilen',
  'eventImport.warnUnknownType':
    'Unbekannter Typ: Das Ereignis ist ohne Rolle angenommen, den Typ legen Sie unter „Unbekannte“ an',
  'eventImport.warnFuture':
    'Die Ereigniszeit liegt mehr als eine Stunde nach dem Empfang',
  'eventImport.warnInvalidValue':
    'Ungültiger Wert in {path}: zählt weder für Dimensionen noch für die Person',
  'eventImport.warnUnknownValue': 'Wert nicht im Verzeichnis in {path}',
  'eventImport.check': 'Prüfen',
  'eventImport.checkAgain': 'Erneut prüfen',
  'eventImport.load': 'Hochladen',
  'eventImport.done': '{n} Ereignis angenommen|{n} Ereignisse angenommen',
  'setupForm.newSender': 'Neuer Absender',
  'setupForm.editSender': 'Absender {name}',
  'setupForm.newType': 'Neuer Ereignistyp',
  'setupForm.editType': 'Ereignistyp {name}',
  'setupForm.newProperty': 'Neue Eigenschaft oder neues Merkmal',
  'setupForm.editProperty': 'Eigenschaft {name}',
  'setupForm.newDictionary': 'Neues Verzeichnis',
  'setupForm.editDictionary': 'Verzeichnis {name}',
  'setupForm.newValue': 'Neuer Wert',
  'setupForm.editValue': 'Wert {name}',
  'setupForm.newSchema': 'Neues Kennungsschema',
  'setupForm.editSchema': 'Kennungsschema {name}',
  'setupForm.newReferrer': 'Neue Verweisregel',
  'setupForm.editReferrer': 'Verweisregel {name}',
  'setupForm.newLink': 'Neuer Weiterleitungslink',
  'setupForm.editLink': 'Weiterleitungslink {name}',
  'setupForm.newMilestone': 'Neuer Meilenstein',
  'setupForm.editMilestone': 'Meilenstein {name}',
  'setupForm.newFunnel': 'Neuer Trichter',
  'setupForm.editFunnel': 'Trichter {name}',
  'setupForm.sender': 'Absender',
  'setupForm.scope': 'Bereich',
  'setupForm.scopeEvent': 'Eigenschaft von Ereignissen (data)',
  'setupForm.scopePerson': 'Personenmerkmal (traits)',
  'setupForm.dictionary': 'Verzeichnis',
  'setupForm.pick': 'Wählen…',
  'setupForm.ownerRequired': 'Wählen Sie, wozu das Element gehört.',
  'setupForm.code': 'Code',
  'setupForm.codeFixed':
    'Der Code ändert sich nicht: Ein neuer Code ist ein neues Element.',
  'setupForm.codeHint':
    'Kleine lateinische Buchstaben, Ziffern, _ und -, bis {n} Zeichen. Später nicht änderbar.',
  'setupForm.codeTaken':
    'Diesen Code gibt es schon: Öffnen Sie jenes Element oder nehmen Sie einen anderen Code.',
  'setupForm.partValueHint':
    'Ein Wert des Teils: kleine lateinische Buchstaben und Ziffern, innen einzelne _ oder -, bis {n} Zeichen: ig, spring-sale, ad_2. Später nicht änderbar.',
  'setupForm.name': 'Name',
  'setupForm.nameHint': 'Der Name hat 1 bis {n} Zeichen.',
  'setupForm.note': 'Notiz',
  'setupForm.optional': 'optional',
  'setupForm.noteHint': 'Die Notiz hat bis {n} Zeichen.',
  'setupForm.enabled': 'Ereignisse dieses Absenders annehmen',
  'setupForm.enabledHint':
    'Aus: Seine Ereignisse werden mit 401 abgelehnt, die Schlüssel bleiben. Einschalten, und sie gelten wieder.',
  'setupForm.senderKeyHint':
    'Der Schlüssel erscheint direkt nach dem Anlegen — nur einmal: Kopieren Sie ihn dann.',
  'setupForm.roleHint':
    'Die Rolle sagt, was das Ereignis für Personen und Berichte bedeutet. Die Felder der Rolle prüft der Server streng.',
  'setupForm.roleFields': 'Felder der Rolle in data:',
  'setupForm.roleNoFields': 'Die Rolle hat keine eigenen Felder.',
  'setupForm.roleNoSubject':
    'Ein solches Ereignis hat kein Pseudonym: Es ist die Tageszählung des Absenders.',
  'setupForm.requiredShort': 'Pflicht',
  'setupForm.roleRequired': 'Wählen Sie eine Rolle.',
  'setupForm.recountNew':
    'Personen, „Quellen“ und „Trichter“: Ein neuer Typ gibt den schon eingegangenen Ereignissen mit diesem Code eine Rolle, und die Personen werden neu berechnet.',
  'setupForm.recountChange':
    'Personen, „Quellen“ und „Trichter“: Eine andere Rolle ändert die Bedeutung aller Ereignisse dieses Typs, und die Personen werden neu berechnet.',
  'setupForm.recountTitle': 'Rolle des Typs ändern?',
  'setupForm.recountBody':
    'Alle Ereignisse dieses Typs bekommen die neue Rolle, und der Server berechnet die Personen neu. Solange das läuft, sagt es die Personenliste.',
  'setupForm.recountConfirm': 'Ändern und neu berechnen',
  'setupForm.effects': 'Was sich ändert:',
  'setupForm.effectDimension':
    'Filter und Gruppen der Berichte: Die Dimension erscheint in „Quellen“ und „Personen“ oder verschwindet dort. Die Personen werden neu berechnet.',
  'setupForm.effectParts':
    '„Quellen“, „Kennungen“ und die Kennungen der Weiterleitungslinks: Die Teile werden nach der aktuellen Einrichtung gelesen, auch bei bisherigen Personen.',
  'setupForm.effectReferrer':
    'die Kennungen der Weiterleitungslinks und die Besuchsschritte der Trichter, auch für vergangene Tage: Die Teile eines Besuchs folgen den aktuellen Regeln.',
  'setupForm.effectLink':
    'wohin der Link führt, welche Kennung er mitgibt, und seine Ziele in „Besuche“.',
  'setupForm.effectMilestone':
    'die Spalte des Meilensteins in „Quellen“ und die Trichterschritte damit; die Personen werden neu berechnet.',
  'setupForm.effectFunnel': 'nur dieser Trichter.',
  'setupForm.properties': 'Eigenschaften',
  'setupForm.noProperties':
    'Noch keine Eigenschaften von Ereignissen: Legen Sie sie im Tab „Eigenschaften und Merkmale“ an.',
  'setupForm.required': 'Pflicht',
  'setupForm.propertiesHint':
    'Eine Eigenschaft gilt für die ganze Website, der Typ macht sie zur Pflicht: Ein Ereignis dieses Typs ohne Pflichteigenschaft wird abgelehnt.',
  'setupForm.propertiesLimit': 'Ein Typ hat höchstens {n} Eigenschaften.',
  'setupForm.kind': 'Art',
  'setupForm.kindRequired': 'Wählen Sie eine Art.',
  'setupForm.dictionaryHint':
    'Ein Auswahlwert ist ein Code aus diesem Verzeichnis.',
  'setupForm.dictionaryRequired':
    'Eine Auswahl braucht ein Verzeichnis mit Werten.',
  'setupForm.dimension': 'Dimension',
  'setupForm.dimensionHint':
    'Berichte filtern und gruppieren danach. Nur bei Auswahl, Zahl und Ja oder nein.',
  'setupForm.untrusted': 'Fremdtext',
  'setupForm.untrustedHint':
    'Menschen schreiben ihn: Auf dem Bildschirm steht er nur als Text, der Agent bekommt ihn markiert. Nur bei Zeichenketten, nie als Dimension.',
  'setupForm.sensitive':
    'Legen Sie keine Eigenschaften zu Gesundheit, Religion, politischer Meinung, Sexualleben und Ähnlichem an (Art. 9 DSGVO): Solche Daten gehören nicht in Ereignisse.',
  'setupForm.purpose': 'Zweck',
  'setupForm.purposeValuesHint':
    'Die Optionen einer Auswahleigenschaft, etwa Größen oder Regionen.',
  'setupForm.purposeAnswersHint':
    'Eine Umfragefrage: Der Code des Verzeichnisses ist data.question des Ereignisses, seine Werte sind die Antworten.',
  'setupForm.purposePartsHint':
    'Ein Teil der Kennung: Quelle, Kanal, Kampagne … Aus seinen Werten entsteht die Kennung von Weiterleitungslinks und Generator.',
  'setupForm.position': 'Reihenfolge',
  'setupForm.positionHelp':
    'Platz in der Liste der Werte; leer stellt ihn ans Ende.',
  'setupForm.positionHint':
    'Die Reihenfolge ist eine ganze Zahl von 0 bis {n}.',
  'setupForm.marks': 'Kennzeichen',
  'setupForm.save': 'Speichern',
  'setupForm.saved': 'Gespeichert',
  'setupForm.createSender': 'Absender anlegen',
  'setupForm.createType': 'Typ anlegen',
  'setupForm.createProperty': 'Eigenschaft anlegen',
  'setupForm.createDictionary': 'Verzeichnis anlegen',
  'setupForm.createValue': 'Wert hinzufügen',
  'setupForm.createSchema': 'Schema anlegen',
  'setupForm.createReferrer': 'Regel anlegen',
  'setupForm.createLink': 'Link anlegen',
  'setupForm.createMilestone': 'Meilenstein anlegen',
  'setupForm.createFunnel': 'Trichter anlegen',
  'setupList.name': 'Name',
  'setupList.actions': 'Aktionen',
  'setupList.edit': 'Bearbeiten',
  'setupList.toArchive': 'Archivieren',
  'setupList.fromArchive': 'Aus dem Archiv holen',
  'setupList.inArchive': 'archiviert',
  'setupList.remove': 'Löschen',
  'setupList.archived': '{name} ist archiviert',
  'setupList.restored': '{name} ist wieder in Gebrauch',
  'setupList.removeTitle': '{name} löschen?',
  'setupList.removeBody':
    'Das Element wird endgültig gelöscht, sein Code wird frei.',
  'setupList.removeSenderBody':
    'Der Absender wird mit seinen Schlüsseln gelöscht: Seine Ereignisse werden nicht mehr angenommen, der Code wird frei.',
  'setupList.removed': 'Gelöscht: {name}',
  'setupList.inUseTitle': '{name} lässt sich nicht löschen',
  'setupList.inUseUsers':
    'Die Elemente unten verweisen darauf. Entfernen Sie die Verweise oder archivieren Sie es: Archiviert wird es in Formularen nicht angeboten, gilt aber in vergangenen Ereignissen.',
  'setupList.inUseEvents':
    'Es hat Ereignisse. Archivieren Sie es stattdessen: Archiviert wird es in Formularen nicht angeboten, gilt aber in vergangenen Ereignissen.',
  'setupList.archiveInstead': 'Archivieren',
  'setupList.usedByType': 'Ereignistyp {name}',
  'setupList.usedByProperty': 'Eigenschaft {name}',
  'setupList.usedByValue': 'Wert {name}',
  'setupList.usedBySchema': 'Kennungsschema {name}',
  'setupList.usedByReferrer': 'Verweisregel {name}',
  'setupList.usedByLink': 'Weiterleitungslink {name}',
  'setupList.usedByMilestone': 'Meilenstein {name}',
  'setupList.usedByFunnel': 'Trichter {name}',
  'setupList.toSenders': 'Zu den Absendern',
  'setupList.toDictionaries': 'Zu den Verzeichnissen',
  'setupList.toSchemas': 'Zum Kennungsschema',
  'setupList.toTypes': 'Zu den Ereignistypen',
  'senders.title': 'Absender',
  'senders.intro':
    'Ein Absender ist ein Bot, Shop oder eine App, die Ereignisse schickt. Anlegen und ändern kann ihn nur, wer im Manager angemeldet ist; der Schlüssel erscheint einmal.',
  'senders.new': 'Neuer Absender',
  'senders.empty':
    'Noch keine Absender. Legen Sie den ersten an und erhalten Sie gleich seinen Schlüssel.',
  'senders.on': 'nimmt Ereignisse an',
  'senders.off': 'aus',
  'senders.turnOff': 'Ausschalten',
  'senders.turnOn': 'Einschalten',
  'senders.disabled': '{name}: Ereignisse werden nicht mehr angenommen',
  'senders.enabled': '{name}: Ereignisse werden wieder angenommen',
  'senders.keys': 'Schlüssel',
  'senders.noKeys':
    'Keine Schlüssel: Die Ereignisse des Absenders werden abgelehnt. Stellen Sie einen Schlüssel aus.',
  'senders.issued': 'ausgestellt {when}',
  'senders.used': 'zuletzt genutzt {when}',
  'senders.unused': 'noch nicht genutzt',
  'senders.revoke': 'Widerrufen',
  'senders.revokeTitle': 'Schlüssel {label} widerrufen?',
  'senders.revokeBody':
    'Der Server nimmt Ereignisse mit diesem Schlüssel sofort nicht mehr an. Prüfen Sie, dass der Absender schon den neuen Schlüssel nutzt.',
  'senders.revokeLastBody':
    'Das ist der letzte Schlüssel: Bis Sie einen neuen ausstellen, werden die Ereignisse des Absenders abgelehnt.',
  'senders.revoked': 'Schlüssel widerrufen',
  'senders.issue': 'Neuer Schlüssel',
  'senders.issueTitle': 'Neuer Schlüssel für {name}',
  'senders.issueBody':
    'Stellen Sie einen neuen Schlüssel aus, stellen Sie den Absender darauf um und widerrufen Sie dann den alten: Kein Ereignis geht verloren.',
  'senders.keyLabel': 'Bezeichnung',
  'senders.keyLabelHint':
    'Wo der Schlüssel liegen wird, bis {n} Zeichen; leer nimmt den Namen des Absenders.',
  'senders.keysFull':
    'Der Absender hat schon {n} Schlüssel: Widerrufen Sie einen, den er nicht mehr braucht.',
  'senderKey.title': 'Absenderschlüssel für {name}',
  'senderKey.once':
    'Der Schlüssel erscheint nur einmal. Kopieren Sie ihn jetzt in die Einstellungen des Absenders: Nach dem Schließen sind nur noch Bezeichnung und die letzten vier Zeichen zu sehen.',
  'senderKey.key': 'Schlüssel',
  'senderKey.label': 'Bezeichnung: {label} · endet auf {hint}',
  'senderKey.copied': 'Schlüssel kopiert',
  'senderKey.url': 'Adresse des Empfängers',
  'senderKey.copyUrl': 'Adresse kopieren',
  'senderKey.example': 'Prüfung mit einem Befehl',
  'senderKey.exampleHint':
    'Ein Testereignis: Im Ereignisprotokoll steht es als Test, zu den Personen zählt es nicht.',
  'senderKey.copyExample': 'Befehl kopieren',
  'senderKey.guide':
    'Was der Absender sendet und wie die Website antwortet, steht in der Anleitung für Entwickler',
  'senderKey.off':
    'Der Ereignisempfang ist gerade aus: Der Server antwortet mit 503, bis er im Tab „Statistik“ der Einstellungen eingeschaltet wird.',
  'senderKey.done': 'Fertig',
  'eventTypes.title': 'Ereignistypen',
  'eventTypes.intro':
    'Ein Typ ist ein Ereignis, das der Betreiber beschrieben hat: Code beim Absender, Name, Rolle und Eigenschaften. Die Rolle entscheidet, was das Ereignis für Personen und Berichte bedeutet.',
  'eventTypes.new': 'Neuer Ereignistyp',
  'eventTypes.empty':
    'Dieser Absender hat keine Typen: Seine Ereignisse sind bisher unbekannt.',
  'eventTypes.noSenders':
    'Legen Sie zuerst einen Absender an: Ein Typ gehört zu ihm.',
  'properties.title': 'Eigenschaften und Merkmale',
  'properties.events': 'Eigenschaften von Ereignissen',
  'properties.eventsHint':
    'Felder in data des Ereignisses, für die ganze Website; zur Pflicht macht sie der Typ.',
  'properties.traits': 'Personenmerkmale',
  'properties.traitsHint':
    'Felder in traits jedes Ereignisses: Für die Person gilt der Wert des zeitlich letzten Ereignisses.',
  'properties.newEvent': 'Neue Eigenschaft',
  'properties.newTrait': 'Neues Merkmal',
  'properties.empty': 'Noch nichts angelegt.',
  'dictionaries.title': 'Verzeichnisse',
  'dictionaries.intro':
    'Ein Verzeichnis enthält die Werte einer Auswahleigenschaft, die Antworten auf eine Umfragefrage oder die Werte eines Kennungsteils. Ein archivierter Wert bleibt in vergangenen Ereignissen bekannt.',
  'dictionaries.new': 'Neues Verzeichnis',
  'dictionaries.empty': 'Noch keine Verzeichnisse.',
  'dictionaries.values': '{n} Wert|{n} Werte',
  'dictionaries.addValue': 'Wert hinzufügen',
  'dictionaries.noValues': 'Keine Werte.',
  'dictionaries.position': 'Nr.',
  'dictionaries.up': '{name} nach oben',
  'dictionaries.upShort': 'Nach oben',
  'dictionaries.down': '{name} nach unten',
  'dictionaries.downShort': 'Nach unten',
  'dictionaries.noUtm': 'ohne UTM',
  'dictionaries.utm': 'UTM-Parameter',
  'dictionaries.utmNone': 'Keiner',
  'dictionaries.utmUsed': '{utm} — beim Teil {name}',
  'dictionaries.utmHint':
    'Ein Besuch mit diesem Parameter gibt dem Teil seinen Wert, und der Weiterleitungslink gibt ihn in der Kennung weiter. Ein Parameter — ein Teil; ohne Parameter setzen Weiterleitungslinks und Verweisregeln den Teil.',
  'dictionaries.length': 'Höchstlänge eines Werts',
  'dictionaries.lengthHelp':
    '1 bis {n} Zeichen. Die Höchstlängen der Teile samt Trennzeichen müssen in die Höchstlänge der Kennung des Schemas passen.',
  'dictionaries.lengthHint':
    'Die Höchstlänge ist eine ganze Zahl von 1 bis {n}.',
  'dictionaries.utmTaken':
    '{utm} füllt schon den Teil {name}: ein Parameter — ein Teil.',
  'dictionaries.valueTooLong':
    'Die Höchstlänge muss zum längsten Wert passen: {value} ist länger als {n} Zeichen.',
  'dictionaries.schemaOverflow':
    'Im Schema {name} bräuchten die Teile samt Trennzeichen bis zu {total} Zeichen, die Kennung erlaubt {n}.',
  'dictionaries.valueNotPart':
    'Der Wert {value} taugt nicht als Wert eines Kennungsteils: _ oder - stehen am Rand oder doppelt. Teile brauchen strengere Werte als Codes.',
  'dictionaries.purposeLocked':
    'Der Zweck bleibt, solange das Verzeichnis verwendet wird: {users}.',
  'schemas.title': 'Kennungsschema',
  'schemas.intro':
    'Das Schema legt fest, aus welchen Teilen und in welcher Reihenfolge die Kennung eines Absenders besteht: Danach bauen Weiterleitungslinks und Generator Kennungen, und Personen erhalten die Teile ihres ersten und letzten Kontakts. Ein Absender hat ein Schema.',
  'schemas.new': 'Neues Schema',
  'schemas.empty':
    'Noch kein Kennungsschema. Legen Sie eines für den Absender an, der die Kennung empfängt, etwa einen Bot mit Startparameter.',
  'schemas.emptyNoSenders':
    'Ein Schema gehört zu einem Absender: Legen Sie zuerst den Absender an.',
  'schemas.emptyNoParts':
    'Ein Schema besteht aus Kennungsteilen. Legen Sie diese zuerst an — Verzeichnisse mit dem Zweck „Teil der Kennung“: Quelle, Kanal, Kampagne.',
  'schemas.senderColumn': 'Absender',
  'schemas.parts': 'Teile der Reihe nach',
  'schemas.separator': 'Trennzeichen',
  'schemas.lengthColumn': 'Länge',
  'schemas.countShort': '{total} von {n}',
  'schemas.taken': 'Dieser Absender hat schon ein Schema: Öffnen Sie es.',
  'schemas.senderRequired': 'Wählen Sie einen Absender.',
  'schemas.noFreeSenders': 'Jeder Absender hat schon ein Schema.',
  'schemas.senderHint':
    'Kennungen dieses Absenders werden nach dem Schema gelesen; ein Absender hat ein Schema.',
  'schemas.lengthHint':
    'Die Höchstlänge der Kennung ist eine ganze Zahl von 1 bis {n}.',
  'schemas.partsHint': 'Ein Schema hat 1 bis {n} Teile.',
  'schemas.overflow':
    'Die Teile samt Trennzeichen brauchen bis zu {total} Zeichen, die Kennung erlaubt nur {n}: Senken Sie die Höchstlängen der Teile, nehmen Sie weniger Teile oder erhöhen Sie die Höchstlänge der Kennung.',
  'schemas.separatorHint':
    'Es steht zwischen den Teilen und nie in einem Wert. Für Telegram eignen sich __ und --: Ein Startparameter erlaubt nur lateinische Buchstaben, Ziffern, _ und -.',
  'schemas.length': 'Höchstlänge der Kennung',
  'schemas.lengthHelp':
    '1 bis {n} Zeichen; 64 ist die Grenze eines Telegram-Startparameters.',
  'schemas.noParts':
    'Es gibt keine Kennungsteile: Legen Sie Verzeichnisse mit dem Zweck „Teil der Kennung“ an.',
  'schemas.partLimit': 'bis {n} Zeichen',
  'schemas.removePart': 'Teil {name} entfernen',
  'schemas.removePartShort': 'Entfernen',
  'schemas.addPart': 'Teil hinzufügen',
  'schemas.pickPart': 'Teil …',
  'schemas.count': 'Teile samt Trennzeichen — {total} von {n}',
  'schemas.countOver':
    'Teile samt Trennzeichen — {total} von {n}: Sie passen nicht',
  'schemas.example': 'Beispielkennung:',
  'pairs.incomplete':
    'Wählen Sie für jeden Teil einen Wert oder entfernen Sie ihn.',
  'pairs.duplicate': 'Ein Teil ist doppelt gesetzt.',
  'pairs.notInSchema':
    'Dieser Teil steht nicht im Kennungsschema dieses Absenders: Entfernen Sie ihn.',
  'pairs.hostOnlyAny':
    'Der Host des Verweises ist nur bei „Jede andere Website“ ein Wert.',
  'pairs.part': 'Teil',
  'pairs.valueOf': 'Wert des Teils {name}',
  'pairs.remove': 'Teil {name} entfernen',
  'pairs.removeShort': 'Entfernen',
  'pairs.add': 'Teil hinzufügen',
  'referrers.title': 'Verweisregeln',
  'referrers.intro':
    'Eine Regel legt fest, welche Teile ein Besuch ohne UTM erhält: von instagram.com, von google.*, von jeder anderen Website oder ein direkter Aufruf. Danach bauen Weiterleitungslinks ihre Kennung und Trichter ihre Besuchsschritte.',
  'referrers.new': 'Neue Regel',
  'referrers.empty':
    'Keine Regeln: Besuche ohne UTM ergeben noch keine Teile. Beginnen Sie mit direkten Aufrufen und den Websites, von denen die meisten kommen.',
  'referrers.emptyNoParts':
    'Eine Regel setzt Werte von Kennungsteilen. Legen Sie zuerst die Teile an — Verzeichnisse mit dem Zweck „Teil der Kennung“.',
  'referrers.kind': 'Gekommen von',
  'referrers.parts': 'Werte der Teile',
  'referrers.hostAndSubdomains': 'und Subdomains',
  'referrers.noValues': 'setzt keine Teile',
  'referrers.utmFirst':
    'Hat die Adresse eines Besuchs mindestens einen UTM-Parameter, kommen die Teile nur aus UTM, und die Regeln greifen nicht. Von passenden Hosts gilt der längste.',
  'referrers.kindRequired': 'Wählen Sie, woher der Besucher kam.',
  'referrers.anyTaken':
    '„Jede andere Website“ ist schon in der Regel {name} gesetzt: Es gibt sie einmal pro Website.',
  'referrers.noneTaken':
    '„Direkter Aufruf“ ist schon in der Regel {name} gesetzt: Es gibt ihn einmal pro Website.',
  'referrers.hostHint':
    'Ein Host ist ein Website-Name wie example.com oder example.*: lateinische Buchstaben, Ziffern, Punkte und -, bis {n} Zeichen.',
  'referrers.hostTaken': 'Die Regel {name} hat diesen Host schon.',
  'referrers.kindHostHint':
    'Diese Website und ihre Subdomains; ein Name mit .* in jeder Zone.',
  'referrers.kindAnyHint':
    'Eine fremde Website, die nicht unter den Hosts ist. Der Host selbst kann ein Wert sein.',
  'referrers.kindNoneHint':
    'Kein Verweis: Die Adresse wurde eingetippt, ein Lesezeichen geöffnet oder die App hat keinen gesendet.',
  'referrers.kindTaken': 'Schon gesetzt: {name}',
  'referrers.host': 'Host',
  'referrers.hostHelp':
    'instagram.com — diese und l.instagram.com; google.* — google.de, google.co.uk. Ein www. am Anfang fällt weg.',
  'referrers.hostSaved': 'Gespeichert als',
  'referrers.partsAnyHint':
    'Ein Wert aus dem Verzeichnis des Teils oder „Host des Verweises“: Bei Höchstlänge 10 wird blog.example.net zum Wert blog-examp, in Berichten „nicht im Verzeichnis“.',
  'referrers.partsHint':
    'Die Werte kommen aus den Verzeichnissen der Teile. Ein Teil ohne Wert bleibt leer.',
  'referrers.noParts':
    'Es gibt keine Kennungsteile: Legen Sie Verzeichnisse mit dem Zweck „Teil der Kennung“ an.',
  'links.title': 'Weiterleitungen',
  'links.intro':
    'Ein Weiterleitungslink ist eine Adresse Ihrer Website, /_cms/go/<Code>, die zum Bot oder Shop führt und dorthin eine Kennung mitgibt: die festen Teile und woher der Besucher an diesem Tag kam. Auf dem Gerät des Besuchers speichert er nichts.',
  'links.new': 'Neuer Link',
  'links.empty':
    'Keine Weiterleitungslinks. Legen Sie einen für den Button der Website an, der zum Bot führt, und setzen Sie seine Adresse in die Vorlage.',
  'links.emptyNoSchemas':
    'Ein Weiterleitungslink baut seine Kennung nach dem Schema des Absenders: Legen Sie zuerst ein Kennungsschema an.',
  'links.address': 'Adresse auf der Website',
  'links.target': 'Zieladresse',
  'links.parts': 'Feste Teile',
  'links.copyAddressOf': 'Adresse des Links {name} kopieren',
  'links.copyAddress': 'Adresse kopieren',
  'links.archiveHint':
    'Ein archivierter Link funktioniert weiter, alte Buttons führen nicht ins Leere; ein gelöschter antwortet mit der 404-Seite.',
  'links.senderRequired': 'Wählen Sie einen Absender mit Kennungsschema.',
  'links.targetHttps': 'Die Zieladresse beginnt mit https://.',
  'links.targetSpace':
    'Die Adresse darf keine Leerzeichen, Zeilenumbrüche oder unsichtbaren Zeichen enthalten.',
  'links.targetLong': 'Die Adresse hat höchstens {n} Zeichen.',
  'links.targetToken':
    'Die Adresse braucht genau ein {label} — die Stelle für die Kennung.',
  'links.targetPlace':
    '{label} steht nach der Adresse der Website — nach /, ? oder #: https://t.me/IhrBot?start={label}.',
  'links.targetInvalid': 'Die Adresse ist nicht lesbar: Prüfen Sie sie.',
  'links.tagText': 'Ausprobieren',
  'links.sender': 'Absender',
  'links.noSchemas':
    'Kein Absender hat ein Kennungsschema: Legen Sie eines im Reiter „Kennungsschema“ an.',
  'links.senderHint': 'Die Kennung entsteht nach dem Schema dieses Absenders.',
  'links.targetHelp':
    'https:// bis {n} Zeichen mit einem {label} — dorthin kommt die Kennung. Für einen Telegram-Bot: https://t.me/IhrBot?start={label}.',
  'links.partsHint':
    'Teile, die für alle Klickenden gleich sind — etwa welcher Button es ist. Sie gehen der Quelle des Besuchs vor.',
  'links.pickSenderFirst':
    'Wählen Sie zuerst einen Absender: Die Teile kommen aus seinem Schema.',
  'links.noSchemaParts':
    'Das Schema dieses Absenders hat keine Teile zum Festlegen.',
  'links.codePlaceholder': '<Code>',
  'links.addressHint':
    'Darüber gelangt der Besucher zum Absender; das Ziel in „Besuche“ wird hier gezählt.',
  'links.tag': 'Link für die Vorlage',
  'links.copyTag': 'Link kopieren',
  'links.tagHint':
    'Setzen Sie ihn in die Vorlage statt eines direkten Links zum Bot.',
  'milestones.title': 'Meilensteine',
  'milestones.intro':
    'Ein Meilenstein ist ein Schritt, der zeigt, dass eine Person loslegt: „die erste Aufgabe innerhalb von drei Tagen“. Er erscheint als Spalte in „Quellen“, als Trichterschritt und bei der Person.',
  'milestones.new': 'Neuer Meilenstein',
  'milestones.empty':
    'Keine Meilensteine. Legen Sie den ersten an: welches Ereignis, wie oft und in wie vielen Tagen ab Ankunft.',
  'milestones.emptyNoTypes':
    'Ein Meilenstein besteht aus Ereignissen eines Typs: Legen Sie zuerst Ereignistypen an.',
  'milestones.rule': 'Bedingung',
  'milestones.window': 'Zeitfenster',
  'milestones.columnShort': 'In „Quellen“',
  'milestones.countText': '{n} Ereignis|{n} Ereignisse',
  'milestones.shown': 'Spalte',
  'milestones.hidden': 'nein',
  'milestones.windowForever': 'ohne Frist, ab {from}',
  'milestones.windowDays': '{n} Tag ab {from}|{n} Tage ab {from}',
  'milestones.fromArrival': 'Ankunft',
  'milestones.fromType': 'dem ersten Ereignis {name}',
  'milestones.conditionGte': '{property} mindestens {value}',
  'milestones.conditionEq': '{property} = {value}',
  'milestones.senderRequired': 'Wählen Sie einen Absender.',
  'milestones.typeRequired': 'Wählen Sie einen Ereignistyp.',
  'milestones.countHint':
    'Die Anzahl der Ereignisse ist eine ganze Zahl von 1 bis {n}.',
  'milestones.propertyRequired':
    'Wählen Sie die Eigenschaft der Bedingung oder entfernen Sie die Bedingung.',
  'milestones.numberRequired': 'Geben Sie eine Zahl ein.',
  'milestones.valueRequired': 'Wählen Sie einen Wert.',
  'milestones.daysHint':
    'Das Zeitfenster ist eine ganze Zahl von Tagen von 1 bis {n} oder „ohne Frist“.',
  'milestones.sender': 'Absender',
  'milestones.type': 'Ereignistyp',
  'milestones.count': 'Wie viele Ereignisse',
  'milestones.countHelp':
    'Der Meilenstein ist im Moment des gezählten Ereignisses mit dieser Nummer erreicht.',
  'milestones.condition': 'Bedingung an eine Eigenschaft',
  'milestones.conditionNone': 'Ohne Bedingung',
  'milestones.modeGte': 'Mindestens eine Zahl',
  'milestones.modeEq': 'Gleich einem Wert',
  'milestones.property': 'Eigenschaft',
  'milestones.atLeast': 'Mindestens',
  'milestones.equals': 'Gleich',
  'milestones.noProperties':
    'Der Typ deklariert keine Eigenschaft für eine Bedingung: Zahl, Auswahl oder Ja/Nein.',
  'milestones.conditionHint':
    'Es zählen nur Ereignisse, deren Eigenschaft passt. Die Eigenschaft stammt aus den im Typ deklarierten.',
  'milestones.days': 'Zeitfenster in Tagen',
  'milestones.daysUnit': 'Tage',
  'milestones.forever': 'Ohne Frist',
  'milestones.windowHint':
    'Tage zu 24 Stunden, 1 bis {n}: „3 Tage“ sind 72 Stunden. Solange das Fenster offen ist, ist die Person „noch im Fenster“, kein Misserfolg.',
  'milestones.anchor': 'Das Zeitfenster beginnt bei',
  'milestones.anchorArrival': 'Ankunft — dem ersten Kontakt',
  'milestones.anchorType': 'dem ersten Ereignis {name}',
  'milestones.anchorHint':
    'Hat eine Person kein solches Ereignis, gibt es kein Fenster, und der Meilenstein ist nicht erreicht.',
  'milestones.column': 'Als Spalte in „Quellen“ zeigen',
  'milestones.columnHint':
    'Der Anteil der Personen, die ihn erreicht haben, in jeder Berichtszeile. Die Spalten folgen der Reihenfolge der Meilensteine in der Liste.',
  'funnels.title': 'Trichter',
  'funnels.intro':
    'Ein Trichter ist der Weg vom Besuch der Website bis zur Zahlung: Besuchsschritte aus der Statistik, dann Schritte von Personen aus Ereignissen. Der Bildschirm „Trichter“ und der Agent öffnen zuerst den Haupttrichter.',
  'funnels.new': 'Neuer Trichter',
  'funnels.empty':
    'Keine Trichter. Legen Sie den ersten an, zum Beispiel: Besucher der Website → Link geklickt → angekommen → Testphase → Zahlung.',
  'funnels.steps': 'Schritte',
  'funnels.order': 'Reihenfolge',
  'funnels.mainMark': 'Haupttrichter',
  'funnels.mainByOrder': 'Haupttrichter nach Reihenfolge',
  'funnels.mainByOrderHint':
    'Keiner ist als Haupttrichter markiert: Haupttrichter ist der erste in der Reihenfolge.',
  'funnels.stepsCount': '{n} Schritt|{n} Schritte',
  'funnels.strictShort': 'streng',
  'funnels.freeShort': 'frei',
  'funnels.makeMain': 'Zum Haupttrichter machen',
  'funnels.madeMain': '{name} ist der Haupttrichter',
  'funnels.stepAnyLink': 'Beliebigen Link geklickt',
  'funnels.anyLink': 'Beliebiger Link',
  'funnels.stepLinkNamed': 'Link {name} geklickt',
  'funnels.stepFormNamed': 'Formular {name} gesendet',
  'funnels.stepPageNamed': 'Eingestiegen auf {page}',
  'funnels.stepVisits': 'Besucher der Website',
  'funnels.stepArrival': 'Angekommen',
  'funnels.stepTrial': 'Testphase begonnen',
  'funnels.stepPaymentNamed': 'Zahlung Nr. {n}',
  'funnels.stepMilestoneNamed': 'Meilenstein {name} erreicht',
  'funnels.stepTypeNamed': 'Ereignis {name}',
  'funnels.pageHint':
    'ein Pfad einer Seite der Website, etwa /trial: beginnt mit /, ohne Leerzeichen, ? und #',
  'funnels.formHint':
    'ein Formularname: kleine lateinische Buchstaben, Ziffern und -, bis 64 Zeichen',
  'funnels.numberHint': 'die Nummer der Zahlung ist 1 bis {n}',
  'funnels.milestoneRequired': 'wählen Sie einen Meilenstein',
  'funnels.typeRequired': 'wählen Sie einen Ereignistyp',
  'funnels.stepsHint': 'Ein Trichter hat {min} bis {max} Schritte.',
  'funnels.stepProblem': 'Schritt {n}: {problem}.',
  'funnels.kindRequired': 'wählen Sie, was der Schritt ist',
  'funnels.orderRule':
    'Ein Besuchsschritt kann nicht unter einem Schritt von Personen stehen: Besuche sind die Besucher des Tages aus der Statistik, Personen kommen aus Ereignissen, und verglichen werden dieselben Tage, nicht dieselben Menschen. Darum gibt es eine Grenze — Besuche oben.',
  'funnels.orderHint':
    'Zuerst die Besuchsschritte (aus der Statistik der Website), dann die Schritte von Personen (aus Ereignissen): Es gibt eine Grenze.',
  'funnels.kindVisits': 'Besucher der Website',
  'funnels.kindPage': 'Eingestiegen auf Seite',
  'funnels.kindLink': 'Link geklickt',
  'funnels.kindForm': 'Formular gesendet',
  'funnels.kindArrival': 'Angekommen (erster Kontakt)',
  'funnels.kindTrial': 'Testphase',
  'funnels.kindPayment': 'Zahlung Nummer N',
  'funnels.kindMilestone': 'Meilenstein',
  'funnels.kindType': 'Ereignis eines Typs',
  'funnels.stepLabel': 'Schritt {n}',
  'funnels.sideVisits': 'Besuche',
  'funnels.sidePeople': 'Personen',
  'funnels.kindOf': 'Was der Schritt ist: {step}',
  'funnels.pickKind': 'Welcher Schritt …',
  'funnels.groupVisits': 'Besuche — aus der Statistik',
  'funnels.groupPeople': 'Personen — aus Ereignissen',
  'funnels.page': 'Pfad der Seite',
  'funnels.link': 'Link',
  'funnels.form': 'Formularname',
  'funnels.formPlaceholder': 'Formularname',
  'funnels.number': 'Nummer der Zahlung',
  'funnels.milestone': 'Meilenstein',
  'funnels.type': 'Ereignistyp',
  'funnels.up': '{step} nach oben',
  'funnels.down': '{step} nach unten',
  'funnels.remove': '{step} entfernen',
  'funnels.removeShort': 'Entfernen',
  'funnels.addStep': 'Schritt hinzufügen',
  'funnels.strict': 'Strenge Reihenfolge',
  'funnels.strictHint':
    'Ein Schritt zählt nur, wenn er nicht vor dem vorigen erreicht wurde. Ohne Haken ist die Reihenfolge frei: Wer einen Schritt darüber übersprungen hat, erscheint als eigener Anteil.',
  'funnels.main': 'Haupttrichter',
  'funnels.mainReplaces':
    'Dieser wird Haupttrichter — {name} verliert die Markierung.',
  'funnels.mainHint':
    'Der Bildschirm „Trichter“ und der Agent öffnen ihn zuerst. Eine Website hat einen Haupttrichter.',
  'unknown.title': 'Unbekannte',
  'unknown.intro':
    'Was in Ereignissen und Kennungen ankam, aber nicht in den Verzeichnissen oder im Register steht, mit Zählern. „Anlegen“ öffnet das Formular mit diesem Code.',
  'unknown.empty':
    'Alles bekannt: Jeder Typ, jede Antwort, jeder Wert und jeder Wert eines Kennungsteils steht in den Verzeichnissen, die Kennungen erster Kontakte stehen im Register.',
  'unknown.types': 'Ereignistypen',
  'unknown.typesHint':
    'Ereignisse dieser Typen sind ohne Rolle angenommen: Für die Personen zählen nur Kontakte und Merkmale des Umschlags.',
  'unknown.events': 'Ereignisse',
  'unknown.lastAt': 'Zuletzt',
  'unknown.createType': 'Typ anlegen',
  'unknown.senderArchived': 'Absender archiviert',
  'unknown.questions': 'Umfragefragen',
  'unknown.questionsHint': 'Ein data.question ohne Verzeichnis der Antworten.',
  'unknown.question': 'Frage',
  'unknown.answersCount': 'Antworten',
  'unknown.createQuestion': 'Verzeichnis anlegen',
  'unknown.answers': 'Antworten',
  'unknown.answersHint': 'Eine Antwort, die im Verzeichnis ihrer Frage fehlt.',
  'unknown.answer': 'Antwort',
  'unknown.createValue': 'Wert hinzufügen',
  'unknown.questionFirst': 'zuerst die Frage anlegen',
  'unknown.values': 'Werte von Eigenschaften und Merkmalen',
  'unknown.valuesHint':
    'Eine Auswahl außerhalb ihres Verzeichnisses: Das Ereignis ist angenommen, der Wert steht hier.',
  'unknown.where': 'Eigenschaft',
  'unknown.value': 'Wert',
  'unknown.count': 'Wie viele',
  'unknown.inEvents': 'in Ereignissen',
  'unknown.inTraits': 'Merkmal',
  'unknown.peopleShort': 'Pers.',
  'unknown.dictionaryArchived': 'Verzeichnis archiviert',
  'unknown.parts': 'Werte von Kennungsteilen',
  'unknown.partsHint':
    'Ein Wert eines Teils aus der Kennung eines Kontakts, der nicht im Verzeichnis des Teils steht: In Berichten heißt er „nicht im Verzeichnis“. Gezählt werden erste und letzte Kontakte der Personen.',
  'unknown.part': 'Teil',
  'unknown.touches': 'Kontakte',
  'unknown.labels': 'Kennungen außerhalb des Registers',
  'unknown.labelsHint':
    'Kennungen erster Kontakte, die nicht im Kennungsregister stehen: anderswo ausgegeben oder von Hand gebaut. Gezählt werden Personen, bis zu den 1000 häufigsten.',
  'unknown.label': 'Kennung',
  'unknown.people': 'Personen',
  'unknown.partMissing': 'der Teil fehlt in den Verzeichnissen',
  'unknown.partInvalid':
    'kein gültiger Wert: strenger als ein Code, bis {n} Zeichen',
  'intake.title': 'Empfang',
  'intake.intro':
    'Was der Empfänger POST /_cms/events tut: ob er an ist, wie viel er heute angenommen und wen er abgelehnt hat.',
  'intake.state': 'Ereignisempfang',
  'intake.on': 'an',
  'intake.off': 'aus',
  'intake.onHint':
    'Ereignisse werden über das Netz und aus Dateien angenommen.',
  'intake.offHint':
    'Der Empfänger antwortet mit 503: Absender versuchen es später erneut und verlieren nichts.',
  'intake.toSwitch': 'Der Schalter ist in den Einstellungen',
  'intake.today': 'Angenommen seit Mitternacht UTC',
  'intake.last': 'Letztes Ereignis',
  'intake.refusals': 'Letzte Ablehnungen',
  'intake.refusalsHint':
    'Bis zu den letzten 50 seit dem Neustart des Servers: falscher Schlüssel, Schlüsselraten, Fehler in Feldern des Ereignisses.',
  'intake.noRefusals': 'Es gab keine Ablehnungen.',
  'intake.at': 'Wann',
  'intake.reason': 'Grund',
  'intake.errors': 'Fehler in Feldern',
  'intake.reasonInvalid': 'fehlerhaftes Ereignis',
  'intake.reasonUnauthorized': 'falscher Schlüssel',
  'intake.reasonThrottled': 'Schlüsselraten',
  'setupLog.title': 'Protokoll',
  'setupLog.kind': 'Welches Protokoll',
  'setupLog.kindSetup': 'Einrichtung',
  'setupLog.kindErasures': 'Löschungen',
  'setupLog.setupHint':
    'Wer wann was geändert hat: vorher und nachher. Änderungen eines Agenten sind markiert.',
  'setupLog.erasuresHint':
    'Wann, wodurch und wie viel gelöscht wurde. Das Protokoll enthält keine Pseudonyme.',
  'setupLog.empty': 'Noch keine Änderungen.',
  'setupLog.noErasures': 'Es wurde nichts gelöscht.',
  'setupLog.noOlder': 'Es gibt keine älteren Einträge.',
  'setupLog.who': 'Wer',
  'setupLog.what': 'Was',
  'setupLog.action': 'Aktion',
  'setupLog.details': 'Details',
  'setupLog.agent': 'Agent',
  'setupLog.nobody': 'Befehl oder Set',
  'setupLog.itemSet': 'Set',
  'setupLog.itemSettings': 'Empfang, Aufbewahrung und Währung',
  'setupLog.itemKey': 'Absenderschlüssel',
  'setupLog.itemLabel': 'Kennung im Register',
  'setupLog.itemRate': 'Wechselkurs',
  'setupLog.itemSpend': 'Ausgabenzeile',
  'setupLog.was': 'vorher: {value}',
  'setupLog.became': 'nachher: {value}',
  'setupLog.created': 'angelegt',
  'setupLog.changed': 'geändert',
  'setupLog.archivedAction': 'archiviert',
  'setupLog.restoredAction': 'aus dem Archiv geholt',
  'setupLog.removedAction': 'gelöscht',
  'setupLog.applied': 'angewendet',
  'setupLog.keyIssued': 'ausgestellt',
  'setupLog.keyRevoked': 'widerrufen',
  'setupLog.keySummary': '{label}, endet auf {hint}',
  'setupLog.setItems': '{n} Element|{n} Elemente',
  'setupLog.origin': 'Wodurch',
  'setupLog.originEvent': 'durch ein Ereignis',
  'setupLog.originManager': 'per Schaltfläche',
  'setupLog.originRetention': 'durch Aufbewahrungsfrist',
  'setupLog.moment': 'Gelöscht bis',
  'setupLog.events': 'Ereignisse',
  'setupLog.people': 'Personen',
  'setupLog.mark': 'Löschvermerk',
  'setupLog.marked': 'bleibt',
  'setupLog.unmarked': 'keiner',
  'analyticsSettings.title': 'Ereignisempfang',
  'analyticsSettings.intro':
    'Ereignisse von einem Bot, Shop oder einer App: Daraus baut die Website Personen — woher sie kamen, was sie taten, wie viel sie zahlten. Das ist ein pseudonymer Verlauf über Monate; mit den Besuchen der Website wird er nie verknüpft.',
  'analyticsSettings.enabled': 'Ereignisse annehmen',
  'analyticsSettings.enabledHint':
    'Aus: Der Empfänger antwortet mit 503 und speichert nichts, Datei-Uploads werden abgelehnt. Personen, Verzeichnisse und das Löschen von Verläufen funktionieren weiter. Schalten Sie ihn ein, wenn der Absatz zu Ereignissen in der Datenschutzerklärung steht.',
  'analyticsSettings.retention': 'Verlauf aufbewahren',
  'analyticsSettings.forever': 'Unbegrenzt',
  'analyticsSettings.months':
    '{n} Monat nach dem letzten Ereignis|{n} Monate nach dem letzten Ereignis',
  'analyticsSettings.retentionHint':
    'Einmal am Tag, nachts, werden Personen gelöscht, deren letztes Ereignis älter ist.',
  'analyticsSettings.setRetention':
    'Keine Frist gesetzt: Der Verlauf bleibt, bis ihn jemand löscht. Setzen Sie eine Frist — Daten dürfen nicht länger als nötig gespeichert werden (Art. 5 DSGVO).',
  'analyticsSettings.save': 'Speichern',
  'analyticsSettings.saved': 'Ereignisempfang gespeichert',
  'analyticsSettings.view': 'Personen öffnen',
  'analyticsSettings.privacyTitle': 'Absatz für die Datenschutzerklärung',
  'analyticsSettings.privacyIntro':
    'Ein Muster zu Ereignissen der Absender auf Deutsch, Englisch und Russisch. Ergänzen Sie, was in Klammern steht; die Frist kommt aus der Einstellung, und hat die Website Weiterleitungslinks /_cms/go/…, nennt das Muster auch sie. Das ist keine Rechtsberatung: Prüfen Sie die Formulierung.',
  'analytics.sources': 'Quellen',
  'analytics.funnels': 'Trichter',
  'analytics.labels': 'Labels',
  'report.months12': '12 Monate',
  'report.allTime': 'Gesamter Zeitraum',
  'report.lastDays': 'Letzter {n} Tag|Letzte {n} Tage',
  'report.rangeText': '{from} – {to}',
  'report.rangeHint':
    'Das Ende liegt spätestens heute, am {today}: Tage gelten in der Zeitzone der Statistik.',
  'report.attribution': 'Zuordnung',
  'report.attributionFirst': 'Gewinnungsquelle',
  'report.attributionReturn': 'Rückkehrquelle',
  'report.attributionAnswer': 'Umfrageantwort',
  'report.group': 'Zeilen nach',
  'report.groupParts': 'Label-Teile',
  'report.groupTraits': 'Personenmerkmale',
  'report.groupProps': 'Ereigniseigenschaften',
  'report.groupQuestions': 'Umfragefragen',
  'report.groupOther': 'Weitere',
  'report.groupLabel': 'Ganzes Label',
  'report.groupSender': 'Absender',
  'report.window': 'Zahlungsfenster',
  'report.window7': 'Innerhalb von 7 Tagen',
  'report.window30': 'Innerhalb von 30 Tagen',
  'report.window0': 'Ohne Frist',
  'report.filters': 'Berichtsfilter',
  'report.filterNamed': '{name}: {value}',
  'report.removeFilter': 'Entfernen: {name}',
  'report.resetFilters': 'Filter zurücksetzen',
  'report.resetReport': 'Zurücksetzen',
  'report.fromReport': 'Aus dem Bericht:',
  'report.chipPeriod': 'Zeitraum: {period}',
  'report.chipMilestone': 'Meilenstein {name} erreicht',
  'report.chipReached': 'Trichter {funnel}: Schritt {n} {step} erreicht',
  'report.chipStopped': 'Trichter {funnel}: vor Schritt {n} {step} aufgehört',
  'report.none': 'nicht angegeben',
  'report.unknown': 'nicht im Verzeichnis',
  'report.unknownLabel': 'nicht im Register',
  'report.rest': 'übrige',
  'report.ofBase': '{count} von {base}',
  'report.inWindow': '+{n} im Fenster',
  'report.lowData': 'wenig Daten',
  'report.lowPeople': 'wenige Personen',
  'report.lowCustomers': 'wenige Kunden',
  'report.stale':
    'Nach der neuen Einrichtung wird noch {n} Person neu berechnet — der Bericht aktualisiert sich selbst.|Nach der neuen Einrichtung werden noch {n} Personen neu berechnet — der Bericht aktualisiert sich selbst.',
  'report.nobodyFiltered': 'Auf diese Filter passt niemand.',
  'report.testHidden': 'Personen nur mit Testereignissen werden nicht gezeigt.',
  'report.showAllTime': 'Gesamten Zeitraum zeigen',
  'sources.noSchema':
    'Die Website hat kein Label-Schema: Zeilen gehen nach Umfrageantworten oder nach Absender. Ein Schema zerlegt Labels in Teile — Quelle, Typ, Kampagne.',
  'sources.toSchemas': 'Schema anlegen',
  'sources.nobodyNew': 'Vom {from} bis {to} gibt es keine neuen Personen.',
  'sources.noReturns': 'Vom {from} bis {to} ist niemand zurückgekehrt.',
  'sources.chartTitle': 'Nach Tagen',
  'sources.chartReturnTitle': 'Zurückgekehrte nach Tagen',
  'sources.chartLabel':
    'Neue Personen und neue Kunden nach Tagen vom {from} bis {to}',
  'sources.chartReturnLabel': 'Zurückgekehrte nach Tagen vom {from} bis {to}',
  'sources.peopleCount': '{n} neue Person|{n} neue Personen',
  'sources.customersCount': '{n} neuer Kunde|{n} neue Kunden',
  'sources.returnedCount': '{n} zurückgekehrt|{n} zurückgekehrt',
  'sources.tableTitle': 'Wer sie gebracht hat',
  'sources.tableHint':
    'Neue Personen im Zeitraum nach Gewinnungsquelle — den Label-Teilen des ersten Kontakts. Ein Klick auf einen Wert setzt einen Filter für alle Reiter; der Pfeil öffnet eine Zeile nach dem nächsten Label-Teil, „nicht angegeben“ nach Umfrageantworten.',
  'sources.tableReturnTitle': 'Wer sie zurückgebracht hat',
  'sources.tableReturnHint':
    'Personen, die im Zeitraum zurückgekehrt sind — nach den Label-Teilen des Kontakts vor ihrer letzten Rückkehr; Zahlungen und Umsatz zählen ab der Rückkehr bis zum Ende des Zeitraums.',
  'sources.total': 'Gesamt',
  'sources.expand': '{value} nach {group} öffnen',
  'sources.collapse': '{value} schließen',
  'sources.filterBy': 'Nur {value} zeigen — in allen Reitern',
  'sources.loadingLevel': 'Wird geladen …',
  'sources.levelEmpty': 'Keine Zeilen.',
  'sources.definitions': 'Was die Spalten bedeuten',
  'sources.colPeople': 'Neue Personen',
  'sources.colTrial': 'Testphase',
  'sources.colPayment7': 'Bezahlt in 7 Tagen',
  'sources.colPayment30': 'Bezahlt in 30 Tagen',
  'sources.colPayment0': 'Je bezahlt',
  'sources.colCustomers': 'Neue Kunden',
  'sources.colRevenue': 'Umsatz',
  'sources.colRevenueReturn': 'Umsatz seit Rückkehr',
  'sources.colPerCustomer': 'Zahlungen je Kunde',
  'sources.colRenewal': 'Verlängerung',
  'sources.colReturned': 'Zurückgekehrt',
  'sources.colPayments': 'Zahlungen seit Rückkehr',
  'sources.defPeople': 'Der erste Kontakt liegt im Zeitraum.',
  'sources.defMilestone':
    'Neue Personen, die den Meilenstein {name} erreicht haben, von denen, deren Fenster abgelaufen ist; „im Fenster“ — das Fenster läuft noch, sie zählen noch nicht.',
  'sources.defTrial':
    'Neue Personen mit einer Testphase, wann immer sie begann.',
  'sources.defPayment':
    'Neue Personen, die innerhalb von {n} Tagen nach ihrer Ankunft zum ersten Mal bezahlt haben, von denen, deren Fenster abgelaufen ist; „im Fenster“ — das Fenster läuft noch.',
  'sources.defPayment0': 'Neue Personen, die irgendwann bezahlt haben.',
  'sources.defCustomers':
    'Die erste Zahlung liegt im Zeitraum, wann immer die Person kam.',
  'sources.defRevenue':
    'Zahlungen abzüglich Erstattungen mit Datum im Zeitraum bei den Personen der Zeile — jede Währung in eigener Zeile, ohne Umrechnung.',
  'sources.defRevenueReturn':
    'Zahlungen abzüglich Erstattungen ab der Rückkehr bis zum Ende des Zeitraums — nach Währung.',
  'sources.defPerCustomer': 'Alle Zahlungen der neuen Kunden je Kunde.',
  'sources.defRenewal':
    'Neue Kunden mit einer zweiten Zahlung, von denen, die eine haben oder deren erste Laufzeit abgelaufen ist; „im Fenster“ — die Laufzeit läuft noch.',
  'sources.defReturned':
    'Nach Ende des Zugangs bezahlt — im Zeitraum; die Zeile richtet sich nach dem Kontakt vor der letzten Rückkehr.',
  'sources.defPayments':
    'Zahlungen ab der Rückkehr bis zum Ende des Zeitraums.',
  'sources.defLowData':
    'Weniger als {people} neue Personen oder {customers} Kunden: Anteile sind abgeschwächt — zu früh, um sich darauf zu verlassen.',
  'sources.answersTitle': 'Label und Antwort',
  'sources.answersHint':
    'Neue Personen nach Label-Wert und nach der Antwort auf {question}: man sieht, wie viele ohne Label kamen, die Quelle aber selbst nannten.',
  'sources.answersEmpty': 'Im Zeitraum gibt es keine neuen Personen.',
  'sources.question': 'Frage',
  'funnel.funnel': 'Trichter',
  'funnel.mainNamed': '{name} — Haupttrichter',
  'funnel.archivedNamed': '{name} — archiviert',
  'funnel.view': 'Anzeigen',
  'funnel.numbers': 'Zahlen',
  'funnel.rates': 'Anteile',
  'funnel.strict':
    'Strenge Reihenfolge: Ein Schritt zählt, wenn die Person ihn nicht vor dem vorherigen gemacht hat.',
  'funnel.free':
    'Freie Reihenfolge: Ein Schritt zählt, wenn die Person ihn irgendwann gemacht hat; wer einen Schritt darüber ausgelassen hat, steht beim Schritt.',
  'funnel.firstOnly':
    'Der Trichter zählt Personen nach Gewinnungsquelle: „Rückkehrquelle“ gilt hier nicht.',
  'funnel.visitsSide': 'Besucher der Website',
  'funnel.peopleSide': 'Personen aus Ereignissen',
  'funnel.boundary':
    'Oben stehen Tagesbesucher aus der Statistik, unten Personen aus Ereignissen: Verglichen werden dieselben Tage und dieselbe Quelle, nicht dieselben Personen.',
  'funnel.ofPrevious': 'vom vorherigen',
  'funnel.ofFirst': 'vom ersten',
  'funnel.share': '{rate} · {count} von {base}',
  'funnel.skipped': 'Schritt darüber ausgelassen: {n}',
  'funnel.open': 'noch im Fenster: {n}',
  'funnel.money': '{amount} · {each} pro Person',
  'funnel.reachedPeople': 'Wer ihn erreichte',
  'funnel.stoppedPeople': 'Wer davor aufhörte',
  'funnel.unfiltered': 'ungefiltert',
  'funnel.unfilteredHint':
    'Die Statistik kennt keine Personen und speichert die Einstiegsseite nicht zusammen mit der Quelle: Dieser Schritt ist ohne einen Teil der Filter gezählt.',
  'funnel.lowDataHint':
    'Weniger als {n} Personen: zu früh, den Anteil als Regel zu nehmen.',
  'funnel.lowDataNote':
    'Wenig Daten — ein Personenschritt mit weniger als {n} Personen: Ein solcher Schritt ist abgeschwächt.',
  'funnel.visitsOff': 'Besuchszählung ist aus',
  'funnel.visitsOn': 'Einschalten',
  'funnel.noOrigins':
    'Die Besuchsübersichten haben noch keine Aufschlüsselung nach Quelle: Mit einem Filter nach Label-Teil ergeben Besucherschritte null.',
  'funnel.originsSince':
    'Besuche haben seit {date} eine Aufschlüsselung nach Quelle: Für frühere Tage ergeben Besucherschritte mit einem Filter nach Label-Teil null.',
  'funnel.emptyOff':
    'Der Ereignisempfang ist aus: Es gibt keine Personen aus Ereignissen. Schalten Sie ihn in den Einstellungen ein, Reiter „Statistik“.',
  'funnel.emptyNoEvents':
    'Noch keine Ereignisse: Die Personenschritte erscheinen, sobald ein Absender seine ersten Ereignisse schickt.',
  'funnel.emptyStale':
    'Personen werden nach der neuen Einrichtung neu berechnet — die Personenschritte aktualisieren sich selbst.',
  'funnel.emptyFiltered': 'Keine der neuen Personen passt auf diese Filter.',
  'funnel.emptyPeriod':
    'In diesem Zeitraum gibt es keine neuen Personen: Wählen Sie einen längeren.',
  'funnel.noneTitle': 'Noch keine Trichter',
  'funnel.noneText':
    'Ein Trichter sind die Schritte vom Besuch der Website bis zur Zahlung: wie viele jeden erreicht haben. Legen Sie einen in der Einrichtung an.',
  'funnel.noneTextReader':
    'Ein Trichter sind die Schritte vom Besuch der Website bis zur Zahlung. Anlegen kann ihn, wer die Analyse-Einrichtung ändern darf.',
  'funnel.toSetup': 'Trichter anlegen',
  'funnel.missing':
    'Den Trichter {code} gibt es nicht: Er wurde gelöscht, oder die Adresse hat einen Tippfehler.',
  'funnel.toMain': 'Zum Haupttrichter',
  'labels.generator': 'Generator',
  'labels.check': 'Prüfung',
  'labels.registry': 'Register',
  'labels.unknown': 'Unbekannte Labels',
  'labels.generatorIntro':
    'Ein Label entsteht aus Teilen nach dem Schema des Absenders: Wählen Sie die Werte, benennen Sie das Label und speichern Sie es im Register — Berichtszeilen tragen dann diesen Namen, und darunter erscheinen die Links mit dem Label.',
  'labels.noSchemas':
    'Die Website hat kein Label-Schema: Der Generator hat nichts, woraus er bauen kann. Ein Schema ist ein Absender und die Label-Teile der Reihe nach.',
  'labels.senderRequired': 'Wählen Sie einen Absender.',
  'labels.link': 'Weiterleitungslink',
  'labels.noLink': 'Ohne Weiterleitungslink',
  'labels.linkHint':
    'Die vorgegebenen Teile des Links kommen von selbst ins Label, und der direkte Link führt zu seinem Ziel.',
  'labels.parts': 'Label-Teile',
  'labels.partsHint':
    'Werte stammen aus den Teilverzeichnissen; fehlt einer, legt „Neuer Wert“ ihn gleich hier an.',
  'labels.partsRequired': 'Wählen Sie für mindestens einen Teil einen Wert.',
  'labels.noValue': '— nicht angegeben —',
  'labels.newValue': 'Neuer Wert …',
  'labels.lockedByLink': 'vom Link {name} vorgegeben',
  'labels.pendingValue':
    'Im Label stand „{value}“ — einen solchen Wert gibt es im Verzeichnis nicht.',
  'labels.createPending': '„{value}“ anlegen',
  'labels.label': 'Label',
  'labels.labelEmpty': 'noch leer — wählen Sie die Teilwerte',
  'labels.length': '{n} von {max}',
  'labels.alreadyRegistered':
    'Dieses Label steht schon im Register — {name}: Speichern zeigt seine Links und legt kein neues an.',
  'labels.name': 'Name',
  'labels.namePlaceholder': 'Herbstkampagne auf Instagram',
  'labels.nameHint':
    'Unter diesem Namen zeigen Berichte und Register die Label-Zeile.',
  'labels.page': 'Seite der Website',
  'labels.pageHelp':
    'Ein Pfad wie /promo: Der Website-Link öffnet ihn mit den UTM der Label-Teile.',
  'labels.pageHint':
    'Ein Pfad der Website — mit / am Anfang, ohne Leerzeichen, ? und #, bis 500 Zeichen.',
  'labels.save': 'Im Register speichern',
  'labels.readOnly':
    'Labels im Register speichern kann, wer die Analyse-Einrichtung ändern darf.',
  'labels.saved': 'Das Label ist im Register gespeichert',
  'labels.existingSaved': 'Dieses Label war schon im Register',
  'labels.issuedTitle': 'Label im Register',
  'labels.existingTitle': 'Dieses Label gibt es schon',
  'labels.existingText':
    'Es steht als {name} im Register: Der neue Name ändert es nicht. Die Links sind dieselben.',
  'labels.directLink': 'Direkter Link',
  'labels.siteLink': 'Website-Link',
  'labels.directNoLinks':
    'Der Absender hat keinen Weiterleitungslink: Der direkte Link kann nirgendwohin führen.',
  'labels.directPickLink':
    'Der Absender hat mehrere Weiterleitungslinks — wählen Sie einen, dann führt der direkte Link darüber.',
  'labels.directNone': 'Es gibt keinen direkten Link.',
  'labels.siteNone':
    'Die Adresse der Website ist in den Einstellungen nicht gesetzt: Der Website-Link hat keine Grundlage.',
  'labels.linksHint':
    'Der direkte Link führt an der Website vorbei zum Absender — für Werbung direkt in dessen App. Der Website-Link öffnet die Seite mit UTM: Eine Weiterleitungsschaltfläche darauf bildet dasselbe Label.',
  'labels.checkIntro':
    'Fügen Sie ein Label, eine Adresse mit UTM, eine Weiterleitungsadresse /_cms/go/… oder ein Weiterleitungsziel ein — die Prüfung zeigt, welche Teile gelesen werden und was daran nicht stimmt.',
  'labels.checkText': 'Label oder Adresse',
  'labels.checkHint': 'Bis {n} Zeichen; wird beim Tippen geprüft.',
  'labels.checkRun': 'Prüfen',
  'labels.senderAuto': 'Nach Adresse oder der einzige',
  'labels.readAs': 'Gelesen als',
  'labels.fromLabel': 'Label',
  'labels.fromUtm': 'Adresse mit UTM: Teile stammen aus den Parametern',
  'labels.fromGo': 'Weiterleitung der Website {link}: ihre vorgegebenen Teile',
  'labels.fromLink':
    'Ziel der Weiterleitung {link}: Das Label stammt aus der Mitte',
  'labels.noSender': 'keiner: Die Website hat kein Label-Schema',
  'labels.registeredAs': '{name}, ausgegeben {when}',
  'labels.notRegistered': 'nicht im Register',
  'labels.part': 'Teil',
  'labels.value': 'Wert',
  'labels.state': 'Zustand',
  'labels.stateKnown': 'bekannt',
  'labels.stateArchived': 'archiviert',
  'labels.stateUnknown': 'unbekannt',
  'labels.stateEmpty': 'leer',
  'labels.notes': 'Hinweise',
  'labels.noNotes': 'Keine Hinweise.',
  'labels.noteInvalid':
    'Ein Abschnitt des Labels besteht nicht aus lateinischen Buchstaben, Ziffern, _ und - oder ist länger als 60 Zeichen: Dieser Teil wird nicht gelesen.',
  'labels.noteExtra':
    'Es gibt mehr Abschnitte als Teile im Schema: Die überzähligen entfallen.',
  'labels.noteLength': 'Das Label ist länger als die Grenze des Schemas.',
  'labels.noteSchema':
    'Der Absender hat kein Label-Schema: Es gibt keine Teile.',
  'labels.search': 'Suche',
  'labels.searchPlaceholder': 'Anfang eines Labels oder eines Worts im Namen',
  'labels.total': '{n} Label|{n} Labels',
  'labels.issuedBy': 'Wer und wann',
  'labels.authorUnknown': 'unbekannt',
  'labels.agentMark': 'Agent',
  'labels.rename': 'Umbenennen',
  'labels.renameTitle': 'Neuer Name des Labels',
  'labels.renamed': 'Das Label ist umbenannt',
  'labels.remove': 'Löschen',
  'labels.removeTitle': 'Label aus dem Register löschen?',
  'labels.removeBody':
    'Links damit funktionieren weiter, und in Berichten wird seine Zeile zu „nicht im Register“.',
  'labels.removed': 'Das Label ist aus dem Register gelöscht',
  'labels.registryEmpty':
    'Das Register hat noch keine Labels: Der Generator gibt sie aus.',
  'labels.registryNone': 'Keine Labels passen zu dieser Suche.',
  'labels.registryHint': 'Das Register fasst bis zu {n} Labels.',
  'labels.toGenerator': 'In den Generator',
  'labels.unknownIntro':
    'Labels erster Kontakte, die nicht im Register stehen: Absender und Besucher schreiben sie. „In den Generator“ öffnet das Label zerlegt — Sie können es mit einem Namen im Register speichern.',
  'labels.unknownEmpty':
    'Keine unbekannten Labels: Die Labels aller ersten Kontakte stehen im Register.',
  'labels.noSchemaFor': 'der Absender hat kein Schema',
  'people.acquisition': 'Gewinnungsquelle',
  'people.acquisitionAnswer': 'Antwort: {answer}',
  'people.acquisitionUnknown': 'unbekannt',
  'people.milestones': 'Meilensteine',
  'people.milestonesOf': '{n} von {total}',
  'person.arrivedAt': 'Gekommen',
  'person.returns': 'Rückkehren',
  'person.returnAt': 'Zurückgekehrt {when}',
  'person.returnTouch': 'Kontakt davor: {label}, {when}',
  'person.returnNoTouch': 'kein Kontakt davor',
  'person.milestones': 'Meilensteine',
  'person.noMilestones': 'Die Website hat keine Meilensteine.',
  'person.milestoneReached': 'erreicht {when}',
  'person.milestoneOpen': 'noch im Fenster',
  'person.milestoneOpenUntil': 'noch im Fenster bis {when}',
  'person.milestoneMissed': 'nicht erreicht',
  'person.milestoneMissedUntil': 'nicht erreicht: Das Fenster endete {when}',
  'person.milestoneNoStart': 'nicht erreicht: Das Fenster hat nicht begonnen',
  'person.milestonePending': 'wird neu berechnet',
  'person.dims': 'Aufschlüsselungen',
  'person.noDims': 'Keine Werte für Aufschlüsselungen.',
  'analytics.spend': 'Ausgaben',
  'report.life': 'Lebensdauer',
  'report.lifeAll': 'Gesamte Zeit',
  'report.life3': '3 Monate',
  'report.life6': '6 Monate',
  'report.life12': '12 Monate',
  'report.fees': 'Umsatz',
  'report.feesGross': 'Vor Gebühren',
  'report.feesNet': 'Nach Gebühren',
  'report.compare': 'Vergleichen',
  'report.compareNone': 'Kein Vergleich',
  'report.comparePrevious': 'Mit dem Vorzeitraum',
  'report.compareYear': 'Mit dem Vorjahr',
  'report.compareAll':
    'Die gesamte Zeit lässt sich mit nichts vergleichen: Wählen Sie einen Zeitraum.',
  'report.changeNew': 'neu',
  'report.changePoints': '{value} Pp.',
  'report.changeMonths': '{value} Mon.',
  'report.chipByPayment': 'Erste Zahlung im Zeitraum',
  'sources.colLtvCustomer': 'LTV pro Kunde',
  'sources.colLtvPerson': 'LTV pro Person',
  'sources.colSpend': 'Ausgaben',
  'sources.colCac': 'CAC',
  'sources.colCostPerPerson': 'Kosten pro Person',
  'sources.colLtvCac': 'LTV / CAC',
  'sources.colPayback': 'Amortisation',
  'sources.defRevenueBase':
    'Als eine Zahl in {currency}: jeder Betrag zum Kurs seines Monats; ein Betrag ohne Kurs fehlt in der Zahl und steht darunter.',
  'sources.defGross': 'Vor Gebühren des Zahlungsdienstes.',
  'sources.defNet':
    'Nach Gebühren des Zahlungsdienstes: Zahlungen minus Erstattungen minus Gebühren.',
  'sources.defLtvCustomer':
    'Umsatz der neuen Kunden der Zeile (erste Zahlung im Zeitraum) über die Lebensdauer ab der ersten Zahlung, pro Kunde, der die Lebensdauer ganz erlebt hat. Wer sie noch erlebt, steht als „+N laufen noch“ und zählt nicht zum Schnitt.',
  'sources.defLtvPerson':
    'Umsatz der neuen Personen der Zeile (Ankunft im Zeitraum) über die Lebensdauer ab Ankunft, pro Person, die sie erlebt hat; Personen ohne Zahlung zählen im Nenner mit.',
  'sources.lifeAll':
    'Lebensdauer: die gesamte Zeit — Umsatz vom Beginn bis heute.',
  'sources.life3': 'Lebensdauer: 3 Monate.',
  'sources.life6': 'Lebensdauer: 6 Monate.',
  'sources.life12': 'Lebensdauer: 12 Monate.',
  'sources.defSpend':
    'Ausgabenzeilen, die nicht breiter als die Zeile sind — für den Zeitraum, anteilig nach Tagen, in der Basiswährung. Ausgabenzeilen verschachteln sich nicht: Ausgaben für Instagram ohne Typ gehen weder auf „bezahlt“ noch auf „organisch“.',
  'sources.defCac': 'Ausgaben / neue Kunden der Zeile.',
  'sources.defCostPerPerson':
    'Ausgaben / neue Personen der Zeile: ob der Traffic schon vor den ersten Zahlungen günstig ist.',
  'sources.defLtvCac':
    'LTV pro Kunde / CAC: über 1 — die Quelle hat sich in der Lebensdauer amortisiert. CAC null — „kostenlos“.',
  'sources.defPayback':
    'Nach wie vielen Lebensmonaten der aufgelaufene Umsatz pro Kunde den CAC einholt — bis 24 Monate; die Lebensdauer wirkt nicht darauf.',
  'sources.defMoneyLowTitle': 'Wenig Daten bei Geld',
  'sources.defMoneyLow':
    'CAC, LTV / CAC und Amortisation sind gedämpft bei weniger als {customers} neuen Kunden, Kosten pro Person bei weniger als {people} neuen Personen, LTV bei weniger als {customers} Kunden oder {people} Personen, die die Lebensdauer erlebt haben.',
  'sources.defStale':
    'Der Betrag wurde zum Kurs eines früheren Monats umgerechnet: Sein Monat hat keinen Kurs. Tragen Sie ihn unter „Ausgaben → Kurse“ ein.',
  'sources.defCompare':
    'Die Summe des früheren Zeitraums mit denselben Filtern, derselben Lebensdauer und denselben Gebühren. Unter jeder Zahl der Summe steht die Änderung: Anzahlen und Beträge in Prozent, Anteile in Prozentpunkten; bei CAC, Kosten pro Person und Amortisation ist weniger besser.',
  'sources.was': 'Vorher',
  'sources.comparedTo': 'ggü. {range}',
  'sources.customersLink': 'Wer: Kunden mit erster Zahlung im Zeitraum',
  'sources.unpriced': 'und {amounts} ohne Kurs',
  'sources.unpricedLine': '{amount} ohne Kurs',
  'sources.unpricedHint':
    'Kein Kurs: Der Betrag fehlt in der Zahl. Kurs eintragen',
  'sources.staleHint':
    'Zum Kurs des Vormonats: Der Monat des Betrags hat keinen Kurs',
  'sources.staleShort': 'zum Kurs des Vormonats',
  'sources.livingTerm': '+{n} läuft noch|+{n} laufen noch',
  'sources.spendMissing': 'Ausgaben fehlen',
  'sources.spendMissingHint':
    'Dieser Wert erwartet Ausgaben, der Zeitraum hat keine — unter „Ausgaben“ eintragen',
  'sources.noCustomers': 'keine Kunden',
  'sources.free': 'kostenlos',
  'sources.paybackNow': 'sofort',
  'sources.paybackMonths': 'in {n} Mon.',
  'sources.paybackEarly': 'zu früh: noch kein Monat erlebt',
  'sources.paybackNot': 'nicht amortisiert in {n} Mon.',
  'sources.feeCoverage':
    'Nach Gebühren: Die Gebühr ist bei {n} von {total} Zahlungen im Zeitraum bekannt; bei den übrigen ist sie noch nicht abgezogen.',
  'sources.noBase':
    'Es gibt keine Basiswährung: Der Umsatz steht nach Währungen, LTV, CAC und Amortisation fehlen — sie werden in der Basiswährung berechnet.',
  'sources.setBase': 'Basiswährung festlegen',
  'sources.noRate':
    'Kein Kurs für {currencies}: {amounts} fehlen in den Summen.',
  'sources.toRates': 'Kurse',
  'sources.staleNote':
    '— zum Kurs des Vormonats umgerechnet: Der Kurs für den Monat des Betrags fehlt noch.',
  'sources.spendGroup':
    'Ausgaben lassen sich nicht auf die Zeilen verteilen: Die Gruppierung ist kein Teil des Labels. Sie stehen nur in der Summe.',
  'sources.spendFilter':
    'Keine Ausgaben: Der Filter ist kein Teil des Labels, und Ausgaben kennen keine Merkmale von Personen.',
  'sources.spendReturn':
    'Rückkehrquellen haben keine Ausgaben: Ausgaben gelten der Gewinnung.',
  'sources.spendUnassigned':
    'Ausgaben ohne den Teil „{part}“: {amount} — in der Summe, nicht auf die Zeilen verteilt.',
  'sources.spendBroader':
    'Weitere {amount} Ausgaben sind breiter als der Filter angegeben und nicht berücksichtigt.',
  'sources.spendProrated':
    'Ausgaben sind auf die Tage des Zeitraums verteilt: Ein Monat, der nur teilweise im Zeitraum liegt, zählt anteilig nach Tagen.',
  'sources.askSpend':
    'Tragen Sie Ausgaben ein, um CAC und Amortisation zu sehen.',
  'sources.toSpend': 'Ausgaben',
  'funnel.moneyBase': '{amount} · {each} pro Zahler',
  'funnel.was': 'vorher {n}',
  'funnel.wasMoney': 'vorher {amount}',
  'funnel.compared':
    'Vergleich mit {range}: Jeder Schritt zeigt „vorher“ und die Änderung.',
  'csv.buttonFor': 'CSV herunterladen: {name}',
  'csv.path': 'Pfad',
  'csv.group': 'Gruppe',
  'csv.code': 'Code',
  'csv.name': 'Name',
  'csv.lowData': 'Wenig Daten',
  'csv.counted': '{name}: gezählt',
  'csv.base': '{name}: von',
  'csv.open': '{name}: noch im Fenster',
  'csv.percent': '{name}, %',
  'csv.inCurrency': '{name}, {currency}',
  'csv.inBase': '{name} in {currency}',
  'csv.notes': '{name}: Hinweise',
  'csv.stale': 'Kurs des Vormonats',
  'csv.unpriced': 'ohne Kurs: {currencies}',
  'csv.lived': '{name}: erlebt',
  'csv.living': '{name}: laufen noch',
  'csv.months': '{name}, Monate',
  'csv.paybackNot': 'nicht amortisiert',
  'csv.previous': 'Vorzeitraum {from} – {to}',
  'csv.answerCodes': 'Antwortcodes',
  'csv.step': 'Nr.',
  'csv.stepName': 'Schritt',
  'csv.side': 'Seite',
  'csv.count': 'Anzahl',
  'csv.ofPrevious': 'Vom vorherigen, %',
  'csv.ofFirst': 'Vom ersten, %',
  'csv.skipped': 'Schritt darüber übersprungen',
  'csv.inWindow': 'Noch im Fenster',
  'csv.revenue': 'Umsatz',
  'csv.revenueIn': 'Umsatz, {currency}',
  'csv.perPersonIn': 'Pro Person, {currency}',
  'csv.revenueBase': 'Umsatz in {currency}',
  'csv.perPayerBase': 'Pro Zahler in {currency}',
  'csv.wasCount': 'Vorher ({from} – {to})',
  'csv.wasRevenue': 'Vorher: Umsatz in {currency} ({from} – {to})',
  'csv.month': 'Monat',
  'csv.partCode': '{part} (Code)',
  'csv.currency': 'Währung',
  'csv.amount': 'Betrag',
  'csv.inBaseShort': 'In {currency}',
  'csv.note': 'Notiz',
  'csv.author': 'Von',
  'csv.updated': 'Geändert',
  'csv.noRate': 'ohne Kurs',
  'csv.monthTotal': 'Monatssumme',
  'csv.rateDay': 'Kurstag',
  'csv.rateIn': 'Kurs in {currency}',
  'csv.rate': 'Kurs',
  'csv.arrived': 'Ankunft',
  'csv.firstLabel': 'Label des ersten Kontakts',
  'csv.firstAt': 'Erster Kontakt',
  'csv.firstPaid': 'Erste Zahlung',
  'csv.paidUntil': 'Bezahlt bis',
  'csv.peopleTitle': 'Personen als CSV exportieren',
  'csv.peopleText':
    'Personen in der Liste: {n} — die Datei enthält alle, mit denselben Filtern wie auf dem Bildschirm.',
  'csv.peopleTooMany':
    'Personen in der Liste: {n} — mehr als {limit}. Grenzen Sie den Filter ein (Zeitraum, Quelle, Status), um zu exportieren.',
  'csv.peoplePrivacy':
    'Die Datei enthält Pseudonyme, Labels und Beträge: Bewahren Sie sie wie eine Sicherung der Website auf und löschen Sie sie, wenn sie nicht mehr gebraucht wird.',
  'csv.peopleProgress': '{n} von {total} exportiert',
  'csv.peopleStart': 'Exportieren',
  'csv.peopleSaved': 'Personendatei gespeichert: {n}',
  'spend.title': 'Ausgaben',
  'spend.period': 'Monate',
  'spend.months6': '6 Monate',
  'spend.customMonths': 'Eigene Monate',
  'spend.fromMonth': 'Ab Monat',
  'spend.toMonth': 'Bis Monat',
  'spend.intro':
    'Ausgaben für die Gewinnung nach Monaten: Eine Zeile ist eine Quelle aus Werten der Label-Teile (oder die ganze Website), eine Währung und ein Betrag. „Quellen“ verteilt die Ausgaben auf die Zeilen und berechnet CAC, Kosten pro Person und Amortisation.',
  'spend.noBase':
    'Es gibt keine Basiswährung: Monatssummen und CAC werden in ihr berechnet.',
  'spend.noParts':
    'Die Website hat keine Label-Teile: Ausgaben lassen sich nur für die ganze Website eintragen. Um sie nach Quellen einzutragen, legen Sie ein Verzeichnis mit dem Zweck „Label-Teil“ an.',
  'spend.toDictionaries': 'Verzeichnisse',
  'spend.emptyTitle': 'Keine Ausgaben in diesen Monaten',
  'spend.emptyText':
    'Tragen Sie die Ausgaben eines Monats für eine Quelle ein — „Quellen“ zeigt dann CAC, Kosten pro Person und Amortisation. Null ist auch eine Ausgabe: „diesen Monat nichts ausgegeben“.',
  'spend.addFor': 'Ausgaben für {month} eintragen',
  'spend.total': 'Summe',
  'spend.noRows': 'Keine Zeilen',
  'spend.add': 'Zeile hinzufügen',
  'spend.copyPrevious': 'Vormonat kopieren',
  'spend.hint':
    'Im {month} hat {name} {n} neue Person gebracht, aber es gibt keine Ausgaben.|Im {month} hat {name} {n} neue Personen gebracht, aber es gibt keine Ausgaben.',
  'spend.addHint': 'Ausgaben eintragen',
  'spend.source': 'Quelle',
  'spend.amount': 'Betrag',
  'spend.inBase': 'In {currency}',
  'spend.note': 'Notiz',
  'spend.author': 'Wer und wann',
  'spend.noRate': 'ohne Kurs',
  'spend.wholeSite': 'Ganze Website (allgemeine Ausgaben)',
  'spend.notInDictionary': 'nicht im Verzeichnis',
  'spend.editNamed': 'Zeile bearbeiten: {name}',
  'spend.removeNamed': 'Zeile löschen: {name}',
  'spend.remove': 'Löschen',
  'spend.removeTitle': 'Ausgabenzeile löschen?',
  'spend.removeBody':
    '{parts}, {amount} für {month}. CAC und Amortisation in „Quellen“ werden ohne sie neu berechnet.',
  'spend.removed': 'Ausgabenzeile gelöscht',
  'spend.saved': '{n} Ausgabenzeile gespeichert|{n} Ausgabenzeilen gespeichert',
  'spend.savedOne': 'Ausgabenzeile gespeichert',
  'spend.copyNone':
    'Für {month} gibt es keine Ausgabenzeilen — nichts zu kopieren.',
  'spend.copyDone': 'Alle Zeilen des Vormonats sind schon in diesem.',
  'spend.copySkipped':
    '{n} Zeile übersprungen: Ihr Wert ist archiviert oder gelöscht, eine neue Zeile kann ihn nicht nehmen.|{n} Zeilen übersprungen: Ihre Werte sind archiviert oder gelöscht, eine neue Zeile kann sie nicht nehmen.',
  'spend.editRow': 'Ausgabenzeile bearbeiten',
  'spend.newRows': 'Neue Ausgabenzeilen',
  'spend.rowN': 'Zeile {n}',
  'spend.anyValue': '— nicht gesetzt —',
  'spend.archivedOption': '{name} — archiviert',
  'spend.unknownOption': '{code} — nicht im Verzeichnis',
  'spend.currency': 'Währung',
  'spend.siteCurrencies': 'Währungen der Website',
  'spend.allCurrencies': 'Alle Währungen',
  'spend.removeDraft': 'Zeile {n} entfernen',
  'spend.rule':
    'Zeilen verschachteln sich nicht: „Instagram“ und „Instagram · Bezahlt“ sind verschiedenes Geld, kein Ganzes und sein Teil; Ausgaben für Instagram ohne Typ gehen weder auf bezahlt noch auf organisch. Null ist auch eine Ausgabe: „diesen Monat nichts ausgegeben“, und der Hinweis „erwartet Ausgaben“ verschwindet.',
  'spend.saveRow': 'Speichern',
  'spend.saveRows': '{n} Zeile speichern|{n} Zeilen speichern',
  'spend.currencyRequired': 'Wählen Sie eine Währung.',
  'spend.amountHint':
    'Der Betrag ist eine Zahl ab null mit bis zu {n} Nachkommastellen; Komma oder Punkt nur vor den Nachkommastellen.',
  'spend.noteHint': 'Die Notiz hat bis zu {n} Zeichen.',
  'spend.repeatDraft':
    'Diese Zeile steht schon darüber: Teile und Währung stimmen überein.',
  'spend.repeatRow':
    'Der Monat hat schon eine Zeile mit diesen Teilen und dieser Währung — bearbeiten Sie diese.',
  'spend.archivedValue': '{part}: archivierter Wert',
  'spend.unknownValue': '{part}: Wert nicht im Verzeichnis',
  'rates.title': 'Kurse',
  'rates.base': 'Basiswährung der Berichte: {currency} ({name}).',
  'rates.changeBase': 'In den Einstellungen ändern',
  'rates.intro':
    'Ein Kurs wird pro Monat eingetragen: „1 PLN = 0,2310 €“ gilt ab dem ersten Tag des Monats bis zum nächsten Eintrag. Ein Monat ohne eigenen Kurs wird zum Kurs des Vormonats umgerechnet (≈), ein Betrag ohne Kurs fehlt in den Summen. Eine Erstattung gilt zum Kurs des Tags ihrer Zahlung.',
  'rates.other':
    'Kurse zu {currency} bleiben: {n} — Berichte nutzen sie nicht, solange die Basiswährung eine andere ist.',
  'rates.noCurrencies':
    'Alle Beträge der Website sind in {currency}: Kurse sind nicht nötig.',
  'rates.noBaseTitle': 'Keine Basiswährung',
  'rates.noBase':
    'Kurse werden zur Basiswährung der Berichte eingetragen. Legen Sie sie in den Einstellungen fest, Reiter „Statistik“: In ihr fasst „Quellen“ den Umsatz verschiedener Währungen zusammen und berechnet LTV, CAC und Amortisation.',
  'rates.missingMark': 'Monate ohne Kurs',
  'rates.month': 'Monat',
  'rates.rate': 'Kurs',
  'rates.pair': '1 {currency} = {rate} {base}',
  'rates.inverse': '1 {base} = {rate} {currency}',
  'rates.since': 'ab {day}',
  'rates.noSums': 'keine Beträge in diesem Monat',
  'rates.none': 'kein Kurs',
  'rates.noneText': 'die Beträge des Monats fehlen in den Summen',
  'rates.staleMark': 'zum Kurs von {month}',
  'rates.editNamed': 'Kurs {currency} ab {day} bearbeiten',
  'rates.removeNamed': 'Kurs {currency} ab {day} löschen',
  'rates.remove': 'Löschen',
  'rates.enter': 'Kurs eintragen',
  'rates.rateFor': 'Kurs {currency} in der Basiswährung',
  'rates.one': '1 {currency} =',
  'rates.save': 'Speichern',
  'rates.rateHelp': 'Punkt oder Komma: 0,2310.',
  'rates.rateHint':
    'Der Kurs ist eine Zahl über null: bis zu 9 Stellen vor dem Komma und 10 danach.',
  'rates.monthHint': 'Der Monat liegt zwischen Januar 2000 und dem laufenden.',
  'rates.saved': 'Kurs gespeichert',
  'rates.removed': 'Kurs gelöscht',
  'rates.removeTitle': 'Kurs {currency} ab {day} löschen?',
  'rates.removeBody':
    'Die Beträge des Monats werden zum Kurs des Vormonats umgerechnet; ohne ihn bleiben sie ohne Kurs und fallen aus den Summen.',
  'rates.freshFor': 'Kurs {currency} für einen Monat',
  'rates.freshMonth': 'Kurs für Monat',
  'rates.freshHint':
    'Ein Kurs für jeden Monat, auch ohne Beträge: Er gilt bis zum nächsten Eintrag.',
  'analyticsSettings.baseTitle': 'Basiswährung der Berichte',
  'analyticsSettings.baseIntro':
    'In ihr fasst „Quellen“ den Umsatz verschiedener Währungen zu einer Zahl zusammen und berechnet LTV, Ausgaben, CAC und Amortisation. Kurse anderer Währungen werden zu ihr unter „Statistik → Ausgaben → Kurse“ eingetragen.',
  'analyticsSettings.base': 'Basiswährung',
  'analyticsSettings.baseNone': 'Nicht festgelegt',
  'analyticsSettings.baseSite': 'Währungen der Website',
  'analyticsSettings.baseAll': 'Alle Währungen',
  'analyticsSettings.baseFrequent': '{name} — am häufigsten auf der Website',
  'analyticsSettings.baseHint':
    'Nur eine im Manager angemeldete Person legt sie fest: Weder ein API-Schlüssel noch ein Agent kann sie ändern.',
  'analyticsSettings.baseSuggest':
    'Die meisten Beträge der Website sind in {name}.',
  'analyticsSettings.basePick': '{currency} wählen',
  'analyticsSettings.baseWarning':
    'Kurse zu {from} ({n}) gelten dann nicht mehr: Berichte nutzen nur Kurse zur Basiswährung. Kurse zur neuen Währung müssen unter „Kurse“ neu eingetragen werden.',
  'analyticsSettings.baseChangeTitle': 'Basiswährung ändern?',
  'analyticsSettings.baseChangeBody':
    'Kurse zu {from} ({n}) gelten dann nicht mehr, und die Berichte werden in der neuen Währung neu berechnet. Tragen Sie Kurse zu ihr unter „Statistik → Ausgaben → Kurse“ neu ein; die alten Kurse bleiben und gelten wieder, wenn Sie zu {from} zurückkehren.',
  'analyticsSettings.baseChangeConfirm': 'Ändern',
  'analyticsSettings.baseSave': 'Währung speichern',
  'analyticsSettings.baseSaved': 'Basiswährung gespeichert',
  'analyticsSettings.baseOther':
    'Kurse zu früheren Basiswährungen bleiben — {list}: Berichte nutzen sie nicht.',
  'analyticsSettings.toSpend': 'Ausgaben und Kurse',
  'setupForm.awaitsSpend': 'Erwartet Ausgaben',
  'setupForm.awaitsSpendHint':
    'Für diese Quelle wird immer Geld ausgegeben (bezahlte Werbung): „Ausgaben“ weist auf einen Monat hin, in dem sie neue Personen brachte, aber keine Ausgabenzeile hat, und „Quellen“ schreibt „Ausgaben fehlen“.',
  'setupForm.effectAwaitsOn':
    '„Ausgaben“ weist künftig auf Monate hin, in denen der Wert neue Personen, aber keine Ausgaben hat; „Quellen“ schreibt „Ausgaben fehlen“.',
  'setupForm.effectAwaitsOff':
    '„Ausgaben“ weist für diesen Wert nicht mehr auf fehlende Ausgaben hin, und „Quellen“ schreibt nicht mehr „Ausgaben fehlen“.',
  'dictionaries.awaitsSpend': 'erwartet Ausgaben',
  'setupLog.rateSummary': 'Kurs {currency} ab {day}: {rate} {base}',
  'setupLog.spendSummary': 'Ausgaben für {month} · {parts}: {amount}',
  'analytics.overview': 'Übersicht',
  'analytics.cohorts': 'Kohorten',
  'report.months6': '6 Monate',
  'report.months24': '24 Monate',
  'report.chipMissed': 'Meilenstein {name} nicht erreicht',
  'analyticsOverview.title': 'Personen und Geld',
  'analyticsOverview.compared':
    'Unter jeder Zahl — die Veränderung ggü. dem Vorzeitraum gleicher Länge: {range}',
  'analyticsOverview.off':
    'Der Ereignisempfang ist aus: Die Summen beruhen auf früher angenommenen Ereignissen.',
  'analyticsOverview.people': 'Neue Personen',
  'analyticsOverview.customers': 'Neue Kunden',
  'analyticsOverview.revenue': 'Umsatz',
  'analyticsOverview.revenueNet': 'nach Gebühren: {amount}',
  'analyticsOverview.unpricedHint':
    'Kein Kurs: Der Betrag ist nicht in der Zahl. Kurse trägt man unter „Ausgaben“ im Tab „Kurse“ ein.',
  'analyticsOverview.active': 'Aktiver Zugang',
  'analyticsOverview.activeAt': 'Kunden mit Zugang am {date}',
  'analyticsOverview.spend': 'Ausgaben',
  'analyticsOverview.noSpend': 'Ausgaben fehlen',
  'analyticsOverview.cac': 'CAC',
  'analyticsOverview.toSources': '„Quellen“ für diesen Zeitraum öffnen',
  'analyticsOverview.toCohorts':
    '„Kohorten“ mit der Kennzahl „Aktiver Zugang“ öffnen',
  'analyticsOverview.toSpend': '„Ausgaben“ für die Monate des Zeitraums öffnen',
  'analyticsOverview.noBase':
    'Es gibt keine Basiswährung: Der Umsatz steht nach Währungen, Ausgaben und CAC fehlen — sie werden in der Basiswährung berechnet.',
  'analyticsOverview.askSpend':
    'Für diesen Zeitraum gibt es keine Ausgaben — tragen Sie sie ein, um Ausgaben und CAC zu sehen.',
  'analyticsOverview.visits': 'Website-Besuche',
  'cohorts.basis': 'Kohortenart',
  'cohorts.byPayment': 'Nach erster Zahlung',
  'cohorts.byArrival': 'Nach Ankunft',
  'cohorts.noPaymentRole':
    'Kohorten nach erster Zahlung gibt es nicht: Die Website hat keinen Ereignistyp mit der Rolle „Zahlung“. Die Kohorten richten sich nach der Ankunft.',
  'cohorts.metric': 'Kennzahl',
  'cohorts.metricCumulative': 'Kumulierter Umsatz pro Kunde',
  'cohorts.metricMonthly': 'Monatsumsatz pro Kunde',
  'cohorts.metricActive': 'Aktiver Zugang',
  'cohorts.periodHint':
    'Zeilen sind alle Monate, die der Zeitraum berührt, jeweils ganz.',
  'cohorts.tableTitle': 'Kunden nach Monat der ersten Zahlung',
  'cohorts.arrivalTitle': 'Neue Personen nach Monat der Ankunft',
  'cohorts.hintCumulative':
    'Wie viel ein Kunde der Kohorte im Schnitt bis zum Ende jedes Lebensmonats gebracht hat. Lebensmonat 0 reicht von der ersten Zahlung bis zum selben Tag des Folgemonats.',
  'cohorts.hintMonthly':
    'Wie viel ein Kunde der Kohorte im Schnitt in jedem Lebensmonat gebracht hat; eine Erstattung zählt als Minus im Monat, in dem das Geld zurückging. Lebensmonat 0 reicht von der ersten Zahlung bis zum selben Tag des Folgemonats.',
  'cohorts.hintActive':
    'Welcher Anteil der Kunden der Kohorte in jedem Lebensmonat Zugang hatte: eine bezahlte Laufzeit, eine Verlängerung oder eine Laufzeit ohne Ende.',
  'cohorts.feesGross': 'Umsatz vor Gebühren.',
  'cohorts.feesNet': 'Umsatz nach Gebühren.',
  'cohorts.arrivalHint':
    'Anteile nach den Regeln der „Quellen“: Personen „im Fenster“ zählen nicht zum Nenner. Kunden — Stand heute.',
  'cohorts.noBase':
    'Legen Sie die Basiswährung fest — LTV, CAC und Kohorten werden in ihr berechnet.',
  'cohorts.empty': 'In diesen Monaten gab es keine ersten Zahlungen.',
  'cohorts.emptyArrival': 'In diesen Monaten gab es keine neuen Personen.',
  'cohorts.colMonth': 'Kohorte',
  'cohorts.colCustomers': 'Kunden',
  'cohorts.colCustomersToday': 'Kunden heute',
  'cohorts.lifeMonths': 'Lebensmonat ab erster Zahlung',
  'cohorts.lifeMonth': 'Lebensmonat',
  'cohorts.lifeMonthN': 'Lebensmonat {n}',
  'cohorts.open': 'läuft',
  'cohorts.openHint':
    'Der Monat läuft noch: Kunden kommen noch zur Kohorte hinzu, ihre Zellen sind unvollständig.',
  'cohorts.openHintArrival':
    'Der Monat läuft noch: Neue Personen kommen noch hinzu, die Anteile sind unvollständig.',
  'cohorts.lowHint':
    'Weniger als {n} Kunden: zu früh, die Zahlen der Kohorte als Regel zu nehmen.',
  'cohorts.lowHintArrival':
    'Weniger als {n} Personen: zu früh, die Anteile als Regel zu nehmen.',
  'cohorts.peopleLink': 'Kunden der Kohorte unter „Personen“',
  'cohorts.arrivalLink': 'Neue Personen des Monats unter „Personen“',
  'cohorts.complete': 'vollständig',
  'cohorts.incomplete': 'unvollständig',
  'cohorts.incompleteSr': 'unvollständig: {count} von {base} haben ihn erlebt',
  'cohorts.incompleteNoneSr':
    'unvollständig: Den Monat hat noch niemand erlebt',
  'cohorts.incompleteHint':
    'Unvollständig: Nicht alle Kunden der Kohorte haben den Monat erlebt — der Wert gilt für die, die ihn erlebt haben, {count} von {base}. Nicht im Durchschnitt.',
  'cohorts.incompleteNoneHint':
    'Unvollständig: Diesen Monat hat noch kein Kunde der Kohorte erlebt. Nicht im Durchschnitt.',
  'cohorts.future': 'noch nicht erreicht',
  'cohorts.unpriced': 'ohne Kurs',
  'cohorts.unpricedSr': 'enthält Beträge ohne Kurs',
  'cohorts.unpricedHint':
    'Ein Kunde hat einen Betrag ohne Kurs: Er ist nicht im Wert, und die Zelle ist nicht im Durchschnitt.',
  'cohorts.shareIncompleteHint':
    'Unvollständig: Es gibt Personen „im Fenster“, oder der Monat läuft noch. Nicht im Durchschnitt.',
  'cohorts.average': 'Durchschnitt',
  'cohorts.averageCohorts': '{n} Kohorte|{n} Kohorten',
  'cohorts.averageCustomers': '{n} Kunde|{n} Kunden',
  'cohorts.averageMembers': 'Enthaltene Kohorten: {months}',
  'cohorts.averageNone': 'keine vollständigen Zellen',
  'cohorts.averageNote':
    'Der Durchschnitt beruht auf vollständigen Zellen, gewichtet nach Kunden: die Summe über die Kohorten, geteilt durch die Zahl ihrer Kunden. Unvollständige Zellen und Zellen mit Beträgen ohne Kurs sind nicht darin; welche Kohorten enthalten sind, steht im Tooltip der Zahl.',
  'cohorts.averageOpen':
    'Der laufende Monat ({month}) ist nicht im Durchschnitt: Er läuft noch, Kunden kommen noch zu seiner Kohorte hinzu.',
  'cohorts.incompleteNote':
    '— unvollständige Zelle: Nicht alle Kunden der Kohorte haben den Monat erlebt, der Wert gilt für die, die ihn erlebt haben.',
  'cohorts.unpricedNote':
    'Zellen „ohne Kurs“: Ein Kunde hat einen Betrag in einer Währung ohne Kurs — er ist nicht im Wert, und die Zelle ist nicht im Durchschnitt.',
  'cohorts.lowNote':
    'Wenig Daten — weniger als {n} Kunden in der Kohorte: Die Zeile ist abgeschwächt.',
  'cohorts.lowNoteArrival':
    'Wenig Daten — weniger als {n} Personen in der Kohorte: Die Zeile ist abgeschwächt.',
  'cohorts.legend': 'Zellfarbe zeigt den Wert',
  'cohorts.less': 'weniger',
  'cohorts.more': 'mehr',
  'cohorts.legendRange': 'von {min} bis {max}',
  'cohorts.legendNone': 'Für die Farbskala gibt es keine Werte.',
  'cohorts.arrivalAverageNote':
    'Der Durchschnitt: die Gezählten vollständiger Zellen, geteilt durch deren Nenner; unvollständige Zellen und der laufende Monat sind nicht darin.',
  'cohorts.arrivalOpenNote':
    '◌ — unvollständiger Anteil: Es gibt Personen „im Fenster“, oder der Monat läuft noch.',
  'cohorts.csvState': 'Zustand',
  'cohorts.csvLived': 'Erlebt',
  'cohorts.csvMoney': '{metric} ({fees}), {currency}',
  'cohorts.csvMoneyNoBase': '{metric} ({fees})',
  'cohorts.feesGrossShort': 'vor Gebühren',
  'cohorts.feesNetShort': 'nach Gebühren',
  'cohorts.csvWithAccess': 'Mit Zugang',
  'cohorts.csvWithAccessPercent': 'Mit Zugang, %',
  'cohorts.csvCohorts': 'Kohorten im Durchschnitt',
  'cohorts.csvNotes': 'Vermerke',
  'cohorts.csvOpen': 'Monat läuft',
  'milestoneComparison.title': 'Meilensteinvergleich',
  'milestoneComparison.tableTitle':
    'Welcher Meilenstein sagt die Zahlung voraus',
  'milestoneComparison.people':
    'Im Zeitraum kam {n} neue Person.|Im Zeitraum kamen {n} neue Personen.',
  'milestoneComparison.intro':
    'Bezahlt heißt: erste Zahlung innerhalb von {days} Tagen ab Ankunft, nicht nach dem Meilenstein — so sind die Gruppen bei jeder Reihenfolge der Ereignisse vergleichbar.',
  'milestoneComparison.introNoLimit':
    'Bezahlt heißt: erste Zahlung zu beliebiger Zeit nach der Ankunft, nicht nach dem Meilenstein — so sind die Gruppen bei jeder Reihenfolge der Ereignisse vergleichbar.',
  'milestoneComparison.colMilestone': 'Meilenstein',
  'milestoneComparison.colReached': 'Erreicht',
  'milestoneComparison.colMissed': 'Nicht erreicht',
  'milestoneComparison.colOpen': 'Im Fenster',
  'milestoneComparison.colPaidReached': 'Bezahlt unter Erreichern',
  'milestoneComparison.colPaidMissed': 'Bezahlt unter Nicht-Erreichern',
  'milestoneComparison.colDifference': 'Differenz',
  'milestoneComparison.reachedLink':
    'Wer den Meilenstein {name} erreicht hat — unter „Personen“',
  'milestoneComparison.missedLink':
    'Wer den Meilenstein {name} nicht erreicht hat — unter „Personen“',
  'milestoneComparison.openHint':
    '„Im Fenster“ — das Meilensteinfenster der Person läuft noch: Sie ist nicht im Vergleich.',
  'milestoneComparison.diffHint':
    'Anteil der Zahlenden unter Erreichern minus Anteil unter Nicht-Erreichern, in Prozentpunkten.',
  'milestoneComparison.paidNote':
    'Die Differenz ist der Anteil der Zahlenden unter Erreichern minus der Anteil unter Nicht-Erreichern, in Prozentpunkten. Je größer sie ist, desto besser sagt der Meilenstein die Zahlung voraus.',
  'milestoneComparison.lowHint':
    'Weniger als {n} Erreicher oder Nicht-Erreicher: zu früh, der Differenz zu trauen.',
  'milestoneComparison.lowNote':
    'Wenig Daten — weniger als {n} Erreicher oder Nicht-Erreicher: Die Zeile ist abgeschwächt, der Differenz ist noch nicht zu trauen.',
  'milestoneComparison.noPayment':
    'Es gibt keine Zahlungsanteile: Die Website hat keinen Ereignistyp mit der Rolle „Zahlung“. Zu sehen ist nur, wie viele Personen die Meilensteine erreicht haben.',
  'milestoneComparison.nobody':
    'In diesem Zeitraum gab es keine neuen Personen.',
  'milestoneComparison.noneTitle': 'Noch keine Meilensteine',
  'milestoneComparison.noneText':
    'Ein Meilenstein ist etwas, das eine Person in den ersten Tagen nach der Ankunft tut. Legen Sie Meilensteine unter „Einrichtung“ an, dann zeigt diese Seite, welcher die Zahlung am besten voraussagt.',
  'milestoneComparison.noneTextReader':
    'Ein Meilenstein ist etwas, das eine Person in den ersten Tagen nach der Ankunft tut. Meilensteine legt unter „Einrichtung“ an, wer sie bearbeiten darf.',
  'milestoneComparison.toSetup': 'Zu den Meilensteinen',
  'milestoneComparison.csvDifference': 'Differenz, Pp.',
  'analytics.quality': 'Qualität',
  'analytics.qualityFailures': '{n} Fehler|{n} Fehler',
  'analytics.groupCheck': 'Prüfung',
  'nav.statsFailure': '{label}: Fehler bei der Datenprüfung',
  'analyticsOverview.marks': 'Markierungen',
  'analyticsOverview.markOk': 'neue Version: Zahlen stimmen',
  'analyticsOverview.markBad': 'neue Version: Zahlen stimmen nicht',
  'analyticsOverview.markNone': 'neue Version: nicht geprüft',
  'analyticsOverview.versionOk': '{sender}: {from} → {to}, Zahlen stimmen',
  'analyticsOverview.versionBad':
    '{sender}: {from} → {to}, Zahlen stimmen nicht',
  'analyticsOverview.versionNone':
    '{sender}: {from} → {to}, Zahlen nicht geprüft',
  'intake.daily': 'Empfang nach Tagen',
  'intake.dailyHint':
    'Empfangstage (UTC) der letzten 30 Tage: wie viele Ereignisse jedes Absenders über das Netz und aus Dateien kamen, wie viele Wiederholungen und Ablehnungen es gab. Der heutige Tag läuft noch.',
  'intake.dayUtc': 'Tag (UTC)',
  'intake.keyUnknown': 'Schlüssel unbekannt',
  'intake.noDaily': 'In den letzten 30 Tagen kamen keine Ereignisse.',
  'intake.origin': 'Weg',
  'intake.originHttp': 'Netz',
  'intake.originFile': 'Datei',
  'intakeOutcome.accepted': 'Angenommen',
  'intakeOutcome.duplicate': 'Wiederholungen',
  'intakeOutcome.conflict': 'Konflikte',
  'intakeOutcome.erased': '„Gelöscht“',
  'intakeOutcome.erasure': 'Löschungen',
  'intakeOutcome.future': 'Aus der Zukunft',
  'intakeOutcome.late': 'Verspätet',
  'intakeOutcome.invalid': 'Fehlerhaft',
  'intakeOutcome.unauthorized': 'Falscher Schlüssel',
  'intakeOutcome.throttled': 'Schlüsselsuche',
  'intakeOutcome.disabled': 'Empfang aus',
  'people.touchConflicts': 'Abweichender erster Kontakt',
  'quality.title': 'Datenqualität',
  'quality.tabSummary': 'Übersicht',
  'quality.tabChecks': 'Prüfungen',
  'quality.tabStatements': 'Kontoauszüge',
  'quality.site': 'Website',
  'quality.stateOk': 'in Ordnung',
  'quality.stateWarning': 'Hinweis',
  'quality.stateFailure': 'Fehler',
  'quality.stateNoData': 'keine Daten',
  'quality.stateResolved': 'von Hand erledigt',
  'quality.zoneUtc': 'Tage in UTC',
  'quality.zoneReport': 'Tage in {zone}',
  'quality.zoneMonth': 'Monate in {zone}',
  'quality.when': '{day} um {time} ({zone})',
  'quality.cell': '{check}, {scope}, {day}: {state} — {value}',
  'quality.cellResolved':
    '{check}, {scope}, {day}: {state}, von Hand erledigt — {value}',
  'quality.notified': 'Benachrichtigung gesendet',
  'quality.noRow': 'nicht geprüft',
  'quality.noRowFor': 'kein Ergebnis für {day}',
  'quality.noRowYet': 'noch keine Ergebnisse',
  'quality.lastOk': 'zuletzt in Ordnung am {day}',
  'quality.resolvedNote': 'erledigt: {note}',
  'quality.gridLabel': 'Prüfungen nach Tagen, 30 Tage',
  'quality.gridCaption':
    'Datenprüfungen nach Tagen vom {from} bis {to}: Zeilen sind Prüfungen, Spalten sind Tage',
  'quality.gridCheck': 'Prüfung',
  'quality.gridTitle': 'Letzte 30 Tage',
  'quality.gridHint':
    'Eine Zelle öffnet den Tag: was verglichen wurde, die Zahlen und die Aktionen. Mit den Pfeiltasten bewegen Sie sich im Raster.',
  'quality.showTest': 'Testzeilen zeigen',
  'quality.legend': 'Legende',
  'quality.tilesTitle': 'Prüfungen des letzten fälligen Tages',
  'quality.openOn': 'Offen für {day}',
  'quality.nothingOn': 'Für {day} ist nichts offen.',
  'quality.noChannels':
    'Benachrichtigungen werden nicht gesendet: Es sind keine Kanäle für Störungen eingerichtet. Fehler sehen Sie nur hier.',
  'quality.toNotify': 'Benachrichtigungen einrichten',
  'quality.intakeOff': 'Nichts zu prüfen: Der Ereignisempfang ist aus.',
  'quality.noSummaries':
    'Bis zur ersten Zusammenfassung schweigen die Prüfungen der Zusammenfassung. Der Absender sendet einmal täglich ein Ereignis mit der Rolle „Tagesübersicht“ für den vergangenen UTC-Tag.',
  'quality.toSenderHelp': 'Hinweise für Entwickler',
  'quality.emptySenders': 'Keine Absender',
  'quality.emptySendersText':
    'Nichts zu prüfen: Legen Sie unter „Einrichtung“ einen Absender an.',
  'quality.toSenders': 'Zu den Absendern',
  'quality.emptyDisabled': 'Alle Prüfungen sind aus',
  'quality.emptyDisabledText':
    'Schalten Sie die nötigen Prüfungen im Reiter „Prüfungen“ ein.',
  'quality.toChecks': 'Zu den Prüfungen',
  'quality.emptyEvents': 'Noch keine Ereignisse',
  'quality.emptyEventsText':
    'Die Prüfungen beginnen mit dem Tag des ersten Ereignisses: Die ersten Ergebnisse erscheinen am nächsten Morgen.',
  'quality.emptyDue': 'Noch ist keine Prüfung fällig',
  'quality.emptyDueText':
    'Die ersten Ergebnisse erscheinen, sobald der erste Tag fällig ist.',
  'quality.firstCheck': 'Die erste Prüfung läuft am {when}.',
  'quality.latestTitle': 'Letzte Zusammenfassung',
  'quality.summaryFor': 'für {day}',
  'quality.version': 'Version {version}',
  'quality.since': 'abweichend seit {day}',
  'quality.sinceVersion': 'abweichend seit {day}, Version {version}',
  'quality.typesTable': 'Zusammenfassung von {sender} nach Typ',
  'quality.moneyTable': 'Zusammenfassung von {sender} nach Währung',
  'quality.colType': 'Typ',
  'quality.colSummary': 'Laut Zusammenfassung',
  'quality.colSite': 'Auf der Website',
  'quality.colErased': 'Gelöscht',
  'quality.colMissing': 'Fehlend',
  'quality.colExtra': 'Zusätzlich',
  'quality.colCurrency': 'Währung',
  'quality.colStatement': 'Laut Auszug',
  'quality.colShare': 'Abweichung',
  'quality.colLink': 'Weiterleitung',
  'quality.colGoals': 'Ziele',
  'quality.colPeople': 'Personen',
  'quality.unknownType': 'unbekannter Typ',
  'quality.failed': 'nach allen Wiederholungen nicht zugestellt: {n}',
  'quality.aboutUnknown':
    'Prüfung einer neueren Serverversion: Einzelheiten stehen bei ihren Tagen.',
  'quality.tolerance': 'Toleranz: {share} %.',
  'quality.expectedBy': 'Die Zusammenfassung wurde bis {when} erwartet.',
  'quality.cameAt': 'Die Zusammenfassung kam {when}.',
  'quality.keyUnknown': 'Schlüssel unbekannt',
  'quality.touches': 'Kontakte am Tag',
  'quality.labelInvalid': 'nicht nach dem Schema',
  'quality.labelExtra': 'zusätzliche Teile',
  'quality.labelLength': 'zu lang',
  'quality.future': 'aus der Zukunft (mehr als eine Stunde)',
  'quality.late': 'mehr als einen Tag verspätet',
  'quality.noRateFor': 'Kein Kurs: {currencies}.',
  'quality.staleRateFor': 'Zum Kurs des Vormonats: {items}.',
  'quality.factsChecked': 'Verglichene Zahlungen',
  'quality.factsMismatched': 'Abweichend',
  'quality.summaryOfDay': 'Zusammenfassung des Tages',
  'quality.summaryCame': 'Eingegangen {when}',
  'quality.revenueIn': 'Umsatz, {currency}',
  'quality.evaluated': 'Geprüft {when}.',
  'quality.linkLabels': 'Labels → Prüfung',
  'quality.linkEvents': 'Ereignisprotokoll des Tages',
  'quality.linkConflicts': 'Personen mit abweichendem erstem Kontakt',
  'quality.linkUnknown': 'Unbekannte',
  'quality.linkRates': 'Kurse',
  'quality.linkStatements': 'Kontoauszüge',
  'quality.resolvedBy': 'Erledigt von {name}, {when}',
  'quality.reopen': 'Wieder öffnen',
  'quality.reopened': 'Die Erledigung ist aufgehoben.',
  'quality.resolved': 'Von Hand erledigt.',
  'quality.ranAgain': 'Der Tag wurde erneut geprüft.',
  'quality.runAgain': 'Erneut prüfen',
  'quality.resolveStart': 'Von Hand erledigen',
  'quality.resolve': 'Erledigen',
  'quality.noteLabel': 'Warum Sie es erledigen',
  'quality.noteHelp':
    'Pflicht, bis {n} Zeichen: Die Notiz steht in der Zeile und im Einrichtungsprotokoll.',
  'quality.noteHint': 'Geben Sie den Grund an: 1 bis {n} Zeichen.',
  'quality.resend': 'Fehlende Ereignisse hochladen',
  'quality.resendHint':
    'Exportieren Sie beim Absender die Ereignisse vom {day} (UTC) und laden Sie die Datei hoch: Wiederholungen werden nicht doppelt gezählt.',
  'qualityCheck.summary_arrived': 'Zusammenfassung eingegangen',
  'qualityCheck.events_arrived': 'Ereignisse angekommen',
  'qualityCheck.revenue_matches': 'Umsatz stimmt',
  'qualityCheck.sender_delivered': 'Absender hat alles zugestellt',
  'qualityCheck.sender_facts': 'Zählung des Absenders',
  'qualityCheck.labels_readable': 'Labels sind lesbar',
  'qualityCheck.intake_refusals': 'Abgelehnte Ereignisse',
  'qualityCheck.repeat_conflicts': 'Wiederholungskonflikte',
  'qualityCheck.payment_duplicates': 'Keine doppelten Zahlungen',
  'qualityCheck.first_touch_stable': 'Erster Kontakt unverändert',
  'qualityCheck.event_time': 'Ereigniszeit',
  'qualityCheck.all_known': 'Alles bekannt',
  'qualityCheck.links_arrive': 'Weiterleitungen kommen an',
  'qualityCheck.rate_present': 'Kurse vorhanden',
  'qualityCheck.statement_matches': 'Abgleich mit Kontoauszug',
  'qualityCheck.low_data': 'Wenig Daten',
  'qualityAbout.summary_arrived':
    'Ob die Zusammenfassung des Absenders für den UTC-Tag bis zu seiner Uhrzeit eingegangen ist.',
  'qualityAbout.events_arrived':
    'Ereigniszahlen nach Typ laut Zusammenfassung gegen Ereignisse auf der Website und auf Wunsch gelöschte.',
  'qualityAbout.revenue_matches':
    'Umsatz laut Zusammenfassung gegen Zahlungen minus Erstattungen auf der Website — nach Währung, vor Gebühren.',
  'qualityAbout.sender_delivered':
    'Wie viele Ereignisse der Absender nach allen Wiederholungen nicht zustellen konnte (Feld failed der Zusammenfassung).',
  'qualityAbout.sender_facts':
    'Zahlungsnummer, Tag der ersten Zahlung und andere Zählungen des Absenders gegen die der Website — bei Eigenschaften mit Abgleich.',
  'qualityAbout.labels_readable':
    'Anteil der Kontakt-Labels, die nicht nach dem Schema des Absenders lesbar sind.',
  'qualityAbout.intake_refusals':
    'Ablehnungen des Empfangs über das Netz: ein fehlerhaftes Ereignis eines bekannten Absenders ist ein Fehler, falscher Schlüssel und Schlüsselsuche sind Hinweise.',
  'qualityAbout.repeat_conflicts':
    'Wiederholungen mit derselben id, aber anderem Inhalt.',
  'qualityAbout.payment_duplicates':
    'Eine Zahlungsnummer, die eine andere Zahlung desselben Absenders schon hatte.',
  'qualityAbout.first_touch_stable':
    'Personen, bei denen ein Ereignis einen anderen ersten Kontakt brachte als den gewählten.',
  'qualityAbout.event_time':
    'Ereignisse aus der Zukunft und mehr als einen Tag verspätete.',
  'qualityAbout.all_known':
    'Unbekannte Typen, Werte, Fragen, Antworten und Teile von Labels.',
  'qualityAbout.links_arrive':
    'Weiterleitungen auf der Website gegen Personen mit dem Label dieser Weiterleitung beim Absender.',
  'qualityAbout.rate_present':
    'Ob Beträge in anderen Währungen einen Kurs zur Basiswährung haben.',
  'qualityAbout.statement_matches':
    'Umsatz der Website im Monat gegen den Auszug der Bank oder des Zahlungsdienstes.',
  'qualityAbout.low_data':
    'Schwellen, unter denen Berichtszeilen abgeschwächt werden.',
  'qualityAbout.custom':
    '{metric}: schlägt an, wenn der Wert {compare} {threshold} liegt.',
  'qualityReason.intake_off': 'der Empfang war an diesem Tag aus',
  'qualityReason.no_summary': 'keine Zusammenfassung',
  'qualityReason.no_revenue': 'der Absender sendet keinen Umsatz',
  'qualityReason.no_failed':
    'der Absender sendet keine Zahl nicht zugestellter Ereignisse',
  'qualityReason.erased':
    'Zahlungen oder Erstattungen wurden gelöscht: Gelöschte Beträge speichert die Website nicht',
  'qualityReason.no_schema': 'der Absender hat kein Labelschema',
  'qualityReason.low_volume': 'zu wenig für einen Anteil',
  'qualityReason.stats_off': 'Besuchszählung ist aus',
  'qualityReason.no_links': 'keine Weiterleitungen mit festen Teilen',
  'qualityReason.no_base': 'keine Basiswährung',
  'qualityReason.stale':
    'Personen werden neu berechnet — die Prüfung läuft erneut',
  'qualityReason.no_statement': 'kein Kontoauszug',
  'qualityValue.noSummary': 'keine Zusammenfassung',
  'qualityValue.noSummaryDays':
    'keine Zusammenfassung seit {n} Tag|keine Zusammenfassung seit {n} Tagen',
  'qualityValue.summaryLate': 'nach der Frist eingegangen',
  'qualityValue.summaryOk': 'rechtzeitig eingegangen',
  'qualityValue.extra':
    '{n} Ereignis mehr auf der Website|{n} Ereignisse mehr auf der Website',
  'qualityValue.missing': '{n} Ereignis fehlt|{n} Ereignisse fehlen',
  'qualityValue.allArrived': 'alle Ereignisse angekommen',
  'qualityValue.revenueOk': 'Umsatz stimmt',
  'qualityValue.revenueOff': 'weicht um {share} % ab',
  'qualityValue.notDelivered':
    '{n} Ereignis nicht zugestellt|{n} Ereignisse nicht zugestellt',
  'qualityValue.delivered': 'alles zugestellt',
  'qualityValue.factsOff': '{n} Zahlung weicht ab|{n} Zahlungen weichen ab',
  'qualityValue.factsOk': 'Zahlen stimmen',
  'qualityValue.unreadable': '{share} % der Labels unlesbar',
  'qualityValue.readable': 'unlesbare Labels: {share} %',
  'qualityValue.invalid':
    '{n} fehlerhaftes Ereignis|{n} fehlerhafte Ereignisse',
  'qualityValue.unauthorized':
    '{n} Ablehnung wegen Schlüssel|{n} Ablehnungen wegen Schlüssel',
  'qualityValue.refusals':
    '{n} Ablehnung, innerhalb der Schwelle|{n} Ablehnungen, innerhalb der Schwelle',
  'qualityValue.noRefusals': 'keine Ablehnungen',
  'qualityValue.conflicts':
    '{n} Wiederholungskonflikt|{n} Wiederholungskonflikte',
  'qualityValue.noConflicts': 'keine Konflikte',
  'qualityValue.duplicates':
    '{n} doppelte Zahlungsnummer|{n} doppelte Zahlungsnummern',
  'qualityValue.noDuplicates': 'keine Doppelten',
  'qualityValue.touchChanged':
    '{n} Person mit abweichendem erstem Kontakt|{n} Personen mit abweichendem erstem Kontakt',
  'qualityValue.touchStable': 'erster Kontakt unverändert',
  'qualityValue.oddTime':
    '{n} Ereignis mit ungewöhnlicher Zeit|{n} Ereignisse mit ungewöhnlicher Zeit',
  'qualityValue.timeOk': 'Ereigniszeiten plausibel',
  'qualityValue.unknown':
    'Unbekanntes in {n} Ereignis|Unbekanntes in {n} Ereignissen',
  'qualityValue.allKnown': 'alles bekannt',
  'qualityValue.lagging':
    '{n} Weiterleitung bleibt zurück|{n} Weiterleitungen bleiben zurück',
  'qualityValue.linksOk': 'Weiterleitungen kommen an',
  'qualityValue.noRate': '{n} Währung ohne Kurs|{n} Währungen ohne Kurs',
  'qualityValue.staleRate':
    'Kurs des Vormonats: {n} Währung|Kurs des Vormonats: {n} Währungen',
  'qualityValue.ratesOk': 'Kurse vorhanden',
  'qualityValue.statementOk': 'stimmt mit dem Auszug',
  'qualityValue.statementOff': 'weicht um {share} % vom Auszug ab',
  'qualityValue.ruleOk': 'Wert {value}, Schwelle {threshold}',
  'qualityValue.ruleBelow': '{value} — unter der Schwelle {threshold}',
  'qualityValue.ruleAbove': '{value} — über der Schwelle {threshold}',
  'qualityDue.summary':
    'am Folgetag um {time} UTC, 5 Minuten nach der Uhrzeit der Zusammenfassung',
  'qualityDue.summaryAny':
    'am Folgetag, 5 Minuten nach der Uhrzeit der Zusammenfassung des Absenders',
  'qualityDue.utc': 'am Folgetag um 06:05 UTC',
  'qualityDue.report': 'am Folgetag um 06:05 ({zone})',
  'qualityDue.month': 'am 5. des Folgemonats um 06:05 ({zone})',
  'qualityForm.editBuiltin': 'Prüfung {name}',
  'qualityForm.enabled': 'Prüfung ist an',
  'qualityForm.enabledHint':
    'Eine ausgeschaltete Prüfung schreibt keine neuen Ergebnisse und benachrichtigt nicht; frühere bleiben.',
  'qualityForm.notify': 'Benachrichtigen',
  'qualityForm.notifyFailure': 'bei Fehler',
  'qualityForm.notifyAny': 'bei Fehler und Hinweis',
  'qualityForm.notifyOff': 'nie',
  'qualityForm.paramHint': '{min} bis {max}; Standard von Eile: {core}.',
  'qualityForm.noParams':
    'Diese Prüfung hat keine Schwellen: Ihre Frist ist die Uhrzeit der Zusammenfassung des Absenders.',
  'qualityForm.recheck':
    'Beim Speichern werden die letzten 7 Tage erneut geprüft — ohne Benachrichtigungen über die Vergangenheit.',
  'qualityForm.rangeHint': 'Eine ganze Zahl von {min} bis {max}.',
  'qualityForm.percentHint':
    'Ein Prozentwert von {min} bis {max}, bis zu einer Nachkommastelle.',
  'qualityForm.restore': 'Standard wiederherstellen',
  'qualityForm.restoreTitle': 'Standardwerte für {name} wiederherstellen?',
  'qualityForm.restoreBody':
    'Schwellen, Benachrichtigung und Ein/Aus werden auf die Standardwerte von Eile zurückgesetzt. Die letzten 7 Tage werden erneut geprüft.',
  'qualityForm.restored': 'Standardwerte wiederhergestellt.',
  'qualityForm.newCustom': 'Neue Prüfung',
  'qualityForm.editCustom': 'Prüfung {name}',
  'qualityForm.create': 'Prüfung anlegen',
  'qualityForm.codeHint':
    'Lateinische Buchstaben, Ziffern, _ und -, bis {n} Zeichen; später unveränderlich. Der Code einer eingebauten Prüfung geht nicht.',
  'qualityForm.codeBuiltin':
    'Das ist der Code einer eingebauten Prüfung: Wählen Sie einen anderen.',
  'qualityForm.metric': 'Was gezählt wird',
  'qualityForm.metricRequired': 'Wählen Sie, was gezählt wird.',
  'qualityForm.anySender': 'Jeder Absender',
  'qualityForm.senderRequired': 'Wählen Sie einen Absender.',
  'qualityForm.typeRequired': 'Wählen Sie einen Ereignistyp.',
  'qualityForm.roleRequired': 'Wählen Sie eine Rolle.',
  'qualityForm.currency': 'Währung',
  'qualityForm.currencyRequired': 'Wählen Sie eine Währung.',
  'qualityForm.goal': 'Ziel',
  'qualityForm.goalForm': 'Formular…',
  'qualityForm.formName': 'Name des Formulars',
  'qualityForm.compare': 'Schlägt an, wenn der Wert',
  'qualityForm.lt': 'unter der Schwelle',
  'qualityForm.gt': 'über der Schwelle',
  'qualityForm.threshold': 'Schwelle',
  'qualityForm.thresholdMoney': 'Schwelle, {currency}',
  'qualityForm.thresholdHint': 'Eine ganze Zahl von 0 bis {n}.',
  'qualityForm.moneyHint':
    'Ein Betrag in {currency}: Punkt oder Komma, nicht mehr Nachkommastellen als die Währung hat.',
  'qualityForm.period': 'Zeitraum',
  'qualityForm.day1': 'pro Tag',
  'qualityForm.days': 'über {n} Tage',
  'qualityForm.severity': 'Schwere',
  'qualityForm.whenDay':
    'Die Prüfung läuft täglich um 06:05 ({zone}) für den vergangenen Tag.',
  'qualityForm.whenDays':
    'Die Prüfung läuft täglich um 06:05 ({zone}) über die {n} Tage bis einschließlich des vergangenen Tages.',
  'qualityForm.ruleText': '{metric} {period} — {compare} {threshold}',
  'qualityForm.inUseResults':
    'Die Prüfung hat Ergebnisse vergangener Tage und lässt sich nicht löschen. Archivieren Sie sie: Sie prüft dann nicht mehr, frühere Ergebnisse bleiben.',
  'qualityChecks.builtin': 'Eingebaute Prüfungen',
  'qualityChecks.builtinHint':
    'Was jede Prüfung vergleicht, nach welchen Tagen und wann sie läuft. Schwellen und Benachrichtigung lassen sich ändern; eine ausgeschaltete Prüfung schreibt keine neuen Ergebnisse.',
  'qualityChecks.days': 'Tage und Frist',
  'qualityChecks.thresholds': 'Schwellen',
  'qualityChecks.state': 'Zustand',
  'qualityChecks.on': 'an',
  'qualityChecks.off': 'aus',
  'qualityChecks.corrected': 'geändert',
  'qualityChecks.core': 'Standard {value}',
  'qualityChecks.lowTitle': 'Schwellen für „wenig Daten“',
  'qualityChecks.lowHint':
    'Eine Berichtszeile wird abgeschwächt, wenn sie weniger neue Personen oder Kunden als die Schwelle hat. Die Schwellen wirken sofort auf „Quellen“, „Kohorten“, „Trichter“ und „Meilensteinvergleich“.',
  'qualityChecks.lowCore': 'Standard: {n}.',
  'qualityChecks.custom': 'Eigene Prüfungen',
  'qualityChecks.customHint':
    'Eine einfache Regel zu einer Kennzahl: „weniger als eine Zahlung am Tag“, „weniger als 20 neue Personen pro Woche“. Bis zu {n} eigene Prüfungen, archivierte mitgezählt.',
  'qualityChecks.add': 'Prüfung hinzufügen',
  'qualityChecks.full':
    'Es gibt schon {n} eigene Prüfungen, archivierte mitgezählt: Löschen Sie eine nicht benötigte.',
  'qualityChecks.noCustom': 'Noch keine eigenen Prüfungen.',
  'qualityChecks.rule': 'Regel',
  'qualityParam.missing': 'Zulässige fehlende Ereignisse',
  'qualityParam.tolerance': 'Toleranz, %',
  'qualityParam.failed': 'Zulässige nicht zugestellte',
  'qualityParam.count': 'Zulässig',
  'qualityParam.share': 'Anteil, %',
  'qualityParam.min': 'Kleinste Zahl für einen Anteil',
  'qualityParam.invalid': 'Zulässige fehlerhafte Ereignisse',
  'qualityParam.unauthorized': 'Zulässige Ablehnungen wegen Schlüssel',
  'qualityParam.days': 'Tage bis zum Kurs',
  'qualityParam.people': 'Neue Personen mindestens',
  'qualityParam.customers': 'Neue Kunden mindestens',
  'qualityMetric.events': 'Ereignisse eines Typs',
  'qualityMetric.role': 'Ereignisse mit einer Rolle',
  'qualityMetric.people': 'Neue Personen',
  'qualityMetric.customers': 'Neue Kunden',
  'qualityMetric.revenue': 'Umsatz',
  'qualityMetric.visitors': 'Besucher der Website',
  'qualityMetric.goal': 'Besucher, die ein Ziel erreicht haben',
  'qualityMetric.eventsOf': 'Ereignisse {type} von {sender}',
  'qualityMetric.roleOf': 'Ereignisse mit der Rolle {role}',
  'qualityMetric.roleOfSender': 'Ereignisse mit der Rolle {role} von {sender}',
  'qualityMetric.revenueIn': 'Umsatz in {currency}',
  'qualityMetric.anyLink': 'Jede Weiterleitung',
  'qualityMetric.link': 'Weiterleitung {name}',
  'qualityMetric.form': 'Formular „{name}“',
  'qualityKind.type': 'unbekannter Typ',
  'qualityKind.question': 'unbekannte Frage',
  'qualityKind.answer': 'unbekannte Antwort',
  'qualityKind.value': 'Wert nicht im Verzeichnis',
  'qualityKind.trait': 'Merkmal nicht im Verzeichnis',
  'qualityKind.part': 'Labelteil nicht im Verzeichnis',
  'reconcile.label': 'Mit der Zählung der Website abgleichen',
  'reconcile.none': 'Nicht abgleichen',
  'reconcile.paymentNumber': 'Zahlungsnummer',
  'reconcile.customerSince': 'Tag der ersten Zahlung',
  'reconcile.afterTrial': 'nach der Testphase',
  'reconcile.returning': 'Rückkehr',
  'reconcile.usedBy': '{mark} — schon bei {name}',
  'reconcile.taken':
    'Diese Markierung hat schon die Eigenschaft {name}: Eine Website hat sie nur einmal.',
  'reconcile.hint':
    'Der Absender sendet diesen Wert selbst: Die Website vergleicht ihn mit ihrer Zählung, eine Abweichung ist ein Hinweis „Zählung des Absenders“.',
  'reconcile.mark': 'Abgleich: {mark}',
  'senders.summaryAt': 'Zusammenfassung erwarten bis',
  'senders.summaryAtField': 'Uhrzeit der Zusammenfassung, UTC',
  'senders.noSummary': 'Der Absender sendet keine Zusammenfassungen',
  'senders.summaryAtHelp':
    'Eine Zusammenfassung ist ein Ereignis mit der Rolle „Tagesübersicht“ für den vergangenen UTC-Tag. Die Uhrzeit ist eine Frist, nicht der Sendezeitpunkt: Lassen Sie Zeit für Wiederholungen. Die Prüfung läuft 5 Minuten danach.',
  'senders.summaryAtHint': 'Eine Uhrzeit HH:MM in UTC, von 00:00 bis 23:59.',
  'senders.summaryAtShort': 'Zusammenfassung bis {time} UTC',
  'senders.noSummaryShort': 'keine Zusammenfassungen erwartet',
  'setupList.usedByCheck': 'Prüfung {name}',
  'setupLog.itemResolution': 'Erledigte Prüfung',
  'setupLog.itemStatement': 'Kontoauszug',
  'setupLog.resolutionCreated': '{check}, {day}: erledigt — {note}',
  'setupLog.resolutionRemoved':
    '{check}, {day}: Erledigung aufgehoben (war: {note})',
  'setupLog.setGroup': '{group}: {created} neu, {changed} geändert',
  'setupLog.setGroupNew': '{group}: {created} neu',
  'setupLog.setGroupChanged': '{group}: {changed} geändert',
  'setupLog.statementSummary': '{month} · {currency}: {amount}, {fees}',
  'statements.intro':
    'Die Monatssumme laut Auszug der Bank oder des Zahlungsdienstes. Am 5. vergleicht „Abgleich mit Kontoauszug“ sie mit dem Umsatz der Website im Vormonat; eine Abweichung über {share} % ist ein Fehler.',
  'statements.off':
    'Der Abgleich mit Kontoauszügen ist aus: Auszüge werden gespeichert, aber nicht verglichen.',
  'statements.toChecks': 'In „Prüfungen“ einschalten',
  'statements.add': 'Auszug hinzufügen',
  'statements.edit': 'Auszug bearbeiten',
  'statements.empty': 'Noch keine Auszüge.',
  'statements.month': 'Monat',
  'statements.monthHelp':
    'Vormonat oder früher: Der laufende ist nicht vorbei.',
  'statements.monthHint':
    'Ein Monat von 2000-01 bis zum Vormonat: Den laufenden Monat kann man nicht abgleichen.',
  'statements.exists':
    'Für diesen Monat gibt es schon einen Auszug in dieser Währung — bearbeiten Sie ihn.',
  'statements.amount': 'Betrag laut Auszug',
  'statements.amountHelp':
    'Mit Minus, wenn die Erstattungen die Zahlungen überstiegen.',
  'statements.amountHint':
    'Ein Betrag in {currency}: Punkt oder Komma, nicht mehr Nachkommastellen als die Währung hat; das Minus steht vorn.',
  'statements.fees': 'Betrag',
  'statements.gross': 'vor Gebühren',
  'statements.net': 'nach Gebühren',
  'statements.statement': 'Laut Auszug',
  'statements.site': 'Auf der Website',
  'statements.difference': 'Differenz',
  'statements.matches': 'stimmt',
  'statements.mismatch': 'Abweichung über {share} %',
  'statements.saved': 'Auszug gespeichert.',
  'statements.removed': 'Auszug gelöscht.',
  'statements.removeTitle': 'Auszug für {month}, {currency} löschen?',
  'statements.removeBody':
    'Der Monat wird dann ohne ihn geprüft: „kein Kontoauszug“ ist ein Hinweis.',
  'statements.editNamed': 'Auszug bearbeiten: {month}, {currency}',
  'statements.removeNamed': 'Auszug löschen: {month}, {currency}',
  'transfer.title': 'Übertragung',
  'transfer.exportTitle': 'Paket exportieren',
  'transfer.exportHint':
    'Die gesamte Einrichtung der Analytik als eine JSON-Datei: Absender mit Uhrzeit der Zusammenfassung, Typen, Eigenschaften, Verzeichnisse, Schemata, Zuordnungen, Weiterleitungen, Meilensteine, Trichter und Prüfungen, auch archivierte. Zwei Exporte derselben Einrichtung stimmen bis auf Name und Zeitpunkt Zeile für Zeile überein.',
  'transfer.export': 'Paket herunterladen',
  'transfer.untouched': 'Das Paket enthält nicht: {items}.',
  'transfer.fieldParams': 'Schwellenwerte und Regel',
  'transfer.importTitle': 'Paket importieren',
  'transfer.importHint':
    'Zuerst ein Probelauf: was angelegt wird, was sich ändert, Hinweise und Fehler. Der Import ist eine eigene Schaltfläche, ganz oder gar nicht; Elemente der Website, die nicht in der Datei stehen, bleiben, wie sie sind.',
  'transfer.file': 'Paketdatei',
  'transfer.fileHint': 'Eine aus Eile exportierte JSON-Datei bis {limit}.',
  'transfer.picked': 'Datei mit {size} gewählt.',
  'transfer.tooLarge':
    'Die Datei hat {size}, mehr als {limit}: Ein solches Paket importiert ein Befehl auf dem Server.',
  'transfer.notJson': 'Das ist kein JSON: Die Datei lässt sich nicht lesen.',
  'transfer.foreign':
    'Das ist kein Eile-Paket: In der Datei fehlt das Feld format mit eile-analytics-set.',
  'transfer.planning': 'Probelauf…',
  'transfer.planTitle': 'Probelauf von {name}',
  'transfer.apply': 'Importieren',
  'transfer.applyTitle': 'Paket {name} importieren?',
  'transfer.applyBody':
    'Das ist eine Änderung der Einrichtung mit Protokolleintrag; Personen werden im Hintergrund neu berechnet.',
  'transfer.cannotApply':
    'Solange das Paket Fehler hat, lässt es sich nicht importieren.',
  'transfer.nothing':
    'Nichts zu importieren: Alles ist schon wie in der Datei.',
  'transfer.created': 'neu: {n}',
  'transfer.changed': 'geändert: {n}',
  'transfer.unchanged': 'unverändert: {n}',
  'transfer.errors': 'Fehler: {n}',
  'transfer.errorsHint':
    'Die Fehler stehen bei ihrer Stelle in der Datei. Korrigieren Sie die Datei und wählen Sie sie erneut.',
  'transfer.warnings': 'Hinweise',
  'transfer.kept': 'Auf der Website, aber nicht in der Datei — unverändert',
  'transfer.samplesTitle': 'Vorlagen',
  'transfer.samplesHint':
    'Allgemeine Pakete aus dem Programm — ohne Weiterleitungen und Website-Namen, benannt in der Sprache der Verwaltung.',
  'transfer.samplePlan': 'Ansehen, was angelegt wird',
  'transfer.samplePlanNamed': 'Ansehen, was die Vorlage {name} anlegt',
  'transfer.sampleTitle': 'Vorlage {name}',
  'transfer.create': 'Anlegen',
  'transfer.countSenders': '{n} Absender|{n} Absender',
  'transfer.countTypes': '{n} Ereignistyp|{n} Ereignistypen',
  'transfer.countDictionaries': '{n} Verzeichnis|{n} Verzeichnisse',
  'transfer.countMilestones': '{n} Meilenstein|{n} Meilensteine',
  'transfer.countFunnels': '{n} Trichter|{n} Trichter',
  'transfer.startTitle': 'So beginnen Sie die Einrichtung',
  'transfer.startText':
    'Nehmen Sie eine Vorlage für Ihr Geschäftsmodell, importieren Sie ein Paket von einer anderen Website oder beginnen Sie von vorn. Eine Vorlage legt weder Schlüssel noch Weiterleitungen an — die fügen Sie selbst hinzu.',
  'transfer.startFile': 'Paket aus Datei importieren',
  'transfer.startScratch': 'Von vorn beginnen',
  'transfer.applied': 'Das Paket {name} ist importiert.',
  'transfer.appliedKey':
    'Erstellen Sie einen Schlüssel für den Absender und geben Sie ihn an die Entwickler des Bots oder Shops weiter.',
  'transfer.appliedLink':
    'Legen Sie eine Weiterleitung zu Ihrem Bot oder Shop an:',
  'transfer.untouchedIntake': 'den Empfangsschalter',
  'transfer.untouchedRetention': 'die Aufbewahrungsfrist',
  'transfer.untouchedBase': 'die Basiswährung',
  'transfer.untouchedKeys': 'Absenderschlüssel',
  'transfer.untouchedLabels': 'das Labelregister',
  'transfer.untouchedRates': 'Kurse',
  'transfer.untouchedSpend': 'Ausgaben',
  'transfer.untouchedStatements': 'Kontoauszüge',
  'transfer.untouchedEvents': 'Ereignisse',
  'transfer.untouchedPeople': 'Personen',
  'transfer.untouchedResults': 'Prüfergebnisse',
  'transfer.warnRole':
    'Der Typ {name} wechselt die Rolle und hat schon Ereignisse: Personen werden neu berechnet, Berichte ändern sich.',
  'transfer.warnSender':
    'Der neue Absender {name} hat keinen Schlüssel: Erstellen Sie einen unter „Absender“.',
  'transfer.warnDisabled':
    'Die Datei schaltet den Absender {name} aus: Seine Ereignisse erhalten dann 401.',
  'transfer.warnArchive':
    '{name}: Archiv in Datei und Website unterschiedlich — wie auf der Website belassen.',
  'transfer.warnHour':
    'Die Uhrzeit der Zusammenfassung von {name} ändert sich: Seine Prüfungen der Zusammenfassung laufen erneut.',
  'transfer.warnNewer':
    'Eine neuere Eile hat die Datei exportiert, aber nichts darin ist unbekannt.',
};

export var errors: Dictionary['errors'] = {
  http: 'Der Server antwortet nicht. Prüfen Sie, ob der Server der Website läuft.',
  server:
    'Fehler auf dem Server – die Änderungen wurden nicht gespeichert. Versuchen Sie es erneut; klappt es nicht, sehen Sie im Serverprotokoll nach.',
  'identity.invalid_credentials': 'E-Mail oder Passwort ist falsch.',
  'identity.too_many_attempts':
    'Zu viele fehlgeschlagene Versuche. Warten Sie 15 Minuten.',
  'identity.unauthorized':
    'Die Sitzung ist abgelaufen – melden Sie sich erneut an.',
  'upkeep.invalid_every':
    'Sicherungen: einmal, zweimal oder viermal täglich oder stündlich.',
  'upkeep.invalid_time': 'Uhrzeit im Format HH:MM.',
  'upkeep.invalid_keep': 'Sicherungen behalten: 1 bis 365.',
  'upkeep.invalid_folder': 'Dieser Verzeichnispfad ist nicht zulässig.',
  'upkeep.backup_running':
    'Eine Sicherung läuft bereits – warten Sie eine Minute.',
  'upkeep.backup_failed': 'Die Sicherung ist fehlgeschlagen: {detail}',
  'upkeep.releases_unavailable':
    'Die Release-Seite hat nicht geantwortet – versuchen Sie es später erneut.',
  'upkeep.invalid_endpoint':
    'Die Adresse des Speichers ist https://host, zum Beispiel https://fra1.digitaloceanspaces.com.',
  'upkeep.invalid_prefix':
    'Der Ordner im Bucket besteht aus lateinischen Buchstaben, Ziffern, Punkt, Binde- und Unterstrich und /.',
  'upkeep.invalid_region':
    'Die Region ist ein Name wie fra1 oder eu-central-1.',
  'upkeep.invalid_bucket':
    'Der Bucketname hat 3 bis 63 Buchstaben, Ziffern, Punkte und Bindestriche.',
  'upkeep.invalid_access_key':
    'Der Zugriffsschlüssel ist ein Wort ohne Leerzeichen.',
  'upkeep.offsite_incomplete': 'Bucket und Zugriffsschlüssel sind nötig.',
  'upkeep.offsite_no_secret': 'Der geheime Schlüssel ist nötig.',
  'upkeep.offsite_not_configured':
    'Der Speicher für Sicherungen ist nicht eingerichtet.',
  'upkeep.offsite_denied':
    'Der Speicher hat den Zugriff verweigert: Prüfen Sie Zugriffsschlüssel und geheimen Schlüssel. {detail}',
  'upkeep.offsite_no_bucket': 'Diesen Bucket gibt es im Speicher nicht.',
  'upkeep.offsite_unreachable':
    'Der Speicher antwortet nicht: Prüfen Sie die Adresse. {detail}',
  'upkeep.offsite_timeout':
    'Der Speicher hat nicht rechtzeitig geantwortet; versuchen Sie es später.',
  'upkeep.offsite_failed':
    'Die Sicherung liegt auf dem Server, hat den Speicher aber nicht erreicht: {detail}',
  'upkeep.offsite_other_key':
    'Die Sicherung ist mit einem anderen Schlüssel versiegelt: Stellen Sie sie mit cms restore --remote und ihrem Wiederherstellungsschlüssel wieder her.',
  'upkeep.offsite_not_found': 'Diese Sicherung gibt es im Speicher nicht.',
  'upkeep.no_disk_space':
    'Zu wenig Platz auf der Festplatte zum Verdichten: Nötig ist das Doppelte der Daten.',
  'seal.damaged':
    'Die Sicherung ist beschädigt oder verändert: Die Prüfung schlug fehl, die Website bleibt unverändert.',
  'identity.token_name': 'Benennen Sie den Schlüssel: wofür er ist.',
  'identity.too_many_tokens':
    'Es gibt bereits 20 Schlüssel: Widerrufen Sie die, die Sie nicht brauchen.',
  'identity.token_not_found':
    'Diesen Schlüssel gibt es nicht: Vielleicht wurde er schon widerrufen.',
  'identity.session_required':
    'Dafür müssen Sie sich im Manager anmelden, ein API-Schlüssel reicht nicht.',
  'identity.forbidden': 'Für Ihre Rolle ist das nicht verfügbar.',
  'identity.setup_closed':
    'Der Einrichtungslink wurde bereits verwendet oder ist ungültig.',
  'identity.weak_password':
    'Das Passwort muss mindestens 10 Zeichen lang sein.',
  'identity.reset_invalid':
    'Der Link ist abgelaufen oder wurde bereits verwendet. Fordern Sie eine neue E-Mail an.',
  'identity.too_many_requests':
    'Zu viele Anforderungen. Warten Sie 15 Minuten und versuchen Sie es dann erneut.',
  'manager.reset_unavailable':
    'Passwort-Zurücksetzen per E-Mail ist nicht eingerichtet: Nötig sind die E-Mail für Benachrichtigungen und die Adresse der Website in den Einstellungen.',
  'identity.email_taken':
    'Es gibt bereits einen Benutzer mit dieser E-Mail-Adresse.',
  'identity.invalid_email': 'Das sieht nicht nach einer E-Mail-Adresse aus.',
  'identity.last_admin':
    'Der letzte Administrator kann nicht gelöscht oder zum Redakteur gemacht werden.',
  'media.invalid_alt': 'Die Beschreibung darf höchstens 500 Zeichen lang sein.',
  'backup.invalid':
    'Das ist keine Sicherung der Website: Nötig ist eine .db- oder JSON-Datei, heruntergeladen unter „Sicherungen“.',
  'backup.foreign':
    'Das ist eine SQLite-Datenbank, aber keine Website dieses Systems.',
  'backup.newer':
    'Die Sicherung stammt aus einer neueren Programmversion: Aktualisieren Sie das Programm vor der Wiederherstellung.',
  'content.alias_taken':
    'Eine Seite auf derselben Ebene hat bereits diese Adresse.',
  'content.address_taken':
    'Eine andere Seite hat bereits diese Adresse: Sie stimmen wegen eines in Adressen ausgeblendeten Bereichsalias oder der Adressendung überein.',
  'content.invalid_alias':
    'Adresse: Kleinbuchstaben a–z, Ziffern und Bindestriche, auch mit Endung: feed.xml.',
  'content.old_path_not_found': 'Diese Seite hat keine solche alte Adresse.',
  'manager.bad_path': 'Die aufgerufene Adresse ist ungültig.',
  'assistant.unavailable':
    'Die KI antwortet gerade nicht – informieren Sie den Administrator.',
  'assistant.busy':
    'Zu viele Aufträge an die KI hintereinander – warten Sie einen Moment.',
  'assistant.no_key':
    'Ein API-Schlüssel ist nötig. Für eine neue Adresse geben Sie den Schlüssel erneut ein: Der bisherige wird nicht dorthin gesendet.',
  'identity.own_password':
    'Ihr eigenes Passwort ändern Sie mit dem aktuellen – im Menü unter Ihrem Namen.',
  'manager.type_not_allowed':
    'Diesen Typ darf nur ein Administrator wählen: Der Browser führt darin Skripte aus.',
  'content.invalid_content_type':
    'Typ: ein MIME-Typ wie text/css oder application/rss+xml.',
  'content.invalid_title': 'Der Titel darf nicht leer sein.',
  'content.invalid_text': 'Der Text in einem der Felder ist zu lang.',
  'content.invalid_language': 'Sprache: ein Code wie de oder en.',
  'content.invalid_translation':
    'Eine Seite kann keine Übersetzung ihrer selbst sein.',
  'content.translation_not_found':
    'Die Ausgangsseite gibt es nicht mehr – wählen Sie eine andere.',
  'content.translation_has_translations':
    'Diese Seite hat eigene Übersetzungen: Verknüpfen Sie diese mit der anderen Ausgangsseite und lassen Sie diese Seite Ausgangsseite bleiben.',
  'content.invalid_social_image': 'Wählen Sie das Bild aus der Mediathek.',
  'content.invalid_template': 'Wählen Sie eine Vorlage für die Seite.',
  'content.invalid_kind': 'Diese Seitenart gibt es nicht.',
  'content.invalid_page_id': 'Diese Seite gibt es nicht.',
  'content.page_exists': 'Eine Seite mit dieser ID gibt es bereits.',
  'content.invalid_field_type': 'Diesen Feldtyp gibt es nicht.',
  'content.page_not_found': 'Seite nicht gefunden.',
  'content.invalid_parent':
    'Eine Seite kann nicht in sich selbst verschoben werden.',
  'content.invalid_link':
    'Ein Link führt zu https://…, /pfad oder einer Seiten-ID.',
  'content.invalid_schedule':
    'Das Zurückziehen muss später liegen als die Veröffentlichung.',
  'content.invalid_moment': 'Das sieht nicht nach Datum und Uhrzeit aus.',
  'content.invalid_field_value': 'Der Wert passt nicht zum Feldtyp.',
  'content.field_not_assigned':
    'Dieses Feld ist der Vorlage der Seite nicht zugewiesen.',
  'content.invalid_field_name':
    'Feldname in camelCase ohne Umlaute: price, mainImage.',
  'content.invalid_field_options': 'Eine Liste braucht Auswahlwerte.',
  'design.invalid_name': 'Name in PascalCase ohne Umlaute: Header, BlogCard.',
  'design.empty_source': 'Der Code des Elements darf nicht leer sein.',
  'design.source_too_large': 'Der Code des Elements ist zu groß.',
  'design.compile_failed': 'Kompiliert nicht – {detail}',
  'design.forbidden_import': 'Dieser Import ist nicht erlaubt – {detail}',
  'design.island_import':
    'Eine Insel läuft im Browser, dieser Import ist dort nicht erlaubt – {detail}',
  'design.island_placeholders':
    'Eine Insel kennt keine Übersetzungen und eigenen Einstellungen: Übergeben Sie Texte über Eigenschaften (Props).',
  'design.key_tags':
    'In der Vorlage schreibt man Schlüssel als Ausdrücke: {site.i18n.key} und {site.custom.key}, nicht {i18n.key} und [@key].',
  'design.import_cycle':
    'Elemente importieren sich gegenseitig im Kreis – {detail}',
  'design.invalid_script_name':
    'Ein Skriptname besteht aus Kleinbuchstaben a–z, Ziffern und Bindestrichen: kitchen-stage.',
  'design.script_syntax':
    'Das Skript lässt sich nicht als ES-Modul lesen — {detail}',
  'design.script_import':
    'Ein Skript importiert nur andere Skripte der Website als ./name.js und https://-Adressen; bündeln Sie den Rest in Skripte — {detail}',
  'design.unknown_script':
    'Das Skript verweist auf ein Skript, das es nicht gibt: Speichern Sie es vorher oder zusammen mit diesem — {detail}',
  'design.invalid_scripts':
    'Skripte eines Builds werden als Objekt Name → Quelltext übergeben.',
  'extensions.empty_source': 'Der Code des Plugins darf nicht leer sein.',
  'extensions.source_too_large': 'Der Code des Plugins ist zu groß.',
  'extensions.compile_failed': 'Das Plugin kompiliert nicht – {detail}',
  'extensions.forbidden_import':
    'Dieser Import ist im Plugin nicht erlaubt – {detail}',
  'extensions.invalid_plugin':
    'Der Standardexport des Plugins muss { render?, notFound?, handle?, schedule?, on? } sein.',
  'site.invalid_name': 'Der Name der Website darf nicht leer sein.',
  'site.invalid_language': 'Sprache: ein Code wie de, en oder pt-BR.',
  'site.invalid_url':
    'Website-Adresse vollständig, mit https://: https://example.com.',
  'site.invalid_description':
    'Die Beschreibung darf höchstens 500 Zeichen lang sein.',
  'site.invalid_image': 'Wählen Sie das Bild aus der Mediathek.',
  'site.invalid_robots':
    'Die zusätzlichen Regeln dürfen höchstens 5000 Zeichen lang sein.',
  'site.invalid_synonyms':
    'Synonyme dürfen höchstens 20.000 Zeichen lang sein.',
  'site.invalid_page': 'Diese Seite gibt es nicht.',
  'site.invalid_cache': 'Cache-Größe: eine ganze Zahl von 16 bis 4096 MB.',
  'site.invalid_paging':
    'Wort in der Adresse der Listenseiten: Kleinbuchstaben a–z, mit Bindestrichen getrennt, zum Beispiel page.',
  'site.invalid_view_transitions': 'Übergänge sind entweder an oder aus.',
  'site.invalid_suffix':
    'Die Adressendung ist leer, / oder eine Endung wie .html.',
  'site.invalid_key':
    'Schlüssel: Buchstaben ohne Umlaute, Ziffern und _, am Anfang ein Buchstabe: phone, footerText.',
  'site.invalid_setting': 'Der Wert ist zu lang.',
  'site.invalid_translation': 'Die Übersetzung ist zu lang.',
  'identity.invalid_role': 'Diese Rolle gibt es nicht.',
  'identity.invalid_user_id': 'Diesen Benutzer gibt es nicht.',
  'identity.user_not_found': 'Diesen Benutzer gibt es nicht.',
  'media.no_file': 'Wählen Sie eine Datei.',
  'manager.not_found': 'Diese Aktion gibt es nicht.',
  'manager.internal':
    'Fehler auf dem Server – die Änderungen wurden nicht gespeichert. Versuchen Sie es erneut; klappt es nicht, sehen Sie im Serverprotokoll nach.',
  'design.element_exists': 'Ein Element mit diesem Namen gibt es bereits.',
  'forms.invalid_name':
    'Formularname: Kleinbuchstaben a–z, Ziffern und Bindestriche.',
  'forms.invalid_title': 'Geben Sie eine Bezeichnung für das Formular ein.',
  'forms.invalid_text': 'Der Text ist zu lang.',
  'forms.invalid_page': 'Diese Seite gibt es nicht.',
  'forms.invalid_channels': 'Wählen Sie die Kanäle aus.',
  'forms.invalid_retention': 'Aufbewahrungsdauer: 1 bis 3650 Tage.',
  'forms.invalid_seconds': 'Zeit: 0 bis 60 Sekunden.',
  'forms.source_too_large': 'Das Formular ist zu groß.',
  'forms.form_exists': 'Ein Formular mit diesem Namen gibt es bereits.',
  'forms.form_not_found': 'Dieses Formular gibt es nicht.',
  'forms.file_not_found': 'Diese Anfrage hat keine solche Datei.',
  'forms.submission_not_found': 'Diese Anfrage gibt es nicht.',
  'forms.invalid_status': 'Diesen Status gibt es nicht.',
  'forms.no_deliveries':
    'Zu dieser Anfrage gab es keine Benachrichtigungen – es gibt nichts zu senden.',
  'forms.no_webhook': 'Diese Anfrage wurde nicht an einen Webhook gesendet.',
  'forms.invalid_webhook':
    'Die Webhook-Adresse beginnt mit https://; http:// nur für localhost und 127.0.0.1.',
  'forms.invalid_confirmation':
    'Die E-Mail an den Absender braucht einen Text und ein Feld mit der E-Mail-Adresse.',
  'forms.reserved_cookie':
    'Das ist ein Cookie des CMS selbst (cms_…, __Host-…, __Secure-…): Ein Formularfeld kann seinen Wert nicht übernehmen.',
  'forms.invalid_cookie':
    'Das ist kein Cookie-Name: lateinische Buchstaben, Ziffern und Zeichen wie _ - . ohne Leerzeichen.',
  'forms.invalid_labels':
    'Beschriftungen eines versteckten Felds (data-labels) werden so geschrieben: wert=Beschriftung|wert=Beschriftung – jeder Wert hat eine Beschriftung, kein Wert kommt doppelt vor.',
  'forms.labels_not_hidden':
    'data-labels gibt es nur bei versteckten Feldern: Auswahlliste und Auswahlfelder nehmen die Beschriftungen aus ihren Optionen.',
  'manager.kit_changed':
    'Die Komponente wurde auf der Website geändert – auf die Fassung aus dem Baukasten lässt sie sich nur ausdrücklich zurücksetzen.',
  'manager.kit_not_found': 'Diese Komponente gibt es im Baukasten nicht.',
  'notify.invalid_token':
    'Das sieht nicht nach einem Bot-Token aus: Ziffern, Doppelpunkt und ein langer Schlüssel von @BotFather.',
  'notify.no_token': 'Ein Bot-Token ist nötig.',
  'notify.invalid_chat':
    'Chat: eine Zahl aus Telegram oder der @Name eines Kanals; höchstens 20 Chats.',
  'notify.invalid_proxy': 'Proxy: http://host:port oder https://host:port.',
  'notify.invalid_host': 'SMTP-Server: ein Hostname wie smtp.gmx.de.',
  'notify.invalid_port': 'Port: eine Zahl von 1 bis 65535.',
  'notify.invalid_security': 'Wählen Sie die Verschlüsselung.',
  'notify.no_password':
    'Ein Passwort ist nötig – oder entfernen Sie den Benutzernamen, wenn der Server E-Mails ohne Anmeldung annimmt.',
  'notify.invalid_email':
    'Prüfen Sie die Adressen: ein Absender und ein bis zehn Empfänger.',
  'notify.invalid_level':
    'Wählen Sie, ab welcher Wichtigkeit benachrichtigt wird.',
  'notify.invalid_language': 'Wählen Sie die Sprache der Benachrichtigungen.',
  'notify.not_configured':
    'Der Kanal ist nicht eingerichtet – speichern Sie ihn zuerst.',
  'notify.no_chats': 'Fügen Sie mindestens einen Chat hinzu.',
  'notify.test_failed':
    'Der Kanal hat die Nachricht nicht angenommen – {detail}',
  'notify.delivery_not_found':
    'Diese Benachrichtigung ist nicht in der Warteschlange.',
  'notify.invalid_gateway_path':
    'Die Adresse des Gateways sieht aus wie /mailer/: lateinische Buchstaben, Ziffern und Bindestriche; nicht /manager, /media oder /_cms.',
  'notify.invalid_rate_limit':
    'Die Grenze ist eine ganze Zahl von 0 bis 10000.',
  'notify.invalid_sender':
    'Erlaubte Absender sind E-Mail-Adressen, durch Komma getrennt, höchstens 20.',
  'notify.invalid_domain':
    'Domains der Empfänger sehen aus wie example.com, durch Komma getrennt, höchstens 50.',
  'notify.token_label': 'Benennen Sie den Token: Wer sendet damit?',
  'notify.too_many_tokens':
    'Höchstens 10 Tokens – widerrufen Sie einen, den Sie nicht brauchen.',
  'notify.gateway_token_not_found':
    'Diesen Token gibt es nicht – vielleicht wurde er schon widerrufen.',
  'notify.invalid_transport':
    'Wählen Sie den Versandweg: SMTP oder einen der Dienste.',
  'notify.no_key': 'Der API-Schlüssel des Dienstes ist erforderlich.',
  'notify.invalid_key':
    'Das sieht nicht nach einem API-Schlüssel aus: Kopieren Sie ihn vollständig, ohne Leerzeichen.',
  'notify.brevo_smtp_key':
    'Das ist ein SMTP-Schlüssel von Brevo (xsmtpsib-…); nötig ist ein API-Schlüssel (xkeysib-…).',
  'notify.resend_key': 'Ein API-Schlüssel von Resend beginnt mit re_.',
  'notify.no_key_id': 'Die Zugriffsschlüssel-ID (AKIA…) ist erforderlich.',
  'notify.invalid_key_id':
    'Die Zugriffsschlüssel-ID sieht aus wie AKIAIOSFODNN7EXAMPLE.',
  'notify.temporary_key':
    'Temporäre AWS-Schlüssel (ASIA…) laufen ab – erstellen Sie einen Zugriffsschlüssel eines IAM-Benutzers (AKIA…).',
  'notify.invalid_region':
    'Die Region ist us oder eu bei Mailgun, ein Code wie eu-central-1 bei AWS.',
  'notify.invalid_mail_domain':
    'Die Versanddomain sieht aus wie mg.example.com.',
  'notify.invalid_stream':
    'Der Message Stream ist eine ID wie outbound: lateinische Buchstaben, Ziffern und Bindestriche.',
  'design.element_in_use':
    'Das Element wird verwendet – entfernen Sie es zuerst dort.',
  'redirects.invalid_from':
    'Feld „Von“: eine Adresse der Website wie /old, ein Bereich /old/* oder eine Adresse mit Query wie /?p=12 (Paare Name=Wert, ohne # und Sternchen).',
  'redirects.reserved':
    'Diese Adresse ist vom Manager oder von Systemdateien belegt.',
  'redirects.invalid_to':
    'Feld „Nach“: eine Adresse der Website, eine vollständige URL oder eine Seite [~id~]. Ein Sternchen nur bei einer Regel für einen Bereich.',
  'redirects.invalid_status': 'Code: 301 oder 302.',
  'redirects.invalid_note': 'Notiz: höchstens 200 Zeichen.',
  'redirects.loop': 'Die Regel leitet auf sich selbst weiter.',
  'redirects.chain':
    'Es entstünde eine Weiterleitungskette: Geben Sie die endgültige Adresse an, nicht eine, die selbst weitergeleitet wird.',
  'redirects.rule_exists':
    'Für diese Adresse gibt es bereits eine Regel – ändern Sie diese.',
  'redirects.rule_not_found': 'Diese Regel gibt es nicht.',
  'redirects.page_not_found':
    'Diese Seite gibt es nicht, oder sie liegt im Papierkorb.',
  'extensions.plugin_exists': 'Ein Plugin mit diesem Namen gibt es bereits.',
  'content.field_exists': 'Dieses Feld gibt es bereits.',
  'content.field_not_found': 'Dieses Feld gibt es nicht.',
  'media.linked_file':
    'Die Datei liegt in einem verknüpften Ordner auf dem Server: Ändern Sie sie dort und führen Sie cms media link aus.',
  'media.stem_taken':
    'Es gibt bereits ein Bild mit demselben Namen und anderer Endung, und verkleinerte Kopien werden ohne Endung benannt. Geben Sie der Datei einen anderen Namen oder ersetzen Sie jenes Bild.',
  'media.unsupported_type': 'Dieser Dateityp wird nicht angenommen.',
  'media.invalid_path':
    'Ordner und Dateiname: Kleinbuchstaben a–z, Ziffern, Bindestriche.',
  'media.invalid_size': 'Die Datei ist leer oder größer als 25 MB.',
  'extensions.invalid_name': 'Name des Plugins in PascalCase ohne Umlaute.',
  'extensions.plugin_not_found': 'Dieses Plugin gibt es nicht.',
  'manager.invalid_appearance':
    'Farbe im Format #rrggbb, Schema: System, hell oder dunkel.',
  'design.element_not_found': 'Dieses Element gibt es nicht.',
  'media.file_not_found': 'Diese Datei gibt es nicht.',
  'stats.invalid_link':
    'Ein Ziel-Link ist der Anfang einer Adresse ohne Leerzeichen: https://…, /pfad, tel: oder mailto:.',
  'stats.too_many_links': 'Höchstens 20 Ziel-Links.',
  'stats.invalid_retention': 'Unbegrenzt oder 30 bis 3650 Tage aufbewahren.',
  'stats.invalid_time_zone': 'Eine Zeitzone sieht so aus: Europe/Berlin.',
  'stats.invalid_period':
    'Ein Zeitraum hat bis zu 366 Tage und beginnt vor seinem Ende.',
  'review.not_reviewable': 'Das lässt sich im Prüfmodus nicht vorschlagen.',
  'review.conflict':
    'Das Ziel wurde nach dem Vorschlag geändert. Wählen Sie „Trotzdem annehmen“ oder lehnen Sie ab.',
  'review.apply_failed':
    'Ein Vorschlag ließ sich nicht anwenden, die Website ist unverändert: {detail}',
  'review.page_published':
    'Die Seite ist schon live — teilen Sie ihre Adresse.',
  'review.page_not_in_set': 'Diese Seite ist nicht im Änderungssatz.',
  'review.invalid_days': 'Ein Link gilt 1–90 Tage.',
  'review.invalid_settings': 'Ein Link gilt 1–90 Tage.',
  'review.agent_gone':
    'Den Benutzer, für den der Agent gearbeitet hat, gibt es nicht mehr.',
  'review.change_set_not_found': 'Diesen Änderungssatz gibt es nicht.',
  'review.proposal_not_found':
    'Der Vorschlag ist schon entschieden oder fehlt.',
  'review.link_not_found': 'Diesen Link gibt es nicht.',
  'analytics.invalid_code':
    'Ein Code besteht aus kleinen lateinischen Buchstaben, Ziffern, _ und - und hält die Länge der Gruppe ein.',
  'analytics.invalid_item':
    'Nicht gespeichert: Ein Feldwert passt nicht — prüfen Sie ihn.',
  'analytics.invalid_reference':
    'Das verweist auf ein Element, das fehlt oder archiviert ist: Wählen Sie ein anderes oder holen Sie es aus dem Archiv.',
  'analytics.too_many':
    'Die Grenze ist erreicht: Löschen Sie Elemente, die Sie nicht brauchen — archivierte zählen mit.',
  'analytics.in_use':
    'Andere Elemente oder Ereignisse verweisen darauf: Archivieren Sie es stattdessen.',
  'analytics.item_not_found':
    'Dieses Element gibt es nicht mehr — aktualisieren Sie die Ansicht.',
  'analytics.key_not_found':
    'Diesen Schlüssel gibt es nicht mehr — er wurde widerrufen.',
  'analytics.person_not_found':
    'Dieses Pseudonym hat keine Ereignisse: Der Verlauf wurde gelöscht oder gab es nie.',
  'analytics.event_not_found':
    'Dieses Ereignis gibt es nicht mehr — es wurde gelöscht.',
  'analytics.disabled':
    'Der Ereignisempfang ist aus: Schalten Sie ihn im Tab „Statistik“ der Einstellungen ein.',
  'analytics.no_sender':
    'Die Website hat keinen aktiven Absender: Legen Sie einen unter „Statistik → Einrichtung“ an.',
  'analytics.sender_inactive':
    'Der Absender ist aus oder archiviert: Die Website nimmt keine seiner Ereignisse an.',
  'analytics.sender_required':
    'Wählen Sie einen Absender: Die Website hat mehrere.',
  'analytics.sender_not_found': 'Diesen Absender gibt es nicht.',
  'analytics.sender_route':
    'Absender werden im Tab „Absender“ angelegt und geändert.',
  'analytics.invalid_retention':
    'Die Aufbewahrung beträgt 1 bis 120 Monate oder ist unbegrenzt.',
  'analytics.invalid_query':
    'Die Parameter passen nicht: Prüfen Sie Zeitraum, Gruppierung und Filter oder setzen Sie sie zurück.',
  'analytics.invalid_subject':
    'Das ist kein Pseudonym: 6–128 lateinische Buchstaben, Ziffern und . _ : -, nicht nur Ziffern.',
  'analytics.invalid_group': 'Diese Gruppe der Einrichtung gibt es nicht.',
  'manager.too_large': 'Die Datei ist größer, als diese Ansicht annimmt.',
  'analytics.invalid_label':
    'Das Label lässt sich nicht ausgeben: Teilwerte stammen aus den Verzeichnissen und sind nicht archiviert, mindestens ein Teil hat einen Wert, der Name hat 1 bis 100 Zeichen.',
  'analytics.label_not_found':
    'Dieses Label steht nicht mehr im Register — aktualisieren Sie die Ansicht.',
  'analytics.funnel_not_found':
    'Diesen Trichter gibt es nicht: Er wurde gelöscht, oder die Adresse hat einen Tippfehler.',
  'analytics.invalid_currency':
    'Die Währung ist ein ISO-4217-Code aus drei Großbuchstaben, etwa EUR.',
  'analytics.no_base_currency':
    'Legen Sie zuerst die Basiswährung der Berichte fest: Kurse werden zu ihr eingetragen. Einstellungen → Statistik.',
  'analytics.invalid_rate':
    'Der Kurs ist nicht gespeichert: Die Währung ist nicht die Basiswährung, der Tag liegt nicht nach heute, der Kurs ist eine Zahl über null mit bis zu 9 Stellen vor dem Komma und 10 danach.',
  'analytics.rate_not_found':
    'Diesen Kurs gibt es nicht mehr — aktualisieren Sie die Ansicht.',
  'analytics.invalid_spend':
    'Die Ausgaben sind nicht gespeichert: Der Monat liegt nicht nach dem laufenden, Teile und Werte stammen aus den Verzeichnissen und sind nicht archiviert, der Betrag ist ab null mit den Nachkommastellen der Währung, die Notiz hat bis zu 500 Zeichen.',
  'analytics.spend_exists':
    'Eine Zeile mit diesem Monat, diesen Teilen und dieser Währung gibt es schon — bearbeiten Sie diese.',
  'analytics.spend_not_found':
    'Diese Ausgabenzeile gibt es nicht mehr — aktualisieren Sie die Ansicht.',
  'analytics.invalid_set':
    'Das Paket ist nicht angewendet: Es enthält einen Fehler, nichts wurde geändert.',
  'analytics.check_not_found':
    'Diese Prüfung oder ihr Ergebnis für den Tag gibt es nicht — laden Sie die Ansicht neu.',
  'analytics.check_not_open':
    'Erledigen lässt sich nur ein offener Hinweis oder Fehler, wieder öffnen nur ein erledigter. Laden Sie die Ansicht neu.',
  'analytics.invalid_note':
    'Geben Sie an, warum Sie es erledigen: 1 bis 500 Zeichen.',
  'analytics.invalid_check':
    'Die Prüfung ist nicht gespeichert: Felder der Kennzahl, Vergleich, Schwelle, Zeitraum oder Schwere passen nicht.',
  'analytics.invalid_statement':
    'Der Auszug ist nicht gespeichert: Monat höchstens der Vormonat, Währung ein ISO-4217-Code, Betrag passend zur Währung, Notiz bis 500 Zeichen.',
  'analytics.statement_not_found':
    'Diesen Auszug gibt es nicht mehr — laden Sie die Ansicht neu.',
  'analytics.sample_not_found':
    'Diese Vorlage gibt es nicht — laden Sie die Ansicht neu.',
};
