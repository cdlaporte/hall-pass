/**
 * Fake people + schedules. ~3,000 students and 300 teachers, four blocks a day.
 * Everything is generated from a fixed seed so every visitor sees the same school.
 */
import { makeRng } from '../lib/rng';
import type { Campus, Room } from './campus';

export interface Teacher {
  idx: number;
  id: string;
  first: string;
  last: string;
  title: string;
  display: string; // "Ms. Rivera"
  dept: Dept;
  homeRoomId: string | null;
  /** What the teacher is doing each block. */
  blocks: TeacherBlock[];
}
export type TeacherBlock =
  | { kind: 'teach'; sectionId: number; roomId: string }
  | { kind: 'duty'; sectionId: number; roomId: string }
  | { kind: 'plan'; roomId: string };

export interface Section {
  id: number;
  course: string;
  dept: Dept | 'Study Hall';
  teacherIdx: number | null;
  roomId: string;
  block: number;
  capacity: number;
  students: number[];
}

export interface Student {
  idx: number;
  id: string;
  first: string;
  last: string;
  grade: 9 | 10 | 11 | 12;
  gender: 'M' | 'F' | 'X';
  sections: number[]; // one section id per block
}

export type Dept =
  | 'English'
  | 'Social Studies'
  | 'Mathematics'
  | 'Science'
  | 'World Languages'
  | 'Fine & Performing Arts'
  | 'Physical Education & Health'
  | 'CTE & Business'
  | 'Freshman Team'
  | 'Special Education'
  | 'Library Media';

const DEPTS: { dept: Dept; n: number; buildings: string[]; courses: string[]; grade9: boolean; upper: boolean }[] = [
  {
    dept: 'English',
    n: 44,
    buildings: ['MAIN', 'WEB'],
    courses: ['English 10', 'American Literature', 'British Literature', 'AP Language & Composition', 'AP Literature', 'Creative Writing', 'Journalism', 'Public Speaking'],
    grade9: false,
    upper: true,
  },
  {
    dept: 'Social Studies',
    n: 40,
    buildings: ['MAIN', 'WEB'],
    courses: ['U.S. History', 'AP U.S. History', 'Civics', 'Economics', 'Psychology', 'AP Psychology', 'Sociology', 'AP World History', 'Law & Society'],
    grade9: false,
    upper: true,
  },
  {
    dept: 'Mathematics',
    n: 44,
    buildings: ['FND', 'WEB'],
    courses: ['Geometry', 'Algebra II', 'Pre-Calculus', 'AP Calculus AB', 'AP Calculus BC', 'AP Statistics', 'Discrete Math', 'Financial Algebra'],
    grade9: false,
    upper: true,
  },
  {
    dept: 'Science',
    n: 40,
    buildings: ['SCI'],
    courses: ['Chemistry', 'Physics', 'AP Biology', 'AP Chemistry', 'AP Physics 1', 'Anatomy & Physiology', 'Environmental Science', 'Forensic Science', 'Marine Biology'],
    grade9: false,
    upper: true,
  },
  {
    dept: 'World Languages',
    n: 24,
    buildings: ['WEB'],
    courses: ['Spanish I', 'Spanish II', 'Spanish III', 'French I', 'French II', 'Latin I', 'German I', 'AP Spanish', 'Mandarin I'],
    grade9: true,
    upper: true,
  },
  {
    dept: 'Fine & Performing Arts',
    n: 18,
    buildings: ['ART'],
    courses: ['Studio Art', 'Ceramics', 'Photography', 'Concert Band', 'Chorus', 'Theatre Arts', 'Digital Design', 'Drawing & Painting'],
    grade9: true,
    upper: true,
  },
  {
    dept: 'Physical Education & Health',
    n: 16,
    buildings: ['FH'],
    courses: ['Physical Education', 'Health', 'Strength & Conditioning', 'Team Sports', 'Dance', 'Lifetime Fitness'],
    grade9: true,
    upper: true,
  },
  {
    dept: 'CTE & Business',
    n: 22,
    buildings: ['CTE'],
    courses: ['Automotive Technology', 'Culinary Arts', 'Construction Trades', 'Computer Science', 'Engineering Design', 'Accounting', 'Marketing', 'Robotics'],
    grade9: true,
    upper: true,
  },
  {
    dept: 'Freshman Team',
    n: 32,
    buildings: ['FRC'],
    courses: ['English 9', 'Algebra I', 'Honors Geometry 9', 'Biology', 'World History 9', 'Freshman Seminar'],
    grade9: true,
    upper: false,
  },
  {
    dept: 'Special Education',
    n: 18,
    buildings: ['WEB', 'MAIN', 'FRC'],
    courses: ['Academic Support', 'Learning Strategies', 'Resource Room'],
    grade9: true,
    upper: true,
  },
  {
    dept: 'Library Media',
    n: 2,
    buildings: ['LIB'],
    courses: ['Research Methods'],
    grade9: true,
    upper: true,
  },
];

