import { contextBridge, ipcRenderer } from 'electron';
import type { Track, TransferPlan, TransferProgressEvent } from '@walkup/core';

const api = {
  selectSourceFolders: (): Promise<string[]> => ipcRenderer.invoke('dialog:selectSourceFolders'),
  selectTargetFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectTargetFolder'),
  scanLibrary: (sourcePaths: string[]): Promise<Track[]> => ipcRenderer.invoke('library:scan', sourcePaths),
  runTransfer: (plan: TransferPlan, targetRoot: string, bitrateKbps: number): Promise<void> =>
    ipcRenderer.invoke('transfer:run', plan, targetRoot, bitrateKbps),
  onTransferProgress: (callback: (event: TransferProgressEvent) => void): (() => void) => {
    const listener = (_: unknown, payload: TransferProgressEvent) => callback(payload);
    ipcRenderer.on('transfer:progress', listener);
    return () => ipcRenderer.removeListener('transfer:progress', listener);
  },
};

export type WalkupApi = typeof api;

contextBridge.exposeInMainWorld('walkup', api);
