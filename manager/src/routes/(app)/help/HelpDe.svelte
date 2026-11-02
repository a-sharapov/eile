<script lang="ts">
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { openPalette } from '#lib/palette.svelte.ts';
import { resolve } from '$app/paths';
import type { HelpProps } from './help.ts';

let { shown, chapterShown, mod, admin }: HelpProps = $props();
</script>

  <!-- Благодарность — первой: идеи менеджера пришли отсюда. -->
  <aside class="thanks" aria-labelledby="thanks-title">
    <h2 id="thanks-title">Danke, MODX</h2>
    <p>
      {t('app.name')} ist von <a href="https://modx.com" target="_blank" rel="noopener">MODX</a> Evolution inspiriert: der Seitenbaum als wichtigstes
      Werkzeug, Vorlagen und Chunks, Zusatzfelder für Seiten, Einfachheit für alle, die Texte schreiben. Danke an die Autoren und die Community
      von MODX für die Jahre der Arbeit und für die Ideen, die hier weiterleben.
    </p>
  </aside>

  <p class="lead">
    Hier lesen Sie, wie Sie die Website im Manager pflegen: Seiten anlegen und veröffentlichen, Texte schreiben, mit Bildern arbeiten und
    in Sekunden finden, was Sie suchen. Der Reihe nach lesen müssen Sie nicht – öffnen Sie ein Kapitel im Inhaltsverzeichnis oder suchen Sie ein Wort in der Hilfe.
  </p>


  <!-- С чего начать -->
  <h2 id="start" hidden={!chapterShown('start')}>Erste Schritte</h2>
  <section id="start-layout" data-topic hidden={!shown('start-layout')}>
    <h3>So ist der Manager aufgebaut</h3>
    <ul>
      <li><strong>Kopfzeile</strong> – die Bereiche, das Feld „Gehe zu“ für den Schnellzugriff, ein Link zur Website und rechts Ihr Menü.</li>
      <li><strong>Seitenbaum</strong> links – die ganze Website mit ihrer Verschachtelung. Die Zahl rechts neben dem Titel ist die Nummer der Seite (ID). Den Baum können Sie mit der Schaltfläche {@html icons.panelClose} ausblenden und breiter machen, indem Sie an seinem Rand ziehen.</li>
      <li><strong>Arbeitsfläche</strong> rechts – die geöffnete Ansicht: Übersicht, Seite, Mediathek. Oben steht eine Zeile mit Pfad, Status und Schaltflächen für Aktionen.</li>
    </ul>
    <p>Auf dem Smartphone öffnet die Schaltfläche {@html icons.menu} in der Kopfzeile den Baum; er schließt sich von selbst, sobald Sie eine Seite gewählt haben.</p>
  </section>
  <section id="start-overview" data-topic hidden={!shown('start-overview')}>
    <h3>Website-Übersicht</h3>
    <p>
      Die erste Ansicht nach der Anmeldung ist die <a href={resolve('/(app)/pages')}>Tabelle der Seiten</a> in Baumreihenfolge. Titel, Adresse, Menütitel
      und Vorlage bearbeiten Sie direkt in der Zeile – gespeichert wird, sobald Sie das Feld verlassen; Enter führt zur selben Spalte eine Zeile tiefer, Esc bricht ab.
      Die Häkchen „Im Menü“ und „Veröffentlicht“ wirken sofort. Die Status-Schaltflächen oben heben zum Beispiel nur die Entwürfe hervor.
    </p>
    <p>
      Die Ansicht „Baum“ zeigt die Website nach Bereichen, rechts daneben die letzten Änderungen (was geändert wurde, von wem und wann) und
      was zu erledigen ist: geplante Veröffentlichungen und Entwürfe.
    </p>
  </section>
  <section id="start-statuses" data-topic hidden={!shown('start-statuses')}>
    <h3>Was die Symbole bei Seiten bedeuten</h3>
    <p>Das Symbol im Baum zeigt den Typ der Seite, der Punkt an seiner Ecke den Status.</p>
    <ul class="legend">
      <li><span class="glyph" aria-hidden="true">{@html icons.file}</span><span><strong>Seite</strong> – eine normale Seite der Website, die Vorlage erzeugt sie.</span></li>
      <li><span class="glyph" aria-hidden="true">{@html icons.fileCode}</span><span><strong>Datei</strong> – CSS, Feed, SVG, robots.txt: Die Website liefert den Text unverändert aus. Jeder Typ hat sein eigenes Symbol.</span></li>
      <li data-status="published"><i class="status-node" aria-hidden="true"></i><span><strong>Veröffentlicht</strong> – Besucher sehen die Seite.</span></li>
      <li data-status="draft"><i class="status-node" aria-hidden="true"></i><span><strong>Entwurf</strong> – auf der Website gibt es die Seite nicht; ihr Titel steht im Baum kursiv.</span></li>
      <li data-status="scheduled"><i class="status-node" aria-hidden="true"></i><span><strong>Geplant</strong> – erscheint zur festgelegten Zeit von selbst.</span></li>
      <li data-status="trashed"><i class="status-node" aria-hidden="true"></i><span><strong>Im Papierkorb</strong> – von der Website genommen, lässt sich wiederherstellen.</span></li>
      <li><span class="glyph" aria-hidden="true">{@html icons.eyeOff}</span><span><strong>Im Menü ausgeblendet</strong> – die Seite ist über ihre Adresse erreichbar, steht aber nicht im Menü der Website.</span></li>
      <li><span class="glyph" aria-hidden="true">{@html icons.link}</span><span><strong>Link</strong> – keine Seite, sondern ein Verweis auf eine andere Adresse.</span></li>
    </ul>
  </section>

  <!-- Страницы -->
  <h2 id="pages" hidden={!chapterShown('pages')}>Seiten</h2>
  <section id="pages-create" data-topic hidden={!shown('pages-create')}>
    <h3>Seite anlegen</h3>
    <ol>
      <li>Klicken Sie in der Übersicht auf „Neue Seite“ oder über dem Baum auf das Symbol {@html icons.filePlus}. Soll die Seite gleich in einem Bereich liegen, zeigen Sie im Baum auf den Bereich und klicken Sie auf <strong>+</strong>.</li>
      <li>Schreiben Sie den Titel – die Adresse wird automatisch daraus gebildet, bis Sie sie von Hand ändern. Ändern Sie den Titel einer bestehenden Seite, führt die alte Adresse weiterhin zu ihr.</li>
      <li>Schreiben Sie den Text und klicken Sie auf „Speichern“ oder drücken Sie <kbd>{mod}</kbd>+<kbd>S</kbd>. Die Seite wird als Entwurf gespeichert – Besucher sehen sie noch nicht.</li>
      <li>Wenn alles fertig ist, klicken Sie auf „Veröffentlichen“.</li>
    </ol>
  </section>
  <section id="pages-editor" data-topic hidden={!shown('pages-editor')}>
    <h3>Tabs der Seite</h3>
    <dl>
      <dt>Dokument</dt>
      <dd>Titel, Adresse, Zusammenfassung (kurzer Text für Listen) und Text. Rechts: die Einordnung auf der Website (übergeordnete Seite und Vorlage), Veröffentlichung und Menü: Menütitel und Position unter den Nachbarseiten.</dd>
      <dt>Felder</dt>
      <dd>Zusatzfelder, die die Vorlage ausgibt: Preis, Titelbild, Datum. Den Tab gibt es nur, wenn die Vorlage solche Felder hat. Ein leeres Feld mit dem Hinweis „Leer – übernommen von …“ erhält seinen Wert vom Bereich darüber.</dd>
      <dt>Suche &amp; Social</dt>
      <dd>Titel und Beschreibung für Suchmaschinen, ein Bild für soziale Netzwerke und Messenger und eine Vorschau, wie die Seite nach außen aussieht. Hier können Sie auch eine Hilfsseite vor der Suche verbergen und alte Adressen ansehen.</dd>
      <dt>Einstellungen</dt>
      <dd>Caching, Art (Seite oder Link) und Inhaltstyp, Sprache des Zweigs, zeitgesteuerte Veröffentlichung. Hier schauen Sie meist nur selten vorbei.</dd>
      <dt>Übersetzungen</dt>
      <dd>Auf einer mehrsprachigen Website ebenfalls in den Einstellungen: Geben Sie an, welche Seite diese übersetzt. Suchmaschinen erhalten hreflang-Links zu allen Sprachen, und eine Vorlage kann mit <code>translations()</code> aus <code>$core</code> einen Sprachumschalter zeichnen.</dd>
    </dl>
    <p>Ein Punkt auf einem Tab bedeutet, dass es dort ungespeicherte Änderungen gibt. Wenn Sie die Seite verlassen, ohne zu speichern, fragt der Manager vorher nach.</p>
  </section>
  <section id="pages-publish" data-topic hidden={!shown('pages-publish')}>
    <h3>Sofort oder geplant veröffentlichen</h3>
    <p>
      „Veröffentlichen“ und „Zurückziehen“ finden Sie in der Zeile über der Seite. Soll die Seite von selbst erscheinen, klicken Sie im Block
      „Veröffentlichung“ auf „Veröffentlichung planen“: Der Tab „Einstellungen“ öffnet sich mit den Feldern „Veröffentlichen am“ und „Zurückziehen am“.
      Speichern Sie – zum festgelegten Zeitpunkt geschieht alles ohne Sie. Klicken Sie bei einer geplanten Seite auf „Veröffentlichen“,
      fragt der Manager, ob sie vorzeitig erscheinen soll.
    </p>
    <p>Das Auge {@html icons.eye} in der Zeile der Seite öffnet die Vorschau: So sieht die Seite auf der Website aus, auch wenn sie noch nicht veröffentlicht ist. Die Vorschau zeigt die gespeicherte Version.</p>
  </section>
  <section id="pages-menu" data-topic hidden={!shown('pages-menu')}>
    <h3>Menü der Website</h3>
    <p>
      Im Menü erscheint die Seite mit ihrem „Menütitel“ – er darf kürzer sein als der Titel. „Im Menü ausblenden“ lässt die Seite
      über ihre Adresse erreichbar, nimmt sie aber aus dem Menü. Die Reihenfolge im Menü ist dieselbe wie im Baum.
    </p>
  </section>
  <section id="pages-move" data-topic hidden={!shown('pages-move')}>
    <h3>Verschieben und sortieren</h3>
    <ul>
      <li>Ziehen Sie die Seite im Baum: auf eine Zeile, um sie unterzuordnen, an den Rand einer Zeile, um sie daneben einzuordnen.</li>
      <li>Oder öffnen Sie das Seitenmenü (Rechtsklick auf die Zeile oder die Schaltfläche „…“) → „Verschieben nach…“.</li>
      <li>Mit der Tastatur: <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> verschiebt die Seite unter ihren Nachbarseiten.</li>
    </ul>
    <p>Nach dem Verschieben oder einer Adressänderung führt die alte Adresse weiter zur Seite – Besucher und Suchmaschinen landen nicht im Leeren. Diese Adressen sehen Sie im Tab „Suche &amp; Social“.</p>
  </section>
  <section id="pages-link" data-topic hidden={!shown('pages-link')}>
    <h3>Link statt Seite</h3>
    <p>
      Soll ein Menüpunkt auf eine andere Website oder in einen anderen Bereich führen, legen Sie einen Link an: Symbol {@html icons.link} über dem Baum.
      Ins Feld „Linkziel“ kommt eine Adresse, ein Pfad wie <code>/kontakt</code> oder die Nummer einer Seite.
    </p>
  </section>
  <section id="pages-files" data-topic hidden={!shown('pages-files')}>
    <h3>Dateien: Stile, Feeds, robots.txt</h3>
    <p>
      Eine Seite kann statt als HTML auch als Datei ausgeliefert werden: CSS, JavaScript, JSON, XML, RSS-Feed, SVG oder reiner Text.
      Den Typ wählen Sie unter „Einstellungen“ → „Inhaltstyp“, die Adresse schreiben Sie mit Endung: <code>style.css</code>, <code>feed.xml</code>.
    </p>
    <p>
      Eine Datei wird ohne Vorlage ausgeliefert – genau mit dem Text, der im Editor steht. Darin funktionieren Links <code>[~5~]</code>, Platzhalter und
      Komponenten <code>[[Name]]</code>: So stellt ein Feed seine Einträge zusammen. In Menü, Sitemap und Suche erscheinen Dateien nicht. Eine eigene
      veröffentlichte Seite <code>robots.txt</code> ersetzt die Datei, die die Website selbst erzeugt.
    </p>
    <p>
      SVG, XML, Feeds und JavaScript führt der Browser aus, deshalb wählt und bearbeitet sie nur ein Administrator. Redakteure können
      HTML, Text, CSS, Markdown, CSV, Kalender und JSON verwenden; Skripte und Event-Handler im HTML von Redakteuren entfernt die Website beim Speichern.
    </p>
  </section>
  <section id="pages-copy" data-topic hidden={!shown('pages-copy')}>
    <h3>Seite kopieren</h3>
    <p>„Duplizieren“ {@html icons.copy} in der Zeile der Seite oder in ihrem Menü legt neben dem Original eine Kopie an – unveröffentlicht, mit „(Kopie)“ im Titel. Der Cursor steht gleich im Titel.</p>
  </section>
  <section id="pages-trash" data-topic hidden={!shown('pages-trash')}>
    <h3>Papierkorb</h3>
    <p>
      „In den Papierkorb“ nimmt die Seite mit allen Unterseiten von der Website. Anders überlegt? Klicken Sie in der Meldung auf „Rückgängig“. Der
      Papierkorb liegt unten im Baum: Öffnen Sie die Seite dort und klicken Sie auf „Wiederherstellen“. „Papierkorb leeren“ löscht die Seiten endgültig.
    </p>
  </section>

  <!-- Текст -->
  <h2 id="text" hidden={!chapterShown('text')}>Text der Seite</h2>
  <section id="text-format" data-topic hidden={!shown('text-format')}>
    <h3>Formatierung</h3>
    <p>Über dem Text liegt eine Leiste: Absatzformat, fett, kursiv, Link, Listen, Zitat und Bild. Vieles geht direkt beim Tippen:</p>
    <ul class="tricks">
      <li><kbd>##</kbd> und Leerzeichen am Zeilenanfang – Überschrift (<kbd>###</kbd> – eine Stufe kleiner);</li>
      <li><kbd>-</kbd> und Leerzeichen – Liste, <kbd>1.</kbd> und Leerzeichen – nummerierte Liste;</li>
      <li><kbd>&gt;</kbd> und Leerzeichen – Zitat;</li>
      <li><kbd>{mod}</kbd>+<kbd>B</kbd> – fett, <kbd>{mod}</kbd>+<kbd>I</kbd> – kursiv, <kbd>{mod}</kbd>+<kbd>Z</kbd> – rückgängig.</li>
    </ul>
    <p>Die Schaltfläche „HTML“ über dem Text zeigt das Markup – für alle, die es selbst schreiben.</p>
  </section>
  <section id="text-links" data-topic hidden={!shown('text-links')}>
    <h3>Links</h3>
    <p>
      Markieren Sie Wörter und drücken Sie <kbd>{mod}</kbd>+<kbd>K</kbd>. Beginnen Sie, den Titel einer Seite einzugeben, und wählen Sie sie aus den Vorschlägen – ein solcher
      Link bleibt intakt, auch wenn die Seite umbenannt oder verschoben wird. Sie können auch eine Adresse eingeben: <code>https://…</code>,
      <code>/pfad</code>, <code>mailto:</code> oder <code>tel:</code>. Eine leere Adresse entfernt den Link.
    </p>
  </section>
  <section id="text-images" data-topic hidden={!shown('text-images')}>
    <h3>Bilder</h3>
    <p>
      Das Symbol {@html icons.image} in der Leiste öffnet die Mediathek: Wählen Sie ein Bild oder laden Sie direkt dort ein neues hoch. Die
      Bildbeschreibung wird aus der Mediathek übernommen – passen Sie sie an, wenn Sie eine andere brauchen.
    </p>
  </section>
  <section id="text-blocks" data-topic hidden={!shown('text-blocks')}>
    <h3>Blöcke und Komponenten</h3>
    <p>
      Der Text einer Seite besteht aus Blöcken. Darunter steht „Block hinzufügen: Text / Komponente“. Eine Komponente ist ein fertiger Baustein
      der Website, etwa ein Infokasten oder ein Banner: Wählen Sie sie aus und füllen Sie die Felder aus. Blöcke verschieben Sie mit den Pfeilen und
      entfernen sie mit dem Kreuz – einen entfernten Block holen Sie über die Meldung zurück. Das Häkchen „Auf der Website ausblenden“ in einem
      Komponenten- oder Formularblock nimmt ihn von der Website, ohne ihn zu löschen: Der Block bleibt mit dem Hinweis „Ausgeblendet“ im Text, Besucher,
      die Suche und die Markdown-Version der Seite sehen ihn aber nicht.
    </p>
  </section>
  <section id="text-keys" data-topic hidden={!shown('text-keys')}>
    <h3>Platzhalter im Text</h3>
    <dl>
      <dt><code>{'{i18n.key}'}</code></dt>
      <dd>Übersetzung: Auf der Website wird daraus Text in der Sprache der Seite. Die Texte selbst stehen unter „Einstellungen“ → „Übersetzungen“.</dd>
      <dt><code>[@key]</code></dt>
      <dd>Eigene Einstellung der Website – etwa die Telefonnummer: an einer Stelle geändert, überall aktualisiert. Die Liste finden Sie unter „Einstellungen“ → „Eigene Werte“.</dd>
      <dt><code>[~5~]</code></dt>
      <dd>Adresse der Seite mit der Nummer 5 – so funktionieren Links auf Seiten.</dd>
    </dl>
  </section>

  <!-- Медиатека -->
  <h2 id="media" hidden={!chapterShown('media')}>Mediathek</h2>
  <section id="media-upload" data-topic hidden={!shown('media-upload')}>
    <h3>Dateien hochladen</h3>
    <p>
      Ziehen Sie Dateien an eine beliebige Stelle der <a href={resolve('/(app)/media')}>Mediathek</a> oder klicken Sie auf die Upload-Leiste. Der Ordner steht
      neben der Leiste; der Manager merkt ihn sich. Für Bilder entstehen automatisch verkleinerte Kopien (480, 960 und 1920 Pixel): Die Website liefert
      jedem Bildschirm die passende. Gibt es schon eine Datei mit diesem Namen, fragt der Manager, ob er sie ersetzen soll.
    </p>
  </section>
  <section id="media-card" data-topic hidden={!shown('media-card')}>
    <h3>Dateidetails und Bildbeschreibung</h3>
    <p>
      Klicken Sie auf eine Datei – die Dateidetails öffnen sich: Vorschau, Größe, Abmessungen, wo die Datei verwendet wird, und die Schaltflächen „Adresse kopieren“,
      „Öffnen“ und „Datei löschen“. Bei einem Bild steht dort auch die Beschreibung: in einem Satz, was darauf zu sehen ist. Screenreader lesen sie blinden Besuchern vor,
      Suchmaschinen werten sie aus, und beim Einfügen des Bilds in einen Text wird sie automatisch übernommen. Kacheln ohne Beschreibung sind mit „ohne Beschreibung“ markiert.
    </p>
  </section>
  <section id="media-remove" data-topic hidden={!shown('media-remove')}>
    <h3>Datei löschen</h3>
    <p>Vor dem Löschen zeigt der Manager, auf welchen Seiten die Datei steht – damit kein Bild unerwartet von der Website verschwindet. Die verkleinerten Kopien werden mit der Datei gelöscht.</p>
  </section>

  <!-- Формы и заявки -->
  <h2 id="forms" hidden={!chapterShown('forms')}>Formulare und Anfragen</h2>
  <section id="forms-place" data-topic hidden={!shown('forms-place')}>
    <h3>Formular auf einer Seite einbinden</h3>
    <p>
      Klicken Sie im Text der Seite auf „Block hinzufügen“ → „Formular“ und wählen Sie das Formular aus der Liste. Im Text ist das ein Tag wie
      <code>[#Form:callback]</code>: Sie können es auch von Hand eintragen. Das Formular wird für jeden Besucher neu erzeugt, die
      Seite drumherum bleibt im Cache – die Website wird dadurch nicht langsamer.
    </p>
  </section>
  <section id="forms-inbox" data-topic hidden={!shown('forms-inbox')}>
    <h3>Anfragen bearbeiten</h3>
    <p>
      Neue Anfragen sehen Sie am Briefumschlag in der Kopfzeile: Die Zahl zeigt die ungelesenen, ein Klick öffnet einen Überblick über Tag und Woche und die letzten Anfragen;
      „Alle Anfragen“ öffnet die <a href={`${resolve('/(app)/forms')}?tab=inbox`}>Liste</a> mit Filter nach Formular und Status, Suche und den
      Tasten j und k.
      Eine Anfrage hat die Schaltflächen „Anrufen“ und „Schreiben“ und zeigt, woher der Besucher kam (Seite, UTM-Parameter), den Status „In Bearbeitung“ oder
      „Erledigt“ und eine Notiz für Kollegen. Anfragen, die nach Spam aussehen, landen unter „Spam“ und lösen keine Benachrichtigungen aus.
    </p>
  </section>
  <section id="forms-keep" data-topic hidden={!shown('forms-keep')}>
    <h3>Wie lange Anfragen aufbewahrt werden</h3>
    <p>
      Anfragen sind personenbezogene Daten der Besucher: Sie werden nach der Frist des Formulars automatisch gelöscht, standardmäßig nach 30 Tagen. Was Sie behalten möchten,
      laden Sie mit „CSV herunterladen“ herunter – die Datei öffnet sich in Excel.
    </p>
  </section>
  {#if admin}
    <section id="forms-build" data-topic hidden={!shown('forms-build')}>
      <h3>Formular erstellen</h3>
      <p>
        <a href={resolve('/(app)/forms')}>„Formulare“</a> im oberen Menü → „Neues Formular“ beginnt mit fertigen Feldern: Name, Telefon, Kommentar und Einwilligung. Weitere Felder fügen Sie
        mit den Schaltflächen unten hinzu; jedes hat Beschriftung, Typ, Pflichtangabe und Regeln: Muster, Länge, Grenzwerte. Rechts sehen Sie das Formular so, wie
        Besucher es sehen. Die Reihenfolge ändern Sie mit den Pfeilen oder indem Sie den Griff links am Block mit Maus oder
        Finger ziehen; ein Schritt wandert mit seinen Feldern. Mit der Tastatur: Leertaste auf dem Griff, Pfeil nach oben und
        unten, Leertaste legt ab, Esc stellt zurück. Ein verstecktes Feld merkt sich die Seite, Werbeparameter, einen Parameter der Adresse oder ein Cookie des Besuchers (etwa
        einen Partnercode) – Werte der Seite und Cookies setzt der Server selbst ein, sie lassen sich nicht fälschen; eigene Cookies des CMS
        werden nie übernommen. Ein Formular löschen Sie mit dem Papierkorb auf seiner Karte oder mit „Löschen“ im Editor:
        Der Manager nennt die Seiten, auf denen es steht, und seine Anfragen bleiben noch 30 Tage erhalten.
      </p>
      <p>
        Die <strong>Bedingung</strong> eines Felds, „Anzeigen, wenn das Feld … gleich …“, zeigt es nur, wenn es gebraucht
        wird: etwa die Adresse nur bei Lieferung per Kurier. Ein ausgeblendetes Feld wird nicht geprüft und kommt nicht in die
        Anfrage. Ein <strong>Schritt</strong> teilt ein langes Formular in Seiten mit „Zurück“ und „Weiter“; jeder Schritt wird
        vor dem nächsten geprüft. Ein Feld <strong>„Datei“</strong> nimmt Dateien der erlaubten Typen bis 10 MB an (erweiterbar auf 20): Sie
        bleiben bei der Anfrage und lassen sich aus ihrer Karte herunterladen.
      </p>
    </section>
    <section id="forms-notify" data-topic hidden={!shown('forms-notify')}>
      <h3>Benachrichtigungen per Telegram und E-Mail</h3>
      <p>
        Unter <a href={`${resolve('/(app)/settings')}?tab=notify`}>„Einstellungen → Benachrichtigungen“</a> verbinden Sie einen Telegram-Bot (Token
        von @BotFather, dann „Chats suchen“) und E-Mail (SMTP-Server). Dorthin kommen auch Meldungen über Störungen der Website – ab einer gewählten
        Stufe; Wiederholungen innerhalb von 15 Minuten werden zusammengefasst. Für ein Formular können Sie eigene Kanäle und einen eigenen Betreff festlegen.
        Dort legen Sie auch die Sprache der Benachrichtigungen fest; standardmäßig ist es die Sprache der Website.
      </p>
      <p>
        Die <strong>E-Mail an den Absender</strong> auf dem Tab „Benachrichtigungen“ des Formulars bestätigt eine Anfrage an die Adresse
        aus ihrem E-Mail-Feld: Betreff und Text schreiben Sie selbst, {'{name}'} wird durch den Wert des Felds ersetzt. Sie geht über dieselbe
        E-Mail, nur für echte Anfragen und höchstens einmal pro Adresse in 10 Minuten. Ein <strong>Webhook</strong> auf dem Tab
        „Integrationen“ sendet jede angenommene Anfrage als JSON an einen anderen Dienst, etwa ein CRM, signiert mit dem Schlüssel des
        Formulars; ob sie angekommen ist, steht bei der Anfrage.
      </p>
    </section>
  {/if}

  <!-- Быстрая работа -->
  <h2 id="speed" hidden={!chapterShown('speed')}>Schneller arbeiten</h2>
  <section id="speed-jump" data-topic hidden={!shown('speed-jump')}>
    <h3>Schnellzugriff</h3>
    <p>
      <kbd>{mod}</kbd>+<kbd>K</kbd> von überall oder das Feld „Gehe zu“ in der Kopfzeile: Beginnen Sie, den Titel einer Seite, ihre Adresse oder Nummer einzugeben,
      und drücken Sie <kbd>Enter</kbd>. Dort finden Sie auch Bereiche und Aktionen wie „Neue Seite“{#if admin}, außerdem Vorlagen, Komponenten,
      Plugins und Felder{/if}. Ein leeres Fenster zeigt die zuletzt geöffneten Seiten.
    </p>
    <p><button type="button" onclick={openPalette}>{@html icons.search}{t('palette.title')}</button></p>
  </section>
  <section id="speed-ai" data-topic hidden={!shown('speed-ai')}>
    <h3>Mit KI generieren</h3>
    <p>
      Hat ein Administrator die KI unter „Einstellungen“ → „KI-Assistent“ angebunden, erscheint an den Feldern ein Zauberstab {@html icons.wand}. Klicken Sie darauf
      (oder drücken Sie <kbd>Alt</kbd>+<kbd>I</kbd> im Feld), schreiben Sie kurz, was Sie brauchen – zum Beispiel „Zusammenfassung in einem Satz“ oder
      „kürzer und lebendiger“ –, sehen Sie sich den Vorschlag an und klicken Sie auf „Einfügen“. Gefällt er Ihnen nicht: „Noch eine Variante“. Das Einfügen in ein Feld
      machen Sie mit „Rückgängig“ in der Meldung rückgängig, im Seitentext und im Code mit <kbd>{mod}</kbd>+<kbd>Z</kbd>.
    </p>
    <p>Die KI weiß, um welche Website es geht, welches Feld es ist und wo es steht – deshalb darf der Auftrag ganz kurz sein. Lesen Sie den Text vor dem Veröffentlichen noch einmal durch.</p>
  </section>
  <section id="speed-agent" data-topic hidden={!shown('speed-agent')}>
    <h3>Assistent</h3>
    <p>
      Der Zauberstab {@html icons.wand} in der Kopfleiste öffnet ein Gespräch mit der KI. Bitten Sie um etwas auf der Website, etwa
      „finde Seiten ohne Beschreibung und ergänze sie“ oder „lege einen Entwurf mit unseren Angeboten an“: Der Assistent findet die
      Seiten, ändert sie und sagt, was er getan hat. Die Schritte sehen Sie, während er arbeitet.
    </p>
    <p>
      Der Assistent arbeitet mit Ihren Rechten, auch über ihn kann ein Redakteur keinen Code ändern. Neue Seiten legt er als Entwürfe
      an, frühere Fassungen bleiben im Reiter „Verlauf“: Jede Änderung lässt sich zurücknehmen.
    </p>
    <p>
      Hat der Assistent Formulareinsendungen gelesen, ändert er bis zur nächsten Anfrage weder Code noch Formulare, Felder
      oder Einstellungen: Einsendungen schreiben Besucher, und eine geschickt formulierte darf ihm nichts befehlen. Plugins,
      Passwörter, Benutzer und die Adresse der Website ändert der Assistent nie.
    </p>
  </section>
  <section id="speed-tree" data-topic hidden={!shown('speed-tree')}>
    <h3>Suche im Baum</h3>
    <p>Die Taste <kbd>/</kbd> setzt den Cursor in die Suche über dem Baum: Seiten finden Sie nach Titel, Adresse oder Nummer.</p>
  </section>
  <section id="speed-site" data-topic hidden={!shown('speed-site')}>
    <h3>Direkt auf der Website bearbeiten</h3>
    <p>
      Solange Sie im Manager angemeldet sind, erscheint oben auf den Seiten der Website eine dunkle Leiste – nur Sie sehen sie, Besucher nicht.
      „Bearbeiten“ öffnet die Seite in einem Fenster über der Website: Speichern Sie, schließt sich das Fenster und die Seite zeigt die Änderung.
      „Neue Unterseite“ legt eine Seite darunter an. Mit der Schaltfläche rechts klappen Sie die Leiste ein – ein kleines Symbol bleibt in
      der Ecke, und die Wahl wird gespeichert.
    </p>
  </section>
  <section id="speed-many" data-topic hidden={!shown('speed-many')}>
    <h3>Mehrere Seiten auf einmal</h3>
    <p>
      Wählen Sie Seiten im Baum aus: <kbd>{mod}</kbd>+Klick fügt eine Seite hinzu, <kbd>Shift</kbd>+Klick wählt alle zwischen zwei Seiten, die <kbd>Leertaste</kbd>
      markiert die Seite unter dem Cursor. Über dem Baum erscheint die Leiste „Ausgewählt“: Dort veröffentlichen Sie alle auf einmal, ziehen sie zurück,
      verschieben sie oder legen sie in den Papierkorb. <kbd>Esc</kbd> hebt die Auswahl auf.
    </p>
  </section>

  <!-- Клавиши -->
  <h2 id="keys" hidden={!chapterShown('keys')}>Tastenkürzel</h2>
  <section id="keys-all" data-topic hidden={!shown('keys-all')}>
    <h3 class="sr-only">Alle Tastenkürzel</h3>
    <table>
      <tbody>
        <tr><td><kbd>{mod}</kbd>+<kbd>S</kbd></td><td>Speichern</td></tr>
        <tr><td><kbd>{mod}</kbd>+<kbd>K</kbd></td><td>Schnellzugriff; im Text: Link</td></tr>
        <tr><td><kbd>/</kbd></td><td>Suche im Baum</td></tr>
        <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></td><td>Im Baum navigieren, Bereiche auf- und zuklappen</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>Seite aus dem Baum öffnen</td></tr>
        <tr><td><kbd>Leertaste</kbd></td><td>Seite im Baum auswählen</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>F10</kbd></td><td>Seitenmenü im Baum</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd></td><td>Seite unter den Nachbarseiten verschieben</td></tr>
        <tr><td><kbd>{mod}</kbd>+<kbd>B</kbd>, <kbd>{mod}</kbd>+<kbd>I</kbd></td><td>Fett, kursiv</td></tr>
        <tr><td><kbd>{mod}</kbd>+<kbd>Z</kbd></td><td>Änderung im Text rückgängig machen</td></tr>
        <tr><td><kbd>Alt</kbd>+<kbd>I</kbd></td><td>Mit KI generieren (im Feld, im Text oder im Code)</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Fenster oder Menü schließen, Auswahl aufheben</td></tr>
      </tbody>
    </table>
  </section>

  <!-- Учётная запись -->
  <h2 id="account" hidden={!chapterShown('account')}>Ihr Konto</h2>
  <section id="account-menu" data-topic hidden={!shown('account-menu')}>
    <h3>Darstellung, Passwort, Abmelden</h3>
    <p>
      Ihr Name rechts in der Kopfzeile öffnet ein Menü. „Darstellung“ – Akzentfarbe und Farbschema (hell, dunkel oder wie im System); jeder
      Benutzer hat seine eigene Einstellung. „Passwort ändern“ fragt nach dem aktuellen und einem neuen Passwort – mindestens 10 Zeichen. „Abmelden“ beendet
      die Sitzung auf diesem Gerät. Dort wählen Sie auch die Sprache des Managers: Englisch, Deutsch oder Russisch; vor der Anmeldung
      unten auf dem Anmeldebildschirm, danach bleibt sie bei Ihrem Konto.
    </p>
  </section>
  <section id="account-keys" data-topic hidden={!shown('account-keys')}>
    <h3>API-Schlüssel für Agenten</h3>
    <p>
      „API-Schlüssel“ im selben Menü erstellt einen Schlüssel für einen KI-Agenten oder ein Skript: Claude Code, Cursor und Codex
      verbinden sich damit per MCP mit der Website und arbeiten mit Ihren Rechten. Der Schlüssel wird einmal angezeigt – kopieren
      Sie ihn zusammen mit dem fertigen Verbindungsbefehl. Einen nicht mehr benötigten Schlüssel widerrufen Sie: Agenten verlieren
      sofort den Zugriff. Mit einem Schlüssel lassen sich keine weiteren Schlüssel erstellen, das Passwort ändern, Benutzer
      verwalten oder eine Kopie der Website herunterladen.
    </p>
  </section>

  <!-- Для администратора -->
  {#if admin}
    <h2 id="admin" hidden={!chapterShown('admin')}>Für Administratoren</h2>
    <section id="admin-users" data-topic hidden={!shown('admin-users')}>
      <h3>Benutzer und Rollen</h3>
      <p>
        Ein <strong>Administrator</strong> darf alles. Ein <strong>Redakteur</strong> arbeitet mit Seiten und Mediathek. Im Bereich
        „<a href={resolve('/(app)/users')}>Benutzer</a>“ legen Sie neue Benutzer an, setzen ein Passwort (geben Sie es persönlich weiter), ändern
        die Rolle oder löschen Benutzer. Seiten, die ein gelöschter Benutzer bearbeitet hat, bleiben erhalten.
      </p>
    </section>
    <section id="admin-settings" data-topic hidden={!shown('admin-settings')}>
      <h3>Website-Einstellungen</h3>
      <dl>
        <dt>Website</dt>
        <dd>Name, Sprache und weitere Sprachen, Startseite und 404-Seite, Website-Adresse, Beschreibung und Bild für soziale Netzwerke.</dd>
        <dt>Suche und KI</dt>
        <dd>Eigene Regeln für robots.txt und Links, mit denen Sie prüfen, was Suchmaschinen und KI sehen. Dort auch Synonyme für die Suche auf der Website: eine Gruppe von Wörtern pro Zeile, durch Kommas getrennt. Die Suche versteht Wortformen von selbst, korrigiert Tippfehler und sucht eine Phrase in Anführungszeichen als Ganzes.</dd>
        <dt>Übersetzungen</dt>
        <dd>Texte in verschiedenen Sprachen nach Schlüsseln – für <code>{'{i18n.key}'}</code>. Änderungen in der Tabelle werden sofort gespeichert.</dd>
        <dt>Eigene Werte</dt>
        <dd>Werte wie Telefonnummer oder Anschrift – für <code>[@key]</code>.</dd>
        <dt>KI-Assistent</dt>
        <dd>API-Adresse, Modell und Schlüssel (DeepSeek, OpenAI und andere mit derselben API) sowie Anweisungen für die KI – Ton und Regeln für Texte. Der Schlüssel liegt nur auf dem Server.</dd>
      </dl>
    </section>
    <section id="admin-elements" data-topic hidden={!shown('admin-elements')}>
      <h3>Elemente</h3>
      <dl>
        <dt>Vorlagen</dt>
        <dd>Bestimmen, wie eine Seite aussieht. Über dem Code einer Vorlage sehen Sie, welche Felder ihr zugewiesen sind und wie viele Seiten sie verwenden.</dd>
        <dt>Komponenten</dt>
        <dd>Bausteine der Gestaltung, die Redakteure als Blöcke in den Text einfügen. Beschreibung und Parameter einer Komponente werden zum Formular im Editor.</dd>
        <dt>Skripte</dt>
        <dd>JavaScript für den Browser als ES-Module: eine Three.js-Szene, ein Widget, ein Zähler. Eine Vorlage bindet ein Skript mit <code>script('name')</code> ein; die Adresse ändert sich mit jeder Änderung, der Browser erhält also immer die frische Version.</dd>
        <dt>Plugins</dt>
        <dd>Ändern das Verhalten der Website – zum Beispiel Weiterleitungen. Sie lassen sich per Schaltfläche sofort ein- und ausschalten.</dd>
        <dt>Seitenfelder</dt>
        <dd>Zusatzfelder für Vorlagen: Textzeile, formatierter Text, Zahl, Ja / Nein, Datum, Auswahlliste, Bild; mit Standardwert und Vererbung von übergeordneten Bereichen.</dd>
      </dl>
      <p>Enthält der Code einen Fehler, speichert der Manager ihn nicht und zeigt die Zeile – ein Klick auf „Zeile …“ springt dorthin. Ein Element, das irgendwo verwendet wird, lässt sich nicht löschen: Der Manager zeigt, wo.</p>
    </section>
    <section id="admin-code" data-topic hidden={!shown('admin-code')}>
      <h3>Wo der Code läuft</h3>
      <p>Der Code von Vorlagen, Komponenten und Plugins läuft auf dem Server: Besucher erhalten fertiges HTML. Im Browser läuft nur der Code von Inseln und Skripten der Website.</p>
      <dl>
        <dt>Komponente</dt>
        <dd>
          Wenn der Code einen Teil der Seite erzeugt: eine Seitenliste, eine Berechnung, Daten aus <code>$core</code>. Er läuft
          beim Rendern, und das Ergebnis landet mit der Seite im Cache. Braucht er die Anfrage selbst – Cookies,
          URL-Parameter, die aktuelle Uhrzeit –, binden Sie die Komponente mit <code>{'<Uncached name="…"\u00a0/>'}</code> aus
          <code>$core/Uncached</code> ein: Dann wird sie bei jeder Anfrage gerendert, der Rest der Seite bleibt im Cache.
        </dd>
        <dt>Plugin</dt>
        <dd>
          Wenn der Code zu einem bestimmten Zeitpunkt laufen soll, statt einen Teil der Seite zu zeichnen: <code>render</code>
          bearbeitet das fertige HTML jeder Seite vor dem Ausliefern, <code>notFound</code> antwortet statt mit 404 mit einer
          Weiterleitungsadresse, <code>on</code> reagiert auf Ereignisse der Website – ruft etwa einen Webhook auf, wenn eine
          Seite veröffentlicht wurde.
        </dd>
        <dt>Insel</dt>
        <dd>
          Eine Komponente, die im Browser läuft: <code>{'<Island name="…"\u00a0/>'}</code> aus <code>$core/Island</code>. Sie
          hat kein <code>$core</code> und erhält Serverdaten über ihre Parameter – die sieht der Besucher, also keine Geheimnisse
          darin übergeben. Eine Insel kann auch in einer Komponente stehen, die mit <code>Uncached</code> eingebunden ist: Dann werden
          ihre Parameter bei jeder Anfrage berechnet – etwa ein Preis zum Partnercode aus einem Cookie –, die Seite drumherum bleibt im Cache.
        </dd>
        <dt>Skript</dt>
        <dd>
          Wenn der Browser eigenes JavaScript braucht statt einer Komponente: eine Three.js-Szene, ein Widget, Analytics. Ein
          Skript ist ein ES-Modul bis 2 MB unter „Elemente“. Eine Vorlage bindet es in <code>{'<svelte:head>'}</code> mit einem
          <code>script</code>-Tag ein, dessen Adresse <code>script('name')</code> ist. Ein Skript darf nur <code>https://</code>-Adressen
          importieren: Bibliotheken bündeln Sie vorher in dieselbe Datei.
        </dd>
      </dl>
      <p>Komponenten importieren nur <code>svelte</code>, <code>$core</code> und andere Komponenten, Plugins nur <code>$core</code>.</p>
    </section>
    <section id="admin-backup" data-topic hidden={!shown('admin-backup')}>
      <h3>Sicherungen</h3>
      <p>
        Im Bereich „<a href={resolve('/(app)/backups')}>Sicherungen</a>“ in der Kopfzeile laden Sie die ganze Website als eine Datei herunter –
        als <strong>Datenbankdatei (.db)</strong> für eine exakte Wiederherstellung oder als <strong>Datensätze in JSON</strong>, die Sie
        öffnen, vergleichen und auf einen anderen Server übertragen können. Dort stellen Sie die Website auch aus einer der beiden Formen wieder her: Vor dem Ersetzen
        sichert der Manager den bisherigen Stand auf dem Server neben der Datenbank. Bewahren Sie Sicherungen nicht auf demselben Server auf.
      </p>
      <p>
        <strong>Automatische Sicherungen</strong> schalten Sie unter „<a href={`${resolve('/(app)/settings')}?tab=upkeep`}>Einstellungen → Wartung</a>“
        ein: einmal, zweimal oder viermal täglich oder stündlich, in ein Verzeichnis auf dem Server; was über die festgelegte Anzahl hinausgeht,
        wird automatisch gelöscht. Schlägt eine Sicherung fehl, erhalten Sie eine Benachrichtigung über eine Störung.
      </p>
      <p>
        Dort finden Sie auch die <strong>Suche nach Updates</strong>: Einmal täglich fragt der Server auf der Release-Seite nach, ob es eine neue Version gibt, und
        zeigt sie im Profilmenü an. Aktualisiert wird mit dem Befehl <code>cms update</code> auf dem Server; starten Sie ihn danach neu.
      </p>
    </section>
    <section id="admin-cli" data-topic hidden={!shown('admin-cli')}>
      <h3>Kommandozeile</h3>
      <p>Das Programm der Website hat Befehle für den Server:</p>
      <ul>
        <li><code>cms help</code> – alle Befehle mit Beispielen;</li>
        <li><code>cms backup</code> – Sicherung der ganzen Website in einer Datei, <code>cms backup site.json</code> – als Datensätze in JSON;</li>
        <li><code>cms restore datei</code> – die Website aus einer Sicherung wiederherstellen;</li>
        <li><code>cms update</code> – das Programm auf die neue Version aktualisieren, <code>--check</code> – nur prüfen;</li>
        <li><code>cms elements pull ordner</code> – Vorlagen, Komponenten, Skripte, Plugins, Formulare und Felder als Dateien, mit einer Anleitung AGENTS.md für KI-Agenten; <code>cms elements push ordner</code> – zurück in die Website;</li>
        <li><code>cms mcp</code> – ein MCP-Server für einen Agenten auf diesem Server, <code>cms diagnose</code> – die Diagnose der Website im Terminal;</li>
        <li><code>cms users password email</code> – neues Passwort, falls ein Administrator seins vergessen hat.</li>
      </ul>
    </section>
  {/if}

  <!-- Если что-то пошло не так -->
  <h2 id="trouble" hidden={!chapterShown('trouble')}>Wenn etwas schiefgeht</h2>
  <section id="trouble-load" data-topic hidden={!shown('trouble-load')}>
    <h3>„Nicht geladen“</h3>
    <p>Der Server hat nicht geantwortet – prüfen Sie die Internetverbindung und klicken Sie auf „Wiederholen“. Änderungen auf der geöffneten Seite gehen dabei nicht verloren: Speichern Sie sie, sobald die Verbindung wieder steht.</p>
  </section>
  <section id="trouble-site" data-topic hidden={!shown('trouble-site')}>
    <h3>Die Seite fehlt auf der Website</h3>
    <ul>
      <li>Ist sie veröffentlicht? Ein Entwurf hat im Baum einen Ring als Knoten und einen kursiven Titel.</li>
      <li>Ist sie vielleicht für später geplant?</li>
      <li>Liegt der Bereich, in dem sie sich befindet, im Papierkorb?</li>
      <li>„Im Menü ausblenden“ nimmt die Seite nur aus dem Menü – über ihre Adresse ist sie weiterhin erreichbar.</li>
    </ul>
  </section>
  <section id="trouble-password" data-topic hidden={!shown('trouble-password')}>
    <h3>Passwort vergessen oder Anmeldung gesperrt</h3>
    <p>
      Bitten Sie einen Administrator, Ihnen ein neues Passwort festzulegen. Nach fünf Fehlversuchen wird die Anmeldung von Ihrem Computer für 15 Minuten gesperrt (von anderen Adressen aus nicht) – warten Sie und
      versuchen Sie es erneut. Ist die Sitzung abgelaufen, bietet der Manager direkt in der Meldung an, sich neu anzumelden.
    </p>
  </section>
  <section id="trouble-save" data-topic hidden={!shown('trouble-save')}>
    <h3>Es wird nicht gespeichert</h3>
    <p>Der Fehler steht beim Feld, das Sie korrigieren müssen, und der Tab mit diesem Feld öffnet sich von selbst. Zum Beispiel darf die Adresse nur Kleinbuchstaben a–z ohne Umlaute, Ziffern und Bindestriche enthalten und muss sich von den Adressen der Nachbarseiten unterscheiden.</p>
  </section>
