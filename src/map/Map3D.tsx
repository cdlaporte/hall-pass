import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as THREE from 'three';
import type { Building, Room } from '../data/campus';
import { studentName } from '../data/people';
import { campus, nav, people, roomsOn } from '../data/world';
import { hashStr } from '../lib/rng';
import { fmtTime } from '../lib/time';
import { passPosition, type ActivePass, type Snapshot, useSnapshot } from '../state/derive';
import { getNow, limitFor, useShared, useUI } from '../state/store';
import { limitStatus, phaseTone, roomFill, TONE_COLOR } from '../components/common';
import { pickDest } from './Map2D';
import { RoomTooltip } from './RoomTooltip';

const SLAB = 0.5;
const WALL = 2.4;

/** World (x, y-down plane) → three.js (x, up, z). */
const P = (x: number, y: number, h: number) => new THREE.Vector3(x, h, y);

export function Map3D({ active }: { active: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const picking = useUI((s) => !!s.draft?.picking);
  const lastPointer = useRef({ x: 0, y: 0 });
  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, cursor: picking ? 'crosshair' : undefined, display: active ? undefined : 'none' }}
      onPointerMove={(e) => {
        lastPointer.current = { x: e.clientX, y: e.clientY };
        if (hover) setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h));
      }}
    >
      <Canvas
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [220, 250, 520], fov: 38, near: 1, far: 4000 }}
        dpr={[1, 2]}
        onPointerMissed={() => setHover(null)}
      >
        <color attach="background" args={['#dde7ef']} />
        <fog attach="fog" args={['#dde7ef', 700, 1600]} />
        <hemisphereLight args={['#ffffff', '#9fb38f', 0.9]} />
        <directionalLight position={[150, 300, 120]} intensity={1.1} />
        <Scene onHover={(id) => setHover(id ? { id, ...lastPointer.current } : null)} />
      </Canvas>
      {hover && active && <RoomTooltip roomId={hover.id} x={hover.x} y={hover.y} container={wrapRef.current} picking={picking} />}
    </div>
  );
}

function Scene({ onHover }: { onHover: (id: string | null) => void }) {
  const snap = useSnapshot(1000);
  const hidden = useUI((s) => s.hiddenBuildings);
  const floors = useUI((s) => s.floors3d);
  const gap = useUI((s) => s.floorGap);
  return (
    <>
      <CameraRig />
      <Ground3D />
      {campus.buildings.map((b) => (
        <Building3D key={b.id} b={b} snap={snap} floors={floors} gap={gap} onHover={onHover} isHidden={hidden.includes(b.id)} />
      ))}
      <StudentDots3D snap={snap} gap={gap} />
      <Routes3D snap={snap} gap={gap} />
    </>
  );
}

function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const focus = useUI((s) => s.focus);
  const gap = useUI((s) => s.floorGap);
  const { camera } = useThree();
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t0: number } | null>(null);

  const initialFocus = useRef(focus?.n);
  useEffect(() => {
    if (!focus || !controls.current || focus.n === initialFocus.current) return;
    const c = controls.current;
    const to = P(focus.x, focus.y, focus.floor * gap);
    const offset = camera.position.clone().sub(c.target);
    const dist = Math.min(offset.length(), 170);
    offset.setLength(dist);
    anim.current = { from: c.target.clone(), to, camFrom: camera.position.clone(), camTo: to.clone().add(offset), t0: performance.now() };
  }, [focus?.n]);

  useFrame(() => {
    const a = anim.current;
    if (!a || !controls.current) return;
    const k = Math.min(1, (performance.now() - a.t0) / 600);
    const e = 1 - Math.pow(1 - k, 3);
    controls.current.target.lerpVectors(a.from, a.to, e);
    camera.position.lerpVectors(a.camFrom, a.camTo, e);
    controls.current.update();
    if (k >= 1) anim.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      target={[220, 0, 165]}
      maxPolarAngle={Math.PI / 2.15}
      minDistance={25}
      maxDistance={1100}
      enableDamping
      dampingFactor={0.12}
      makeDefault
    />
  );
}

