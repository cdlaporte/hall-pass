import { ROOM_TYPE_LABEL } from '../data/campus';
import { passState } from '../data/passes';
import { studentName, teacherName } from '../data/people';
import { campus, people, roomLabel, roomsOn, roomWhere } from '../data/world';
import { BLOCKS, fmtTime } from '../lib/time';
import { passIndex, roomTeachersAt, useSnapshot, type Snapshot } from '../state/derive';
import { useShared, useUI } from '../state/store';
import { Avatar, describeLoc, focusRoom, focusStudent, gradeLabel, LIMIT_COLOR, limitStatus, useLimit } from './common';
import { CreatePass } from './CreatePass';
import { PassRow } from './PassRow';

export function DetailPanel() {
  const sel = useUI((s) => s.selection);
  const draft = useUI((s) => s.draft);
  const snap = useSnapshot(1000);
  if (draft) return <aside className="detail">{<CreatePass snap={snap} />}</aside>;
  if (!sel) return null;
  return (
    <aside className="detail">
      {sel.kind === 'student' && <StudentDetail si={sel.idx} snap={snap} />}
      {sel.kind === 'teacher' && <TeacherDetail ti={sel.idx} snap={snap} />}
      {sel.kind === 'room' && <RoomDetail id={sel.id} snap={snap} />}
      {sel.kind === 'building' && <BuildingDetail id={sel.id} snap={snap} />}
    </aside>
  );
}

function Close() {
  const select = useUI((s) => s.select);
  return (
    <button className="close" onClick={() => select(null)} aria-label="Close">
      ×
    </button>
  );
}

// ---------------------------------------------------------------------------

