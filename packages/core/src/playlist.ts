import type { Track } from './types.js';

export interface PlaylistInput {
  name: string;
  /** Tracks in play order. */
  tracks: Track[];
  /** Map from track.id to its final relative-to-musicRoot path, as assigned by the organizer. */
  targetPathByTrackId: Map<string, string>;
}

/**
 * Build an extended M3U (.m3u8) playlist. Paths are written relative to the playlist's
 * own location (playlistRoot), so we prefix with a relative walk-up back to musicRoot.
 */
export function buildM3U(input: PlaylistInput, playlistRoot: string, musicRoot: string): string {
  const upSegments = relativeUpPath(playlistRoot, musicRoot);
  const lines = ['#EXTM3U'];

  for (const track of input.tracks) {
    const targetPath = input.targetPathByTrackId.get(track.id);
    if (!targetPath) continue;

    const durationSec = track.durationSec !== undefined ? Math.round(track.durationSec) : -1;
    const displayName = [track.artist, track.title].filter(Boolean).join(' - ') || targetPath;
    lines.push(`#EXTINF:${durationSec},${displayName}`);
    lines.push(`${upSegments}${targetPath}`);
  }

  return lines.join('\n') + '\n';
}

/** Compute a relative './..' style prefix to get from `from` back to `to`, both '/'-separated relative-to-device-root paths. */
function relativeUpPath(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);

  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }

  const ups = fromParts.length - common;
  const downs = toParts.slice(common);
  const parts = [...Array(ups).fill('..'), ...downs];
  return parts.length ? parts.join('/') + '/' : '';
}

export function playlistFileName(name: string): string {
  const safe = name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'Playlist';
  return `${safe}.m3u8`;
}
