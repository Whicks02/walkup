import { useMemo, useState } from 'react';
import {
  BUILTIN_PROFILES,
  buildTransferPlan,
  isNativelySupported,
  SONY_NW_E_SERIES,
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

  const [profileId, setProfileId] = useState(SONY_NW_E_SERIES.id);
  const profile = BUILTIN_PROFILES.find((p) => p.id === profileId) ?? BUILTIN_PROFILES[0];
  const [bitrate, setBitrate] = useState(192);

  // USB Mass Storage target
  const [targetFolder, setTargetFolder] = useState<string | null>(null);

  // MTP target
  const [mtpDevices, setMtpDevices] = useState<string[]>([]);
  const [mtpDeviceName, setMtpDeviceName] = useState<string | null>(null);
  const [mtpLoading, setMtpLoading] = useState(false);

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
  const targetReady = profile.transport === 'mtp' ? mtpDeviceName !== null : targetFolder !== null;

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

  async function handleRefreshMtpDevices() {
    setMtpLoading(true);
    try {
      const devices = await window.walkup.listMtpDevices();
      setMtpDevices(devices.map((d) => d.name));
      if (devices.length === 0) {
        setLog((prev) => [...prev, 'No MTP devices found. Make sure the Walkman is plugged in and unlocked.']);
      }
    } catch (err) {
      setLog((prev) => [...prev, `Failed to list MTP devices: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setMtpLoading(false);
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
    if (!targetReady) return;
    const selected = tracks.filter((t) => !excludedIds.has(t.id));
    if (selected.length === 0) return;

    const plan = buildTransferPlan({
      profile,
      tracks: selected,
      playlists: [{ name: 'WalkUp Import', trackIds: selected.map((t) => t.id) }],
    });

    setTransferring(true);
    setProgress(new Map());
    setLog((prev) => [
      ...prev,
      profile.transport === 'mtp'
        ? `Starting MTP transfer of ${selected.length} tracks to "${mtpDeviceName}"…`
        : `Starting transfer of ${selected.length} tracks to ${targetFolder}…`,
    ]);

    const unsubscribe = window.walkup.onTransferProgress((event) => {
      setProgress((prev) => {
        const next = new Map(prev);
        next.set(event.trackId, { status: event.status, fraction: event.fraction });
        return next;
      });
      if (event.status === 'error') {
        setLog((prev) => [...prev, `Error: ${event.message ?? 'unknown error'} (track ${event.trackId})`]);
      } else if (event.message) {
        const message = event.message;
        setLog((prev) => [...prev, message]);
      }
    });

    try {
      if (profile.transport === 'mtp') {
        await window.walkup.runMtpTransfer(plan, mtpDeviceName!, bitrate);
      } else {
        await window.walkup.runTransfer(plan, targetFolder!, bitrate);
      }
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
            <select
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                setTargetFolder(null);
                setMtpDeviceName(null);
              }}
            >
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

        {profile.transport === 'msc' ? (
          <div className="row">
            <button onClick={handlePickTarget}>Choose Walkman Drive…</button>
            <span className="target-path">{targetFolder ?? 'No target selected'}</span>
          </div>
        ) : (
          <>
            {window.walkup.platform !== 'win32' && (
              <p className="hint hint-warning">
                MTP transfer only works on Windows. This app is running on{' '}
                {window.walkup.platform === 'darwin' ? 'macOS' : window.walkup.platform} — device detection below will fail.
              </p>
            )}
            <p className="hint hint-warning">
              MTP support is experimental: it writes files the same way dragging them onto the device in Explorer
              would. Some older Walkmans (NW-E507 included) only pick up new tracks in their on-device song list
              when loaded via SonicStage or Sony's MP3 File Manager — if files transfer here but don't show up on
              the device, that's what's happening, and it isn't something this app can work around.
            </p>
            <div className="row">
              <button onClick={handleRefreshMtpDevices} disabled={mtpLoading}>
                {mtpLoading ? 'Searching…' : 'Refresh MTP Devices'}
              </button>
              <select
                value={mtpDeviceName ?? ''}
                onChange={(e) => setMtpDeviceName(e.target.value || null)}
                disabled={mtpDevices.length === 0}
              >
                <option value="">{mtpDevices.length === 0 ? 'No devices found yet' : 'Select a device…'}</option>
                {mtpDevices.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>4. Transfer</h2>
        <button className="primary" onClick={handleTransfer} disabled={!targetReady || includedCount === 0 || transferring}>
          {transferring ? 'Transferring…' : `Start Transfer (${includedCount} tracks)`}
        </button>
        {log.length > 0 && <pre className="log">{log.join('\n')}</pre>}
      </section>
    </div>
  );
}