function StudentDetail({ si, snap }: { si: number; snap: Snapshot }) {
  const s = people.students[si];
  const openDraft = useUI((u) => u.openDraft);
  const select = useUI((u) => u.select);
  const loc = snap.locate(si);
  const d = describeLoc(loc);
  const passes = (passIndex().byStudent.get(si) ?? []).filter((p) => p.createdAt <= snap.t);
  const active = loc.kind === 'transit' || (loc.kind === 'room' && loc.pass);
  const lp = loc.kind === 'transit' || loc.kind === 'room' ? loc.pass : undefined;
  const lst = loc.kind === 'transit' || loc.kind === 'room' ? loc.st : undefined;

  return (
    <>
      <div className="detail-head">
        <Avatar name={studentName(s)} lg />
        <div>
          <div className="detail-title">{studentName(s)}</div>
          <div className="muted small">
            ID {s.id} · {gradeLabel(s.grade)}
          </div>
        </div>
        <Close />
      </div>
      <div className="detail-body">
        <div className="now-box">
          <div className="lbl">Right now · {fmtTime(snap.t)}</div>
          <div className="val">{d.title}</div>
          <div className="muted small">{d.sub}</div>
          {lp && lst && (
            <>
              <div className="muted small" style={{ marginTop: 4 }}>
                {lp.reason} pass · left {roomLabel(lp.originRoomId)} at <b>{fmtTime(lp.createdAt)}</b>
              </div>
              {loc.kind === 'transit' && (
                <div className="progress">
                  <div style={{ width: `${lst.progress * 100}%`, background: lst.phase === 'returning' ? 'var(--violet)' : 'var(--blue)' }} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!!active || snap.block < 0} onClick={() => openDraft({ studentIdx: si })}>
            + Create pass
          </button>
          <button className="btn" onClick={() => focusStudent(si)}>
            Show on map
          </button>
        </div>
        {active && <div className="muted small" style={{ marginTop: 6 }}>Student already has an active pass.</div>}

        <div className="h">Schedule</div>
        <table className="sched">
          <thead>
            <tr>
              <th>Block</th>
              <th>Class</th>
              <th>Room</th>
            </tr>
          </thead>
          <tbody>
            {BLOCKS.map((b) => {
              const sec = people.sections[s.sections[b.index]];
              const t = sec.teacherIdx !== null ? people.teachers[sec.teacherIdx] : null;
              return (
                <tr key={b.index} className={snap.block === b.index ? 'now' : ''}>
                  <td>
                    <b>B{b.index + 1}</b>
                    <div className="muted small">{fmtTime(b.start)}</div>
                  </td>
                  <td>
                    {sec.course}
                    {t && (
                      <div>
                        <button className="link small" onClick={() => select({ kind: 'teacher', idx: t.idx })}>
                          {t.display}
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      className="link small"
                      onClick={() => {
                        select({ kind: 'room', id: sec.roomId });
                        focusRoom(sec.roomId);
                      }}
                    >
                      {campus.roomById.get(sec.roomId)!.number || campus.roomById.get(sec.roomId)!.name}
                    </button>
                    <div className="muted small">{campus.buildingById.get(campus.roomById.get(sec.roomId)!.buildingId)!.name}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="h">Passes today ({passes.length})</div>
        {!passes.length && <div className="muted small">No passes yet today.</div>}
        {[...passes].reverse().map((p) => (
          <PassRow key={p.id} pass={p} st={passState(p, snap.t)} showStudent={false} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function TeacherDetail({ ti, snap }: { ti: number; snap: Snapshot }) {
  const t = people.teachers[ti];
  const select = useUI((u) => u.select);
  const openDraft = useUI((u) => u.openDraft);
  const roomNow = snap.block >= 0 ? t.blocks[snap.block].roomId : null;
  return (
    <>
      <div className="detail-head">
        <Avatar name={t.display} lg />
        <div>
          <div className="detail-title">{teacherName(t)}</div>
          <div className="muted small">
            {t.dept} · {t.id}
          </div>
        </div>
        <Close />
      </div>
      <div className="detail-body">
        <div className="now-box">
          <div className="lbl">Right now · {fmtTime(snap.t)}</div>
          {roomNow ? (
            <>
              <div className="val">{roomLabel(roomNow)}</div>
              <div className="muted small">
                {roomWhere(roomNow)} · {snap.counts.get(roomNow) ?? 0} students in room
              </div>
            </>
          ) : (
            <div className="val">Not in a class block</div>
          )}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={snap.block < 0} onClick={() => openDraft({ destTeacherIdx: ti, destRoomId: roomNow ?? undefined, kind: 'one_way', reason: 'Teacher visit' })}>
            Send a student to {t.display}
          </button>
          {roomNow && (
            <button className="btn" onClick={() => focusRoom(roomNow)}>
              Show on map
            </button>
          )}
        </div>
        <div className="h">Schedule</div>
        <table className="sched">
          <tbody>
            {BLOCKS.map((b) => {
              const blk = t.blocks[b.index];
              const label = blk.kind === 'teach' ? people.sections[blk.sectionId].course : blk.kind === 'duty' ? 'Study hall duty' : 'Planning';
              const n = blk.kind === 'plan' ? 0 : people.sections[blk.sectionId].students.length;
              return (
                <tr key={b.index} className={snap.block === b.index ? 'now' : ''}>
                  <td>
                    <b>B{b.index + 1}</b>
                    <div className="muted small">{fmtTime(b.start)}</div>
                  </td>
                  <td>
                    {label}
                    {blk.kind !== 'plan' && <div className="muted small">{n} students</div>}
                  </td>
                  <td>
                    <button
                      className="link small"
                      onClick={() => {
                        select({ kind: 'room', id: blk.roomId });
                        focusRoom(blk.roomId);
                      }}
                    >
                      {roomLabel(blk.roomId)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {t.homeRoomId ? (
          <div className="muted small" style={{ marginTop: 8 }}>
            Home room: {roomLabel(t.homeRoomId)}
          </div>
        ) : (
          <div className="muted small" style={{ marginTop: 8 }}>
            Floating teacher — borrows rooms during other teachers' planning blocks.
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function RoomDetail({ id, snap }: { id: string; snap: Snapshot }) {
  const r = campus.roomById.get(id)!;
  const b = campus.buildingById.get(r.buildingId)!;
  const select = useUI((u) => u.select);
  const openDraft = useUI((u) => u.openDraft);
  const setLimit = useShared((s) => s.setLimit);
  const limits = useShared((s) => s.limits);
  const limit = useLimit(id);
  const count = snap.counts.get(id) ?? 0;
  const occ = snap.occupants(id);
  const teachersNow = roomTeachersAt(id, snap.block);
  const incoming = snap.active.filter((a) => a.pass.destRoomId === id && (a.st.phase === 'en_route' || a.st.phase === 'awaiting_checkin'));
  const st = limitStatus(count, limit);

  return (
    <>
      <div className="detail-head">
        <div className="icon-sq" style={{ width: 52, height: 52, fontSize: 14 }}>
          {r.number || ROOM_TYPE_LABEL[r.type].slice(0, 2)}
        </div>
        <div>
          <div className="detail-title">{r.name}</div>
          <div className="muted small">
            {b.name} · Floor {r.floor + 1} · {ROOM_TYPE_LABEL[r.type]}
          </div>
        </div>
        <Close />
      </div>
      <div className="detail-body">
        <div className="now-box">
          <div className="lbl">Right now · {fmtTime(snap.t)}</div>
          <div className="val">
            {count} {count === 1 ? 'student' : 'students'}
            {limit !== null && (
              <span style={{ color: LIMIT_COLOR[st!], marginLeft: 6 }}>
                / limit {limit} {st === 'full' ? '· FULL' : ''}
              </span>
            )}
          </div>
          <div className="muted small">
            {incoming.length ? `${incoming.length} on the way · ` : ''}capacity {r.capacity || '—'}
          </div>
          {teachersNow.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {teachersNow.map((ti) => {
                const t = people.teachers[ti];
                const blk = t.blocks[snap.block];
                return (
                  <div key={ti} className="small">
                    <button className="link" onClick={() => select({ kind: 'teacher', idx: ti })}>
                      {t.display}
                    </button>{' '}
                    <span className="muted">
                      · {blk.kind === 'teach' ? people.sections[blk.sectionId].course : blk.kind === 'duty' ? 'Study hall' : 'Planning'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          {r.type !== 'stairs' && (
            <button
              className="btn primary"
              disabled={snap.block < 0}
              onClick={() =>
                openDraft({
                  destRoomId: id,
                  destTeacherIdx: teachersNow.find((ti) => people.teachers[ti].blocks[snap.block].kind !== 'plan') ?? teachersNow[0],
                  kind: r.type === 'restroom' ? 'round_trip' : r.teaching ? 'one_way' : 'round_trip',
                  reason: reasonFor(r.type),
                })
              }
            >
              Send a student here
            </button>
          )}
          <button className="btn" onClick={() => focusRoom(id, 8)}>
            Show on map
          </button>
        </div>

        <div className="field">
          <label>Occupancy limit</label>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <input
              type="number"
              min={0}
              max={500}
              placeholder="No limit"
              value={limits[id] ?? (r.type === 'restroom' ? limit ?? '' : '')}
              onChange={(e) => setLimit(id, e.target.value === '' ? null : Number(e.target.value))}
              style={{ width: 110, padding: '6px 8px', border: '1px solid var(--line-2)', borderRadius: 8 }}
            />
            {limits[id] !== undefined && (
              <button className="btn sm ghost" onClick={() => setLimit(id, null)}>
                Clear
              </button>
            )}
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {r.type === 'restroom' ? 'Restrooms use the default limit unless set here.' : 'Optional — passes to this room warn when it is at the limit.'}
          </div>
        </div>

        {incoming.length > 0 && (
          <>
            <div className="h">On the way here ({incoming.length})</div>
            {incoming.map(({ pass, st }) => (
              <PassRow key={pass.id} pass={pass} st={st} />
            ))}
          </>
        )}

        <div className="h">In this room ({occ.length})</div>
        {!occ.length && <div className="muted small">{snap.block < 0 ? 'No class block in session.' : 'Empty.'}</div>}
        <div className="list">
          {occ.slice(0, 200).map((si) => {
            const s = people.students[si];
            return (
              <button key={si} className="row" onClick={() => select({ kind: 'student', idx: si })}>
                <Avatar name={studentName(s)} />
                <div className="row-main">
                  <div className="row-title">{studentName(s)}</div>
                  <div className="row-sub">Grade {s.grade}</div>
                </div>
              </button>
            );
          })}
          {occ.length > 200 && <div className="muted small">+ {occ.length - 200} more</div>}
        </div>

        {r.teaching && (
          <>
            <div className="h">Room schedule</div>
            <table className="sched">
              <tbody>
                {BLOCKS.map((bl) => {
                  const tis = roomTeachersAt(id, bl.index);
                  return (
                    <tr key={bl.index} className={snap.block === bl.index ? 'now' : ''}>
                      <td>
                        <b>B{bl.index + 1}</b>
                      </td>
                      <td>
                        {tis.length
                          ? tis.map((ti) => {
                              const t = people.teachers[ti];
                              const blk = t.blocks[bl.index];
                              return (
                                <div key={ti}>
                                  {t.display} · {blk.kind === 'teach' ? people.sections[blk.sectionId].course : 'Planning'}
                                </div>
                              );
                            })
                          : 'Open'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}

export function reasonFor(type: string): string {
  switch (type) {
    case 'restroom':
      return 'Restroom';
    case 'nurse':
      return 'Nurse';
    case 'guidance':
      return 'Guidance';
    case 'office':
      return 'Main Office';
    case 'library':
      return 'Library';
    default:
      return 'Teacher visit';
  }
}

// ---------------------------------------------------------------------------

function BuildingDetail({ id, snap }: { id: string; snap: Snapshot }) {
  const b = campus.buildingById.get(id)!;
  const set = useUI((u) => u.set);
  const select = useUI((u) => u.select);
  return (
    <>
      <div className="detail-head">
        <div className="icon-sq" style={{ width: 52, height: 52, background: b.color, color: '#fff', border: 'none' }}>
          {b.code}
        </div>
        <div>
          <div className="detail-title">{b.name}</div>
          <div className="muted small">{b.blurb}</div>
        </div>
        <Close />
      </div>
      <div className="detail-body">
        {Array.from({ length: b.floors }, (_, f) => {
          const rooms = roomsOn(id, f).filter((r) => r.type !== 'stairs');
          const total = rooms.reduce((s, r) => s + (snap.counts.get(r.id) ?? 0), 0);
          return (
            <div key={f}>
              <div className="h">
                Floor {f + 1} · {total} students
                <button
                  className="link small"
                  onClick={() => {
                    set({ floor2d: f });
                    useUI.getState().focusOn(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2, f, 4);
                  }}
                >
                  View floor
                </button>
              </div>
              <div className="list">
                {rooms.map((r) => (
                  <button key={r.id} className="row" style={{ padding: '4px 8px' }} onClick={() => select({ kind: 'room', id: r.id })}>
                    <div className="row-main">
                      <div className="row-title" style={{ fontSize: 13 }}>
                        {r.name}
                      </div>
                    </div>
                    <span className="pill">{snap.counts.get(r.id) ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
