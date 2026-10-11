/* TubeMind – watch-time statistics (local only) and the optional daily time budget */
(function (g) {
  const TM = g.TM;
  const { el, t, dayKey, formatDuration } = TM.utils;

  const lastTick = new WeakMap(); // video element -> performance.now()
  const pending = new Map(); // "shorts|channel" -> seconds
  let overlay = null;

  const active = () => TM.isModuleOn('stats');

  function isMainVideo(v) {
    if (TM.state.isShorts) return !!v.closest('ytd-reel-video-renderer, ytd-shorts, #shorts-player');
    return !!v.closest('#movie_player');
  }

  function onTimeUpdate(e) {
    const v = e.target;
    if (!active() || !(v instanceof HTMLVideoElement) || !isMainVideo(v)) return;
    const now = performance.now();
    if (v.paused || v.ended) {
      lastTick.delete(v);
      return;
    }
    const prev = lastTick.get(v);
    lastTick.set(v, now);
    if (!prev) return;
    const dt = (now - prev) / 1000;
    if (dt <= 0 || dt > 3) return;
    const shorts = TM.state.isShorts;
    const channel = shorts ? '' : (TM.state.meta && TM.state.meta.channel) || '';
    const key = (shorts ? '1' : '0') + '|' + channel;
    pending.set(key, (pending.get(key) || 0) + dt);
  }

  async function flush() {
    if (!pending.size || !TM.alive()) return;
    const batch = [...pending.entries()];
    pending.clear();
    for (const [key, sec] of batch) {
      const [shorts, channel] = [key[0] === '1', key.slice(2)];
      await TM.store.addWatch(Math.round(sec * 10) / 10, { shorts, channel }).catch(() => {});
    }
    checkLimit();
  }

  // ---------------------------------------------------------- daily budget
  async function checkLimit() {
    const limitMin = Number(TM.state.settings.stats.dailyLimitMin) || 0;
    if (!limitMin || overlay) return;
    const [stats, res] = await Promise.all([TM.store.getStats(), g.chrome.storage.local.get('limitState')]);
    const today = stats[dayKey()];
    const watched = today ? today.w : 0;
    if (watched < limitMin * 60) return;
    const state = res.limitState || {};
    if (state.day === dayKey() && (state.dismissed || (state.snoozeUntil || 0) > Date.now())) return;
    showLimitOverlay(watched, limitMin);
  }

  function setLimitState(patch) {
    return g.chrome.storage.local.set({ limitState: { day: dayKey(), ...patch } });
  }

  function showLimitOverlay(watchedSec, limitMin) {
    const wasPlaying = TM.yt.isPlaying();
    TM.yt.pause();
    document.querySelectorAll('video').forEach((v) => !v.paused && v.pause());
    const close = () => {
      overlay && overlay.remove();
      overlay = null;
    };
    overlay = TM.ui.shield(
      el('div', { class: 'tm-limit', role: 'dialog', 'aria-modal': 'true' }, [
        el('div', { class: 'tm-limit-card' }, [
          el('div', { class: 'tm-limit-icon' }, '⏳'),
          el('h2', {}, t('limitTitle')),
          el('p', {}, t('limitText', [formatDuration(watchedSec), formatDuration(limitMin * 60)])),
          el('div', { class: 'tm-limit-actions' }, [
            el('button', { class: 'tm-btn tm-btn-primary', onclick: close }, t('limitBreak')),
            el(
              'button',
              {
                class: 'tm-btn',
                onclick: () => {
                  setLimitState({ snoozeUntil: Date.now() + 10 * 60000 });
                  close();
                  if (wasPlaying) TM.yt.play();
                },
              },
              t('limitSnooze')
            ),
            el(
              'button',
              {
                class: 'tm-btn tm-btn-ghost',
                onclick: () => {
                  setLimitState({ dismissed: true });
                  close();
                  if (wasPlaying) TM.yt.play();
                },
              },
              t('limitDismiss')
            ),
          ]),
        ]),
      ])
    );
    document.body.append(overlay);
  }

  document.addEventListener('timeupdate', onTimeUpdate, true);
  setInterval(flush, 15000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  g.addEventListener('pagehide', flush);

  TM.registerModule({
    id: 'stats',
    start: checkLimit,
    stop() {
      pending.clear();
      if (overlay) overlay.remove();
      overlay = null;
    },
    onVideo: () => flush(),
  });
})(globalThis);