const FEM = `Aaliyah Abigail Addison Alexa Alice Amelia Anna Aria Ava Avery Bella Brooke Charlotte Chloe Claire Dakota Delaney Ella Emily Emma Evelyn Grace Hailey Hannah Harper Isabella Jade Jasmine Julia Kaitlyn Kayla Kylie Leah Lily Lucy Mackenzie Madison Maya Mia Molly Natalie Olivia Paige Sadie Sarah Savannah Sophia Sophie Stella Sydney Victoria Violet Zoe Camila Valentina Lucia Priya Mei Hana Layla Amara Nia Ruby Sloane Tessa Maeve Nora Ivy`.split(' ');
const MASC = `Aaron Adam Aiden Andrew Anthony Asher Ben Blake Brady Brayden Caleb Cameron Carter Chase Christian Colby Connor Cooper Daniel David Dylan Easton Eli Elijah Ethan Evan Finn Gabriel Gavin Henry Hudson Hunter Isaac Jack Jackson Jacob James Jayden Joseph Josh Landon Liam Logan Lucas Luke Mason Matthew Nathan Noah Nolan Owen Parker Ryan Samuel Tyler Wyatt Xavier Zachary Mateo Diego Santiago Arjun Omar Yusuf Kofi Theo Declan Brody Colin Reid`.split(' ');
const NEUTRAL = `Alex Jordan Taylor Riley Quinn Rowan Kai Avery Hayden Sage Morgan Emerson`.split(' ');
const FIRST = [...FEM, ...MASC];
const LAST = `Adams Allen Alvarez Anderson Bailey Baker Barnes Bell Bennett Bergeron Bouchard Brooks Brown Bryant Butler Campbell Carter Castillo Chen Clark Cloutier Coleman Collins Cook Cooper Cote Cruz Davis Diaz Dube Dubois Edwards Evans Fitzgerald Flores Foster Fournier Gagnon Garcia Gauthier Gomez Gonzalez Gray Green Griffin Hall Harris Hayes Henderson Hernandez Hill Howard Hughes Jackson James Jenkins Johnson Jones Kelly Kennedy Kim Lambert Lavoie Leblanc Lee Levesque Lewis Long Lopez MacDonald Martin Martinez McCarthy Medina Miller Mitchell Moore Morales Morgan Morin Murphy Nelson Nguyen O'Brien O'Connor Ortiz Ouellette Parker Patel Pelletier Perez Perry Peterson Phillips Powell Price Ramirez Reed Reyes Richardson Rivera Roberts Robinson Rodriguez Rogers Ross Roy Russell Ryan Sanchez Sanders Scott Shah Silva Simard Smith Stewart Sullivan Taylor Thibodeau Thomas Thompson Torres Tran Tremblay Turner Walker Ward Watson White Williams Wilson Wood Wright Young Zhang`.split(
  ' ',
);

