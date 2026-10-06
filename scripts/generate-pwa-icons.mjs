/**
 * Generates the HRIS PWA icons + favicon from the ACTUAL brand logo.
 *
 * Reads `public/brand/hris-logo.png` (the real logo used by the sidebar brand),
 * extracts its emblem (the first contiguous blue mark band at the top of the
 * image, ignoring the "HRIS" wordmark and tagline), and renders it in its
 * original colors on a WHITE tile — mirroring exactly how the logo appears in
 * the sidebar brand tile (`bg-white` + the blue logo), so the favicon and all
 * PWA icons look identical to the dashboard logo. No invented monogram and no
 * alternate color scheme: every icon is derived from the actual logo mark.
 *
 * Run: `node scripts/generate-pwa-icons.mjs`
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(rootDir, "public", "icons");
const logoPath = join(rootDir, "public", "brand", "hris-logo.png");
const faviconPath = join(rootDir, "app", "favicon.ico");

const TILE_RGB = [0xff, 0xff, 0xff]; // #ffffff (logo tile = sidebar `bg-white`)

/* ---------- PNG decode (RGBA8 only) ---------- */

function decodePng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${file}`);
  let pos = 8;
  const chunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    chunks.push({
      type: buf.toString("ascii", pos + 4, pos + 8),
      data: buf.subarray(pos + 8, pos + 8 + len),
    });
    pos += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`unsupported PNG format (${file}): bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const idat = Buffer.concat(
    chunks.filter((c) => c.type === "IDAT").map((c) => c.data)
  );
  const raw = inflateSync(idat);
  const channels = 4;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let rowOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rowOffset];
    rowOffset += 1;
    const prevRow = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rowOffset + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prevRow ? prevRow[x] : 0;
      const upLeft = prevRow && x >= channels ? prevRow[x - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + left; break;
        case 2: value = rawByte + up; break;
        case 3: value = rawByte + Math.floor((left + up) / 2); break;
        case 4: value = rawByte + paeth(left, up, upLeft); break;
        default: throw new Error(`unsupported PNG filter ${filter}`);
      }
      row[x] = value & 0xff;
    }
    rowOffset += stride;
  }
  return { width, height, rgba: out };
}

/* ---------- Emblem extraction ---------- */

const LOGO_BLUE_MIN = (r, g, b) => b > 130 && b - r > 60 && b - g > 40;

/**
 * Extract the emblem (first contiguous blue band) as a boolean coverage mask.
 * Returns { mask, width, height }.
 */
function extractEmblem(logo) {
  const { width, height, rgba } = logo;
  const isBlue = (o) =>
    rgba[o + 3] >= 60 && LOGO_BLUE_MIN(rgba[o], rgba[o + 1], rgba[o + 2]);

  const rowCount = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    let c = 0;
    for (let x = 0; x < width; x += 1) if (isBlue((y * width + x) * 4)) c += 1;
    rowCount[y] = c;
  }

  let top = -1;
  for (let y = 0; y < height; y += 1) {
    if (rowCount[y] > 0) { top = y; break; }
  }
  if (top < 0) throw new Error("no blue brand mark found in logo");

  // First band below the top row. The emblem is a fully contiguous blue band
  // (no interior empty rows), while the "HRIS" wordmark is separated by a
  // small run of empty rows — so splitting at the FIRST empty row isolates the
  // emblem exactly.
  let bottom = top;
  for (let y = top + 1; y < height; y += 1) {
    if (rowCount[y] > 0) bottom = y;
    else break;
  }

  let minX = width;
  let maxX = -1;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isBlue((y * width + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  const mw = maxX - minX + 1;
  const mh = bottom - top + 1;
  const mask = Buffer.alloc(mw * mh);
  const mark = Buffer.alloc(mw * mh * 4);
  for (let y = 0; y < mh; y += 1) {
    for (let x = 0; x < mw; x += 1) {
      const o = ((top + y) * width + (minX + x)) * 4;
      const blue = isBlue(o);
      mask[y * mw + x] = blue ? 255 : 0;
      const d = (y * mw + x) * 4;
      if (blue) {
        mark[d] = rgba[o];
        mark[d + 1] = rgba[o + 1];
        mark[d + 2] = rgba[o + 2];
        mark[d + 3] = rgba[o + 3];
      }
    }
  }
  return { mask, rgba: mark, width: mw, height: mh };
}

/* ---------- Render ---------- */

/**
 * Area-average downsample of the emblem's RGBA (premultiplied) to `dw x dh`.
 * Each output texel stores premultiplied color + coverage: (r*a, g*a, b*a, a).
 */
function downsampleRGBA(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const y0 = (y * sh) / dh;
    const y1 = ((y + 1) * sh) / dh;
    for (let x = 0; x < dw; x += 1) {
      const x0 = (x * sw) / dw;
      const x1 = ((x + 1) * sw) / dw;
      const sy0 = Math.floor(y0);
      const sy1 = Math.min(sh - 1, Math.max(sy0, Math.ceil(y1) - 1));
      const sx0 = Math.floor(x0);
      const sx1 = Math.min(sw - 1, Math.max(sx0, Math.ceil(x1) - 1));
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      let weight = 0;
      for (let sy = sy0; sy <= sy1; sy += 1) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = sx0; sx <= sx1; sx += 1) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          const w = wy * wx;
          const o = (sy * sw + sx) * 4;
          const a = src[o + 3] / 255;
          pr += src[o] * a * w;
          pg += src[o + 1] * a * w;
          pb += src[o + 2] * a * w;
          pa += a * w;
          weight += w;
        }
      }
      const d = (y * dw + x) * 4;
      if (weight > 0) {
        out[d] = pr / weight;
        out[d + 1] = pg / weight;
        out[d + 2] = pb / weight;
        out[d + 3] = pa / weight;
      }
    }
  }
  return out;
}

