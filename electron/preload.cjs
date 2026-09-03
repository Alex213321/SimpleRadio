const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simpleRadio', {
  state: {
    get: () => ipcRenderer.invoke('state:get')
  },
  library: {
    reveal: (trackId) => ipcRenderer.invoke('library:reveal', trackId)
  },
  player: {
    save: (player) => ipcRenderer.invoke('player:save', player),
    saveNow: (player) => ipcRenderer.send('player:save-now', player),
    favorite: (trackId, favorite) => ipcRenderer.invoke('track:favorite', { trackId, favorite }),
    recordListening: (payload) => ipcRenderer.invoke('stats:record', payload),
    recordListeningNow: (payload) => ipcRenderer.send('stats:record-now', payload)
  },
  settings: {
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    onMaximized: (callback) => ipcRenderer.on('window:maximized', (_event, value) => callback(Boolean(value)))
  }
});
