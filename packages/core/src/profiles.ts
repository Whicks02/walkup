import type { DeviceProfile } from './types.js';

/**
 * Modern Sony Walkman NW-A/ZX (Hi-Res) series: broad native format support,
 * mounted as a plain USB mass-storage drive with a top-level MUSIC folder.
 */
export const SONY_NW_HIRES: DeviceProfile = {
  id: 'sony-nw-hires',
  name: 'Sony Walkman NW-A/ZX (Hi-Res)',
  description: 'NW-A105/A306, NW-ZX507/ZX707 and similar. Wide native format support.',
  nativeFormats: ['mp3', 'aac', 'm4a', 'wma', 'flac', 'wav', 'aiff', 'aif', 'ogg', 'dsf', 'dff', 'alac'],
  fallbackFormat: 'mp3',
  musicRoot: 'MUSIC',
  playlistRoot: 'MUSIC/Playlists',
};

/** Older/entry-level Walkman (NW-E/S series) and most generic MP3 players: MP3/WMA/AAC only. */
export const SONY_NW_BASIC: DeviceProfile = {
  id: 'sony-nw-basic',
  name: 'Sony Walkman NW-E/S (basic)',
  description: 'Entry-level Walkman and most generic USB MP3 players.',
  nativeFormats: ['mp3', 'wma', 'aac', 'm4a'],
  fallbackFormat: 'mp3',
  musicRoot: 'MUSIC',
  playlistRoot: 'MUSIC/Playlists',
};

/** No device-specific folder convention; use for any generic USB mass-storage player. */
export const GENERIC_USB: DeviceProfile = {
  id: 'generic-usb',
  name: 'Generic USB music player',
  description: 'Any USB mass-storage device without a required folder layout.',
  nativeFormats: ['mp3', 'wav'],
  fallbackFormat: 'mp3',
  musicRoot: '',
  playlistRoot: 'Playlists',
};

export const BUILTIN_PROFILES: DeviceProfile[] = [SONY_NW_HIRES, SONY_NW_BASIC, GENERIC_USB];

export function isNativelySupported(profile: DeviceProfile, format: string): boolean {
  return profile.nativeFormats.includes(format.toLowerCase());
}
