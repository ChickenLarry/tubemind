/*
 * TubeMind – local data layer (chrome.storage.local, never leaves the device)
 *
 *  videoIndex        { [videoId]: {id, title, channel, channelId, duration, addedAt, updatedAt, noteCount, hasSummary} }
 *  notes:<videoId>   [ {id, t, text, kind: 'note'|'bookmark', createdAt, updatedAt} ]
 *  tr:<videoId>      { lang, langName, segments: [[start, dur, text], …], fetchedAt }
 *  sum:<videoId>     { lang, engine: 'ai'|'basic', tldr, points, timeline: [{t, text}], keywords, createdAt }
 *  stats             { 'YYYY-MM-DD': { w: seconds, s: shortsSeconds, c: { channel: seconds } } }
 *  channelSpeeds     { [channelId]: rate }
 *  usage             { installDate, notes, summaries, searches, popupOpens, rateDismissed }
 */
(function (g) {
  const TM = (g.TM = g.TM || {});
  const local = () => g.chrome.storage.local;
  const { uid, dayKey } = TM.utils;

  async function getKey(key, fallback) {
    const res = await local().get(key);
    return res[key] === undefined ? fallback : res[key];
  }
  const setKey = (key, value) => local().set({ [key]: value });

  // ---------- videos ----------
  async function getIndex() {
    return getKey('videoIndex', {});
  }

  async function upsertVideo(meta, extra) {
    if (!meta || !meta.id) return null;
    const index = await getIndex();
    const prev = index[meta.id] || { addedAt: Date.now(), noteCount: 0 };
    index[meta.id] = {
      ...prev,
      id: meta.id,
      title: meta.title || prev.title || '',
      channel: meta.channel || prev.channel || '',
      channelId: meta.channelId || prev.channelId || '',
      duration: meta.duration || prev.duration || 0,
      updatedAt: Date.now(),
      ...(extra || {}),
    };
    await setKey('videoIndex', index);
    return index[meta.id];
  }

  async function deleteVideo(videoId) {
    const index = await getIndex();
    delete index[videoId];
    await setKey('videoIndex', index);
    await local().remove([`notes:${videoId}`, `tr:${videoId}`, `sum:${videoId}`]);
  }

  // ---------- notes ----------
  async function getNotes(videoId) {
    const notes = await getKey(`notes:${videoId}`, []);
    return notes.sort((a, b) => a.t - b.t);
  }

  async function writeNotes(videoId, notes, meta) {
    await setKey(`notes:${videoId}`, notes);
    await upsertVideo(meta || { id: videoId }, { noteCount: notes.length });
  }

  async function addNote(meta, note) {
    const notes = await getNotes(meta.id);
    const entry = {
      id: uid(),
      t: Math.max(0, Number(note.t) || 0),
      text: String(note.text || '').trim(),
      kind: note.kind === 'bookmark' ? 'bookmark' : 'note',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    notes.push(entry);
    await writeNotes(meta.id, notes, meta);
    await bumpUsage('notes');
    return entry;
  }

  async function updateNote(videoId, noteId, patch) {
    const notes = await getNotes(videoId);
    const n = notes.find((x) => x.id === noteId);
    if (!n) return null;
    if (patch.text !== undefined) n.text = String(patch.text).trim();
    if (patch.t !== undefined) n.t = Math.max(0, Number(patch.t) || 0);
    n.updatedAt = Date.now();
    await writeNotes(videoId, notes);
    return n;
  }

  async function deleteNote(videoId, noteId) {
    const notes = (await getNotes(videoId)).filter((x) => x.id !== noteId);
    await writeNotes(videoId, notes);
  }

  /** All notes of all library videos: { [videoId]: notes[] } */
  async function getAllNotes() {
    const index = await getIndex();
    const keys = Object.keys(index).map((id) => `notes:${id}`);
    if (!keys.length) return {};
    const res = await local().get(keys);
    const out = {};
    for (const id of Object.keys(index)) out[id] = (res[`notes:${id}`] || []).sort((a, b) => a.t - b.t);
    return out;
  }

  // ---------- transcripts & summaries ----------
  const getTranscript = (videoId) => getKey(`tr:${videoId}`, null);
  const saveTranscript = (videoId, data) => setKey(`tr:${videoId}`, { ...data, fetchedAt: Date.now() });

  async function getTranscripts(videoIds) {
    if (!videoIds.length) return {};
    const res = await local().get(videoIds.map((id) => `tr:${id}`));
    const out = {};
    for (const id of videoIds) if (res[`tr:${id}`]) out[id] = res[`tr:${id}`];
    return out;
  }

  const getSummary = (videoId) => getKey(`sum:${videoId}`, null);
  async function saveSummary(meta, data) {
    await setKey(`sum:${meta.id}`, { ...data, createdAt: Date.now() });
    await upsertVideo(meta, { hasSummary: true });
  }

  // ---------- watch statistics ----------
  async function addWatch(seconds, info) {
    if (!(seconds > 0)) return;
    const stats = await getKey('stats', {});
    const key = dayKey();
    const day = (stats[key] = stats[key] || { w: 0, s: 0, c: {} });
    day.w += seconds;
    if (info && info.shorts) day.s += seconds;
    if (info && info.channel) day.c[info.channel] = (day.c[info.channel] || 0) + seconds;
    // keep 90 days
    const cutoff = dayKey(new Date(Date.now() - 90 * 86400000));
    for (const k of Object.keys(stats)) if (k < cutoff) delete stats[k];
    await setKey('stats', stats);
  }

  const getStats = () => getKey('stats', {});

  // ---------- per-channel playback speed ----------
  const getChannelSpeeds = () => getKey('channelSpeeds', {});
  async function setChannelSpeed(channelId, rate) {
    if (!channelId) return;
    const speeds = await getChannelSpeeds();
    if (rate === 1) delete speeds[channelId];
    else speeds[channelId] = rate;
    await setKey('channelSpeeds', speeds);
  }

  // ---------- usage counters (used for the "rate us" prompt) ----------
  async function getUsage() {
    return getKey('usage', {});
  }
  async function bumpUsage(name, by) {
    const usage = await getUsage();
    usage[name] = (usage[name] || 0) + (by || 1);
    await setKey('usage', usage);
    return usage;
  }
  async function setUsage(patch) {
    const usage = await getUsage();
    Object.assign(usage, patch);
    await setKey('usage', usage);
    return usage;
  }

  // ---------- backup ----------
  async function exportAll() {
    const all = await local().get(null);
    return {
      app: 'TubeMind',
      format: 1,
      version: g.chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      data: all,
    };
  }

  async function importAll(json) {
    if (!json || json.app !== 'TubeMind' || typeof json.data !== 'object') {
      throw new Error('invalid backup');
    }
    const data = { ...json.data };
    // Merge library index instead of overwriting it.
    if (data.videoIndex) {
      const current = await getIndex();
      data.videoIndex = { ...current, ...data.videoIndex };
    }
    await local().set(data);
  }

  async function clearAll() {
    await local().clear();
  }

  TM.store = {
    getIndex,
    upsertVideo,
    deleteVideo,
    getNotes,
    addNote,
    updateNote,
    deleteNote,
    getAllNotes,
    getTranscript,
    saveTranscript,
    getTranscripts,
    getSummary,
    saveSummary,
    addWatch,
    getStats,
    getChannelSpeeds,
    setChannelSpeed,
    getUsage,
    bumpUsage,
    setUsage,
    exportAll,
    importAll,
    clearAll,
  };
})(globalThis);
