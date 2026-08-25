const { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

if (!isDev) {
  const exeDir = path.dirname(app.getPath('exe'));
  app.setPath('userData', path.join(exeDir, 'userData'));
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

function clampOpacity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0.3, n));
}

function applyWindowOpacity(v) {
  if (mainWindow) mainWindow.setOpacity(clampOpacity(v));
}

function createWindow() {
  const cfg = readConfig();

  mainWindow = new BrowserWindow({
    width: 520,
    height: 280,
    minWidth: 480,
    minHeight: 220,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    title: 'MiniMax Token Usage',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyWindowOpacity(cfg.opacity ?? 0.95);

  if (process.platform === 'darwin') {
    app.dock && app.dock.hide();
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

const TRAY_ICON_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADAElEQVR4nM2Xv0ubYRDHhUAaSIhBCiJKrA6BCMGAFUH8NZhBJCgEBDFg6sGhEDCTOgQiCC4JurjooCA4uOgqFHFzE8HVwbVbub+gfR74BMRapVR4M7wcHHff7909d/c+T5uotQX5/atDSNQiohYVtbiotYtaAhlHH8HuQwMIi1pM1DpErVPUukUtKWq9ovYFmUTfiV0Mv/8KIATQZ8D7RC0lagOilhG1QVHLIjPoU9h14xd7qyLvZe3L2yVq/aKWhmxY1EZFbVzUJkWtCjmOfhi7NH5d4Lxajb+Rf6KMPWTkMxwRtQlRmxa1GVHLi9qcqM0j8+insRvBLwVOB7jvBhDGOEkWQ6I2Jmo5SAqitihqRVFbFrUSsoi+gF0OvyFwkuCG3wogRLl6cPpKeWcAXhK1FVFbFbWyqK2LWgVZRr+CXQG/SXDS4Cae98TLAGKcWYrIvfOsqC2Q6RqEm6JWFbWa89tGVtFXsCvhNwvOELhd8PwRQJiu7efsxsjAg3wjww3Idt3M193s77kdsI+so69hV8ZvAZwxcPvhCb8MIMbopGmgHGUsAbblSrfj7BoO4EDUjty5HrsdcII8Qt/Abgu/Ejg5cNPwxJ4HEKJB+hihCRppiXJuAOozPXRZnDqgc1G7cFldIs/RH2K3g98aOHlws/B4vlAzgAgbLMUcTxP1CmdaIzMPfgbplZv9a3e+N8gr9GfYNfCrgFMAdxgezxdpBhClLAMskxlGapXG2qW8p5B8F7Vbl9Wd2wH3yFv0l9gd4LcJziK4o/B4vmgzgDhzmmGj5ZnrMt1d54zPydSTPbjSProd8IR8QH+F3RF+VXCK4I7D4/nizQDa+aEMMjJzLJd1yrhHo11Q7jtIfzibn8hH9NfYHeNXA2cZ3El4PF97M4AEf7Usu32e7q0w5/t0+yVnfk/mnvwX8gn9DXYn+G2DUwJ3Ch7Pl2iZCgTeA4FPQeB7IPBNGPi/oCX+hoHfB1riRhT4nbAlbsUt8S5oiZfRy2oE8jZ8rSIf+jr+DcKP83l4cugAAAAAAElFTkSuQmCC';

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else {
      icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG, 'base64'));
    }
    tray = new Tray(icon);
    tray.setToolTip('MiniMax Token Usage');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主面板', click: () => mainWindow.show() },
        { label: '退出', click: () => { isQuitting = true; app.quit(); } },
      ])
    );
    tray.on('click', () => {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    });
  } catch (e) {
    console.warn('Tray creation failed:', e);
  }
}

ipcMain.handle('config:get', () => {
  const cfg = readConfig();
  if (cfg.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    try {
      cfg.apiKey = safeStorage.decryptString(Buffer.from(cfg.apiKeyEncrypted, 'base64'));
    } catch (e) {
      cfg.apiKey = '';
    }
  } else if (cfg.apiKeyEncrypted) {
    cfg.apiKey = '';
  }
  cfg.hasApiKey = !!cfg.apiKey;
  cfg.opacity = clampOpacity(cfg.opacity ?? 0.95);
  cfg.backgroundColor = typeof cfg.backgroundColor === 'string' && cfg.backgroundColor.trim()
    ? cfg.backgroundColor
    : '#ffffff';
  delete cfg.apiKeyEncrypted;
  return cfg;
});

ipcMain.handle('config:set', (_evt, payload) => {
  const cfg = readConfig();
  if (payload.apiKey !== undefined) {
    if (payload.apiKey && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(payload.apiKey);
      cfg.apiKeyEncrypted = encrypted.toString('base64');
    } else if (payload.apiKey) {
      cfg.apiKeyPlain = payload.apiKey;
    } else {
      delete cfg.apiKeyEncrypted;
      delete cfg.apiKeyPlain;
    }
    delete cfg.apiKey;
  }
  if (payload.baseUrl !== undefined) cfg.baseUrl = payload.baseUrl;
  if (payload.alwaysOnTop !== undefined) {
    cfg.alwaysOnTop = !!payload.alwaysOnTop;
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(cfg.alwaysOnTop, 'floating');
    }
  }
  if (payload.opacity !== undefined) {
    cfg.opacity = clampOpacity(payload.opacity);
    applyWindowOpacity(cfg.opacity);
  }
  if (payload.backgroundColor !== undefined) {
    cfg.backgroundColor = String(payload.backgroundColor) || '#ffffff';
  }
  writeConfig(cfg);
  return { ok: true };
});

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.hide());
ipcMain.handle('window:set-always-on-top', (_evt, flag) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(!!flag, 'floating');
  return { ok: true };
});
ipcMain.handle('window:set-opacity', (_evt, value) => {
  const v = clampOpacity(value);
  applyWindowOpacity(v);
  return { ok: true, opacity: v };
});
ipcMain.handle('window:resize', (_evt, width, height) => {
  if (!mainWindow) return { ok: false };
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return { ok: false };
  const [curW, curH] = mainWindow.getSize();
  const targetW = Math.max(360, Math.round(w));
  const targetH = Math.max(220, Math.round(h));
  if (curW !== targetW || curH !== targetH) {
    mainWindow.setSize(targetW, targetH);
  }
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});
