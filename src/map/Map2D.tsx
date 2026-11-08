import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Building, Room } from '../data/campus';
import type { RoutePt } from '../data/nav';
import { studentName } from '../data/people';
import { campus, nav, people, roomsOn } from '../data/world';
import { hashStr } from '../lib/rng';
import { blockIndexAt, fmtTime } from '../lib/time';
import { passPosition, roomTeachersAt, useNow, useSnapshot, type ActivePass, type Snapshot } from '../state/derive';
import { getNow, limitFor, useShared, useUI } from '../state/store';
import { LIMIT_COLOR, limitStatus, phaseTone, R, roomFill, TONE_COLOR } from '../components/common';
import { BuildingPreview } from './BuildingPreview';
import { RoomTooltip } from './RoomTooltip';

interface View {
  cx: number;
  cy: number;
  s: number; // px per meter
}

export function Map2D({ active }: { active: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ cx: 220, cy: 170, s: 2 });
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverRoom, setHoverRoom] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hoverBld, setHoverBld] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const previewHeld = useRef(false);

  const floor = useUI((s) => s.floor2d);
  const focus = useUI((s) => s.focus);
  const draft = useUI((s) => s.draft);
  const picking = !!draft?.picking;

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      if (!fitted.current && r.width > 0) {
        fitted.current = true;
        setView(fitView(r.width, r.height));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Smoothly fly to a focus point.
  useEffect(() => {
    if (!focus) return;
    const start = { ...viewRef.current };
    const target = { cx: focus.x, cy: focus.y, s: Math.max(start.s, focus.zoom ?? start.s) };
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 450);
      const e = 1 - Math.pow(1 - k, 3);
      setView({ cx: start.cx + (target.cx - start.cx) * e, cy: start.cy + (target.cy - start.cy) * e, s: start.s + (target.s - start.s) * e });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus?.n]);

  const viewRef = useRef(view);
  viewRef.current = view;

  const vb = { x: view.cx - size.w / 2 / view.s, y: view.cy - size.h / 2 / view.s, w: size.w / view.s, h: size.h / view.s };
  const toWorld = (clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: vb.x + (clientX - r.left) / view.s, y: vb.y + (clientY - r.top) / view.s };
  };

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    setView((v) => {
      const s = Math.min(40, Math.max(0.8, v.s * factor));
      if (clientX === undefined || clientY === undefined) return { ...v, s };
      const r = wrapRef.current!.getBoundingClientRect();
      const px = clientX - r.left - size.w / 2;
      const py = clientY - r.top - size.h / 2;
      const wx = v.cx + px / v.s;
      const wy = v.cy + py / v.s;
      return { s, cx: wx - px / s, cy: wy - py / s };
    });
  };

  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUI.getState().updateDraft({ picking: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showBuildingHover = (id: string | null) => {
    window.clearTimeout(hoverTimer.current);
    if (id) hoverTimer.current = window.setTimeout(() => setHoverBld(id), 220);
    else hoverTimer.current = window.setTimeout(() => !previewHeld.current && setHoverBld(null), 300);
  };

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, display: active ? undefined : 'none' }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('.overlay')) return;
        drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) {
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) > 4) {
            d.moved = true;
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (d.moved) setView((v) => ({ ...v, cx: d.cx - dx / v.s, cy: d.cy - dy / v.s }));
        }
        if (hoverRoom) setHoverRoom((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        setDragging(false);
        if (d?.moved) return;
        // Click: hit-test rooms on the visible floor.
        if ((e.target as Element).closest('.overlay')) return;
        const p = toWorld(e.clientX, e.clientY);
        const hit = hitRoom(p.x, p.y, floor);
        const ui = useUI.getState();
        if (hit) {
          if (ui.draft?.picking) {
            pickDest(hit.room);
          } else ui.select({ kind: 'room', id: hit.room.id });
        } else {
          const b = hitBuilding(p.x, p.y);
          if (b && !ui.draft?.picking) ui.select({ kind: 'building', id: b.id });
        }
      }}
    >
      <svg className={`map-svg${picking ? ' picking' : ''}${dragging ? ' dragging' : ''}`} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
        <defs>
          <pattern id="roof" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill="#c9ced6" />
            <line x1="0" y1="0" x2="0" y2="3" stroke="#b7bdc7" strokeWidth="1.2" />
          </pattern>
          <pattern id="stalls" width="3" height="6" patternUnits="userSpaceOnUse">
            <rect width="3" height="6" fill="#b9bec6" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#e8eaee" strokeWidth="0.25" />
          </pattern>
          <pattern id="mow" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="4" fill="#9cc78a" />
            <rect y="4" width="8" height="4" fill="#94c182" />
          </pattern>
        </defs>
        {active && (
          <>
            <Ground />
            <Buildings floor={floor} scale={view.s} onHoverRoom={(id, x, y) => setHoverRoom(id ? { id, x, y } : null)} onHoverBuilding={showBuildingHover} />
            <StudentDots floor={floor} />
            <Routes floor={floor} scale={view.s} />
            <DraftRoute />
            <SelectionMarker floor={floor} scale={view.s} />
          </>
        )}
      </svg>

      {hoverRoom && !dragging && <RoomTooltip roomId={hoverRoom.id} x={hoverRoom.x} y={hoverRoom.y} container={wrapRef.current} picking={picking} />}

      {hoverBld && !picking && (
        <div
          onMouseEnter={() => {
            previewHeld.current = true;
            window.clearTimeout(hoverTimer.current);
          }}
          onMouseLeave={() => {
            previewHeld.current = false;
            setHoverBld(null);
          }}
        >
          <BuildingPreview
            buildingId={hoverBld}
            onPickFloor={(f) => {
              const b = campus.buildingById.get(hoverBld)!;
              useUI.getState().focusOn(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2, f, Math.max(view.s, fitBuildingScale(b, size)));
              previewHeld.current = false;
              setHoverBld(null);
            }}
          />
        </div>
      )}

      <div className="overlay panel-float zoom-ctl">
        <button onClick={() => zoomAt(1.4)} title="Zoom in">
          +
        </button>
        <button onClick={() => zoomAt(1 / 1.4)} title="Zoom out">
          −
        </button>
        <button onClick={() => setView(fitView(size.w, size.h))} title="Fit campus" style={{ fontSize: 12 }}>
          ⤢
        </button>
      </div>
    </div>
  );
}

