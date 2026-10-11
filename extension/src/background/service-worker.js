/* TubeMind – background service worker */
importScripts('../shared/config.js', '../shared/utils.js', '../shared/settings.js', '../shared/store.js');

const TM = self.TM;

// Toolbar icon opens the popup; the side panel is opened from there or from the player.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

function uninstallUrl() {
  if (!TM.isConfigured(TM.config.uninstallUrl)) return '';
  const u = new URL(TM.config.uninstallUrl);
  u.searchParams.set('v', chrome.runtime.getManifest().version);
  u.searchParams.set('lang', TM.utils.uiLang());
  return u.toString();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const url = uninstallUrl();
  if (url) chrome.runtime.setUninstallURL(url).catch(() => {});

  if (details.reason === 'install') {
    await TM.store.setUsage({ installDate: Date.now() });
    if (TM.isConfigured(TM.config.welcomeUrl)) {
      const u = new URL(TM.config.welcomeUrl);
      u.searchParams.set('lang', TM.utils.uiLang());
      chrome.tabs.create({ url: u.toString() });
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#welcome') });
    }
  }
});

chrome.runtime.onStartup.addListener(() => {
  const url = uninstallUrl();
  if (url) chrome.runtime.setUninstallURL(url).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'content') return false;

  switch (msg.type) {
    case 'openSidePanel': {
      // Must be called synchronously inside the user gesture – no await before this line.
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) {
        sendResponse({ ok: false });
        return false;
      }
      chrome.sidePanel
        .open({ tabId })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    case 'openPage': {
      const allowed = ['library', 'options'];
      if (!allowed.includes(msg.page)) return false;
      chrome.tabs.create({ url: chrome.runtime.getURL(`src/${msg.page}/${msg.page}.html${msg.hash || ''}`) });
      sendResponse({ ok: true });
      return false;
    }
    default:
      return false;
  }
});
