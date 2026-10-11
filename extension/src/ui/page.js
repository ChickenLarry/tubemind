/* TubeMind – helpers for extension pages (popup, side panel, library, options) */
(function (g) {
  const TM = g.TM;
  const { el, uiLang, localizeDom } = TM.utils;

  const YT_RE = /^https:\/\/www\.youtube\.com\//;

  /** A long-lived connection to the content script of one tab. */
  function connect(tabId) {
    const port = g.chrome.tabs.connect(tabId, { name: 'tm-panel' });
    const waiting = new Map();
    const eventHandlers = [];
    const closeHandlers = [];
    let closed = false;

    port.onMessage.addListener((msg) => {
      if (msg && msg.id && waiting.has(msg.id)) {
        const w = waiting.get(msg.id);
        waiting.delete(msg.id);
        clearTimeout(w.timer);
        msg.error ? w.reject(new Error(msg.error)) : w.resolve(msg.result);
      } else if (msg && msg.event) {
        eventHandlers.forEach((fn) => fn(msg.event, msg.data));
      }
    });
    port.onDisconnect.addListener(() => {
      closed = true;
      void g.chrome.runtime.lastError;
      waiting.forEach((w) => w.reject(new Error('disconnected')));
      waiting.clear();
      closeHandlers.forEach((fn) => fn());
    });

    return {
      tabId,
      get closed() {
        return closed;
      },
      rpc(type, args, timeout = 20000) {
        if (closed) return Promise.reject(new Error('disconnected'));
        return new Promise((resolve, reject) => {
          const id = TM.utils.uid();
          const timer = setTimeout(() => {
            waiting.delete(id);
            reject(new Error('timeout'));
          }, timeout);
          waiting.set(id, { resolve, reject, timer });
          try {
            port.postMessage({ id, type, args });
          } catch (e) {
            waiting.delete(id);
            clearTimeout(timer);
            reject(e);
          }
        });
      },
      onEvent: (fn) => eventHandlers.push(fn),
      onClose: (fn) => closeHandlers.push(fn),
      close() {
        closed = true;
        try {
          port.disconnect();
        } catch (e) {
          /* already closed */
        }
      },
    };
  }

  TM.page = {
    async activeTab() {
      const [tab] = await g.chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    },
    isYouTube: (tab) => !!(tab && tab.url && YT_RE.test(tab.url)),
    isWatch: (tab) => !!(tab && tab.url && /^https:\/\/www\.youtube\.com\/watch\?/.test(tab.url)),

    open(page, hash) {
      g.chrome.tabs.create({ url: g.chrome.runtime.getURL(`src/${page}/${page}.html${hash || ''}`) });
    },

    async sendToTab(tabId, type, args) {
      const res = await g.chrome.tabs.sendMessage(tabId, { target: 'content', type, args });
      if (res && res.error) throw new Error(res.error);
      return res ? res.result : undefined;
    },

    connect,

    toast(message, ms = 2000) {
      document.querySelectorAll('.toast-page').forEach((n) => n.remove());
      const node = el('div', { class: 'toast-page', role: 'status' }, message);
      document.body.append(node);
      setTimeout(() => node.remove(), ms);
    },

    init() {
      document.documentElement.lang = uiLang();
      localizeDom(document);
    },
  };
})(globalThis);
