/*
 * ============================================================
 *  TubeMind – zentrale Konfiguration
 * ============================================================
 *  Hier (und nur hier) trägst du deine eigenen Links ein.
 *  Alles, was noch "YOUR-" enthält, gilt als "nicht eingerichtet"
 *  und wird von der Extension automatisch ignoriert.
 * ============================================================
 */
(function (g) {
  const TM = (g.TM = g.TM || {});

  // Deine Webseite (z.B. GitHub Pages oder eigene Domain), OHNE "/" am Ende.
  // Dort liegen welcome.html, uninstall.html, privacy.html und sponsor.json.
  const WEBSITE_URL = 'https://chickenlarry.github.io/tubemind-website';

  TM.config = {
    name: 'TubeMind',

    websiteUrl: WEBSITE_URL,

    // Wird beim ersten Installieren geöffnet (Seite darf Werbung enthalten).
    welcomeUrl: WEBSITE_URL + '/welcome.html',

    // Wird nach dem Deinstallieren geöffnet (Feedback + Werbung erlaubt).
    uninstallUrl: WEBSITE_URL + '/uninstall.html',

    privacyUrl: WEBSITE_URL + '/privacy.html',

    // Liste der Sponsoren (nur Daten, kein Code). Änderbar ohne Extension-Update.
    sponsorFeedUrl: WEBSITE_URL + '/sponsor.json',

    // Spenden-Link (Ko-fi, Buy Me a Coffee, PayPal.me, GitHub Sponsors …)
    donateUrl: 'https://ko-fi.com/chickenlarry',

    // Wie oft die Sponsor-Liste neu geladen wird (in Stunden)
    sponsorRefreshHours: 6,

    // Bewertungs-Link im Chrome Web Store (wird automatisch aus der ID gebaut)
    get reviewUrl() {
      const id = g.chrome && g.chrome.runtime && g.chrome.runtime.id;
      return 'https://chromewebstore.google.com/detail/' + (id || '') + '/reviews';
    },

    get storeUrl() {
      const id = g.chrome && g.chrome.runtime && g.chrome.runtime.id;
      return 'https://chromewebstore.google.com/detail/' + (id || '');
    },
  };

  /** true, wenn ein Link wirklich eingerichtet wurde (kein Platzhalter). */
  TM.isConfigured = function (url) {
    return typeof url === 'string' && /^https:\/\//.test(url) && !url.includes('YOUR-');
  };
})(globalThis);
