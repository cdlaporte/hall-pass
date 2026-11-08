import { makeRng } from '../lib/rng';
import { BLOCKS } from '../lib/time';
import type { Campus, Room } from './campus';
import type { NavGraph } from './nav';
import type { People, Student } from './people';

export type PassKind = 'one_way' | 'round_trip';

export interface Pass {
  id: string;
  studentIdx: number;
  originRoomId: string;
  destRoomId: string;
  destTeacherIdx?: number;
  kind: PassKind;
  reason: string;
  issuedByIdx?: number; // teacher idx; undefined = admin
  block: number;
  createdAt: number; // minutes since midnight
  travelMin: number; // expected one-way walk
  stayMin: number; // planned time at destination (round trips)
  endedAt?: number;
  endedByIdx?: number | 'admin';
  simulated?: boolean;
  /** Simulated passes that the receiving teacher never checks in / student never returns. */
  stuck?: boolean;
}

export type Phase = 'en_route' | 'at_dest' | 'returning' | 'awaiting_checkin' | 'awaiting_end';

export interface PassState {
  active: boolean;
  phase: Phase;
  /** 0..1 along the current leg (en_route / returning). */
  progress: number;
  overdue: boolean;
  /** Minutes since the pass was created. */
  elapsed: number;
  /** Effective end (manual end, or auto-end at the end of the block). */
  endAt: number;
  ended: boolean;
}

export const GRACE_MIN = 3;

export const REASONS = [
  'Restroom',
  'Nurse',
  'Guidance',
  'Main Office',
  'Library',
  'Teacher visit',
  'Make-up test',
  'Water / Locker',
  'Other',
] as const;

export function passState(p: Pass, t: number): PassState {
  const blockEnd = BLOCKS[p.block].end;
  const endAt = Math.min(p.endedAt ?? Infinity, blockEnd);
  const elapsed = t - p.createdAt;
  const active = t >= p.createdAt && t < endAt;
  const ended = t >= endAt;
  const tr = p.travelMin;
  let phase: Phase;
  let progress = 0;
  let overdue = false;
  if (p.kind === 'one_way') {
    if (elapsed < tr) {
      phase = 'en_route';
      progress = elapsed / tr;
    } else {
      phase = 'awaiting_checkin';
      progress = 1;
      overdue = elapsed > tr + GRACE_MIN;
    }
  } else {
    const st = p.stayMin;
    if (elapsed < tr) {
      phase = 'en_route';
      progress = elapsed / tr;
    } else if (elapsed < tr + st) {
      phase = 'at_dest';
      progress = 1;
    } else if (elapsed < 2 * tr + st) {
      phase = 'returning';
      progress = (elapsed - tr - st) / tr;
    } else {
      phase = 'awaiting_end';
      progress = 1;
    }
    overdue = elapsed > 2 * tr + st + GRACE_MIN;
  }
  // A "stuck" simulated round trip means the student lingered at the destination.
  if (p.stuck && p.kind === 'round_trip' && (phase === 'returning' || phase === 'awaiting_end')) {
    phase = 'at_dest';
    progress = 1;
  }
  return { active, phase, progress, overdue, elapsed, endAt, ended };
}

export const PHASE_LABEL: Record<Phase, string> = {
  en_route: 'En route',
  at_dest: 'At destination',
  returning: 'Returning',
  awaiting_checkin: 'Awaiting check-in',
  awaiting_end: 'Back · end pass',
};

