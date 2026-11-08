import { ROOM_TYPE_LABEL } from '../data/campus';
import { campus, people } from '../data/world';
import { roomTeachersAt, useSnapshot } from '../state/derive';
import { useLimit } from '../components/common';

export function RoomTooltip({ roomId, x, y, container, picking }: { roomId: string; x: number; y: number; container: HTMLElement | null; picking: boolean }) {
  const snap = useSnapshot(1000);
  const limit = useLimit(roomId);
  const r = campus.roomById.get(roomId);
  if (!r || !container) return null;
  const b = campus.buildingById.get(r.buildingId)!;
  const rect = container.getBoundingClientRect();
  const count = snap.counts.get(roomId) ?? 0;
  const inc = snap.incoming.get(roomId) ?? 0;
  const tis = roomTeachersAt(roomId, snap.block);
  let left = x - rect.left + 14;
  let top = y - rect.top + 14;
  if (left > rect.width - 290) left = x - rect.left - 290;
  if (top > rect.height - 150) top = y - rect.top - 140;
  return (
    <div className="tooltip" style={{ left, top }}>
      <b>{r.name}</b>
      {r.number && !r.name.includes(r.number) && <span className="tt-sub"> · {r.number}</span>}
      <div className="tt-sub">
        {b.name} · Floor {r.floor + 1} · {ROOM_TYPE_LABEL[r.type]}
      </div>
      {snap.block >= 0 && r.type !== 'stairs' && (
        <div>
          👥 {count} here{limit !== null ? ` / limit ${limit}` : ''}
          {inc ? ` · ${inc} on the way` : ''}
        </div>
      )}
      {tis.slice(0, 3).map((ti) => {
        const t = people.teachers[ti];
        const blk = t.blocks[snap.block];
        return (
          <div key={ti}>
            🧑‍🏫 {t.display}{' '}
            <span className="tt-sub">· {blk.kind === 'teach' ? people.sections[blk.sectionId].course : blk.kind === 'duty' ? 'Study hall' : 'Planning'}</span>
          </div>
        );
      })}
      {picking && r.type !== 'stairs' && <div className="tt-hint">Click to send the student here</div>}
    </div>
  );
}
