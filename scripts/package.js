#!/usr/bin/env node
/*
 * Builds dist/tubemind-<version>.zip for the Chrome Web Store (no dependencies).
 * Runs the locale check first, so a broken translation never gets uploaded.
 *
 *   node scripts/package.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

execFileSync(process.execPath, [path.join(__dirname, 'build-locales.js')], { stdio: 'inherit' });

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.name.startsWith('.')) return [];
      return d.isDirectory() ? walk(p) : [p];
    })
    .sort();
}

// ---- minimal ZIP writer (deflate), forward slashes as the store requires
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const files = walk(EXT);
const locals = [];
const centrals = [];
let offset = 0;
const now = dosTime(new Date());

for (const file of files) {
  const name = Buffer.from(path.relative(EXT, file).split(path.sep).join('/'), 'utf8');
  const data = fs.readFileSync(file);
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(now.time, 10);
  local.writeUInt16LE(now.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, name, comp);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(now.time, 12);
  central.writeUInt16LE(now.date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + comp.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, `tubemind-${manifest.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`✓ ${path.relative(ROOT, out)} (${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
