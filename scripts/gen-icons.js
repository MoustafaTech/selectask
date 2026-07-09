'use strict';

// Generates all app icons as PNGs with zero image dependencies.
// Design: three lines of "text" with the middle line selected (highlight band)
// — the SelectAsk gesture, as an icon.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- minimal PNG encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(file, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${width}x${height})`);
}

/* ---------- shape rasterizer (unit coords, 3x3 supersampled) ---------- */

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

// point (u,v) inside a rounded rect: inside the bbox and, if in a corner
// region, within radius r of that corner's arc center
function inRoundRect(u, v, s) {
  const { x, y, w, h, r } = s;
  if (u < x || u > x + w || v < y || v > y + h) return false;
  const ax = Math.max(x + r, Math.min(u, x + w - r));
  const ay = Math.max(y + r, Math.min(v, y + h - r));
  const dx = u - ax, dy = v - ay;
  return dx * dx + dy * dy <= r * r;
}

function inTriangle(u, v, s) {
  const [[x1, y1], [x2, y2], [x3, y3]] = s.pts;
  const d1 = (u - x2) * (y1 - y2) - (x1 - x2) * (v - y2);
  const d2 = (u - x3) * (y2 - y3) - (x2 - x3) * (v - y3);
  const d3 = (u - x1) * (y3 - y1) - (x3 - x1) * (v - y1);
  const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && pos);
}

function inShape(u, v, s) {
  return s.pts ? inTriangle(u, v, s) : inRoundRect(u, v, s);
}

function render(file, size, shapes) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          // composite shapes top-down: last matching shape wins per sample
          let sr = 0, sg = 0, sb = 0, sa = 0;
          for (const s of shapes) {
            if (inShape(u, v, s)) {
              const [cr, cg, cb] = hex(s.color);
              const ca = s.alpha == null ? 1 : s.alpha;
              // source-over
              const na = ca + sa * (1 - ca);
              if (na > 0) {
                sr = (cr * ca + sr * sa * (1 - ca)) / na;
                sg = (cg * ca + sg * sa * (1 - ca)) / na;
                sb = (cb * ca + sb * sa * (1 - ca)) / na;
              }
              sa = na;
            }
          }
          r += sr; g += sg; b += sb; a += sa;
        }
      }
      const n = SS * SS;
      const idx = (py * size + px) * 4;
      rgba[idx] = Math.round(r / n);
      rgba[idx + 1] = Math.round(g / n);
      rgba[idx + 2] = Math.round(b / n);
      rgba[idx + 3] = Math.round((a / n) * 255);
    }
  }
  writePng(file, size, size, rgba);
}

/* ---------- designs ---------- */

const bar = (y, x0, x1, h, color, alpha) =>
  ({ x: x0, y: y - h / 2, w: x1 - x0, h, r: h / 2, color, alpha });

// App icon: ink rounded square, three text lines, middle line selected.
// Logo glyph: two faint text lines, a solid selected line, and an AI
// sparkle touching the selection — "ask AI about the text you selected".
const glyph = (dimAlpha, color) => ([
  { x: 0.18, y: 0.26, w: 0.56, h: 0.075, r: 0.037, color, alpha: dimAlpha },
  { x: 0.15, y: 0.43, w: 0.58, h: 0.19, r: 0.095, color },
  { x: 0.20, y: 0.70, w: 0.44, h: 0.075, r: 0.037, color, alpha: dimAlpha },
  { pts: [[0.80, 0.20], [0.87, 0.34], [0.80, 0.48]], color },
  { pts: [[0.80, 0.20], [0.73, 0.34], [0.80, 0.48]], color },
  { pts: [[0.66, 0.34], [0.80, 0.27], [0.94, 0.34]], color },
  { pts: [[0.66, 0.34], [0.80, 0.41], [0.94, 0.34]], color }
]);

const appShapes = [
  { x: 0.03, y: 0.03, w: 0.94, h: 0.94, r: 0.21, color: '#131316' },
  ...glyph(0.32, '#ffffff')
];

// Tray (macOS template): pure black, alpha carries the shape.
const trayTemplateShapes = glyph(0.45, '#000000');

// Tray (Windows/Linux): white on transparent.
const trayColorShapes = glyph(0.45, '#ffffff');

if (require.main === module) {
  const assets = path.join(__dirname, '..', 'assets');
  render(path.join(assets, 'icon.png'), 1024, appShapes);
  render(path.join(assets, 'trayTemplate.png'), 22, trayTemplateShapes);
  render(path.join(assets, 'trayTemplate@2x.png'), 44, trayTemplateShapes);
  render(path.join(assets, 'tray.png'), 32, trayColorShapes);
}

module.exports = { render, bar };
