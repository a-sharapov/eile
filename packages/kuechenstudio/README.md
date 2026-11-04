# Küchenstudio

Offizielles Paket von Eile: eine vollständige Website für ein Küchenstudio in Deutschland — Start, Küchen mit vier Beispielseiten, Online-Planer, Leistungen, Über uns, Kontakt mit Terminanfrage, Impressum, Datenschutz und 404.

```sh
cms new kuechenstudio --name "Küchen Schmidt" --db studio.db
```

Texte in eckigen Klammern sind Platzhalter, `[Beispieltext: …]` sind Beispieltexte: Besucher sehen keine leeren Platzhalter, der angemeldete Inhaber sieht sie markiert. Impressum und Datenschutz sind Vorlagen und vom Anwalt zu prüfen.

## Bilder

Die sieben Beispielfotos (`media/beispiel/`) sind KI-generiert, ohne Personen, Marken und Schrift, KI-generiert, vom Inhaber der Vorlage freigegeben. Sie sind Platzhalter, die der Inhaber durch eigene Fotos ersetzt; Varianten in 480, 960 und 1920 px erzeugt der Server.

Bildsprache der Serie: Art direction (identical for the whole series): documentary interior photograph for the website of a small, owner-run kitchen studio in a German town, photographed in late October. Full-frame camera, 24 mm tilt-shift lens, verticals perfectly straight, camera at about 1.3 m height, f/8, tripod. Light: soft overcast northern daylight from large windows on the left side, slightly cool, plus a little warm light from a few ceiling spots; gentle real shadows, nothing glowing. Neutral, true-to-life colour grade, slightly muted, no HDR, no orange-teal grading. Palette of the series: matte lacquer in

| Datei                              | Seite und Feld      |
| ---------------------------------- | ------------------- |
| `beispiel/ausstellung-kueche.webp` | start.heroImage     |
| `beispiel/ausstellung.webp`        | start.aboutImage    |
| `beispiel/kueche-grifflos.webp`    | grifflos.photo      |
| `beispiel/kueche-landhaus.webp`    | landhaus.photo      |
| `beispiel/kueche-insel.webp`       | kochinsel.photo     |
| `beispiel/kueche-klein.webp`       | kleine-kueche.photo |
| `beispiel/beratung-muster.webp`    | leistungen.photo    |

## Schrift

Jost von indestructible type* (https://github.com/indestructible-type/Jost), Latin-Untermenge, variabel 400–700, unter der SIL Open Font License 1.1 — der Lizenztext steht in `LICENSE`. Fehlt die Datei in der Mediathek, zeigt die Website eine Systemschrift.
