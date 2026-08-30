/** A single audio file discovered in the source library, with its parsed tags. */
export interface Track {
  /** Stable id for this track within a scan (e.g. the source path or a hash of it). */
  id: string;
  /** Absolute path (desktop) or a display path (web, from the picked directory root). */
  sourcePath: string;
  /** Size of the source file in bytes, if known. */
  sizeBytes?: number;
  /** Lowercase file extension without the dot, e.g. "mp3", "flac". */
  format: string;
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  durationSec?: number;
}

/**
 * How the device is reached over USB.
 * - 'msc': mounts as a normal drive (USB Mass Storage) — plain file copy works.
 * - 'mtp': Media Transfer Protocol — no mounted filesystem; requires a protocol-aware
 *   transfer path (desktop only, Windows-only in this app; browsers cannot speak MTP).
 */
export type DeviceTransport = 'msc' | 'mtp';

/** Which formats a given player can play natively, vs. what unsupported files should become. */
export interface DeviceProfile {
  id: string;
  name: string;
  description: string;
  transport: DeviceTransport;
  /** Lowercase extensions (no dot) the device can play without conversion. */
  nativeFormats: string[];
  /** Format unsupported files get transcoded to before transfer. */
  fallbackFormat: string;
  /** Folder (relative to the device root) that music should be written under. */
  musicRoot: string;
  /** Folder (relative to the device root) that generated playlists should be written under. */
  playlistRoot: string;
}

/** Template pieces available when building a track's destination path. Missing tags fall back to sane defaults. */
export interface OrganizeTemplateContext {
  artist: string;
  albumArtist: string;
  album: string;
  title: string;
  trackNumber: string;
  discNumber: string;
  year: string;
  genre: string;
  ext: string;
}

export interface TransferPlanItem {
  track: Track;
  /** Path relative to the device's musicRoot, using '/' as separator. */
  relativeTargetPath: string;
  /** True if this track's format is not in the device profile's nativeFormats and must be transcoded. */
  needsTranscode: boolean;
  /** Format the file will be transcoded to, if needsTranscode is true. */
  targetFormat: string;
}

export interface TransferPlan {
  profile: DeviceProfile;
  items: TransferPlanItem[];
  playlists: GeneratedPlaylist[];
}

export interface GeneratedPlaylist {
  /** File name, e.g. "My Playlist.m3u8", written under the profile's playlistRoot. */
  fileName: string;
  content: string;
}

export type TransferItemStatus =
  | 'pending'
  | 'transcoding'
  | 'copying'
  | 'done'
  | 'skipped'
  | 'error';

export interface TransferProgressEvent {
  trackId: string;
  status: TransferItemStatus;
  /** 0-1 progress within the current step (transcode or copy), when known. */
  fraction?: number;
  message?: string;
}

/** A detected MTP/portable device the user can pick as a transfer target. */
export interface MtpDeviceInfo {
  name: string;
}
