// Regenerates the splash mark assets from a single geometry definition.
//
//   bun run scripts/generate-splash-assets.mjs
//
// Writes `splash-icon{,-dark}.{svg,png}` into assets/images. The PNGs are what
// `expo-splash-screen` actually consumes; the SVGs are the design source and
// are emitted from the same numbers so the two can never drift.
//
// Two things this encodes that are easy to get wrong by hand:
//
// 1. Transparency. The mark must sit on a transparent canvas so the plugin's
//    `backgroundColor` shows through. A flattened (white-matted) export puts a
//    white square on the splash background — and in dark mode that means a
//    cream mark on white, which is effectively invisible.
//
// 2. The Android safe zone. Android 12+ draws `windowSplashScreenAnimatedIcon`
//    into a 288dp box and masks everything outside a 192dp circle, so only the
//    inner two thirds survive. `SAFE_RATIO` keeps the farthest ink well inside
//    that circle; see the note on the constant.
//
// Uses only Node builtins (zlib for the PNG deflate) so it needs no dependency
// beyond the toolchain the app already ships with.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.resolve(fileURLToPath(new URL('../assets/images', import.meta.url)));

/** Square canvas, in px. 768 covers `imageWidth: 180` at xxxhdpi (4x = 720px). */
const CANVAS = 768;

/** Rendered edge of the splash mark. Matches `assets/images/app-icon-foreground.svg`. */
const STROKE_COLOR = { light: '#574964', dark: '#FAF1E6' };

/**
 * The checkmark, in the 380-unit space of the app icon sources, so the splash
 * mark and the launcher icon are literally the same path.
 */
const POINTS = [
  [126, 195.5],
  [156.5, 233],
  [255, 147],
];
const STROKE_WIDTH = 29;

/**
 * Farthest ink, as a fraction of half the canvas.
 *
 * Android reveals a 192dp circle out of the 288dp icon box, so at
 * `imageWidth: N` the visible radius is 96dp and the mark's radius is
 * `SAFE_RATIO * N / 2`. At N=180 that is 64.8dp against a 96dp budget — a
 * comfortable margin rather than the hairline one you get from a mark drawn
 * edge to edge.
 */
const SAFE_RATIO = 0.72;

// ── geometry ──────────────────────────────────────────────────────────

const half = STROKE_WIDTH / 2;

// Round caps and joins mean the ink is exactly the set of points within
// `half` of the polyline, so the stroked bounds are the path bounds grown by
// `half` on every side.
const xs = POINTS.map(([x]) => x);
const ys = POINTS.map(([, y]) => y);
const bounds = {
  minX: Math.min(...xs) - half,
  maxX: Math.max(...xs) + half,
  minY: Math.min(...ys) - half,
  maxY: Math.max(...ys) + half,
};

// Center the stroked bounding box on the canvas, then scale about that center
// until the farthest ink lands exactly on the safe radius.
const boxCenter = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
const reach =
  Math.max(...POINTS.map(([x, y]) => Math.hypot(x - boxCenter[0], y - boxCenter[1]))) + half;
const scale = (SAFE_RATIO * (CANVAS / 2)) / reach;

/** Polyline and stroke width in canvas pixels. */
const pts = POINTS.map(([x, y]) => [
  (x - boxCenter[0]) * scale + CANVAS / 2,
  (y - boxCenter[1]) * scale + CANVAS / 2,
]);
const strokePx = STROKE_WIDTH * scale;

// ── rasterizer ────────────────────────────────────────────────────────

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance to the whole polyline. The union of round-capped segments is what gives round joins. */
function distanceToMark(px, py) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distanceToSegment(px, py, pts[i], pts[i + 1]));
  }
  return best;
}

/** 3x3 supersampled coverage, so the round caps stay smooth at every density. */
const SUBSAMPLES = 3;

function coverageAt(x, y) {
  const radius = strokePx / 2;
  let hits = 0;
  for (let sy = 0; sy < SUBSAMPLES; sy++) {
    for (let sx = 0; sx < SUBSAMPLES; sx++) {
      const px = x + (sx + 0.5) / SUBSAMPLES;
      const py = y + (sy + 0.5) / SUBSAMPLES;
      if (distanceToMark(px, py) <= radius) hits++;
    }
  }
  return hits / (SUBSAMPLES * SUBSAMPLES);
}

function renderRgba(hexColor) {
  const [r, g, b] = hexToRgb(hexColor);
  // One extra byte per row for the PNG per-scanline filter type.
  const raw = Buffer.alloc(CANVAS * (CANVAS * 4 + 1));
  for (let y = 0; y < CANVAS; y++) {
    const rowStart = y * (CANVAS * 4 + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < CANVAS; x++) {
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = Math.round(coverageAt(x, y) * 255);
    }
  }
  return raw;
}

function hexToRgb(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// ── PNG encoder ───────────────────────────────────────────────────────

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function encodePng(raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(CANVAS, 0);
  ihdr.writeUInt32BE(CANVAS, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── SVG ───────────────────────────────────────────────────────────────

const round = (n) => Number(n.toFixed(2));

function renderSvg(hexColor) {
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join(' ');
  return `<svg width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="${d}" stroke="${hexColor}" stroke-width="${round(strokePx)}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

// ── main ──────────────────────────────────────────────────────────────

for (const [theme, name] of [
  ['light', 'splash-icon'],
  ['dark', 'splash-icon-dark'],
]) {
  const color = STROKE_COLOR[theme];
  writeFileSync(path.join(OUT_DIR, `${name}.svg`), renderSvg(color));
  writeFileSync(path.join(OUT_DIR, `${name}.png`), encodePng(renderRgba(color)));
  console.log(`${name}.{svg,png}  ${CANVAS}x${CANVAS}  ${color}`);
}

console.log(
  `safe radius ${round(SAFE_RATIO * (CANVAS / 2))}px of ${CANVAS / 2}px ` +
    `(${round(SAFE_RATIO * 100)}% — Android reveals 66.7%)`
);
