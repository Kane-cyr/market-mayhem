// MARKET MAYHEM online: request handling, independent of Vercel so it can be tested directly.
// handleGame / handleAdmin take (db, op, body, headers) and return { status, body }.
import { createWeekly, replayRun, weekId } from './engine/game.js';
import { netWorth } from './engine/trading.js';
import { WEEKLY_DAYS } from './engine/game.js';
import { ITEMS } from './engine/lifestyle.js';
import { LEVELS } from './engine/progress.js';
import { NICK_RE, PIN_RE, MAX_FAILS, LOCK_MIN, hashPin, checkPin, makeToken, readToken, adminOk } from './auth.js';

const ok = body => ({ status: 200, body });
const bad = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
const START_CASH = 1000000; // cents ($10,000)
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64'); // light obfuscation; god settings are not shown in the game
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const startTick = (() => { const memo = {}; return w => (memo[w] ??= createWeekly(w).t); })();

function evPayload(e) { return { id: e.id, kind: e.kind, mag: Number(e.magnitude), day: e.game_day ?? null, ticker: e.ticker || null, text: e.headline || null, who: e.speaker || null }; }
function cashPayload(c) { return { id: c.id, amount: Number(c.amount_cents) }; }
const forPlayer = (evs, pid) => evs.filter(e => !e.player_id || e.player_id === pid);
const deliveredIds = run => { const ids = new Set(); for (const p of [run.start_payload, ...(run.issued || [])]) for (const e of p.events || []) ids.add(e.id); return ids; };

