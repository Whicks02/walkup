import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTargetPath, dedupeTargetPaths } from './organizer.js';
import { sanitizeSegment } from './filename.js';
import type { Track } from './types.js';

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    sourcePath: '/music/song.flac',
    format: 'flac',
    ...overrides,
  };
}

test('sanitizeSegment strips FAT32-illegal characters', () => {
  assert.equal(sanitizeSegment('AC/DC: Back In Black?'), 'AC_DC_ Back In Black_');
});

test('sanitizeSegment falls back for empty/whitespace-only input', () => {
  assert.equal(sanitizeSegment('   '), 'Unknown');
});

test('buildTargetPath uses AlbumArtist/Album/## - Title.ext by default', () => {
  const t = track({ artist: 'Daft Punk', album: 'Discovery', title: 'One More Time', trackNumber: 1 });
  assert.equal(buildTargetPath(t, 'mp3'), 'Daft Punk/Discovery/01 - One More Time.mp3');
});

test('buildTargetPath falls back to Singles when album is missing', () => {
  const t = track({ artist: 'Aphex Twin', title: 'Windowlicker' });
  assert.equal(buildTargetPath(t, 'mp3'), 'Aphex Twin/Singles/Windowlicker.mp3');
});

test('buildTargetPath never lets tag values escape their path segment', () => {
  const t = track({ artist: '../../etc', album: 'x', title: 'y' });
  const result = buildTargetPath(t, 'mp3');
  assert.ok(!result.includes('..'), `expected no traversal segments, got: ${result}`);
});

test('dedupeTargetPaths appends a counter on collision', () => {
  const result = dedupeTargetPaths(['A/B.mp3', 'A/B.mp3', 'A/B.mp3', 'C/D.mp3']);
  assert.deepEqual(result, ['A/B.mp3', 'A/B (2).mp3', 'A/B (3).mp3', 'C/D.mp3']);
});
