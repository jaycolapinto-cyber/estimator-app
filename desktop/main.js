const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
let mainWindow;
const UPDATE_CHECK_DELAY_MS = 15000;

// Force software rendering to avoid GPU startup crashes on some Windows machines
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');

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
        partition: 'persist:estimator',
        spellcheck: true,
      },
    });

    try {
      mainWindow.webContents.session.setSpellCheckerLanguages(['en-US']);
    } catch (e) {
      logLine(`setSpellCheckerLanguages error: ${e?.stack || e}`);
    }

    if (isDev) {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      const indexPath = path.join(app.getAppPath(), 'build', 'index.html');
      logLine(`loading packaged index: ${indexPath}`);
      mainWindow.loadFile(indexPath);
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

  ipcMain.handle('openExternal', async (_e, url) => {
    try {
      if (url) await shell.openExternal(url);
      return true;
    } catch (e) {
      logLine(`openExternal error: ${e?.stack || e}`);
      return false;
    }
  });

  ipcMain.handle('openEstimateFile', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Estimator Files', extensions: ['duest', 'json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePaths?.[0]) {
        return { canceled: true };
      }

      const filePath = result.filePaths[0];
      const text = fs.readFileSync(filePath, 'utf8');
      return {
        canceled: false,
        filePath,
        fileName: path.basename(filePath),
        text,
      };
    } catch (e) {
      logLine(`openEstimateFile error: ${e?.stack || e}`);
      return { canceled: false, error: String(e?.message || e || 'Open failed') };
    }
  });

  ipcMain.handle('saveEstimateFile', async (_e, payload) => {
    try {
      const filePath = String(payload?.filePath || '').trim();
      const text = String(payload?.text || '');
      if (!filePath) {
        return { ok: false, error: 'Missing file path.' };
      }
      fs.writeFileSync(filePath, text, 'utf8');
      return {
        ok: true,
        filePath,
        fileName: path.basename(filePath),
      };
    } catch (e) {
      logLine(`saveEstimateFile error: ${e?.stack || e}`);
      return { ok: false, error: String(e?.message || e || 'Save failed') };
    }
  });

  ipcMain.handle('saveEstimateFileAs', async (_e, payload) => {
    try {
      const text = String(payload?.text || '');
      const defaultPath = String(payload?.defaultPath || '').trim();
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: [
          { name: 'Estimator Files', extensions: ['duest'] },
          { name: 'JSON Files', extensions: ['json'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      fs.writeFileSync(result.filePath, text, 'utf8');
      return {
        canceled: false,
        ok: true,
        filePath: result.filePath,
        fileName: path.basename(result.filePath),
      };
    } catch (e) {
      logLine(`saveEstimateFileAs error: ${e?.stack || e}`);
      return { canceled: false, ok: false, error: String(e?.message || e || 'Save As failed') };
    }
  });

  createWindow();

  if (!isDev) {
    autoUpdater.autoDownload = false;

    autoUpdater.on('error', (err) => {
      logLine(`autoUpdater error: ${err?.stack || err}`);
    });

    autoUpdater.on('update-available', async (info) => {
      logLine('update-available');
      try {
        if (mainWindow?.webContents) {
          mainWindow.webContents.send('update-available', {
            version: info?.version,
            releaseNotes: info?.releaseNotes || info?.releaseName || '',
            url: 'https://github.com/jaycolapinto-cyber/estimator-app/releases/latest'
          });
        }
      } catch (e) {
        logLine(`update-available send error: ${e?.stack || e}`);
      }

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

    setTimeout(() => {
      if (mainWindow?.isDestroyed()) return;
      logLine('checkForUpdates scheduled');
      autoUpdater.checkForUpdates().catch((err) => {
        logLine(`checkForUpdates error: ${err?.stack || err}`);
      });
    }, UPDATE_CHECK_DELAY_MS);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
