// Nickname + 4-digit PIN accounts. PINs are salted and hashed with scrypt. Five wrong PINs lock the
// account for 15 minutes, since a 4-digit PIN could otherwise be guessed. Sessions are HMAC-signed tokens.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) { if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('SESSION_SECRET must be set (32+ characters).'); return 'dev-only-secret-dev-only-secret-dev!'; } return s; };
export const NICK_RE = /^[A-Za-z0-9_]{3,16}$/, PIN_RE = /^\d{4}$/;
export const MAX_FAILS = 5, LOCK_MIN = 15, TOKEN_DAYS = 60;

export function hashPin(pin) { const salt = randomBytes(16); return `s1$${salt.toString('base64')}$${scryptSync(pin, salt, 32).toString('base64')}`; }
export function checkPin(pin, stored) {
  const [, s, h] = String(stored).split('$'); if (!s || !h) return false;
  const a = scryptSync(pin, Buffer.from(s, 'base64'), 32), b = Buffer.from(h, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}
const sign = body => createHmac('sha256', secret()).update(body).digest('base64url');
export function makeToken(pid) { const body = `${pid}.${Date.now() + TOKEN_DAYS * 864e5}`; return `${body}.${sign(body)}`; }
export function readToken(tok) {
  const parts = String(tok || '').split('.'); if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`, sig = Buffer.from(parts[2]), want = Buffer.from(sign(body));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return parts[0];
}
export function adminOk(key) {
  const want = process.env.ADMIN_PASSWORD; if (!want || want.length < 10) return false;
  const a = createHmac('sha256', 'cmp').update(String(key || '')).digest(), b = createHmac('sha256', 'cmp').update(want).digest();
  return timingSafeEqual(a, b);
}
