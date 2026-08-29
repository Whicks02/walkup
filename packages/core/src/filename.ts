/**
 * Sanitize a single path segment (not a full path) for safety on the FAT32/exFAT
 * filesystems Walkman devices and most USB mass-storage players use.
 */
export function sanitizeSegment(raw: string, fallback = 'Unknown'): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // FAT32/exFAT forbid these characters in a path segment.
  let cleaned = trimmed.replace(/[\\/:*?"<>|]/g, '_');
  // Strip control characters (defensive; tags can contain garbage bytes).
  cleaned = Array.from(cleaned)
    .filter((ch) => ch.codePointAt(0)! >= 0x20)
    .join('');

  // Trailing dots/spaces are dropped silently by Windows and cause confusing renames.
  cleaned = cleaned.replace(/[. ]+$/g, '');

  // Reserved Windows device names must not be used as a bare segment.
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reserved.test(cleaned)) cleaned = `_${cleaned}`;

  if (!cleaned) return fallback;

  // Keep individual segments well under the 255-byte filesystem limit.
  const MAX_SEGMENT_LENGTH = 120;
  if (cleaned.length > MAX_SEGMENT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_SEGMENT_LENGTH).trim();
  }

  return cleaned;
}

export function padTrackNumber(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return '';
  return String(Math.trunc(n)).padStart(2, '0');
}
