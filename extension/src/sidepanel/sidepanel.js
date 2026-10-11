/* TubeMind – side panel: summary, searchable transcript and notes for the current video */
(function (g) {
  const TM = g.TM;
  const { el, t, formatTime, debounce, renderMarkdownLite, thumbUrl, videoUrl, copyText, downloadText, normalizeForSearch } = TM.utils;
  const $ = (id) => document.getElementById(id);

  const S = {
    settings: TM.settings.DEFAULTS,
    conn: null,
    tabId: null,
    videoId: null,
    meta: null,
    transcript: null,
    trPromise: null,
    index: null,
    notes: [],
    time: 0,
    tab: 'summary',
    ai: 'unsupported',
    summary: null,
    summarizing: false,
    query: '',
    currentRow: -1,
    followPausedUntil: 0,
    programmaticScroll: 0,
  };

  // =================================================================== views
  function showView(name) {
    ['empty', 'reload', 'video'].forEach((v) => ($('view-' + v).hidden = v !== name));
  }

  const TAB_MODULE = { summary: 'summary', transcript: 'search', notes: 'notes' };
  const visibleTabs = () => Object.keys(TAB_MODULE).filter((tab) => S.settings.modules[TAB_MODULE[tab]] !== false);

  function switchTab(tab) {
    const tabs = visibleTabs();
    if (!tabs.includes(tab)) tab = tabs[0] || 'summary';
    S.tab = tab;
    try {
      g.localStorage.setItem('tm-panel-tab', tab);
    } catch (e) {
      /* ignore */
    }
    document.querySelectorAll('.tab').forEach((b) => {
      b.hidden = !tabs.includes(b.dataset.tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
    if (tab === 'transcript' && S.videoId) loadTranscript().catch(() => {});
    if (tab === 'summary') initSummaryTab();
  }

  // =================================================================== connection to the YouTube tab
  function detach() {
    if (S.conn) S.conn.close();
    S.conn = null;
  }

  async function attach() {
    const tab = await TM.page.activeTab();
    if (!tab || !TM.page.isYouTube(tab)) {
      detach();
      S.tabId = tab ? tab.id : null;
      showView('empty');
      return;
    }
    if (S.conn && !S.conn.closed && S.conn.tabId === tab.id) {
      refreshState();
      return;
    }
    detach();
    S.tabId = tab.id;
    let conn;
    try {
      conn = TM.page.connect(tab.id);
    } catch (e) {
      showView('reload');
      return;
    }
    S.conn = conn;
    conn.onEvent(onEvent);
    conn.onClose(() => {
      if (S.conn !== conn) return;
      S.conn = null;
      if (conn.ok) setTimeout(attach, 1000); // tab navigated/reloaded – reconnect
      else showView('reload');
    });
    refreshState();
  }

  async function refreshState() {
    const conn = S.conn;
    if (!conn) return;
    try {
      const st = await conn.rpc('getState', {}, 4000);
      if (conn !== S.conn) return;
      conn.ok = true;
      applyState(st);
    } catch (e) {
      if (conn === S.conn && !conn.ok) showView('reload');
    }
  }

  function applyState(st) {
    if (!st.isWatch) {
      showView('empty');
      setVideo(null);
      return;
    }
    showView('video');
    if (st.videoId !== S.videoId) setVideo(st.videoId);
    if (st.meta && st.meta.id === st.videoId) setMeta(st.meta);
    onTime(st.currentTime || 0);
  }

  function onEvent(event, data) {
    if (event === 'video') {
      if (!data.isWatch) {
        showView('empty');
        setVideo(null);
      } else {
        showView('video');
        if (data.videoId !== S.videoId) setVideo(data.videoId);
      }
    } else if (event === 'meta' && data.id === S.videoId) setMeta(data);
    else if (event === 'time' && data.videoId === S.videoId) onTime(data.t);
  }

  const rpc = (type, args, timeout) => (S.conn ? S.conn.rpc(type, args, timeout) : Promise.reject(new Error('disconnected')));
  const seek = (sec) => rpc('seek', { t: sec }).catch(() => {});

  // =================================================================== video
  function setVideo(videoId) {
    S.videoId = videoId;
    S.meta = null;
    S.transcript = null;
    S.trPromise = null;
    S.index = null;
    S.summary = null;
    S.notes = [];
    S.query = '';
    S.currentRow = -1;
    $('tr-search').value = '';
    $('tr-list').replaceChildren();
    $('tr-count').textContent = '';
    $('tr-lang').hidden = true;
    $('tr-status').hidden = true;
    renderNotes();
    resetSummaryUi();
    if (!videoId) return;
    $('v-thumb').src = thumbUrl(videoId);
    $('v-title').textContent = '…';
    $('v-channel').textContent = '';
    loadNotes();
    TM.store.getSummary(videoId).then((sum) => {
      if (sum && S.videoId === videoId && !S.summary) {
        S.summary = sum;
        renderSummary(sum);
      }
    });
    if (S.tab === 'transcript') loadTranscript().catch(() => {});
  }

  function setMeta(meta) {
    S.meta = meta;
    $('v-title').textContent = meta.title || '';
    $('v-channel').textContent = meta.channel || '';
  }

  const metaOrFallback = () => S.meta || { id: S.videoId, title: $('v-title').textContent, channel: '' };

  function onTime(sec) {
    S.time = sec;
    $('note-add-label').textContent = t('noteAddAt', [formatTime(sec)]);
    if (S.tab === 'transcript' && !S.query) highlightCurrentRow();
  }

  // =================================================================== transcript
  function trStatus(message, icon) {
    const box = $('tr-status');
    if (!message) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.replaceChildren(
      icon === 'spin' ? el('span', { class: 'spinner' }) : el('div', { class: 'empty-icon' }, icon || '📝'),
      el('p', {}, message)
    );
  }

  function errorText(e) {
    const msg = e && e.message;
    if (msg === 'noTranscript') return t('noTranscript');
    if (msg === 'disconnected' || msg === 'timeout') return t('panelReload');
    return t('errorGeneric');
  }

  function loadTranscript(lang) {
    if (!S.videoId) return Promise.reject(new Error('no video'));
    if (!lang && S.trPromise) return S.trPromise;
    const videoId = S.videoId;
    trStatus(t('transcriptLoading'), 'spin');
    const p = rpc('getTranscript', { videoId, lang }, 45000).then((r) => {
      if (S.videoId !== videoId) throw new Error('stale');
      S.transcript = r;
      S.index = TM.textsearch.buildIndex(r.segments);
      trStatus('');
      renderLangSelect();
      renderTranscript();
      return r;
    });
    p.catch((e) => {
      if (e.message === 'stale' || S.videoId !== videoId) return;
      trStatus(errorText(e), '🤷');
      S.trPromise = null;
    });
    S.trPromise = p;
    return p;
  }

  function renderLangSelect() {
    const sel = $('tr-lang');
    const tracks = (S.transcript && S.transcript.tracks) || [];
    if (tracks.length < 2) {
      sel.hidden = true;
      return;
    }
    const value = (tr) => (tr.kind === 'asr' ? tr.languageCode + ':asr' : tr.languageCode);
    sel.replaceChildren(...tracks.map((tr) => el('option', { value: value(tr) }, tr.name || tr.languageCode)));
    sel.value = S.transcript.kind === 'asr' ? S.transcript.lang + ':asr' : S.transcript.lang;
    sel.hidden = false;
  }

  function highlightNodes(text, query) {
    if (!query) return [text];
    const norm = normalizeForSearch(text);
    const q = normalizeForSearch(query.trim()).replace(/\s+/g, ' ');
    const out = [];
    let from = 0;
    let pos;
    while (q && (pos = norm.indexOf(q, from)) >= 0) {
      out.push(text.slice(from, pos), el('mark', {}, text.slice(pos, pos + q.length)));
      from = pos + q.length;
    }
    out.push(text.slice(from));
    return out;
  }

  function renderTranscript() {
    const list = $('tr-list');
    if (!S.index) return;
    const segs = S.index.segments;
    let rows;
    if (S.query.trim().length >= 2) {
      const hits = TM.textsearch.find(S.index, S.query);
      rows = [...new Set(hits.map((h) => h.i))];
      $('tr-count').textContent = t('hitsCount', [String(hits.length)]);
      if (!hits.length) {
        list.replaceChildren(el('div', { class: 'empty' }, t('searchNoHits')));
        return;
      }
    } else {
      rows = segs.map((_, i) => i);
      $('tr-count').textContent = t('segmentsCount', [String(segs.length)]);
    }
    const frag = document.createDocumentFragment();
    for (const i of rows) {
      const seg = segs[i];
      frag.append(
        el('div', { class: 'tr-row', dataset: { i: String(i) }, onclick: () => seek(seg.s) }, [
          el('button', { class: 'time-btn', tabindex: '-1' }, formatTime(seg.s)),
          el('span', { class: 'tr-text' }, highlightNodes(seg.text, S.query)),
        ])
      );
    }
    list.replaceChildren(frag);
    S.currentRow = -1;
    if (!S.query) highlightCurrentRow(true);
  }

  function segmentAtTime(sec) {
    const segs = S.index ? S.index.segments : [];
    let lo = 0;
    let hi = segs.length - 1;
    if (hi < 0 || sec < segs[0].s) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].s <= sec) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function highlightCurrentRow(force) {
    if (!S.index) return;
    const i = segmentAtTime(S.time);
    if (i === S.currentRow && !force) return;
    const list = $('tr-list');
    list.querySelector('.tr-row.current')?.classList.remove('current');
    S.currentRow = i;
    const row = i >= 0 ? list.querySelector(`.tr-row[data-i="${i}"]`) : null;
    if (!row) return;
    row.classList.add('current');
    if (Date.now() > S.followPausedUntil) {
      S.programmaticScroll = Date.now();
      row.scrollIntoView({ block: 'center', behavior: force ? 'auto' : 'smooth' });
    }
  }

  const onSearchInput = debounce(() => {
    S.query = $('tr-search').value;
    renderTranscript();
    rpc('searchMarkers', { q: S.query.trim().length >= 2 ? S.query : '' }).catch(() => {});
  }, 200);

  function transcriptText() {
    if (!S.transcript) return '';
    return S.transcript.segments.map((s) => `[${formatTime(s.s)}] ${s.text}`).join('\n');
  }

  const safeFileName = (name) => (String(name || 'video').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'video');

  // =================================================================== summary
  function resetSummaryUi() {
    $('sum-result').hidden = true;
    $('sum-error').hidden = true;
    $('sum-progress').hidden = true;
    $('sum-start').hidden = false;
  }

  async function initSummaryTab() {
    S.ai = await TM.summary.aiAvailability();
    const box = $('ai-status');
    const ready = S.ai === 'available';
    const aiPossible = ['available', 'downloadable', 'downloading'].includes(S.ai);
    box.replaceChildren(
      el('span', { class: 'dot' + (aiPossible ? ' ok' : '') }),
      el('span', {}, t(ready ? 'aiAvailable' : aiPossible ? 'aiDownloadable' : 'aiUnavailable'))
    );
    $('sum-start-hint').textContent = t(ready ? 'summarizeHintAI' : aiPossible ? 'summarizeHintDownload' : 'summarizeHintBasic');
  }

  function setProgress(text, fraction) {
    $('sum-progress').hidden = false;
    $('sum-progress-text').textContent = text;
    $('sum-progress-bar').style.width = Math.round(Math.max(0.03, Math.min(1, fraction)) * 100) + '%';
  }

  async function summarize() {
    if (S.summarizing || !S.videoId) return;
    const videoId = S.videoId;
    // Start the one-time model download inside the click (needs a user gesture).
    let warm = null;
    if (S.ai === 'downloadable' || S.ai === 'downloading') {
      warm = TM.summary
        .warmup((loaded) => setProgress(t('aiDownloading', [String(Math.round(loaded * 100))]), loaded))
        .catch(() => null);
    }
    S.summarizing = true;
    $('sum-start').hidden = true;
    $('sum-error').hidden = true;
    $('sum-result').hidden = true;
    setProgress(t('transcriptLoading'), 0.05);
    try {
      const tr = await loadTranscript();
      if (warm) {
        const ok = await warm;
        S.ai = ok ? 'available' : 'unavailable';
      }
      let result;
      if (S.ai === 'available') {
        try {
          result = await TM.summary.aiSummary(tr, metaOrFallback(), S.settings, (p) => {
            if (p.phase === 'download') setProgress(t('aiDownloading', [String(Math.round((p.loaded || 0) * 100))]), p.loaded || 0);
            else setProgress(t('summaryProgress', [String(p.done + 1), String(p.total)]), (p.done + 1) / (p.total + 1));
          });
        } catch (e) {
          console.warn('[TubeMind] AI summary failed, using basic summary', e);
          result = TM.summary.basicSummary(tr);
          result.aiFailed = true;
        }
      } else {
        result = TM.summary.basicSummary(tr);
      }
      if (S.videoId !== videoId) return;
      S.summary = result;
      renderSummary(result);
      const meta = metaOrFallback();
      await TM.store.saveSummary(meta, result);
      await saveTranscriptCopy();
      TM.store.bumpUsage('summaries').catch(() => {});
    } catch (e) {
      if (S.videoId !== videoId) return;
      $('sum-start').hidden = false;
      $('sum-error').hidden = false;
      $('sum-error').textContent = errorText(e);
    } finally {
      S.summarizing = false;
      $('sum-progress').hidden = true;
    }
  }

  async function saveTranscriptCopy() {
    if (!S.transcript || !S.videoId) return;
    await TM.store.saveTranscript(S.videoId, {
      lang: S.transcript.lang,
      langName: S.transcript.langName,
      kind: S.transcript.kind,
      segments: S.transcript.segments.map((x) => [Math.round(x.s * 10) / 10, Math.round(x.d * 10) / 10, x.text]),
    });
  }

  function timelineItems(items) {
    return items.map((m) =>
      el('li', {}, [el('button', { class: 'time-btn', onclick: () => seek(m.t) }, formatTime(m.t)), el('span', {}, m.text)])
    );
  }

  function renderSummary(sum) {
    $('sum-start').hidden = true;
    $('sum-result').hidden = false;
    $('sum-tldr-block').hidden = !sum.tldr;
    $('sum-tldr').textContent = sum.tldr || '';
    $('sum-points-block').hidden = !sum.points;
    $('sum-points').innerHTML = renderMarkdownLite(sum.points || '');
    $('sum-moments-block').hidden = !(sum.moments && sum.moments.length);
    $('sum-moments').replaceChildren(...timelineItems(sum.moments || []));
    $('sum-timeline-block').hidden = !(sum.timeline && sum.timeline.length);
    $('sum-timeline').replaceChildren(...timelineItems(sum.timeline || []));
    $('sum-keywords-block').hidden = !(sum.keywords && sum.keywords.length) || S.settings.modules.search === false;
    $('sum-keywords').replaceChildren(
      ...(sum.keywords || []).map((k) =>
        el(
          'button',
          {
            class: 'chip',
            onclick: () => {
              switchTab('transcript');
              $('tr-search').value = k;
              loadTranscript()
                .then(() => onSearchInput())
                .catch(() => {});
            },
          },
          k
        )
      )
    );
    let engine = t(sum.engine === 'ai' ? 'summaryEngineAI' : 'summaryEngineBasic');
    if (sum.aiFailed) engine += ' ' + t('summaryAiFailed');
    $('sum-engine').textContent = engine;
  }

  // =================================================================== notes
  async function loadNotes() {
    const videoId = S.videoId;
    const notes = videoId ? await TM.store.getNotes(videoId) : [];
    if (videoId !== S.videoId) return;
    S.notes = notes;
    renderNotes();
  }

  function renderNotes() {
    const list = $('notes-list');
    $('notes-count').textContent = S.notes.length ? String(S.notes.length) : '';
    $('notes-export').hidden = !S.notes.length;
    if (!S.notes.length) {
      list.replaceChildren(
        el('div', { class: 'empty' }, [el('div', { class: 'empty-icon' }, '✍️'), el('p', {}, t('notesEmpty'))])
      );
      return;
    }
    list.replaceChildren(...S.notes.map(noteItem));
  }

  function noteItem(n) {
    const textNode = el('div', { class: 'note-text' + (n.text ? '' : ' placeholder'), title: t('noteEditHint') }, n.text || t('bookmarkLabel'));
    let confirmTimer = 0;
    const delBtn = el('button', { class: 'icon-btn', title: t('delete') }, '🗑');
    delBtn.addEventListener('click', () => {
      if (!delBtn.classList.contains('confirm')) {
        delBtn.classList.add('confirm');
        delBtn.textContent = '✓';
        delBtn.title = t('deleteConfirm');
        confirmTimer = setTimeout(() => {
          delBtn.classList.remove('confirm');
          delBtn.textContent = '🗑';
          delBtn.title = t('delete');
        }, 2500);
        return;
      }
      clearTimeout(confirmTimer);
      TM.store.deleteNote(S.videoId, n.id);
    });

    const item = el('div', { class: 'note' + (n.kind === 'bookmark' ? ' bookmark' : '') }, [
      el('button', { class: 'time-btn', onclick: () => seek(n.t) }, formatTime(n.t)),
      textNode,
      el('div', { class: 'note-actions' }, [
        el(
          'button',
          {
            class: 'icon-btn',
            title: t('copyLink'),
            onclick: async () => {
              await copyText(videoUrl(S.videoId, n.t));
              TM.page.toast(t('copied'));
            },
          },
          '🔗'
        ),
        delBtn,
      ]),
    ]);

    textNode.addEventListener('click', () => {
      const ta = el('textarea', { class: 'input', rows: '2' });
      ta.value = n.text || '';
      textNode.replaceWith(ta);
      ta.focus();
      let done = false;
      const finish = (saveIt) => {
        if (done) return;
        done = true;
        if (saveIt && ta.value.trim() !== (n.text || '')) TM.store.updateNote(S.videoId, n.id, { text: ta.value });
        else ta.replaceWith(textNode);
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') finish(false);
      });
      ta.addEventListener('blur', () => finish(true));
    });
    return item;
  }

  async function addNote(kind) {
    const input = $('note-input');
    const text = kind === 'bookmark' ? '' : input.value.trim();
    if (kind !== 'bookmark' && !text) {
      input.focus();
      return;
    }
    try {
      await rpc('addNote', { text, kind }, 5000);
    } catch (e) {
      await TM.store.addNote(metaOrFallback(), { t: S.time, text, kind });
    }
    if (kind !== 'bookmark') input.value = '';
  }

  function notesMarkdown() {
    return TM.exporter.videoMarkdown(metaOrFallback(), S.notes, null) + TM.exporter.footer();
  }

  // =================================================================== wiring
  function bind() {
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('btn-library').addEventListener('click', () => TM.page.open('library'));
    $('btn-options').addEventListener('click', () => TM.page.open('options'));
    $('btn-reload').addEventListener('click', async () => {
      if (S.tabId != null) await g.chrome.tabs.reload(S.tabId);
    });

    $('btn-summarize').addEventListener('click', summarize);
    $('btn-sum-redo').addEventListener('click', summarize);
    $('btn-sum-copy').addEventListener('click', async () => {
      if (!S.summary) return;
      await copyText(TM.exporter.videoMarkdown(metaOrFallback(), null, S.summary) + TM.exporter.footer());
      TM.page.toast(t('copied'));
    });

    $('tr-search').addEventListener('input', () => {
      if (!S.index) loadTranscript().then(onSearchInput).catch(() => {});
      else onSearchInput();
    });
    $('tr-lang').addEventListener('change', (e) => {
      S.trPromise = null;
      loadTranscript(e.target.value).catch(() => {});
    });
    $('btn-tr-copy').addEventListener('click', async () => {
      await loadTranscript().catch(() => null);
      if (!S.transcript) return;
      await copyText(transcriptText());
      TM.page.toast(t('copied'));
    });
    $('btn-tr-download').addEventListener('click', async () => {
      await loadTranscript().catch(() => null);
      if (!S.transcript) return;
      downloadText(safeFileName(metaOrFallback().title) + '.txt', transcriptText());
    });
    $('view-video').addEventListener(
      'scroll',
      () => {
        if (Date.now() - S.programmaticScroll > 800) S.followPausedUntil = Date.now() + 6000;
      },
      { passive: true }
    );

    $('btn-note-add').addEventListener('click', () => addNote('note'));
    $('btn-bookmark').addEventListener('click', () => addNote('bookmark'));
    $('note-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addNote('note');
      }
    });
    $('btn-notes-copy').addEventListener('click', async () => {
      await copyText(notesMarkdown());
      TM.page.toast(t('copied'));
    });
    $('btn-notes-download').addEventListener('click', () => {
      downloadText(safeFileName(metaOrFallback().title) + '.md', notesMarkdown(), 'text/markdown;charset=utf-8');
    });

    g.chrome.tabs.onActivated.addListener(() => attach());
    g.chrome.tabs.onUpdated.addListener((tabId, info) => {
      if (tabId === S.tabId && (info.status === 'complete' || info.url)) attach();
    });
    g.chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (S.videoId && changes['notes:' + S.videoId]) loadNotes();
    });
    TM.settings.onChange((s) => {
      S.settings = s;
      switchTab(S.tab);
    });
  }

  async function init() {
    TM.page.init();
    S.settings = await TM.settings.get();
    let saved = 'summary';
    try {
      saved = g.localStorage.getItem('tm-panel-tab') || 'summary';
    } catch (e) {
      /* ignore */
    }
    bind();
    switchTab(saved);
    await attach();
    TM.sponsor.render($('sponsor'), 'sidepanel');
  }

  init();
})(globalThis);
