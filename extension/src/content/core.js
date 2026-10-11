/*
 * TubeMind – content core: event bus, module system, YouTube helpers,
 * navigation detection, progress-bar markers and messaging with the side panel.
 *
 * A feature module looks like:
 *   TM.registerModule({
 *     id: 'notes',                 // matches settings.modules.notes
 *     start(), stop(),             // called when the module is switched on/off
 *     onVideo(info),               // new page/video: {videoId, isWatch, isShorts, path}
 *     onMeta(meta),                // title/channel loaded: {id, title, channel, channelId, duration}
 *     onSettings(settings),        // settings changed
 *   });
 */
(function (g) {
  const TM = g.TM;
  const { el, t, sleep } = TM.utils;

  // ---------------------------------------------------------------- state
  TM.state = {
    settings: TM.settings.DEFAULTS,
    videoId: null,
    isWatch: false,
    isShorts: false,
    path: location.pathname,
    meta: null,
    pageTracks: [],
  };

  // ---------------------------------------------------------------- event bus
  const listeners = {};
  TM.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);
  TM.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => safe(() => fn(data)));

  function safe(fn) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch((e) => console.warn('[TubeMind]', e));
    } catch (e) {
      console.warn('[TubeMind]', e);
    }
  }

  // ---------------------------------------------------------------- bridge (MAIN world)
  const pending = new Map();
  document.addEventListener('tubemind:res', (e) => {
    let res;
    try {
      res = JSON.parse(e.detail);
    } catch (err) {
      return;
    }
    const p = res && pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    clearTimeout(p.timer);
    res.error ? p.reject(new Error(res.error)) : p.resolve(res.result);
  });

  TM.bridge = {
    call(type, args, timeout = 1500) {
      return new Promise((resolve, reject) => {
        const id = TM.utils.uid();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('bridge timeout'));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        document.dispatchEvent(new CustomEvent('tubemind:req', { detail: JSON.stringify({ id, type, args }) }));
      });
    },
  };

  // ---------------------------------------------------------------- YouTube helpers
  TM.yt = {
    player: () => document.getElementById('movie_player'),
    video() {
      const p = TM.yt.player();
      return (p && p.querySelector('video.html5-main-video')) || (p && p.querySelector('video')) || null;
    },
    progressBar() {
      const p = TM.yt.player();
      if (!p) return null;
      return p.querySelector('.ytp-progress-bar-container .ytp-progress-bar') || p.querySelector('.ytp-progress-bar');
    },
    isAd: () => !!TM.yt.player()?.classList.contains('ad-showing'),
    currentTime: () => TM.yt.video()?.currentTime || 0,
    duration() {
      const metaDur = TM.state.meta && TM.state.meta.id === TM.state.videoId ? TM.state.meta.duration : 0;
      if (metaDur) return metaDur;
      const v = TM.yt.video();
      return v && Number.isFinite(v.duration) && !TM.yt.isAd() ? v.duration : 0;
    },
    async seek(sec) {
      const tt = Math.max(0, Number(sec) || 0);
      try {
        if (await TM.bridge.call('seekTo', { t: tt })) return;
      } catch (e) {
        /* fall through */
      }
      const v = TM.yt.video();
      if (v) v.currentTime = tt;
    },
    pause: () => TM.yt.video()?.pause(),
    play: () => TM.yt.video()?.play().catch(() => {}),
    isPlaying() {
      const v = TM.yt.video();
      return !!v && !v.paused && !v.ended;
    },
  };

  // ---------------------------------------------------------------- UI helpers
  const SHIELD_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress', 'contextmenu', 'wheel'];

  TM.ui = {
    /** Stop events inside our UI from reaching the YouTube player (no accidental pause/seek). */
    shield(node) {
      SHIELD_EVENTS.forEach((type) => node.addEventListener(type, (e) => e.stopPropagation()));
      return node;
    },

    /** Container inside the player (works in fullscreen too). */
    playerRoot() {
      const p = TM.yt.player();
      if (!p) return null;
      let root = p.querySelector(':scope > .tm-root');
      if (!root) {
        root = TM.ui.shield(el('div', { class: 'tm-root' }));
        p.append(root);
      }
      return root;
    },

    toast(message, ms = 2200) {
      const host = (TM.state.isWatch && TM.ui.playerRoot()) || document.body;
      if (!host) return;
      host.querySelectorAll(':scope > .tm-toast').forEach((n) => n.remove());
      const node = el('div', { class: 'tm-toast', role: 'status' }, message);
      host.append(node);
      requestAnimationFrame(() => node.classList.add('tm-show'));
      setTimeout(() => {
        node.classList.remove('tm-show');
        setTimeout(() => node.remove(), 300);
      }, ms);
    },

    isTyping(e) {
      const target = (e.composedPath && e.composedPath()[0]) || e.target;
      if (!target || !target.tagName) return false;
      return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    },
  };

  // ---------------------------------------------------------------- hotkeys
  const hotkeys = [];
  /** TM.hotkey('n', handler, {shift: false, when: () => true}) */
  TM.hotkey = (key, handler, opts) => hotkeys.push({ key: key.toLowerCase(), handler, opts: opts || {} });

  g.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || TM.ui.isTyping(e)) return;
      const key = (e.key || '').toLowerCase();
      for (const hk of hotkeys) {
        if (hk.key !== key || !!hk.opts.shift !== e.shiftKey) continue;
        if (hk.opts.when && !hk.opts.when()) continue;
        e.preventDefault();
        e.stopPropagation();
        safe(() => hk.handler(e));
        return;
      }
    },
    true
  );

  // ---------------------------------------------------------------- markers on the progress bar
  const markerGroups = {};
  let renderedSignature = '';

  TM.markers = {
    /** list: [{t, cls, title}] */
    set(group, list) {
      markerGroups[group] = list || [];
      renderedSignature = '';
      TM.markers.render();
    },
    clear(group) {
      delete markerGroups[group];
      renderedSignature = '';
      TM.markers.render();
    },
    render() {
      const bar = TM.yt.progressBar();
      const duration = TM.yt.duration();
      const all = Object.values(markerGroups).flat();
      let layer = bar && bar.querySelector(':scope > .tm-markers');
      if (!bar || !TM.state.isWatch) return;
      if (!all.length) {
        if (layer) layer.remove();
        return;
      }
      if (!duration) return;
      const signature = duration + '|' + all.map((m) => m.t + m.cls).join(',');
      if (layer && signature === renderedSignature) return;
      if (!layer) {
        layer = el('div', { class: 'tm-markers', 'aria-hidden': 'true' });
        bar.append(layer);
      }
      layer.replaceChildren(
        ...all
          .filter((m) => m.t >= 0 && m.t <= duration)
          .map((m) =>
            el('div', {
              class: 'tm-marker ' + (m.cls || ''),
              style: { left: (m.t / duration) * 100 + '%' },
              title: m.title || '',
            })
          )
      );
      renderedSignature = signature;
    },
  };

  // Re-attach markers if YouTube re-renders the player.
  setInterval(() => {
    if (!TM.state.isWatch) return;
    const bar = TM.yt.progressBar();
    if (bar && !bar.querySelector(':scope > .tm-markers')) renderedSignature = '';
    TM.markers.render();
  }, 1000);

  // ---------------------------------------------------------------- modules
  const modules = [];
  const active = new Set();
  TM.registerModule = (m) => modules.push(m);
  TM.isModuleOn = (id) => TM.state.settings.modules[id] !== false;

  function syncModules() {
    for (const m of modules) {
      const on = TM.isModuleOn(m.id);
      if (on && !active.has(m.id)) {
        active.add(m.id);
        safe(() => m.start && m.start());
        safe(() => m.onVideo && m.onVideo(currentInfo()));
        if (TM.state.meta) safe(() => m.onMeta && m.onMeta(TM.state.meta));
      } else if (!on && active.has(m.id)) {
        active.delete(m.id);
        safe(() => m.stop && m.stop());
      }
    }
  }

  const forActive = (fn) => modules.filter((m) => active.has(m.id)).forEach((m) => safe(() => fn(m)));

  // ---------------------------------------------------------------- navigation
  function parseLocation() {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    if (path === '/watch' && params.get('v')) return { videoId: params.get('v'), isWatch: true, isShorts: false, path };
    const shorts = path.match(/^\/shorts\/([\w-]{6,})/);
    if (shorts) return { videoId: shorts[1], isWatch: false, isShorts: true, path };
    return { videoId: null, isWatch: false, isShorts: false, path };
  }

  const currentInfo = () => ({
    videoId: TM.state.videoId,
    isWatch: TM.state.isWatch,
    isShorts: TM.state.isShorts,
    path: TM.state.path,
  });

  let lastHref = '';
  function checkNavigation() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    const info = parseLocation();
    const videoChanged = info.videoId !== TM.state.videoId;
    const pathChanged = info.path !== TM.state.path;
    if (!videoChanged && !pathChanged) return;
    Object.assign(TM.state, info);
    if (videoChanged) {
      TM.state.meta = null;
      TM.state.pageTracks = [];
      for (const k of Object.keys(markerGroups)) delete markerGroups[k];
      renderedSignature = '';
      TM.markers.render();
    }
    document.documentElement.classList.toggle('tm-is-watch', info.isWatch);
    forActive((m) => m.onVideo && m.onVideo(currentInfo()));
    TM.emit('video', currentInfo());
    pushToPanels('video', currentInfo());
    if (info.isWatch && videoChanged) loadMeta(info.videoId);
  }

  async function loadMeta(videoId) {
    let info = null;
    const start = Date.now();
    while (Date.now() - start < 10000 && TM.state.videoId === videoId) {
      try {
        const r = await TM.bridge.call('playerInfo');
        if (r && r.videoId === videoId) {
          info = r;
          break;
        }
      } catch (e) {
        /* player not ready yet */
      }
      await sleep(400);
    }
    if (TM.state.videoId !== videoId) return;
    const meta = info
      ? { id: videoId, title: info.title, channel: info.channel, channelId: info.channelId, duration: info.duration, isLive: info.isLive }
      : domMeta(videoId);
    TM.state.meta = meta;
    TM.state.pageTracks = (info && info.tracks) || [];
    renderedSignature = '';
    TM.markers.render();
    forActive((m) => m.onMeta && m.onMeta(meta));
    TM.emit('meta', meta);
    pushToPanels('meta', meta);
  }

  function domMeta(videoId) {
    const title = document.querySelector('ytd-watch-metadata h1')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
    const channelLink = document.querySelector('ytd-watch-metadata ytd-channel-name a');
    return {
      id: videoId,
      title,
      channel: channelLink?.textContent?.trim() || '',
      channelId: channelLink?.getAttribute('href') || '',
      duration: TM.yt.video()?.duration || 0,
    };
  }

  // ---------------------------------------------------------------- messaging with extension pages
  const handlers = {};
  const ports = new Set();
  /** Register an RPC handler callable from the side panel / popup. */
  TM.handle = (type, fn) => (handlers[type] = fn);

  async function dispatch(msg) {
    const fn = msg && handlers[msg.type];
    if (!fn) throw new Error('unknown request: ' + (msg && msg.type));
    return fn(msg.args || {});
  }

  function pushToPanels(event, data) {
    for (const port of ports) {
      try {
        port.postMessage({ event, data });
      } catch (e) {
        ports.delete(port);
      }
    }
  }
  TM.pushToPanels = pushToPanels;
  TM.hasPanels = () => ports.size > 0;

  /** Ask the service worker to open the side panel for this tab. */
  TM.openSidePanel = function () {
    if (!TM.alive()) return;
    g.chrome.runtime
      .sendMessage({ type: 'openSidePanel' })
      .then((res) => {
        if (!res || !res.ok) TM.ui.toast(t('sidePanelHint'), 4000);
      })
      .catch(() => TM.ui.toast(t('sidePanelHint'), 4000));
  };

  g.chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'tm-panel') return;
    ports.add(port);
    port.onDisconnect.addListener(() => {
      ports.delete(port);
      TM.emit('panelDisconnected');
    });
    port.onMessage.addListener(async (msg) => {
      try {
        port.postMessage({ id: msg.id, result: await dispatch(msg) });
      } catch (e) {
        try {
          port.postMessage({ id: msg.id, error: String(e.message || e) });
        } catch (err) {
          /* port closed */
        }
      }
    });
  });

  g.chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return false;
    dispatch(msg)
      .then((result) => sendResponse({ result }))
      .catch((e) => sendResponse({ error: String(e.message || e) }));
    return true;
  });

  TM.handle('getState', () => ({
    ...currentInfo(),
    meta: TM.state.meta,
    currentTime: TM.yt.currentTime(),
    duration: TM.yt.duration(),
    playing: TM.yt.isPlaying(),
  }));
  TM.handle('seek', async ({ t: sec }) => {
    await TM.yt.seek(sec);
    return true;
  });

  // Live playback position for the side panel (only while a panel is connected).
  setInterval(() => {
    if (!ports.size || !TM.state.isWatch) return;
    pushToPanels('time', { t: TM.yt.currentTime(), playing: TM.yt.isPlaying(), videoId: TM.state.videoId });
  }, 1000);

  // ---------------------------------------------------------------- boot
  /** false once the extension was reloaded/updated (old content script is orphaned). */
  TM.alive = () => !!(g.chrome && g.chrome.runtime && g.chrome.runtime.id);

  TM.boot = async function () {
    try {
      TM.state.settings = await TM.settings.get();
    } catch (e) {
      /* extension context invalidated – keep defaults */
    }
    TM.settings.onChange((s) => {
      TM.state.settings = s;
      syncModules();
      forActive((m) => m.onSettings && m.onSettings(s));
      TM.emit('settings', s);
    });

    TM.state.path = null; // force the first navigation check
    checkNavigation();
    syncModules();
    forActive((m) => m.onSettings && m.onSettings(TM.state.settings));

    document.addEventListener('yt-navigate-finish', checkNavigation);
    g.addEventListener('popstate', checkNavigation);
    setInterval(() => TM.alive() && checkNavigation(), 800);

    ['loadedmetadata', 'durationchange'].forEach((type) =>
      document.addEventListener(
        type,
        () => {
          renderedSignature = '';
          TM.markers.render();
        },
        true
      )
    );
  };
})(globalThis);
