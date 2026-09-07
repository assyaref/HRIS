/**
 * Generates the Phase 9.7 PWA icons (PNG) without any dependency.
 *
 * Branding matches the application sidebar wordmark: a rounded dark tile
 * (`#18181b`) with a white "H" mark — same primary/brand colors used by
 * `components/layout/brand.tsx` and `app/globals.css`.
 *
 * Run: `node scripts/generate-pwa-icons.mjs`
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(rootDir, "public", "icons");

const BRAND_BG = [0x18, 0x18, 0x1b, 0xff]; // #18181b
const BRAND_FG = [0xfa, 0xfa, 0xfa, 0xff]; // #fafafa

/* ---------- PNG encoder ---------- */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- Drawing ---------- */

function createIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);

  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = color[3];
  };

  const fillRect = (x0, y0, x1, y1, color) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        setPixel(x, y, color);
      }
    }
  };

  // Background tile.
  fillRect(0, 0, size - 1, size - 1, BRAND_BG);

  // White "H" mark. Margins keep it inside the maskable safe zone.
  const margin = Math.round(size * 0.28);
  const thickness = Math.max(2, Math.round(size * 0.16));
  const x0 = margin;
  const x1 = size - 1 - margin;
  const barTop = margin;
  const barBottom = size - 1 - margin;
  const crossTop = Math.round(size / 2 - thickness / 2);
  const crossBottom = Math.round(size / 2 + thickness / 2);

  fillRect(x0, barTop, x0 + thickness, barBottom, BRAND_FG); // left bar
  fillRect(x1 - thickness, barTop, x1, barBottom, BRAND_FG); // right bar
  fillRect(x0, crossTop, x1, crossBottom, BRAND_FG); // crossbar

  return rgba;
}

mkdirSync(outputDir, { recursive: true });

const sizes = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of sizes) {
  writeFileSync(join(outputDir, file), encodePng(size, createIcon(size)));
  console.log(`generated public/icons/${file} (${size}x${size})`);
}
