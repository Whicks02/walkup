# WalkUp

Copy, convert, and organize a local music library onto a Sony Walkman (or any USB
mass-storage music player). Two apps share the same planning/organizing logic:

- **Desktop** (`packages/desktop`) — Electron + React. Full filesystem access, native
  `ffmpeg` transcoding, folder/drive picker dialogs. This is the recommended app for
  large libraries, since transcoding runs at native speed.
- **Web** (`packages/web`) — React app using the File System Access API. Runs entirely
  in the browser (no install), transcodes unsupported formats with `ffmpeg.wasm`.
  Requires Chrome, Edge, or another Chromium-based desktop browser.

## Architecture

```
packages/
  core/     Platform-agnostic library: track types, FAT32-safe folder organizer,
            M3U playlist generation, built-in Walkman device profiles (native format
            support per device), and the Transcoder interface.
  desktop/  Electron app. Main process handles OS dialogs, recursive library
            scanning (music-metadata), transcoding (fluent-ffmpeg + ffmpeg-static),
            and the file copy/transfer. Renderer is a React UI.
  web/      Browser app. Uses window.showDirectoryPicker() for source/target folders,
            music-metadata's browser build to read tags, and ffmpeg.wasm to transcode
            unsupported formats in-browser.
```

`@walkup/core` has zero Node/browser-specific dependencies, so both apps build the
same transfer plan (which files go where, which need conversion, what playlists to
generate) from the same code — only the actual file I/O and transcoding backend
differ per platform.

### How a transfer works

1. **Scan** — walk the chosen source folder(s), find audio files, read ID3/Vorbis/etc.
   tags for title/artist/album/track number/duration.
2. **Plan** (`buildTransferPlan` in `core`) — for each track, decide whether the
   target device's profile natively supports its format; if not, mark it for
   transcoding to the profile's fallback format (MP3). Compute a FAT32-safe
   destination path from tags (default layout: `MUSIC/AlbumArtist/Album/## - Title.ext`),
   deduplicating any collisions.
3. **Transfer** — copy (or transcode-then-write) each file to the target device, then
   write generated `.m3u8` playlists.

### Device profiles

Built into `@walkup/core` (`packages/core/src/profiles.ts`):

- **Sony Walkman NW-A/ZX (Hi-Res)** — MP3, AAC/M4A, WMA, FLAC, WAV, AIFF, OGG, DSD, ALAC.
- **Sony Walkman NW-E/S (basic)** — MP3, WMA, AAC/M4A.
- **Generic USB music player** — MP3, WAV, no required folder layout.

Anything outside a profile's native formats is transcoded to MP3 before transfer.

## Getting started

```
npm install
```

### Desktop app

```
npm run dev:desktop      # electron-vite dev, hot reload
npm run build --workspace packages/desktop   # production build (out/)
```

### Web app

```
npm run dev:web           # vite dev server
npm run build --workspace packages/web       # production build (dist/)
```

### Core library

```
npm run build:core
npm run test --workspace packages/core
```

## Notes

- The web app needs a Chromium-based browser (File System Access API isn't supported
  in Firefox/Safari) and falls back to an explanatory message otherwise.
- In-browser transcoding (ffmpeg.wasm) is significantly slower than the desktop app's
  native ffmpeg — expect the web app to be best for small libraries or MP3-only
  collections, and the desktop app for large/mixed-format libraries.
- Neither app is currently packaged for distribution (no installer/DMG/AppImage) —
  `electron-vite build` produces the app bundle, and packaging with `electron-builder`
  can be added if you need a distributable installer.
