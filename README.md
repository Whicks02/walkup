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

Built into `@walkup/core` (`packages/core/src/profiles.ts`). Each profile also has a
`transport`:

- **Sony Walkman NW-A/ZX (Hi-Res)** — `msc` (USB Mass Storage). MP3, AAC/M4A, WMA, FLAC,
  WAV, AIFF, OGG, DSD, ALAC.
- **Sony Walkman NW-E/S (MTP)** — `mtp`. Entry-level Walkmans (NW-E507, NW-E505, NW-S
  series). MP3, WMA, AAC/M4A. See **MTP support** below — this is a fundamentally
  different, higher-risk transfer path than the mass-storage profiles.
- **Generic USB music player** — `msc`. MP3, WAV, no required folder layout.

Anything outside a profile's native formats is transcoded to MP3 before transfer.

### MTP support (Windows only, experimental)

Some Walkmans — notably the older NW-E/S series — don't mount as a normal drive at all.
They connect over **MTP** (Media Transfer Protocol), which has no filesystem to copy
files onto. This app cannot treat an MTP device like a USB drive; it needs a
protocol-aware transfer path instead, and that path only exists in the **desktop app,
on Windows**:

- The web app cannot do this at all — browsers have no MTP access whatsoever, by
  design, regardless of browser or OS. When an `mtp`-transport profile is selected,
  the web app disables transfer and explains why instead of pretending to try.
- The desktop app implements MTP transfer via Explorer's Shell/COM automation
  (`packages/desktop/src/main/mtp/`) — the same mechanism as manually dragging a file
  onto the device in Explorer, scripted through PowerShell (`Shell.Application`,
  `CopyHere`). This avoids requiring native module compilation or replacing Windows'
  MTP driver with WinUSB, but it means `mtp:list`/`mtp:transfer` only work on
  `process.platform === 'win32'` — they throw immediately elsewhere.

**Known limitation, not just a bug to fix later:** community reports on the NW-E507
specifically indicate that some of these devices only register new tracks in their
on-device song index when loaded via Sony's own SonicStage or MP3 File Manager — a
plain MTP object write (including this app's) can transfer the file successfully and
still not make it appear on the device's screen. If that happens, it's this device's
own indexing behavior, not a bug in the transfer — SonicStage/MP3 File Manager remain
the reliable fallback for that specific case.

## Getting started

```
npm install
```

### Desktop app

```
npm run dev:desktop      # electron-vite dev, hot reload
npm run build --workspace packages/desktop   # production build (out/), unpacked, no installer
```

#### Prebuilt download

Prebuilt Windows binaries (v0.1.0) are checked into [`releases/`](releases/) so you can
grab them straight from GitHub without building anything — open the file in GitHub and
use "Download raw file". They're **not code-signed**, so Windows SmartScreen will show
an "Unknown publisher" warning on first run; that's expected for an unsigned build, not
a sign anything is broken. These are a convenience snapshot, not an auto-updating
release channel — after any code change, rebuild with the steps below rather than
trusting `releases/` to be current.

#### Building a Windows .exe

```
npm run build:core       # core must be built first (desktop depends on the compiled dist/)
npm run dist:win --workspace packages/desktop
```

Produces two files in `packages/desktop/release/`:

- **`WalkUp Setup <version>.exe`** — NSIS installer (Start Menu/desktop shortcut, uninstaller).
- **`WalkUp <version>.exe`** — portable build, no install required, just run it.

This works cross-platform (including from Linux/macOS, which is how it was built and
verified for this repo) via `electron-builder`, with no code signing configured — expect
an "Unknown publisher" SmartScreen prompt on first run on Windows, since the exe isn't
signed with a certificate. Building the NSIS installer target from a non-Windows host
requires **Wine** (`apt install wine wine32:i386` on Debian/Ubuntu, needed because
electron-builder verifies the installer by briefly running it) — building only the
`portable` target does not need Wine.

**Cross-platform build gotcha:** `ffmpeg-static`'s postinstall script downloads a
prebuilt `ffmpeg` binary matching whatever OS `npm install` ran on — not the platform
you're packaging for. Building the Windows `.exe` from Linux/macOS with a plain
`npm install` bundles a Linux/macOS ffmpeg into the Windows package, which can't
execute there (transcoding would silently fail on the actual Walkman-connected
machine). Fetch the Windows binary explicitly before running `dist:win` from a
non-Windows host:

```
curl -L -o /tmp/ffmpeg-win32-x64.gz \
  https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz
gunzip -c /tmp/ffmpeg-win32-x64.gz > node_modules/ffmpeg-static/ffmpeg.exe
```

(check `node_modules/ffmpeg-static/package.json`'s `ffmpeg-static["binary-release-tag"]`
for the current release tag if this repo's ffmpeg-static version has moved on). The
`files` list in `packages/desktop/package.json`'s `build` config excludes the
platform-native `ffmpeg` binary from the Windows build so only `ffmpeg.exe` ships.

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
- The desktop app packages to a Windows `.exe` (installer and portable) via
  `electron-builder` — see **Building a Windows .exe** above. macOS/Linux packaging
  targets (`dmg`, `AppImage`, etc.) aren't configured yet, only `win`.
