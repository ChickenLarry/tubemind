# TubeMind – dein zweites Gehirn für YouTube

Gratis Chrome-/Edge-Extension (Manifest V3), die YouTube durchsuchbar macht und dir trotzdem Geld einbringen kann.

| Funktion | Was sie macht |
|---|---|
| 🔍 **Ctrl+F für Videos** | Taste `S` → Wort suchen → jeder Treffer erscheint als Marker auf der Fortschrittsleiste |
| ✨ **KI-Zusammenfassung** | Kurzfassung, Kernaussagen, Zeitleiste – mit der in Chrome eingebauten KI (gratis, lokal). Ohne KI: automatische «wichtigste Stellen» + Themen |
| 📝 **Notizen** | `N` = Notiz, `B` = Lesezeichen, als Marker im Video, Export als Markdown |
| 📚 **Bibliothek** | Alle Videos, Notizen, Zusammenfassungen + Volltextsuche in gespeicherten Transkripten |
| 🧘 **Fokus-Modus** | Shorts, Startseite, Empfehlungen, Kommentare, Endbildschirme ausblenden, Tagesbudget, Statistik |
| ⚡ **Player** | Tempo pro Kanal, bis 16×, Kinomodus, bevorzugte Qualität |

Sprachen: Deutsch, Englisch, Französisch, Italienisch (automatisch nach Browsersprache).

---

## 1. Sofort ausprobieren (5 Minuten)

1. Chrome öffnen → Adresse `chrome://extensions` eingeben
2. Oben rechts **Entwicklermodus** einschalten
3. **Entpackte Erweiterung laden** → den Ordner `extension` in diesem Projekt auswählen
4. Ein YouTube-Video öffnen (bereits offene YouTube-Tabs einmal neu laden)
5. `S` drücken und ein Wort suchen, `N` für eine Notiz, TubeMind-Symbol → **Seitenleiste** → **Video zusammenfassen**

> Tipp: Über das Puzzle-Symbol 🧩 in Chrome kannst du TubeMind anheften.

**Nach Code-Änderungen:** in `chrome://extensions` beim TubeMind-Eintrag auf ⟳ klicken und den YouTube-Tab neu laden.

**KI-Zusammenfassung testen:** braucht ein aktuelles Chrome (ab Version 138) auf Windows/macOS/Linux mit ca. 16 GB RAM oder einer Grafikkarte mit mehr als 4 GB. Beim ersten Mal lädt Chrome das Modell einmalig herunter. Auf anderen PCs zeigt TubeMind automatisch die Basis-Zusammenfassung.

---

## 2. Projektstruktur

```
extension/                ← DAS ist die Extension (diesen Ordner lädt Chrome)
  manifest.json
  _locales/               ← Übersetzungen (werden aus scripts/translations.js erzeugt)
  icons/
  src/
    shared/config.js      ← ★ DEINE LINKS (Webseite, Spenden-Link)
    shared/…              ← Einstellungen, Speicher, Suche, Export
    content/              ← läuft auf YouTube (Suche, Notizen, Fokus, Player, Statistik)
      core.js             ← Modul-System, Marker, Navigation
      transcript.js       ← Transkript laden (3 Methoden, falls YouTube etwas ändert)
      modules/            ← ein Feature = eine Datei
    sidepanel/            ← Seitenleiste (Zusammenfassung, Transkript, Notizen)
    popup/                ← Klick auf das Symbol
    library/              ← Bibliothek + Statistik
    options/              ← Einstellungen
    ui/sponsor.js         ← Sponsoren-Karte (nur in der Extension, nie auf YouTube)
website/                  ← Webseite für GitHub Pages (Willkommen, Deinstallation, Datenschutz, sponsor.json)
  assets/site-config.js   ← ★ DEINE LINKS für die Webseite (Store, Spenden, E-Mail, AdSense)
store/                    ← Texte für den Chrome Web Store (4 Sprachen) + Datenschutz-Formular
scripts/                  ← Hilfsskripte (Tests, Übersetzungen, Icons, ZIP)
docs/GELD-VERDIENEN.md    ← So verdienst du Geld damit
```

---

## 3. Einrichten (einmalig)

### a) Webseite online stellen (gratis mit GitHub Pages)
Die Webseite brauchst du für die Datenschutzerklärung (Pflicht im Store), die Willkommens-/Deinstallations-Seite (Werbung erlaubt) und die Sponsoren-Liste.

