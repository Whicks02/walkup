import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import type { TransferPlan, TransferProgressEvent } from '@walkup/core';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

// ffmpeg-static's shipped types don't line up with its CJS export under NodeNext resolution.
const ffmpegPath = ffmpegStatic as unknown as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export type ProgressSink = (event: TransferProgressEvent) => void;

function toAbsoluteTargetPath(targetRoot: string, musicRoot: string, relativeTargetPath: string): string {
  const segments = relativeTargetPath.split('/').filter(Boolean);
  return path.join(targetRoot, musicRoot, ...segments);
}

async function copyWithProgress(src: string, dest: string, totalBytes: number, onProgress: (fraction: number) => void): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    let copied = 0;
    const read = createReadStream(src);
    const write = createWriteStream(dest);
    read.on('data', (chunk) => {
      copied += chunk.length;
      if (totalBytes > 0) onProgress(Math.min(1, copied / totalBytes));
    });
    read.on('error', reject);
    write.on('error', reject);
    write.on('finish', () => resolve());
    read.pipe(write);
  });
}

async function transcode(src: string, dest: string, targetFormat: string, bitrateKbps: number, onProgress: (fraction: number) => void): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(src)
      .audioBitrate(bitrateKbps)
      .toFormat(targetFormat === 'm4a' ? 'ipod' : targetFormat)
      .on('progress', (progress) => {
        if (typeof progress.percent === 'number') {
          onProgress(Math.min(1, Math.max(0, progress.percent / 100)));
        }
      })
      .on('error', reject)
      .on('end', () => resolve())
      .save(dest);
    void command;
  });
}

export interface RunTransferOptions {
  plan: TransferPlan;
  targetRoot: string;
  bitrateKbps?: number;
  onProgress: ProgressSink;
}

export async function runTransfer({ plan, targetRoot, bitrateKbps = 192, onProgress }: RunTransferOptions): Promise<void> {
  const { profile, items, playlists } = plan;

  for (const item of items) {
    const dest = toAbsoluteTargetPath(targetRoot, profile.musicRoot, item.relativeTargetPath);
    try {
      if (item.needsTranscode) {
        onProgress({ trackId: item.track.id, status: 'transcoding', fraction: 0 });
        await transcode(item.track.sourcePath, dest, item.targetFormat, bitrateKbps, (fraction) =>
          onProgress({ trackId: item.track.id, status: 'transcoding', fraction }),
        );
      } else {
        onProgress({ trackId: item.track.id, status: 'copying', fraction: 0 });
        await copyWithProgress(item.track.sourcePath, dest, item.track.sizeBytes ?? 0, (fraction) =>
          onProgress({ trackId: item.track.id, status: 'copying', fraction }),
        );
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
    const dest = path.join(targetRoot, profile.playlistRoot, playlist.fileName);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, playlist.content, 'utf8');
  }
}
