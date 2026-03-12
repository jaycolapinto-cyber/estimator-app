const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('estimator', {
  version: process.env.npm_package_version || '0.0.0',
  isDesktop: true,
});