function fitView(w: number, h: number): View {
  return { cx: campus.width / 2, cy: campus.height / 2 - 5, s: Math.min(w / (campus.width + 30), (h - 90) / (campus.height + 20)) };
}
function fitBuildingScale(b: Building, size: { w: number; h: number }) {
  return Math.min(size.w / (b.rect.w + 40), size.h / (b.rect.h + 60));
}

export function pickDest(room: Room) {
  const ui = useUI.getState();
  if (room.type === 'stairs') return;
  const t = getNow();
  const block = blockIndexAt(t);
  const tis = roomTeachersAt(room.id, block);
  const teacher = tis.find((ti) => people.teachers[ti].blocks[block].kind !== 'plan') ?? tis[0];
  const isTeachRoom = room.teaching && teacher !== undefined;
  ui.updateDraft({
    destRoomId: room.id,
    destTeacherIdx: undefined,
    picking: false,
    kind: isTeachRoom ? 'one_way' : 'round_trip',
    reason:
      room.type === 'restroom'
        ? 'Restroom'
        : room.type === 'nurse'
          ? 'Nurse'
          : room.type === 'guidance'
            ? 'Guidance'
            : room.type === 'library'
              ? 'Library'
              : room.type === 'office'
                ? 'Main Office'
                : isTeachRoom
                  ? 'Teacher visit'
                  : 'Other',
  });
}

function hitRoom(x: number, y: number, floor: number): { room: Room } | null {
  const hidden = useUI.getState().hiddenBuildings;
  for (const b of campus.buildings) {
    if (hidden.includes(b.id) || floor >= b.floors) continue;
    const r = b.rect;
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    for (const room of roomsOn(b.id, floor)) {
      const q = room.rect;
      if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return { room };
    }
  }
  return null;
}
function hitBuilding(x: number, y: number) {
  return campus.buildings.find((b) => x >= b.rect.x && x <= b.rect.x + b.rect.w && y >= b.rect.y && y <= b.rect.y + b.rect.h);
}

