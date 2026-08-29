import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isAudioExtension, type Track } from '@walkup/core';
import { parseFile } from 'music-metadata';

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (isAudioExtension(ext)) out.push(full);
    }
  }
}

function trackId(sourcePath: string): string {
  return createHash('sha1').update(sourcePath).digest('hex');
}

export async function scanLibrary(sourcePaths: string[]): Promise<Track[]> {
  const files: string[] = [];
  for (const root of sourcePaths) {
    try {
      await walk(root, files);
    } catch (err) {
      console.error(`Failed to scan ${root}:`, err);
    }
  }

  const tracks: Track[] = [];
  for (const filePath of files) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    try {
      const stat = await fs.stat(filePath);
      const meta = await parseFile(filePath, { duration: true, skipCovers: true });
      tracks.push({
        id: trackId(filePath),
        sourcePath: filePath,
        sizeBytes: stat.size,
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
      console.error(`Failed to read metadata for ${filePath}:`, err);
      const stat = await fs.stat(filePath).catch(() => undefined);
      tracks.push({
        id: trackId(filePath),
        sourcePath: filePath,
        sizeBytes: stat?.size,
        format: ext,
        title: path.basename(filePath, path.extname(filePath)),
      });
    }
  }

  return tracks;
}
