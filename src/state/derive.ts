import { useEffect, useState } from 'react';
import { passState, type Pass, type PassState } from '../data/passes';
import { campus, nav, people, simPasses } from '../data/world';
import { pointAt, type RoutePt } from '../data/nav';
import { BLOCKS, blockIndexAt, periodAt, type Period } from '../lib/time';
import { getNow, useShared } from './store';

// ---------------------------------------------------------------------------
// Merge simulated + user passes
// ---------------------------------------------------------------------------

export interface PassIndex {
  all: Pass[];
  byId: Map<string, Pass>;
  byStudent: Map<number, Pass[]>;
  byBlock: Pass[][];
}

let lastKey: unknown[] = [];
let lastIndex: PassIndex | null = null;

export function passIndex(): PassIndex {
  const s = useShared.getState();
  const key = [s.userPasses, s.overrides, s.simTraffic];
  if (lastIndex && key.every((k, i) => k === lastKey[i])) return lastIndex;

  const firstUser = new Map<string, number>(); // `${student}:${block}` → earliest user createdAt
  for (const p of s.userPasses) {
    const k = `${p.studentIdx}:${p.block}`;
    firstUser.set(k, Math.min(firstUser.get(k) ?? Infinity, p.createdAt));
  }
  const sims = s.simTraffic
    ? simPasses
        .filter((p) => p.createdAt < (firstUser.get(`${p.studentIdx}:${p.block}`) ?? Infinity))
        .map((p) => {
          const o = s.overrides[p.id];
          return o ? { ...p, endedAt: Math.min(o.endedAt, p.endedAt ?? Infinity), endedByIdx: o.endedByIdx } : p;
        })
    : [];
  const all = [...sims, ...s.userPasses].sort((a, b) => a.createdAt - b.createdAt);
  const byStudent = new Map<number, Pass[]>();
  const byBlock: Pass[][] = BLOCKS.map(() => []);
  for (const p of all) {
    const list = byStudent.get(p.studentIdx) ?? [];
    list.push(p);
    byStudent.set(p.studentIdx, list);
    byBlock[p.block].push(p);
  }
  lastKey = key;
  lastIndex = { all, byId: new Map(all.map((p) => [p.id, p])), byStudent, byBlock };
  return lastIndex;
}

// ---------------------------------------------------------------------------
// Where is everybody at time t?
// ---------------------------------------------------------------------------

export type Loc =
  | { kind: 'room'; roomId: string; pass?: Pass; st?: PassState }
  | { kind: 'transit'; pass: Pass; st: PassState; fromRoomId: string; toRoomId: string }
  | { kind: 'passing'; fromRoomId: string; toRoomId: string }
  | { kind: 'out' };

export function scheduledRoom(si: number, block: number): string {
  return people.sections[people.students[si].sections[block]].roomId;
}

function resolve(si: number, block: number, t: number, idx: PassIndex): Loc {
  let room = scheduledRoom(si, block);
  const list = idx.byStudent.get(si);
  if (!list) return { kind: 'room', roomId: room };
  for (const p of list) {
    if (p.block !== block || p.createdAt > t) continue;
    const st = passState(p, t);
    if (st.ended) {
      if (p.kind === 'one_way') room = p.destRoomId;
      continue;
    }
    switch (st.phase) {
      case 'en_route':
        return { kind: 'transit', pass: p, st, fromRoomId: p.originRoomId, toRoomId: p.destRoomId };
      case 'returning':
        return { kind: 'transit', pass: p, st, fromRoomId: p.destRoomId, toRoomId: p.originRoomId };
      case 'at_dest':
      case 'awaiting_checkin':
        return { kind: 'room', roomId: p.destRoomId, pass: p, st };
      case 'awaiting_end':
        return { kind: 'room', roomId: p.originRoomId, pass: p, st };
    }
  }
  return { kind: 'room', roomId: room };
}

export interface ActivePass {
  pass: Pass;
  st: PassState;
}

export interface Snapshot {
  t: number;
  period: Period;
  block: number;
  counts: Map<string, number>;
  /** Students currently walking toward each room. */
  incoming: Map<string, number>;
  active: ActivePass[];
  overrides: Map<number, Loc>;
  locate: (si: number) => Loc;
  occupants: (roomId: string) => number[];
  inHall: number;
}

