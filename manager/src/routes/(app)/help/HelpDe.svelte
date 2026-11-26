<script lang="ts">
import { t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { openPalette } from '#lib/palette.svelte.ts';
import { resolve } from '$app/paths';
import { EVENT_EXAMPLE, type HelpProps, SUMMARY_EXAMPLE } from './help.ts';

let { shown, chapterShown, mod, admin, analytics }: HelpProps = $props();
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
  <section id="pages-share" data-topic hidden={!shown('pages-share')}>
    <h3>Entwurf einem Kunden zeigen</h3>
    <p>
      Eine unveröffentlichte Seite hat in der Zeile darüber {@html icons.share} „Link für Kunden“. Erstellen Sie einen Link — für wen
      er ist und wie lange er gilt (standardmäßig 7 Tage) — und schicken Sie ihn: Er öffnet die Seite ohne Anmeldung im Manager,
      genau so, wie sie auf der Website aussehen wird, mit dem Hinweis „nicht veröffentlicht“. Formulare werden in der Vorschau
      nicht gesendet, Suchmaschinen indexieren sie nicht, und der Link öffnet keine andere Seite und nicht den Manager. Der Link wird
      einmal vollständig angezeigt; die Liste der Links mit Widerrufen ist im selben Fenster.
    </p>
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
      neben der Leiste; der Manager merkt ihn sich. Von JPEG-, PNG- und WebP-Bildern erstellt der Server wenige Sekunden nach dem Hochladen
      verkleinerte Kopien (480, 960 und 1920 Pixel, nie breiter als das Original): Die Website liefert jedem Bildschirm die passende. Das gilt
      auch für Uploads von Agenten und über die API. Gibt es schon eine Datei mit diesem Namen, fragt der Manager, ob er sie ersetzen soll.
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
    <p>
      Mit der Anfrage werden IP-Adresse und Browser des Besuchers gespeichert: Sie helfen, Spam zu erkennen. Sagt die
      Datenschutzerklärung zu, keine IP-Adressen zu speichern, schaltet ein Administrator das auf dem Reiter „Schutz und
      Speicherung“ des Formulars aus. Das Sendelimit pro Adresse wirkt auch dann: Die Adresse bleibt nur im Arbeitsspeicher
      des Servers.
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
        werden nie übernommen. Kommt in einem versteckten Feld ein Schlüssel an, etwa <code>?paket=planung</code>, geben Sie ihm
        „Beschriftungen der Werte“ – Zeilen wie „planung | KI-Küchenberater + KI-Planung“: E-Mails, Benachrichtigungen, die Anfrage
        und die CSV zeigen die Beschriftung, der Webhook bekommt Schlüssel und Beschriftung. Ein Formular löschen Sie mit dem Papierkorb auf seiner Karte oder mit „Löschen“ im Editor:
        Der Manager nennt die Seiten, auf denen es steht, und seine Anfragen bleiben noch 30 Tage erhalten.
      </p>
      <p>
        Die <strong>Bedingung</strong> eines Felds, „Anzeigen, wenn das Feld … gleich …“, zeigt es nur, wenn es gebraucht
        wird: etwa die Adresse nur bei Lieferung per Kurier. Ein ausgeblendetes Feld wird nicht geprüft und kommt nicht in die
        Anfrage. Ein <strong>Schritt</strong> teilt ein langes Formular in Seiten mit „Zurück“ und „Weiter“; jeder Schritt wird
        vor dem nächsten geprüft. Ein Feld <strong>„Datei“</strong> nimmt Dateien der erlaubten Typen bis 10 MB an (erweiterbar auf 20): Sie
        bleiben bei der Anfrage und lassen sich aus ihrer Karte herunterladen.
      </p>
      <p>
        Nach dem Absenden sehen Besucher statt des Formulars den „Danke“-Text vom Reiter „Nach dem Absenden“. Für eigenes
        Markup – Überschrift, Link, Schaltfläche – fügen Sie im HTML-Modus einen Textblock
        <code>&lt;template data-sent&gt;…&lt;/template&gt;</code> ein: Er ersetzt den Text mit und ohne Skript, und ein Element mit
        <code>tabindex="-1"</code> darin erhält den Fokus.
      </p>
    </section>
    <section id="forms-spam" data-topic hidden={!shown('forms-spam')}>
      <h3>Spamschutz ohne Captcha</h3>
      <p>
        Jedes Formular hat eine unsichtbare Bot-Falle, ein Einmal-Token, eine Mindestzeit zum Ausfüllen und ein Limit für Anfragen
        von einer Adresse. Dazu kommt die <strong>Prüfung im Browser</strong>: Während jemand das Formular ausfüllt, löst sein Browser
        unbemerkt eine kleine Rechenaufgabe, meist in Bruchteilen einer Sekunde, und unter der Schaltfläche erscheint „Spam-Schutz
        bestätigt“. Captcha, Cookies oder fremde Dienste gibt es nicht. Die Stufe wählen Sie auf dem Tab „Schutz und Speicherung“
        des Formulars: Neue Formulare nutzen „Standard“, bei Formularen aus früheren Versionen bleibt die Prüfung aus, bis Sie sie
        einschalten.
      </p>
      <p>
        Eine Anfrage aus einem Browser ohne JavaScript geht nicht verloren: Der Besucher sieht den Dankestext, die Anfrage landet
        markiert mit „Ohne JavaScript gesendet“ im Spam, ohne Benachrichtigung. Schauen Sie dort ab und zu nach und verschieben Sie
        echte Anfragen zu „Neu“.
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
        Sperrt Ihr Hoster die SMTP-Ports (bei neuen Servern von DigitalOcean und Hetzner üblich), wählen Sie unter „Versand über“
        einen Maildienst mit HTTP-API – Brevo, Postmark, Mailgun, Resend oder Amazon SES – und fügen Sie seinen Schlüssel ein:
        Die E-Mails gehen dann per HTTPS über Port 443 raus. Verifizieren Sie die Absenderdomain beim Dienst mit SPF- und
        DKIM-Einträgen im DNS, sonst versendet er nichts. Der Schlüssel bleibt auf dem Server, der Manager zeigt nur seine letzten
        vier Zeichen. „Test senden“ schickt eine E-Mail auf dem gewählten Weg.
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

  <!-- Статистика -->
  <h2 id="stats" hidden={!chapterShown('stats')}>Statistik</h2>
  <section id="stats-read" data-topic hidden={!shown('stats-read')}>
    <h3>Die Statistik lesen</h3>
    <p>
      <a href={resolve('/(app)/stats')}>„Statistik“</a> im oberen Menü zeigt Besucher und Seitenaufrufe für 7, 30 oder 90 Tage oder
      eigene Daten, dazu Seiten, Quellen, Einstiegsseiten, Geräte und Sprachen. Der Server zählt selbst, ohne Cookies:
      Angemeldete Manager, Bots und Vorabladen zählen nicht. Ein Besucher zählt einmal pro Tag: Wer an drei Tagen kommt,
      zählt dreimal. Die Quelle ist das Tag utm_source, sonst die Website, von der der Besucher kam; leer heißt direkt.
    </p>
  </section>
  <section id="stats-goals" data-topic hidden={!shown('stats-goals')}>
    <h3>Ziele und Conversion-Rate</h3>
    <p>
      Ein Ziel ist eine angenommene Anfrage eines beliebigen Formulars (ohne Spam) oder ein Klick auf einen Ziel-Link. Die
      Conversion-Rate ist der Anteil der Tagesbesucher mit dieser Quelle oder Einstiegsseite, die das Ziel erreicht haben.
    </p>
    {#if admin}
      <p>
        Zählung, Ziel-Links und Beacon schalten Sie unter <a href={`${resolve('/(app)/settings')}?tab=stats`}>„Einstellungen → Statistik“</a>
        ein; dort steht auch ein Musterabsatz für die Datenschutzerklärung.
      </p>
    {/if}
  </section>

  <!-- Аналитика -->
  {#if analytics}
  <h2 id="analytics" hidden={!chapterShown('analytics')}>Kundenanalyse</h2>
  <section id="analytics-what" data-topic hidden={!shown('analytics-what')}>
    <h3>Wozu sie dient</h3>
    <p>
      Die Kundenanalyse beantwortet die Fragen von Website-Betreibern: Woher kommen die Kunden, wer von ihnen zahlt, wie viel
      bringt jede Quelle, und lohnt sich die Werbung? Die Daten kommen nicht aus dem Browser der Besucher, sondern von Ihrem Bot,
      Shop oder Ihrer App — dem <strong>Absender</strong>. Für jeden Schritt einer Person (kommt über einen Link, startet eine
      Testphase, zahlt, bekommt Geld zurück) schickt er ein Ereignis an die Website. Die Website baut daraus selbst Personen
      und zeigt die Berichte in den Bereichen der <a href={resolve('/(app)/stats')}>„Statistik“</a>: „Übersicht“, „Quellen“,
      „Trichter“, „Kohorten“, „Personen“, „Labels“, „Ausgaben“, „Qualität“ und „Einrichtung“.
    </p>
    <p>
      Eine Person ist hier ein Pseudonym wie <code>u_7f3a9c2b</code>, ohne Namen, E-Mail und Telefonnummer; das Pseudonym legt
      der Absender fest. Mit Besuchen der Website werden Personen nie verknüpft, und die Website setzt dafür kein Cookie. Die
      Besucherstatistik zählt Besucher eines Tages, die Kundenanalyse Personen aus Ereignissen. Eine einzige Brücke gibt es: Ein
      Weiterleitungsbutton der Website nimmt die Quelle des Besuchs als Label zum Absender mit (siehe „Labels und
      Weiterleitungen“).
    </p>
  </section>
  <section id="analytics-start" data-topic hidden={!shown('analytics-start')}>
    <h3>Der Einstieg</h3>
    {#if admin}
      <ol>
        <li>
          Öffnen Sie <a href={resolve('/(app)/stats/setup')}>„Statistik → Einrichtung“</a>. Auf einer leeren Website stehen dort
          die Vorlagen „Abonnement“ und „Onlineshop“, „Paket aus Datei importieren“ und „Von vorn beginnen“ zur Wahl. Eine
          Vorlage legt einen Absender, Ereignistypen, Verzeichnisse, ein Kennungsschema, einen Meilenstein und einen Trichter
          an; „Ansehen, was angelegt wird“ zeigt alles, bevor etwas gespeichert wird, „Anlegen“ speichert es.
        </li>
        <li>
          Geben Sie dem Absender im Bereich „Absender“ einen eigenen Namen und stellen Sie mit „Neuer Schlüssel“ einen Schlüssel
          aus. Er erscheint nur einmal: Kopieren Sie ihn und geben Sie ihn zusammen mit der Anleitung unten an die Entwicklung
          des Absenders weiter.
        </li>
        <li>
          Schalten Sie unter <a href={`${resolve('/(app)/settings')}?tab=stats`}>„Einstellungen → Statistik“</a>, Block
          „Ereignisempfang“, „Ereignisse annehmen“ ein, wählen Sie, wie lange der Verlauf aufbewahrt wird, und veröffentlichen Sie
          den Absatz für die Datenschutzerklärung — ein Muster steht gleich daneben. Solange der Empfang aus ist, antwortet die
          Website dem Absender mit 503 und speichert nichts.
        </li>
        <li>Dort legen Sie auch eine Basiswährung fest, wenn Sie den Umsatz als eine Zahl, LTV und CAC sehen möchten (siehe „Geld“).</li>
      </ol>
    {:else}
      <p>Absender, Schlüssel und Ereignisempfang richtet die Administration der Website ein.</p>
    {/if}
  </section>
  <section id="analytics-sender" data-topic hidden={!shown('analytics-sender')}>
    <h3>Anleitung für die Entwicklung des Absenders</h3>
    <p>
      Ein Ereignis ist ein <code>POST</code> an <code>https://ihre-website/_cms/events</code> mit JSON im Body und dem
      Schlüssel im Header <code>Authorization: Bearer</code>. Der Schlüssel kann nur eines: Ereignisse seines Absenders senden.
      Er gehört auf einen Server, nicht in einen Browser oder eine App auf dem Handy.
    </p>
    <pre>{EVENT_EXAMPLE}</pre>
    <dl>
      <dt><code>id</code></dt>
      <dd>Die eigene Nummer des Ereignisses beim Absender. Eine Wiederholung mit derselben <code>id</code> erkennt die Website und zählt sie nicht doppelt: Nach einem Netzfehler senden Sie das Ereignis einfach erneut.</dd>
      <dt><code>type</code></dt>
      <dd>Ein Typcode aus „Einrichtung → Ereignistypen“. Ein unbekannter Typ wird angenommen und wartet unter „Unbekannte“.</dd>
      <dt><code>at</code></dt>
      <dd>Wann es geschah, mit Zeitzone: <code>Z</code> oder <code>+02:00</code>.</dd>
      <dt><code>subject</code></dt>
      <dd>Das Pseudonym der Person: 6 bis 128 Zeichen <code>A-Z a-z 0-9 . _ : -</code>, nicht nur Ziffern. E-Mail-Adressen, Telefonnummern und Messenger-IDs werden absichtlich abgelehnt.</dd>
      <dt><code>data</code></dt>
      <dd>Die Felder der Rolle des Typs (eine Zahlung hat <code>amount</code>, <code>currency</code>, <code>payment_id</code>) und die Eigenschaften des Typs.</dd>
      <dt><code>traits</code>, <code>test</code></dt>
      <dd>Merkmale der Person, etwa die Sprache; <code>"test": true</code> kennzeichnet ein Testereignis: Im „Ereignisprotokoll“ steht es als Test, zu den Personen zählt es nicht.</dd>
    </dl>
    <p>So antwortet die Website:</p>
    <dl>
      <dt>200</dt>
      <dd>Angenommen. <code>warnings</code> nennt, was die Website nicht kannte; <code>duplicate</code> heißt: eine Wiederholung, das Ereignis ist schon da.</dd>
      <dt>400</dt>
      <dd>Am Ereignis stimmt etwas nicht, <code>errors</code> nennt es nach Feldern. Dasselbe noch einmal zu senden hilft nicht: Es muss korrigiert werden.</dd>
      <dt>401</dt>
      <dd>Der Schlüssel ist falsch oder widerrufen, oder der Absender ist ausgeschaltet oder archiviert.</dd>
      <dt>429</dt>
      <dd>Von dieser Adresse kamen fünf falsche Schlüssel in 15 Minuten: Warten Sie so lange, wie <code>Retry-After</code> angibt.</dd>
      <dt>503</dt>
      <dd>Der Empfang ist auf der Website aus: später erneut senden. Wiederholt der Absender, geht kein Ereignis verloren.</dd>
      <dt>500</dt>
      <dd>Ein Serverfehler: mit derselben <code>id</code> wiederholen.</dd>
    </dl>
    <p>
      <strong>Tagesübersicht.</strong> Einmal am Tag, wenn die Ereignisse des Tages zugestellt sind, sendet der Absender ein
      Ereignis mit der Rolle „Tagesübersicht“ für den vergangenen UTC-Tag, ohne <code>subject</code>. Die Website gleicht es mit
      ihrer eigenen Zählung ab (siehe „Datenqualität“):
    </p>
    <pre>{SUMMARY_EXAMPLE}</pre>
    <p>
      <code>counts</code> ist, wie viele Ereignisse jedes Typs der Absender an diesem Tag gezählt hat, <code>revenue</code> sind
      Zahlungen abzüglich Erstattungen vor Gebühren je Währung, <code>failed</code> ist, wie viele Ereignisse er nach allen
      Wiederholungen aufgegeben hat, und <code>version</code> seine Version. Die Uhrzeit der Zusammenfassung gehört zum Absender:
      „Zusammenfassung erwarten bis … UTC“, standardmäßig 06:00. Sie ist eine Frist, nicht der Sendezeitpunkt — lassen Sie Zeit
      für Wiederholungen. Für einen Absender ohne Zusammenfassungen setzen Sie „Der Absender sendet keine Zusammenfassungen“.
    </p>
    <p>
      <strong>Fehlende Ereignisse nachliefern.</strong> Sind Ereignisse verloren gegangen, exportieren Sie sie beim Absender als
      Datei im Format JSON Lines — ein Ereignis pro Zeile, wie sie übers Netz gehen — und laden Sie sie unter
      <a href={resolve('/(app)/stats/people')}>„Statistik → Personen“</a> mit „Datei hochladen“ hoch (bis 16 MiB) oder auf dem
      Server mit <code>cms events import history.jsonl --db site.db</code>. Wiederholungen werden nicht doppelt gezählt, Sie
      können also alle Ereignisse des Tages erneut senden.
    </p>
  </section>
  <section id="analytics-setup" data-topic hidden={!shown('analytics-setup')}>
    <h3>Einrichtung: Typen, Eigenschaften, Verzeichnisse</h3>
    <p>
      Ein <strong>Ereignistyp</strong> ist der Code, den der Absender sendet, und eine Rolle, die den Berichten sagt, was das
      Ereignis bedeutet. Es gibt zehn Rollen: Kontakt (die Person kam über ein Label), Umfrage, Testphase, Zahlung, Erstattung,
      Zahlungskorrektur (die Gebühr wurde später bekannt), Zugang beendet, Aktion (alles andere, was für Meilensteine zählt),
      Tagesübersicht und Löschung (die Person vergessen). <strong>Eigenschaften und Merkmale</strong> sind zusätzliche Felder
      von Ereignissen (ein Tarif, eine Stückzahl) und von Personen (eine Sprache); eine Eigenschaft mit „Dimension“ wird in den
      Berichten zur Gruppierung. <strong>Verzeichnisse</strong> enthalten Codes von Werten mit Namen: Tarife, Antworten auf eine
      Umfragefrage, Teile der Kennung.
    </p>
    <p>
      Ein <strong>Meilenstein</strong> heißt „hat das N-mal in so vielen Tagen getan“, etwa eine erste Aktion in drei Tagen
      nach der Ankunft. Ein <strong>Trichter</strong> führt von Besuchen und Zielen der Website über Ankunft, Testphase und
      Meilensteine zu Zahlungen. <strong>„Unbekannte“</strong> zeigt, was der Absender sendet, die Einrichtung aber noch nicht
      kennt — einen Typ, einen Wert, eine Antwort —, und legt das Element direkt aus der Zeile an.
    </p>
    <p>
      Codes ändern sich nie. Was Sie nicht mehr brauchen, archivieren Sie: In den Formularen fehlt es dann, vergangene
      Ereignisse gelten weiter. Löschen lässt sich nur, worauf nichts verweist. Jede Änderung berechnet die Personen im
      Hintergrund neu; solange das läuft, melden die Berichte, dass Personen neu berechnet werden. Wer was geändert hat, steht im
      „Protokoll“.
    </p>
  </section>
  <section id="analytics-labels" data-topic hidden={!shown('analytics-labels')}>
    <h3>Labels und Weiterleitungen</h3>
    <p>
      Ein <strong>Label</strong> ist eine Zeichenkette, an der man sieht, woher eine Person kam, zum Beispiel
      <code>google__search__autumn</code>. Wie es gelesen wird, legt das „Kennungsschema“ des Absenders fest: das Trennzeichen
      (<code>__</code>, <code>--</code>, ein Punkt oder <code>~</code>), die Länge und die Teile in ihrer Reihenfolge — Quelle,
      Kanal, Kampagne. Die Werte der Teile sind Verzeichnisse mit dem Zweck „Teil der Kennung“. Der Absender schreibt das Label
      in ein Kontakt-Ereignis, etwa aus dem Startparameter des Bots oder aus der Adresse des Shops.
    </p>
    <p>
      Eine <strong>Weiterleitung</strong> ist ein Button der Website, der zum Absender führt. Die Adresse
      <code>/_cms/go/code</code> leitet Besucher zum Ziel weiter und baut das Label aus den vorgegebenen Teilen der Weiterleitung
      und der Quelle des heutigen Besuchs: seinen UTM-Tags oder der Website, von der er kam. Auf dem Gerät der Besucher wird
      nichts gespeichert. <strong>Verweisregeln</strong> bestimmen, welche Teile ein Besuch ohne UTM bekommt: aus einer
      Suchmaschine, einem sozialen Netzwerk, von einer anderen Website oder direkt.
    </p>
    <p>
      Im Bereich <a href={resolve('/(app)/stats/labels')}>„Labels“</a> baut der „Generator“ ein Label für eine Kampagne und
      speichert es mit einem Namen im „Register“ — die Berichtszeilen zeigen dann diesen Namen; „Prüfung“ zeigt, wie ein Label
      oder eine Adresse gelesen wird; „Unbekannte Labels“ nennt Labels erster Kontakte, die nicht im Register stehen.
    </p>
  </section>
  <section id="analytics-reports" data-topic hidden={!shown('analytics-reports')}>
    <h3>Die Berichte lesen</h3>
    <ul>
      <li>
        <strong>„Übersicht“</strong> stellt die Summen eines Zeitraums neben den gleich langen Vorzeitraum: neue Personen und
        Kunden, Umsatz, Ausgaben, CAC; darunter die Besuche der Website. Ein Dreieck über einem Tag heißt: Der Absender hat eine
        neue Version gemeldet, mit dem Hinweis, ob die Zählung stimmte.
      </li>
      <li>
        <strong>„Quellen“</strong> ist eine Tabelle nach den Teilen des Labels: neue Personen, Meilensteine, Testphase, Zahlung
        im Fenster, neue Kunden, Umsatz, Zahlungen je Kunde, Verlängerung und mit Basiswährung LTV, Ausgaben, CAC und
        Amortisation. Eine Zeile lässt sich bis zum nächsten Teil aufklappen. „Gewinnungsquelle“ ist der erste Kontakt einer
        Person, „Rückkehrquelle“ der Kontakt vor einer Zahlung nach Ende des Zugangs.
      </li>
      <li>
        Anteile stehen mit ihren Zahlen: „4 von 9“. Personen, deren Fenster noch läuft, sind „noch im Fenster“ und zählen nicht
        zur Basis. Die Zeilen „nicht angegeben“, „nicht im Verzeichnis“ und „übrige“ sammeln leere und unbekannte Werte und was
        nicht in die Liste passte.
      </li>
      <li>
        <strong>„wenig Daten“</strong> kennzeichnet eine Zeile mit weniger als 30 neuen Personen oder weniger als 10 Kunden:
        Schlüsse daraus besser nicht ziehen. Die Schwellen stellen Sie unter „Qualität → Prüfungen“, „Schwellen für ‚wenig
        Daten‘“, ein; sie gelten sofort.
      </li>
      <li><strong>„Trichter“</strong> führen von Besuchen und Zielen der Website zu Personen: Ankunft, Testphase, Meilensteine, Zahlungen.</li>
      <li>
        <strong>„Kohorten“</strong>: „Nach erster Zahlung“ zeigt die Kunden des Monats ihrer ersten Zahlung und den Umsatz je
        Kunde nach Lebensmonaten, „Nach Ankunft“ die neuen Personen des Monats ihrer Ankunft. Eine unvollständige Zelle ist mit
        ◌ markiert und zählt nicht zum Durchschnitt, ebenso die Kohorte des laufenden Monats.
      </li>
      <li>
        <strong>„Personen“</strong> listet Personen und öffnet jede einzeln: Kontakte, Zahlungen, Meilensteine und Ereignisse.
        Dort finden Sie auch den „Meilensteinvergleich“ (welcher Meilenstein eine Zahlung am besten vorhersagt) und das
        „Ereignisprotokoll“ mit allem, was angenommen wurde.
      </li>
    </ul>
  </section>
  <section id="analytics-money" data-topic hidden={!shown('analytics-money')}>
    <h3>Geld: Währung, Kurse, Ausgaben, LTV und CAC</h3>
    <p>
      Beträge kommen in der Währung der Zahlung an. Ohne Basiswährung zeigen die Berichte jede Währung für sich. Die
      Basiswährung legen Sie unter <a href={`${resolve('/(app)/settings')}?tab=stats`}>„Einstellungen → Statistik“</a> fest,
      und das kann nur eine im Manager angemeldete Person. Dann fasst „Quellen“ den Umsatz zu einer Zahl zusammen und
      berechnet LTV, Ausgaben, CAC und Amortisation.
    </p>
    <p>
      <a href={resolve('/(app)/stats/spend')}>„Ausgaben“</a> ist, was Sie in einem Monat für eine Quelle ausgegeben haben: Werte
      von Teilen des Labels (etwa „Instagram, bezahlt“) oder die ganze Website. Zeilen sind nicht verschachtelt: Ein Betrag für
      „Instagram“ sind Ausgaben ohne Aufteilung nach Kanal, nicht die Summe anderer Zeilen. „Kurse“ sind die Kurse anderer
      Währungen zur Basiswährung, je Monat. Ein Betrag ohne Kurs zählt nicht zur Summe und steht gesondert; ein Monat ohne
      eigenen Kurs nimmt den des Vormonats, mit Markierung. Kurse tragen Sie oder Ihr Skript mit API-Schlüssel ein, Ausgaben
      auf Ihre Bitte auch der Agent.
    </p>
    <dl>
      <dt>LTV pro Kunde</dt>
      <dd>Umsatz neuer Kunden über die „Lebensdauer“ — 3, 6 oder 12 Monate ab der ersten Zahlung oder die gesamte Zeit — je Kunde, der diese Zeit schon erlebt hat.</dd>
      <dt>LTV pro Person</dt>
      <dd>Dasselbe über alle neuen Personen der Zeile, auch die, die nie gezahlt haben.</dd>
      <dt>CAC, Kosten pro Person</dt>
      <dd>Die Ausgaben der Zeile je neuem Kunden und je neuer Person.</dd>
      <dt>LTV / CAC, Amortisation</dt>
      <dd>Über 1 bringt ein Kunde über die Lebensdauer mehr ein, als er gekostet hat. Die Amortisation ist der Lebensmonat, in dem der Umsatz je Kunde den CAC eingeholt hat.</dd>
    </dl>
    <p>„Umsatz: Vor Gebühren / Nach Gebühren“ zieht die Gebühr des Zahlungsdienstes ab, wenn der Absender sie meldet.</p>
  </section>
  <section id="analytics-quality" data-topic hidden={!shown('analytics-quality')}>
    <h3>Datenqualität</h3>
    <p>
      Der Bereich <a href={resolve('/(app)/stats/quality')}>„Qualität“</a> öffnet „Datenqualität“: Kann man den Zahlen trauen?
      Jeden Tag prüft die Website die Daten und gleicht die Zusammenfassung des Absenders mit ihrer eigenen Zählung ab. Ein
      Fehler heißt, dass Daten verloren sind oder nicht übereinstimmen (keine Zusammenfassung, weniger Ereignisse, anderer
      Umsatz); ein Hinweis, dass eine Regel verletzt ist, aber keine Daten fehlen; keine Daten, dass es noch nichts zu prüfen
      gibt: vor der ersten Zusammenfassung, bei ausgeschaltetem Empfang, bei zu wenigen Kontakten.
    </p>
    <ul>
      <li>
        <strong>„Übersicht“</strong> zeigt eine Kachel je Prüfung (Fehler zuerst) und ein Raster der Prüfungen nach Tagen über
        30 Tage: ✓ in Ordnung, ! Hinweis, ✕ Fehler, – keine Daten, ein Haken im Kreis — von Hand erledigt. Eine Zelle öffnet den
        Tag: was verglichen wurde, die Zahlen und die Aktionen.
      </li>
      <li>
        Die Prüfungen der Zusammenfassung („Zusammenfassung eingegangen“, „Ereignisse angekommen“, „Umsatz stimmt“, „Absender
        hat alles zugestellt“) zählen UTC-Tage und laufen 5 Minuten nach der Uhrzeit der Zusammenfassung des Absenders. Die
        übrigen laufen am Folgetag um 06:05 UTC; „Weiterleitungen kommen an“, „Kurse vorhanden“ und Ihre eigenen Prüfungen
        rechnen in Tagen der Zeitzone der Berichte, „Abgleich mit Kontoauszug“ in Monaten.
      </li>
      <li>
        Fehler bei „Ereignisse angekommen“: Exportieren Sie beim Absender die Ereignisse dieses UTC-Tages und laden Sie sie im
        Fenster des Tages mit „Fehlende Ereignisse hochladen“ hoch. Wiederholungen werden nicht doppelt gezählt, und die Prüfung
        schließt sich von selbst, sobald die Zahlen stimmen. „Erneut prüfen“ prüft den Tag sofort.
      </li>
      <li>
        „Von Hand erledigen“, wenn der Grund bekannt ist und die Daten nicht zurückkommen: Der Absender stand still, es war ein
        Testtag. Eine Notiz ist Pflicht, und man sieht, wer wann erledigt hat; „Wieder öffnen“ hebt das auf. Wird es später
        schlimmer — aus einem Hinweis wird ein Fehler —, fällt die Erledigung von selbst weg.
      </li>
      <li>
        <strong>Benachrichtigungen</strong> gehen an die Störungskanäle unter
        <a href={`${resolve('/(app)/settings')}?tab=notify`}>„Einstellungen → Benachrichtigungen“</a> (Telegram, E-Mail): alle
        Fehler eines Morgens in einer Nachricht, zu jeder Prüfung höchstens einmal am Tag, eine Erinnerung nach 7 Tagen und
        „wieder in Ordnung“, wenn sich ein Fehler von selbst geschlossen hat. Ohne Kanäle meldet der Bildschirm, dass keine
        Benachrichtigungen gesendet werden, und ein Fehler erscheint nur als Punkt bei „Statistik“ im Menü. Solange die
        Verbindung neu ist — bis zur ersten Zusammenfassung, aber höchstens 7 Tage —, gibt es keine Benachrichtigungen.
      </li>
      <li>
        <strong>„Prüfungen“</strong> enthält die Schwellen der eingebauten Prüfungen, „Benachrichtigen“ (bei Fehler, bei Fehler
        und Hinweis, nie) und ob die Prüfung an ist; „Standard wiederherstellen“ nimmt Ihre Änderungen zurück. Hier stehen auch
        die Schwellen für „wenig Daten“ in den Berichten und Ihre eigenen Prüfungen — „Prüfung hinzufügen“: eine Kennzahl
        (Ereignisse eines Typs, Ereignisse mit einer Rolle, neue Personen, neue Kunden, Umsatz, Besucher der Website, Besucher mit
        erreichtem Ziel), unter oder über einer Schwelle, über 1, 7 oder 30 Tage, als Fehler oder Hinweis. Zum Beispiel
        „weniger als eine Zahlung am Tag“.
      </li>
      <li>
        <strong>„Kontoauszüge“</strong>, sobald „Abgleich mit Kontoauszug“ an ist: der Betrag eines Monats aus dem Auszug Ihrer
        Bank oder Ihres Zahlungsdienstes („Auszug hinzufügen“), den die Website mit ihrem eigenen Umsatz vergleicht. Fehlt der
        Auszug am 5., erinnert sie daran.
      </li>
      <li><strong>„Empfang“</strong> zeigt, ob der Empfang an ist, wie viel heute ankam, die letzten Ablehnungen mit Fehlern nach Feldern und die Zählung je Tag.</li>
    </ul>
  </section>
  <section id="analytics-transfer" data-topic hidden={!shown('analytics-transfer')}>
    <h3>Einrichtung übertragen und Vorlagen</h3>
    <p>
      Unter <a href={`${resolve('/(app)/stats/setup')}?tab=transfer`}>„Einrichtung → Übertragung“</a> speichert „Paket
      herunterladen“ die gesamte Einrichtung der Analyse als eine JSON-Datei: Absender mit Uhrzeit der Zusammenfassung, Typen,
      Eigenschaften, Verzeichnisse, Schemata, Verweisregeln, Weiterleitungen, Meilensteine, Trichter und Prüfungen, auch
      archivierte. „Paket importieren“ nimmt eine Datei bis 2 MB und zeigt zuerst einen Probelauf: was angelegt wird, was sich
      ändert („vorher → nachher“), Hinweise und Fehler. „Importieren“ speichert alles oder nichts; Elemente der Website, die
      nicht in der Datei stehen, bleiben, wie sie sind.
    </p>
    <p>
      Ein Paket enthält keine Absenderschlüssel, keinen Empfangsschalter, keine Aufbewahrungsfrist, keine Basiswährung, kein
      Label-Register, keine Kurse, Ausgaben und Kontoauszüge, keine Ereignisse, Personen und Prüfergebnisse. Auf einer neuen
      Website stellen Sie die Schlüssel neu aus; die Ereignisse bringt eine Kopie der Website oder eine Ereignisdatei mit. Ein
      Paket importiert nur eine Person im Manager — weder ein API-Schlüssel noch der Agent kann das.
    </p>
    <p>
      Die Vorlagen „Abonnement“ und „Onlineshop“ stehen hier und bei leerer Einrichtung: „Ansehen, was angelegt wird“, dann
      „Anlegen“. Die Namen kommen in der Sprache des Managers, die Codes sind in allen Sprachen gleich. Weiterleitungen haben
      die Vorlagen nicht — die Adresse Ihres Bots oder Shops ist Ihre eigene, legen Sie die Weiterleitung selbst an.
    </p>
    <p>Auf dem Server erledigt das die Kommandozeile. Die Datenbank muss schon da sein — sie entsteht beim ersten Start des Servers oder mit <code>cms new</code>:</p>
    <pre>cms analytics export analytics.json --db site.db            # Paket exportieren; „-“ gibt es aus
cms analytics import analytics.json --dry-run --db site.db  # Probelauf: die Datenbank bleibt, wie sie ist
cms analytics import analytics.json --db site.db            # importieren
cms analytics import --sample shop --language de --db site.db
cms analytics samples                                       # Vorlagen anzeigen</pre>
    <p>Ein Paket über 2 MB lässt sich nur mit dem Befehl importieren.</p>
  </section>
  <section id="analytics-agent" data-topic hidden={!shown('analytics-agent')}>
    <h3>Der Agent und die Kundenanalyse</h3>
    <p>
      Der Assistent im Manager und ein Agent über MCP lesen die Berichte als Zahlen und Codes aus der Einrichtung: welche Quelle
      sich gelohnt hat, wo eine Prüfung fehlschlug und warum. Auf Wunsch legt der Agent Typen, Eigenschaften, Meilensteine,
      Trichter und Prüfungen an, erstellt Labels für Kampagnen, trägt Ausgaben ein und erledigt einen Fehler mit einer Notiz zum
      Grund.
    </p>
    <p>
      Nur Sie legen einen Absender und seinen Schlüssel an, schalten den Empfang ein, bestimmen Aufbewahrungsfrist und
      Basiswährung und importieren ein Paket; Kurse und Kontoauszüge kommen von Ihnen oder Ihrem Skript mit API-Schlüssel, nie
      vom Agenten. Hat der Agent Personen (Pseudonyme, Labels, Antworten), „Unbekannte“ oder die Besucherstatistik gelesen,
      ändert er bis zum Ende der Anfrage — über MCP bis zum Ende der Sitzung — weder die Einrichtung der Analyse noch Labels
      und Ausgaben und erledigt keine Prüfungen: Diesen Text schreiben Fremde, und ein geschickt gebautes Label darf dem
      Agenten keine Befehle geben. Er sagt Ihnen, was er ändern würde: Erledigen Sie es selbst oder bitten Sie erneut — in einer
      neuen Nachricht an den Assistenten oder einem neuen Gespräch mit dem Agenten.
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
  <section id="account-review" data-topic hidden={!shown('account-review')}>
    <h3>Prüfung von Agenten-Änderungen</h3>
    <p>
      Ein Agent über MCP ändert die Website sofort. Wenn Sie erst prüfen möchten, schalten Sie die Prüfung ein: für alle Agenten —
      der Administrator unter <a href={resolve('/(app)/proposals')}>„Vorschläge“</a>, für Ihren eigenen Schlüssel — „Änderungen
      warten auf Prüfung“ unter „API-Schlüssel“. Dann gehen Änderungen an Seiten, Templates, Komponenten und Skripten nicht live,
      sondern sammeln sich in einem Änderungssatz, wie ein Pull Request. Formulare, Felder und Einstellungen ändert ein Agent in
      diesem Modus gar nicht.
    </p>
    <p>
      Unter „Vorschläge“ hat jeder Satz die Beschreibung des Agenten und den Unterschied jeder Änderung: Text und Quelltext Zeile für
      Zeile, Felder „jetzt → vorgeschlagen“, das Verschieben im Baum. {@html icons.eye} „Vorschau“ zeigt die Seite mit den
      Änderungen, „Link für Kunden“ dasselbe ohne Anmeldung. Nehmen Sie alles, die Auswahl an oder lehnen Sie ab: Angenommenes geht
      den normalen Weg, steht im Seitenverlauf im Namen des Agenten und lässt sich über eine Version zurücknehmen. Wurde die Seite nach
      dem Vorschlag geändert, markiert der Satz einen Konflikt: trotzdem annehmen oder ablehnen.
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
    <section id="admin-gateway" data-topic hidden={!shown('admin-gateway')}>
      <h3>Mail-Gateway</h3>
      <p>
        Über das Gateway senden andere Dienste – eine Plattform, ein CRM, Ihr eigenes Backend – E-Mails mit dem Postfach der Website,
        ohne eigenes SMTP. Sie schalten es mit dem Kästchen „Mail-Gateway“ unter
        <a href={`${resolve('/(app)/settings')}?tab=notify`}>„Einstellungen → Benachrichtigungen“</a> im Abschnitt E-Mail ein: Es braucht
        gespeicherte E-Mail-Einstellungen und mindestens einen Token. Ein Token wird nur einmal angezeigt, beim Erstellen – der Server
        behält nur seinen Hash; jeder Client bekommt einen eigenen Token mit Bezeichnung, einen nicht mehr gebrauchten widerrufen Sie
        mit dem Papierkorb.
      </p>
      <p>
        Ein Client sendet einen <code>POST</code> an die Adresse des Gateways (standardmäßig <code>/mailer/</code>, auch ohne Schrägstrich
        am Ende) mit dem Header <code>Authorization: Bearer Token</code> und JSON <code>{'{ to, subject, html, text, from, attachments }'}</code>:
        <code>to</code> ist eine Adresse, eine Liste oder <code>{'{ address, name }'}</code>; Anhänge haben <code>filename</code>,
        <code>contentType</code>, <code>contentBase64</code>, Bilder in der E-Mail eine <code>contentId</code> (im HTML <code>cid:…</code>),
        bis zu 40 Stück mit je 2 MB. Die Antwort ist <code>{'{"ok":true}'}</code>, sobald der Mailserver die E-Mail angenommen hat;
        sonst <code>ok: false</code> mit einem Fehlercode: <code>unauthorized</code>, <code>rate_limited</code>, <code>to_required</code>,
        <code>send_failed</code> und andere.
      </p>
      <p>
        Absender der E-Mail ist der Absender der Website-Mail oder eine Adresse aus „Weitere erlaubte Absender“; jede andere Adresse
        ersetzt das Gateway durch die eigene, der Name bleibt. Die Grenze gilt für Anfragen pro Minute von einer Adresse (standardmäßig
        15). Vor einer Seite mit derselben Adresse hat das Gateway Vorrang. Ein <code>GET</code> auf die Adresse des Gateways zeigt, ob
        es bereit ist, <code>?probe=1</code> zusätzlich, ob der Mailserver erreichbar ist. Jede Anfrage ist eine Zeile in der Ausgabe
        des Servers und unter „Letzte Anfragen“: Bezeichnung des Tokens, Zahl der Empfänger und Ergebnis, ohne Adressen und Betreff.
      </p>
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
        <strong>Sicherungen außerhalb des Servers</strong> richten Sie dort ebenfalls ein: Adresse des S3-Speichers (DigitalOcean Spaces,
        Backblaze B2, Hetzner, MinIO, AWS), Bucket und Zugriffsschlüssel. Jede Sicherung wird auf dem Server verschlüsselt und in den
        Speicher geschickt, der die letzten behält. Beim ersten Einschalten zeigt der Manager einmal einen
        <strong>Wiederherstellungsschlüssel</strong> – bewahren Sie ihn auf: Er öffnet eine Sicherung aus dem Speicher auf einem neuen
        Server (<code>cms restore --remote latest</code>), wenn es diesen nicht mehr gibt. Eine Sicherung mit dem Schlüssel dieses Servers
        lässt sich auch unter „Sicherungen“ wiederherstellen.
      </p>
      <p>
        Mailpasswort oder Mail-API-Schlüssel, Telegram-Bot, Mail-Gateway, Speicher und KI-Schlüssel gehören zum Server, nicht zur Website: In einer Sicherung sind sie
        nicht enthalten. Auf einen neuen Server bringt sie eine Einstellungsdatei mit Passphrase: <code>cms backup --server</code> hier und
        <code>cms restore --server</code> dort. Unter „Datenbankdatei“ sehen Sie, wie viel in der Datenbank frei ist, und können sie verdichten.
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
        <li><code>cms restore datei</code> – die Website aus einer Sicherung wiederherstellen, <code>cms restore --remote latest</code> – aus dem S3-Speicher;</li>
        <li><code>cms backup --server</code> und <code>cms restore --server datei</code> – die Servereinstellungen auf einen neuen Rechner bringen;</li>
        <li><code>cms compact</code> – die Datenbank verdichten und freie Seiten an die Festplatte zurückgeben;</li>
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
