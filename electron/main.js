const { app, BrowserWindow, ipcMain, safeStorage, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

let mainWindow = null;
let tray = null;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 280,
    minWidth: 480,
    minHeight: 220,
    alwaysOnTop: true,
    frame: false,
    transparent: false,
    resizable: true,
    skipTaskbar: false,
    title: 'MiniMax Token Usage',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.platform === 'darwin') {
    app.dock && app.dock.hide();
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    let icon;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
    } else {
      icon = nativeImage.createEmpty();
    }
    tray = new Tray(icon);
    tray.setToolTip('MiniMax Token Usage');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主面板', click: () => mainWindow.show() },
        { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
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
  writeConfig(cfg);
  return { ok: true };
});

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.hide());
ipcMain.handle('window:set-always-on-top', (_evt, flag) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(!!flag, 'floating');
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
