const fs = require('fs');
const path = require('path');
const os = require('os');

const cacheRoot = process.env.ELECTRON_BUILDER_CACHE
  || (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'electron-builder')
      : path.join(os.homedir(), '.cache', 'electron-builder'));

const targets = ['winCodeSign'].map((name) => path.join(cacheRoot, name));

for (const dir of targets) {
  if (!fs.existsSync(dir)) continue;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('[clean] removed', dir);
  } catch (e) {
    console.warn('[clean] failed to remove', dir, '-', e.message);
  }
}