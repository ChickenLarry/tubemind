/*
 * TubeMind – transcript loader.
 *
 * YouTube changes its internals regularly, so we try three methods in order:
 *   1. InnerTube "player" request with the ANDROID client  -> caption track URLs that work without a token
 *   2. Caption URLs the page player already requested       -> they carry YouTube's own "pot" token
 *   3. Reading the transcript panel in the page DOM          -> slow, last resort
 *
 * Result: { videoId, lang, langName, kind, tracks: [{languageCode, kind, name}], segments: [{s, d, text}], source }
 */
(function (g) {
  const TM = g.TM;
  const { waitFor } = TM.utils;

  const ANDROID_CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 };
  const trackCache = new Map(); // videoId -> Promise<tracks[]>
  const resultCache = new Map(); // videoId|lang -> Promise<result>

  // ------------------------------------------------------------ parsing
  function parseJson3(json) {
    const out = [];
    for (const ev of (json && json.events) || []) {
      if (!ev.segs) continue;
      const text = ev.segs
        .map((s) => s.utf8 || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      out.push({ s: (ev.tStartMs || 0) / 1000, d: (ev.dDurationMs || 0) / 1000, text });
    }
    return out;
  }

  function parseXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const out = [];
    // format 1: <text start="1.2" dur="3">…</text>
    doc.querySelectorAll('text').forEach((n) => {
      const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) out.push({ s: parseFloat(n.getAttribute('start')) || 0, d: parseFloat(n.getAttribute('dur')) || 0, text });
    });
    if (out.length) return out;
    // format 3: <p t="1200" d="3000">…</p>
    doc.querySelectorAll('p').forEach((n) => {
      const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) out.push({ s: (parseInt(n.getAttribute('t'), 10) || 0) / 1000, d: (parseInt(n.getAttribute('d'), 10) || 0) / 1000, text });
    });
    return out;
  }

  function parseCaptionBody(body) {
    const trimmed = (body || '').trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('<')) return parseXml(trimmed);
    try {
      return parseJson3(JSON.parse(trimmed));
    } catch (e) {
      return [];
    }
  }

  async function fetchCaptionUrl(url, credentials) {
    const u = new URL(url, location.origin);
    u.searchParams.set('fmt', 'json3');
    const res = await fetch(u.toString(), { credentials: credentials || 'omit' });
    if (!res.ok) throw new Error('caption http ' + res.status);
    return parseCaptionBody(await res.text());
  }

  // ------------------------------------------------------------ tracks
  async function androidTracks(videoId) {
    const hl = (document.documentElement.lang || 'en').slice(0, 2);
    for (const credentials of ['omit', 'include']) {
      try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          credentials,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: { client: { ...ANDROID_CLIENT, hl, gl: 'US' } },
            videoId,
            contentCheckOk: true,
            racyCheckOk: true,
          }),
        });
        if (!res.ok) continue;
        const json = await res.json();
        const list = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const tracks = list
          .filter((tr) => tr.baseUrl)
          .map((tr) => ({
            baseUrl: tr.baseUrl,
            languageCode: tr.languageCode,
            kind: tr.kind || '',
            name: tr.name?.simpleText || (tr.name?.runs || []).map((r) => r.text).join('') || tr.languageCode,
            source: 'android',
          }));
        if (tracks.length) return tracks;
      } catch (e) {
        /* try next */
      }
    }
    return [];
  }

  async function pageTracks(videoId) {
    let tracks = TM.state.videoId === videoId ? TM.state.pageTracks : [];
    if (!tracks || !tracks.length) {
      try {
        const info = await TM.bridge.call('playerInfo');
        if (info && info.videoId === videoId) tracks = info.tracks || [];
      } catch (e) {
        tracks = [];
      }
    }
    return (tracks || []).map((tr) => ({ ...tr, source: 'page' }));
  }

  function getTracks(videoId) {
    if (!trackCache.has(videoId)) {
      const p = (async () => {
        const a = await androidTracks(videoId);
        return a.length ? a : pageTracks(videoId);
      })();
      trackCache.set(videoId, p);
      p.then((tracks) => !tracks.length && trackCache.delete(videoId)).catch(() => trackCache.delete(videoId));
    }
    return trackCache.get(videoId);
  }

  /** Prefer: requested language > manual track in UI language > original language > anything. */
  function pickTrack(tracks, preferred) {
    if (!tracks.length) return null;
    const base = (code) => String(code || '').slice(0, 2).toLowerCase();
    const manual = tracks.filter((x) => x.kind !== 'asr');
    const auto = tracks.filter((x) => x.kind === 'asr');
    if (preferred) {
      const exact = tracks.filter((x) => x.languageCode === preferred || x.languageCode + ':' + x.kind === preferred);
      if (exact.length) return exact.find((x) => x.kind !== 'asr') || exact[0];
    }
    const ui = TM.utils.uiLang();
    const original = auto.length ? base(auto[0].languageCode) : null;
    return (
      manual.find((x) => base(x.languageCode) === ui) ||
      (original && manual.find((x) => base(x.languageCode) === original)) ||
      auto[0] ||
      manual[0]
    );
  }

  // ------------------------------------------------------------ strategy 2: token URL from the page player
  async function fromPlayerRequests(videoId, track) {
    let urls = [];
    try {
      urls = (await TM.bridge.call('timedtextUrls')) || [];
    } catch (e) {
      return [];
    }
    const match = urls.reverse().find((u) => u.includes('v=' + videoId) && u.includes('pot='));
    if (!match) return [];
    const u = new URL(match);
    if (track) {
      u.searchParams.set('lang', track.languageCode);
      if (track.kind === 'asr') u.searchParams.set('kind', 'asr');
      else u.searchParams.delete('kind');
    }
    u.searchParams.delete('tlang');
    return fetchCaptionUrl(u.toString(), 'include');
  }

  // ------------------------------------------------------------ strategy 3: transcript panel in the DOM
  const TIME_RE = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
  const toSec = (str) => str.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);

  async function fromDomPanel(videoId) {
    if (TM.state.videoId !== videoId || !TM.state.isWatch) return [];
    const findButton = () =>
      document.querySelector('ytd-video-description-transcript-section-renderer button') ||
      document.querySelector('button[aria-label*="ranscript" i]');
    let btn = findButton();
    if (!btn) {
      document.querySelector('ytd-watch-metadata #description-inline-expander #expand, ytd-text-inline-expander #expand')?.click();
      btn = await waitFor(findButton, 3000);
    }
    if (!btn) return [];
    btn.click();
    const items = await waitFor(() => {
      const list = document.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
      return list.length ? list : null;
    }, 8000);
    const out = [];
    (items || []).forEach((node) => {
      const lines = (node.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
      const idx = lines.findIndex((l) => TIME_RE.test(l));
      if (idx < 0) return;
      const text = lines.filter((_, i) => i !== idx).join(' ').trim();
      if (text) out.push({ s: toSec(lines[idx]), d: 0, text });
    });
    for (let i = 0; i < out.length; i++) out[i].d = i + 1 < out.length ? Math.max(0, out[i + 1].s - out[i].s) : 5;
    // close the panel again
    const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id*="transcript"]');
    if (panel) panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    return out;
  }

  // ------------------------------------------------------------ public API
  async function load(videoId, lang) {
    const tracks = await getTracks(videoId);
    const track = pickTrack(tracks, lang);
    let segments = [];
    let source = '';

    if (track) {
      try {
        segments = await fetchCaptionUrl(track.baseUrl);
        source = track.source;
      } catch (e) {
        segments = [];
      }
      if (!segments.length) {
        try {
          segments = await fromPlayerRequests(videoId, track);
          source = 'player';
        } catch (e) {
          segments = [];
        }
      }
    }
    if (!segments.length && !lang) {
      // Saved copy from the library?
      const saved = await TM.store.getTranscript(videoId).catch(() => null);
      if (saved && saved.segments && saved.segments.length) {
        return {
          videoId,
          lang: saved.lang,
          langName: saved.langName,
          kind: saved.kind || '',
          tracks: publicTracks(tracks),
          segments: saved.segments.map(([s, d, text]) => ({ s, d, text })),
          source: 'saved',
        };
      }
    }
    if (!segments.length) {
      segments = await fromDomPanel(videoId);
      source = 'dom';
    }
    if (!segments.length) throw new Error('noTranscript');

    return {
      videoId,
      lang: track ? track.languageCode : TM.utils.uiLang(),
      langName: track ? track.name : '',
      kind: track ? track.kind : '',
      tracks: publicTracks(tracks),
      segments,
      source,
    };
  }

  const publicTracks = (tracks) => tracks.map(({ languageCode, kind, name }) => ({ languageCode, kind, name }));

  TM.transcript = {
    /** Load (cached) transcript. lang: languageCode, optional. */
    get(videoId, opts) {
      videoId = videoId || TM.state.videoId;
      const lang = (opts && opts.lang) || '';
      const key = videoId + '|' + lang;
      if (!resultCache.has(key)) {
        const p = load(videoId, lang);
        resultCache.set(key, p);
        p.then((r) => {
          if (!lang) resultCache.set(videoId + '|' + r.lang, p);
        }).catch(() => resultCache.delete(key));
      }
      return resultCache.get(key);
    },

    /** Store the transcript in the library (used for library-wide search). */
    async persist(videoId) {
      try {
        const r = await TM.transcript.get(videoId);
        await TM.store.saveTranscript(videoId, {
          lang: r.lang,
          langName: r.langName,
          kind: r.kind,
          segments: r.segments.map((x) => [Math.round(x.s * 10) / 10, Math.round(x.d * 10) / 10, x.text]),
        });
      } catch (e) {
        /* no transcript – fine */
      }
    },

    // exported for tests
    _parseJson3: parseJson3,
    _pickTrack: pickTrack,
  };

  TM.handle('getTranscript', async ({ videoId, lang }) => TM.transcript.get(videoId, { lang }));
})(globalThis);
