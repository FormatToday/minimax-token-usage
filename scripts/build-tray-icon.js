const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const COLOR_OUTER = [79, 70, 229, 255];
const COLOR_INNER = [165, 180, 252, 255];
const COLOR_DOT = [255, 255, 255, 255];

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function pixelAt(x, y) {
  const cx = 15.5, cy = 15.5;
  const dx = x - cx, dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > 14.2) return [0, 0, 0, 0];
  if (r > 12.5) return COLOR_OUTER;
  if (r > 5) return COLOR_INNER;
  if (r > 2.5) return COLOR_DOT;
  return COLOR_INNER;
}

function generateIconBuffer() {
  const pixels = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    const offset = y * (1 + SIZE * 4);
    pixels[offset] = 0;
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const px = offset + 1 + x * 4;
      pixels[px] = r;
      pixels[px + 1] = g;
      pixels[px + 2] = b;
      pixels[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(pixels);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { generateIconBuffer };

if (require.main === module) {
  const outPath = path.join(__dirname, '..', 'build', 'tray-icon.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, generateIconBuffer());
  console.log(`[build-tray-icon] wrote ${outPath}`);
}