/**
 * Fictional campus model loosely inspired by Pinkerton Academy (Derry, NH).
 * Building names, footprints and floor plans are invented for the demo — they are
 * NOT the real Pinkerton buildings. Everything here is in meters on a flat campus
 * plane: +x is east, +y is south (SVG convention). Floors are 0-based.
 */

export type RoomType =
  | 'classroom'
  | 'lab'
  | 'studio'
  | 'shop'
  | 'restroom'
  | 'office'
  | 'nurse'
  | 'guidance'
  | 'cafeteria'
  | 'library'
  | 'commons'
  | 'gym'
  | 'locker'
  | 'theatre'
  | 'stairs'
  | 'storage';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  /** Short label shown on the map, e.g. "S214" or "RR". */
  number: string;
  name: string;
  type: RoomType;
  buildingId: string;
  floor: number;
  rect: Rect;
  center: Pt;
  /** Point where the room meets the corridor. */
  door: Pt;
  /** Corridor centreline point in front of the door. */
  corridorPt: Pt;
  capacity: number;
  gender?: 'Boys' | 'Girls' | 'All-gender';
  /** Rooms that host scheduled classes. */
  teaching: boolean;
}

export interface Building {
  id: string;
  code: string;
  name: string;
  blurb: string;
  rect: Rect;
  orient: 'h' | 'v';
  length: number;
  depth: number;
  floors: number;
  color: string;
  /** Corridor rectangle (same on every floor). */
  corridor: Rect;
  /** Corridor centreline endpoints in world coords. */
  corridorEnds: [Pt, Pt];
  entrances: Pt[];
  stairsU: number[];
}

export interface Decor {
  kind: 'road' | 'parking' | 'field' | 'track' | 'court' | 'drive';
  rect: Rect;
  label?: string;
}

// ---------------------------------------------------------------------------
// Floor-plan generator
// ---------------------------------------------------------------------------

interface SlotSpec {
  w: number;
  name: string;
  type: RoomType;
  cap?: number;
  gender?: Room['gender'];
}
type Slot = SlotSpec | 'FILL';
interface FloorPlan {
  a: Slot[];
  b: Slot[];
}

const STAIRS: SlotSpec = { w: 5, name: 'Stairwell', type: 'stairs' };
const RR_B: SlotSpec = { w: 5, name: "Boys' Restroom", type: 'restroom', gender: 'Boys' };
const RR_G: SlotSpec = { w: 5, name: "Girls' Restroom", type: 'restroom', gender: 'Girls' };
const RR_X: SlotSpec = { w: 4, name: 'All-Gender Restroom', type: 'restroom', gender: 'All-gender' };

const DEFAULT_PLAN: FloorPlan = { a: [STAIRS, 'FILL', STAIRS], b: ['FILL', RR_B, RR_G, 'FILL'] };

const CAPACITY: Partial<Record<RoomType, number>> = {
  classroom: 28,
  lab: 26,
  studio: 26,
  shop: 22,
  restroom: 6,
  office: 10,
  nurse: 8,
  guidance: 12,
  cafeteria: 320,
  library: 120,
  commons: 80,
  gym: 120,
  locker: 60,
  theatre: 450,
  stairs: 0,
  storage: 0,
};

interface BuildingDef {
  id: string;
  code: string;
  name: string;
  blurb: string;
  x: number;
  y: number;
  length: number;
  depth: number;
  orient: 'h' | 'v';
  floors: number;
  color: string;
  fillType?: RoomType;
  plans?: Record<number, FloorPlan>;
}