// ---------------------------------------------------------------------------
// Static ground layer
// ---------------------------------------------------------------------------

const Ground = memo(function Ground() {
  return (
    <g>
      <rect x={-400} y={-400} width={campus.width + 800} height={campus.height + 800} fill="#cfe0c3" />
      <rect x={-6} y={-6} width={campus.width + 12} height={campus.height + 12} fill="#d6e6c9" rx={8} />
      {campus.decor.map((d, i) => {
        const r = d.rect;
        switch (d.kind) {
          case 'road':
            return (
              <g key={i}>
                <rect x={r.x - 400} y={r.y - 400} width={r.w + 400} height={r.h + 800} fill="#cfe0c3" />
                <rect {...R(r)} y={r.y - 400} height={r.h + 800} fill="#8f949c" />
                <line x1={r.x + r.w / 2} y1={r.y - 400} x2={r.x + r.w / 2} y2={r.y + r.h + 400} stroke="#f3d34a" strokeWidth={0.5} strokeDasharray="4 4" />
                <text x={r.x + r.w / 2} y={r.y + 200} fontSize={5} fill="#fff" textAnchor="middle" transform={`rotate(-90 ${r.x + r.w / 2} ${r.y + 200})`} fontWeight={600}>
                  {d.label}
                </text>
              </g>
            );
          case 'drive':
            return <rect key={i} {...R(r)} fill="#a3a8b0" />;
          case 'parking':
            return (
              <g key={i}>
                <rect {...R(r)} fill="url(#stalls)" rx={2} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 2} fontSize={6} fill="#fff" textAnchor="middle" fontWeight={700} opacity={0.9}>
                  {d.label}
                </text>
              </g>
            );
          case 'track':
            return (
              <g key={i}>
                <rect {...R(r)} rx={r.h / 2} fill="#b85c45" />
                <rect x={r.x + 9} y={r.y + 9} width={r.w - 18} height={r.h - 18} rx={(r.h - 18) / 2} fill="url(#mow)" />
                <rect x={r.x + 30} y={r.y + 18} width={r.w - 60} height={r.h - 36} fill="none" stroke="#fff" strokeWidth={0.5} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 2} fontSize={6} fill="#fff" textAnchor="middle" fontWeight={700}>
                  {d.label}
                </text>
              </g>
            );
          case 'field':
            return (
              <g key={i}>
                <rect {...R(r)} rx={4} fill="url(#mow)" />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 2} fontSize={6} fill="#fff" textAnchor="middle" fontWeight={700}>
                  {d.label}
                </text>
              </g>
            );
          case 'court':
            return (
              <g key={i}>
                <rect {...R(r)} rx={2} fill="#3f8f7d" />
                <line x1={r.x + r.w / 2} y1={r.y} x2={r.x + r.w / 2} y2={r.y + r.h} stroke="#fff" strokeWidth={0.4} />
                <line x1={r.x} y1={r.y + r.h / 2} x2={r.x + r.w} y2={r.y + r.h / 2} stroke="#fff" strokeWidth={0.4} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 3} fontSize={5} fill="#fff" textAnchor="middle" fontWeight={700}>
                  {d.label}
                </text>
              </g>
            );
        }
      })}
      {nav.walkways.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#efe7d4" strokeWidth={2.6} strokeLinecap="round" />
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Buildings & rooms
// ---------------------------------------------------------------------------

function Buildings({
  floor,
  scale,
  onHoverRoom,
  onHoverBuilding,
}: {
  floor: number;
  scale: number;
  onHoverRoom: (id: string | null, x: number, y: number) => void;
  onHoverBuilding: (id: string | null) => void;
}) {
  const snap = useSnapshot(1000);
  const hidden = useUI((s) => s.hiddenBuildings);
  const colorMode = useUI((s) => s.colorMode);
  const showCounts = useUI((s) => s.showCounts);
  const sel = useUI((s) => s.selection);
  const limits = useShared((s) => s.limits);
  const defLimit = useShared((s) => s.defaultRestroomLimit);
  const zoomedIn = scale >= 3;

  return (
    <g>
      {campus.buildings.map((b) => {
        const r = b.rect;
        const isHidden = hidden.includes(b.id);
        const hasFloor = floor < b.floors;
        const total = snap.block >= 0 ? roomsOn(b.id, Math.min(floor, b.floors - 1)).reduce((s, x) => s + (snap.counts.get(x.id) ?? 0), 0) : 0;
        return (
          <g key={b.id} opacity={isHidden ? 0.25 : 1} onMouseEnter={() => !zoomedIn && onHoverBuilding(b.id)} onMouseLeave={() => onHoverBuilding(null)}>
            <rect x={r.x + 1.2} y={r.y + 1.6} width={r.w} height={r.h} fill="rgba(0,0,0,0.16)" rx={0.8} />
            {hasFloor && !isHidden ? (
              <>
                <rect {...R(r)} fill="#fbfbfc" stroke={b.color} strokeWidth={0.9} rx={0.6} />
                <rect {...R(b.corridor)} fill="#f1f2f5" />
                {roomsOn(b.id, floor).map((room) => (
                  <RoomShape
                    key={room.id}
                    room={room}
                    fill={roomFill(room.id, snap, colorMode, limits, defLimit)}
                    count={snap.counts.get(room.id) ?? 0}
                    limit={limitFor(room.id, { limits, defaultRestroomLimit: defLimit })}
                    scale={scale}
                    showCounts={showCounts && snap.block >= 0}
                    selected={sel?.kind === 'room' && sel.id === room.id}
                    onHover={onHoverRoom}
                  />
                ))}
                <rect {...R(r)} fill="none" stroke={b.color} strokeWidth={0.9} rx={0.6} />
              </>
            ) : (
              <>
                <rect {...R(r)} fill="url(#roof)" stroke="#9aa1ab" strokeWidth={0.5} rx={0.6} />
                {!isHidden && scale > 1.5 && (
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 1.5} fontSize={Math.min(4, r.h / 4)} textAnchor="middle" fill="#5d6470" fontWeight={600}>
                    {b.floors} floor{b.floors > 1 ? 's' : ''} · no F{floor + 1}
                  </text>
                )}
              </>
            )}
            {sel?.kind === 'building' && sel.id === b.id && <rect {...R(r)} fill="none" stroke="#b3123a" strokeWidth={1.8} rx={0.6} />}
            <BuildingLabel b={b} scale={scale} total={total} onHover={onHoverBuilding} />
          </g>
        );
      })}
    </g>
  );
}

