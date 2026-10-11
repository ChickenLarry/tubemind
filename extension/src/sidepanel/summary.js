/*
 * TubeMind – video summaries.
 *
 *  AI engine:    Chrome's built-in Summarizer API (Gemini Nano, runs on the user's device).
 *                Free for you and your users: no server, no API key, private.
 *  Basic engine: works on every computer. Picks the most informative moments and keywords
 *                from the transcript with simple statistics.
 *
 * Result shape: { engine, lang, tldr, points (markdown), timeline: [{t, text}], moments: [{t, text}], keywords: [] }
 */
(function (g) {
  const TM = g.TM;
  const { clamp, formatTime } = TM.utils;

  const AI_LANGS = ['en', 'de', 'fr', 'es', 'ja'];
  const base = (code) => String(code || 'en').slice(0, 2).toLowerCase();

  // ------------------------------------------------------------------ stop words
  const STOP = {
    en: 'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each even few for from further get got had has have having he her here hers herself him himself his how i if in into is it its itself just know let like lot me more most much my myself no nor not now of off on once only or other our ours out over own really right said same say see she should so some something such than that the their theirs them then there these they thing things think this those through to too under until up us very want was way we well were what when where which while who whom why will with would yeah yes you your yours going gonna okay actually basically kind maybe sort stuff one two three make made go come back look take use used new first time also still though',
    de: 'aber alle allem allen aller alles als also am an ander andere anderem anderen anderer anderes auch auf aus bei bin bis bist da damit dann das dass dazu dein deine dem den denn der des dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein eine einem einen einer eines einfach er es etwas euch euer für gar gibt ganz habe haben hat hatte hier hin hinter ich ihm ihn ihnen ihr ihre im immer in ins ist ja jetzt kann kein keine können man mal mehr mein meine mich mir mit muss nach nicht nichts noch nun nur ob oder ohne schon sehr sein seine sich sie sind so sogar sollte sondern sonst über um und uns unser unter viel vom von vor war waren was weil weiter welche wenn wer werden wie wieder will wir wird wirklich wo würde zu zum zur zwar zwischen genau halt eben quasi okay also eigentlich irgendwie gerade gehen geht machen macht gesagt sagen dann denn mehr',
    fr: 'a ai aie alors au aucun aussi autre aux avec avoir bon car ce cela celle celui ces cet cette ceux chaque ci comme comment dans de des donc dont du elle elles en encore est et été être eu faire fait il ils je juste la le les leur leurs lui ma mais me même mes moi mon ne ni nos notre nous on ont ou où par parce pas peu peut plus pour pourquoi quand que quel quelle qui sa sans se ses si son sont sous sur ta te tes toi ton tous tout toute très tu un une vos votre vous voilà va vais bien alors donc ça cest quoi vraiment chose choses fois',
    it: 'a ad al alla alle allo anche ancora avere aveva bene che chi ci come con cosa così cui da dal dalla dei del della delle dello di dove e è ecco essere fa fare gli ha hanno ho il in io la le lei li lo loro lui ma mi mia mio molto ne nei nel nella no noi non nostro o ogni per perché più poi può quale quando quanto quella quelle quello questa queste questo qui se sei si sia siamo sono sta stato su sua sue suo sul sulla tra tu tutti tutto un una uno vi voi già proprio cioè allora quindi però cose fatto',
    es: 'a al algo como con cual cuando de del desde donde dos el ella ellos en entre era es esa ese eso esta este esto estos fue ha hay la las le les lo los más me mi muy no nos o otro para pero por porque que qué se ser si sin sobre son su sus también te tiene todo tu un una uno y ya yo bueno entonces pues vale cosa cosas',
  };
  const FILLER = 'music applause laughter musik applaus música musique musica uh um uhm hmm äh ähm oh ah eh mhm';
  const stopCache = {};
  function stopwordSet(lang) {
    const key = base(lang);
    if (!stopCache[key]) {
      stopCache[key] = new Set(((STOP[key] || '') + ' ' + STOP.en + ' ' + FILLER).split(/\s+/).filter(Boolean));
    }
    return stopCache[key];
  }

  // Apostrophes split words: "it's" -> it, s · "l'homme" -> l, homme
  const tokenize = (text) => String(text).toLowerCase().match(/\p{L}[\p{L}\p{N}-]*/gu) || [];

  // ------------------------------------------------------------------ sections
  /** Split segments into time sections of roughly equal length. */
  function sections(segments, maxChars) {
    if (!segments.length) return [];
    const duration = segments[segments.length - 1].s + (segments[segments.length - 1].d || 0);
    const totalChars = segments.reduce((n, s) => n + s.text.length + 1, 0);
    let count = clamp(Math.round(duration / 300), 1, 8);
    if (maxChars) count = Math.max(count, Math.ceil(totalChars / maxChars));
    count = clamp(count, 1, 12);
    const target = totalChars / count;
    const out = [];
    let cur = { t: segments[0].s, texts: [], chars: 0 };
    for (const seg of segments) {
      if (cur.chars >= target && out.length < count - 1) {
        out.push(cur);
        cur = { t: seg.s, texts: [], chars: 0 };
      }
      cur.texts.push(seg.text);
      cur.chars += seg.text.length + 1;
    }
    out.push(cur);
    return out.map((s) => ({ t: s.t, text: s.texts.join(' ') }));
  }

  // ------------------------------------------------------------------ basic engine
  function keywords(text, lang, limit) {
    const stop = stopwordSet(lang);
    const words = tokenize(text);
    const tf = new Map();
    const bi = new Map();
    let prev = null;
    for (const w of words) {
      const content = w.length >= 3 && !stop.has(w) && !/^\d+$/.test(w);
      if (content) tf.set(w, (tf.get(w) || 0) + 1);
      if (content && prev) {
        const pair = prev + ' ' + w;
        bi.set(pair, (bi.get(pair) || 0) + 1);
      }
      prev = content ? w : null;
    }
    const minBi = Math.max(3, Math.round(words.length / 1500));
    const bigrams = [...bi.entries()]
      .filter(([, n]) => n >= minBi)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w);
    const used = new Set(bigrams.join(' ').split(' '));
    const unigrams = [...tf.entries()]
      .filter(([w, n]) => n >= 2 && w.length >= 4 && !used.has(w))
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, (limit || 10) - bigrams.length)
      .map(([w]) => w);
    return { list: [...bigrams, ...unigrams], tf };
  }

  function basicSummary(transcript) {
    const segs = transcript.segments;
    const lang = transcript.lang;
    const full = segs.map((s) => s.text).join(' ');
    const { list: kw, tf } = keywords(full, lang, 10);
    const stop = stopwordSet(lang);

    // ~30 second windows, scored by how many frequent content words they contain
    const windows = [];
    let cur = null;
    for (const seg of segs) {
      if (!cur || seg.s - cur.t >= 30) {
        cur = { t: seg.s, texts: [] };
        windows.push(cur);
      }
      cur.texts.push(seg.text);
    }
    const scored = windows.map((w) => {
      const text = w.texts.join(' ');
      const words = tokenize(text).filter((x) => x.length >= 3 && !stop.has(x));
      const score = words.reduce((n, x) => n + Math.log1p(tf.get(x) || 0), 0) / Math.sqrt(words.length + 4);
      return { t: w.t, text, score };
    });
    const duration = segs.length ? segs[segs.length - 1].s : 0;
    const k = clamp(Math.round(duration / 150), 3, 7);
    const chosen = [];
    for (const w of [...scored].sort((a, b) => b.score - a.score)) {
      if (chosen.length >= k) break;
      if (chosen.some((c) => Math.abs(c.t - w.t) < 60)) continue;
      chosen.push(w);
    }
    const moments = chosen
      .sort((a, b) => a.t - b.t)
      .map((w) => ({ t: w.t, text: w.text.length > 240 ? w.text.slice(0, 237).replace(/\s+\S*$/, '') + ' …' : w.text }));

    const timeline = sections(segs).map((s) => ({ t: s.t, text: keywords(s.text, lang, 3).list.join(' · ') || '…' }));

    return { engine: 'basic', lang, tldr: '', points: '', moments, timeline: timeline.length > 1 ? timeline : [], keywords: kw };
  }

  // ------------------------------------------------------------------ AI engine
  function hasAI() {
    return typeof g.Summarizer !== 'undefined' && typeof g.Summarizer.create === 'function';
  }

  function outputLang() {
    const ui = TM.utils.uiLang();
    return AI_LANGS.includes(ui) ? ui : 'en';
  }

  /** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' */
  async function aiAvailability() {
    if (!hasAI()) return 'unsupported';
    try {
      const a = await g.Summarizer.availability({ type: 'tldr', format: 'plain-text', length: 'short', outputLanguage: outputLang() });
      if (a !== 'unavailable') return a;
      return await g.Summarizer.availability();
    } catch (e) {
      try {
        return await g.Summarizer.availability();
      } catch (err) {
        return 'unavailable';
      }
    }
  }

  async function createSummarizer(opts, onDownload) {
    const full = {
      ...opts,
      outputLanguage: outputLang(),
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => onDownload && onDownload(e.loaded));
      },
    };
    const attempts = [
      full,
      { ...full, expectedInputLanguages: undefined },
      { ...full, expectedInputLanguages: undefined, outputLanguage: undefined },
    ];
    let lastError;
    for (const a of attempts) {
      const clean = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined));
      try {
        return await g.Summarizer.create(clean);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }

  /** Starts the one-time model download. Call it directly inside a click handler (user gesture). */
  async function warmup(onDownload) {
    const s = await createSummarizer({ type: 'tldr', format: 'plain-text', length: 'short' }, onDownload);
    if (s && s.destroy) s.destroy();
    return true;
  }

  async function fitToQuota(summarizer, text) {
    if (!summarizer.inputQuota || typeof summarizer.measureInputUsage !== 'function') return text.slice(0, 12000);
    let out = text;
    for (let i = 0; i < 4; i++) {
      const usage = await summarizer.measureInputUsage(out);
      if (usage <= summarizer.inputQuota) return out;
      out = out.slice(0, Math.floor(out.length * (summarizer.inputQuota / usage) * 0.92));
    }
    return out;
  }

  /**
   * onProgress({phase: 'download'|'section'|'final', done, total, loaded})
   */
  async function aiSummary(transcript, meta, settings, onProgress) {
    const progress = onProgress || (() => {});
    const inLang = base(transcript.lang);
    const shared = {
      sharedContext: `Transcript of the YouTube video "${meta.title || ''}"${meta.channel ? ' by ' + meta.channel : ''}. The transcript may lack punctuation.`,
      expectedInputLanguages: AI_LANGS.includes(inLang) ? [inLang] : undefined,
    };
    const onDownload = (loaded) => progress({ phase: 'download', loaded });

    const short = await createSummarizer({ ...shared, type: 'tldr', format: 'plain-text', length: 'short' }, onDownload);
    let points = null;
    try {
      const quotaChars = short.inputQuota ? Math.floor(short.inputQuota * 2.5) : 9000;
      const parts = sections(transcript.segments, quotaChars);
      const total = parts.length + 2;
      const timeline = [];
      for (let i = 0; i < parts.length; i++) {
        progress({ phase: 'section', done: i, total });
        const text = await fitToQuota(short, parts[i].text);
        const s = await short.summarize(text, {
          context: `Part ${i + 1} of ${parts.length}, starting at ${formatTime(parts[i].t)}.`,
        });
        timeline.push({ t: parts[i].t, text: s.trim() });
      }

      progress({ phase: 'final', done: parts.length, total });
      points = await createSummarizer(
        { ...shared, type: 'key-points', format: 'markdown', length: settings.summary.length || 'medium' },
        onDownload
      );
      const fullText = transcript.segments.map((s) => s.text).join(' ');
      const combined = timeline.map((x) => x.text).join('\n');
      const canMeasure = points.inputQuota && typeof points.measureInputUsage === 'function';
      const pointsInput = canMeasure && (await points.measureInputUsage(fullText)) <= points.inputQuota ? fullText : combined;
      const keyPoints = await points.summarize(pointsInput);

      progress({ phase: 'final', done: parts.length + 1, total });
      const tldr =
        parts.length === 1
          ? timeline[0].text
          : await short.summarize(await fitToQuota(short, combined), {
              context: 'These are summaries of consecutive parts of one video. Summarize the whole video.',
            });

      return {
        engine: 'ai',
        lang: outputLang(),
        tldr: tldr.trim(),
        points: keyPoints.trim(),
        timeline: parts.length > 1 ? timeline : [],
        moments: [],
        keywords: keywords(fullText, transcript.lang, 8).list,
      };
    } finally {
      try {
        short.destroy && short.destroy();
        points && points.destroy && points.destroy();
      } catch (e) {
        /* ignore */
      }
    }
  }

  TM.summary = { aiAvailability, aiSummary, basicSummary, warmup, hasAI, _keywords: keywords, _sections: sections };
})(globalThis);
