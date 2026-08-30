import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TransferPlan, TransferProgressEvent } from '@walkup/core';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { psQuote, psStringArray, runPowerShellJson } from './shell.js';

const ffmpegPath = ffmpegStatic as unknown as string | null;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

async function transcodeToTempFile(src: string, targetFormat: string, bitrateKbps: number, onProgress: (fraction: number) => void): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walkup-mtp-'));
  const dest = path.join(tempDir, `output.${targetFormat}`);
  await new Promise<void>((resolve, reject) => {
    ffmpeg(src)
      .audioBitrate(bitrateKbps)
      .toFormat(targetFormat === 'm4a' ? 'ipod' : targetFormat)
      .on('progress', (progress) => {
        if (typeof progress.percent === 'number') onProgress(Math.min(1, Math.max(0, progress.percent / 100)));
      })
      .on('error', reject)
      .on('end', () => resolve())
      .save(dest);
  });
  return dest;
}

/**
 * Push one local file onto an MTP device via Explorer's Shell.Application COM automation —
 * the same mechanism as manually dragging a file onto the device in Explorer. We navigate
 * (creating as needed) into the given folder path, then CopyHere the file and poll until it
 * shows up.
 *
 * If folder creation isn't supported by the device's MTP shell provider (some devices don't
 * support it), we fall back to writing into the deepest folder that *does* exist, rather than
 * failing the whole transfer — and report that fallback back to the caller.
 */
export async function writeFileToMtpDevice(
  deviceName: string,
  folderSegments: string[],
  localFilePath: string,
): Promise<{ usedFolderSegments: string[] }> {
  const script = `
$shell = New-Object -ComObject Shell.Application
$computer = $shell.NameSpace(0x11)
$deviceItem = $null
foreach ($item in $computer.Items()) {
  if (-not $item.IsFileSystem -and $item.IsFolder -and $item.Name -eq ${psQuote(deviceName)}) {
    $deviceItem = $item
    break
  }
}
if (-not $deviceItem) { throw ('MTP device not found: ' + ${psQuote(deviceName)}) }

$folder = $deviceItem.GetFolder()
$usedSegments = @()
$segments = ${psStringArray(folderSegments)}
foreach ($segment in $segments) {
  $existing = $folder.Items() | Where-Object { $_.Name -eq $segment -and $_.IsFolder } | Select-Object -First 1
  if (-not $existing) {
    try {
      $folder.NewFolder($segment)
      Start-Sleep -Milliseconds 400
      $existing = $folder.Items() | Where-Object { $_.Name -eq $segment -and $_.IsFolder } | Select-Object -First 1
    } catch {
      $existing = $null
    }
  }
  if ($existing) {
    $folder = $existing.GetFolder()
    $usedSegments += $segment
  } else {
    break
  }
}

# FOF_SILENT (4) + FOF_NOCONFIRMATION (16) + FOF_NOCONFIRMMKDIR (512) + FOF_NOERRORUI (1024)
$folder.CopyHere(${psQuote(localFilePath)}, 1556)

$destName = Split-Path ${psQuote(localFilePath)} -Leaf
$deadline = (Get-Date).AddSeconds(180)
$done = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  $found = $folder.Items() | Where-Object { $_.Name -eq $destName } | Select-Object -First 1
  if ($found) { $done = $true; break }
}
if (-not $done) { throw "Timed out waiting for '$destName' to appear on the device" }

@{ ok = $true; usedFolderSegments = $usedSegments } | ConvertTo-Json -Compress
`;

  const result = await runPowerShellJson<{ usedFolderSegments: string[] }>(script);
  if (!result.ok) {
    throw new Error(result.error ?? 'MTP file transfer failed');
  }
  const used = result.data?.usedFolderSegments;
  return { usedFolderSegments: Array.isArray(used) ? used : used ? [used] : [] };
}

export interface RunMtpTransferOptions {
  plan: TransferPlan;
  deviceName: string;
  bitrateKbps?: number;
  onProgress: (event: TransferProgressEvent) => void;
}

export async function runMtpTransfer({ plan, deviceName, bitrateKbps = 192, onProgress }: RunMtpTransferOptions): Promise<void> {
  const { items, playlists, profile } = plan;
  const tempFiles: string[] = [];

  try {
    for (const item of items) {
      const targetSegments = item.relativeTargetPath.split('/').filter(Boolean);
      const folderSegments = targetSegments.slice(0, -1);

      try {
        let localFileToSend = item.track.sourcePath;

        if (item.needsTranscode) {
          onProgress({ trackId: item.track.id, status: 'transcoding', fraction: 0 });
          localFileToSend = await transcodeToTempFile(item.track.sourcePath, item.targetFormat, bitrateKbps, (fraction) =>
            onProgress({ trackId: item.track.id, status: 'transcoding', fraction }),
          );
          tempFiles.push(localFileToSend);
        }

        onProgress({ trackId: item.track.id, status: 'copying', fraction: 0 });
        const { usedFolderSegments } = await writeFileToMtpDevice(deviceName, folderSegments, localFileToSend);

        if (usedFolderSegments.length < folderSegments.length) {
          onProgress({
            trackId: item.track.id,
            status: 'copying',
            fraction: 1,
            message: `Device didn't support the full folder path — file was placed in "${usedFolderSegments.join('/') || '(device root)'}" instead of "${folderSegments.join('/')}"`,
          });
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
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walkup-mtp-playlist-'));
      const tempPath = path.join(tempDir, playlist.fileName);
      await fs.writeFile(tempPath, playlist.content, 'utf8');
      tempFiles.push(tempPath);
      const playlistFolderSegments = profile.playlistRoot.split('/').filter(Boolean);
      await writeFileToMtpDevice(deviceName, playlistFolderSegments, tempPath).catch((err) => {
        onProgress({ trackId: `playlist:${playlist.fileName}`, status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    }
  } finally {
    for (const file of tempFiles) {
      await fs.rm(path.dirname(file), { recursive: true, force: true }).catch(() => {});
    }
  }
}