function BuildingLabel({ b, scale, total, onHover }: { b: Building; scale: number; total: number; onHover: (id: string | null) => void }) {
  const fs = 11 / scale;
  const label = `${b.name}`;
  const w = (label.length * 6.3 + (total ? 34 : 14)) / scale;
  const h = 18 / scale;
  const x = b.rect.x + b.rect.w / 2 - w / 2;
  // A couple of buildings sit close together; put those labels underneath.
  const below = b.id === 'ART' || b.id === 'OLD';
  const y = below ? b.rect.y + b.rect.h + 3 / scale : b.rect.y - h - 3 / scale;
  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(b.id)}
      onMouseLeave={() => onHover(null)}
      onPointerUp={(e) => {
        e.stopPropagation();
        useUI.getState().select({ kind: 'building', id: b.id });
      }}
    >
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#fff" stroke={b.color} strokeWidth={1 / scale} />
      <circle cx={x + 8 / scale} cy={y + h / 2} r={3.2 / scale} fill={b.color} />
      <text x={x + 15 / scale} y={y + h / 2 + fs * 0.36} fontSize={fs} fontWeight={650} fill="#1d2433">
        {label}
        {total ? <tspan fill="#7b8597" fontWeight={500}>{`  ${total}`}</tspan> : null}
      </text>
    </g>
  );
}

