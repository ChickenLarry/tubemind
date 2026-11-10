/*
 * ============================================================
 *  TubeMind Webseite – Konfiguration
 * ============================================================
 *  Trage hier deine Links ein. Leere Werte ("") werden ignoriert.
 */
window.SITE_CONFIG = {
  // Link zu deiner Extension im Chrome Web Store (nach dem Veröffentlichen eintragen)
  storeUrl: 'https://chromewebstore.google.com/detail/tubemind-ki-zusammenfassu/eolnonfjcojjbobmknhhdnnlbdhbalan',

  // Spenden-Link (Ko-fi, Buy Me a Coffee, PayPal.me …)
  donateUrl: 'https://ko-fi.com/chickenlarry',

  // E-Mail für Feedback (Deinstallations-Seite) und Datenschutz-Anfragen
  contactEmail: 'noelschaerer.dev@gmail.com',

  // Dein Name oder Firmenname (für die Datenschutzerklärung)
  ownerName: 'Noel Schärer',

  // Postadresse fürs Impressum (Pflicht nach UWG Art. 3 lit. s), z.B. 'Musterstrasse 1, 8000 Zürich, Schweiz'
  // TODO Noel: eintragen. Solange leer, zeigt das Impressum einen Hinweis statt einer Adresse.
  postalAddress: '',

  // Erst auf true setzen, wenn in AdSense unter "Datenschutz & Mitteilungen" die Einwilligungs-Mitteilung
  // (DSGVO, gilt für EWR, UK und Schweiz) veröffentlicht ist. Vorher lädt keine Werbung.
  adsenseConsentReady: false,

  // Google AdSense: deine Publisher-ID, z.B. "ca-pub-1234567890123456"
  adsenseClient: '',

  // AdSense Anzeigenblock-IDs (in AdSense unter "Anzeigen > Nach Anzeigenblock" erstellen)
  adsenseSlots: {
    welcome: '',
    uninstall: '',
    home: '',
  },
};