1. Konto auf [github.com](https://github.com) erstellen
2. Neues **öffentliches** Repository mit dem Namen `tubemind` anlegen
3. Den **Inhalt** des Ordners `website/` hochladen (*Add file → Upload files*)
4. Im Repository: *Settings → Pages → Branch: main / root → Save*
5. Nach 1–2 Minuten ist die Seite erreichbar unter `https://DEIN-NAME.github.io/tubemind/`

### b) Links eintragen
- `extension/src/shared/config.js`: `WEBSITE_URL` und `donateUrl` ersetzen
- `website/assets/site-config.js`: `contactEmail`, `ownerName`, `donateUrl` (später `storeUrl`, `adsenseClient`) eintragen und erneut hochladen

Solange ein Link noch `YOUR-` enthält, ignoriert die Extension ihn einfach. Du kannst also alles schrittweise einrichten.

---

## 4. Im Chrome Web Store veröffentlichen

1. **Entwicklerkonto** erstellen: [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole), einmalig 5 USD
2. **ZIP erstellen:**
   ```bash
   node scripts/package.js
   ```
   → erzeugt `dist/tubemind-1.0.0.zip`
3. Im Dashboard **Neues Element** → ZIP hochladen
4. **Store-Eintrag:** Texte aus `store/listing-en.md` (Standard) und die anderen Sprachen unter *Sprachen hinzufügen* einfügen. Icon: `store/store-icon-128.png`
5. **Screenshots** (mind. 1, Grösse 1280×800): mit `Win+Shift+S` aufnehmen, z. B.
   1. Video mit Suchfeld und gelben Markern
   2. Seitenleiste mit Zusammenfassung
   3. Notiz-Editor im Video
   4. Bibliothek / Statistik
   5. Startseite im Fokus-Modus
6. **Privacy practices:** Texte aus `store/DATENSCHUTZ-FORMULAR.md` einfügen
7. Einreichen → die Prüfung dauert meist einige Tage
8. Danach den Store-Link in `website/assets/site-config.js` (`storeUrl`) eintragen

**Bonus: Microsoft Edge Add-ons** ([partner.microsoft.com](https://partner.microsoft.com/dashboard/microsoftedge)) ist gratis und nimmt **dieselbe ZIP-Datei**. Das erhöht deine Reichweite ohne Mehraufwand.

**Updates:** In `extension/manifest.json` die `version` erhöhen (z. B. `1.0.1`), `node scripts/package.js`, neue ZIP im Dashboard hochladen.

---

## 5. Geld verdienen

Siehe **[docs/GELD-VERDIENEN.md](docs/GELD-VERDIENEN.md)**: Spenden, Sponsoren-Karte, Affiliate, Werbung auf der Webseite und was Google verbietet.

---

## 6. Weiterentwickeln

| Befehl | Zweck |
|---|---|
| `node scripts/test.js` | Alle Tests (Syntax, Manifest, Übersetzungen, Suche, Zusammenfassung, Speicher) |
| `node scripts/test.js --live` | zusätzlich echter Transkript-Test mit YouTube |
| `node scripts/build-locales.js` | Übersetzungen aus `scripts/translations.js` erzeugen + prüfen |
| `node scripts/make-icons.js` | Icons neu zeichnen |
| `node scripts/package.js` | ZIP für den Store bauen |

**Neues Feature hinzufügen:** neue Datei in `extension/src/content/modules/` mit `TM.registerModule({ id, start, stop, onVideo, onMeta, onSettings })`, in `manifest.json` eintragen, Standardwert in `shared/settings.js` und eine Zeile in `options/options.js`. Jedes Modul lässt sich in den Einstellungen einzeln abschalten.

**Texte ändern / neue Texte:** nur in `scripts/translations.js` (alle 4 Sprachen nebeneinander), dann `node scripts/build-locales.js`.

**Name ändern:** Es gibt bereits eine kleine Extension namens «TubeMind – YouTube Video Organizer» (ca. 4 Nutzer). Falls du einen eindeutigen Namen willst: `extName` in `scripts/translations.js`, `short_name` in `manifest.json` und `name` in `shared/config.js` ändern.

**Wenn YouTube etwas ändert** (passiert ab und zu):
- Transkripte laden nicht mehr → `extension/src/content/transcript.js` (Methode 1: Android-Client-Version `clientVersion` aktualisieren)
- Fokus-Modus blendet etwas nicht mehr aus → CSS-Selektoren oben in `extension/src/content/content.css`
- Marker fehlen → `TM.yt.progressBar()` in `extension/src/content/core.js`

---

## 7. Was diese Extension bewusst NICHT macht

Diese Regeln schützen dich vor einer Sperre im Chrome Web Store:
- keine Werbung auf YouTube-Seiten, keine eingeschleusten Affiliate-Links
- kein YouTube-Werbeblocker, kein Video-Download
- kein nachgeladener Code (die Sponsoren-Datei ist reines JSON)
- keine Datensammlung: alles bleibt lokal beim Nutzer
