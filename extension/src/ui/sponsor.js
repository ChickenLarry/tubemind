/*
 * TubeMind – sponsor card (only ever shown inside the extension's own pages, never on YouTube).
 * The list of sponsors is a plain JSON file on your website (see website/sponsor.json).
 * No remote code is loaded and nothing about the user is sent anywhere.
 */
(function (g) {
  const TM = g.TM;
  const { el, t, uiLang, pickLocalized, dayKey } = TM.utils;
  const CACHE_KEY = 'sponsorCache';

  async function loadFeed() {
    const url = TM.config.sponsorFeedUrl;
    if (!TM.isConfigured(url)) return null;
    const res = await g.chrome.storage.local.get(CACHE_KEY);
    const cache = res[CACHE_KEY];
    const maxAge = (TM.config.sponsorRefreshHours || 6) * 3600000;
    if (cache && Date.now() - cache.fetchedAt < maxAge) return cache.data;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-cache', credentials: 'omit' });
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      await g.chrome.storage.local.set({ [CACHE_KEY]: { fetchedAt: Date.now(), data } });
      return data;
    } catch (e) {
      return cache ? cache.data : null;
    }
  }

  function isValid(item, placement, lang) {
    if (!item || item.active === false) return false;
    if (typeof item.url !== 'string' || !/^https:\/\//.test(item.url)) return false;
    if (!pickLocalized(item.title, lang)) return false;
    if (Array.isArray(item.placements) && !item.placements.includes(placement)) return false;
    if (Array.isArray(item.locales) && !item.locales.includes(lang) && !item.locales.includes('*')) return false;
    const today = dayKey();
    if (item.start && today < item.start) return false;
    if (item.end && today > item.end) return false;
    return true;
  }

  function pickWeighted(items) {
    const total = items.reduce((sum, i) => sum + Math.max(0, Number(i.weight) || 1), 0);
    let r = Math.random() * total;
    for (const i of items) {
      r -= Math.max(0, Number(i.weight) || 1);
      if (r <= 0) return i;
    }
    return items[0];
  }

  /** Our own "house ads" when no sponsor is booked: donations and reviews. */
  function houseItems() {
    const items = [];
    if (TM.isConfigured(TM.config.donateUrl)) {
      items.push({
        house: true,
        emoji: '❤️',
        title: t('houseDonateTitle'),
        text: t('houseDonateText'),
        cta: t('houseDonateCta'),
        url: TM.config.donateUrl,
      });
    }
    items.push({
      house: true,
      kind: 'rate',
      emoji: '⭐',
      title: t('houseRateTitle'),
      text: t('houseRateText'),
      cta: t('houseRateCta'),
      url: TM.config.reviewUrl,
    });
    return items;
  }

  function withTracking(url, item, placement) {
    if (item.house || item.utm === false) return url;
    try {
      const u = new URL(url);
      if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'tubemind');
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'extension');
      if (item.id && !u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', String(item.id));
      if (!u.searchParams.has('utm_content')) u.searchParams.set('utm_content', placement);
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  /**
   * Render one sponsor card into container.
   * placement: 'popup' | 'sidepanel' | 'library'; opts.skipRate: don't use the "rate us" house ad
   */
  async function render(container, placement, opts) {
    if (!container) return;
    const lang = uiLang();
    let data = null;
    try {
      data = await loadFeed();
    } catch (e) {
      data = null;
    }
    const booked = (data && Array.isArray(data.items) ? data.items : []).filter((i) => isValid(i, placement, lang));
    const house = houseItems().filter((i) => !(opts && opts.skipRate && i.kind === 'rate'));
    const pool = booked.length ? booked : house;
    if (!pool.length) {
      container.replaceChildren();
      return;
    }
    const item = pickWeighted(pool);

    const image =
      !item.house && typeof item.image === 'string' && /^https:\/\//.test(item.image)
        ? el('img', { class: 'sponsor-img', src: item.image, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' })
        : el('div', { class: 'sponsor-emoji', 'aria-hidden': 'true' }, typeof item.emoji === 'string' ? item.emoji : '✨');

    const card = el(
      'a',
      {
        class: 'sponsor',
        href: withTracking(item.url, item, placement),
        target: '_blank',
        rel: item.house ? 'noopener' : 'noopener sponsored',
      },
      [
        image,
        el('div', { class: 'sponsor-body' }, [
          el('div', { class: 'sponsor-label' }, item.house ? 'TubeMind' : t('sponsorLabel')),
          el('div', { class: 'sponsor-title' }, item.house ? item.title : pickLocalized(item.title, lang)),
          (item.house ? item.text : pickLocalized(item.text, lang))
            ? el('div', { class: 'sponsor-text' }, item.house ? item.text : pickLocalized(item.text, lang))
            : null,
        ]),
        el('div', { class: 'sponsor-cta' }, (item.house ? item.cta : pickLocalized(item.cta, lang)) || '→'),
      ]
    );
    container.replaceChildren(card);
  }

  TM.sponsor = { render, _isValid: isValid };
})(globalThis);
