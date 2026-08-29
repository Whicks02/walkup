import { useMemo, useState } from 'react';
import {
  BUILTIN_PROFILES,
  buildTransferPlan,
  isNativelySupported,
  type Track,
  type TransferItemStatus,
} from '@walkup/core';
import { TrackTable, type TrackRow } from './components/TrackTable.js';
import { scanSources, type ScannedSource } from './lib/scan.js';
import { runWebTransfer } from './lib/transfer.js';

interface TrackProgress {
  status: TransferItemStatus;
  fraction?: number;
}

const FILE_SYSTEM_ACCESS_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export default function App() {
  if (!FILE_SYSTEM_ACCESS_SUPPORTED) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>WalkUp</h1>
        </header>
        <section className="panel">
          <h2>Unsupported browser</h2>
          <p>
            WalkUp's web app needs the File System Access API to read your music library and write to a
            connected Walkman drive. That's currently supported in Chrome, Edge, and other Chromium-based
            browsers on desktop. Please switch browsers, or use the WalkUp desktop app instead.
          </p>
        </section>
      </div>
    );
  }

  return <Workspace />;
}

function Workspace() {
  const [sources, setSources] = useState<ScannedSource[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [fileHandles, setFileHandles] = useState<Map<string, FileSystemFileHandle>>(new Map());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);

  const [profileId, setProfileId] = useState(BUILTIN_PROFILES[0].id);
  const profile = BUILTIN_PROFILES.find((p) => p.id === profileId) ?? BUILTIN_PROFILES[0];
  const [targetHandle, setTargetHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [bitrate, setBitrate] = useState(192);

  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState<Map<string, TrackProgress>>(new Map());
  const [log, setLog] = useState<string[]>([]);

  const rows: TrackRow[] = useMemo(
    () =>
      tracks.map((track) => {
        const p = progress.get(track.id);
        return {
          track,
          included: !excludedIds.has(track.id),
          willConvert: !isNativelySupported(profile, track.format),
          status: p?.status,
          fraction: p?.fraction,
        };
      }),
    [tracks, excludedIds, profile, progress],
  );

  const includedCount = rows.filter((r) => r.included).length;

  async function handleAddSource() {
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'read' });
      setSources((prev) => [...prev, { name: handle.name, handle }]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setLog((prev) => [...prev, `Failed to add folder: ${err instanceof Error ? err.message : String(err)}`]);
    }
  }

  async function handleScan() {
    if (sources.length === 0) return;
    setScanning(true);
    try {
      const result = await scanSources(sources);
      setTracks(result.tracks);
      setFileHandles(result.fileHandles);
      setExcludedIds(new Set());
      setProgress(new Map());
    } finally {
      setScanning(false);
    }
  }

  async function handlePickTarget() {
    try {
      const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
      setTargetHandle(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setLog((prev) => [...prev, `Failed to select target: ${err instanceof Error ? err.message : String(err)}`]);
    }
  }

  function toggleTrack(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(included: boolean) {
    setExcludedIds(included ? new Set() : new Set(tracks.map((t) => t.id)));
  }

  async function handleTransfer() {
    if (!targetHandle) return;
    const selected = tracks.filter((t) => !excludedIds.has(t.id));
    if (selected.length === 0) return;

    const plan = buildTransferPlan({
      profile,
      tracks: selected,
      playlists: [{ name: 'WalkUp Import', trackIds: selected.map((t) => t.id) }],
    });

    setTransferring(true);
    setProgress(new Map());
    setLog((prev) => [...prev, `Starting transfer of ${selected.length} tracks…`]);

    try {
      await runWebTransfer({
        plan,
        targetRoot: targetHandle,
        fileHandles,
        bitrateKbps: bitrate,
        onProgress: (event) => {
          setProgress((prev) => {
            const next = new Map(prev);
            next.set(event.trackId, { status: event.status, fraction: event.fraction });
            return next;
          });
          if (event.status === 'error') {
            setLog((prev) => [...prev, `Error: ${event.message ?? 'unknown error'} (track ${event.trackId})`]);
          }
        },
      });
      setLog((prev) => [...prev, 'Transfer complete.']);
    } catch (err) {
      setLog((prev) => [...prev, `Transfer failed: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>WalkUp</h1>
        <p className="subtitle">Copy, convert, and organize your music library onto a Walkman — right from your browser.</p>
      </header>

      <section className="panel">
        <h2>1. Source music</h2>
        <div className="row">
          <button onClick={handleAddSource}>Add Folder…</button>
          <button onClick={handleScan} disabled={sources.length === 0 || scanning}>
            {scanning ? 'Scanning…' : 'Scan Library'}
          </button>
        </div>
        {sources.length > 0 && (
          <ul className="folder-list">
            {sources.map((s, i) => (
              <li key={`${s.name}-${i}`}>{s.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>
          2. Tracks {tracks.length > 0 && <span className="count">({includedCount}/{tracks.length} selected)</span>}
        </h2>
        <TrackTable rows={rows} onToggle={toggleTrack} onToggleAll={toggleAll} />
      </section>

      <section className="panel">
        <h2>3. Target device</h2>
        <div className="row">
          <label>
            Device profile{' '}
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {BUILTIN_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            MP3 bitrate{' '}
            <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
              {[128, 192, 256, 320].map((b) => (
                <option key={b} value={b}>
                  {b} kbps
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">{profile.description}</p>
        {profile.transport === 'mtp' ? (
          <p className="hint hint-warning">
            This device connects over MTP, not USB Mass Storage — there's no mounted drive for a browser to
            write to. Browsers have no MTP access at all (it's not just unsupported here, it's not possible
            from any web page). Use the WalkUp desktop app instead, which talks to MTP devices directly
            (Windows only).
          </p>
        ) : (
          <div className="row">
            <button onClick={handlePickTarget}>Choose Walkman Drive…</button>
            <span className="target-path">{targetHandle?.name ?? 'No target selected'}</span>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>4. Transfer</h2>
        <button
          className="primary"
          onClick={handleTransfer}
          disabled={profile.transport === 'mtp' || !targetHandle || includedCount === 0 || transferring}
        >
          {transferring ? 'Transferring…' : `Start Transfer (${includedCount} tracks)`}
        </button>
        <p className="hint">
          Files needing conversion are transcoded in your browser (ffmpeg.wasm) — this is slower than the
          desktop app, so large libraries with lots of non-MP3 files may take a while.
        </p>
        {log.length > 0 && <pre className="log">{log.join('\n')}</pre>}
      </section>
    </div>
  );
}
