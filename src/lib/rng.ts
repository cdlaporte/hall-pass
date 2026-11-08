/** Small deterministic PRNG (mulberry32) so the demo data is identical on every load. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T,>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    /** Weighted pick from [item, weight] pairs. */
    weighted: <T,>(pairs: readonly (readonly [T, number])[]): T => {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let r = next() * total;
      for (const [item, w] of pairs) {
        r -= w;
        if (r <= 0) return item;
      }
      return pairs[pairs.length - 1][0];
    },
  };
}
export type Rng = ReturnType<typeof makeRng>;

/** Stable hash of a string → 32-bit int (used for per-entity jitter). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
