import type { Pass, PassState } from '../data/passes';
import { people, roomLabel } from '../data/world';
import { fmtDuration, fmtTime } from '../lib/time';
import { useShared, useUI } from '../state/store';
import { focusStudent, PhasePill } from './common';
import { studentName } from '../data/people';

export function endLabel(p: Pass, st: PassState): string {
  if (p.kind === 'one_way') return 'Check in';
  return st.phase === 'awaiting_end' || st.phase === 'returning' ? 'Returned' : 'End pass';
}

export function usePassActions() {
  const endPass = useShared((s) => s.endPass);
  const me = useUI((s) => s.meIdx);
  const toast = useUI((s) => s.toast);
  return (p: Pass) => {
    endPass(p, me);
    const name = studentName(people.students[p.studentIdx]);
    toast(p.kind === 'one_way' ? `${name} checked in at ${roomLabel(p.destRoomId)}` : `Pass ended for ${name}`);
  };
}

export function PassRow({ pass, st, showStudent = true }: { pass: Pass; st: PassState; showStudent?: boolean }) {
  const s = people.students[pass.studentIdx];
  const highlight = useUI((u) => u.highlightPassId);
  const set = useUI((u) => u.set);
  const select = useUI((u) => u.select);
  const me = useUI((u) => u.meIdx);
  const act = usePassActions();
  const issuer = pass.issuedByIdx !== undefined ? people.teachers[pass.issuedByIdx].display : 'Admin';
  const destT = pass.destTeacherIdx !== undefined ? people.teachers[pass.destTeacherIdx].display : null;
  const forMe =
    me !== 'admin' &&
    ((pass.kind === 'one_way' && people.roomTeachers[pass.block].get(pass.destRoomId)?.includes(me)) ||
      (pass.kind === 'round_trip' && pass.issuedByIdx === me));
  return (
    <div
      className={`pass${highlight === pass.id ? ' on' : ''}${st.overdue && st.active ? ' overdue' : ''}`}
      onClick={() => {
        set({ highlightPassId: pass.id });
        select({ kind: 'student', idx: pass.studentIdx });
        focusStudent(pass.studentIdx);
      }}
    >
      <div className="pass-top">
        <span className="pass-name">{showStudent ? studentName(s) : pass.reason}</span>
        <PhasePill pass={pass} st={st} />
      </div>
      <div className="pass-route">
        {showStudent && <span className="pill">{pass.reason}</span>}
        <span>{roomLabel(pass.originRoomId)}</span>
        <span className="arrow">{pass.kind === 'round_trip' ? '⇄' : '→'}</span>
        <span>
          {destT ? `${destT} · ` : ''}
          {roomLabel(pass.destRoomId)}
        </span>
      </div>
      <div className="pass-bottom">
        <span>
          Left {fmtTime(pass.createdAt)} · {st.ended ? `ended ${fmtTime(st.endAt)}` : fmtDuration(st.elapsed)} · by {issuer}
          {pass.simulated ? '' : ' · ★'}
        </span>
        {st.active && (
          <button
            className={`btn sm${forMe ? ' primary' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              act(pass);
            }}
          >
            {endLabel(pass, st)}
          </button>
        )}
      </div>
    </div>
  );
}