export interface People {
  teachers: Teacher[];
  students: Student[];
  sections: Section[];
  /** roomTeachers[block] : roomId → teacher idx[] */
  roomTeachers: Map<string, number[]>[];
  /** roster[block] : roomId → student idx[] (scheduled) */
  roster: Map<string, number[]>[];
  studentById: Map<string, number>;
  teacherById: Map<string, number>;
}

export function buildPeople(campus: Campus): People {
  const rng = makeRng(20261108);
  const BLOCKS = 4;

  // ---- Teachers ---------------------------------------------------------
  const teachingRoomsBy = new Map<string, Room[]>();
  for (const r of campus.rooms) {
    if (!r.teaching) continue;
    const list = teachingRoomsBy.get(r.buildingId) ?? [];
    list.push(r);
    teachingRoomsBy.set(r.buildingId, list);
  }
  // Rooms with big capacity (gyms) can host several teachers at once.
  const roomSlots = new Map<string, number>(); // remaining teacher "home" slots
  for (const r of campus.rooms) if (r.teaching) roomSlots.set(r.id, r.type === 'gym' ? (r.capacity >= 120 ? 4 : 2) : 1);

  const cafeteria = campus.rooms.find((r) => r.type === 'cafeteria')!;
  const library = campus.rooms.find((r) => r.type === 'library')!;
  const workroom = campus.rooms.find((r) => r.name === 'Faculty Workroom')!;

  const usedNames = new Set<string>();
  const teachers: Teacher[] = [];
  for (const d of DEPTS) {
    for (let i = 0; i < d.n; i++) {
      let first: string, last: string;
      const fem = rng.chance(0.58);
      do {
        first = rng.pick(fem ? FEM : MASC);
        last = rng.pick(LAST);
      } while (usedNames.has(first + last));
      usedNames.add(first + last);
      const title = rng.chance(0.07) ? 'Dr.' : fem ? (rng.chance(0.75) ? 'Ms.' : 'Mrs.') : 'Mr.';
      let home: Room | null = null;
      if (d.dept === 'Library Media') home = library;
      else {
        for (const bId of d.buildings) {
          const rooms = teachingRoomsBy.get(bId) ?? [];
          // PE teachers want gyms first; others want non-gym rooms.
          const pref = rooms.filter((r) => (d.dept === 'Physical Education & Health') === (r.type === 'gym') || (d.dept === 'Physical Education & Health' && r.type === 'classroom'));
          home = pref.find((r) => (roomSlots.get(r.id) ?? 0) > 0) ?? null;
          if (home) break;
        }
      }
      if (home && home !== library) roomSlots.set(home.id, roomSlots.get(home.id)! - 1);
      const idx = teachers.length;
      teachers.push({
        idx,
        id: `T${String(1001 + idx)}`,
        first,
        last,
        title,
        display: `${title} ${last}`,
        dept: d.dept,
        homeRoomId: home?.id ?? null,
        blocks: [],
      });
    }
  }

  // ---- Teacher block plans --------------------------------------------
  const sections: Section[] = [];
  const roomBusy: Map<string, number>[] = Array.from({ length: BLOCKS }, () => new Map());
  const deptOf = (t: Teacher) => DEPTS.find((d) => d.dept === t.dept)!;
  const freeBlock = teachers.map((_, i) => (i * 7 + rng.int(0, 3)) % BLOCKS);
  const newSection = (s: Omit<Section, 'id' | 'students'>) => {
    const sec: Section = { ...s, id: sections.length, students: [] };
    sections.push(sec);
    return sec;
  };

  // Study hall sections for every block (supervisors added below).
  const studyHalls: Section[][] = [];
  for (let b = 0; b < BLOCKS; b++) {
    studyHalls.push([
      newSection({ course: 'Study Hall', dept: 'Study Hall', teacherIdx: null, roomId: cafeteria.id, block: b, capacity: 260 }),
      newSection({ course: 'Library Study Hall', dept: 'Study Hall', teacherIdx: null, roomId: library.id, block: b, capacity: 90 }),
    ]);
  }

  // Pass 1: home-room teachers.
  const floaters: Teacher[] = [];
  for (const t of teachers) {
    const d = deptOf(t);
    if (!t.homeRoomId) {
      floaters.push(t);
      continue;
    }
    for (let b = 0; b < BLOCKS; b++) {
      if (b === freeBlock[t.idx]) {
        t.blocks[b] = { kind: 'plan', roomId: t.homeRoomId };
        continue;
      }
      const room = campus.roomById.get(t.homeRoomId)!;
      const shared = room.type === 'gym' ? 3 : 1;
      const cap = Math.min(room.capacity / shared, room.type === 'gym' ? 34 : room.capacity);
      const sec = newSection({ course: rng.pick(d.courses), dept: t.dept, teacherIdx: t.idx, roomId: room.id, block: b, capacity: Math.round(cap) });
      roomBusy[b].set(room.id, (roomBusy[b].get(room.id) ?? 0) + 1);
      t.blocks[b] = { kind: 'teach', sectionId: sec.id, roomId: room.id };
    }
  }
  // Pass 2: floaters borrow rooms whose owner is on a planning block.
  for (const t of floaters) {
    const d = deptOf(t);
    for (let b = 0; b < BLOCKS; b++) {
      if (b === freeBlock[t.idx]) {
        t.blocks[b] = { kind: 'plan', roomId: workroom.id };
        continue;
      }
      const candidates = d.buildings.flatMap((bid) => teachingRoomsBy.get(bid) ?? []).concat(campus.rooms.filter((r) => r.teaching && r.type === 'classroom'));
      const room = candidates.find((r) => r.type !== 'gym' && !roomBusy[b].get(r.id));
      if (!room) {
        t.blocks[b] = { kind: 'plan', roomId: workroom.id };
        continue;
      }
      roomBusy[b].set(room.id, 1);
      // The room's owner is planning this block — they plan in the workroom instead.
      for (const o of teachers) {
        const ob = o.blocks[b];
        if (ob && ob.kind === 'plan' && ob.roomId === room.id) o.blocks[b] = { kind: 'plan', roomId: workroom.id };
      }
      const sec = newSection({ course: rng.pick(d.courses), dept: t.dept, teacherIdx: t.idx, roomId: room.id, block: b, capacity: Math.min(room.capacity, 28) });
      t.blocks[b] = { kind: 'teach', sectionId: sec.id, roomId: room.id };
    }
  }
  // Pass 3: some planning blocks become study-hall duty (cafeteria / library).
  for (let b = 0; b < BLOCKS; b++) {
    const planners = rng.shuffle(teachers.filter((t) => t.blocks[b].kind === 'plan' && t.dept !== 'Library Media'));
    const nCaf = 4;
    const nLib = 2;
    planners.slice(0, nCaf).forEach((t) => (t.blocks[b] = { kind: 'duty', sectionId: studyHalls[b][0].id, roomId: cafeteria.id }));
    planners.slice(nCaf, nCaf + nLib).forEach((t) => (t.blocks[b] = { kind: 'duty', sectionId: studyHalls[b][1].id, roomId: library.id }));
    studyHalls[b][0].teacherIdx = planners[0]?.idx ?? null;
    studyHalls[b][1].teacherIdx = planners[nCaf]?.idx ?? null;
  }
  // Librarians are "teaching" in the library during their non-planning blocks.
  for (const t of teachers) {
    if (t.dept !== 'Library Media') continue;
    for (let b = 0; b < BLOCKS; b++) {
      const blk = t.blocks[b];
      if (blk.kind === 'teach') {
        sections[blk.sectionId].capacity = 0; // library "class" is the study hall itself
        t.blocks[b] = { kind: 'duty', sectionId: studyHalls[b][1].id, roomId: library.id };
      }
    }
  }

  // ---- Students ---------------------------------------------------------
  const students: Student[] = [];
  const N_STUDENTS = 3012;
  const usedStudentIds = new Set<string>();
  for (let i = 0; i < N_STUDENTS; i++) {
    const grade = ([9, 10, 11, 12] as const)[i % 4];
    const gender = rng.weighted([
      ['M', 48],
      ['F', 48],
      ['X', 4],
    ] as const);
    let id: string;
    do id = `${30 - (grade - 9)}${String(rng.int(1000, 9999))}`;
    while (usedStudentIds.has(id));
    usedStudentIds.add(id);
    const first = rng.pick(gender === 'F' ? FEM : gender === 'M' ? MASC : rng.chance(0.5) ? NEUTRAL : FIRST);
    students.push({ idx: i, id, first, last: rng.pick(LAST), grade, gender, sections: [] });
  }

  const deptMeta = new Map(DEPTS.map((d) => [d.dept, d] as const));
  for (let b = 0; b < BLOCKS; b++) {
    const blockSecs = sections.filter((s) => s.block === b && s.dept !== 'Study Hall' && s.capacity > 0);
    const order = rng.shuffle(students.map((s) => s.idx));
    for (const si of order) {
      const st = students[si];
      // Avoid two classes from the same department in one day (Freshman Team: same course).
      const key = (s: Section) => (s.dept === 'Freshman Team' ? `FT:${s.course}` : s.dept);
      const taken = new Set(st.sections.map((id) => key(sections[id])));
      const fit = (s: Section) => {
        const m = deptMeta.get(s.dept as Dept)!;
        if (st.grade === 9 ? !m.grade9 : !m.upper) return false;
        return s.students.length < s.capacity;
      };
      let pool = blockSecs.filter((s) => fit(s) && !taken.has(key(s)));
      // Freshmen take mostly Freshman Team courses.
      if (st.grade === 9) {
        const core = pool.filter((s) => s.dept === 'Freshman Team');
        if (core.length && rng.chance(0.8)) pool = core;
      }
      if (!pool.length) pool = blockSecs.filter(fit);
      let chosen: Section | undefined;
      if (pool.length && !rng.chance(0.06)) {
        // Sample a few and pick the emptiest to keep class sizes even.
        let best: Section | undefined;
        for (let k = 0; k < 5; k++) {
          const c = rng.pick(pool);
          if (!best || c.students.length / c.capacity < best.students.length / best.capacity) best = c;
        }
        chosen = best;
      }
      if (!chosen) {
        const [caf, lib] = studyHalls[b];
        chosen = lib.students.length < lib.capacity && rng.chance(0.3) ? lib : caf.students.length < caf.capacity ? caf : lib;
      }
      chosen.students.push(si);
      st.sections[b] = chosen.id;
    }
  }

  const roomTeachers: Map<string, number[]>[] = Array.from({ length: BLOCKS }, () => new Map());
  for (const t of teachers) {
    t.blocks.forEach((blk, b) => {
      const list = roomTeachers[b].get(blk.roomId) ?? [];
      list.push(t.idx);
      roomTeachers[b].set(blk.roomId, list);
    });
  }
  const roster: Map<string, number[]>[] = Array.from({ length: BLOCKS }, () => new Map());
  for (const s of sections) {
    if (!s.students.length) continue;
    const list = roster[s.block].get(s.roomId) ?? [];
    list.push(...s.students);
    roster[s.block].set(s.roomId, list);
  }

  return {
    teachers,
    students,
    sections,
    roomTeachers,
    roster,
    studentById: new Map(students.map((s) => [s.id, s.idx])),
    teacherById: new Map(teachers.map((t) => [t.id, t.idx])),
  };
}

export function studentName(s: Student) {
  return `${s.first} ${s.last}`;
}
export function teacherName(t: Teacher) {
  return `${t.title} ${t.first} ${t.last}`;
}
