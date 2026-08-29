import { isAudioExtension, type Track } from '@walkup/core';
import { parseBlob } from 'music-metadata';
import { fnv1a } from './hash.js';

export interface ScannedSource {
  /** Display name for this picked source root. */
  name: string;
  handle: FileSystemDirectoryHandle;
}

export interface ScanResult {
  tracks: Track[];
  /** Track id -> live file handle, needed to actually read the bytes later. */
  fileHandles: Map<string, FileSystemFileHandle>;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

async function* walk(
  dir: FileSystemDirectoryHandle,
  pathPrefix: string,
): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  for await (const [name, handle] of dir.entries()) {
    const path = pathPrefix ? `${pathPrefix}/${name}` : name;
    if (handle.kind === 'directory') {
      yield* walk(handle as FileSystemDirectoryHandle, path);
    } else if (handle.kind === 'file' && isAudioExtension(extOf(name))) {
      yield { path, handle: handle as FileSystemFileHandle };
    }
  }
}

export async function scanSources(sources: ScannedSource[]): Promise<ScanResult> {
  const tracks: Track[] = [];
  const fileHandles = new Map<string, FileSystemFileHandle>();

  for (const source of sources) {
    for await (const { path, handle } of walk(source.handle, source.name)) {
      const id = fnv1a(path);
      fileHandles.set(id, handle);

      const ext = extOf(path);
      try {
        const file = await handle.getFile();
        const meta = await parseBlob(file, { skipCovers: true });
        tracks.push({
          id,
          sourcePath: path,
          sizeBytes: file.size,
          format: ext,
          title: meta.common.title,
          artist: meta.common.artist,
          albumArtist: meta.common.albumartist,
          album: meta.common.album,
          trackNumber: meta.common.track?.no ?? undefined,
          discNumber: meta.common.disk?.no ?? undefined,
          year: meta.common.year,
          genre: meta.common.genre?.[0],
          durationSec: meta.format.duration,
        });
      } catch (err) {
        console.error(`Failed to read metadata for ${path}:`, err);
        const file = await handle.getFile().catch(() => undefined);
        tracks.push({
          id,
          sourcePath: path,
          sizeBytes: file?.size,
          format: ext,
          title: path.split('/').pop()?.replace(/\.[^.]+$/, ''),
        });
      }
    }
  }

  return { tracks, fileHandles };
}
