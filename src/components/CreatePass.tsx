import { useMemo, useState } from 'react';
import { nearestRestroom, REASONS } from '../data/passes';
import { buildingsOnRoute } from '../data/nav';
import { studentName } from '../data/people';
import { campus, nav, people, roomLabel, roomWhere } from '../data/world';
import { fmtDuration, fmtTime } from '../lib/time';
import { roomTeachersAt, type Snapshot } from '../state/derive';
import { limitFor, useShared, useUI } from '../state/store';
import { Avatar, describeLoc, search } from './common';
import { reasonFor } from './DetailPanel';

export function CreatePass({ snap }: { snap: Snapshot }) {
  const draft = useUI((s) => s.draft)!;
  const update = useUI((s) => s.updateDraft);
  const close = useUI((s) => s.closeDraft);
  const me = useUI((s) => s.meIdx);
  const select = useUI((s) => s.select);
  const toast = useUI((s) => s.toast);
  const set = useUI((s) => s.set);
  const createPass = useShared((s) => s.createPass);
  const limits = useShared((s) => s.limits);
  const defLimit = useShared((s) => s.defaultRestroomLimit);
  const [destMode, setDestMode] = useState<'room' | 'teacher'>(draft.destTeacherIdx !== undefined ? 'teacher' : 'room');
  const [force, setForce] = useState(false);

  const si = draft.studentIdx;
  const student = si !== undefined ? people.students[si] : null;
  const loc = si !== undefined ? snap.locate(si) : null;
  const originRoomId = loc?.kind === 'room' && !loc.pass ? loc.roomId : null;
  const busy = loc && (loc.kind === 'transit' || (loc.kind === 'room' && loc.pass));

  // Resolve destination (a teacher means "wherever that teacher is this block").
  let destRoomId = draft.destRoomId;
  if (draft.destTeacherIdx !== undefined && snap.block >= 0) destRoomId = people.teachers[draft.destTeacherIdx].blocks[snap.block].roomId;
  const dest = destRoomId ? campus.roomById.get(destRoomId) : undefined;
  const route = originRoomId && destRoomId && originRoomId !== destRoomId ? nav.route(originRoomId, destRoomId) : null;

  const limit = destRoomId ? limitFor(destRoomId, { limits, defaultRestroomLimit: defLimit }) : null;
  const destCount = destRoomId ? snap.counts.get(destRoomId) ?? 0 : 0;
  const destIncoming = destRoomId ? snap.incoming.get(destRoomId) ?? 0 : 0;
  const atLimit = limit !== null && destCount + destIncoming >= limit;

  const errors: string[] = [];
  if (snap.block < 0) errors.push('Passes can only be created during a class block.');
  if (busy) errors.push('This student already has an active pass. End it before creating another.');
  if (originRoomId && destRoomId && originRoomId === destRoomId) errors.push('Student is already in that room.');
  const canCreate = !!student && !!originRoomId && !!dest && !errors.length && (!atLimit || force);

  const setDestRoom = (id: string) => {
    const r = campus.roomById.get(id)!;
    const tis = roomTeachersAt(id, snap.block);
    const reason = reasonFor(r.type);
    update({
      destRoomId: id,
      destTeacherIdx: undefined,
      reason,
      kind: r.type === 'restroom' || r.type === 'nurse' || r.type === 'office' || r.type === 'library' ? 'round_trip' : tis.length ? 'one_way' : draft.kind,
      picking: false,
    });
    setForce(false);
  };

  const quick: [string, () => string | undefined][] = [
    [
      '🚻 Nearest restroom',
      () => (originRoomId ? nearestRestroom(campus, nav, campus.roomById.get(originRoomId)!, student ?? undefined).id : undefined),
    ],
    ['Nurse', () => campus.rooms.find((r) => r.name === "Nurse's Office")?.id],
    ['Guidance', () => campus.rooms.find((r) => r.type === 'guidance')?.id],
    ['Main Office', () => campus.rooms.find((r) => r.name === 'Main Office')?.id],
    ['Library', () => campus.rooms.find((r) => r.type === 'library')?.id],
  ];

  const submit = () => {
    if (!canCreate || si === undefined || !originRoomId || !destRoomId) return;
    const res = createPass({
      studentIdx: si,
      originRoomId,
      destRoomId,
      destTeacherIdx: draft.destTeacherIdx ?? (draft.kind === 'one_way' ? roomTeachersAt(destRoomId, snap.block)[0] : undefined),
      kind: draft.kind,
      reason: draft.reason,
      stayMin: draft.kind === 'round_trip' ? draft.stayMin : 0,
      issuedByIdx: me === 'admin' ? undefined : me,
    });
    if (typeof res === 'string') {
      toast(res, 'err');
      return;
    }
    toast(`Pass created: ${studentName(people.students[si])} → ${roomLabel(destRoomId)}`);
    close();
    select({ kind: 'student', idx: si });
    set({ highlightPassId: res.id });
  };

  return (
    <>
      <div className="detail-head">
        <div>
          <div className="detail-title">New hall pass</div>
          <div className="muted small">
            {fmtTime(snap.t)} · {snap.block >= 0 ? `Block ${snap.block + 1}` : 'No block in session'}
          </div>
        </div>
        <button className="close" onClick={close} aria-label="Cancel">
          ×
        </button>
      </div>
      <div className="detail-body">
        {/* ---- student ---- */}
        <div className="field">
          <label>Student</label>
          {student && loc ? (
            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10 }}>
              <Avatar name={studentName(student)} />
              <div className="row-main">
                <div className="row-title">{studentName(student)}</div>
                <div className="row-sub">From: {describeLoc(loc).title}</div>
              </div>
              <button className="btn sm ghost" onClick={() => update({ studentIdx: undefined })}>
                Change
              </button>
            </div>
          ) : (
            <Picker
              placeholder="Search student name or ID…"
              kind="students"
              onPick={(id) => update({ studentIdx: Number(id) })}
              snap={snap}
              preset={me !== 'admin' && snap.block >= 0 ? snap.occupants(people.teachers[me].blocks[snap.block].roomId) : []}
            />
          )}
        </div>

        {/* ---- destination ---- */}
        <div className="field">
          <label>Destination</label>
          <div className="btn-row" style={{ marginBottom: 8, alignItems: 'center' }}>
            <div className="seg">
              <button className={destMode === 'room' ? 'on' : ''} onClick={() => setDestMode('room')}>
                Room / place
              </button>
              <button className={destMode === 'teacher' ? 'on' : ''} onClick={() => setDestMode('teacher')}>
                Teacher
              </button>
            </div>
            <button className={`btn sm${draft.picking ? ' on' : ''}`} onClick={() => update({ picking: !draft.picking })} title="Click a room on the map">
              📍 Pick on map
            </button>
          </div>
          {destMode === 'room' ? (
            <>
              <div className="chips" style={{ marginBottom: 8 }}>
                {quick.map(([label, fn]) => (
                  <button
                    key={label}
                    className="chip"
                    onClick={() => {
                      const id = fn();
                      if (id) setDestRoom(id);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Picker placeholder="Room number or name (e.g. S214, Library)…" kind="rooms" onPick={setDestRoom} snap={snap} />
            </>
          ) : (
            <Picker
              placeholder="Teacher name…"
              kind="teachers"
              snap={snap}
              onPick={(id) => {
                update({ destTeacherIdx: Number(id), destRoomId: undefined, kind: 'one_way', reason: 'Teacher visit', picking: false });
                setForce(false);
              }}
            />
          )}

          {dest && (
            <div className="card" style={{ marginTop: 10, padding: 10 }}>
              <div className="row-title">{roomLabel(dest.id)}</div>
              <div className="row-sub">{roomWhere(dest.id)}</div>
              {draft.destTeacherIdx !== undefined && (
                <div className="small" style={{ marginTop: 4 }}>
                  <b>{people.teachers[draft.destTeacherIdx].display}</b>{' '}
                  <span className="muted">is here this block ({people.teachers[draft.destTeacherIdx].blocks[snap.block]?.kind === 'plan' ? 'planning' : people.teachers[draft.destTeacherIdx].blocks[snap.block]?.kind === 'duty' ? 'study hall duty' : 'teaching'})</span>
                </div>
              )}
              {draft.destTeacherIdx === undefined && roomTeachersAt(dest.id, snap.block).length > 0 && (
                <div className="small muted" style={{ marginTop: 4 }}>
                  Teacher here now: {roomTeachersAt(dest.id, snap.block).map((ti) => people.teachers[ti].display).join(', ')}
                </div>
              )}
              <div className="small muted" style={{ marginTop: 4 }}>
                {destCount} here now{destIncoming ? ` · ${destIncoming} on the way` : ''}
                {limit !== null ? ` · limit ${limit}` : ''}
              </div>
              {route && (
                <div className="small" style={{ marginTop: 4 }}>
                  🚶 ~{fmtDuration(route.minutes)} walk · {Math.round(route.length)} m ·{' '}
                  {buildingsOnRoute(route)
                    .map((b) => campus.buildingById.get(b)!.code)
                    .join(' → ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- type ---- */}
        <div className="field">
          <label>Pass type</label>
          <div className="seg">
            <button className={draft.kind === 'round_trip' ? 'on' : ''} onClick={() => update({ kind: 'round_trip' })}>
              ⇄ Round trip
            </button>
            <button className={draft.kind === 'one_way' ? 'on' : ''} onClick={() => update({ kind: 'one_way' })}>
              → One way
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 5 }}>
            {draft.kind === 'one_way'
              ? 'The receiving teacher checks the student in when they arrive. The student stays there for the rest of the block.'
              : 'Student goes and comes back; you end the pass when they return.'}
          </div>
        </div>
        <div className="btn-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Reason</label>
            <select value={draft.reason} onChange={(e) => update({ reason: e.target.value })}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          {draft.kind === 'round_trip' && (
            <div className="field" style={{ width: 120 }}>
              <label>Time away</label>
              <select value={draft.stayMin} onChange={(e) => update({ stayMin: Number(e.target.value) })}>
                {[3, 5, 10, 15, 20, 30].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {errors.map((e) => (
          <div key={e} className="warn-box err">
            {e}
          </div>
        ))}
        {atLimit && !errors.length && (
          <div className="warn-box">
            <b>{dest?.name} is at its limit</b> ({destCount} in, {destIncoming} on the way, limit {limit}).
            <label style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Create anyway
            </label>
          </div>
        )}

        <button className="btn primary block" style={{ marginTop: 14, padding: 10 }} disabled={!canCreate} onClick={submit}>
          Create pass
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function Picker({
  placeholder,
  kind,
  onPick,
  snap,
  preset = [],
}: {
  placeholder: string;
  kind: 'students' | 'teachers' | 'rooms';
  onPick: (id: string) => void;
  snap: Snapshot;
  preset?: number[];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const res = useMemo(() => search(q, { students: 20, teachers: 20, rooms: 20 }), [q]);
  const items: { id: string; title: string; sub: string }[] = [];
  if (kind === 'students') {
    const list = q ? res.students : preset.slice(0, 30);
    for (const si of list) {
      const s = people.students[si];
      items.push({ id: String(si), title: studentName(s), sub: `Gr ${s.grade} · ${describeLoc(snap.locate(si)).title}` });
    }
  } else if (kind === 'teachers') {
    for (const ti of res.teachers) {
      const t = people.teachers[ti];
      const room = snap.block >= 0 ? t.blocks[snap.block].roomId : t.homeRoomId;
      items.push({ id: String(ti), title: `${t.title} ${t.first} ${t.last}`, sub: `${t.dept}${room ? ` · now in ${roomLabel(room)}` : ''}` });
    }
  } else {
    for (const id of res.rooms) items.push({ id, title: roomLabel(id), sub: `${roomWhere(id)} · ${snap.counts.get(id) ?? 0} here` });
  }
  return (
    <div className="dropdown">
      <input
        className="search"
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <div className="dropdown-menu">
          {!q && kind === 'students' && <div className="muted small" style={{ padding: '4px 8px' }}>In your room now</div>}
          {items.map((it) => (
            <button
              key={it.id}
              className="row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(it.id);
                setQ('');
                setOpen(false);
              }}
            >
              <div className="row-main">
                <div className="row-title">{it.title}</div>
                <div className="row-sub">{it.sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