const RoomShape = memo(function RoomShape({
  room,
  fill,
  count,
  limit,
  scale,
  showCounts,
  selected,
  onHover,
}: {
  room: Room;
  fill: string;
  count: number;
  limit: number | null;
  scale: number;
  showCounts: boolean;
  selected: boolean;
  onHover: (id: string | null, x: number, y: number) => void;
}) {
  const r = room.rect;
  const st = limitStatus(count, limit);
  const showNum = scale >= 3.2 && room.number;
  const showName = scale >= 5.5 && r.w * scale > 60 && room.type !== 'restroom';
  const badge = showCounts && count > 0 && (scale >= 2.4 || room.type === 'restroom' || r.w > 20);
  const fs = Math.min(2.4, r.w / 4.2, 12.5 / scale);
  return (
    <g onMouseEnter={(e) => onHover(room.id, e.clientX, e.clientY)} onMouseLeave={(e) => onHover(null, e.clientX, e.clientY)}>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} stroke="#9aa3b2" strokeWidth={0.22} />
      {room.type === 'stairs' && <StairHatch r={r} />}
      {selected && <rect x={r.x + 0.3} y={r.y + 0.3} width={r.w - 0.6} height={r.h - 0.6} fill="none" stroke="#b3123a" strokeWidth={0.8} />}
      {/* door */}
      <circle cx={room.door.x} cy={room.door.y} r={0.45} fill="#9aa3b2" />
      {showNum && (
        <text x={r.x + 0.8} y={r.y + fs + 0.6} fontSize={fs} fill="#4a5468" fontWeight={650}>
          {room.number}
        </text>
      )}
      {showName && (
        <text x={r.x + 0.8} y={r.y + fs * 2 + 1} fontSize={fs * 0.72} fill="#7b8597">
          {room.name.length > 22 ? room.name.slice(0, 21) + '…' : room.name}
        </text>
      )}
      {badge && <CountBadge x={r.x + r.w - 0.6} y={r.y + r.h - 0.6} count={count} limit={limit} status={st} scale={scale} />}
    </g>
  );
});

function StairHatch({ r }: { r: { x: number; y: number; w: number; h: number } }) {
  const lines = [];
  const horiz = r.w > r.h;
  const n = 6;
  for (let i = 1; i < n; i++) {
    if (horiz) lines.push(<line key={i} x1={r.x + (r.w * i) / n} y1={r.y} x2={r.x + (r.w * i) / n} y2={r.y + r.h} stroke="#aeb4bf" strokeWidth={0.2} />);
    else lines.push(<line key={i} x1={r.x} y1={r.y + (r.h * i) / n} x2={r.x + r.w} y2={r.y + (r.h * i) / n} stroke="#aeb4bf" strokeWidth={0.2} />);
  }
  return <>{lines}</>;
}

