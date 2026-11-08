import { campus, roomsOn } from '../data/world';
import { useSnapshot } from '../state/derive';
import { useShared, useUI } from '../state/store';
import { R, roomFill } from '../components/common';

/** Hover card: every floor plan of a building, side by side, with live headcounts. */
export function BuildingPreview({ buildingId, onPickFloor }: { buildingId: string; onPickFloor: (f: number) => void }) {
  const b = campus.buildingById.get(buildingId)!;
  const snap = useSnapshot(1000);
  const floor = useUI((s) => s.floor2d);
  const colorMode = useUI((s) => s.colorMode);
  const limits = useShared((s) => s.limits);
  const def = useShared((s) => s.defaultRestroomLimit);
  const pad = 2;
  const vb = `${b.rect.x - pad} ${b.rect.y - pad} ${b.rect.w + pad * 2} ${b.rect.h + pad * 2}`;
  return (
    <div className="overlay panel-float bpreview">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: b.color, display: 'inline-block' }} />
        <b style={{ fontSize: 14 }}>{b.name}</b>
        <span className="muted small">· {b.blurb}</span>
      </div>
      <div className="bpreview-floors">
        {Array.from({ length: b.floors }, (_, f) => {
          const rooms = roomsOn(b.id, f);
          const total = rooms.reduce((s, r) => s + (snap.counts.get(r.id) ?? 0), 0);
          return (
            <button key={f} className={`bpreview-floor${floor === f ? ' on' : ''}`} onClick={() => onPickFloor(f)}>
              <div className="cap">
                <span>Floor {f + 1}</span>
                <span className="muted">{snap.block >= 0 ? `${total} students` : `${rooms.filter((r) => r.type !== 'stairs').length} rooms`}</span>
              </div>
              <svg viewBox={vb} style={{ aspectRatio: `${b.rect.w + pad * 2} / ${b.rect.h + pad * 2}`, maxHeight: 130 }}>
                <rect {...R(b.rect)} fill="#fbfbfc" stroke={b.color} strokeWidth={0.8} />
                <rect {...R(b.corridor)} fill="#eef0f3" />
                {rooms.map((r) => (
                  <rect key={r.id} {...R(r.rect)} fill={roomFill(r.id, snap, colorMode, limits, def)} stroke="#9aa3b2" strokeWidth={0.25} />
                ))}
              </svg>
            </button>
          );
        })}
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        Click a floor to open it on the map.
      </div>
    </div>
  );
}
