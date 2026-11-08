import { lazy, Suspense, useRef } from 'react';
import { campus } from '../data/world';
import { useUI } from '../state/store';
import { ROOM_FILL } from '../components/common';
import { Map2D } from './Map2D';

const Map3D = lazy(() => import('./Map3D').then((m) => ({ default: m.Map3D })));

export function MapView() {
  const ui = useUI();
  const { view, floor2d, floors3d, hiddenBuildings, routes, showDots, showCounts, colorMode, floorGap, draft, set } = ui;
  const opened3d = useRef(false);
  if (view === '3d') opened3d.current = true;

  return (
    <div className="mapwrap">
      {/* Both views stay mounted once opened so camera / zoom survive switching. */}
      <Map2D active={view === '2d'} />
      {(view === '3d' || opened3d.current) && (
        <Suspense fallback={<div className="loading">Loading 3D campus…</div>}>
          <Map3D active={view === '3d'} />
        </Suspense>
      )}

      <div className="overlay map-top">
        <div className="panel-float layer-row">
          <div className="seg">
            <button className={view === '2d' ? 'on' : ''} onClick={() => set({ view: '2d' })}>
              2D plan
            </button>
            <button className={view === '3d' ? 'on' : ''} onClick={() => set({ view: '3d' })}>
              3D campus
            </button>
          </div>
          <span className="muted small">Routes</span>
          <div className="seg">
            {(['all', 'selected', 'none'] as const).map((m) => (
              <button key={m} className={routes === m ? 'on' : ''} onClick={() => set({ routes: m })}>
                {m === 'all' ? 'All' : m === 'selected' ? 'Selected' : 'Off'}
              </button>
            ))}
          </div>
          <label title="Show every student as a dot in the room they're in">
            <input type="checkbox" checked={showDots} onChange={(e) => set({ showDots: e.target.checked })} /> Students
          </label>
          <label title="Headcount badges on rooms">
            <input type="checkbox" checked={showCounts} onChange={(e) => set({ showCounts: e.target.checked })} /> Counts
          </label>
          <label title="Color rooms by how full they are">
            <input type="checkbox" checked={colorMode === 'occupancy'} onChange={(e) => set({ colorMode: e.target.checked ? 'occupancy' : 'type' })} /> Heatmap
          </label>
        </div>
        <div className="panel-float layer-row" style={{ maxWidth: 560 }}>
          <span className="muted small">Buildings</span>
          <div className="chips">
            {campus.buildings.map((b) => {
              const off = hiddenBuildings.includes(b.id);
              return (
                <button
                  key={b.id}
                  className={`chip${off ? ' off' : ''}`}
                  style={off ? undefined : { borderColor: b.color }}
                  onClick={() => ui.toggleBuilding(b.id)}
                  onDoubleClick={() => set({ hiddenBuildings: campus.buildings.filter((x) => x.id !== b.id).map((x) => x.id) })}
                  title={`${b.name} — click to hide/show, double-click to show only this building`}
                >
                  {b.code}
                </button>
              );
            })}
            {hiddenBuildings.length > 0 && (
              <button className="chip" onClick={() => set({ hiddenBuildings: [] })}>
                Show all
              </button>
            )}
          </div>
        </div>
        {view === '3d' && (
          <div className="panel-float layer-row">
            <span className="muted small">Explode floors</span>
            <input type="range" min={4} max={22} step={0.5} value={floorGap} onChange={(e) => set({ floorGap: Number(e.target.value) })} style={{ width: 110 }} />
          </div>
        )}
      </div>

      <div className="overlay panel-float floor-picker">
        <div className="cap">Floor</div>
        {Array.from({ length: campus.maxFloors }, (_, i) => campus.maxFloors - 1 - i).map((f) =>
          view === '2d' ? (
            <button key={f} className={`fl${floor2d === f ? ' on' : ''}`} onClick={() => set({ floor2d: f })} title={`Show floor ${f + 1} of every building`}>
              {f + 1}
            </button>
          ) : (
            <button
              key={f}
              className={`fl${floors3d[f] ? ' on' : ''}`}
              onClick={() => set({ floors3d: floors3d.map((v, i) => (i === f ? !v : v)) })}
              onDoubleClick={() => set({ floors3d: floors3d.map((_, i) => i === f) })}
              title={`Toggle floor ${f + 1} (double-click: only this floor)`}
            >
              {f + 1}
            </button>
          ),
        )}
        {view === '3d' && (
          <button className="fl" style={{ fontSize: 10 }} onClick={() => set({ floors3d: floors3d.map(() => true) })} title="Show all floors">
            All
          </button>
        )}
      </div>

      {draft?.picking && (
        <div className="overlay pick-banner">
          📍 Click a room on the map to set the destination
          <button onClick={() => ui.updateDraft({ picking: false })}>Cancel</button>
        </div>
      )}

      <div className="overlay panel-float legend">
        <span>
          <i className="ln" style={{ background: '#2563eb' }} />
          En route
        </span>
        <span>
          <i className="ln" style={{ background: '#7c3aed' }} />
          Returning
        </span>
        <span>
          <i className="ln" style={{ background: '#16a34a' }} />
          At destination
        </span>
        <span>
          <i className="ln" style={{ background: '#d97706' }} />
          Awaiting check-in
        </span>
        <span>
          <i className="ln" style={{ background: '#dc2626' }} />
          Overdue
        </span>
        <span>
          <i style={{ background: ROOM_FILL.restroom }} />
          Restroom
        </span>
        <span>
          <i style={{ background: '#86efac' }} />
          <i style={{ background: '#fcd34d' }} />
          <i style={{ background: '#fca5a5' }} />
          Limit OK / near / full
        </span>
        {view === '2d' && <span className="muted">Dashed = on another floor · drag to pan, scroll to zoom</span>}
        {view === '3d' && <span className="muted">Drag to orbit · right-drag to pan · scroll to zoom</span>}
      </div>
    </div>
  );
}