const DEFS: BuildingDef[] = [
  {
    id: 'MAIN',
    code: 'M',
    name: 'Main Building',
    blurb: 'English · Social Studies · Administration',
    x: 70,
    y: 140,
    length: 110,
    depth: 22,
    orient: 'h',
    floors: 3,
    color: '#b3123a',
    plans: {
      0: {
        a: [
          STAIRS,
          { w: 18, name: 'Main Office', type: 'office' },
          { w: 9, name: "Nurse's Office", type: 'nurse' },
          'FILL',
          STAIRS,
        ],
        b: [
          { w: 16, name: 'Guidance & Counseling', type: 'guidance' },
          'FILL',
          RR_B,
          RR_G,
          RR_X,
          'FILL',
          { w: 11, name: 'Faculty Workroom', type: 'office' },
        ],
      },
    },
  },
  {
    id: 'OLD',
    code: 'OA',
    name: 'Old Academy',
    blurb: 'Historic 1815 schoolhouse · Admissions & Alumni',
    x: 26,
    y: 146,
    length: 18,
    depth: 13,
    orient: 'h',
    floors: 1,
    color: '#8a6d3b',
    plans: {
      0: {
        a: [{ w: 18, name: 'Alumni Heritage Room', type: 'commons' }],
        b: [
          { w: 12, name: 'Admissions Office', type: 'office' },
          { w: 6, name: 'All-Gender Restroom', type: 'restroom', gender: 'All-gender' },
        ],
      },
    },
  },
  {
    id: 'WEB',
    code: 'W',
    name: 'Webster Hall',
    blurb: 'World Languages · Special Education',
    x: 70,
    y: 68,
    length: 90,
    depth: 22,
    orient: 'h',
    floors: 2,
    color: '#2f6f9f',
  },
  {
    id: 'FND',
    code: 'F',
    name: 'Founders Hall',
    blurb: 'Mathematics',
    x: 200,
    y: 60,
    length: 90,
    depth: 22,
    orient: 'v',
    floors: 2,
    color: '#4b5ea8',
  },
  {
    id: 'SCI',
    code: 'S',
    name: 'Science Center',
    blurb: 'Biology · Chemistry · Physics · Earth Science',
    x: 240,
    y: 120,
    length: 100,
    depth: 24,
    orient: 'h',
    floors: 3,
    color: '#2e8b6e',
    fillType: 'lab',
  },
  {
    id: 'FRC',
    code: 'C',
    name: 'Freshman Center',
    blurb: 'Grade 9 core teams',
    x: 240,
    y: 176,
    length: 100,
    depth: 22,
    orient: 'h',
    floors: 2,
    color: '#c9792b',
  },
  {
    id: 'CTE',
    code: 'T',
    name: 'CTE & Technology Center',
    blurb: 'Career & Technical Education · Business',
    x: 240,
    y: 60,
    length: 84,
    depth: 22,
    orient: 'h',
    floors: 2,
    color: '#6b5b95',
    plans: {
      0: {
        a: [
          STAIRS,
          { w: 22, name: 'Automotive Shop', type: 'shop', cap: 24 },
          { w: 16, name: 'Culinary Kitchen', type: 'shop', cap: 22 },
          'FILL',
          STAIRS,
        ],
        b: [{ w: 16, name: 'Construction Trades Shop', type: 'shop', cap: 22 }, 'FILL', RR_B, RR_G, 'FILL'],
      },
    },
  },
  {
    id: 'LIB',
    code: 'L',
    name: 'Library & Student Commons',
    blurb: 'Cafeteria · Library · Study Halls',
    x: 70,
    y: 190,
    length: 62,
    depth: 30,
    orient: 'h',
    floors: 2,
    color: '#a0522d',
    plans: {
      0: {
        a: [STAIRS, { w: 52, name: 'Cafeteria', type: 'cafeteria' }, STAIRS],
        b: [
          { w: 14, name: 'Kitchen & Servery', type: 'storage' },
          { w: 21, name: 'Student Commons', type: 'commons' },
          RR_B,
          RR_G,
          { w: 17, name: 'Student Services', type: 'office' },
        ],
      },
      1: {
        a: [STAIRS, { w: 52, name: 'Library', type: 'library' }, STAIRS],
        b: [
          { w: 15, name: 'Media Lab', type: 'lab', cap: 30 },
          'FILL',
          RR_B,
          RR_G,
          { w: 12, name: 'Conference Room', type: 'office' },
        ],
      },
    },
  },
  {
    id: 'ART',
    code: 'A',
    name: 'Arts Center & Theatre',
    blurb: 'Visual & Performing Arts',
    x: 150,
    y: 192,
    length: 56,
    depth: 36,
    orient: 'h',
    floors: 2,
    color: '#b0457a',
    fillType: 'studio',
    plans: {
      0: {
        a: [STAIRS, { w: 46, name: 'Theatre', type: 'theatre' }, STAIRS],
        b: [
          { w: 16, name: 'Band Room', type: 'studio', cap: 60 },
          { w: 16, name: 'Chorus Room', type: 'studio', cap: 60 },
          RR_B,
          RR_G,
          { w: 14, name: 'Black Box Studio', type: 'studio', cap: 40 },
        ],
      },
    },
  },
  {
    id: 'FH',
    code: 'G',
    name: 'Field House',
    blurb: 'Physical Education · Health · Athletics',
    x: 362,
    y: 106,
    length: 64,
    depth: 48,
    orient: 'v',
    floors: 2,
    color: '#5d6d7e',
    plans: {
      0: {
        a: [STAIRS, { w: 54, name: 'Main Gymnasium', type: 'gym', cap: 140 }, STAIRS],
        b: [
          { w: 14, name: "Boys' Locker Room", type: 'locker' },
          { w: 14, name: "Girls' Locker Room", type: 'locker' },
          RR_B,
          RR_G,
          { w: 12, name: 'Athletic Office', type: 'office' },
          { w: 14, name: 'Athletic Training Room', type: 'nurse' },
        ],
      },
      1: {
        a: [
          STAIRS,
          { w: 30, name: 'Fitness Center', type: 'gym', cap: 60 },
          { w: 24, name: 'Dance Studio', type: 'gym', cap: 50 },
          STAIRS,
        ],
        b: ['FILL', RR_B, RR_G, 'FILL'],
      },
    },
  },
];