/**
 * Render one square tile: rounded-rect WHITE tile (mirrors the sidebar brand
 * tile) with the emblem drawn in its original logo colors.
 * `radius` is 0..0.5 as a fraction of size (0 = full square, e.g. maskable).
 * The glyph box is `[margin, margin, boxSize, boxSize]` with `boxSize` as a
 * fraction of size — the mark is fitted (contain) and centered inside.
 */
function renderTile(size, radiusFraction, glyphBoxFraction, emblem) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const r = radiusFraction * size;

  // Signed-distance rounded-rect: straight edges flush to the tile, corners
  // rounded to radius `r`. White tile, opaque inside the tile (matches the
  // sidebar `bg-white` brand tile).
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5 - c;
      const py = y + 0.5 - c;
      const qx = Math.abs(px) - c + r;
      const qy = Math.abs(py) - c + r;
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const distance = outside + inside - r;
      const alpha = Math.min(1, Math.max(0, 0.5 - distance));
      const o = (y * size + x) * 4;
      rgba[o] = TILE_RGB[0];
      rgba[o + 1] = TILE_RGB[1];
      rgba[o + 2] = TILE_RGB[2];
      rgba[o + 3] = Math.round(alpha * 255);
    }
  }

  const box = Math.max(1, Math.round(glyphBoxFraction * size));
  const offset = Math.round((size - box) / 2);
  const scale = Math.min(box / emblem.width, box / emblem.height);
  const dw = Math.max(1, Math.round(emblem.width * scale));
  const dh = Math.max(1, Math.round(emblem.height * scale));
  const glyph = downsampleRGBA(emblem.rgba, emblem.width, emblem.height, dw, dh);
  const ox = offset + Math.round((box - dw) / 2);
  const oy = offset + Math.round((box - dh) / 2);

  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const o = (y * dw + x) * 4;
      const a = glyph[o + 3];
      if (a <= 0) continue;
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const d = (py * size + px) * 4;
      // out = white*(1-a) + emblemPremultiplied
      rgba[d] = Math.round(TILE_RGB[0] + (glyph[o] - TILE_RGB[0] * a));
      rgba[d + 1] = Math.round(TILE_RGB[1] + (glyph[o + 1] - TILE_RGB[1] * a));
      rgba[d + 2] = Math.round(TILE_RGB[2] + (glyph[o + 2] - TILE_RGB[2] * a));
      rgba[d + 3] = 255;
    }
  }

  return rgba;
}

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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- ICO encoder (32bpp with alpha, favicon) ---------- */

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const pixelBuffers = [];
  let offset = 6 + images.length * 16;
  for (const { size, rgba } of images) {
    const bmpHeader = Buffer.alloc(40);
    bmpHeader.writeUInt32LE(40, 0); // biSize
    bmpHeader.writeInt32LE(size, 4); // biWidth
    bmpHeader.writeInt32LE(size * 2, 8); // biHeight (XOR + AND)
    bmpHeader.writeUInt16LE(1, 12); // biPlanes
    bmpHeader.writeUInt16LE(32, 14); // biBitCount
    bmpHeader.writeUInt32LE(0, 16); // biCompression

    const xor = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const src = (y * size + x) * 4;
        const dst = ((size - 1 - y) * size + x) * 4;
        xor[dst] = rgba[src + 2]; // B
        xor[dst + 1] = rgba[src + 1]; // G
        xor[dst + 2] = rgba[src]; // R
        xor[dst + 3] = rgba[src + 3]; // A
      }
    }

    const andStride = Math.ceil(size / 8);
    const andPadded = Math.ceil(andStride / 4) * 4;
    const andMask = Buffer.alloc(andPadded * size); // all zero (fully opaque)

    const image = Buffer.concat([bmpHeader, xor, andMask]);
    const entry = Buffer.alloc(16);
    entry[0] = size; // width (valid for 16/32)
    entry[1] = size; // height
    entry[2] = 0; // palette count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(image.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    offset += image.length;
    entries.push(entry);
    pixelBuffers.push(image);
  }

  return Buffer.concat([header, ...entries, ...pixelBuffers]);
}

/* ---------- Generate ---------- */

const logo = decodePng(logoPath);
const emblem = extractEmblem(logo);
console.log(
  `emblem extracted from logo: ${emblem.width}x${emblem.height}`
);

mkdirSync(outputDir, { recursive: true });

// Content icons: 512 is a full square (maskable/tile-friendly), the iOS/home
// tiles keep the pre-existing heavy rounding (~0.44) so the set's look stays
// consistent — all white tiles with the logo mark in its original colors.
const tiles = [
  { file: "icon-512.png", size: 512, radius: 0 },
  { file: "hris-mark-512.png", size: 512, radius: 0 },
  { file: "icon-192.png", size: 192, radius: 0.44 },
  { file: "apple-touch-icon.png", size: 180, radius: 0.44 },
];

for (const { file, size, radius } of tiles) {
  const glyphBoxFraction = 0.46;
  const rgba = renderTile(size, radius, glyphBoxFraction, emblem);
  writeFileSync(join(outputDir, file), encodePng(size, rgba));
  console.log(`generated public/icons/${file} (${size}x${size})`);
}

const smallTiles = [16, 32, 48].map((size) => ({
  size,
  rgba: renderTile(size, 0.18, 0.46, emblem),
}));
writeFileSync(faviconPath, encodeIco(smallTiles));
console.log(
  `generated app/favicon.ico (${smallTiles.map((t) => `${t.size}x${t.size}`).join(", ")})`
);