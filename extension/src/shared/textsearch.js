/* TubeMind – transcript search (accent- and case-insensitive, phrases may span segments) */
(function (g) {
  const TM = (g.TM = g.TM || {});
  const { normalizeForSearch } = TM.utils;

  /** segments: [{s, d, text}] -> index for fast repeated queries */
  function buildIndex(segments) {
    const starts = [];
    let norm = '';
    segments.forEach((seg, i) => {
      if (i > 0) norm += ' ';
      starts.push(norm.length);
      norm += normalizeForSearch(seg.text);
    });
    const raw = segments.map((seg) => seg.text).join(' ');
    return { segments, starts, norm, raw };
  }

  /** Segment index containing character position pos (binary search). */
  function segmentAt(index, pos) {
    let lo = 0;
    let hi = index.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (index.starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Returns hits [{i, t, pos, len}] sorted by time. */
  function find(index, query, limit) {
    const q = normalizeForSearch(String(query || '').trim()).replace(/\s+/g, ' ');
    if (!q || q.length < 2 || !index || !index.norm) return [];
    const max = limit || 500;
    const hits = [];
    let from = 0;
    while (hits.length < max) {
      const pos = index.norm.indexOf(q, from);
      if (pos < 0) break;
      const i = segmentAt(index, pos);
      const seg = index.segments[i];
      const segLen = (index.starts[i + 1] ?? index.norm.length + 1) - index.starts[i] - 1;
      const frac = segLen > 0 ? Math.min(1, (pos - index.starts[i]) / segLen) : 0;
      hits.push({ i, t: seg.s + frac * (seg.d || 0), pos, len: q.length });
      from = pos + q.length;
    }
    return hits;
  }

  /** Text around a hit with the match marked: {before, match, after} */
  function snippet(index, hit, radius) {
    const r = radius || 60;
    const raw = index.raw; // same length as index.norm by construction
    const start = Math.max(0, hit.pos - r);
    const end = Math.min(raw.length, hit.pos + hit.len + r);
    return {
      before: (start > 0 ? '…' : '') + raw.slice(start, hit.pos),
      match: raw.slice(hit.pos, hit.pos + hit.len),
      after: raw.slice(hit.pos + hit.len, end) + (end < raw.length ? '…' : ''),
    };
  }

  TM.textsearch = { buildIndex, find, snippet, segmentAt };
})(globalThis);
