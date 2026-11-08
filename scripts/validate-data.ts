/**
 * Sanity checks for the generated demo school. Run with `npm run validate`.
 * Exits non-zero if any invariant is broken.
 */
import { campus, nav, people, simPasses, buildMs } from '../src/data/world';
import { passState } from '../src/data/passes';
import { BLOCKS } from '../src/lib/time';

const failures: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

// Campus
const nonStairs = campus.rooms.filter((r) => r.type !== 'stairs');
check(new Set(campus.rooms.map((r) => r.id)).size === campus.rooms.length, 'room ids are unique');
for (const b of campus.buildings)
  for (const c of campus.buildings)
    if (b !== c) {
      const overlap = b.rect.x < c.rect.x + c.rect.w && c.rect.x < b.rect.x + b.rect.w && b.rect.y < c.rect.y + c.rect.h && c.rect.y < b.rect.y + b.rect.h;
      check(!overlap, `buildings ${b.id} and ${c.id} overlap`);
    }
const origin = campus.rooms[0].id;
for (const r of campus.rooms) {
  const route = nav.route(origin, r.id);
  check(r.id === origin || route.pts.length > 1, `room ${r.id} is unreachable`);
}

// People
check(people.students.length >= 3000, `expected ~3,000 students, got ${people.students.length}`);
check(people.teachers.length === 300, `expected 300 teachers, got ${people.teachers.length}`);
for (const s of people.students) {
  check(s.sections.length === BLOCKS.length, `student ${s.id} does not have ${BLOCKS.length} blocks`);
  s.sections.forEach((id, b) => check(people.sections[id].block === b, `student ${s.id} block ${b} has a section from another block`));
}
for (const sec of people.sections) check(sec.students.length <= Math.max(sec.capacity, 0), `section ${sec.id} over capacity`);
for (const t of people.teachers) {
  check(t.blocks.length === BLOCKS.length, `teacher ${t.id} missing blocks`);
  for (const blk of t.blocks) check(campus.roomById.has(blk.roomId), `teacher ${t.id} in unknown room`);
}
for (let b = 0; b < BLOCKS.length; b++) {
  const total = [...people.roster[b].values()].reduce((s, l) => s + l.length, 0);
  check(total === people.students.length, `block ${b} roster has ${total} students`);
}

// Simulated passes: one at a time per student, within the block.
const byStudent = new Map<number, typeof simPasses>();
for (const p of simPasses) {
  check(p.createdAt >= BLOCKS[p.block].start && p.createdAt < BLOCKS[p.block].end, `pass ${p.id} outside its block`);
  const l = byStudent.get(p.studentIdx) ?? [];
  l.push(p);
  byStudent.set(p.studentIdx, l);
}
for (const list of byStudent.values()) {
  const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
  for (let i = 1; i < sorted.length; i++) {
    const prev = passState(sorted[i - 1], sorted[i].createdAt);
    check(!prev.active, `student ${sorted[i].studentIdx} has overlapping passes`);
  }
}

console.log(`World built in ${buildMs.toFixed(0)} ms`);
console.log(
  `${campus.buildings.length} buildings · ${nonStairs.length} rooms (${campus.rooms.filter((r) => r.type === 'restroom').length} restrooms) · ` +
    `${people.students.length} students · ${people.teachers.length} teachers · ${people.sections.length} sections · ${simPasses.length} simulated passes`,
);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures.slice(0, 30)) console.error(' ✗ ' + f);
  process.exit(1);
}
console.log('All data checks passed ✓');
