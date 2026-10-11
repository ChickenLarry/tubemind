/* TubeMind – "Ctrl+F for videos": search the transcript, show every hit as a marker on the progress bar */
(function (g) {
  const TM = g.TM;
  const { el, t, debounce, formatTime, waitFor } = TM.utils;

  // Built with DOM APIs (no innerHTML): YouTube enforces Trusted Types.
  const ICON_PATHS = [
    'M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    'M18.5 2l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
  ];
  function searchIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICON_PATHS) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('fill', 'currentColor');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }

  let index = null;
  let indexFor = null;
  let loading = null;
  let hits = [];
  let cur = -1;
  let box = null;
  let refs = {};
  let lastQuery = '';
  let countedQuery = '';

  const active = () => TM.isModuleOn('search');

  // ---------------------------------------------------------- transcript index
  function ensureIndex() {
    const videoId = TM.state.videoId;
    if (index && indexFor === videoId) return Promise.resolve(index);
    if (loading && loading.videoId === videoId) return loading.promise;
    const promise = TM.transcript.get(videoId).then((r) => {
      if (TM.state.videoId !== videoId) throw new Error('stale');
      index = TM.textsearch.buildIndex(r.segments);
      indexFor = videoId;
      return index;
    });
    loading = { videoId, promise };
    promise.catch(() => {}).finally(() => loading && loading.videoId === videoId && (loading = null));
    return promise;
  }

  // ---------------------------------------------------------- markers
  function renderMarkers() {
    if (!TM.state.settings.search.showMarkers || !hits.length) {
      TM.markers.clear('search');
      return;
    }
    TM.markers.set(
      'search',
      hits.map((h, i) => ({ t: h.t, cls: i === cur ? 'tm-m-current' : 'tm-m-search' }))
    );
  }

  // ---------------------------------------------------------- query
  async function runQuery(q) {
    lastQuery = q;
    if (!q || q.trim().length < 2) {
      hits = [];
      cur = -1;
      renderMarkers();
      updateUi();
      return 0;
    }
    try {
      setStatus(t('searchLoading'));
      await ensureIndex();
    } catch (e) {
      hits = [];
      renderMarkers();
      setStatus(e.message === 'stale' ? '' : t('searchNoTranscript'));
      return 0;
    }
    if (q !== lastQuery) return hits.length;
    hits = TM.textsearch.find(index, q);
    cur = -1;
    renderMarkers();
    updateUi();
    countUsage(q);
    return hits.length;
  }

  const countUsage = debounce((q) => {
    if (q && q !== countedQuery && hits.length) {
      countedQuery = q;
      TM.store.bumpUsage('searches').catch(() => {});
    }
  }, 2000);

  function goTo(i) {
    if (!hits.length) return;
    cur = (i + hits.length) % hits.length;
    TM.yt.seek(Math.max(0, hits[cur].t - 1));
    renderMarkers();
    updateUi();
  }

  function next(dir) {
    if (!hits.length) return;
    if (cur < 0) {
      // start at the first hit after the current playback position
      const now = TM.yt.currentTime();
      const idx = hits.findIndex((h) => h.t > now + 1);
      goTo(dir > 0 ? (idx < 0 ? 0 : idx) : idx <= 0 ? hits.length - 1 : idx - 1);
    } else goTo(cur + dir);
  }

  // ---------------------------------------------------------- overlay UI
  function setStatus(text) {
    if (!box) return;
    refs.snippet.replaceChildren(text ? el('span', { class: 'tm-muted' }, text) : '');
  }

  function updateUi() {
    if (!box) return;
    const q = refs.input.value.trim();
    refs.count.textContent = q.length >= 2 ? (hits.length ? `${cur < 0 ? '–' : cur + 1}/${hits.length}` : '0') : '';
    refs.box.classList.toggle('tm-no-hits', q.length >= 2 && !hits.length);
    if (!hits.length) {
      setStatus(q.length >= 2 && index ? t('searchNoHits') : '');
      return;
    }
    const h = hits[cur < 0 ? 0 : cur];
    const sn = TM.textsearch.snippet(index, h, 70);
    refs.snippet.replaceChildren(
      el('button', { class: 'tm-time', onclick: () => goTo(cur < 0 ? 0 : cur) }, formatTime(h.t)),
      ' ',
      sn.before,
      el('mark', {}, sn.match),
      sn.after
    );
  }

  function iconButton(cls, title, label, onclick) {
    return el('button', { class: 'tm-icon-btn ' + cls, title, 'aria-label': title, onclick }, label);
  }

  function build() {
    const input = el('input', {
      type: 'text',
      class: 'tm-search-input',
      placeholder: t('searchPlaceholder'),
      spellcheck: 'false',
      autocomplete: 'off',
    });
    const count = el('span', { class: 'tm-count' });
    const snippet = el('div', { class: 'tm-search-snippet' });
    const icon = el('span', { class: 'tm-search-icon' }, searchIcon());
    const boxEl = el('div', { class: 'tm-search', role: 'search' }, [
      el('div', { class: 'tm-search-row' }, [
        icon,
        input,
        count,
        iconButton('tm-prev', t('searchPrev'), '↑', () => next(-1)),
        iconButton('tm-next', t('searchNext'), '↓', () => next(+1)),
        iconButton('tm-note', t('noteAddTitle'), '✎', () => TM.emit('requestNote')),
        iconButton('tm-panel', t('openSidePanel'), '⧉', openSidePanel),
        iconButton('tm-close', t('close'), '×', close),
      ]),
      snippet,
    ]);

    const onInput = debounce(() => runQuery(input.value), 120);
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (input.value !== lastQuery) runQuery(input.value).then(() => next(e.shiftKey ? -1 : 1));
        else next(e.shiftKey ? -1 : 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        next(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        next(-1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    refs = { box: boxEl, input, count, snippet };
    return boxEl;
  }

  function open() {
    if (!TM.state.isWatch || !active()) return;
    const root = TM.ui.playerRoot();
    if (!root) return;
    if (!box || !box.isConnected) {
      box = build();
      root.append(box);
    }
    box.classList.add('tm-open');
    refs.input.focus();
    refs.input.select();
    if (!index) {
      ensureIndex()
        .then(() => updateUi())
        .catch((e) => setStatus(e.message === 'stale' ? '' : t('searchNoTranscript')));
    }
  }

  function close() {
    if (box) box.classList.remove('tm-open');
    hits = [];
    cur = -1;
    lastQuery = '';
    if (refs.input) refs.input.value = '';
    renderMarkers();
    TM.yt.player()?.focus?.();
  }

  function toggle() {
    box && box.classList.contains('tm-open') ? close() : open();
  }

  function openSidePanel() {
    TM.openSidePanel();
  }

  // ---------------------------------------------------------- player control button
  let ensuring = false;
  async function ensureControlButton() {
    if (ensuring || !TM.state.isWatch || !active()) return;
    ensuring = true;
    const controls = await waitFor(() => document.querySelector('#movie_player .ytp-right-controls'), 8000);
    ensuring = false;
    if (!controls || controls.querySelector('.tm-ctrl-btn')) return;
    const btn = el(
      'button',
      {
        class: 'ytp-button tm-ctrl-btn',
        title: t('searchButtonTitle'),
        'aria-label': t('searchButtonTitle'),
        onclick: (e) => {
          e.stopPropagation();
          toggle();
        },
      },
      searchIcon()
    );
    controls.prepend(btn);
  }

  TM.hotkey('s', open, { when: () => active() && TM.state.isWatch });

  TM.registerModule({
    id: 'search',
    start: ensureControlButton,
    stop() {
      close();
      document.querySelectorAll('.tm-ctrl-btn').forEach((n) => n.remove());
    },
    onVideo(info) {
      index = null;
      indexFor = null;
      hits = [];
      cur = -1;
      if (box) close();
      if (info.isWatch) ensureControlButton();
    },
    onSettings: renderMarkers,
  });

  // keep the control button alive if YouTube rebuilds the controls
  setInterval(() => {
    if (TM.state.isWatch && active() && !document.querySelector('#movie_player .tm-ctrl-btn')) ensureControlButton();
  }, 3000);

  /** Called from the side panel: show markers for a query typed there. */
  TM.handle('searchMarkers', async ({ q }) => {
    if (!active()) return 0;
    if (box && refs.input) refs.input.value = q || '';
    return runQuery(q || '');
  });
  TM.handle('openSearch', () => {
    open();
    return true;
  });
})(globalThis);
