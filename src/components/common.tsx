import type { RoomType } from '../data/campus';
import { PHASE_LABEL, type Pass, type PassState } from '../data/passes';
import { campus, people, roomLabel, roomWhere } from '../data/world';
import { hashStr } from '../lib/rng';
import { getNow, limitFor, useShared, useUI } from '../state/store';
import { passPosition, snapshot, type Loc, type Snapshot } from '../state/derive';

export const ROOM_FILL: Record<RoomType, string> = {
  classroom: '#e9eef7',
  lab: '#dcf1e7',
  studio: '#f6e1ee',
  shop: '#e9e3f5',
  restroom: '#d3e9fb',
  office: '#f2ead8',
  nurse: '#fde0e0',
  guidance: '#fdefd0',
  cafeteria: '#fae1c5',
  library: '#eddcc7',
  commons: '#f3ecd9',
  gym: '#dfe5ea',
  locker: '#dfe5ea',
  theatre: '#efd9e3',
  stairs: '#cfd3db',
  storage: '#e2e2e2',
};

const AVATAR_COLORS = ['#b3123a', '#2563eb', '#0f766e', '#7c3aed', '#c2410c', '#0369a1', '#be185d', '#4d7c0f', '#6d28d9', '#b45309'];

export function Avatar({ name, lg }: { name: string; lg?: boolean }) {
  const parts = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s/, '').split(' ');
  const initials = (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
  return (
    <div className={`avatar${lg ? ' lg' : ''}`} style={{ background: AVATAR_COLORS[hashStr(name) % AVATAR_COLORS.length] }}>
      {initials}
    </div>
  );
}

export function phaseTone(p: Pass, st: PassState): string {
  if (st.overdue) return 'red';
  switch (st.phase) {
    case 'en_route':
      return 'blue';
    case 'returning':
      return 'violet';
    case 'at_dest':
      return 'green';
    case 'awaiting_checkin':
    case 'awaiting_end':
      return p.kind === 'one_way' ? 'amber' : 'amber';
  }
}

export const TONE_COLOR: Record<string, string> = {
  blue: '#2563eb',
  violet: '#7c3aed',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
};

export function PhasePill({ pass, st }: { pass: Pass; st: PassState }) {
  if (st.ended) return <span className="pill">Ended</span>;
  const tone = phaseTone(pass, st);
  const label = st.overdue ? (st.phase === 'awaiting_checkin' ? 'Not checked in' : 'Over time') : PHASE_LABEL[st.phase];
  return <span className={`pill ${tone}`}>{label}</span>;
}

/** Restroom-style status for rooms with a limit. */
export function limitStatus(count: number, limit: number | null): 'ok' | 'near' | 'full' | null {
  if (limit === null) return null;
  if (count >= limit) return 'full';
  if (count >= limit - 1) return 'near';
  return 'ok';
}
export const LIMIT_COLOR = { ok: '#16a34a', near: '#d97706', full: '#dc2626' } as const;

export function useLimit(roomId: string): number | null {
  const limits = useShared((s) => s.limits);
  const def = useShared((s) => s.defaultRestroomLimit);
  return limitFor(roomId, { limits, defaultRestroomLimit: def });
}

export function occupancyFill(count: number, capacity: number): string {
  if (count <= 0) return '#f4f6f8';
  const r = Math.min(1, count / Math.max(8, capacity));
  // light blue → deep blue
  const a = [219, 234, 254];
  const b = [30, 64, 175];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.sqrt(r)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function roomFill(roomId: string, snap: Snapshot, mode: 'type' | 'occupancy', limits: Record<string, number>, defLimit: number): string {
  const r = campus.roomById.get(roomId)!;
  const limit = limitFor(roomId, { limits, defaultRestroomLimit: defLimit });
  if (limit !== null && snap.block >= 0) {
    const st = limitStatus(snap.counts.get(roomId) ?? 0, limit);
    if (r.type === 'restroom' || mode === 'occupancy') {
      if (st === 'full') return '#fca5a5';
      if (st === 'near') return '#fcd34d';
      if ((snap.counts.get(roomId) ?? 0) > 0) return '#86efac';
    }
  }
  if (mode === 'occupancy' && r.type !== 'stairs') return occupancyFill(snap.counts.get(roomId) ?? 0, r.capacity);
  return ROOM_FILL[r.type];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const studentHay = people.students.map((s) => `${s.first} ${s.last} ${s.id} grade${s.grade}`.toLowerCase());
const teacherHay = people.teachers.map((t) => `${t.title} ${t.first} ${t.last} ${t.dept} ${t.id}`.toLowerCase());
const roomHay = campus.rooms.map((r) => {
  const b = campus.buildingById.get(r.buildingId)!;
  return `${r.number} ${r.name} ${b.name} floor ${r.floor + 1} ${r.type}`.toLowerCase();
});

function matches(hay: string, tokens: string[]) {
  return tokens.every((t) => hay.includes(t));
}

export function search(q: string, limits = { students: 30, teachers: 12, rooms: 12 }) {
  const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { students: [], teachers: [], rooms: [] };
  const students: number[] = [];
  for (let i = 0; i < studentHay.length && students.length < limits.students; i++) if (matches(studentHay[i], tokens)) students.push(i);
  const teachers: number[] = [];
  for (let i = 0; i < teacherHay.length && teachers.length < limits.teachers; i++) if (matches(teacherHay[i], tokens)) teachers.push(i);
  const rooms: string[] = [];
  for (let i = 0; i < roomHay.length && rooms.length < limits.rooms; i++) {
    if (campus.rooms[i].type === 'stairs') continue;
    if (matches(roomHay[i], tokens)) rooms.push(campus.rooms[i].id);
  }
  return { students, teachers, rooms };
}

export function gradeLabel(g: number) {
  return `Grade ${g} · Class of ${2030 - (g - 9)}`;
}

// ---------------------------------------------------------------------------
// Locations & focus helpers
// ---------------------------------------------------------------------------


export function describeLoc(loc: Loc): { title: string; sub: string } {
  switch (loc.kind) {
    case 'out':
      return { title: 'Not in school hours', sub: 'Outside the bell schedule' };
    case 'passing':
      return { title: 'Passing period', sub: `${roomLabel(loc.fromRoomId)} → ${roomLabel(loc.toRoomId)}` };
    case 'transit':
      return { title: `Walking to ${roomLabel(loc.toRoomId)}`, sub: `From ${roomLabel(loc.fromRoomId)}` };
    case 'room':
      return { title: roomLabel(loc.roomId), sub: roomWhere(loc.roomId) };
  }
}

export function focusRoom(roomId: string, zoom = 7) {
  const r = campus.roomById.get(roomId);
  if (!r) return;
  useUI.getState().focusOn(r.center.x, r.center.y, r.floor, zoom);
}

export function focusStudent(si: number) {
  const t = getNow();
  const loc = snapshot(t).locate(si);
  if (loc.kind === 'transit') {
    const { pt } = passPosition(loc.pass, t);
    useUI.getState().focusOn(pt.x, pt.y, Math.round(pt.f), 5);
  } else if (loc.kind === 'room') focusRoom(loc.roomId);
  else if (loc.kind === 'passing') focusRoom(loc.toRoomId);
}

/** Rect → SVG <rect> attributes. */
export function R(r: { x: number; y: number; w: number; h: number }) {
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}
