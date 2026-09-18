import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { LOCKUP_HEIGHT, clearSpace } from '../src/components/brand/geometry';
import { offences, read, sourceFiles } from './letterpress-rules';

const png = (path: string) => {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] };
};

/** Decodes an 8-bit, non-interlaced, colour-type-2 (RGB) or colour-type-6 (RGBA) PNG — the only two this
 * renderer ever emits. Unfilters every scanline per the PNG spec so pixel reads reflect the real rendered
 * image, not just the container's declared width/height/colour type. `pixel()` returns RGB only. */
const decodeRgbPng = (bytes: Buffer) => {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let offset = 8, width = 0, height = 0, channels = 3;
  const idat: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'expected 8-bit depth');
      assert.ok([2, 6].includes(data[9]), 'expected colour type 2 (RGB) or 6 (RGBA)');
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 8 + length + 4; // chunk data + 4-byte CRC
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos];
    pos += 1;
    const rowStart = y * stride;
    for (let i = 0; i < stride; i++) {
      const raw_x = raw[pos + i];
      const a = i >= channels ? out[rowStart + i - channels] : 0;
      const b = y > 0 ? out[rowStart - stride + i] : 0;
      const c = y > 0 && i >= channels ? out[rowStart - stride + i - channels] : 0;
      let value: number;
      if (filter === 0) value = raw_x;
      else if (filter === 1) value = raw_x + a;
      else if (filter === 2) value = raw_x + b;
      else if (filter === 3) value = raw_x + Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value = raw_x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`unsupported PNG filter ${filter}`);
      out[rowStart + i] = value & 0xff;
    }
    pos += stride;
  }
  return { width, height, pixel: (x: number, y: number): [number, number, number] => {
    const i = y * stride + x * channels;
    return [out[i], out[i + 1], out[i + 2]];
  } };
};

test('Next.js default SVGs are gone; favicon.svg and a 180px opaque apple-touch-icon are in public', () => {
  for (const name of ['next.svg', 'vercel.svg', 'file.svg', 'globe.svg', 'window.svg']) assert.ok(!existsSync(`public/${name}`), name);
  assert.deepEqual(png('public/apple-touch-icon.png'), { width: 180, height: 180, colourType: 2 });
});

test('favicon.svg is the block mark in ink, reversed for dark browser chrome, and nothing else', () => {
  const svg = read('public/favicon.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 18 18">/);
  assert.ok(svg.includes('path{fill:#121312}@media (prefers-color-scheme:dark){path{fill:#EFEDE4}}'));
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  // No linear/radial fill ramp, text, image, stroke, filter, radius or opacity.
  assert.doesNotMatch(svg, /<linear|<radial|<text|<image|stroke|filter|rx=|opacity/i);
});

test('favicon.ico holds one 32px PNG', () => {
  const ico = readFileSync('src/app/favicon.ico');
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(ico.readUInt32LE(18), 22);
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a');
  assert.equal(ico.readUInt32BE(22 + 16), 32);
  assert.equal(ico.readUInt32BE(22 + 20), 32);
});

test('favicon.ico header bit count matches the embedded PNG colour type, or Turbopack rejects it', () => {
  const ico = readFileSync('src/app/favicon.ico');
  const bitCount = ico.readUInt16LE(12); // ICONDIRENTRY.bitCount, offset 6 (ICONDIR) + 6 (width/height/colorCount/reserved/planes)
  const colourType = ico[22 + 25]; // PNG IHDR colour type, offset 22 (where the PNG starts) + 25
  // Turbopack's ICO decoder (Rust `image`/`ico` crate) requires the embedded PNG to actually be RGBA — a
  // correctly-declared-but-still-RGB payload is rejected too — so the renderer emits colour type 6 (RGBA,
  // 32bpp) here even though every pixel is fully opaque.
  assert.equal(colourType, 6, 'the rendered favicon PNG must be RGBA for Turbopack to decode the .ico');
  assert.equal(bitCount, 32, 'a colour-type-6 (RGBA) PNG is 32bpp; a mismatched header 500s Turbopack dev');
});

test('favicon.ico draws the solid block in its lower-right quadrant, not a smear of letters', () => {
  const ico = readFileSync('src/app/favicon.ico');
  const decoded = decodeRgbPng(ico.subarray(22));
  assert.equal(decoded.width, 32);
  assert.equal(decoded.height, 32);
  const ink: [number, number, number] = [0x12, 0x13, 0x12];
  const canvas: [number, number, number] = [0xf2, 0xef, 0xe7];
  // The block (LetterpressMarkGeometry.block at the icon's ~23px frame height, offset by its origin) sits at
  // roughly x:[15.5,22.6] y:[17.3,24.5] — a solid square, not a curved letterform stroke, so its corners and
  // centre are all fully ink. Sampled a pixel in from each edge to stay clear of anti-aliasing at the boundary.
  for (const [x, y] of [[17, 18], [21, 18], [17, 23], [21, 23], [19, 20]] as const) {
    assert.deepEqual(decoded.pixel(x, y), ink, `(${x},${y}) inside the block should be solid ink`);
  }
  // Well inside the frame but away from the block: plain canvas, confirming nothing else is drawn there.
  assert.deepEqual(decoded.pixel(8, 8), canvas, 'no ink outside the block and the frame rules');
});

test('root metadata links favicon.svg and the apple-touch-icon', () => {
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /icon:\s*\[\{\s*url:\s*'\/favicon\.svg',\s*type:\s*'image\/svg\+xml'\s*\}\s*\]/);
  assert.match(layout, /apple:\s*\[\{\s*url:\s*'\/apple-touch-icon\.png',\s*sizes:\s*'180x180',\s*type:\s*'image\/png'\s*\}\s*\]/);
});

test('the lockup replaces every placeholder mark, with clear space around it', () => {
  const sources = sourceFiles('src');
  assert.deepEqual(offences(/Stethoscope/, sources), []);
  assert.deepEqual(offences(/data-placeholder="wordmark"/, sources), []);

  const sidebar = read('src/components/layout/Sidebar.tsx');
  assert.match(sidebar, /import \{ Lockup \} from '@\/components\/brand\/Lockup';/);
  assert.match(sidebar, /<div className="px-4 pb-5 pt-6">\s*<Lockup height=\{LOCKUP_HEIGHT\.rail\} className="text-ink" \/>\s*<p className="eyebrow mt-3\.5">Clinician<\/p>/);
  // px-4 = 16px, pt-6 = 24px, mt-3.5 = 14px: each at least 0.5 × H.
  for (const px of [16, 24, 14]) assert.ok(px >= clearSpace(LOCKUP_HEIGHT.rail), `${px}px`);

  const shell = read('src/components/layout/AuthShell.tsx');
  assert.match(shell, /<div className="flex w-full flex-col px-6 py-8[^"]*">\s*<Lockup height=\{LOCKUP_HEIGHT\.signIn\} className="text-ink" \/>/);
  // px-6 = 24px and py-8 = 32px around the lockup; the next block adds py-10.
  for (const px of [24, 32]) assert.ok(px >= clearSpace(LOCKUP_HEIGHT.signIn), `${px}px`);
});
