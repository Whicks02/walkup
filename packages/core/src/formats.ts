/** Audio file extensions (lowercase, no dot) recognized as library tracks. */
export const AUDIO_EXTENSIONS = [
  'mp3',
  'aac',
  'm4a',
  'wma',
  'flac',
  'wav',
  'aiff',
  'aif',
  'ogg',
  'oga',
  'dsf',
  'dff',
] as const;

export function isAudioExtension(ext: string): boolean {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}