const Ground3D = memo(function Ground3D() {
  const walk = useMemo(() => {
    const pts: number[] = [];
    for (const [a, b] of nav.walkways) pts.push(a.x, 0.06, a.y, b.x, 0.06, b.y);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[campus.width / 2, -0.05, campus.height / 2]}>
        <planeGeometry args={[2400, 2400]} />
        <meshLambertMaterial color="#b9d0a8" />
      </mesh>
      {campus.decor.map((d, i) => {
        const r = d.rect;
        const color = { road: '#8f949c', drive: '#a3a8b0', parking: '#b4b9c1', field: '#8fbf7c', track: '#b85c45', court: '#3f8f7d' }[d.kind];
        const len = d.kind === 'road' ? r.h + 1600 : r.h;
        return (
          <group key={i}>
            <mesh position={[r.x + r.w / 2, 0.02, r.y + r.h / 2]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[r.w, len]} />
              <meshLambertMaterial color={color} />
            </mesh>
            {d.kind === 'track' && (
              <mesh position={[r.x + r.w / 2, 0.04, r.y + r.h / 2]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[r.w - 18, r.h - 18]} />
                <meshLambertMaterial color="#8fbf7c" />
              </mesh>
            )}
          </group>
        );
      })}
      <lineSegments geometry={walk}>
        <lineBasicMaterial color="#f4ecd8" />
      </lineSegments>
    </group>
  );
});

function Footprint({ b }: { b: Building }) {
  const r = b.rect;
  return (
    <mesh position={[r.x + r.w / 2, 0.1, r.y + r.h / 2]}>
      <boxGeometry args={[r.w, 0.2, r.h]} />
      <meshLambertMaterial color="#c5cad2" transparent opacity={0.6} />
    </mesh>
  );
}

function Building3D({
  b,
  snap,
  floors,
  gap,
  onHover,
  isHidden,
}: {
  b: Building;
  snap: Snapshot;
  floors: boolean[];
  gap: number;
  onHover: (id: string | null) => void;
  isHidden: boolean;
}) {
  const r = b.rect;
  const colorMode = useUI((s) => s.colorMode);
  const sel = useUI((s) => s.selection);
  const limits = useShared((s) => s.limits);
  const def = useShared((s) => s.defaultRestroomLimit);
  const showCounts = useUI((s) => s.showCounts);
  const topVisible = isHidden ? -1 : Math.max(-1, ...Array.from({ length: b.floors }, (_, f) => (floors[f] ? f : -1)));
  // NOTE: drei <Html> overlays are kept mounted and toggled with CSS — unmounting
  // them mid-commit trips a React DOM removeChild error.
  return (
    <group>
      {isHidden && <Footprint b={b} />}
      {Array.from({ length: b.floors }, (_, f) => {
        const y = f * gap;
        const shown = !isHidden && floors[f];
        const rr = roomsOn(b.id, f).filter((x) => x.type === 'restroom');
        return (
          <group key={f}>
            {!isHidden && !floors[f] && (
              <mesh position={[r.x + r.w / 2, y + SLAB / 2, r.y + r.h / 2]}>
                <boxGeometry args={[r.w, SLAB, r.h]} />
                <meshBasicMaterial color={b.color} transparent opacity={0.08} />
                <Edges color={b.color} />
              </mesh>
            )}
            {shown && (
              <group>
                {/* slab */}
                <mesh position={[r.x + r.w / 2, y + SLAB / 2, r.y + r.h / 2]}>
                  <boxGeometry args={[r.w + 0.6, SLAB, r.h + 0.6]} />
                  <meshLambertMaterial color={b.color} />
                </mesh>
                {/* corridor */}
                <mesh position={[b.corridor.x + b.corridor.w / 2, y + SLAB + 0.05, b.corridor.y + b.corridor.h / 2]}>
                  <boxGeometry args={[b.corridor.w, 0.1, b.corridor.h]} />
                  <meshLambertMaterial color="#f3f4f6" />
                </mesh>
                {roomsOn(b.id, f).map((room) => (
                  <Room3D
                    key={room.id}
                    room={room}
                    y={y + SLAB}
                    color={roomFill(room.id, snap, colorMode, limits, def)}
                    selected={sel?.kind === 'room' && sel.id === room.id}
                    onHover={onHover}
                  />
                ))}
                {/* glass shell */}
                <mesh position={[r.x + r.w / 2, y + SLAB + WALL / 2, r.y + r.h / 2]} raycast={() => null}>
                  <boxGeometry args={[r.w, WALL, r.h]} />
                  <meshBasicMaterial color={b.color} transparent opacity={0.05} depthWrite={false} />
                  <Edges color={b.color} />
                </mesh>
              </group>
            )}
            {rr.length > 0 && (
              <RestroomBadge
                rooms={rr}
                y={y + SLAB + WALL + 0.5}
                visible={shown && showCounts && snap.block >= 0}
                snap={snap}
                limits={limits}
                def={def}
              />
            )}
          </group>
        );
      })}
      <Html position={[r.x + r.w / 2, Math.max(0, topVisible) * gap + WALL + 6, r.y + r.h / 2]} center zIndexRange={[20, 0]}>
        <div
          className="label3d bld"
          style={{ display: topVisible >= 0 ? undefined : 'none' }}
          onClick={() => useUI.getState().select({ kind: 'building', id: b.id })}
        >
          <span style={{ color: b.color }}>●</span> {b.name}
        </div>
      </Html>
    </group>
  );
}

