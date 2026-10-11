/* TubeMind – player comfort: speed per channel, speed keys up to 4x, auto theater, preferred quality */
(function (g) {
  const TM = g.TM;
  const { el, clamp, waitFor } = TM.utils;

  let speeds = {};
  let videoStartedAt = 0;
  let expected = null; // {rate, at} – rate change we caused ourselves
  let badgeTimer = 0;
  let theaterDoneFor = null;

  const cfg = () => TM.state.settings.player;
  const active = () => TM.isModuleOn('player');

  function showBadge(text) {
    const root = TM.ui.playerRoot();
    if (!root) return;
    let badge = root.querySelector('.tm-speed-badge');
    if (!badge) {
      badge = el('div', { class: 'tm-speed-badge' });
      root.append(badge);
    }
    badge.textContent = text;
    badge.classList.add('tm-show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.classList.remove('tm-show'), 900);
  }

  function setRate(rate, opts) {
    const v = TM.yt.video();
    if (!v) return;
    rate = Math.round(clamp(rate, 0.25, cfg().maxSpeed || 4) * 100) / 100;
    expected = { rate, at: Date.now() };
    v.playbackRate = rate;
    if (opts && opts.badge) showBadge(rate + '×');
    if (opts && opts.save) saveForChannel(rate);
  }

  function saveForChannel(rate) {
    const meta = TM.state.meta;
    if (!cfg().rememberChannelSpeed || !meta || !meta.channelId) return;
    if (rate === 1) delete speeds[meta.channelId];
    else speeds[meta.channelId] = rate;
    TM.store.setChannelSpeed(meta.channelId, rate).catch(() => {});
  }

  function onRateChange(e) {
    if (!active() || e.target !== TM.yt.video()) return;
    const rate = e.target.playbackRate;
    if (expected && Math.abs(expected.rate - rate) < 0.001 && Date.now() - expected.at < 1500) return;
    // Ignore the player restoring its rate right after a video switch.
    if (Date.now() - videoStartedAt < 2500) return;
    saveForChannel(rate);
  }

  function step(dir) {
    const v = TM.yt.video();
    if (!v) return;
    setRate(v.playbackRate + dir * (cfg().speedStep || 0.25), { badge: true, save: true });
  }

  async function autoTheater(videoId) {
    if (!cfg().autoTheater || theaterDoneFor === videoId) return;
    theaterDoneFor = videoId;
    const flexy = await waitFor(() => document.querySelector('ytd-watch-flexy'), 6000);
    if (!flexy || flexy.hasAttribute('theater') || document.fullscreenElement) return;
    const btn = await waitFor(() => document.querySelector('#movie_player .ytp-size-button'), 6000);
    if (btn && !flexy.hasAttribute('theater')) btn.click();
  }

  async function applyQuality() {
    const q = cfg().preferredQuality;
    if (!q || q === 'auto') return;
    for (let i = 0; i < 4; i++) {
      await TM.utils.sleep(1200);
      try {
        if (await TM.bridge.call('setQuality', { quality: q })) return;
      } catch (e) {
        /* player not ready */
      }
    }
  }

  const whenOn = () => active() && cfg().speedKeys && TM.state.isWatch;
  TM.hotkey('d', () => step(+1), { when: whenOn });
  TM.hotkey('a', () => step(-1), { when: whenOn });
  TM.hotkey('r', () => setRate(1, { badge: true, save: true }), { when: whenOn });

  document.addEventListener('ratechange', onRateChange, true);

  TM.registerModule({
    id: 'player',
    async start() {
      speeds = await TM.store.getChannelSpeeds().catch(() => ({}));
    },
    onVideo(info) {
      videoStartedAt = Date.now();
      if (info.isWatch) autoTheater(info.videoId);
    },
    onMeta(meta) {
      if (cfg().rememberChannelSpeed && meta.channelId && speeds[meta.channelId]) {
        const rate = speeds[meta.channelId];
        // Apply now and once more after YouTube finished its own setup.
        setRate(rate);
        setTimeout(() => TM.state.meta === meta && setRate(rate, { badge: rate !== 1 }), 1200);
      }
      applyQuality();
    },
  });

  TM.handle('getSpeed', () => TM.yt.video()?.playbackRate || 1);
  TM.handle('setSpeed', ({ rate }) => {
    setRate(rate, { badge: true, save: true });
    return true;
  });
})(globalThis);