/** Picks the nearest restroom the student may use (same floor first, by walking distance). */
export function nearestRestroom(campus: Campus, nav: NavGraph, from: Room, student?: Student, exclude?: Set<string>): Room {
  const ok = (r: Room) => {
    if (r.type !== 'restroom' || exclude?.has(r.id)) return false;
    if (!student || r.gender === 'All-gender') return true;
    if (student.gender === 'X') return true;
    return student.gender === 'M' ? r.gender === 'Boys' : r.gender === 'Girls';
  };
  const near = campus.rooms
    .filter(ok)
    .map((r) => ({ r, d: Math.hypot(r.center.x - from.center.x, r.center.y - from.center.y) + Math.abs(r.floor - from.floor) * 25 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  let best = near[0];
  let bestLen = Infinity;
  for (const c of near) {
    const len = nav.route(from.id, c.r.id).length;
    if (len < bestLen) {
      bestLen = len;
      best = c;
    }
  }
  return best.r;
}

/**
 * Background "hallway traffic" for the demo: a deterministic set of passes spread
 * through the whole day so the map is always alive. They behave exactly like real
 * passes (teachers can check them in / end them).
 */
export function buildSimPasses(campus: Campus, nav: NavGraph, people: People, defaultRestroomLimit: number): Pass[] {
  const rng = makeRng(777);
  const out: Pass[] = [];
  const special = (type: Room['type'], name?: string) => campus.rooms.find((r) => r.type === type && (!name || r.name === name))!;
  const nurse = special('nurse', "Nurse's Office");
  const guidance = special('guidance');
  const office = special('office', 'Main Office');
  const library = special('library');

  for (let b = 0; b < BLOCKS.length; b++) {
    const blk = BLOCKS[b];
    const N = 300;
    const used = new Set<number>();
    const times = Array.from({ length: N }, () => blk.start + 6 + rng.next() * (blk.end - blk.start - 20)).sort((a, c) => a - c);
    // restroom occupancy windows for limit checking
    const rrWindows = new Map<string, [number, number][]>();
    for (const t0 of times) {
      let si: number;
      do si = rng.int(0, people.students.length - 1);
      while (used.has(si));
      used.add(si);
      const st = people.students[si];
      const sec = people.sections[st.sections[b]];
      const origin = campus.roomById.get(sec.roomId)!;
      const reason = rng.weighted([
        ['Restroom', 60],
        ['Nurse', 6],
        ['Guidance', 6],
        ['Main Office', 4],
        ['Library', 8],
        ['Teacher visit', 10],
        ['Make-up test', 4],
        ['Water / Locker', 2],
      ] as const);
      let dest: Room;
      let kind: PassKind = 'round_trip';
      let stay = rng.next() * 4 + 3;
      let destTeacherIdx: number | undefined;
      switch (reason) {
        case 'Restroom':
        case 'Water / Locker': {
          const exclude = new Set<string>();
          dest = nearestRestroom(campus, nav, origin, st);
          // Respect restroom limits: skip to the next nearest if this one is full.
          for (let tries = 0; tries < 3; tries++) {
            const win = rrWindows.get(dest.id) ?? [];
            const busy = win.filter(([a, z]) => a <= t0 && z > t0).length;
            if (busy < defaultRestroomLimit - 1) break;
            exclude.add(dest.id);
            dest = nearestRestroom(campus, nav, origin, st, exclude);
          }
          break;
        }
        case 'Nurse':
          dest = nurse;
          stay = rng.next() * 12 + 6;
          break;
        case 'Guidance':
          dest = guidance;
          kind = 'one_way';
          break;
        case 'Main Office':
          dest = office;
          stay = rng.next() * 5 + 2;
          break;
        case 'Library':
          dest = library;
          stay = rng.next() * 15 + 8;
          break;
        default: {
          // Visit another teacher who is teaching this block.
          let tIdx: number;
          let tries = 0;
          do {
            tIdx = rng.int(0, people.teachers.length - 1);
            tries++;
          } while ((people.teachers[tIdx].blocks[b].kind !== 'teach' || people.teachers[tIdx].blocks[b].roomId === origin.id) && tries < 50);
          destTeacherIdx = tIdx;
          dest = campus.roomById.get(people.teachers[tIdx].blocks[b].roomId)!;
          kind = 'one_way';
        }
      }
      if (dest.id === origin.id) continue;
      const route = nav.route(origin.id, dest.id);
      const travel = route.minutes * (0.85 + rng.next() * 0.4);
      const stuck = rng.chance(0.04);
      let endedAt: number | undefined;
      if (!stuck) endedAt = kind === 'one_way' ? t0 + travel + 0.3 + rng.next() * 2 : t0 + 2 * travel + stay + 0.2 + rng.next() * 1.5;
      if (dest.type === 'restroom') {
        const list = rrWindows.get(dest.id) ?? [];
        list.push([t0 + travel, t0 + travel + stay]);
        rrWindows.set(dest.id, list);
      }
      const issuer = sec.teacherIdx ?? undefined;
      out.push({
        id: `sim-${b}-${out.length}`,
        studentIdx: si,
        originRoomId: origin.id,
        destRoomId: dest.id,
        destTeacherIdx,
        kind,
        reason,
        issuedByIdx: issuer,
        block: b,
        createdAt: t0,
        travelMin: travel,
        stayMin: stay,
        endedAt,
        endedByIdx: endedAt ? (kind === 'one_way' ? destTeacherIdx ?? 'admin' : issuer ?? 'admin') : undefined,
        simulated: true,
        stuck,
      });
    }
  }
  return out;
}
