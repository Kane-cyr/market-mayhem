export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const round = (x, d = 2) => { const m = Math.pow(10, d); return Math.round(x * m) / m; };
export const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
export const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
export function fmtBn(usd) { // dollars -> "$12.4B" / "$840M"
  const a = Math.abs(usd);
  if (a >= 1e12) return `$${(usd / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(usd / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `$${Math.round(usd / 1e6)}M`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}
export function std(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
export function fill(str, vars) {
  return str.replace(/\$?\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
