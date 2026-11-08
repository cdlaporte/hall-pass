import { useMemo, useState } from 'react';
import { people } from '../data/world';
import { BLOCKS, DAY_END, DAY_START, fmtTime, periodAt } from '../lib/time';
import { useSnapshot } from '../state/derive';
import { useShared, useUI } from '../state/store';

const SPEEDS = [1, 5, 20, 60];

export function TopBar() {
  const snap = useSnapshot(500);
  const clock = useShared((s) => s.clock);
  const { jumpTo, setSpeed, togglePause, simTraffic, setSimTraffic, resetDemo } = useShared();
  const meIdx = useUI((s) => s.meIdx);
  const setMe = useUI((s) => s.setMe);
  const [menu, setMenu] = useState(false);
  const t = snap.t;
  const period = periodAt(t);

  let sub = '';
  if (period.kind === 'block') sub = `${period.block.label} · ${Math.ceil(period.block.end - t)} min left`;
  else if (period.kind === 'passing') sub = `Passing period · ${period.to.label} starts ${fmtTime(period.to.start)}`;
  else sub = period.kind === 'before' ? 'Before school' : 'After school';

  const overdue = snap.active.filter((a) => a.st.overdue).length;
  const pct = (x: number) => `${((x - DAY_START) / (DAY_END - DAY_START)) * 100}%`;

  const byDept = useMemo(() => {
    const m = new Map<string, typeof people.teachers>();
    for (const t of [...people.teachers].sort((a, b) => a.last.localeCompare(b.last))) {
      const l = m.get(t.dept) ?? [];
      l.push(t);
      m.set(t.dept, l);
    }
    return [...m.entries()];
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-logo">HP</div>
        <div>
          <div className="brand-name">HallPass</div>
          <div className="brand-sub">Pinkerton Academy · demo campus</div>
        </div>
      </div>

      <div className="clock">
        <div>
          <div className="clock-time">{fmtTime(t, clock.speed > 1 ? false : true)}</div>
          <div className="clock-period">{sub}</div>
        </div>
        <button className="clock-btn" onClick={togglePause} title={clock.paused ? 'Resume clock' : 'Pause clock'}>
          {clock.paused ? '▶' : '❚❚'}
        </button>
        <div className="btn-row" style={{ gap: 3 }}>
          {SPEEDS.map((s) => (
            <button key={s} className={`clock-btn${clock.speed === s ? ' on' : ''}`} onClick={() => setSpeed(s)} title={`Run the demo clock at ${s}× speed`}>
              {s}×
            </button>
          ))}
        </div>
        <div className="timeline" title="Drag to replay any moment of the school day">
          <div className="timeline-track" />
          {BLOCKS.map((b) => (
            <div key={b.index} className="timeline-block" style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})` }}>
              <span>B{b.index + 1}</span>
            </div>
          ))}
          <div className="timeline-thumb" style={{ left: pct(Math.min(DAY_END, Math.max(DAY_START, t))) }} />
          <input type="range" min={DAY_START} max={DAY_END} step={0.5} value={Math.min(DAY_END, Math.max(DAY_START, t))} onChange={(e) => jumpTo(Number(e.target.value))} />
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <b>{snap.active.length}</b>
          <span>Active passes</span>
        </div>
        <div className="stat">
          <b>{period.kind === 'passing' ? '—' : snap.inHall}</b>
          <span>In hallways</span>
        </div>
        <div className={`stat${overdue ? ' warn' : ''}`}>
          <b>{overdue}</b>
          <span>Overdue</span>
        </div>
      </div>

      <div className="me">
        Signed in as
        <select value={String(meIdx)} onChange={(e) => setMe(e.target.value === 'admin' ? 'admin' : Number(e.target.value))}>
          <option value="admin">Administrator (all access)</option>
          {byDept.map(([dept, list]) => (
            <optgroup key={dept} label={dept}>
              {list.map((tt) => (
                <option key={tt.idx} value={tt.idx}>
                  {tt.display}, {tt.first}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div style={{ position: 'relative' }}>
        <button className="clock-btn" onClick={() => setMenu((m) => !m)} title="Demo settings">
          ⚙
        </button>
        {menu && (
          <div className="menu-pop" onMouseLeave={() => setMenu(false)}>
            <b>Demo settings</b>
            <label>
              <input type="checkbox" checked={simTraffic} onChange={(e) => setSimTraffic(e.target.checked)} />
              Simulated hallway traffic
            </label>
            <div className="muted small" style={{ marginBottom: 8 }}>
              ~1,200 background passes spread across the day so the map is always busy.
            </div>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              {BLOCKS.map((b) => (
                <button key={b.index} className="btn sm" onClick={() => jumpTo(b.start + 30)}>
                  Jump to B{b.index + 1}
                </button>
              ))}
            </div>
            <button
              className="btn sm block"
              onClick={() => {
                if (confirm('Clear all passes you created, limits and overrides?')) resetDemo();
              }}
            >
              Reset demo data
            </button>
            <div className="muted small" style={{ marginTop: 8 }}>
              Tip: open a second tab and sign in as a different teacher — passes sync between tabs.
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
