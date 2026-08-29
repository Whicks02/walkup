import type { Track, TransferItemStatus } from '@walkup/core';

export interface TrackRow {
  track: Track;
  included: boolean;
  willConvert: boolean;
  status?: TransferItemStatus;
  fraction?: number;
}

interface Props {
  rows: TrackRow[];
  onToggle: (id: string) => void;
  onToggleAll: (included: boolean) => void;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TrackTable({ rows, onToggle, onToggleAll }: Props) {
  const allIncluded = rows.length > 0 && rows.every((r) => r.included);

  return (
    <div className="track-table-wrap">
      <table className="track-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allIncluded}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label="Select all tracks"
              />
            </th>
            <th>Title</th>
            <th>Artist</th>
            <th>Album</th>
            <th>Fmt</th>
            <th>Len</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ track, included, willConvert, status, fraction }) => (
            <tr key={track.id} className={included ? '' : 'row-excluded'}>
              <td>
                <input type="checkbox" checked={included} onChange={() => onToggle(track.id)} />
              </td>
              <td className="cell-title">{track.title ?? '(unknown title)'}</td>
              <td>{track.artist ?? '—'}</td>
              <td>{track.album ?? '—'}</td>
              <td>
                <span className={`fmt-badge ${willConvert ? 'fmt-convert' : ''}`}>
                  {track.format.toUpperCase()}
                  {willConvert ? ' → MP3' : ''}
                </span>
              </td>
              <td>{formatDuration(track.durationSec)}</td>
              <td>{renderStatus(status, fraction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty-hint">No tracks scanned yet.</p>}
    </div>
  );
}

function renderStatus(status: TransferItemStatus | undefined, fraction: number | undefined) {
  if (!status || status === 'pending') return null;
  if (status === 'error') return <span className="status status-error">error</span>;
  if (status === 'done') return <span className="status status-done">✓</span>;
  const pct = fraction !== undefined ? Math.round(fraction * 100) : 0;
  return (
    <span className="status status-active">
      {status} {pct}%
    </span>
  );
}