const CORRIDOR_W = 3.6;
const TARGET_ROOM_W = 9;

function toWorld(def: BuildingDef, u: number, v: number): Pt {
  return def.orient === 'h' ? { x: def.x + u, y: def.y + v } : { x: def.x + v, y: def.y + u };
}
function rectToWorld(def: BuildingDef, u: number, v: number, du: number, dv: number): Rect {
  return def.orient === 'h'
    ? { x: def.x + u, y: def.y + v, w: du, h: dv }
    : { x: def.x + v, y: def.y + u, w: dv, h: du };
}

function expandSide(slots: Slot[], length: number, fillType: RoomType): SlotSpec[] {
  const fixed = slots.reduce((s, sl) => s + (sl === 'FILL' ? 0 : sl.w), 0);
  const fills = slots.filter((s) => s === 'FILL').length;
  const out: SlotSpec[] = [];
  const per = fills ? (length - fixed) / fills : 0;
  for (const sl of slots) {
    if (sl !== 'FILL') {
      out.push(sl);
      continue;
    }
    if (per < 4) continue;
    const n = Math.max(1, Math.round(per / TARGET_ROOM_W));
    for (let i = 0; i < n; i++) out.push({ w: per / n, name: '', type: fillType });
  }
  return out;
}

function buildBuilding(def: BuildingDef, rooms: Room[]): Building {
  const { length: L, depth: D } = def;
  const cv0 = (D - CORRIDOR_W) / 2;
  const cv1 = cv0 + CORRIDOR_W;
  const cMid = D / 2;
  const stairsU: number[] = [];

  for (let f = 0; f < def.floors; f++) {
    const plan = def.plans?.[f] ?? DEFAULT_PLAN;
    let seq = 1;
    for (const side of ['a', 'b'] as const) {
      const specs = expandSide(plan[side], L, def.fillType ?? 'classroom');
      let u = 0;
      for (const spec of specs) {
        const v0 = side === 'a' ? 0 : cv1;
        const dv = side === 'a' ? cv0 : D - cv1;
        const uMid = u + spec.w / 2;
        if (spec.type === 'stairs' && f === 0) stairsU.push(uMid);
        const numbered = spec.type !== 'stairs' && spec.type !== 'restroom' && spec.type !== 'storage';
        const num = numbered ? `${def.code}${f + 1}${String(seq++).padStart(2, '0')}` : '';
        const rect = rectToWorld(def, u, v0, spec.w, dv);
        const teaching = ['classroom', 'lab', 'studio', 'shop', 'gym'].includes(spec.type);
        const id = `${def.id}-${f + 1}-${side}${Math.round(u)}`;
        let name = spec.name;
        if (!name) {
          const kind = spec.type === 'lab' ? 'Lab' : spec.type === 'studio' ? 'Studio' : 'Room';
          name = `${kind} ${num}`;
        }
        let label = num;
        if (spec.type === 'restroom') label = spec.gender === 'Boys' ? 'RR·B' : spec.gender === 'Girls' ? 'RR·G' : 'RR';
        if (spec.type === 'stairs') label = '';
        rooms.push({
          id,
          number: label,
          name,
          type: spec.type,
          buildingId: def.id,
          floor: f,
          rect,
          center: toWorld(def, uMid, v0 + dv / 2),
          door: toWorld(def, uMid, side === 'a' ? cv0 : cv1),
          corridorPt: toWorld(def, uMid, cMid),
          capacity: spec.cap ?? CAPACITY[spec.type] ?? 20,
          gender: spec.gender,
          teaching,
        });
        u += spec.w;
      }
    }
  }

  const corridor = rectToWorld(def, 0, cv0, L, CORRIDOR_W);
  const footprint = rectToWorld(def, 0, 0, L, D);
  return {
    id: def.id,
    code: def.code,
    name: def.name,
    blurb: def.blurb,
    rect: footprint,
    orient: def.orient,
    length: L,
    depth: D,
    floors: def.floors,
    color: def.color,
    corridor,
    corridorEnds: [toWorld(def, 0, cMid), toWorld(def, L, cMid)],
    entrances: [toWorld(def, -5, cMid), toWorld(def, L + 5, cMid)],
    stairsU,
  };
}

