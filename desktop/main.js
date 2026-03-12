const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const isDev = !app.isPackaged;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const appPath = app.getAppPath();
    const indexPath = path.join(appPath, 'build', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    dialog.showErrorBox(
      'Load error',
      `Failed to load ${validatedURL}\n${errorCode}: ${errorDescription}`
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.autoDownload = false;

    autoUpdater.on('update-available', async () => {
      const result = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Update', 'Later'],
        title: 'Update available',
        message: 'A new version is available. Update now?'
      });
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });

    autoUpdater.on('update-downloaded', async () => {
      const result = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Update ready',
        message: 'Update downloaded. Restart to apply?'
      });
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });

    autoUpdater.checkForUpdates();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
