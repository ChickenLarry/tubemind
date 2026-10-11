/* TubeMind – Markdown export for notes & summaries (works with Obsidian, Notion, Logseq …) */
(function (g) {
  const TM = (g.TM = g.TM || {});
  const { t, formatTime, videoUrl } = TM.utils;

  const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();

  function notesMarkdown(videoId, notes) {
    return notes
      .map((n) => {
        const link = `[${formatTime(n.t)}](${videoUrl(videoId, n.t)})`;
        const text = n.text ? oneLine(n.text) : '🔖 ' + t('bookmarkLabel');
        return `- ${link} ${text}`;
      })
      .join('\n');
  }

  function summaryMarkdown(videoId, sum) {
    if (!sum) return '';
    const parts = [];
    if (sum.tldr) parts.push(`**${t('summaryTldr')}:** ${oneLine(sum.tldr)}`);
    if (sum.points) parts.push(`### ${t('summaryKeyPoints')}\n${String(sum.points).trim()}`);
    if (sum.moments && sum.moments.length) {
      parts.push(
        `### ${t('summaryMoments')}\n` +
          sum.moments.map((m) => `- [${formatTime(m.t)}](${videoUrl(videoId, m.t)}) ${oneLine(m.text)}`).join('\n')
      );
    }
    if (sum.timeline && sum.timeline.length) {
      parts.push(
        `### ${t('summaryTimeline')}\n` +
          sum.timeline.map((m) => `- [${formatTime(m.t)}](${videoUrl(videoId, m.t)}) ${oneLine(m.text)}`).join('\n')
      );
    }
    return parts.join('\n\n');
  }

  /** Markdown for one video. meta: {id, title, channel} */
  function videoMarkdown(meta, notes, summary) {
    const out = [`# ${meta.title || meta.id}`, `${meta.channel ? meta.channel + ' · ' : ''}${videoUrl(meta.id)}`];
    if (summary) out.push(`## ${t('tabSummary')}\n\n${summaryMarkdown(meta.id, summary)}`);
    if (notes && notes.length) out.push(`## ${t('tabNotes')}\n\n${notesMarkdown(meta.id, notes)}`);
    return out.join('\n\n') + '\n';
  }

  function footer() {
    return `\n---\n*${t('exportFooter')}*\n`;
  }

  TM.exporter = { videoMarkdown, notesMarkdown, summaryMarkdown, footer };
})(globalThis);
