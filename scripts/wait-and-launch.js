const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PORT_FILE = path.join(__dirname, '..', '.port');

function readPort(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const raw = fs.readFileSync(PORT_FILE, 'utf-8').trim();
        const port = parseInt(raw, 10);
        if (raw && Number.isFinite(port) && port > 0) return resolve(port);
      } catch (_) {}
      if (Date.now() > deadline) return reject(new Error(`Timeout waiting for ${PORT_FILE}`));
      setTimeout(tick, 300);
    };
    tick();
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) return reject(new Error(`Timeout waiting for ${url}`));
        setTimeout(tick, 300);
      });
      req.setTimeout(2000, () => req.destroy(new Error('timeout')));
    };
    tick();
  });
}

async function main() {
  const port = await readPort();
  const url = `http://localhost:${port}`;
  await waitForUrl(url);
  console.log(`[wait-and-launch] ${url} is up, starting electron`);

  const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  const child = spawn(electronBin, ['.'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => {
    if (signal) console.log(`[electron] killed with ${signal}`);
    else console.log(`[electron] exited with code ${code}`);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[wait-and-launch] failed:', err.message);
  process.exit(1);
});