function CountBadge({ x, y, count, limit, status, scale }: { x: number; y: number; count: number; limit: number | null; status: ReturnType<typeof limitStatus>; scale: number }) {
  const text = limit !== null ? `${count}/${limit}` : String(count);
  const px = Math.max(9.5, Math.min(12, scale * 2.6));
  const fs = px / scale;
  const w = (text.length * 0.62 + 0.9) * fs;
  const h = fs * 1.45;
  const color = status ? LIMIT_COLOR[status] : '#1d2433';
  return (
    <g pointerEvents="none">
      <rect x={x - w} y={y - h} width={w} height={h} rx={h / 2} fill={color} opacity={0.92} />
      <text x={x - w / 2} y={y - h / 2 + fs * 0.36} fontSize={fs} fill="#fff" textAnchor="middle" fontWeight={700}>
        {text}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Student dots
// ---------------------------------------------------------------------------

function StudentDots({ floor }: { floor: number }) {
  const snap = useSnapshot(2000);
  const show = useUI((s) => s.showDots);
  const hidden = useUI((s) => s.hiddenBuildings);
  const sel = useUI((s) => s.selection);
  const dots = useMemo(() => {
    if (!show || snap.block < 0) return null;
    const out: ReactElement[] = [];
    for (const b of campus.buildings) {
      if (hidden.includes(b.id) || floor >= b.floors) continue;
      for (const room of roomsOn(b.id, floor)) {
        const occ = snap.occupants(room.id);
        if (!occ.length) continue;
        const r = room.rect;
        for (const si of occ) {
          const h = hashStr(people.students[si].id);
          const x = r.x + 0.9 + ((h & 0xffff) / 0xffff) * (r.w - 1.8);
          const y = r.y + 0.9 + ((h >>> 16) / 0xffff) * (r.h - 1.8);
          const isSel = sel?.kind === 'student' && sel.idx === si;
          out.push(<circle key={si} cx={x} cy={y} r={isSel ? 0.9 : 0.42} fill={isSel ? '#b3123a' : '#334155'} opacity={isSel ? 1 : 0.55} />);
        }
      }
    }
    return out;
  }, [snap, show, hidden, floor, sel]);
  return <g pointerEvents="none">{dots}</g>;
}

// ---------------------------------------------------------------------------
// Routes for active passes
// ---------------------------------------------------------------------------

function visiblePasses(snap: Snapshot, mode: 'all' | 'selected' | 'none', hidden: string[], sel: ReturnType<typeof useUI.getState>['selection'], hl: string | null): ActivePass[] {
  if (mode === 'none') return [];
  return snap.active.filter(({ pass }) => {
    const selected = (sel?.kind === 'student' && sel.idx === pass.studentIdx) || hl === pass.id || (sel?.kind === 'room' && (pass.destRoomId === sel.id || pass.originRoomId === sel.id));
    if (mode === 'selected') return selected;
    if (selected) return true;
    const a = campus.roomById.get(pass.originRoomId)!.buildingId;
    const b = campus.roomById.get(pass.destRoomId)!.buildingId;
    return !(hidden.includes(a) && hidden.includes(b));
  });
}

function splitByFloor(pts: RoutePt[], floor: number) {
  // Segments drawn solid on the shown floor (and outdoors), faded elsewhere.
  const on: string[] = [];
  const off: string[] = [];
  let cur: RoutePt[] = [];
  let curOn: boolean | null = null;
  const flush = () => {
    if (cur.length > 1) (curOn ? on : off).push(cur.map((p) => `${p.x},${p.y}`).join(' '));
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.f !== b.f) continue;
    const isOn = a.f === floor || (a.out && b.out) ? true : false;
    if (isOn !== curOn) {
      flush();
      cur = [a];
      curOn = isOn;
    }
    cur.push(b);
  }
  flush();
  return { on, off };
}

function Routes({ floor, scale }: { floor: number; scale: number }) {
  const snap = useSnapshot(1000);
  const mode = useUI((s) => s.routes);
  const hidden = useUI((s) => s.hiddenBuildings);
  const sel = useUI((s) => s.selection);
  const hl = useUI((s) => s.highlightPassId);
  const list = visiblePasses(snap, mode, hidden, sel, hl);
  return (
    <g pointerEvents="none">
      {list.map(({ pass, st }) => {
        const route = nav.route(pass.originRoomId, pass.destRoomId);
        const { on, off } = splitByFloor(route.pts, floor);
        const color = TONE_COLOR[phaseTone(pass, st)];
        const strong = hl === pass.id || (sel?.kind === 'student' && sel.idx === pass.studentIdx);
        const w = (strong ? 3.4 : 2) / scale + 0.25;
        const dest = campus.roomById.get(pass.destRoomId)!;
        const origin = campus.roomById.get(pass.originRoomId)!;
        return (
          <g key={pass.id} opacity={strong || !hl ? 1 : 0.55}>
            {off.map((d, i) => (
              <polyline key={`o${i}`} points={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={`${4 / scale} ${3 / scale}`} opacity={0.4} strokeLinejoin="round" />
            ))}
            {on.map((d, i) => (
              <polyline key={`n${i}`} points={d} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
            ))}
            <circle cx={origin.center.x} cy={origin.center.y} r={(strong ? 4 : 2.5) / scale + 0.3} fill="#fff" stroke={color} strokeWidth={1.2 / scale} opacity={origin.floor === floor ? 1 : 0.4} />
            <circle cx={dest.center.x} cy={dest.center.y} r={(strong ? 4.5 : 3) / scale + 0.3} fill={color} opacity={dest.floor === floor ? 0.95 : 0.4} />
          </g>
        );
      })}
      <Movers list={list} floor={floor} scale={scale} />
    </g>
  );
}

/** Animated student markers — re-rendered ~8×/s independent of the rest of the map. */
function Movers({ list, floor, scale }: { list: ActivePass[]; floor: number; scale: number }) {
  const t = useNow(125);
  const sel = useUI((s) => s.selection);
  const hl = useUI((s) => s.highlightPassId);
  const few = list.length <= 14;
  return (
    <g>
      {list.map(({ pass }) => {
        const { pt, st } = passPosition(pass, t);
        if (!st.active) return null;
        const color = TONE_COLOR[phaseTone(pass, st)];
        const fl = Math.round(pt.f);
        const onFloor = fl === floor || pt.out;
        const strong = hl === pass.id || (sel?.kind === 'student' && sel.idx === pass.studentIdx);
        const rad = (strong ? 7 : 5) / scale;
        const s = people.students[pass.studentIdx];
        const showLabel = strong || (few && scale > 2.2) || scale > 6;
        const fs = 10.5 / scale;
        const label = `${studentName(s)} · left ${fmtTime(pass.createdAt)}`;
        const lw = label.length * 5.6 / scale + 10 / scale;
        return (
          <g key={pass.id} opacity={onFloor ? 1 : 0.55}>
            {strong && <circle cx={pt.x} cy={pt.y} r={rad * 2.2} fill={color} opacity={0.18} />}
            <circle cx={pt.x} cy={pt.y} r={rad} fill={onFloor ? color : '#fff'} stroke={onFloor ? '#fff' : color} strokeWidth={1.6 / scale} />
            {!onFloor && (
              <text x={pt.x} y={pt.y + fs * 0.35} fontSize={fs * 0.85} fill={color} textAnchor="middle" fontWeight={800}>
                {fl + 1}
              </text>
            )}
            {showLabel && (
              <g transform={`translate(${pt.x + rad + 3 / scale},${pt.y - fs})`}>
                <rect width={lw} height={fs * 1.9} rx={fs * 0.95} fill="#1d2433" opacity={0.88} />
                <text x={5 / scale} y={fs * 1.28} fontSize={fs} fill="#fff" fontWeight={600}>
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function DraftRoute() {
  const draft = useUI((s) => s.draft);
  const snap = useSnapshot(2000);
  if (!draft || draft.studentIdx === undefined) return null;
  const loc = snap.locate(draft.studentIdx);
  if (loc.kind !== 'room') return null;
  let dest = draft.destRoomId;
  if (draft.destTeacherIdx !== undefined && snap.block >= 0) dest = people.teachers[draft.destTeacherIdx].blocks[snap.block].roomId;
  if (!dest || dest === loc.roomId) return null;
  const route = nav.route(loc.roomId, dest);
  return (
    <polyline
      points={route.pts.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      stroke="#b3123a"
      strokeWidth={1.2}
      strokeDasharray="2.5 1.8"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}

function SelectionMarker({ floor, scale }: { floor: number; scale: number }) {
  const sel = useUI((s) => s.selection);
  const snap = useSnapshot(1000);
  useNow(250);
  if (sel?.kind !== 'student' || snap.block < 0) return null;
  const loc = snap.locate(sel.idx);
  if (loc.kind !== 'room') return null;
  const r = campus.roomById.get(loc.roomId)!;
  const h = hashStr(people.students[sel.idx].id);
  const x = r.rect.x + 0.9 + ((h & 0xffff) / 0xffff) * (r.rect.w - 1.8);
  const y = r.rect.y + 0.9 + ((h >>> 16) / 0xffff) * (r.rect.h - 1.8);
  const pulse = 1 + 0.35 * Math.sin(performance.now() / 180);
  const on = r.floor === floor;
  return (
    <g pointerEvents="none" opacity={on ? 1 : 0.5}>
      <circle cx={x} cy={y} r={(9 * pulse) / scale + 0.6} fill="none" stroke="#b3123a" strokeWidth={2 / scale} />
      <circle cx={x} cy={y} r={3.5 / scale + 0.3} fill="#b3123a" stroke="#fff" strokeWidth={1.2 / scale} />
      {!on && (
        <text x={x} y={y - 12 / scale} fontSize={10 / scale} textAnchor="middle" fill="#b3123a" fontWeight={800}>
          on floor {r.floor + 1}
        </text>
      )}
    </g>
  );
}
