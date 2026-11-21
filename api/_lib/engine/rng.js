// Seeded, serialisable PRNG (mulberry32). Each subsystem gets its own stream so that
// player actions can never perturb the market's random path.
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class RNG {
  constructor(seed = 1) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  normal(mean = 0, sd = 1) {
    const u1 = Math.max(this.next(), 1e-12), u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(items, fn) {
    let tot = 0;
    const ws = items.map(i => { const w = Math.max(0, fn ? fn(i) : i.weight); tot += w; return w; });
    if (tot <= 0) return items[Math.floor(this.next() * items.length)];
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  toJSON() { return this.s; }
  static fromJSON(s) { const r = new RNG(1); r.s = s >>> 0; return r; }
}

export const STREAMS = ['market', 'news', 'social', 'rivals', 'events', 'macro', 'micro', 'insider'];
export function makeStreams(seed) {
  const o = {};
  for (const n of STREAMS) o[n] = new RNG(hashString(`${seed}:${n}`));
  return o;
}
