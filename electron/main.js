const { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { generateIconBuffer } = require('../scripts/build-tray-icon.js');

const isDev = !app.isPackaged;

if (!isDev) {
  const exeDir = path.dirname(app.getPath('exe'));
  app.setPath('userData', path.join(exeDir, 'userData'));
}

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let clickThroughEnabled = false;

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
  return Math.min(1, Math.max(0.01, n));
}

function clampRefreshMinutes(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(1440, n);
}

function applyWindowOpacity(v) {
  if (mainWindow) mainWindow.setOpacity(clampOpacity(v));
}

function applyClickThrough(flag) {
  clickThroughEnabled = !!flag;
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
  }
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主面板', click: () => mainWindow && mainWindow.show() },
      {
        label: '鼠标穿透',
        type: 'checkbox',
        checked: clickThroughEnabled,
        click: (item) => {
          const next = !!item.checked;
          applyClickThrough(next);
          const cfg = readConfig();
          cfg.clickThrough = next;
          writeConfig(cfg);
        },
      },
      { label: '退出', click: () => { isQuitting = true; app.quit(); } },
    ])
  );
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
  mainWindow.setSkipTaskbar(true);
  applyWindowOpacity(cfg.opacity ?? 0.95);
  applyClickThrough(cfg.clickThrough === true);

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

  mainWindow.on('show', () => {
    mainWindow.setSkipTaskbar(true);
  });
}

const TRAY_ICON_PNG = generateIconBuffer();

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'build', 'tray-icon.png');
    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else {
      icon = nativeImage.createFromBuffer(TRAY_ICON_PNG);
    }
    tray = new Tray(icon);
    tray.setToolTip('MiniMax Token Usage');
    rebuildTrayMenu();
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
  cfg.visibleQuotas = {
    interval5h: cfg.visibleQuotas?.interval5h !== false,
    weekly: cfg.visibleQuotas?.weekly !== false,
    video: cfg.visibleQuotas?.video !== false,
  };
  cfg.refreshIntervalMinutes = clampRefreshMinutes(cfg.refreshIntervalMinutes);
  cfg.clickThrough = cfg.clickThrough === true;
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
  if (payload.visibleQuotas !== undefined) {
    const v = payload.visibleQuotas;
    cfg.visibleQuotas = {
      interval5h: !!(v && v.interval5h !== false),
      weekly: !!(v && v.weekly !== false),
      video: !!(v && v.video !== false),
    };
  }
  if (payload.refreshIntervalMinutes !== undefined) {
    cfg.refreshIntervalMinutes = clampRefreshMinutes(payload.refreshIntervalMinutes);
  }
  if (payload.clickThrough !== undefined) {
    cfg.clickThrough = !!payload.clickThrough;
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
ipcMain.handle('window:set-click-through', (_evt, flag) => {
  applyClickThrough(flag);
  return { ok: true, clickThrough: clickThroughEnabled };
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

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
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
