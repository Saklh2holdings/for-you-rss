/**
 * Generates simple solid-color PNG icons for the Chrome extension.
 * Uses only Node built-ins (zlib, fs) — no extra dependencies.
 *
 * Icon design: dark blue (#1e3a5f) background, white "R" lettermark.
 */

import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'extension', 'icons');

// ---- PNG encoding helpers ----

function crc32(buf) {
  const table = makeCrcTable();
  let crc = 0xffffffff;
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

let _crcTable;
function makeCrcTable() {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    _crcTable[n] = c;
  }
  return _crcTable;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function encodePng(width, height, pixels) {
  // pixels: Uint8Array of RGBA values, row-major
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB (we'll drop alpha for simplicity)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data: filter byte (0) + RGB per row
  const rowSize = width * 3;
  const raw = Buffer.alloc((1 + rowSize) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (1 + rowSize)] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + rowSize) + 1 + x * 3;
      raw[dstIdx]     = pixels[srcIdx];     // R
      raw[dstIdx + 1] = pixels[srcIdx + 1]; // G
      raw[dstIdx + 2] = pixels[srcIdx + 2]; // B
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Icon drawing ----

const BG  = [30, 58, 95, 255];   // #1e3a5f  dark blue
const FG  = [255, 255, 255, 255]; // white

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4]     = BG[0];
    pixels[i * 4 + 1] = BG[1];
    pixels[i * 4 + 2] = BG[2];
    pixels[i * 4 + 3] = BG[3];
  }

  function setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i]     = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3];
  }

  function fillRect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, color);
  }

  // Draw a simple "R" lettermark scaled to icon size
  // Work in a 0..1 coordinate space then map to pixels
  const s = size;
  const pad = Math.max(1, Math.round(s * 0.18));
  const strokeW = Math.max(1, Math.round(s * 0.12));

  // Vertical stem of R
  fillRect(pad, pad, strokeW, s - pad * 2, FG);

  // Top bar of R (horizontal)
  const barH = Math.round((s - pad * 2) * 0.45);
  fillRect(pad, pad, s - pad * 2, strokeW, FG);

  // Right side of bump
  fillRect(s - pad - strokeW, pad, strokeW, barH, FG);

  // Bottom of bump
  fillRect(pad, pad + barH - strokeW, s - pad * 2, strokeW, FG);

  // Diagonal leg of R
  const legLen = s - pad * 2 - barH;
  for (let i = 0; i < legLen; i++) {
    const x = pad + strokeW + Math.round(i * ((s - pad * 2 - strokeW) / legLen));
    const y = pad + barH + i;
    fillRect(x, y, strokeW, strokeW, FG);
  }

  return encodePng(s, s, pixels);
}

// ---- Generate files ----

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  const outPath = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Written ${outPath} (${png.length} bytes)`);
}

console.log('Icons generated successfully.');
