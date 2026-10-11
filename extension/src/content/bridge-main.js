/*
 * TubeMind – page bridge (runs in YouTube's MAIN world).
 * Gives the isolated content script read access to the YouTube player API.
 * Only answers fixed, read-mostly requests; never executes received code.
 */
(() => {
  if (window.__tubemindBridge) return;
  window.__tubemindBridge = true;

  const player = () => document.getElementById('movie_player');
  const text = (v) => (v && (v.simpleText || (v.runs || []).map((r) => r.text).join(''))) || '';

  const QUALITY_ORDER = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];

  const handlers = {
    playerInfo() {
      const p = player();
      const r = p && typeof p.getPlayerResponse === 'function' ? p.getPlayerResponse() : null;
      if (!r || !r.videoDetails) return null;
      const d = r.videoDetails;
      const tracks = r.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      return {
        videoId: d.videoId,
        title: d.title || '',
        channel: d.author || '',
        channelId: d.channelId || '',
        duration: Number(d.lengthSeconds) || 0,
        isLive: !!d.isLiveContent && !!d.isLive,
        tracks: tracks.map((t) => ({
          baseUrl: t.baseUrl,
          languageCode: t.languageCode,
          kind: t.kind || '',
          name: text(t.name),
        })),
      };
    },

    /** Caption URLs the player itself requested (they carry a valid "pot" token). */
    timedtextUrls() {
      return performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('/api/timedtext'));
    },

    seekTo(args) {
      const p = player();
      const t = Number(args && args.t);
      if (!p || typeof p.seekTo !== 'function' || !Number.isFinite(t)) return false;
      p.seekTo(Math.max(0, t), true);
      return true;
    },

    setQuality(args) {
      const p = player();
      if (!p || typeof p.getAvailableQualityLevels !== 'function') return false;
      const wanted = String(args && args.quality);
      const available = p.getAvailableQualityLevels() || [];
      const startIdx = QUALITY_ORDER.indexOf(wanted);
      if (startIdx < 0) return false;
      const pick = QUALITY_ORDER.slice(startIdx).find((q) => available.includes(q));
      if (!pick) return false;
      if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(pick, pick);
      if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(pick);
      return pick;
    },
  };

  document.addEventListener('tubemind:req', (e) => {
    let req;
    try {
      req = JSON.parse(e.detail);
    } catch (err) {
      return;
    }
    if (!req || typeof req.id !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, req.type)) return;
    let result = null;
    let error = null;
    try {
      result = handlers[req.type](req.args);
    } catch (err) {
      error = String((err && err.message) || err);
    }
    document.dispatchEvent(
      new CustomEvent('tubemind:res', { detail: JSON.stringify({ id: req.id, result, error }) })
    );
  });
})();
