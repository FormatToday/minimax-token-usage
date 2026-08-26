const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const START_PORT = parseInt(process.env.DEV_PORT || '5174', 10);
const MAX_PORT = START_PORT + 100;

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function findFreePort() {
  for (let port = START_PORT; port <= MAX_PORT; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in range ${START_PORT}-${MAX_PORT}`);
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
        if (Date.now() > deadline) {
          reject(new Error(`Timeout waiting for ${url}`));
          return;
        }
        setTimeout(tick, 300);
      });
      req.setTimeout(2000, () => req.destroy(new Error('timeout')));
    };
    tick();
  });
}

function spawnLogged(name, command, args, extraEnv) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${name}] killed with ${signal}`);
    } else {
      console.log(`[${name}] exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });
  return child;
}

async function main() {
  const port = await findFreePort();
  if (port !== START_PORT) {
    console.log(`[dev] port ${START_PORT} is busy, switching to ${port}`);
  }

  const viteBin = path.join(__dirname, '..', 'node_modules', '.bin', 'vite');
  spawnLogged('vite', viteBin, [], { DEV_PORT: String(port) });

  const url = `http://localhost:${port}`;
  await waitForUrl(url);
  console.log(`[dev] ${url} is up, starting electron`);

  const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');
  spawnLogged('electron', electronBin, ['.'], {});
}

main().catch((err) => {
  console.error('[dev] failed:', err.message);
  process.exit(1);
});