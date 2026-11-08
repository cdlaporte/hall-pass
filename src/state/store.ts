import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BLOCKS, blockIndexAt } from '../lib/time';
import type { Pass, PassKind } from '../data/passes';
import { campus, nav, people } from '../data/world';

// ---------------------------------------------------------------------------
// Shared state — persisted in localStorage so several browser tabs (e.g. two
// teachers) see the same passes, clock and limits. A real deployment would put
// this behind an API; the shape is intentionally API-friendly.
// ---------------------------------------------------------------------------

export interface Clock {
  anchorSim: number; // sim minutes at anchorReal
  anchorReal: number; // Date.now() ms
  speed: number;
  paused: boolean;
}

const DEFAULT_START = 9 * 60 + 47; // 9:47 AM, mid Block 2

interface SharedState {
  clock: Clock;
  userPasses: Pass[];
  /** Manual check-ins / ends applied to simulated passes. */
  overrides: Record<string, { endedAt: number; endedByIdx: number | 'admin' }>;
  limits: Record<string, number>;
  defaultRestroomLimit: number;
  simTraffic: boolean;
  version: number;

  setClock: (c: Partial<Clock>) => void;
  jumpTo: (t: number) => void;
  setSpeed: (s: number) => void;
  togglePause: () => void;
  createPass: (p: Omit<Pass, 'id' | 'block' | 'travelMin' | 'createdAt'> & { createdAt?: number }) => Pass | string;
  endPass: (pass: Pass, by: number | 'admin') => void;
  setLimit: (roomId: string, limit: number | null) => void;
  setDefaultRestroomLimit: (n: number) => void;
  setSimTraffic: (on: boolean) => void;
  resetDemo: () => void;
}

export function nowFromClock(c: Clock): number {
  if (c.paused) return c.anchorSim;
  return c.anchorSim + ((Date.now() - c.anchorReal) / 60000) * c.speed;
}

export const useShared = create<SharedState>()(
  persist(
    (set, get) => ({
      clock: { anchorSim: DEFAULT_START, anchorReal: Date.now(), speed: 1, paused: false },
      userPasses: [],
      overrides: {},
      limits: {},
      defaultRestroomLimit: 4,
      simTraffic: true,
      version: 0,

      setClock: (c) => set((s) => ({ clock: { ...s.clock, ...c } })),
      jumpTo: (t) => set((s) => ({ clock: { ...s.clock, anchorSim: t, anchorReal: Date.now() } })),
      setSpeed: (speed) => set((s) => ({ clock: { ...s.clock, anchorSim: nowFromClock(s.clock), anchorReal: Date.now(), speed } })),
      togglePause: () =>
        set((s) => ({ clock: { ...s.clock, anchorSim: nowFromClock(s.clock), anchorReal: Date.now(), paused: !s.clock.paused } })),

      createPass: (input) => {
        const t = input.createdAt ?? nowFromClock(get().clock);
        const block = blockIndexAt(t);
        if (block < 0) return 'Passes can only be created during a class block.';
        if (input.originRoomId === input.destRoomId) return 'Student is already in that room.';
        const route = nav.route(input.originRoomId, input.destRoomId);
        const pass: Pass = {
          ...input,
          id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          block,
          createdAt: t,
          travelMin: route.minutes,
        };
        set((s) => ({ userPasses: [...s.userPasses, pass], version: s.version + 1 }));
        return pass;
      },
      endPass: (pass, by) => {
        const t = nowFromClock(get().clock);
        if (pass.simulated) {
          set((s) => ({ overrides: { ...s.overrides, [pass.id]: { endedAt: t, endedByIdx: by } }, version: s.version + 1 }));
        } else {
          set((s) => ({
            userPasses: s.userPasses.map((p) => (p.id === pass.id ? { ...p, endedAt: t, endedByIdx: by } : p)),
            version: s.version + 1,
          }));
        }
      },
      setLimit: (roomId, limit) =>
        set((s) => {
          const limits = { ...s.limits };
          if (limit === null) delete limits[roomId];
          else limits[roomId] = limit;
          return { limits };
        }),
      setDefaultRestroomLimit: (n) => set({ defaultRestroomLimit: n }),
      setSimTraffic: (on) => set((s) => ({ simTraffic: on, version: s.version + 1 })),
      resetDemo: () =>
        set((s) => ({
          userPasses: [],
          overrides: {},
          limits: {},
          defaultRestroomLimit: 4,
          clock: { anchorSim: DEFAULT_START, anchorReal: Date.now(), speed: 1, paused: false },
          version: s.version + 1,
        })),
    }),
    {
      name: 'hallpass-shared-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        clock: s.clock,
        userPasses: s.userPasses,
        overrides: s.overrides,
        limits: s.limits,
        defaultRestroomLimit: s.defaultRestroomLimit,
        simTraffic: s.simTraffic,
        version: s.version,
      }),
    },
  ),
);