const Room3D = memo(function Room3D({ room, y, color, selected, onHover }: { room: Room; y: number; color: string; selected: boolean; onHover: (id: string | null) => void }) {
  const r = room.rect;
  const [hot, setHot] = useState(false);
  const h = room.type === 'stairs' ? 0.6 : 0.25;
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHot(true);
    onHover(room.id);
  };
  const onOut = () => {
    setHot(false);
    onHover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return;
    const ui = useUI.getState();
    if (ui.draft?.picking) pickDest(room);
    else ui.select({ kind: 'room', id: room.id });
  };
  return (
    <group>
      <mesh position={[r.x + r.w / 2, y + h / 2, r.y + r.h / 2]} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <boxGeometry args={[r.w - 0.25, h, r.h - 0.25]} />
        <meshLambertMaterial color={hot ? '#ffd6e0' : color} />
      </mesh>
      {/* walls as outline */}
      <mesh position={[r.x + r.w / 2, y + WALL / 2, r.y + r.h / 2]} raycast={() => null}>
        <boxGeometry args={[r.w - 0.1, WALL, r.h - 0.1]} />
        <meshBasicMaterial visible={false} />
        <Edges color={selected ? '#b3123a' : '#8a93a3'} lineWidth={selected ? 2.5 : 1} />
      </mesh>
    </group>
  );
});

