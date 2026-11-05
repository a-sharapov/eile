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
    'TypeScript-Module mit den Hooks render und notFound sowie Abonnements auf Ereignisse.',
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
  'inbox.more': 'Mehr anzeigen',
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
  'media.empty': 'Die Mediathek ist noch leer.',
  'plugins.title': 'Plugins',
  'plugins.new': 'Neues Plugin',
  'plugins.empty': 'Wählen Sie ein Plugin oder legen Sie ein neues an.',
  'plugins.hint':
    'export default { render(html, { path, status }), notFound(path), on: { [Ereignistyp]: (event) => … } }. Import – nur $core.',
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
  'stats.sourcesHint':
    'Die Quelle ist das Tag utm_source, sonst die Website, von der der Besucher kam; bekannte Dienste stehen unter einem Namen (google.de und utm_source=google sind Google). Unter „Websites“ stehen die Hosts unverändert; Kanäle und Kampagnen sind die Tags utm_medium und utm_campaign.',
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
    'Ein Ziel ist eine angenommene Formularanfrage (ohne Spam) oder ein Klick auf einen Ziel-Link. Die Conversion-Rate ist der Anteil der Tagesbesucher, die es erreicht haben.',
  'stats.goalsEmpty':
    'Keine Ziele in diesem Zeitraum. Formularanfragen zählen von selbst, Link-Klicks, sobald der Beacon in den Einstellungen an ist.',
  'stats.goalForm': 'Formular',
  'stats.goalLink': 'Link',
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
    'Der Standardexport des Plugins muss { render?, notFound?, on? } sein.',
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
};
