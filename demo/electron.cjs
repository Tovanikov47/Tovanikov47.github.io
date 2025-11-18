// 🔧 Version CommonJS pour Electron (main process) compatible avec type: module
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const isDev = () => {
  return process.env.NODE_ENV === 'development' || 
         process.defaultApp || 
         /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || 
         /[\\/]electron[\\/]/.test(process.execPath);
};

let mainWindow;
let isCheckingUpdate = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      sandbox: false,
      enableBlinkFeatures: 'CSSColorSchemeUARendering'
    },
    icon: path.join(__dirname, 'image.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: false
  });

  let startUrl;
  if (isDev()) {
    startUrl = 'http://localhost:5175';
  } else {
    const possiblePaths = [
      path.join(__dirname, 'index.html'),
      path.join(__dirname, '../dist/index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html')
    ];
    const fs = require('fs');
    let foundPath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) { foundPath = testPath; break; }
    }
    startUrl = foundPath ? `file://${foundPath}` : `file://${path.join(__dirname, 'index.html')}`;
  }

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev()) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -6 && !isDev()) {
      const alternativePaths = [
        path.join(__dirname, '../dist/index.html'),
        path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
        path.join(__dirname, '../../dist/index.html')
      ];
      for (const altPath of alternativePaths) {
        const fs = require('fs');
        if (fs.existsSync(altPath)) {
          mainWindow.loadURL(`file://${altPath}`);
          break;
        }
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      const isExternalHttp = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
      const isAllowedDev = isDev() && parsedUrl.host === 'localhost:5175';
      if (isExternalHttp && !isAllowedDev) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
      if (!isExternalHttp && !navigationUrl.startsWith('file://')) {
        event.preventDefault();
      }
    } catch (error) {
      event.preventDefault();
    }
  });

  const allowedHostsDev = new Set(['localhost:5175', 'fonts.googleapis.com', 'fonts.gstatic.com']);
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url);
      if (url.protocol === 'file:' || url.protocol === 'data:' || url.protocol === 'blob:') {
        return callback({});
      }
      if (isDev()) {
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') {
          return callback({ cancel: !allowedHostsDev.has(url.host) });
        }
      }
      return callback({ cancel: true });
    } catch {
      return callback({ cancel: true });
    }
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'MetrixSight',
      submenu: [
        { label: 'Nouveau Trade', accelerator: 'CmdOrCtrl+N', click: () => { if (mainWindow) mainWindow.webContents.send('new-trade'); } },
        { type: 'separator' },
        { label: 'Exporter les données', accelerator: 'CmdOrCtrl+E', click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showSaveDialog(mainWindow, { title: 'Exporter les données de trading', defaultPath: 'trading-data.json', filters: [ { name: 'JSON Files', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] } ] });
            if (!result.canceled) { mainWindow.webContents.send('export-data', result.filePath); }
        } },
        { type: 'separator' },
        { label: 'Quitter', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Actualiser', accelerator: 'CmdOrCtrl+R', click: () => { if (mainWindow) mainWindow.reload(); } },
        { label: 'Basculer le thème', accelerator: 'CmdOrCtrl+T', click: () => { if (mainWindow) mainWindow.webContents.send('toggle-theme'); } },
        { type: 'separator' },
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+Plus', click: () => { if (!mainWindow) return; const z = mainWindow.webContents.getZoomLevel(); mainWindow.webContents.setZoomLevel(z + 0.5); } },
        { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: () => { if (!mainWindow) return; const z = mainWindow.webContents.getZoomLevel(); mainWindow.webContents.setZoomLevel(z - 0.5); } },
        { label: 'Zoom normal', accelerator: 'CmdOrCtrl+0', click: () => { if (mainWindow) mainWindow.webContents.setZoomLevel(0); } },
        { type: 'separator' },
        { label: 'Plein écran', accelerator: 'F11', click: () => { if (!mainWindow) return; mainWindow.setFullScreen(!mainWindow.isFullScreen()); } }
      ]
    },
    {
      label: 'Outils',
      submenu: [ { label: 'Outils de développement', accelerator: 'F12', click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); } } ]
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Rechercher des mises à jour…', click: () => { checkForUpdatesInteractive(); } },
        { type: 'separator' },
        { label: 'À propos', click: () => { if (!mainWindow) return; dialog.showMessageBox(mainWindow, { type: 'info', title: 'À propos', message: 'MetrixSight', detail: 'Version 1.0.0\n\nApplication de suivi et d\'analyse des performances de trading.\n\nDéveloppé avec Electron et React.' }); } }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupAutoUpdater() {
  // Logger
  try {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
  } catch (_) {}

  autoUpdater.autoDownload = false; // téléchargement seulement sur action utilisateur
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = isDev();

  autoUpdater.on('error', (error) => {
    try { log.error('Updater error:', error); } catch (_) {}
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Mise à jour',
        message: 'Erreur de mise à jour',
        detail: String(error?.message || error)
      });
    }
  });

  autoUpdater.on('update-available', (info) => {
    try { log.info('Update available:', info); } catch (_) {}
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Télécharger', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      title: 'Mise à jour disponible',
      message: 'Une nouvelle version est disponible.',
      detail: `Version ${info?.version} détectée. Télécharger maintenant ?`
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    try { log.info('Download progress:', progress?.percent?.toFixed?.(1) + '%'); } catch (_) {}
  });

  autoUpdater.on('update-downloaded', (info) => {
    try { log.info('Update downloaded:', info); } catch (_) {}
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      title: 'Mise à jour prête',
      message: 'La mise à jour a été téléchargée.',
      detail: 'L\'application va redémarrer pour appliquer la mise à jour.'
    }).then(({ response }) => {
      if (response === 0) {
        setImmediate(() => autoUpdater.quitAndInstall());
      }
    });
  });
}

async function checkForUpdatesInteractive() {
  if (isCheckingUpdate) return;
  isCheckingUpdate = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    // Si rien n'est disponible, informer l'utilisateur
    const current = app.getVersion();
    const next = result?.updateInfo?.version;
    if (!next || next === current) {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Mises à jour',
          message: 'Aucune mise à jour disponible.'
        });
      }
    }
  } catch (err) {
    try { log.error('Check updates failed:', err); } catch (_) {}
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Mises à jour',
        message: 'Échec de la vérification des mises à jour.'
      });
    }
  } finally {
    isCheckingUpdate = false;
  }
}

process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

if (isDev()) {
  app.commandLine.appendSwitch('--disable-dev-shm-usage');
}

app.whenReady().then(() => {
  createWindow();
  const { session } = require('electron');
  if (!isDev()) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ');
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
  }
  session.defaultSession.protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = decodeURI(request.url.replace('file:///', ''));
    callback(pathname);
  });

  // Auto-update: check au démarrage en production (retardé)
  try {
    setupAutoUpdater();
    if (!isDev()) {
      setTimeout(() => { checkForUpdatesInteractive(); }, 6000);
    }
  } catch (_) {}
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { app.quit(); } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); } });

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});


