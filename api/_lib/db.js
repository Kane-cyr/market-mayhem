// Storage layer. Supabase in production; an in-memory double for tests and local development.
// Every method is async so both behave the same.
import { randomUUID } from 'node:crypto';

export function memoryDb() {
  const players = new Map(), runs = new Map(), cash = [], events = [], follows = new Map(); let cid = 0, eid = 0;
  const now = () => new Date().toISOString();
  const clone = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
  return {
    kind: 'memory',
    async playerByNick(n) { for (const p of players.values()) if (p.nickname.toLowerCase() === String(n).toLowerCase()) return clone(p); return null; },
    async player(id) { return clone(players.get(id) || null); },
    async createPlayer(nickname, pin_hash) {
      if (await this.playerByNick(nickname)) { const e = new Error('taken'); e.code = '23505'; throw e; }
      const p = { id: randomUUID(), nickname, pin_hash, created_at: now(), last_seen: null, banned: false, ban_reason: null, vol_mult: 1, luck: 0, mods_ver: 1, failed_logins: 0, locked_until: null, avatar: {}, profile: {}, profile_at: null };
      players.set(p.id, p); return clone(p);
    },
    async updatePlayer(id, patch) { const p = players.get(id); if (!p) return null; Object.assign(p, patch); return clone(p); },
    async players() { return [...players.values()].map(clone); },
    async run(id) { return clone(runs.get(id) || null); },
    async runFor(pid, week) { for (const r of runs.values()) if (r.player_id === pid && r.week === week && r.status !== 'removed') return clone(r); return null; },
    async createRun(r) { for (const x of runs.values()) if (x.player_id === r.player_id && x.week === r.week && x.status !== 'removed') { const e = new Error('exists'); e.code = '23505'; throw e; } const row = { id: randomUUID(), status: 'active', issued: [], final_nw: null, ret: null, rigged: false, reject_reason: null, started_at: now(), submitted_at: null, actions: null, ...clone(r) }; runs.set(row.id, row); return clone(row); },
    async updateRun(id, patch) { const r = runs.get(id); if (!r) return null; Object.assign(r, clone(patch)); return clone(r); },
    async deleteRun(id) { runs.delete(id); },
    async runs(week) { return [...runs.values()].filter(r => !week || r.week === week).map(clone); },
    async pendingCash(pid) { return cash.filter(c => c.player_id === pid && !c.run_id).map(clone); },
    async cashForRun(runId) { return cash.filter(c => c.run_id === runId).map(clone); },
    async markCash(ids, runId) { for (const c of cash) if (ids.includes(c.id)) c.run_id = runId; },
    async addCash(pid, amount_cents, note) { const c = { id: ++cid, player_id: pid, amount_cents, note, created_at: now(), run_id: null }; cash.push(c); return clone(c); },
    async cashList() { return cash.map(clone); },
    async events(week) { return events.filter(e => e.week === week).map(clone); },
    async setProfile(id, avatar, profile) { const p = players.get(id); if (p) Object.assign(p, { avatar: clone(avatar), profile: clone(profile), profile_at: now() }); },
    async follow(a, b, on) { const k = a + '>' + b; if (on) follows.set(k, { follower: a, followee: b, created_at: now() }); else follows.delete(k); },
    async following(a) { return [...follows.values()].filter(f => f.follower === a).map(f => f.followee); },
    async followerCount(b) { return [...follows.values()].filter(f => f.followee === b).length; },
    async addEvent(e) { const row = { id: ++eid, created_at: now(), ...e }; events.push(row); return clone(row); },
  };
}

export async function supabaseDb(url, key) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const one = async q => { const { data, error } = await q; if (error) { const e = new Error(error.message); e.code = error.code; throw e; } return data; };
  return {
    kind: 'supabase',
    playerByNick: n => one(sb.from('players').select('*').eq('nickname', n).maybeSingle()),
    player: id => one(sb.from('players').select('*').eq('id', id).maybeSingle()),
    createPlayer: (nickname, pin_hash) => one(sb.from('players').insert({ nickname, pin_hash }).select().single()),
    updatePlayer: (id, patch) => one(sb.from('players').update(patch).eq('id', id).select().maybeSingle()),
    players: () => one(sb.from('players').select('*').order('created_at')),
    run: id => one(sb.from('runs').select('*').eq('id', id).maybeSingle()),
    runFor: (pid, week) => one(sb.from('runs').select('*').eq('player_id', pid).eq('week', week).neq('status', 'removed').maybeSingle()),
    createRun: r => one(sb.from('runs').insert(r).select().single()),
    updateRun: (id, patch) => one(sb.from('runs').update(patch).eq('id', id).select().maybeSingle()),
    deleteRun: id => one(sb.from('runs').delete().eq('id', id)),
    runs: week => one(week ? sb.from('runs').select('id,player_id,week,status,final_nw,ret,rigged,reject_reason,started_at,submitted_at,start_payload,issued').eq('week', week) : sb.from('runs').select('id,player_id,week,status,final_nw,ret,rigged,started_at,submitted_at')),
    pendingCash: pid => one(sb.from('cash_adjustments').select('*').eq('player_id', pid).is('run_id', null)),
    cashForRun: runId => one(sb.from('cash_adjustments').select('*').eq('run_id', runId)),
    markCash: (ids, runId) => ids.length ? one(sb.from('cash_adjustments').update({ run_id: runId }).in('id', ids)) : null,
    addCash: (pid, amount_cents, note) => one(sb.from('cash_adjustments').insert({ player_id: pid, amount_cents, note }).select().single()),
    cashList: () => one(sb.from('cash_adjustments').select('*').order('created_at', { ascending: false }).limit(200)),
    events: week => one(sb.from('global_events').select('*').eq('week', week).order('id')),
    addEvent: e => one(sb.from('global_events').insert(e).select().single()),
    setProfile: (id, avatar, profile) => one(sb.from('players').update({ avatar, profile, profile_at: new Date().toISOString() }).eq('id', id)),
    follow: (a, b, on) => on ? one(sb.from('follows').upsert({ follower: a, followee: b })) : one(sb.from('follows').delete().eq('follower', a).eq('followee', b)),
    following: async a => (await one(sb.from('follows').select('followee').eq('follower', a))).map(r => r.followee),
    followerCount: async b => { const { count, error } = await sb.from('follows').select('*', { count: 'exact', head: true }).eq('followee', b); if (error) throw new Error(error.message); return count || 0; },
  };
}

let cached;
export async function getDb() {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(url && key) && process.env.VERCEL) throw Object.assign(new Error('Database not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.'), { config: true });
  cached = url && key ? await supabaseDb(url, key) : memoryDb(); // in-memory only for local testing
  return cached;
}
export function setDb(db) { cached = db; }
