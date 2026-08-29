import type { TransferPlan, TransferProgressEvent } from '@walkup/core';
import { WasmTranscoder } from './ffmpegTranscoder.js';

async function getOrCreateDir(root: FileSystemDirectoryHandle, relativeDirPath: string): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const segment of relativeDirPath.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  return dir;
}

async function writeFileAtPath(root: FileSystemDirectoryHandle, relativePath: string, data: Uint8Array | Blob): Promise<void> {
  const segments = relativePath.split('/').filter(Boolean);
  const fileName = segments.pop()!;
  const dir = await getOrCreateDir(root, segments.join('/'));
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data as BufferSource | Blob);
  } finally {
    await writable.close();
  }
}

export interface RunWebTransferOptions {
  plan: TransferPlan;
  targetRoot: FileSystemDirectoryHandle;
  fileHandles: Map<string, FileSystemFileHandle>;
  bitrateKbps?: number;
  onProgress: (event: TransferProgressEvent) => void;
}

export async function runWebTransfer({ plan, targetRoot, fileHandles, bitrateKbps = 192, onProgress }: RunWebTransferOptions): Promise<void> {
  const { profile, items, playlists } = plan;
  const transcoder = new WasmTranscoder();

  for (const item of items) {
    const sourceHandle = fileHandles.get(item.track.id);
    if (!sourceHandle) {
      onProgress({ trackId: item.track.id, status: 'error', message: 'Source file handle no longer available' });
      continue;
    }

    const destRelativePath = [profile.musicRoot, item.relativeTargetPath].filter(Boolean).join('/');

    try {
      const file = await sourceHandle.getFile();

      if (item.needsTranscode) {
        onProgress({ trackId: item.track.id, status: 'transcoding', fraction: 0 });
        const data = new Uint8Array(await file.arrayBuffer());
        const output = await transcoder.transcode(
          { data, sourceFormat: item.track.format },
          { targetFormat: item.targetFormat, bitrateKbps },
          (progress) => onProgress({ trackId: item.track.id, status: 'transcoding', fraction: progress.fraction }),
        );
        await writeFileAtPath(targetRoot, destRelativePath, output);
      } else {
        onProgress({ trackId: item.track.id, status: 'copying', fraction: 0 });
        await writeFileAtPath(targetRoot, destRelativePath, file);
        onProgress({ trackId: item.track.id, status: 'copying', fraction: 1 });
      }

      onProgress({ trackId: item.track.id, status: 'done', fraction: 1 });
    } catch (err) {
      onProgress({
        trackId: item.track.id,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const playlist of playlists) {
    const destRelativePath = [profile.playlistRoot, playlist.fileName].filter(Boolean).join('/');
    await writeFileAtPath(targetRoot, destRelativePath, new Blob([playlist.content], { type: 'text/plain' }));
  }
}
