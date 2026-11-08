/**
 * The demo "world": campus, walking graph, people and background traffic.
 * Built once at startup (deterministic) and shared everywhere.
 */
import { buildCampus } from './campus';
import { NavGraph } from './nav';
import { buildPeople } from './people';
import { buildSimPasses } from './passes';

export const DEFAULT_RESTROOM_LIMIT = 4;

const t0 = performance.now();
export const campus = buildCampus();
export const nav = new NavGraph(campus);
export const people = buildPeople(campus);
export const simPasses = buildSimPasses(campus, nav, people, DEFAULT_RESTROOM_LIMIT);
export const buildMs = performance.now() - t0;

export const roomsByBuildingFloor = new Map<string, typeof campus.rooms>();
for (const r of campus.rooms) {
  const k = `${r.buildingId}:${r.floor}`;
  const list = roomsByBuildingFloor.get(k) ?? [];
  list.push(r);
  roomsByBuildingFloor.set(k, list);
}
export function roomsOn(buildingId: string, floor: number) {
  return roomsByBuildingFloor.get(`${buildingId}:${floor}`) ?? [];
}

export function roomLabel(roomId: string): string {
  const r = campus.roomById.get(roomId);
  if (!r) return roomId;
  const b = campus.buildingById.get(r.buildingId)!;
  if (r.type === 'restroom') return `${r.name} · ${b.name} F${r.floor + 1}`;
  if (r.number && !r.name.endsWith(r.number)) return `${r.name} (${r.number})`;
  return r.name;
}
export function roomWhere(roomId: string): string {
  const r = campus.roomById.get(roomId);
  if (!r) return '';
  const b = campus.buildingById.get(r.buildingId)!;
  return `${b.name} · Floor ${r.floor + 1}`;
}
