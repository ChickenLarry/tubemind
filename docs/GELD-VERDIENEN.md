# Mit TubeMind Geld verdienen – ohne dass Nutzer etwas zahlen

Die Extension hat drei Einnahmequellen eingebaut. Alle sind so gebaut, dass sie die Regeln des Chrome Web Store einhalten.

> **Ehrliche Erwartung:** Spürbares Geld kommt erst mit einigen tausend aktiven Nutzern. Bis dahin ist die wichtigste Arbeit **Nutzer gewinnen** (siehe unten). Die eingebaute Bewertungs-Bitte (erscheint nach 3 Tagen und etwas Nutzung) hilft beim Ranking im Store.

---

## 1. Spenden (sofort, ab dem ersten Nutzer)

1. Konto bei [Ko-fi](https://ko-fi.com) erstellen (Ko-fi nimmt keine Provision, nur die üblichen PayPal-/Stripe-Gebühren) – Alternativen: Buy Me a Coffee, PayPal.me, GitHub Sponsors
2. Link in `extension/src/shared/config.js` → `donateUrl` und in `website/assets/site-config.js` → `donateUrl` eintragen

Der Spenden-Link erscheint dann im Popup, in der Bibliothek, in den Einstellungen und abwechselnd in der Hinweis-Karte («❤️ Unterstütze TubeMind»).

---

## 2. Sponsoren-Karte in der Extension (Haupteinnahme)

Im Popup, in der Seitenleiste und in der Bibliothek zeigt TubeMind **eine** kleine Karte mit der Markierung «Gesponsert». Den Inhalt steuerst du über die Datei `website/sponsor.json` auf deiner Webseite. **Du musst die Extension dafür nie aktualisieren**: Datei ändern, hochladen, fertig (die Extension lädt sie alle 6 Stunden neu).

### Beispiel-Eintrag
```json
{
  "id": "notion-okt26",
  "active": true,
  "title": { "en": "Your second brain", "de": "Dein zweites Gehirn" },
  "text":  { "en": "Organize all your notes in Notion.", "de": "Organisiere alle Notizen in Notion." },
  "cta":   { "en": "Try free", "de": "Gratis testen" },
  "url": "https://example.com/?ref=tubemind",
  "image": "https://deine-seite.github.io/tubemind/assets/sponsor-notion.png",
  "placements": ["popup", "sidepanel", "library"],
  "locales": ["*"],
  "weight": 1,
  "start": "2026-10-15",
  "end": "2026-11-15"
}
```

| Feld | Bedeutung |
|---|---|
| `active` | `false` = ausgeschaltet |
| `title`, `text`, `cta` | Text, pro Sprache (`en` ist Fallback) |
| `url` | **muss mit https:// beginnen**. TubeMind hängt automatisch `utm_source=tubemind` an, damit der Sponsor die Klicks sieht |
| `image` | optional, quadratisches Logo (https) |
| `placements` | wo die Karte erscheint |
| `locales` | z. B. `["de"]` nur für deutschsprachige Nutzer, `["*"]` für alle |
| `weight` | bei mehreren Sponsoren: Häufigkeit (2 = doppelt so oft) |
| `start` / `end` | Laufzeit (JJJJ-MM-TT) |

Ohne aktiven Sponsor zeigt die Karte automatisch deine eigenen Hinweise (Spenden / Bewertung).

### Woher kommen Sponsoren?

**Phase 1 – Affiliate (sofort möglich):** Melde dich bei Partnerprogrammen an, die zu «Lernen mit YouTube» passen, z. B. Lernplattformen, Notiz-Apps, Sprach-Apps, Produktivitäts-Tools. Du bekommst eine Provision pro Anmeldung/Kauf. Den Affiliate-Link trägst du als `url` ein.
→ Erlaubt, weil der Link nur in deiner eigenen, gekennzeichneten Karte steht und der Nutzer selbst klickt.

**Phase 2 – Direkte Sponsoren (ab ca. 5'000+ Nutzern):** Firmen direkt anschreiben und einen festen Preis pro Woche/Monat verlangen. Die Nutzerzahl siehst du im Developer Dashboard.

Vorlage für eine Anfrage:
> Hallo [Name], ich entwickle TubeMind, eine Chrome-Extension, mit der [X] Menschen YouTube-Videos durchsuchen, zusammenfassen und Notizen machen – vor allem Studierende und Leute, die mit YouTube lernen. Ich vergebe einen exklusiven Sponsoren-Platz in der Extension (Popup, Seitenleiste, Bibliothek), klar gekennzeichnet, mit Link und UTM-Tracking. Passt [Produkt] dazu? Ich schicke gern Zahlen und Preise.

---

## 3. Werbung auf deiner Webseite (Willkommens- und Deinstallations-Seite)

Jeder neue Nutzer sieht einmal die Willkommens-Seite, jeder, der deinstalliert, die Feedback-Seite. Dort darf normale Web-Werbung laufen, weil es ganz normale Webseiten sind.

**Google AdSense einrichten:**
1. AdSense verlangt eine **eigene Domain** (z. B. `tubemind.app`, ca. 10–20 CHF/Jahr). Eine `github.io`-Adresse wird in der Regel nicht akzeptiert. Die Domain kannst du in GitHub Pages unter *Settings → Pages → Custom domain* verbinden.
2. Bei [AdSense](https://adsense.google.com) anmelden, Webseite hinzufügen, auf Freigabe warten
3. In AdSense unter *Datenschutz & Mitteilungen* die **Einwilligungs-Meldung (CMP)** aktivieren – Pflicht für Besucher aus EU/Schweiz/UK
4. In `website/assets/site-config.js` eintragen: `adsenseClient: 'ca-pub-…'` und die Anzeigenblock-IDs unter `adsenseSlots`
5. In `website/ads.txt` die Nullen durch deine Publisher-ID ersetzen
6. In `extension/src/shared/config.js` die `WEBSITE_URL` auf die neue Domain ändern (nächstes Update)

> Ehrlich: Diese Quelle bringt am wenigsten (jeder Nutzer sieht die Seite meist nur einmal). Die Sponsoren-Karte ist deutlich wichtiger.

---

## ❌ Was du nie tun darfst (sonst wird die Extension gesperrt)

- Werbung oder Banner **auf YouTube-Seiten** einblenden
- Affiliate-Links heimlich in Seiten oder Links einbauen (Google hat das 2025 ausdrücklich verboten)
- AdSense **in der Extension** verwenden (AdSense verbietet Werbung in Browser-Erweiterungen)
- Daten der Nutzer verkaufen oder weitergeben
- JavaScript-Code von deinem Server nachladen (nur Daten wie `sponsor.json` sind erlaubt)
- Werbung ohne die Kennzeichnung «Gesponsert»

---

## 📈 Nutzer gewinnen (das entscheidet über die Einnahmen)

1. **Store-Seite optimieren:** Gute Screenshots (Marker auf der Fortschrittsleiste sind das «Wow»), Schlüsselwörter im Titel sind schon drin (*AI Summary, Transcript, Notes*)
2. **Demo-Video** (30–60 Sek.) auf YouTube und TikTok: «Ctrl+F für YouTube-Videos»
3. **Reddit:** r/chrome_extensions, r/productivity, r/GetStudying, r/ObsidianMD (Markdown-Export!), r/nosurf (Fokus-Modus) – ehrlich vorstellen, nicht spammen
4. **Product Hunt** Launch
5. **Studierende:** Lerngruppen, Uni-Foren, Discord-Server
6. **Edge Add-ons Store** zusätzlich veröffentlichen (gleiche ZIP)
7. **Bewertungen:** Die Extension fragt zufriedene Nutzer automatisch nach 3 Tagen nach einer Bewertung
