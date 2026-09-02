const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TRAY_SIZE = 32;
const APP_ICON_SIZE = 256;
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

function pixelAt(size, x, y) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const dx = x - cx, dy = y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  const outerRing = size * 0.444;
  const innerRing = size * 0.391;
  const dotRing = size * 0.172;
  if (r > outerRing) return [0, 0, 0, 0];
  if (r > innerRing) return COLOR_OUTER;
  if (r > dotRing) return COLOR_INNER;
  if (r > size * 0.078) return COLOR_DOT;
  return COLOR_INNER;
}

function generateIconBuffer(size) {
  const pixels = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + size * 4);
    pixels[offset] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(size, x, y);
      const px = offset + 1 + x * 4;
      pixels[px] = r;
      pixels[px + 1] = g;
      pixels[px + 2] = b;
      pixels[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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

const trayIconBuffer = () => generateIconBuffer(TRAY_SIZE);
const appIconBuffer = () => generateIconBuffer(APP_ICON_SIZE);

module.exports = {
  generateIconBuffer,
  trayIconBuffer,
  appIconBuffer,
  TRAY_SIZE,
  APP_ICON_SIZE,
};

if (require.main === module) {
  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });

  const trayPath = path.join(outDir, 'tray-icon.png');
  fs.writeFileSync(trayPath, trayIconBuffer());
  console.log(`[build-tray-icon] wrote ${trayPath} (${TRAY_SIZE}x${TRAY_SIZE})`);

  const appIconPath = path.join(outDir, 'icon.png');
  fs.writeFileSync(appIconPath, appIconBuffer());
  console.log(`[build-tray-icon] wrote ${appIconPath} (${APP_ICON_SIZE}x${APP_ICON_SIZE})`);
}