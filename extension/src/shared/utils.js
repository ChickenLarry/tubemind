/* TubeMind – shared helpers (content scripts, extension pages, service worker) */
(function (g) {
  const TM = (g.TM = g.TM || {});

  /** Translate a message key from _locales. */
  function t(key, subs) {
    try {
      const msg = g.chrome?.i18n?.getMessage(key, subs);
      return msg || key;
    } catch (e) {
      return key;
    }
  }

  /** UI language as 2-letter code (en, de, fr, it, …). */
  function uiLang() {
    try {
      return (g.chrome?.i18n?.getUILanguage() || 'en').slice(0, 2).toLowerCase();
    } catch (e) {
      return 'en';
    }
  }

  /** Fill elements with data-i18n / data-i18n-placeholder / data-i18n-title. */
  function localizeDom(root) {
    root = root || g.document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.dataset.i18nTitle));
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(el.dataset.i18nTitle));
    });
  }

  /** 75 -> "1:15", 3725 -> "1:02:05" */
  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /** 4210 sec -> "1 h 10 min", 300 -> "5 min", 20 -> "0 min" */
  function formatDuration(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} h ${m} min`;
    return `${m} min`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function throttle(fn, ms) {
    let last = 0;
    let timer;
    return function (...args) {
      const now = Date.now();
      const remaining = ms - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  /** Lowercase + strip accents, keeping a 1:1 char length mapping. */
  function normalizeForSearch(str) {
    let out = '';
    for (const ch of String(str)) {
      let n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (n.length !== ch.length) n = n.length > ch.length ? n.slice(0, ch.length) : n.padEnd(ch.length, ' ');
      out += n;
    }
    return out;
  }

  /** Local date key "YYYY-MM-DD". */
  function dayKey(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Tiny DOM builder: el('div', {class: 'x', onclick: fn}, ['text', child]) */
  function el(tag, attrs, children) {
    const node = g.document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) {
      for (const c of [].concat(children)) {
        if (c == null || c === false) continue;
        node.append(c instanceof g.Node ? c : g.document.createTextNode(String(c)));
      }
    }
    return node;
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = g.document.createElement('a');
    a.href = url;
    a.download = filename;
    g.document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try {
      await g.navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = g.document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      g.document.body.append(ta);
      ta.select();
      const ok = g.document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  /** Very small, safe markdown renderer (bullets, **bold**, *italic*, paragraphs). */
  function renderMarkdownLite(md) {
    const lines = String(md || '').split(/\r?\n/);
    let html = '';
    let inList = false;
    const inline = (s) =>
      escapeHtml(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
    for (const raw of lines) {
      const line = raw.trim();
      const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (bullet) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${inline(bullet[1])}</li>`;
        continue;
      }
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      if (!line) continue;
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      html += heading ? `<p><strong>${inline(heading[1])}</strong></p>` : `<p>${inline(line)}</p>`;
    }
    if (inList) html += '</ul>';
    return html;
  }

  /** Resolve when fn() returns truthy (polling), or null after timeout. */
  async function waitFor(fn, timeout = 10000, interval = 200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {
        /* ignore */
      }
      await sleep(interval);
    }
    return null;
  }

  function videoUrl(videoId, t) {
    const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    return t ? `${base}&t=${Math.floor(t)}s` : base;
  }

  function thumbUrl(videoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
  }

  /** Localized value: string or {en, de, …} object. */
  function pickLocalized(value, lang) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return value[lang] || value.en || Object.values(value)[0] || '';
  }

  TM.utils = {
    t,
    uiLang,
    localizeDom,
    formatTime,
    formatDuration,
    escapeHtml,
    debounce,
    throttle,
    sleep,
    clamp,
    normalizeForSearch,
    dayKey,
    uid,
    el,
    downloadText,
    copyText,
    renderMarkdownLite,
    waitFor,
    videoUrl,
    thumbUrl,
    pickLocalized,
  };
  TM.t = t;
})(globalThis);
