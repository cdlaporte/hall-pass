import { useMemo, useState } from 'react';
import { ROOM_TYPE_LABEL } from '../data/campus';
import { nearestRestroom } from '../data/passes';
import { studentName } from '../data/people';
import { campus, nav, people, roomLabel, roomWhere } from '../data/world';
import { BLOCKS } from '../lib/time';
import { scheduledRoom, useSnapshot, type Snapshot } from '../state/derive';
import { limitFor, useShared, useUI, type SideTab } from '../state/store';
import { Avatar, describeLoc, focusRoom, focusStudent, LIMIT_COLOR, limitStatus, search } from './common';
import { PassRow } from './PassRow';

export function Sidebar() {
  const tab = useUI((s) => s.tab);
  const set = useUI((s) => s.set);
  const snap = useSnapshot(1000);
  const overdue = snap.active.filter((a) => a.st.overdue).length;
  const tabs: [SideTab, string, number | null][] = [
    ['search', 'Search', null],
    ['passes', 'Passes', snap.active.length],
    ['myroom', 'My Room', null],
    ['restrooms', 'Restrooms', null],
  ];
  return (
    <aside className="sidebar">
      <div className="tabs">
        {tabs.map(([k, label, n]) => (
          <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => set({ tab: k })}>
            {label}
            {n !== null && <span className={`pill${k === 'passes' && overdue ? ' red' : ''}`}>{n}</span>}
          </button>
        ))}
      </div>
      <div className="side-body">
        {tab === 'search' && <SearchPanel snap={snap} />}
        {tab === 'passes' && <PassesPanel snap={snap} />}
        {tab === 'myroom' && <MyRoomPanel snap={snap} />}
        {tab === 'restrooms' && <RestroomsPanel snap={snap} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function SearchPanel({ snap }: { snap: Snapshot }) {
  const [q, setQ] = useState('');
  const sel = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const res = useMemo(() => search(q), [q]);
  const any = res.students.length + res.teachers.length + res.rooms.length;

  return (
    <>
      <input autoFocus className="search" placeholder="Search students, teachers, rooms…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q && (
        <div className="welcome card" style={{ marginTop: 12 }}>
          <b>Find anyone, anywhere.</b>
          <ul>
            <li>Search a student to see where they are right now and their 4-block schedule.</li>
            <li>Click a room on the map to see who's inside and which teacher is there.</li>
            <li>Create a pass from a student, a room, or by picking a destination on the map.</li>
            <li>Drag the timeline at the top to replay any moment of the day.</li>
          </ul>
          <div className="muted small">
            {people.students.length.toLocaleString()} students · {people.teachers.length} teachers · {campus.rooms.filter((r) => r.type !== 'stairs').length} rooms ·{' '}
            {campus.buildings.length} buildings
          </div>
        </div>
      )}
      {!q && <BusyRooms snap={snap} />}
      {q && !any && <div className="empty">No matches for “{q}”.</div>}
      {res.students.length > 0 && <div className="h">Students</div>}
      <div className="list">
        {res.students.map((si) => {
          const s = people.students[si];
          const loc = describeLoc(snap.locate(si));
          return (
            <button
              key={si}
              className={`row${sel?.kind === 'student' && sel.idx === si ? ' on' : ''}`}
              onClick={() => {
                select({ kind: 'student', idx: si });
                focusStudent(si);
              }}
            >
              <Avatar name={studentName(s)} />
              <div className="row-main">
                <div className="row-title">{studentName(s)}</div>
                <div className="row-sub">
                  Gr {s.grade} · {loc.title}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {res.teachers.length > 0 && <div className="h">Teachers</div>}
      <div className="list">
        {res.teachers.map((ti) => {
          const t = people.teachers[ti];
          const roomId = snap.block >= 0 ? t.blocks[snap.block].roomId : t.homeRoomId;
          return (
            <button
              key={ti}
              className={`row${sel?.kind === 'teacher' && sel.idx === ti ? ' on' : ''}`}
              onClick={() => {
                select({ kind: 'teacher', idx: ti });
                if (roomId) focusRoom(roomId);
              }}
            >
              <Avatar name={t.display} />
              <div className="row-main">
                <div className="row-title">
                  {t.title} {t.first} {t.last}
                </div>
                <div className="row-sub">
                  {t.dept} · {roomId ? roomLabel(roomId) : 'No room'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {res.rooms.length > 0 && <div className="h">Rooms & places</div>}
      <div className="list">
        {res.rooms.map((id) => {
          const r = campus.roomById.get(id)!;
          return (
            <button
              key={id}
              className={`row${sel?.kind === 'room' && sel.id === id ? ' on' : ''}`}
              onClick={() => {
                select({ kind: 'room', id });
                focusRoom(id);
              }}
            >
              <div className="icon-sq">{r.number || ROOM_TYPE_LABEL[r.type].slice(0, 2)}</div>
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-sub">
                  {roomWhere(id)} · {snap.counts.get(id) ?? 0} here now
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function BusyRooms({ snap }: { snap: Snapshot }) {
  const select = useUI((s) => s.select);
  if (snap.block < 0) return null;
  const big = campus.rooms
    .filter((r) => ['cafeteria', 'library', 'nurse', 'guidance', 'office', 'gym'].includes(r.type))
    .map((r) => ({ r, n: snap.counts.get(r.id) ?? 0, inc: snap.incoming.get(r.id) ?? 0 }))
    .filter((x) => x.n + x.inc > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  return (
    <>
      <div className="h">Common spaces right now</div>
      <div className="list">
        {big.map(({ r, n, inc }) => (
          <button
            key={r.id}
            className="row"
            onClick={() => {
              select({ kind: 'room', id: r.id });
              focusRoom(r.id, 4);
            }}
          >
            <div className="icon-sq">{n}</div>
            <div className="row-main">
              <div className="row-title">{r.name}</div>
              <div className="row-sub">
                {roomWhere(r.id)}
                {inc ? ` · ${inc} on the way` : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

type PassFilter = 'all' | 'mine' | 'overdue' | 'enroute';

function PassesPanel({ snap }: { snap: Snapshot }) {
  const [f, setF] = useState<PassFilter>('all');
  const me = useUI((s) => s.meIdx);
  const isMine = (p: (typeof snap.active)[number]['pass']) =>
    me !== 'admin' && (p.issuedByIdx === me || p.destTeacherIdx === me || (people.roomTeachers[p.block].get(p.destRoomId) ?? []).includes(me));
  let list = snap.active;
  if (f === 'overdue') list = list.filter((a) => a.st.overdue);
  if (f === 'enroute') list = list.filter((a) => a.st.phase === 'en_route' || a.st.phase === 'returning');
  if (f === 'mine') list = list.filter((a) => isMine(a.pass));
  list = [...list].sort((a, b) => Number(b.st.overdue) - Number(a.st.overdue) || b.pass.createdAt - a.pass.createdAt);

  if (snap.block < 0)
    return <div className="empty">No class block in session right now. Drag the timeline (top) into a block to see passes.</div>;

  return (
    <>
      <div className="chips" style={{ marginBottom: 10 }}>
        {(
          [
            ['all', `All ${snap.active.length}`],
            ['enroute', 'In hallways'],
            ['overdue', `Overdue ${snap.active.filter((a) => a.st.overdue).length}`],
            ['mine', 'Mine'],
          ] as [PassFilter, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip${f === k ? ' on' : ''}`} onClick={() => setF(k)}>
            {l}
          </button>
        ))}
      </div>
      {!list.length && <div className="empty">No passes match.</div>}
      {list.map(({ pass, st }) => (
        <PassRow key={pass.id} pass={pass} st={st} />
      ))}
      <div className="muted small" style={{ marginTop: 8 }}>
        ★ = created in this demo. Passes end automatically at the end of the block.
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function MyRoomPanel({ snap }: { snap: Snapshot }) {
  const me = useUI((s) => s.meIdx);
  const select = useUI((s) => s.select);
  const openDraft = useUI((s) => s.openDraft);
  const toast = useUI((s) => s.toast);
  const createPass = useShared((s) => s.createPass);
  if (me === 'admin')
    return <div className="empty">Signed in as Administrator. Pick a teacher in “Signed in as” (top right) to get a classroom view.</div>;
  const t = people.teachers[me];
  if (snap.block < 0)
    return (
      <div className="empty">
        {t.display}'s room view is available during class blocks. Drag the timeline into a block.
      </div>
    );
  const blk = t.blocks[snap.block];
  const roomId = blk.roomId;
  const here = snap.occupants(roomId).sort((a, b) => people.students[a].last.localeCompare(people.students[b].last));
  const rostered = people.roster[snap.block].get(roomId) ?? [];
  const incoming = snap.active.filter((a) => a.pass.destRoomId === roomId && a.pass.kind === 'one_way');
  const outgoing = snap.active.filter((a) => a.pass.originRoomId === roomId);
  const outIds = new Set(outgoing.map((a) => a.pass.studentIdx));

  const quickRestroom = (si: number) => {
    const from = campus.roomById.get(roomId)!;
    const dest = nearestRestroom(campus, nav, from, people.students[si]);
    const r = createPass({
      studentIdx: si,
      originRoomId: roomId,
      destRoomId: dest.id,
      kind: 'round_trip',
      reason: 'Restroom',
      stayMin: 5,
      issuedByIdx: me,
    });
    if (typeof r === 'string') toast(r, 'err');
    else toast(`${studentName(people.students[si])} → ${dest.name}`);
  };

  return (
    <>
      <div className="card">
        <div className="row-title">
          {t.title} {t.first} {t.last}
        </div>
        <div className="row-sub">
          {BLOCKS[snap.block].label} · {blk.kind === 'teach' ? people.sections[blk.sectionId].course : blk.kind === 'duty' ? 'Study hall duty' : 'Planning'}
        </div>
        <div style={{ marginTop: 6 }}>
          <button className="link" onClick={() => (select({ kind: 'room', id: roomId }), focusRoom(roomId))}>
            {roomLabel(roomId)}
          </button>{' '}
          <span className="muted small">· {roomWhere(roomId)}</span>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>
          {here.length} here now · {rostered.length} on roster · {outgoing.length} out on passes
        </div>
      </div>

      <div className="h">Arriving — check in ({incoming.length})</div>
      {!incoming.length && <div className="muted small">No students headed to your room.</div>}
      {incoming.map(({ pass, st }) => (
        <PassRow key={pass.id} pass={pass} st={st} />
      ))}

      <div className="h">Out of the room ({outgoing.length})</div>
      {!outgoing.length && <div className="muted small">Nobody out right now.</div>}
      {outgoing.map(({ pass, st }) => (
        <PassRow key={pass.id} pass={pass} st={st} />
      ))}

      <div className="h">
        In the room ({here.length})
        <span className="muted" style={{ textTransform: 'none', fontWeight: 500 }}>
          Quick pass
        </span>
      </div>
      <div className="list">
        {here.map((si) => {
          const s = people.students[si];
          const visiting = scheduledRoom(si, snap.block) !== roomId;
          return (
            <div key={si} className="row" onClick={() => select({ kind: 'student', idx: si })}>
              <Avatar name={studentName(s)} />
              <div className="row-main">
                <div className="row-title">{studentName(s)}</div>
                <div className="row-sub">{visiting ? 'Visiting on a pass' : `Grade ${s.grade}`}</div>
              </div>
              {!outIds.has(si) && (
                <>
                  <button
                    className="btn sm"
                    title="One-click round-trip pass to the nearest restroom"
                    onClick={(e) => {
                      e.stopPropagation();
                      quickRestroom(si);
                    }}
                  >
                    🚻
                  </button>
                  <button
                    className="btn sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDraft({ studentIdx: si });
                    }}
                  >
                    Pass
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function RestroomsPanel({ snap }: { snap: Snapshot }) {
  const limits = useShared((s) => s.limits);
  const def = useShared((s) => s.defaultRestroomLimit);
  const setDef = useShared((s) => s.setDefaultRestroomLimit);
  const setLimit = useShared((s) => s.setLimit);
  const select = useUI((s) => s.select);
  const rr = campus.rooms.filter((r) => r.type === 'restroom');
  const full = rr.filter((r) => limitStatus(snap.counts.get(r.id) ?? 0, limitFor(r.id, { limits, defaultRestroomLimit: def })) === 'full').length;
  return (
    <>
      <div className="card">
        <div className="field" style={{ marginTop: 0 }}>
          <label>Default restroom limit</label>
          <div className="btn-row">
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <button key={n} className={`btn sm${def === n ? ' on' : ''}`} onClick={() => setDef(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 8 }}>
          {rr.length} restrooms · {full} at limit now. New passes to a full restroom show a warning. Set per-room limits below (or on any room's
          detail page).
        </div>
      </div>
      {campus.buildings.map((b) => {
        const list = rr.filter((r) => r.buildingId === b.id);
        if (!list.length) return null;
        return (
          <div key={b.id}>
            <div className="h">{b.name}</div>
            {list.map((r) => {
              const n = snap.counts.get(r.id) ?? 0;
              const inc = snap.incoming.get(r.id) ?? 0;
              const lim = limitFor(r.id, { limits, defaultRestroomLimit: def })!;
              const st = limitStatus(n, lim)!;
              return (
                <div
                  key={r.id}
                  className="row"
                  onClick={() => {
                    select({ kind: 'room', id: r.id });
                    focusRoom(r.id, 8);
                  }}
                >
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13 }}>
                      F{r.floor + 1} · {r.name}
                    </div>
                    <div className="bar" style={{ marginTop: 5 }}>
                      <div style={{ width: `${Math.min(100, (n / lim) * 100)}%`, background: LIMIT_COLOR[st] }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 54 }}>
                    <b style={{ color: LIMIT_COLOR[st] }}>
                      {n}/{lim}
                    </b>
                    <div className="muted small">{inc ? `+${inc} coming` : ''}</div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={lim}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setLimit(r.id, e.target.value === '' ? null : Number(e.target.value))}
                    style={{ width: 46, padding: '3px 4px', border: '1px solid var(--line-2)', borderRadius: 6 }}
                    title="Limit for this restroom"
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
