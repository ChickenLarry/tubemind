#!/usr/bin/env node
/*
 * Draws the TubeMind icons (no dependencies): rounded square with a violet→pink gradient,
 * a white play triangle and a small "AI sparkle".
 *
 *   node scripts/make-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const C1 = [124, 58, 237]; // #7c3aed
const C2 = [219, 39, 119]; // #db2777

// ---------------------------------------------------------------- PNG encoder
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
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- shapes (unit square 0..1 of the tile)
function inRoundRect(x, y, r) {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r <= 0;
}
const TRI = [
  [0.36, 0.28],
  [0.36, 0.72],
  [0.72, 0.5],
];
function inTriangle(x, y) {
  const [a, b, c] = TRI;
  const s = (p, q) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1]);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function inSparkle(x, y) {
  const cx = 0.775;
  const cy = 0.235;
  const r = 0.115;
  const dx = Math.abs(x - cx) / r;
  const dy = Math.abs(y - cy) / r;
  return Math.sqrt(dx) + Math.sqrt(dy) <= 1;
}

function draw(size, margin, sparkle) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 6;
  const tile = size - margin * 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - margin) / tile;
          const y = (py + (sy + 0.5) / SS - margin) / tile;
          if (x < 0 || y < 0 || x > 1 || y > 1 || !inRoundRect(x, y, 0.23)) continue;
          let col;
          if (inTriangle(x, y) || (sparkle && inSparkle(x, y))) col = [255, 255, 255];
          else {
            const tt = Math.min(1, Math.max(0, (x + y) / 2));
            col = C1.map((c, i) => c + (C2[i] - c) * tt);
          }
          r += col[0];
          g += col[1];
          b += col[2];
          a += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return encodePng(size, rgba);
}

// Chrome Web Store: the 128px icon should have 16px transparent padding.
const SIZES = [
  { size: 16, margin: 0, sparkle: false },
  { size: 32, margin: 1, sparkle: true },
  { size: 48, margin: 2, sparkle: true },
  { size: 128, margin: 16, sparkle: true },
];
const outDir = path.join(ROOT, 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const { size, margin, sparkle } of SIZES) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), draw(size, margin, sparkle));
}
// big versions for the website / store listing
const assets = path.join(ROOT, 'website', 'assets');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, 'logo-256.png'), draw(256, 0, true));
fs.writeFileSync(path.join(ROOT, 'store', 'store-icon-128.png'), (fs.mkdirSync(path.join(ROOT, 'store'), { recursive: true }), draw(128, 16, true)));
console.log('✓ icons written');
