/* TubeMind – library: all saved videos, notes, full-text search and watch statistics */
(function (g) {
  const TM = g.TM;
  const { el, t, formatTime, formatDuration, debounce, thumbUrl, videoUrl, normalizeForSearch, renderMarkdownLite, downloadText, dayKey, uiLang } =
    TM.utils;
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const S = { index: {}, notes: {}, summaries: {}, stats: {}, tab: 'videos', q: '', deep: false, transcripts: null, detailId: null };

  // =================================================================== data
  async function loadAll() {
    S.index = await TM.store.getIndex();
    S.notes = await TM.store.getAllNotes();
    const ids = Object.keys(S.index).filter((id) => S.index[id].hasSummary);
    const res = ids.length ? await g.chrome.storage.local.get(ids.map((id) => 'sum:' + id)) : {};
    S.summaries = {};
    for (const id of ids) if (res['sum:' + id]) S.summaries[id] = res['sum:' + id];
    S.stats = await TM.store.getStats();
    S.transcripts = null;
  }

  const videos = () => Object.values(S.index).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  function matches(video, q) {
    if (!q) return true;
    const nq = normalizeForSearch(q);
    const sum = S.summaries[video.id];
    const hay = [video.title, video.channel, ...(S.notes[video.id] || []).map((n) => n.text), sum && sum.tldr, sum && sum.points]
      .filter(Boolean)
      .join(' \n ');
    return normalizeForSearch(hay).includes(nq);
  }

  // =================================================================== tabs
  function switchTab(tab) {
    S.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('.lib-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    document.querySelector('.lib-header').classList.toggle('no-search', tab === 'stats');
    render();
  }

  function render() {
    if (S.tab === 'videos') renderVideos();
    else if (S.tab === 'notes') renderNotes();
    else renderStats();
  }

  // =================================================================== videos
  function emptyState(icon, text) {
    return el('div', { class: 'empty card' }, [el('div', { class: 'empty-icon' }, icon), el('p', {}, text)]);
  }

  function renderVideos() {
    const grid = $('videos-grid');
    const list = videos().filter((v) => matches(v, S.q));
    renderDeep();
    if (!Object.keys(S.index).length) {
      grid.replaceChildren(emptyState('📚', t('libraryEmpty')));
      return;
    }
    if (!list.length) {
      grid.replaceChildren(S.deep && S.q ? '' : emptyState('🔍', t('libraryNoResults')));
      return;
    }
    grid.replaceChildren(
      ...list.map((v) => {
        const noteCount = (S.notes[v.id] || []).length;
        return el('button', { class: 'card video-card', onclick: () => openDetail(v.id) }, [
          el('img', { src: thumbUrl(v.id), alt: '', loading: 'lazy' }),
          el('div', { class: 'video-card-body' }, [
            el('div', { class: 'video-card-title' }, v.title || v.id),
            el('div', { class: 'small muted ellipsis' }, v.channel || ''),
            el('div', { class: 'badges' }, [
              noteCount ? el('span', { class: 'badge' }, t('notesCount', [String(noteCount)])) : null,
              S.summaries[v.id] ? el('span', { class: 'badge' }, '✨ ' + t('tabSummary')) : null,
            ]),
          ]),
        ]);
      })
    );
  }

  async function renderDeep() {
    const box = $('deep-results');
    if (!S.deep || S.q.trim().length < 2 || S.tab !== 'videos') {
      box.hidden = true;
      return;
    }
    const q = S.q;
    if (!S.transcripts) S.transcripts = await TM.store.getTranscripts(Object.keys(S.index));
    if (q !== S.q) return;
    const groups = [];
    for (const v of videos()) {
      const tr = S.transcripts[v.id];
      if (!tr) continue;
      const index = TM.textsearch.buildIndex(tr.segments.map(([s, d, text]) => ({ s, d, text })));
      const hits = TM.textsearch.find(index, q, 6);
      if (!hits.length) continue;
      groups.push(
        el('div', { class: 'card deep-video' }, [
          el('h3', {}, v.title || v.id),
          ...hits.map((h) => {
            const sn = TM.textsearch.snippet(index, h, 70);
            return el('a', { class: 'hit', href: videoUrl(v.id, h.t), target: '_blank', rel: 'noopener' }, [
              el('span', { class: 'time-btn' }, formatTime(h.t)),
              el('span', { class: 'hit-text' }, [sn.before, el('mark', {}, sn.match), sn.after]),
            ]);
          }),
        ])
      );
    }
    box.hidden = false;
    box.replaceChildren(
      el('div', { class: 'muted small' }, t('deepResults', [String(groups.length)])),
      ...(groups.length ? groups : [emptyState('🔍', t('libraryNoResults'))])
    );
  }

  // =================================================================== notes
  function renderNotes() {
    const box = $('notes-all');
    const nq = normalizeForSearch(S.q.trim());
    const groups = videos()
      .map((v) => {
        let notes = S.notes[v.id] || [];
        if (nq && !normalizeForSearch((v.title || '') + ' ' + (v.channel || '')).includes(nq)) {
          notes = notes.filter((n) => normalizeForSearch(n.text || '').includes(nq));
        }
        return { v, notes };
      })
      .filter((x) => x.notes.length);
    if (!groups.length) {
      box.replaceChildren(emptyState('✍️', S.q ? t('libraryNoResults') : t('libraryNotesEmpty')));
      return;
    }
    box.replaceChildren(
      ...groups.map(({ v, notes }) =>
        el('div', { class: 'card note-group' }, [
          el('div', { class: 'note-group-head' }, [
            el('img', { src: thumbUrl(v.id), alt: '', loading: 'lazy' }),
            el('div', { class: 'grow' }, [
              el('div', { class: 'note-group-title', onclick: () => openDetail(v.id) }, v.title || v.id),
              el('div', { class: 'small muted' }, v.channel || ''),
            ]),
          ]),
          ...notes.map((n) =>
            el('a', { class: 'note-line', href: videoUrl(v.id, n.t), target: '_blank', rel: 'noopener' }, [
              el('span', { class: 'time-btn' }, formatTime(n.t)),
              el('span', { class: 'note-line-text' + (n.text ? '' : ' muted') }, n.text || '🔖 ' + t('bookmarkLabel')),
            ])
          ),
        ])
      )
    );
  }

  // =================================================================== stats
  function lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const day = S.stats[key] || { w: 0, s: 0, c: {} };
      out.push({ date: d, key, w: day.w || 0, s: day.s || 0, c: day.c || {} });
    }
    return out;
  }

  function renderStats() {
    const days14 = lastDays(14);
    const days7 = days14.slice(-7);
    const total7 = days7.reduce((n, d) => n + d.w, 0);
    const shorts7 = days7.reduce((n, d) => n + d.s, 0);
    const tile = (label, value) =>
      el('div', { class: 'card tile' }, [el('div', { class: 'tile-label' }, label), el('div', { class: 'tile-value' }, value)]);
    $('tiles').replaceChildren(
      tile(t('statsToday'), formatDuration(days7[6].w)),
      tile(t('statsWeek'), formatDuration(total7)),
      tile(t('statsAverage'), formatDuration(total7 / 7)),
      tile(t('statsShortsShare'), total7 ? Math.round((shorts7 / total7) * 100) + ' %' : '–')
    );
    renderChart(days14);
    renderChannels(days7);
  }

  function niceStep(maxMin) {
    const steps = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480];
    return steps.find((s) => maxMin / s <= 4) || 600;
  }

  const minLabel = (min) => (min >= 60 ? (min % 60 ? `${Math.floor(min / 60)} h ${min % 60}` : `${min / 60} h`) : `${min} min`);

  function svg(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  function barPath(x, y, w, h) {
    const r = Math.min(4, h, w / 2);
    const base = y + h;
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
  }

  function renderChart(days) {
    const box = $('chart');
    const W = Math.max(320, box.clientWidth || 640);
    const H = 230;
    const m = { top: 24, right: 8, bottom: 28, left: 52 };
    const plotW = W - m.left - m.right;
    const plotH = H - m.top - m.bottom;
    const maxMin = Math.max(...days.map((d) => d.w / 60), 0);
    const step = niceStep(Math.max(maxMin, 5));
    const top = Math.max(step, Math.ceil(maxMin / step) * step);
    const yOf = (min) => m.top + plotH - (min / top) * plotH;
    const band = plotW / days.length;
    const barW = Math.min(24, band - 2);
    const fmtDay = new Intl.DateTimeFormat(uiLang(), { weekday: 'short' });
    const fmtFull = new Intl.DateTimeFormat(uiLang(), { weekday: 'short', day: 'numeric', month: 'short' });

    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('statsChartTitle') });
    for (let v = 0; v <= top; v += step) {
      const y = yOf(v);
      root.append(svg('line', { class: 'grid-line', x1: m.left, x2: W - m.right, y1: y, y2: y }));
      root.append(svg('text', { class: 'axis-label', x: m.left - 8, y: y + 4, 'text-anchor': 'end' }, minLabel(v)));
    }

    const tip = el('div', { class: 'chart-tooltip', hidden: true });
    const maxIdx = days.reduce((best, d, i) => (d.w > days[best].w ? i : best), 0);
    days.forEach((d, i) => {
      const cx = m.left + band * i + band / 2;
      const min = d.w / 60;
      const y = yOf(min);
      const h = m.top + plotH - y;
      const hit = svg('rect', { class: 'hit-area', x: m.left + band * i, y: m.top, width: band, height: plotH });
      root.append(hit);
      let bar = null;
      if (h >= 0.5) {
        bar = svg('path', { class: 'bar', d: barPath(cx - barW / 2, y, barW, h) });
        root.append(bar);
      }
      if (i === maxIdx && d.w >= 60) {
        root.append(svg('text', { class: 'value-label', x: cx, y: y - 7, 'text-anchor': 'middle' }, formatDuration(d.w)));
      }
      root.append(
        svg('text', { class: 'axis-label', x: cx, y: H - 8, 'text-anchor': 'middle', 'font-weight': i === days.length - 1 ? '600' : '400' }, fmtDay.format(d.date))
      );
      hit.addEventListener('mouseenter', () => {
        if (bar) bar.classList.add('hover');
        tip.replaceChildren(
          el('strong', {}, fmtFull.format(d.date)),
          el('div', {}, `${t('statsWatched')}: ${formatDuration(d.w)}`),
          el('div', { class: 'muted' }, `Shorts: ${formatDuration(d.s)}`)
        );
        tip.hidden = false;
        tip.style.left = cx + 'px';
        tip.style.top = Math.max(m.top, y) + 'px';
      });
      hit.addEventListener('mouseleave', () => {
        if (bar) bar.classList.remove('hover');
        tip.hidden = true;
      });
    });
    root.append(svg('line', { class: 'grid-line', x1: m.left, x2: W - m.right, y1: m.top + plotH, y2: m.top + plotH }));
    box.replaceChildren(root, tip);

    // accessible table view of the same data
    $('chart-table').replaceChildren(
      el('tr', {}, [el('th', {}, t('statsDate')), el('th', {}, t('statsWatched')), el('th', {}, 'Shorts')]),
      ...days.map((d) => el('tr', {}, [el('td', {}, fmtFull.format(d.date)), el('td', {}, formatDuration(d.w)), el('td', {}, formatDuration(d.s))]))
    );
  }

  function renderChannels(days) {
    const agg = {};
    for (const d of days) for (const [name, sec] of Object.entries(d.c)) if (name) agg[name] = (agg[name] || 0) + sec;
    const top = Object.entries(agg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (!top.length) {
      $('channels').replaceChildren(el('div', { class: 'muted small' }, t('statsNoData')));
      return;
    }
    const max = top[0][1];
    $('channels').replaceChildren(
      ...top.map(([name, sec]) =>
        el('div', { class: 'channel-row' }, [
          el('span', { class: 'ellipsis', title: name }, name),
          el('div', { class: 'channel-track' }, el('div', { class: 'channel-fill', style: { width: Math.max(2, (sec / max) * 100) + '%' } })),
          el('span', { class: 'channel-value' }, formatDuration(sec)),
        ])
      )
    );
  }

  // =================================================================== detail dialog
  function openDetail(id) {
    const v = S.index[id];
    if (!v) return;
    S.detailId = id;
    $('d-thumb').src = thumbUrl(id);
    $('d-title').textContent = v.title || id;
    $('d-channel').textContent = v.channel || '';
    $('d-open').href = videoUrl(id);
    const body = [];
    const sum = S.summaries[id];
    if (sum) {
      if (sum.tldr) body.push(el('div', {}, [el('h3', {}, t('summaryTldr')), el('p', {}, sum.tldr)]));
      if (sum.points) body.push(el('div', {}, [el('h3', {}, t('summaryKeyPoints')), el('div', { class: 'md', html: renderMarkdownLite(sum.points) })]));
      const moments = (sum.moments && sum.moments.length ? sum.moments : sum.timeline) || [];
      if (moments.length) {
        body.push(
          el('div', {}, [
            el('h3', {}, t(sum.moments && sum.moments.length ? 'summaryMoments' : 'summaryTimeline')),
            ...moments.map((m) =>
              el('a', { class: 'note-line', href: videoUrl(id, m.t), target: '_blank', rel: 'noopener' }, [
                el('span', { class: 'time-btn' }, formatTime(m.t)),
                el('span', {}, m.text),
              ])
            ),
          ])
        );
      }
    }
    const notes = S.notes[id] || [];
    body.push(
      el('div', {}, [
        el('h3', {}, t('tabNotes')),
        ...(notes.length
          ? notes.map((n) =>
              el('a', { class: 'note-line', href: videoUrl(id, n.t), target: '_blank', rel: 'noopener' }, [
                el('span', { class: 'time-btn' }, formatTime(n.t)),
                el('span', { class: 'note-line-text' }, n.text || '🔖 ' + t('bookmarkLabel')),
              ])
            )
          : [el('p', { class: 'muted' }, t('notesEmpty'))]),
      ])
    );
    $('d-body').replaceChildren(...body);
    $('d-delete').dataset.confirm = '';
    $('d-delete').textContent = t('libraryRemove');
    $('detail').showModal();
  }

  function exportLibrary() {
    const parts = videos().map((v) => TM.exporter.videoMarkdown(v, S.notes[v.id] || [], S.summaries[v.id] || null));
    const md = `# TubeMind – ${t('libraryTitle')}\n\n` + parts.join('\n---\n\n') + TM.exporter.footer();
    downloadText(`tubemind-library-${dayKey()}.md`, md, 'text/markdown;charset=utf-8');
  }

  // =================================================================== wiring
  function bind() {
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('q').addEventListener(
      'input',
      debounce(() => {
        S.q = $('q').value;
        render();
      }, 150)
    );
    $('deep').addEventListener('change', () => {
      S.deep = $('deep').checked;
      render();
    });
    $('btn-export').addEventListener('click', exportLibrary);
    $('btn-options').addEventListener('click', () => g.chrome.runtime.openOptionsPage());
    $('d-close').addEventListener('click', () => $('detail').close());
    $('detail').addEventListener('click', (e) => e.target === $('detail') && $('detail').close());
    $('d-export').addEventListener('click', () => {
      const v = S.index[S.detailId];
      if (!v) return;
      const md = TM.exporter.videoMarkdown(v, S.notes[v.id] || [], S.summaries[v.id] || null) + TM.exporter.footer();
      downloadText((v.title || v.id).replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) + '.md', md, 'text/markdown;charset=utf-8');
    });
    $('d-delete').addEventListener('click', async () => {
      const btn = $('d-delete');
      if (!btn.dataset.confirm) {
        btn.dataset.confirm = '1';
        btn.textContent = t('deleteConfirm');
        return;
      }
      await TM.store.deleteVideo(S.detailId);
      $('detail').close();
    });
    g.addEventListener('resize', debounce(() => S.tab === 'stats' && renderStats(), 150));
    const reload = debounce(async () => {
      await loadAll();
      render();
    }, 300);
    g.chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const keys = Object.keys(changes);
      const library = keys.some((k) => k === 'videoIndex' || k.startsWith('notes:') || k.startsWith('sum:'));
      if (library || (keys.includes('stats') && S.tab === 'stats')) reload();
    });
  }

  async function init() {
    TM.page.init();
    bind();
    await loadAll();
    const hash = location.hash.replace('#', '');
    switchTab(['videos', 'notes', 'stats'].includes(hash) ? hash : 'videos');
    if (TM.isConfigured(TM.config.donateUrl)) {
      $('donate').href = TM.config.donateUrl;
      $('donate').hidden = false;
    }
    TM.sponsor.render($('sponsor'), 'library');
  }

  init();
})(globalThis);
