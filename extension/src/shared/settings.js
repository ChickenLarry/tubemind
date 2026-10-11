/* TubeMind – settings with defaults, stored in chrome.storage.local under "settings" */
(function (g) {
  const TM = (g.TM = g.TM || {});

  const DEFAULTS = {
    // Feature modules – each can be switched off in the options page.
    modules: {
      search: true,
      summary: true,
      notes: true,
      focus: true,
      player: true,
      stats: true,
    },
    focus: {
      enabled: false,
      hideShorts: true,
      hideHomeFeed: true,
      hideRelated: false,
      hideComments: false,
      hideEndscreen: true,
      redirectShorts: false,
    },
    search: {
      showMarkers: true,
    },
    notes: {
      pauseOnNote: true,
      showMarkers: true,
    },
    player: {
      rememberChannelSpeed: true,
      speedKeys: true,
      speedStep: 0.25,
      maxSpeed: 4,
      autoTheater: false,
      preferredQuality: 'auto',
    },
    stats: {
      dailyLimitMin: 0,
    },
    summary: {
      length: 'medium',
    },
    onboardingShown: false,
  };

  const KEY = 'settings';

  function isObj(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function merge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (!isObj(patch)) return out;
    for (const [k, v] of Object.entries(patch)) {
      out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
    }
    return out;
  }

  async function get() {
    const res = await g.chrome.storage.local.get(KEY);
    return merge(DEFAULTS, res[KEY] || {});
  }

  /** Deep-merge a partial patch, e.g. set({focus: {enabled: true}}). */
  async function set(patch) {
    const res = await g.chrome.storage.local.get(KEY);
    const next = merge(res[KEY] || {}, patch);
    await g.chrome.storage.local.set({ [KEY]: next });
    return merge(DEFAULTS, next);
  }

  async function reset() {
    await g.chrome.storage.local.remove(KEY);
    return merge(DEFAULTS, {});
  }

  /** Call cb(settings) whenever settings change anywhere. Returns unsubscribe fn. */
  function onChange(cb) {
    const listener = (changes, area) => {
      if (area !== 'local' || !changes[KEY]) return;
      cb(merge(DEFAULTS, changes[KEY].newValue || {}));
    };
    g.chrome.storage.onChanged.addListener(listener);
    return () => g.chrome.storage.onChanged.removeListener(listener);
  }

  TM.settings = { DEFAULTS, get, set, reset, onChange, merge };
})(globalThis);