export interface Campus {
  width: number;
  height: number;
  buildings: Building[];
  buildingById: Map<string, Building>;
  rooms: Room[];
  roomById: Map<string, Room>;
  decor: Decor[];
  maxFloors: number;
}

export function buildCampus(): Campus {
  const rooms: Room[] = [];
  const buildings = DEFS.map((d) => buildBuilding(d, rooms));
  const decor: Decor[] = [
    { kind: 'road', rect: { x: 0, y: 0, w: 14, h: 340 }, label: 'Route 28 · N. Main St.' },
    { kind: 'drive', rect: { x: 14, y: 122, w: 52, h: 8 } },
    { kind: 'drive', rect: { x: 14, y: 30, w: 56, h: 8 } },
    { kind: 'parking', rect: { x: 70, y: 12, w: 112, h: 42 }, label: 'Student Lot' },
    { kind: 'parking', rect: { x: 240, y: 10, w: 92, h: 38 }, label: 'Faculty Lot' },
    { kind: 'track', rect: { x: 250, y: 232, w: 176, h: 92 }, label: 'Stadium Field & Track' },
    { kind: 'field', rect: { x: 24, y: 240, w: 120, h: 86 }, label: 'Baseball Field' },
    { kind: 'court', rect: { x: 160, y: 250, w: 72, h: 54 }, label: 'Tennis Courts' },
    { kind: 'field', rect: { x: 360, y: 20, w: 70, h: 70 }, label: 'Practice Field' },
  ];
  return {
    width: 440,
    height: 340,
    buildings,
    buildingById: new Map(buildings.map((b) => [b.id, b])),
    rooms,
    roomById: new Map(rooms.map((r) => [r.id, r])),
    decor,
    maxFloors: Math.max(...buildings.map((b) => b.floors)),
  };
}

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  classroom: 'Classroom',
  lab: 'Lab',
  studio: 'Studio',
  shop: 'Shop',
  restroom: 'Restroom',
  office: 'Office',
  nurse: 'Health Office',
  guidance: 'Guidance',
  cafeteria: 'Cafeteria',
  library: 'Library',
  commons: 'Commons',
  gym: 'Gym',
  locker: 'Locker Room',
  theatre: 'Theatre',
  stairs: 'Stairwell',
  storage: 'Service',
};