// Keep tabs in sync: when another tab writes, re-read.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'hallpass-shared-v1') void useShared.persist.rehydrate();
  });
}

export function getNow() {
  return nowFromClock(useShared.getState().clock);
}

export function limitFor(roomId: string, s: Pick<SharedState, 'limits' | 'defaultRestroomLimit'> = useShared.getState()): number | null {
  if (s.limits[roomId] !== undefined) return s.limits[roomId];
  const r = campus.roomById.get(roomId);
  if (r?.type === 'restroom') return s.defaultRestroomLimit;
  return null;
}

// ---------------------------------------------------------------------------
// UI state — per tab. "Signed in as" lives in sessionStorage so each tab can
// be a different teacher.
// ---------------------------------------------------------------------------

export type Selection =
  | { kind: 'student'; idx: number }
  | { kind: 'teacher'; idx: number }
  | { kind: 'room'; id: string }
  | { kind: 'building'; id: string };

export interface PassDraft {
  studentIdx?: number;
  destRoomId?: string;
  destTeacherIdx?: number;
  kind: PassKind;
  reason: string;
  stayMin: number;
  picking: boolean;
}

export type SideTab = 'search' | 'passes' | 'myroom' | 'restrooms';

interface UIState {
  meIdx: number | 'admin';
  view: '2d' | '3d';
  floor2d: number;
  floors3d: boolean[];
  hiddenBuildings: string[];
  routes: 'all' | 'selected' | 'none';
  showDots: boolean;
  showCounts: boolean;
  colorMode: 'type' | 'occupancy';
  floorGap: number;
  selection: Selection | null;
  highlightPassId: string | null;
  draft: PassDraft | null;
  tab: SideTab;
  focus: { x: number; y: number; floor: number; zoom?: number; n: number } | null;
  toasts: { id: number; text: string; tone: 'ok' | 'warn' | 'err' }[];

  setMe: (m: number | 'admin') => void;
  set: (p: Partial<UIState>) => void;
  select: (s: Selection | null) => void;
  toggleBuilding: (id: string) => void;
  openDraft: (d: Partial<PassDraft>) => void;
  updateDraft: (d: Partial<PassDraft>) => void;
  closeDraft: () => void;
  focusOn: (x: number, y: number, floor: number, zoom?: number) => void;
  toast: (text: string, tone?: 'ok' | 'warn' | 'err') => void;
}

function initialMe(): number | 'admin' {
  try {
    const v = sessionStorage.getItem('hallpass-me');
    if (v === 'admin') return 'admin';
    if (v !== null && !Number.isNaN(Number(v))) return Number(v);
  } catch {
    /* ignore */
  }
  // Default: a Science teacher with a home room.
  const t = people.teachers.find((x) => x.dept === 'Science' && x.homeRoomId);
  return t ? t.idx : 0;
}

let toastId = 1;
export const useUI = create<UIState>()((set, get) => ({
  meIdx: initialMe(),
  view: '2d',
  floor2d: 0,
  floors3d: Array.from({ length: campus.maxFloors }, () => true),
  hiddenBuildings: [],
  routes: 'all',
  showDots: true,
  showCounts: true,
  colorMode: 'type',
  floorGap: 7,
  selection: null,
  highlightPassId: null,
  draft: null,
  tab: 'search',
  focus: null,
  toasts: [],

  setMe: (m) => {
    try {
      sessionStorage.setItem('hallpass-me', String(m));
    } catch {
      /* ignore */
    }
    set({ meIdx: m });
  },
  set: (p) => set(p),
  select: (s) => set({ selection: s }),
  toggleBuilding: (id) =>
    set((s) => ({
      hiddenBuildings: s.hiddenBuildings.includes(id) ? s.hiddenBuildings.filter((b) => b !== id) : [...s.hiddenBuildings, id],
    })),
  openDraft: (d) =>
    set({
      draft: { kind: 'round_trip', reason: 'Restroom', stayMin: 5, picking: false, ...d },
    }),
  updateDraft: (d) => {
    const cur = get().draft;
    if (cur) set({ draft: { ...cur, ...d } });
  },
  closeDraft: () => set({ draft: null }),
  focusOn: (x, y, floor, zoom) => set((s) => ({ focus: { x, y, floor, zoom, n: (s.focus?.n ?? 0) + 1 }, floor2d: floor })),
  toast: (text, tone = 'ok') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
}));

export function currentBlockOrNull(t: number) {
  const b = blockIndexAt(t);
  return b >= 0 ? BLOCKS[b] : null;
}
