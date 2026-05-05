const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const log = require('electron-log/main');
const { createStores } = require('./main/store');
const { CommandRunner } = require('./main/testRunner');
const { WatcherRegistry } = require('./main/watcher');
const { registerHandlers } = require('./main/ipc');

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Worktree Workbench starting', { version: app.getVersion() });

process.on('uncaughtException', (err) => log.error('uncaughtException', err));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', err));

let mainWindow = null;
let watcherRegistry = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.on('focus', () => mainWindow.webContents.send('app:focus'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const { settingsStore, runsStore } = createStores(app.getPath('userData'));
  const commandRunner = new CommandRunner(runsStore);
  watcherRegistry = new WatcherRegistry();
  registerHandlers({
    settingsStore,
    runsStore,
    commandRunner,
    watcherRegistry,
    getWindow: () => mainWindow,
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  watcherRegistry?.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => watcherRegistry?.stopAll());
