#!/usr/bin/env node
/*
 * TubeMind – self tests without a browser (no dependencies).
 *
 *   node scripts/test.js          # unit tests + project checks
 *   node scripts/test.js --live   # additionally fetches a real YouTube transcript
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const LIVE = process.argv.includes('--live');

let passed = 0;
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
// objects from the VM sandbox have their own prototypes – compare plain copies
const plain = (v) => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------------ sandbox with a fake chrome API
function makeSandbox() {
  const messages = JSON.parse(fs.readFileSync(path.join(EXT, '_locales/en/messages.json'), 'utf8'));
  const data = {};
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const chrome = {
    runtime: { id: 'testid', getManifest: () => JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')) },
    i18n: {
      getUILanguage: () => 'de-CH',
      getMessage: (key, subs) => {
        const m = messages[key];
        if (!m) return '';
        const list = [].concat(subs || []);
        return m.message.replace(/\$(\d)/g, (_, n) => list[n - 1] ?? '');
      },
    },
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return clone(data);
          const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
          const out = {};
          for (const k of list) if (k in data) out[k] = clone(data[k]);
          return out;
        },
        async set(obj) {
          for (const [k, v] of Object.entries(obj)) data[k] = clone(v);
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete data[k];
        },
        async clear() {
          for (const k of Object.keys(data)) delete data[k];
        },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  const sandbox = { chrome, console, URL, URLSearchParams, setTimeout, clearTimeout, Blob: class {}, TextEncoder };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  sandbox.__data = data;
  return sandbox;
}

function load(sandbox, rel) {
  vm.runInContext(fs.readFileSync(path.join(EXT, rel), 'utf8'), sandbox, { filename: rel });
}

function freshTM() {
  const sb = makeSandbox();
  ['src/shared/config.js', 'src/shared/utils.js', 'src/shared/textsearch.js', 'src/shared/settings.js', 'src/shared/store.js', 'src/shared/export.js'].forEach((f) =>
    load(sb, f)
  );
  return sb;
}

// ------------------------------------------------------------------ project checks
test('all JS files have valid syntax', () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const files = [...walk(path.join(EXT, 'src')), ...walk(path.join(ROOT, 'scripts')), ...walk(path.join(ROOT, 'website', 'assets'))].filter((f) => f.endsWith('.js'));
  for (const f of files) execFileSync(process.execPath, ['--check', f]);
});

test('manifest references existing files', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const refs = [
    ...Object.values(m.icons),
    ...Object.values(m.action.default_icon),
    m.action.default_popup,
    m.side_panel.default_path,
    m.options_page,
    m.background.service_worker,
    ...m.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ];
  for (const r of refs) assert.ok(fs.existsSync(path.join(EXT, r)), 'missing ' + r);
});

test('HTML pages reference existing scripts and styles', () => {
  for (const page of ['popup/popup.html', 'sidepanel/sidepanel.html', 'library/library.html', 'options/options.html']) {
    const file = path.join(EXT, 'src', page);
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png))"/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), m[1])), `${page}: missing ${m[1]}`);
    }
    assert.ok(!/<script>[\s\S]*?<\/script>/.test(html.replace(/<script src[^>]*><\/script>/g, '')), `${page}: inline scripts are blocked by MV3 CSP`);
  }
});

test('content scripts avoid innerHTML (YouTube enforces Trusted Types)', () => {
  const dir = path.join(EXT, 'src/content');
  const files = [...fs.readdirSync(dir).map((f) => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'modules')).map((f) => path.join(dir, 'modules', f))];
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/\.innerHTML\s*=|\bhtml:\s/.test(code), path.basename(f) + ' uses innerHTML');
  }
});

test('service worker imports exist', () => {
  const sw = fs.readFileSync(path.join(EXT, 'src/background/service-worker.js'), 'utf8');
  const imports = [...sw.matchAll(/'(\.\.\/shared\/[\w.-]+\.js)'/g)].map((m) => m[1]);
  assert.ok(imports.length >= 3);
  for (const i of imports) assert.ok(fs.existsSync(path.resolve(EXT, 'src/background', i)), 'missing ' + i);
});

test('locales are complete and identical in keys', () => {
  const langs = ['en', 'de', 'fr', 'it'].map((l) => JSON.parse(fs.readFileSync(path.join(EXT, `_locales/${l}/messages.json`), 'utf8')));
  const keys = Object.keys(langs[0]).sort().join();
  for (const l of langs) assert.equal(Object.keys(l).sort().join(), keys);
  execFileSync(process.execPath, [path.join(__dirname, 'build-locales.js')], { stdio: 'pipe' });
});

test('website sponsor.json is valid and matches the extension schema', () => {
  const sb = freshTM();
  load(sb, 'src/ui/sponsor.js');
  const feed = JSON.parse(fs.readFileSync(path.join(ROOT, 'website/sponsor.json'), 'utf8'));
  assert.ok(Array.isArray(feed.items));
  const item = { ...feed.items[0], active: true };
  assert.equal(sb.TM.sponsor._isValid(item, 'popup', 'de'), true);
  assert.equal(sb.TM.sponsor._isValid({ ...item, url: 'http://insecure.example' }, 'popup', 'de'), false);
  assert.equal(sb.TM.sponsor._isValid({ ...item, placements: ['library'] }, 'popup', 'de'), false);
  assert.equal(sb.TM.sponsor._isValid({ ...item, end: '2000-01-01' }, 'popup', 'de'), false);
  assert.equal(sb.TM.sponsor._isValid(feed.items[0], 'popup', 'de'), false, 'example sponsor must ship inactive');
});

// ------------------------------------------------------------------ unit tests
test('utils: time formatting', () => {
  const { utils } = freshTM().TM;
  assert.equal(utils.formatTime(0), '0:00');
  assert.equal(utils.formatTime(75), '1:15');
  assert.equal(utils.formatTime(3725), '1:02:05');
  assert.equal(utils.formatDuration(4210), '1 h 10 min');
  assert.equal(utils.formatDuration(59), '0 min');
});

test('utils: normalizeForSearch keeps length (needed for highlighting)', () => {
  const { utils } = freshTM().TM;
  for (const s of ['Über Größe', 'Ça va déjà', 'İstanbul', 'emoji 🎉 test', 'ÀÉÎÕÜ']) {
    assert.equal(utils.normalizeForSearch(s).length, s.length, s);
  }
  assert.equal(utils.normalizeForSearch('Über Café'), 'uber cafe');
});

test('utils: markdown renderer escapes HTML', () => {
  const { utils } = freshTM().TM;
  const html = utils.renderMarkdownLite('* **Bold** point\n* <script>x</script>\nText');
  assert.ok(html.includes('<strong>Bold</strong>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.startsWith('<ul><li>'));
});

test('settings: deep merge with defaults', async () => {
  const { TM } = freshTM();
  let s = await TM.settings.get();
  assert.equal(s.focus.enabled, false);
  s = await TM.settings.set({ focus: { enabled: true } });
  assert.equal(s.focus.enabled, true);
  assert.equal(s.focus.hideShorts, true, 'other defaults kept');
  s = await TM.settings.set({ player: { maxSpeed: 8 } });
  assert.equal(s.focus.enabled, true, 'earlier patch kept');
  assert.equal(s.player.maxSpeed, 8);
});

const SEGMENTS = [
  { s: 0, d: 4, text: 'Welcome to this video about neural' },
  { s: 4, d: 4, text: 'networks and how they learn.' },
  { s: 8, d: 5, text: 'A neural network is made of layers.' },
  { s: 13, d: 6, text: 'Each layer transforms the input; Über-Schicht!' },
];

test('textsearch: finds phrases across segment borders', () => {
  const { TM } = freshTM();
  const index = TM.textsearch.buildIndex(SEGMENTS);
  const hits = TM.textsearch.find(index, 'neural networks');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].i, 0);
  assert.ok(hits[0].t > 0 && hits[0].t < 4);
  assert.equal(TM.textsearch.find(index, 'NEURAL').length, 2);
  assert.equal(TM.textsearch.find(index, 'uber-schicht').length, 1, 'accent-insensitive');
  assert.equal(TM.textsearch.find(index, 'x').length, 0, 'too short');
  const sn = TM.textsearch.snippet(index, TM.textsearch.find(index, 'layers')[0], 10);
  assert.equal(sn.match, 'layers');
});

function loadTranscriptModule() {
  const sb = freshTM();
  sb.TM.handle = () => {};
  sb.TM.state = { videoId: null, pageTracks: [] };
  load(sb, 'src/content/transcript.js');
  return sb.TM;
}

test('transcript: json3 parsing (manual + auto-generated format)', () => {
  const TM = loadTranscriptModule();
  const segs = TM.transcript._parseJson3({
    events: [
      { tStartMs: 0, dDurationMs: 2000 },
      { tStartMs: 1200, dDurationMs: 3000, segs: [{ utf8: 'hello' }, { utf8: ' world', tOffsetMs: 400 }] },
      { tStartMs: 3000, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
      { tStartMs: 4200, dDurationMs: 2500, segs: [{ utf8: 'second   line\n' }] },
    ],
  });
  assert.equal(segs.length, 2);
  assert.deepEqual(plain(segs[0]), { s: 1.2, d: 3, text: 'hello world' });
  assert.equal(segs[1].text, 'second line');
});

test('transcript: track choice prefers UI language, then original language', () => {
  const TM = loadTranscriptModule();
  const tracks = [
    { languageCode: 'en', kind: '', name: 'English' },
    { languageCode: 'en', kind: 'asr', name: 'English (auto)' },
    { languageCode: 'fr', kind: '', name: 'French' },
  ];
  assert.equal(TM.transcript._pickTrack(tracks).languageCode, 'en', 'no German track → original (en) manual');
  assert.equal(TM.transcript._pickTrack([...tracks, { languageCode: 'de', kind: '', name: 'Deutsch' }]).languageCode, 'de');
  assert.equal(TM.transcript._pickTrack(tracks, 'fr').languageCode, 'fr');
  assert.equal(TM.transcript._pickTrack(tracks, 'en:asr').kind, 'asr');
  assert.equal(TM.transcript._pickTrack([]), null);
});

function loadSummary() {
  const sb = freshTM();
  load(sb, 'src/sidepanel/summary.js');
  return sb.TM;
}

function longTranscript() {
  const topics = ['photosynthesis converts light energy', 'chlorophyll absorbs light', 'carbon dioxide and water', 'glucose and oxygen are produced'];
  const segs = [];
  for (let i = 0; i < 240; i++) {
    const topic = topics[Math.floor(i / 60)];
    segs.push({ s: i * 5, d: 5, text: `so um basically ${topic} and the plant cell uses it number ${i}` });
  }
  return { lang: 'en', segments: segs };
}

test('summary: basic engine returns moments, timeline and keywords', () => {
  const TM = loadSummary();
  const tr = longTranscript();
  const r = TM.summary.basicSummary(tr);
  assert.equal(r.engine, 'basic');
  assert.ok(r.moments.length >= 3 && r.moments.length <= 7, 'moments ' + r.moments.length);
  for (let i = 1; i < r.moments.length; i++) assert.ok(r.moments[i].t - r.moments[i - 1].t >= 60, 'moments are spread out');
  assert.ok(r.timeline.length >= 2);
  assert.ok(r.keywords.length > 3);
  assert.ok(!r.keywords.includes('basically') && !r.keywords.includes('um'), 'stop words removed: ' + r.keywords);
});

test('summary: sections respect character budget', () => {
  const TM = loadSummary();
  const tr = longTranscript();
  const parts = TM.summary._sections(tr.segments, 2000);
  const total = tr.segments.reduce((n, s) => n + s.text.length + 1, 0);
  assert.ok(parts.length >= Math.ceil(total / 2000) || parts.length === 12);
  assert.equal(parts[0].t, 0);
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i].t > parts[i - 1].t);
});

test('summary: AI engine with a mocked Chrome Summarizer', async () => {
  const sb = freshTM();
  let created = 0;
  sb.Summarizer = {
    availability: async () => 'available',
    create: async (opts) => {
      created++;
      assert.ok(['tldr', 'key-points'].includes(opts.type));
      return {
        inputQuota: 4000,
        measureInputUsage: async (txt) => Math.ceil(txt.length / 4),
        summarize: async (txt) => (opts.type === 'tldr' ? `Summary of ${txt.length} chars.` : '* Point one\n* Point two'),
        destroy() {},
      };
    },
  };
  load(sb, 'src/sidepanel/summary.js');
  const progress = [];
  const r = await sb.TM.summary.aiSummary(longTranscript(), { title: 'Plants', channel: 'Bio' }, { summary: { length: 'medium' } }, (p) => progress.push(p.phase));
  assert.equal(r.engine, 'ai');
  assert.equal(r.lang, 'de', 'output in UI language');
  assert.ok(r.tldr.startsWith('Summary of'));
  assert.ok(r.points.includes('Point one'));
  assert.ok(r.timeline.length >= 2);
  assert.ok(progress.includes('section') && progress.includes('final'));
  assert.equal(created, 2);
  assert.equal(await sb.TM.summary.aiAvailability(), 'available');
});

test('store: notes, library index, stats, backup round-trip', async () => {
  const sb = freshTM();
  const { store } = sb.TM;
  const meta = { id: 'abc123', title: 'Test video', channel: 'Chan', channelId: 'UC1', duration: 600 };
  const n1 = await store.addNote(meta, { t: 42, text: '  first  ' });
  await store.addNote(meta, { t: 10, text: '', kind: 'bookmark' });
  let notes = await store.getNotes('abc123');
  assert.deepEqual(plain(notes.map((n) => n.t)), [10, 42], 'sorted by time');
  assert.equal(notes[1].text, 'first');
  assert.equal((await store.getIndex()).abc123.noteCount, 2);
  await store.updateNote('abc123', n1.id, { text: 'edited' });
  await store.deleteNote('abc123', notes[0].id);
  notes = await store.getNotes('abc123');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'edited');
  assert.equal((await store.getIndex()).abc123.title, 'Test video', 'title kept after note edits');

  await store.addWatch(30, { channel: 'Chan' });
  await store.addWatch(15, { shorts: true });
  const today = (await store.getStats())[sb.TM.utils.dayKey()];
  assert.equal(today.w, 45);
  assert.equal(today.s, 15);
  assert.equal(today.c.Chan, 30);

  const backup = await store.exportAll();
  await store.clearAll();
  assert.deepEqual(plain(await store.getIndex()), {});
  await store.importAll(JSON.parse(JSON.stringify(backup)));
  assert.equal((await store.getNotes('abc123')).length, 1);
  await assert.rejects(() => store.importAll({ app: 'Other' }));

  await store.deleteVideo('abc123');
  assert.equal((await store.getNotes('abc123')).length, 0);
});

test('export: markdown contains timestamp links', () => {
  const { TM } = freshTM();
  const md = TM.exporter.videoMarkdown({ id: 'vid', title: 'T', channel: 'C' }, [{ t: 75, text: 'note\nline' }], {
    tldr: 'Short',
    points: '* a',
    timeline: [{ t: 0, text: 'start' }],
  });
  assert.ok(md.includes('[1:15](https://www.youtube.com/watch?v=vid&t=75s) note line'));
  assert.ok(md.includes('# T'));
});

// ------------------------------------------------------------------ live test (network)
if (LIVE) {
  test('LIVE: real YouTube transcript via Android client → parse → search → basic summary', async () => {
    const TM = loadTranscriptModule();
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
        videoId: 'aircAruvnKk',
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });
    const json = await res.json();
    const tracks = json.captions.playerCaptionsTracklistRenderer.captionTracks.map((t) => ({
      baseUrl: t.baseUrl,
      languageCode: t.languageCode,
      kind: t.kind || '',
      name: t.name?.simpleText || '',
    }));
    const track = TM.transcript._pickTrack(tracks, 'en');
    const u = new URL(track.baseUrl);
    u.searchParams.set('fmt', 'json3');
    const segments = TM.transcript._parseJson3(await (await fetch(u)).json());
    assert.ok(segments.length > 100, 'segments: ' + segments.length);
    const index = TM.textsearch.buildIndex(segments);
    const hits = TM.textsearch.find(index, 'neuron');
    assert.ok(hits.length > 5, 'hits: ' + hits.length);
    const S = loadSummary();
    const sum = S.summary.basicSummary({ lang: 'en', segments });
    console.log('    keywords:', sum.keywords.join(', '));
    console.log('    first moment:', sum.moments[0] && sum.moments[0].text.slice(0, 90));
    assert.ok(sum.keywords.some((k) => /neuron|network|layer/.test(k)));
  });
}

// ------------------------------------------------------------------ run
(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log('  ✓ ' + name);
    } catch (e) {
      failed++;
      console.log('  ✗ ' + name + '\n      ' + (e && e.message ? e.message.split('\n').join('\n      ') : e));
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
