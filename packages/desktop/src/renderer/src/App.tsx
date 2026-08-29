import { useMemo, useState } from 'react';
import {
  BUILTIN_PROFILES,
  buildTransferPlan,
  isNativelySupported,
  type Track,
  type TransferItemStatus,
} from '@walkup/core';
import { TrackTable, type TrackRow } from './components/TrackTable.js';

interface TrackProgress {
  status: TransferItemStatus;
  fraction?: number;
}

export default function App() {
  const [sourceFolders, setSourceFolders] = useState<string[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);

  const [profileId, setProfileId] = useState(BUILTIN_PROFILES[0].id);
  const profile = BUILTIN_PROFILES.find((p) => p.id === profileId) ?? BUILTIN_PROFILES[0];
  const [targetFolder, setTargetFolder] = useState<string | null>(null);
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

  async function handleAddSources() {
    const picked = await window.walkup.selectSourceFolders();
    if (picked.length === 0) return;
    setSourceFolders((prev) => Array.from(new Set([...prev, ...picked])));
  }

  async function handleScan() {
    if (sourceFolders.length === 0) return;
    setScanning(true);
    try {
      const scanned = await window.walkup.scanLibrary(sourceFolders);
      setTracks(scanned);
      setExcludedIds(new Set());
      setProgress(new Map());
    } finally {
      setScanning(false);
    }
  }

  async function handlePickTarget() {
    const picked = await window.walkup.selectTargetFolder();
    if (picked) setTargetFolder(picked);
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
    if (!targetFolder) return;
    const selected = tracks.filter((t) => !excludedIds.has(t.id));
    if (selected.length === 0) return;

    const plan = buildTransferPlan({
      profile,
      tracks: selected,
      playlists: [{ name: 'WalkUp Import', trackIds: selected.map((t) => t.id) }],
    });

    setTransferring(true);
    setProgress(new Map());
    setLog((prev) => [...prev, `Starting transfer of ${selected.length} tracks to ${targetFolder}…`]);

    const unsubscribe = window.walkup.onTransferProgress((event) => {
      setProgress((prev) => {
        const next = new Map(prev);
        next.set(event.trackId, { status: event.status, fraction: event.fraction });
        return next;
      });
      if (event.status === 'error') {
        setLog((prev) => [...prev, `Error: ${event.message ?? 'unknown error'} (track ${event.trackId})`]);
      }
    });

    try {
      await window.walkup.runTransfer(plan, targetFolder, bitrate);
      setLog((prev) => [...prev, 'Transfer complete.']);
    } catch (err) {
      setLog((prev) => [...prev, `Transfer failed: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      unsubscribe();
      setTransferring(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>WalkUp</h1>
        <p className="subtitle">Copy, convert, and organize your music library onto a Walkman.</p>
      </header>

      <section className="panel">
        <h2>1. Source music</h2>
        <div className="row">
          <button onClick={handleAddSources}>Add Folders…</button>
          <button onClick={handleScan} disabled={sourceFolders.length === 0 || scanning}>
            {scanning ? 'Scanning…' : 'Scan Library'}
          </button>
        </div>
        {sourceFolders.length > 0 && (
          <ul className="folder-list">
            {sourceFolders.map((f) => (
              <li key={f}>{f}</li>
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
        <div className="row">
          <button onClick={handlePickTarget}>Choose Walkman Drive…</button>
          <span className="target-path">{targetFolder ?? 'No target selected'}</span>
        </div>
      </section>

      <section className="panel">
        <h2>4. Transfer</h2>
        <button
          className="primary"
          onClick={handleTransfer}
          disabled={!targetFolder || includedCount === 0 || transferring}
        >
          {transferring ? 'Transferring…' : `Start Transfer (${includedCount} tracks)`}
        </button>
        {log.length > 0 && (
          <pre className="log">{log.join('\n')}</pre>
        )}
      </section>
    </div>
  );
}
