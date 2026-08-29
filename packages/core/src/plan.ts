import { buildTargetPath, dedupeTargetPaths, DEFAULT_TEMPLATE } from './organizer.js';
import { buildM3U, playlistFileName, type PlaylistInput } from './playlist.js';
import { isNativelySupported } from './profiles.js';
import type { DeviceProfile, GeneratedPlaylist, Track, TransferPlan, TransferPlanItem } from './types.js';

export interface BuildTransferPlanOptions {
  profile: DeviceProfile;
  tracks: Track[];
  template?: string;
  /** Named playlists to also generate (e.g. one per source subfolder, or user-defined). */
  playlists?: { name: string; trackIds: string[] }[];
}

export function buildTransferPlan(options: BuildTransferPlanOptions): TransferPlan {
  const { profile, tracks, template = DEFAULT_TEMPLATE, playlists = [] } = options;

  const rawItems: TransferPlanItem[] = tracks.map((track) => {
    const needsTranscode = !isNativelySupported(profile, track.format);
    const targetFormat = needsTranscode ? profile.fallbackFormat : track.format;
    return {
      track,
      relativeTargetPath: buildTargetPath(track, targetFormat, template),
      needsTranscode,
      targetFormat,
    };
  });

  const dedupedPaths = dedupeTargetPaths(rawItems.map((i) => i.relativeTargetPath));
  const items = rawItems.map((item, i) => ({ ...item, relativeTargetPath: dedupedPaths[i] }));

  const targetPathByTrackId = new Map(items.map((i) => [i.track.id, i.relativeTargetPath]));
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const generatedPlaylists: GeneratedPlaylist[] = playlists.map(({ name, trackIds }) => {
    const orderedTracks = trackIds.map((id) => trackById.get(id)).filter((t): t is Track => !!t);
    const input: PlaylistInput = { name, tracks: orderedTracks, targetPathByTrackId };
    return {
      fileName: playlistFileName(name),
      content: buildM3U(input, profile.playlistRoot, profile.musicRoot),
    };
  });

  return { profile, items, playlists: generatedPlaylists };
}
