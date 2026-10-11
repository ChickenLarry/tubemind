/* TubeMind website – language switching, links from site-config.js and optional AdSense slots */
(function () {
  const cfg = window.SITE_CONFIG || {};
  const T = window.SITE_TEXT || {};
  const SUPPORTED = ['en', 'de', 'fr', 'it'];

  const params = new URLSearchParams(location.search);
  const wanted = (params.get('lang') || navigator.language || 'en').slice(0, 2).toLowerCase();
  const lang = SUPPORTED.includes(wanted) ? wanted : 'en';
  document.documentElement.lang = lang;

  const text = (key) => (T[key] && (T[key][lang] || T[key].en)) || '';

  // texts
  document.querySelectorAll('[data-t]').forEach((el) => {
    const v = text(el.dataset.t);
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-t-html]').forEach((el) => {
    const v = text(el.dataset.tHtml);
    if (v) el.innerHTML = v; // texts come from our own file only
  });
  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.hidden = el.dataset.lang !== lang && !(el.dataset.lang === 'en' && !document.querySelector(`[data-lang="${lang}"]`));
  });

  // language switcher
  document.querySelectorAll('.lang-switch a').forEach((a) => {
    const u = new URL(location.href);
    u.searchParams.set('lang', a.dataset.setLang);
    a.href = u.toString();
    a.classList.toggle('active', a.dataset.setLang === lang);
  });

  // configured links
  const setLink = (selector, url) =>
    document.querySelectorAll(selector).forEach((a) => {
      if (url) a.href = url;
      else a.hidden = true;
    });
  setLink('[data-link="store"]', cfg.storeUrl);
  setLink('[data-link="donate"]', cfg.donateUrl);
  setLink('[data-link="mail"]', cfg.contactEmail ? 'mailto:' + cfg.contactEmail : '');
  document.querySelectorAll('[data-owner]').forEach((el) => (el.textContent = cfg.ownerName || '—'));
  document.querySelectorAll('[data-email]').forEach((el) => (el.textContent = cfg.contactEmail || '—'));

  // AdSense (only if configured). Never place ads inside the extension itself – only on these web pages.
  const slots = document.querySelectorAll('.ad-slot[data-slot]');
  if (cfg.adsenseClient && slots.length) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.adsenseClient);
    s.crossOrigin = 'anonymous';
    document.head.append(s);
    slots.forEach((slot) => {
      const id = cfg.adsenseSlots && cfg.adsenseSlots[slot.dataset.slot];
      if (!id) {
        slot.remove();
        return;
      }
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.dataset.adClient = cfg.adsenseClient;
      ins.dataset.adSlot = id;
      ins.dataset.adFormat = 'auto';
      ins.dataset.fullWidthResponsive = 'true';
      slot.append(ins);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  } else {
    slots.forEach((slot) => slot.remove());
  }

  window.SITE = { lang, text, cfg };
})();
