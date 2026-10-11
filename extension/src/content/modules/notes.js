/* TubeMind – timestamp notes & bookmarks, shown as markers on the progress bar */
(function (g) {
  const TM = g.TM;
  const { el, t, formatTime } = TM.utils;

  let notes = [];
  let notesFor = null;
  let editor = null;
  let storageListener = null;

  const active = () => TM.isModuleOn('notes');

  function currentMeta() {
    const id = TM.state.videoId;
    const meta = TM.state.meta && TM.state.meta.id === id ? TM.state.meta : null;
    return meta || { id, title: document.title.replace(/ - YouTube$/, ''), channel: '', duration: TM.yt.duration() };
  }

  function renderMarkers() {
    if (!active() || !TM.state.settings.notes.showMarkers || !notes.length) {
      TM.markers.clear('notes');
      return;
    }
    TM.markers.set(
      'notes',
      notes.map((n) => ({
        t: n.t,
        cls: n.kind === 'bookmark' ? 'tm-m-bookmark' : 'tm-m-note',
        title: `${formatTime(n.t)} ${n.text}`.trim(),
      }))
    );
  }

  async function load(videoId) {
    notesFor = videoId;
    const list = videoId ? await TM.store.getNotes(videoId).catch(() => []) : [];
    if (notesFor !== videoId) return;
    notes = list;
    renderMarkers();
  }

  async function save(text, time, kind) {
    const meta = currentMeta();
    if (!meta.id) return null;
    const entry = await TM.store.addNote(meta, { t: time, text, kind: kind || (text ? 'note' : 'bookmark') });
    TM.transcript.persist(meta.id); // keep a copy for library-wide search
    TM.ui.toast(t(entry.kind === 'bookmark' ? 'bookmarkSaved' : 'noteSaved', [formatTime(entry.t)]));
    return entry;
  }

  // ---------------------------------------------------------- editor overlay
  function closeEditor(resume) {
    if (!editor) return;
    editor.node.remove();
    if (resume && editor.wasPlaying) TM.yt.play();
    editor = null;
  }

  function openEditor() {
    if (!TM.state.isWatch || !active()) return;
    if (editor) {
      editor.textarea.focus();
      return;
    }
    const root = TM.ui.playerRoot();
    if (!root) return;
    const time = TM.yt.currentTime();
    const wasPlaying = TM.yt.isPlaying();
    if (wasPlaying && TM.state.settings.notes.pauseOnNote) TM.yt.pause();

    const textarea = el('textarea', { class: 'tm-note-input', rows: '2', placeholder: t('notePlaceholder') });
    const node = el('div', { class: 'tm-note-editor' }, [
      el('div', { class: 'tm-note-head' }, [
        el('span', { class: 'tm-note-title' }, t('noteAt', [formatTime(time)])),
        el('span', { class: 'tm-note-hint' }, t('noteHint')),
      ]),
      textarea,
      el('div', { class: 'tm-note-actions' }, [
        el('button', { class: 'tm-btn tm-btn-ghost', onclick: () => closeEditor(true) }, t('cancel')),
        el('button', { class: 'tm-btn tm-btn-primary', onclick: submit }, t('save')),
      ]),
    ]);

    function submit() {
      const text = textarea.value.trim();
      save(text, time, text ? 'note' : 'bookmark').catch(() => TM.ui.toast(t('errorGeneric')));
      closeEditor(true);
    }

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor(true);
      }
    });

    root.append(node);
    editor = { node, textarea, wasPlaying };
    textarea.focus();
  }

  function quickBookmark() {
    if (!TM.state.isWatch || !active()) return;
    save('', TM.yt.currentTime(), 'bookmark').catch(() => TM.ui.toast(t('errorGeneric')));
  }

  TM.hotkey('n', openEditor, { when: () => active() && TM.state.isWatch });
  TM.hotkey('b', quickBookmark, { when: () => active() && TM.state.isWatch });
  TM.on('requestNote', openEditor);

  TM.registerModule({
    id: 'notes',
    start() {
      storageListener = (changes, area) => {
        if (area === 'local' && notesFor && changes['notes:' + notesFor]) {
          notes = (changes['notes:' + notesFor].newValue || []).slice().sort((a, b) => a.t - b.t);
          renderMarkers();
        }
      };
      g.chrome.storage.onChanged.addListener(storageListener);
    },
    stop() {
      if (storageListener) g.chrome.storage.onChanged.removeListener(storageListener);
      closeEditor(false);
      notes = [];
      TM.markers.clear('notes');
    },
    onVideo(info) {
      closeEditor(false);
      notes = [];
      if (info.isWatch) load(info.videoId);
      else notesFor = null;
    },
    onSettings: renderMarkers,
  });

  /** Side panel: add a note at the current (or given) time. */
  TM.handle('addNote', async ({ text, t: time, kind }) => {
    const at = Number.isFinite(time) ? time : TM.yt.currentTime();
    return save(String(text || '').trim(), at, kind);
  });
  TM.handle('openNoteEditor', () => {
    openEditor();
    return true;
  });
})(globalThis);