async function authPlayer(db, headers) {
  const pid = readToken(String(headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!pid) return null; const p = await db.player(pid); return p || null;
}

export async function handleGame(db, op, body = {}, headers = {}) {
  body = body || {};
  if (op === 'ping') return ok({ ok: true, week: weekId(), days: WEEKLY_DAYS });

  if (op === 'register' || op === 'login') {
    const nick = String(body.nickname || '').trim(), pin = String(body.pin || '');
    if (!NICK_RE.test(nick)) return bad(400, 'Nicknames are 3-16 letters, numbers or underscores.');
    if (!PIN_RE.test(pin)) return bad(400, 'Your PIN must be exactly 4 digits.');
    if (op === 'register') {
      try { const p = await db.createPlayer(nick, hashPin(pin)); return ok({ token: makeToken(p.id), nickname: p.nickname }); }
      catch (e) { if (e.code === '23505') return bad(409, 'That nickname is taken.'); throw e; }
    }
    const p = await db.playerByNick(nick); if (!p) return bad(401, 'Wrong nickname or PIN.');
    if (p.locked_until && new Date(p.locked_until) > new Date()) return bad(429, 'Too many wrong PINs. Try again in a few minutes.');
    if (!checkPin(pin, p.pin_hash)) {
      const f = (p.failed_logins || 0) + 1;
      await db.updatePlayer(p.id, f >= MAX_FAILS ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MIN * 6e4).toISOString() } : { failed_logins: f });
      return bad(401, 'Wrong nickname or PIN.');
    }
    await db.updatePlayer(p.id, { failed_logins: 0, locked_until: null, last_seen: new Date().toISOString() });
    if (p.banned) return bad(403, 'This account has been banned.', { banned: true, reason: p.ban_reason || '' });
    return ok({ token: makeToken(p.id), nickname: p.nickname });
  }

  if (op === 'player') { // public: someone's office
    const x = await db.playerByNick(String(body.nick || '')); if (!x || x.banned) return bad(404, 'No trader by that name.');
    const [run, followers] = await Promise.all([db.runFor(x.id, weekId()), db.followerCount(x.id)]);
    const viewer = await authPlayer(db, headers); const following = viewer ? (await db.following(viewer.id)).includes(x.id) : false;
    return ok({ nickname: x.nickname, avatar: x.avatar || {}, profile: x.profile || {}, updated: x.profile_at, followers, following, me: viewer?.id === x.id,
      weekly: run && run.status === 'submitted' ? { nw: Number(run.final_nw), ret: run.ret } : null });
  }
  if (op === 'players') { // public: trader directory
    const ps = (await db.players()).filter(x => !x.banned).map(x => ({ nickname: x.nickname, avatar: x.avatar || {}, nw: x.profile?.career?.nw ?? null, level: x.profile?.career?.level ?? 0, flex: x.profile?.career?.flex ?? 0, seen: x.last_seen }));
    ps.sort((a, b) => (b.nw ?? -1) - (a.nw ?? -1)); return ok({ rows: ps.slice(0, 200) });
  }
  if (op === 'board') {
    const week = String(body.week || weekId()).slice(0, 10);
    const [runs, players] = await Promise.all([db.runs(week), db.players()]);
    const pm = new Map(players.map(p => [p.id, p]));
    const rows = runs.filter(r => r.status === 'submitted' && pm.get(r.player_id) && !pm.get(r.player_id).banned)
      .sort((a, b) => Number(b.final_nw) - Number(a.final_nw)).slice(0, 100)
      .map((r, i) => ({ rank: i + 1, nickname: pm.get(r.player_id).nickname, nw: Number(r.final_nw), ret: r.ret, at: r.submitted_at }));
    return ok({ week, rows });
  }

  const p = await authPlayer(db, headers);
  if (!p) return bad(401, 'Please sign in again.');
  if (p.banned) return bad(403, 'This account has been banned.', { banned: true, reason: p.ban_reason || '' });
  db.updatePlayer(p.id, { last_seen: new Date().toISOString() }).catch(() => {});

  if (op === 'profile') { // the game pushes your look, career snapshot and recent trades
    const avatar = cleanAvatar(body.avatar), profile = cleanProfile(body.profile, p.profile);
    if (p.profile_at && Date.now() - new Date(p.profile_at) < 15000 && !body.force) return ok({ ok: true, throttled: true });
    await db.setProfile(p.id, avatar, profile); return ok({ ok: true });
  }
  if (op === 'follow') {
    const x = await db.playerByNick(String(body.nick || '')); if (!x) return bad(404, 'No trader by that name.'); if (x.id === p.id) return bad(400, 'You cannot follow yourself.');
    if (body.on && (await db.following(p.id)).length >= 200) return bad(400, 'You follow enough people already.');
    await db.follow(p.id, x.id, !!body.on); return ok({ ok: true, following: !!body.on });
  }
  if (op === 'feed') { // recent trades by everyone you follow
    const ids = await db.following(p.id); const rows = [];
    for (const id of ids.slice(0, 200)) { const x = await db.player(id); if (!x || x.banned) continue; for (const t of (x.profile?.trades || []).slice(-15)) rows.push({ ...t, nickname: x.nickname, avatar: x.avatar || {}, at: x.profile_at }); }
    rows.sort((a, b) => (new Date(b.at) - new Date(a.at)) || (b.t - a.t)); return ok({ rows: rows.slice(0, 80), following: ids.length });
  }
  if (op === 'me') { const run = await db.runFor(p.id, weekId()); return ok({ nickname: p.nickname, week: weekId(), run: run && { id: run.id, status: run.status, nw: run.final_nw && Number(run.final_nw), ret: run.ret, reason: run.reject_reason } }); }

  if (op === 'start') {
    const week = weekId(), existing = await db.runFor(p.id, week);
    if (existing) {
      if (existing.status === 'active') return ok({ resume: true, runId: existing.id, week });
      return ok({ finished: true, runId: existing.id, status: existing.status, nw: existing.final_nw && Number(existing.final_nw), ret: existing.ret, reason: existing.reject_reason, week });
    }
    const [cash, evs] = await Promise.all([db.pendingCash(p.id), db.events(week)]);
    const payload = { ver: p.mods_ver, vol: Number(p.vol_mult), luck: Number(p.luck), cash: cash.map(cashPayload), events: forPlayer(evs, p.id).map(evPayload) };
    let run; try { run = await db.createRun({ player_id: p.id, week, start_payload: payload, issued: [] }); }
    catch (e) { if (e.code === '23505') return bad(409, 'You already started this week.'); throw e; }
    await db.markCash(cash.map(c => c.id), run.id);
    return ok({ runId: run.id, week, cfg: enc(payload) });
  }

  if (op === 'sync') {
    const run = await db.run(String(body.runId || ''));
    if (!run || run.player_id !== p.id) return bad(404, 'Run not found.');
    if (run.status !== 'active') return ok({ none: true, status: run.status });
    const t = Number(body.t) || 0, patch = {};
    if (t < run.max_tick) patch.suspect = true; else patch.max_tick = t; // going backwards in time means a reloaded save
    const last = (run.issued || []).at(-1) || run.start_payload;
    const [cash, evs] = await Promise.all([db.pendingCash(p.id), db.events(run.week)]);
    const seen = deliveredIds(run), fresh = forPlayer(evs, p.id).filter(e => !seen.has(e.id));
    if (p.mods_ver === last.ver && !cash.length && !fresh.length) { await db.updateRun(run.id, patch); return ok({ none: true }); }
    const payload = { ver: p.mods_ver, vol: Number(p.vol_mult), luck: Number(p.luck), cash: cash.map(cashPayload), events: fresh.map(evPayload) };
    await db.updateRun(run.id, { ...patch, issued: [...(run.issued || []), payload] });
    await db.markCash(cash.map(c => c.id), run.id);
    return ok({ cfg: enc(payload) });
  }

  if (op === 'submit') {
    const run = await db.run(String(body.runId || ''));
    if (!run || run.player_id !== p.id) return bad(404, 'Run not found.');
    if (run.status !== 'active') return bad(409, 'This run was already submitted.');
    const actions = body.actions, claimed = Number(body.claimed);
    const reject = async reason => { await db.updateRun(run.id, { status: 'rejected', reject_reason: reason, submitted_at: new Date().toISOString(), actions: Array.isArray(actions) ? actions.slice(0, 5000) : null }); return bad(422, 'Your score could not be verified.', { reason }); };
    if (!Array.isArray(actions) || !actions.length || actions.length > 5000) return reject('Missing or oversized action log.');
    // god payloads in the log must be exactly what the server issued: the start payload first, then syncs
    const first = actions[0];
    if (!Array.isArray(first) || first[1] !== 'god' || first[0] !== startTick(run.week) || !same(first[2], run.start_payload)) return reject('Run did not start with the issued settings.');
    const pool = [...(run.issued || [])];
    for (const a of actions.slice(1)) if (Array.isArray(a) && a[1] === 'god') { const k = pool.findIndex(x => same(x, a[2])); if (k < 0) return reject('Unrecognised settings in log.'); pool.splice(k, 1); }
    let S; try { S = replayRun({ week: run.week }, actions); } catch (e) { return reject('Replay failed: ' + e.message); }
    const nw = netWorth(S).total;
    if (!Number.isFinite(claimed) || claimed !== nw) return reject(`Score mismatch (claimed ${claimed}, replay ${nw}).`);
    const pays = [run.start_payload, ...(run.issued || [])], evs = await db.events(run.week);
    const targeted = new Set(evs.filter(e => e.player_id).map(e => e.id));
    const rigged = pays.some(x => x.vol !== 1 || x.luck !== 0 || (x.cash || []).length || (x.events || []).some(e => targeted.has(e.id)));
    await db.updateRun(run.id, { status: 'submitted', final_nw: nw, ret: nw / START_CASH - 1, rigged, submitted_at: new Date().toISOString(), actions });
    const board = (await db.runs(run.week)).filter(r => r.status === 'submitted').sort((a, b) => Number(b.final_nw) - Number(a.final_nw));
    return ok({ ok: true, nw, ret: nw / START_CASH - 1, rank: board.findIndex(r => r.id === run.id) + 1, of: board.length });
  }
  return bad(404, 'Unknown request.');
}