/** One badge per building floor summarising its restrooms, e.g. "B 1/4 · G 0/4". */
function RestroomBadge({
  rooms,
  y,
  visible,
  snap,
  limits,
  def,
}: {
  rooms: Room[];
  y: number;
  visible: boolean;
  snap: Snapshot;
  limits: Record<string, number>;
  def: number;
}) {
  const cx = rooms.reduce((s, r) => s + r.center.x, 0) / rooms.length;
  const cy = rooms.reduce((s, r) => s + r.center.y, 0) / rooms.length;
  const parts = rooms.map((r) => {
    const n = snap.counts.get(r.id) ?? 0;
    const lim = limitFor(r.id, { limits, defaultRestroomLimit: def });
    return { r, n, lim, st: limitStatus(n, lim) };
  });
  const worst = parts.some((p) => p.st === 'full') ? 'red' : parts.some((p) => p.st === 'near') ? 'amber' : 'green';
  return (
    <Html position={[cx, y, cy]} center zIndexRange={[10, 0]}>
      <div className={`label3d rr ${worst}`} style={{ display: visible ? undefined : 'none' }}>
        {parts.map((p) => `${p.r.gender === 'Boys' ? 'B' : p.r.gender === 'Girls' ? 'G' : 'X'} ${p.n}/${p.lim}`).join(' · ')}
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------

function StudentDots3D({ snap, gap }: { snap: Snapshot; gap: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const show = useUI((s) => s.showDots);
  const hidden = useUI((s) => s.hiddenBuildings);
  const floors = useUI((s) => s.floors3d);
  const sel = useUI((s) => s.selection);
  const MAX = people.students.length;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    if (show && snap.block >= 0) {
      for (const b of campus.buildings) {
        if (hidden.includes(b.id)) continue;
        for (let f = 0; f < b.floors; f++) {
          if (!floors[f]) continue;
          for (const room of roomsOn(b.id, f)) {
            const occ = snap.occupants(room.id);
            const r = room.rect;
            for (const si of occ) {
              const h = hashStr(people.students[si].id);
              const x = r.x + 0.9 + ((h & 0xffff) / 0xffff) * (r.w - 1.8);
              const z = r.y + 0.9 + ((h >>> 16) / 0xffff) * (r.h - 1.8);
              const isSel = sel?.kind === 'student' && sel.idx === si;
              m.makeScale(isSel ? 2.4 : 1, isSel ? 2.4 : 1, isSel ? 2.4 : 1);
              m.setPosition(x, f * gap + SLAB + 0.9, z);
              mesh.setMatrixAt(n, m);
              mesh.setColorAt(n, c.set(isSel ? '#b3123a' : '#334155'));
              n++;
            }
          }
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [snap, show, hidden, floors, gap, sel]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]} raycast={() => null} frustumCulled={false}>
      <capsuleGeometry args={[0.28, 0.8, 2, 6]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------

function Routes3D({ snap, gap }: { snap: Snapshot; gap: number }) {
  const mode = useUI((s) => s.routes);
  const hidden = useUI((s) => s.hiddenBuildings);
  const sel = useUI((s) => s.selection);
  const hl = useUI((s) => s.highlightPassId);
  const floors = useUI((s) => s.floors3d);
  if (mode === 'none') return null;
  const list = snap.active.filter(({ pass }) => {
    const selected = (sel?.kind === 'student' && sel.idx === pass.studentIdx) || hl === pass.id || (sel?.kind === 'room' && (pass.destRoomId === sel.id || pass.originRoomId === sel.id));
    if (mode === 'selected') return selected;
    if (selected) return true;
    const a = campus.roomById.get(pass.originRoomId)!;
    const b = campus.roomById.get(pass.destRoomId)!;
    if (hidden.includes(a.buildingId) && hidden.includes(b.buildingId)) return false;
    return floors[a.floor] || floors[b.floor];
  });
  return (
    <group>
      {list.map((ap) => (
        <Route3D key={ap.pass.id} ap={ap} gap={gap} strong={hl === ap.pass.id || (sel?.kind === 'student' && sel.idx === ap.pass.studentIdx)} labels={list.length <= 30} />
      ))}
    </group>
  );
}

function Route3D({ ap, gap, strong, labels }: { ap: ActivePass; gap: number; strong: boolean; labels: boolean }) {
  const { pass, st } = ap;
  const route = nav.route(pass.originRoomId, pass.destRoomId);
  const color = TONE_COLOR[phaseTone(pass, st)];
  const pts = useMemo(() => route.pts.map((p) => P(p.x, p.y, p.f * gap + SLAB + 1.4)), [route, gap]);
  const mover = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const s = people.students[pass.studentIdx];
  useFrame(() => {
    const g = mover.current;
    if (!g) return;
    const { pt, st: live } = passPosition(pass, getNow());
    g.position.set(pt.x, pt.f * gap + SLAB + 1.6, pt.y);
    g.visible = live.active;
    if (labelRef.current) labelRef.current.className = `label3d${live.overdue ? ' overdue' : ''}`;
  });
  return (
    <group>
      <Line points={pts} color={color} lineWidth={strong ? 4.5 : 2.2} transparent opacity={strong ? 1 : 0.75} />
      <group ref={mover}>
        <mesh>
          <sphereGeometry args={[strong ? 2.1 : 1.5, 16, 12]} />
          <meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.35} />
        </mesh>
        <Html center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={labelRef} className="label3d" style={{ borderLeft: `3px solid ${color}`, display: labels || strong ? undefined : 'none' }}>
            {studentName(s)} · left {fmtTime(pass.createdAt)}
          </div>
        </Html>
      </group>
    </group>
  );
}
