#!/usr/bin/env node
/*
 * Generates extension/_locales/{en,de,fr,it}/messages.json from scripts/translations.js
 * and checks that every text used in the code exists (and fits the store limits).
 *
 *   node scripts/build-locales.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const LANGS = ['en', 'de', 'fr', 'it'];
const translations = require('./translations.js');

let errors = 0;
const fail = (msg) => {
  errors++;
  console.error('✗ ' + msg);
};

// ---- 1. validate the table
for (const [key, values] of Object.entries(translations)) {
  if (!/^[A-Za-z0-9_]+$/.test(key)) fail(`invalid key name "${key}"`);
  if (!Array.isArray(values) || values.length !== LANGS.length || values.some((v) => typeof v !== 'string' || !v.trim())) {
    fail(`"${key}" needs ${LANGS.length} non-empty texts`);
    continue;
  }
  const placeholders = values.map((v) => (v.match(/\$\d/g) || []).sort().join(','));
  if (new Set(placeholders).size > 1) fail(`"${key}" uses different $-placeholders per language: ${placeholders.join(' | ')}`);
}
LANGS.forEach((lang, i) => {
  const name = translations.extName[i];
  const desc = translations.extDescription[i];
  if (name.length > 75) fail(`extName (${lang}) is ${name.length} chars, max 75`);
  if (desc.length > 132) fail(`extDescription (${lang}) is ${desc.length} chars, max 132`);
});

// ---- 2. every key used in the code must exist
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const used = new Set(['extName', 'extDescription']);
for (const file of walk(path.join(EXT, 'src'))) {
  if (!/\.(js|html)$/.test(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-placeholder|-title)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    for (const q of m[1].matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)) used.add(q[1]);
  }
  if (file.endsWith('options.js')) {
    for (const m of src.matchAll(/(?:label|help|title|desc): '([A-Za-z]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\[[^\]]*?, '([a-zA-Z]+)'\]/g)) used.add(m[1]);
  }
}
const IGNORE = new Set(['ai', 'bookmark']); // string literals inside t(...) conditions, not keys
for (const key of used) {
  if (!IGNORE.has(key) && !translations[key]) fail(`key "${key}" is used in the code but missing in translations.js`);
}
const unused = Object.keys(translations).filter((k) => !used.has(k));
if (unused.length) console.warn('! unused keys: ' + unused.join(', '));

if (errors) {
  console.error(`\n${errors} problem(s) – locales NOT written.`);
  process.exit(1);
}

// ---- 3. write messages.json
LANGS.forEach((lang, i) => {
  const out = {};
  for (const [key, values] of Object.entries(translations)) out[key] = { message: values[i] };
  const dir = path.join(EXT, '_locales', lang);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'messages.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
});
console.log(`✓ ${Object.keys(translations).length} texts written for ${LANGS.join(', ')}`);
