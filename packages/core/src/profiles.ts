import type { DeviceProfile } from './types.js';

/**
 * Modern Sony Walkman NW-A/ZX (Hi-Res) series: broad native format support,
 * mounted as a plain USB mass-storage drive with a top-level MUSIC folder.
 */
export const SONY_NW_HIRES: DeviceProfile = {
  id: 'sony-nw-hires',
  name: 'Sony Walkman NW-A/ZX (Hi-Res)',
  description: 'NW-A105/A306, NW-ZX507/ZX707 and similar. Wide native format support. USB Mass Storage.',
  transport: 'msc',
  nativeFormats: ['mp3', 'aac', 'm4a', 'wma', 'flac', 'wav', 'aiff', 'aif', 'ogg', 'dsf', 'dff', 'alac'],
  fallbackFormat: 'mp3',
  musicRoot: 'MUSIC',
  playlistRoot: 'MUSIC/Playlists',
};

/**
 * Entry-level Sony Walkman NW-E/S series (e.g. NW-E507, NW-E505, NW-S series). These connect
 * over MTP, not USB Mass Storage — there is no mounted drive to copy files onto. Transfer
 * requires an MTP-aware backend (Windows only in this app, via Explorer's Shell/WPD
 * automation). Note: some of these devices only register new tracks in their on-device
 * index when written by Sony's own SonicStage/MP3 File Manager — plain MTP object writes
 * (including this app's) may not always be picked up by the device's UI.
 */
export const SONY_NW_E_SERIES: DeviceProfile = {
  id: 'sony-nw-e-series',
  name: 'Sony Walkman NW-E/S (MTP)',
  description: 'NW-E507, NW-E505, NW-S series and similar entry-level Walkmans. Connects via MTP (Windows only).',
  transport: 'mtp',
  nativeFormats: ['mp3', 'wma', 'aac', 'm4a'],
  fallbackFormat: 'mp3',
  musicRoot: 'Music',
  playlistRoot: 'Music/Playlists',
};

/** No device-specific folder convention; use for any generic USB mass-storage player. */
export const GENERIC_USB: DeviceProfile = {
  id: 'generic-usb',
  name: 'Generic USB music player',
  description: 'Any USB mass-storage device without a required folder layout.',
  transport: 'msc',
  nativeFormats: ['mp3', 'wav'],
  fallbackFormat: 'mp3',
  musicRoot: '',
  playlistRoot: 'Playlists',
};

export const BUILTIN_PROFILES: DeviceProfile[] = [SONY_NW_HIRES, SONY_NW_E_SERIES, GENERIC_USB];

export function isNativelySupported(profile: DeviceProfile, format: string): boolean {
  return profile.nativeFormats.includes(format.toLowerCase());
}
