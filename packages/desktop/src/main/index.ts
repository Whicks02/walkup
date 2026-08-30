import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { Track, TransferPlan } from '@walkup/core';
import { scanLibrary } from './library.js';
import { runTransfer } from './transfer.js';
import { listMtpDevices } from './mtp/list.js';
import { runMtpTransfer } from './mtp/transfer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: 'WalkUp',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('dialog:selectSourceFolders', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:selectTargetFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle('library:scan', async (_event, sourcePaths: string[]): Promise<Track[]> => {
  return scanLibrary(sourcePaths);
});

ipcMain.handle('transfer:run', async (event, plan: TransferPlan, targetRoot: string, bitrateKbps: number) => {
  await runTransfer({
    plan,
    targetRoot,
    bitrateKbps,
    onProgress: (progress) => event.sender.send('transfer:progress', progress),
  });
});

ipcMain.handle('mtp:list', async () => {
  if (process.platform !== 'win32') {
    throw new Error('MTP transfer is only supported on Windows in this app.');
  }
  return listMtpDevices();
});

ipcMain.handle('mtp:transfer', async (event, plan: TransferPlan, deviceName: string, bitrateKbps: number) => {
  if (process.platform !== 'win32') {
    throw new Error('MTP transfer is only supported on Windows in this app.');
  }
  await runMtpTransfer({
    plan,
    deviceName,
    bitrateKbps,
    onProgress: (progress) => event.sender.send('transfer:progress', progress),
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
