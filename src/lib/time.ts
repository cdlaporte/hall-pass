/** All times in the app are "minutes since midnight" on the single demo school day. */

export interface Block {
  index: number; // 0..3
  label: string;
  start: number;
  end: number;
}

const hm = (h: number, m: number) => h * 60 + m;

export const BLOCKS: Block[] = [
  { index: 0, label: 'Block 1', start: hm(7, 25), end: hm(8, 52) },
  { index: 1, label: 'Block 2', start: hm(8, 58), end: hm(10, 25) },
  { index: 2, label: 'Block 3', start: hm(10, 31), end: hm(12, 31) },
  { index: 3, label: 'Block 4', start: hm(12, 37), end: hm(14, 5) },
];

export const DAY_START = hm(7, 0);
export const DAY_END = hm(14, 30);

export type Period =
  | { kind: 'block'; block: Block }
  | { kind: 'passing'; from: Block; to: Block }
  | { kind: 'before' }
  | { kind: 'after' };

export function periodAt(t: number): Period {
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i];
    if (t >= b.start && t < b.end) return { kind: 'block', block: b };
    const n = BLOCKS[i + 1];
    if (n && t >= b.end && t < n.start) return { kind: 'passing', from: b, to: n };
  }
  return t < BLOCKS[0].start ? { kind: 'before' } : { kind: 'after' };
}

export function blockIndexAt(t: number): number {
  const p = periodAt(t);
  return p.kind === 'block' ? p.block.index : -1;
}

export function fmtTime(t: number, withSeconds = false): string {
  const total = Math.floor(t * 60);
  let h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(m).padStart(2, '0');
  return withSeconds ? `${h}:${mm}:${String(s).padStart(2, '0')} ${ap}` : `${h}:${mm} ${ap}`;
}

export function fmtDuration(min: number): string {
  if (min < 1) return `${Math.max(0, Math.round(min * 60))}s`;
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function periodLabel(t: number): string {
  const p = periodAt(t);
  switch (p.kind) {
    case 'block':
      return p.block.label;
    case 'passing':
      return `Passing → ${p.to.label}`;
    case 'before':
      return 'Before school';
    case 'after':
      return 'After school';
  }
}
