import { padTrackNumber, sanitizeSegment } from './filename.js';
import type { OrganizeTemplateContext, Track } from './types.js';

/**
 * Default layout: MusicRoot/AlbumArtist/Album/## - Title.ext
 * (Compilations/singles without an album fall back to a "Singles" bucket.)
 */
export const DEFAULT_TEMPLATE = '{albumArtist}/{album}/{trackNumber}{title}.{ext}';

function buildContext(track: Track, targetExt: string): OrganizeTemplateContext {
  const artist = track.artist?.trim() || 'Unknown Artist';
  const albumArtist = track.albumArtist?.trim() || artist;
  const album = track.album?.trim() || 'Singles';
  const title = track.title?.trim() || track.sourcePath.split(/[\\/]/).pop() || 'Untitled';
  const trackNumber = padTrackNumber(track.trackNumber);
  return {
    artist,
    albumArtist,
    album,
    title,
    trackNumber: trackNumber ? `${trackNumber} - ` : '',
    discNumber: track.discNumber !== undefined ? String(track.discNumber) : '',
    year: track.year !== undefined ? String(track.year) : '',
    genre: track.genre?.trim() || '',
    ext: targetExt.toLowerCase(),
  };
}

/**
 * Render a track's destination path (relative to the device's music root, '/'-separated)
 * using a template like DEFAULT_TEMPLATE. Every path segment is sanitized independently
 * so tag values can never inject extra directories or illegal filesystem characters.
 */
export function buildTargetPath(track: Track, targetExt: string, template: string = DEFAULT_TEMPLATE): string {
  const ctx = buildContext(track, targetExt);
  const rendered = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return key in ctx ? ctx[key as keyof OrganizeTemplateContext] : '';
  });

  const segments = rendered
    .split('/')
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0);

  if (segments.length === 0) {
    segments.push(`${sanitizeSegment(ctx.title)}.${ctx.ext}`);
  } else {
    const last = segments[segments.length - 1];
    segments[segments.length - 1] = last.toLowerCase().endsWith(`.${ctx.ext}`)
      ? sanitizeSegment(last.slice(0, -(ctx.ext.length + 1))) + `.${ctx.ext}`
      : sanitizeSegment(last);
  }

  return segments
    .map((seg, i) => (i === segments.length - 1 ? seg : sanitizeSegment(seg)))
    .join('/');
}

/**
 * Given already-assigned relative target paths, dedupe any collisions
 * (e.g. two different source files that sanitize/round-trip to the same name)
 * by appending " (2)", " (3)", etc. before the extension.
 */
export function dedupeTargetPaths(paths: string[]): string[] {
  const seen = new Map<string, number>();
  return paths.map((path) => {
    const count = seen.get(path) ?? 0;
    seen.set(path, count + 1);
    if (count === 0) return path;

    const dot = path.lastIndexOf('.');
    const base = dot === -1 ? path : path.slice(0, dot);
    const ext = dot === -1 ? '' : path.slice(dot);
    return `${base} (${count + 1})${ext}`;
  });
}