let snapKey = '';
let snapIdx: PassIndex | null = null;
let snapCache: Snapshot | null = null;

export function snapshot(t: number): Snapshot {
  const idx = passIndex();
  const key = `${Math.floor(t * 30)}`; // 2-second resolution
  if (snapCache && key === snapKey && idx === snapIdx) return snapCache;
  const period = periodAt(t);
  const block = blockIndexAt(t);
  const counts = new Map<string, number>();
  const incoming = new Map<string, number>();
  const overrides = new Map<number, Loc>();
  const active: ActivePass[] = [];

  if (block >= 0) {
    for (const [roomId, list] of people.roster[block]) counts.set(roomId, list.length);
    const seen = new Set<number>();
    for (const p of idx.byBlock[block]) {
      if (p.createdAt > t) break;
      const st = passState(p, t);
      if (st.active) active.push({ pass: p, st });
      if (seen.has(p.studentIdx)) continue;
      seen.add(p.studentIdx);
      const loc = resolve(p.studentIdx, block, t, idx);
      const base = scheduledRoom(p.studentIdx, block);
      if (loc.kind === 'room' && loc.roomId === base && !loc.pass) continue;
      overrides.set(p.studentIdx, loc);
      counts.set(base, (counts.get(base) ?? 1) - 1);
      if (loc.kind === 'room') counts.set(loc.roomId, (counts.get(loc.roomId) ?? 0) + 1);
      else if (loc.kind === 'transit') incoming.set(loc.toRoomId, (incoming.get(loc.toRoomId) ?? 0) + 1);
    }
  }
  const inHall = period.kind === 'passing' ? people.students.length : active.filter((a) => a.st.phase === 'en_route' || a.st.phase === 'returning').length;

  const locate = (si: number): Loc => {
    if (period.kind === 'before' || period.kind === 'after') return { kind: 'out' };
    if (period.kind === 'passing')
      return { kind: 'passing', fromRoomId: scheduledRoom(si, period.from.index), toRoomId: scheduledRoom(si, period.to.index) };
    return overrides.get(si) ?? { kind: 'room', roomId: scheduledRoom(si, block) };
  };
  const occCache = new Map<string, number[]>();
  const occupants = (roomId: string): number[] => {
    if (block < 0) return [];
    const hit = occCache.get(roomId);
    if (hit) return hit;
    const out = (people.roster[block].get(roomId) ?? []).filter((si) => !overrides.has(si));
    for (const [si, loc] of overrides) if (loc.kind === 'room' && loc.roomId === roomId) out.push(si);
    occCache.set(roomId, out);
    return out;
  };

  snapKey = key;
  snapIdx = idx;
  snapCache = { t, period, block, counts, incoming, active, overrides, locate, occupants, inHall };
  return snapCache;
}

/** Live position of a student on an active pass (for animation). */
export function passPosition(p: Pass, t: number): { pt: RoutePt; leg: 'out' | 'back' | 'still'; st: PassState } {
  const st = passState(p, t);
  const route = nav.route(p.originRoomId, p.destRoomId);
  if (st.phase === 'en_route') return { pt: pointAt(route, st.progress), leg: 'out', st };
  if (st.phase === 'returning') return { pt: pointAt(route, 1 - st.progress), leg: 'back', st };
  const roomId = st.phase === 'awaiting_end' ? p.originRoomId : p.destRoomId;
  const r = campus.roomById.get(roomId)!;
  return { pt: { x: r.center.x, y: r.center.y, f: r.floor, b: r.buildingId }, leg: 'still', st };
}

export function teacherRoomAt(ti: number, block: number): string | null {
  if (block < 0) return null;
  return people.teachers[ti].blocks[block].roomId;
}

export function roomTeachersAt(roomId: string, block: number): number[] {
  if (block < 0) return [];
  return people.roomTeachers[block].get(roomId) ?? [];
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/** Re-renders every `ms` with the current sim time. */
export function useNow(ms = 1000): number {
  const [, force] = useState(0);
  useShared((s) => s.clock); // re-render immediately on clock changes
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return getNow();
}

export function useSnapshot(ms = 1000): Snapshot {
  const t = useNow(ms);
  useShared((s) => s.version);
  useShared((s) => s.simTraffic);
  return snapshot(t);
}
