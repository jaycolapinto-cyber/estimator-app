const { contextBridge, ipcRenderer } = require('electron');
const Store = require('electron-store');

const store = new Store({ name: 'estimator' });

contextBridge.exposeInMainWorld('estimator', {
  version: process.env.npm_package_version || '0.0.0',
  isDesktop: true,
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, payload) => cb(payload)),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
});

contextBridge.exposeInMainWorld('estimatorStore', {
  get: (key) => store.get(key) ?? null,
  set: (key, val) => store.set(key, val),
  remove: (key) => store.delete(key)
});
