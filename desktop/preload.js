const { contextBridge } = require('electron');
const Store = require('electron-store');

const store = new Store({ name: 'estimator' });

contextBridge.exposeInMainWorld('estimator', {
  version: process.env.npm_package_version || '0.0.0',
  isDesktop: true,
});

contextBridge.exposeInMainWorld('estimatorStore', {
  get: (key) => store.get(key) ?? null,
  set: (key, val) => store.set(key, val),
  remove: (key) => store.delete(key)
});
