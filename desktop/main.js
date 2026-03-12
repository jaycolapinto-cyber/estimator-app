const { app, BrowserWindow, shell, dialog, protocol, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
let mainWindow;

function ensureLogDir() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (e) {
    return null;
  }
}

function logLine(msg) {
  try {
    const dir = ensureLogDir();
    if (!dir) return;
    const file = path.join(dir, 'startup.log');
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(file, line, 'utf8');
  } catch (e) {
    // swallow
  }
}

process.on('uncaughtException', (err) => {
  logLine(`uncaughtException: ${err?.stack || err}`);
});

process.on('unhandledRejection', (err) => {
  logLine(`unhandledRejection: ${err?.stack || err}`);
});

logLine('main.js loaded');

app.on('ready', () => {
  logLine('app ready event');
});

app.on('gpu-process-crashed', (event, killed) => {
  logLine(`gpu-process-crashed (killed=${killed})`);
});

app.on('child-process-gone', (event, details) => {
  logLine(`child-process-gone: ${JSON.stringify(details)}`);
});

function createWindow() {
  try {
    logLine(`createWindow (isDev=${isDev})`);
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      backgroundColor: '#0f172a',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:estimator'
      },
    });

    if (isDev) {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      mainWindow.loadURL('app://index.html');
    }

    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      logLine(`render-process-gone: ${JSON.stringify(details)}`);
      dialog.showErrorBox('Render crash', JSON.stringify(details));
    });

    mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      logLine(`did-fail-load: ${validatedURL} ${errorCode} ${errorDescription}`);
      dialog.showErrorBox(
        'Load error',
        `Failed to load ${validatedURL}\n${errorCode}: ${errorDescription}`
      );
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  } catch (e) {
    logLine(`createWindow error: ${e?.stack || e}`);
    dialog.showErrorBox('Startup error', String(e));
  }
}

app.whenReady().then(() => {
  logLine(`app.whenReady (userData=${app.getPath('userData')})`);

  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true } }
  ]);

  if (!isDev) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.replace('app://', '');
      const filePath = path.join(app.getAppPath(), 'build', url);
      logLine(`app protocol: ${request.url} -> ${filePath}`);
      callback({ path: filePath });
    });
  }

  createWindow();

  if (!isDev) {
    autoUpdater.autoDownload = false;

    autoUpdater.on('error', (err) => {
      logLine(`autoUpdater error: ${err?.stack || err}`);
    });

    autoUpdater.on('update-available', async () => {
      logLine('update-available');
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
      logLine('update-downloaded');
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
