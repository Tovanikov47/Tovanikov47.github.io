// Preload sécurisé CJS
const { contextBridge, ipcRenderer } = require('electron');

const validChannels = new Set(['new-trade', 'toggle-theme', 'export-data']);

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  onNewTrade: (callback) => {
    ipcRenderer.removeAllListeners('new-trade');
    ipcRenderer.on('new-trade', (_event) => callback());
  },
  onToggleTheme: (callback) => {
    ipcRenderer.removeAllListeners('toggle-theme');
    ipcRenderer.on('toggle-theme', (_event) => callback());
  },
  onExportData: (callback) => {
    ipcRenderer.removeAllListeners('export-data');
    ipcRenderer.on('export-data', (_event, filePath) => callback(filePath));
  },
  removeAllListeners: (channel) => {
    if (validChannels.has(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});


