const fs = require('fs');
const path = require('path');

const pathFile = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt');

if (!fs.existsSync(pathFile)) {
  process.exit(0);
}

const raw = fs.readFileSync(pathFile, 'utf-8');
const trimmed = raw.replace(/^[\r\n]+|[\r\n]+$/g, '');

if (raw !== trimmed) {
  fs.writeFileSync(pathFile, trimmed);
  console.log('[fix-electron-path] stripped trailing CRLF from electron/path.txt');
}
