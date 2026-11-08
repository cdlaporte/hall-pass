import type { Campus, Pt, Rect } from './campus';

/** A point on a walking route. `f` is the floor; outdoor points are floor 0 with `out: true`. */
export interface RoutePt {
  x: number;
  y: number;
  f: number;
  out?: boolean;
  /** Building this point is inside (undefined when outdoors). */
  b?: string;
}

export interface Route {
  pts: RoutePt[];
  /** Cumulative walking distance at each point (stairs count as STAIR_COST per floor). */
  cum: number[];
  length: number;
  /** Expected one-way walking time in minutes. */
  minutes: number;
}

interface Node extends RoutePt {
  id: number;
}

const STAIR_COST = 9; // meters-equivalent per floor climbed
const WALK_MPS = 1.25;

export class NavGraph {
  nodes: Node[] = [];
  adj: { to: number; w: number }[][] = [];
  roomNode = new Map<string, number>();
  /** Outdoor walkway segments, for drawing paths on the map. */
  walkways: [Pt, Pt][] = [];
  private cache = new Map<string, Route>();

  constructor(private campus: Campus) {
    this.build();
    this.buildWalkways();
  }

  /** Sidewalks = the outdoor legs of shortest routes between every pair of buildings. */
  private buildWalkways() {
    const seen = new Set<string>();
    const firstRoom = this.campus.buildings.map((b) => this.campus.rooms.find((r) => r.buildingId === b.id && r.floor === 0)!);
    for (let i = 0; i < firstRoom.length; i++) {
      for (let j = i + 1; j < firstRoom.length; j++) {
        const pts = this.route(firstRoom[i].id, firstRoom[j].id).pts;
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1];
          const b = pts[k];
          if (!a.out || !b.out) continue;
          const key = [a.x, a.y, b.x, b.y].map((v) => v.toFixed(1)).join(',');
          const rev = [b.x, b.y, a.x, a.y].map((v) => v.toFixed(1)).join(',');
          if (seen.has(key) || seen.has(rev)) continue;
          seen.add(key);
          this.walkways.push([
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
          ]);
        }
      }
    }
  }

  private add(p: RoutePt): number {
    const id = this.nodes.length;
    this.nodes.push({ ...p, id });
    this.adj.push([]);
    return id;
  }
  private link(a: number, b: number, w?: number) {
    const na = this.nodes[a];
    const nb = this.nodes[b];
    const d = w ?? Math.hypot(na.x - nb.x, na.y - nb.y);
    this.adj[a].push({ to: b, w: d });
    this.adj[b].push({ to: a, w: d });
  }

  private build() {
    const { campus } = this;
    const outdoor: number[] = [];

    for (const b of campus.buildings) {
      const stairNodes: number[][] = [];
      for (let f = 0; f < b.floors; f++) {
        // Corridor nodes keyed by their position along the corridor.
        const along = (p: Pt) => (b.orient === 'h' ? p.x - b.rect.x : p.y - b.rect.y);
        const rooms = campus.rooms.filter((r) => r.buildingId === b.id && r.floor === f);
        const keyed = new Map<number, Pt>();
        const [e0, e1] = b.corridorEnds;
        keyed.set(0, e0);
        keyed.set(Math.round(b.length * 10) / 10, e1);
        for (const r of rooms) keyed.set(Math.round(along(r.corridorPt) * 10) / 10, r.corridorPt);
        const sorted = [...keyed.entries()].sort((a, c) => a[0] - c[0]);
        const idByU = new Map<number, number>();
        let prev = -1;
        for (const [u, p] of sorted) {
          const id = this.add({ x: p.x, y: p.y, f, b: b.id });
          idByU.set(u, id);
          if (prev >= 0) this.link(prev, id);
          prev = id;
        }
        for (const r of rooms) {
          const cId = idByU.get(Math.round(along(r.corridorPt) * 10) / 10)!;
          const door = this.add({ x: r.door.x, y: r.door.y, f, b: b.id });
          const center = this.add({ x: r.center.x, y: r.center.y, f, b: b.id });
          this.link(cId, door);
          this.link(door, center);
          this.roomNode.set(r.id, center);
          if (r.type === 'stairs') {
            const idx = rooms.filter((x) => x.type === 'stairs').indexOf(r);
            (stairNodes[idx] ??= [])[f] = cId;
          }
        }
        if (f === 0) {
          const end0 = idByU.get(0)!;
          const end1 = idByU.get(Math.round(b.length * 10) / 10)!;
          const [x0, x1] = b.entrances;
          const o0 = this.add({ x: x0.x, y: x0.y, f: 0, out: true });
          const o1 = this.add({ x: x1.x, y: x1.y, f: 0, out: true });
          this.link(end0, o0);
          this.link(end1, o1);
          outdoor.push(o0, o1);
        }
      }
      for (const stack of stairNodes) {
        if (!stack) continue;
        for (let f = 1; f < stack.length; f++) {
          if (stack[f] !== undefined && stack[f - 1] !== undefined) this.link(stack[f - 1], stack[f], STAIR_COST);
        }
      }
    }

    // Outdoor visibility graph: entrances + building corners, linked when the
    // straight segment between them does not cut through a building.
    const blockers = campus.buildings.map((b) => grow(b.rect, 2.5));
    for (const b of campus.buildings) {
      const r = grow(b.rect, 4);
      for (const c of corners(r)) {
        if (blockers.some((k) => inside(c, k))) continue;
        outdoor.push(this.add({ x: c.x, y: c.y, f: 0, out: true }));
      }
    }
    for (let i = 0; i < outdoor.length; i++) {
      for (let j = i + 1; j < outdoor.length; j++) {
        const a = this.nodes[outdoor[i]];
        const c = this.nodes[outdoor[j]];
        if (Math.hypot(a.x - c.x, a.y - c.y) > 170) continue;
        if (blockers.some((k) => segHitsRect(a, c, k))) continue;
        this.link(outdoor[i], outdoor[j]);
      }
    }
  }

  route(fromRoom: string, toRoom: string): Route {
    const key = `${fromRoom}|${toRoom}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const s = this.roomNode.get(fromRoom);
    const t = this.roomNode.get(toRoom);
    if (s === undefined || t === undefined) throw new Error(`No route ${key}`);
    const path = this.dijkstra(s, t);
    const pts = path.map((id) => {
      const n = this.nodes[id];
      return { x: n.x, y: n.y, f: n.f, out: n.out, b: n.b };
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = a.f !== b.f ? STAIR_COST * Math.abs(a.f - b.f) : Math.hypot(a.x - b.x, a.y - b.y);
      cum.push(cum[i - 1] + d);
    }
    const length = cum[cum.length - 1];
    const route: Route = { pts, cum, length, minutes: Math.max(0.4, length / WALK_MPS / 60 + 0.25) };
    this.cache.set(key, route);
    return route;
  }

  private dijkstra(s: number, t: number): number[] {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    dist[s] = 0;
    heap.push(s, 0);
    while (heap.size) {
      const [u, d] = heap.pop();
      if (d > dist[u]) continue;
      if (u === t) break;
      for (const e of this.adj[u]) {
        const nd = d + e.w;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = u;
          heap.push(e.to, nd);
        }
      }
    }
    const out: number[] = [];
    for (let v = t; v !== -1; v = prev[v]) out.push(v);
    return out.reverse();
  }
}

/** Position along a route at a fraction 0..1 of its length. */
export function pointAt(route: Route, frac: number): RoutePt {
  const { pts, cum, length } = route;
  const target = Math.min(1, Math.max(0, frac)) * length;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < target) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = cum[i] - cum[i - 1] || 1;
  const k = Math.min(1, Math.max(0, (target - cum[i - 1]) / seg));
  if (a.f !== b.f) {
    // Climbing stairs: stay in place, interpolate floor for 3D.
    return { x: a.x, y: a.y, f: a.f + (b.f - a.f) * k, b: a.b };
  }
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, f: a.f, out: a.out && b.out, b: a.b ?? b.b };
}

export function buildingsOnRoute(route: Route): string[] {
  return [...new Set(route.pts.map((p) => p.b).filter(Boolean) as string[])];
}

function grow(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}
function corners(r: Rect): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
}
function inside(p: Pt, r: Rect) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}
/** Liang–Barsky: does segment a→b pass through the interior of rect r? */
function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] <= 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 >= t1) return false;
    }
  }
  return t1 - t0 > 1e-6;
}

class MinHeap {
  private ids: number[] = [];
  private ks: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, k: number) {
    this.ids.push(id);
    this.ks.push(k);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.ks[p] <= this.ks[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.ids[0], this.ks[0]];
    const lastId = this.ids.pop()!;
    const lastK = this.ks.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.ks[0] = lastK;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.ks[l] < this.ks[m]) m = l;
        if (r < this.ids.length && this.ks[r] < this.ks[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(i: number, j: number) {
    [this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]];
    [this.ks[i], this.ks[j]] = [this.ks[j], this.ks[i]];
  }
}