// ---------------------------------------------------------------- admin (market god mode)
const clampN = (v, a, b) => Math.min(b, Math.max(a, Number(v)));
// ---- profile validation: the client is untrusted, so keep only known fields, with bounds
const int = (v, a, b, d = a) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
function cleanAvatar(a = {}) { a = a || {}; return { skin: int(a.skin, 0, 5), hair: int(a.hair, 0, 5), hairCol: int(a.hairCol, 0, 5), shirt: int(a.shirt, 0, 7), eyes: int(a.eyes, 0, 2) }; }
const ITEM_IDS = new Set(ITEMS.map(i => i.id)), TYPES = new Set(['buy', 'sell', 'short', 'cover']), TK = /^[A-Z]{2,5}$/;
function cleanProfile(pr = {}, prev = {}) {
  pr = pr || {};
  const c = pr.career && typeof pr.career === 'object' ? pr.career : prev?.career || {};
  const career = { nw: int(c.nw, -1e13, 1e13, 0), level: int(c.level, 0, LEVELS.length - 1), flex: int(c.flex, 0, 10000), items: (Array.isArray(c.items) ? c.items : []).filter(i => ITEM_IDS.has(i)).slice(0, 40), trades: int(c.trades, 0, 1e7), achievements: int(c.achievements, 0, 200), title: String(c.title || '').slice(0, 40) };
  const trades = (Array.isArray(pr.trades) ? pr.trades : []).filter(t => t && TYPES.has(t.type) && TK.test(t.ticker)).slice(-30)
    .map(t => ({ type: t.type, ticker: t.ticker, shares: int(t.shares, 1, 1e9), price: int(t.price, 1, 1e10), t: int(t.t, 0, 1e7), date: String(t.date || '').slice(0, 20), mode: t.mode === 'weekly' ? 'weekly' : 'career', pnl: t.pnl == null ? null : int(t.pnl, -1e13, 1e13) }));
  return { career, trades };
}
export async function handleAdmin(db, op, body = {}, headers = {}) {
  if (!adminOk(headers['x-admin-key'])) return bad(401, 'Wrong admin password.');
  body = body || {};
  const week = String(body.week || weekId()).slice(0, 10);
  const player = async () => { const x = await db.player(String(body.playerId || '')); if (!x) throw Object.assign(new Error('Player not found.'), { http: 404 }); return x; };
  try {
    switch (op) {
      case 'overview': {
        const [players, runs, evs, cash] = await Promise.all([db.players(), db.runs(week), db.events(week), db.cashList()]);
        const rm = new Map(runs.map(r => [r.player_id, r]));
        return ok({ week, players: players.map(x => { const r = rm.get(x.id); return { id: x.id, nickname: x.nickname, banned: x.banned, reason: x.ban_reason, vol: Number(x.vol_mult), luck: Number(x.luck), created: x.created_at, lastSeen: x.last_seen, locked: !!(x.locked_until && new Date(x.locked_until) > new Date()),
          run: r && { id: r.id, status: r.status, nw: r.final_nw && Number(r.final_nw), ret: r.ret, rigged: r.rigged, suspect: r.suspect, reason: r.reject_reason, started: r.started_at, submitted: r.submitted_at } }; }),
          events: evs, cash: cash.slice(0, 50) });
      }
      case 'companies': { const S = createWeekly(week); return ok({ week, companies: S.order.map(t => ({ ticker: t, name: S.companies[t].name, sector: S.companies[t].sector, price: S.companies[t].price })) }); }
      case 'mods': { const x = await player(); const vol = clampN(body.vol ?? x.vol_mult, 0.25, 4), luck = clampN(body.luck ?? x.luck, -1, 1); return ok({ player: await db.updatePlayer(x.id, { vol_mult: vol, luck, mods_ver: x.mods_ver + 1 }) }); }
      case 'ban': { const x = await player(); return ok({ player: await db.updatePlayer(x.id, { banned: !!body.banned, ban_reason: body.banned ? String(body.reason || '').slice(0, 200) : null }) }); }
      case 'unlock': { const x = await player(); return ok({ player: await db.updatePlayer(x.id, { failed_logins: 0, locked_until: null }) }); }
      case 'resetPin': { const x = await player(); if (!PIN_RE.test(String(body.pin))) return bad(400, 'PIN must be 4 digits.'); await db.updatePlayer(x.id, { pin_hash: hashPin(String(body.pin)), failed_logins: 0, locked_until: null }); return ok({ ok: true }); }
      case 'cash': { const x = await player(); const amt = Math.round(Number(body.amount) * 100); if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 1e12) return bad(400, 'Enter an amount in dollars, e.g. 5000 or -2500.'); return ok({ cash: await db.addCash(x.id, amt, String(body.note || '').slice(0, 200)) }); }
      case 'event': {
        const kind = String(body.kind); if (!['crash', 'boom', 'announce'].includes(kind)) return bad(400, 'Unknown event.');
        let mag = Number(body.magnitude); if (!Number.isFinite(mag)) return bad(400, 'Enter an impact.');
        mag = kind === 'announce' ? clampN(mag, -0.4, 0.4) : clampN(Math.abs(mag), 0.01, 0.4); if (Math.abs(mag) < 0.01) return bad(400, 'Impact must be at least 1%.');
        const row = { week, kind, magnitude: mag, game_day: body.day === '' || body.day == null ? null : clampN(body.day | 0, 0, WEEKLY_DAYS), player_id: body.playerId || null };
        if (kind === 'announce') {
          const S = createWeekly(week), t = String(body.ticker || '').toUpperCase(); if (!S.companies[t]) return bad(400, 'Pick a company.');
          Object.assign(row, { ticker: t, speaker: String(body.speaker || 'A Very Important Person').slice(0, 40), headline: String(body.headline || '').slice(0, 160) });
        }
        return ok({ event: await db.addEvent(row) });
      }
      case 'removeRun': { const r = await db.run(String(body.runId || '')); if (!r) return bad(404, 'Run not found.'); return ok({ run: await db.updateRun(r.id, { status: 'removed' }) }); }
      case 'resetRun': { const r = await db.run(String(body.runId || '')); if (!r) return bad(404, 'Run not found.'); await db.deleteRun(r.id); return ok({ ok: true }); }
      default: return bad(404, 'Unknown admin request.');
    }
  } catch (e) { if (e.http) return bad(e.http, e.message); throw e; }
}
