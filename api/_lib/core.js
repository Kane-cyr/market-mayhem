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

function evPayload(e) { return { id: e.id, kind: e.kind, mag: Number(e.magnitude), day: e.game_day ?? null, ticker: e.ticker || null, text: e.headline || null, who: e.speaker || null, ...(e.unit ? { unit: e.unit, amt: Number(e.amount), dur: e.duration_days ?? 0 } : {}) }; }
function cashPayload(c) { return { id: c.id, amount: Number(c.amount_cents), ...(c.note ? { note: String(c.note).slice(0, 200) } : {}) }; }
const forPlayer = (evs, pid) => evs.filter(e => !e.player_id || e.player_id === pid);
const deliveredIds = run => { const ids = new Set(); for (const p of [run.start_payload, ...(run.issued || [])]) for (const e of p.events || []) ids.add(e.id); return ids; };

const DUEL = 'duel-', CHAL = 'chal-';
const FORFEIT_MS = 3 * 864e5; // if one player finishes and the other has not after 3 days, the finisher wins
// One duel as seen by player `me`. The result is worked out from the two verified runs.
async function duelView(db, d, me) {
  const oppId = d.challenger === me ? d.opponent : d.challenger;
  const [opp, mine, theirs] = await Promise.all([db.player(oppId), db.runFor(me, DUEL + d.id), db.runFor(oppId, DUEL + d.id)]);
  const st = r => !r ? 'waiting' : r.status === 'submitted' ? 'done' : r.status === 'rejected' ? 'void' : 'playing';
  const view = { id: d.id, status: d.status, mine: d.challenger === me, opponent: opp?.nickname || '?', created: d.created_at, me: { state: st(mine) }, opp: { state: st(theirs) }, winner: null, result: null };
  if (d.status !== 'active') return view;
  if (mine?.status === 'submitted') Object.assign(view.me, { ret: mine.ret, nw: Number(mine.final_nw) });
  const a = view.me.state, b = view.opp.state;
  if (a === 'done' && b === 'done') { Object.assign(view.opp, { ret: theirs.ret, nw: Number(theirs.final_nw) }); view.winner = Math.abs(mine.ret - theirs.ret) < 1e-9 ? 'draw' : mine.ret > theirs.ret ? 'me' : 'opp'; view.result = 'done'; }
  else if (a === 'void' && b !== 'void') { view.winner = 'opp'; view.result = 'forfeit'; }
  else if (b === 'void' && a !== 'void') { view.winner = 'me'; view.result = 'forfeit'; }
  else if (d.accepted_at && Date.now() - new Date(d.accepted_at) > FORFEIT_MS && (a === 'done') !== (b === 'done')) { view.winner = a === 'done' ? 'me' : 'opp'; view.result = 'forfeit'; if (b === 'done') Object.assign(view.opp, { ret: theirs.ret, nw: Number(theirs.final_nw) }); }
  return view;
}
// A Market God challenge as seen by a player (or by the admin when me is null): everyone's progress, best first.
async function challengeView(db, c, me) {
  const [ids, runs, players] = await Promise.all([db.challengePlayers(c.id), db.runs(CHAL + c.id), db.players()]);
  const pm = new Map(players.map(x => [x.id, x])), rm = new Map(runs.filter(r => r.status !== 'removed').map(r => [r.player_id, r]));
  const rows = ids.map(id => { const r = rm.get(id); return { id, nickname: pm.get(id)?.nickname || '?', me: id === me, state: !r ? 'waiting' : r.status === 'submitted' ? 'done' : r.status === 'rejected' ? 'void' : 'playing', nw: r?.status === 'submitted' ? Number(r.final_nw) : null, ret: r?.status === 'submitted' ? r.ret : null }; });
  const sign = c.goal === 'least' ? 1 : -1;
  rows.sort((a, b) => (a.nw == null) - (b.nw == null) || sign * ((a.nw ?? 0) - (b.nw ?? 0)));
  return { id: c.id, title: c.title, goal: c.goal, startCash: Number(c.start_cash), prize: Number(c.prize), days: c.days, status: c.status, created: c.created_at,
    winner: c.winner ? pm.get(c.winner)?.nickname || '?' : null, rows: rows.map(({ id, ...r }) => (me === null ? { id, ...r } : r)) };
}
async function handleDuel(db, p, op, body) {
  if (op === 'duels') { const ds = await db.duelsFor(p.id); const views = await Promise.all(ds.slice(0, 30).map(d => duelView(db, d, p.id))); return ok({ duels: views }); }
  if (op === 'duel_create') {
    const x = await db.playerByNick(String(body.nick || '').trim()); if (!x || x.banned) return bad(404, 'No trader by that name.'); if (x.id === p.id) return bad(400, 'You cannot duel yourself.');
    const open = (await db.duelsFor(p.id)).filter(d => d.status === 'pending' || d.status === 'active');
    if (open.length >= 8) return bad(400, 'You have too many open duels. Finish or cancel some first.');
    if (open.some(d => (d.challenger === x.id || d.opponent === x.id))) return bad(409, `You already have an open duel with ${x.nickname}.`);
    const d = await db.createDuel(p.id, x.id); return ok({ duel: await duelView(db, d, p.id) });
  }
  const d = await db.duel(String(body.id || '')); if (!d || ![d.challenger, d.opponent].includes(p.id)) return bad(404, 'Duel not found.');
  if (op === 'duel_accept') {
    if (d.status !== 'pending' || d.opponent !== p.id) return bad(409, 'This duel cannot be accepted.');
    return ok({ duel: await duelView(db, await db.updateDuel(d.id, { status: 'active', accepted_at: new Date().toISOString() }), p.id) });
  }
  if (op === 'duel_decline') { // the challenger cancels, the opponent declines
    if (d.status !== 'pending') return bad(409, 'This duel has already started.');
    return ok({ duel: await duelView(db, await db.updateDuel(d.id, { status: d.challenger === p.id ? 'cancelled' : 'declined' }), p.id) });
  }
  return bad(404, 'Unknown request.');
}

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
    const { live: _live, ...pub } = x.profile || {};
    return ok({ nickname: x.nickname, avatar: x.avatar || {}, profile: pub, updated: x.profile_at, followers, following, me: viewer?.id === x.id,
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

  if (op === 'claim') { // career mode: money and events from the Market God reach a signed-in player without a ranked run
    const [cash, evs] = await Promise.all([db.pendingCash(p.id), db.events(weekId())]);
    const fresh = forPlayer(evs, p.id).filter(e => Date.now() - new Date(e.created_at) < 15 * 6e4);
    const reset = p.reset_ver || 0;
    if (!cash.length && !fresh.length) return ok({ none: true, reset });
    await db.claimCash(cash.map(c => c.id));
    return ok({ reset, cfg: enc({ cash: cash.map(cashPayload), events: fresh.map(evPayload) }) });
  }

  if (op === 'duels' || op === 'duel_create' || op === 'duel_accept' || op === 'duel_decline') return handleDuel(db, p, op, body);

  if (op === 'inbox') { // conversations, newest first, with unread counts
    const ms = await db.messagesFor(p.id), conv = new Map();
    for (const m of ms) { const other = m.sender === p.id ? m.recipient : m.sender; const c = conv.get(other) || { other, last: m, unread: 0 }; if (m.recipient === p.id && !m.read_at) c.unread++; conv.set(other, c); }
    const ps = new Map((await db.players()).map(x => [x.id, x]));
    const rows = [...conv.values()].filter(c => ps.get(c.other)).map(c => ({ nickname: ps.get(c.other).nickname, avatar: ps.get(c.other).avatar || {}, unread: c.unread, last: c.last.body.slice(0, 80), at: c.last.created_at, mine: c.last.sender === p.id }));
    return ok({ rows, unread: rows.reduce((a, r) => a + r.unread, 0) });
  }
  if (op === 'thread') {
    const x = await db.playerByNick(String(body.nick || '')); if (!x) return bad(404, 'No trader by that name.');
    const ms = await db.messagesBetween(p.id, x.id); await db.markRead(x.id, p.id);
    return ok({ nickname: x.nickname, avatar: x.avatar || {}, messages: ms.map(m => ({ mine: m.sender === p.id, body: m.body, at: m.created_at })) });
  }
  if (op === 'send') {
    const x = await db.playerByNick(String(body.nick || '').trim()); if (!x || x.banned) return bad(404, 'No trader by that name.'); if (x.id === p.id) return bad(400, 'You cannot message yourself.');
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 500); if (!text) return bad(400, 'Write something first.');
    if ((await db.recentSent(p.id, 60)) >= 15) return bad(429, 'Slow down. Too many messages in the last minute.');
    await db.addMessage(p.id, x.id, text); return ok({ ok: true });
  }
  if (op === 'challenges') { const cs = await db.challengesFor(p.id); return ok({ challenges: await Promise.all(cs.map(c => challengeView(db, c, p.id))) }); }
  if (op === 'start' && body.challenge) {
    const c = await db.challenge(String(body.challenge));
    if (!c || c.status !== 'open' || !(await db.challengePlayers(c.id)).includes(p.id)) return bad(404, 'That challenge is not open to you.');
    const week = CHAL + c.id, existing = await db.runFor(p.id, week);
    if (existing) {
      if (existing.status === 'active') return ok({ resume: true, runId: existing.id, week, days: c.days, startCash: Number(c.start_cash) });
      return ok({ finished: true, runId: existing.id, status: existing.status, nw: existing.final_nw && Number(existing.final_nw), ret: existing.ret, reason: existing.reject_reason, week });
    }
    // the challenge bankroll arrives as a Market God grant on top of the normal $10,000, so the replay check still works
    const extra = Number(c.start_cash) - START_CASH, payload = { ver: 0, vol: 1, luck: 0, cash: extra ? [{ id: 'chal', amount: extra, note: c.title }] : [], events: [] };
    let run; try { run = await db.createRun({ player_id: p.id, week, start_payload: payload, issued: [] }); }
    catch (e) { if (e.code === '23505') return bad(409, 'You already started this challenge.'); throw e; }
    return ok({ runId: run.id, week, cfg: enc(payload), challenge: c.id, days: c.days, startCash: Number(c.start_cash) });
  }
  if (op === 'start' && body.duel) {
    const d = await db.duel(String(body.duel));
    if (!d || ![d.challenger, d.opponent].includes(p.id) || d.status !== 'active') return bad(404, 'That duel is not open.');
    const week = DUEL + d.id, existing = await db.runFor(p.id, week);
    if (existing) {
      if (existing.status === 'active') return ok({ resume: true, runId: existing.id, week });
      return ok({ finished: true, runId: existing.id, status: existing.status, nw: existing.final_nw && Number(existing.final_nw), ret: existing.ret, reason: existing.reject_reason, week });
    }
    const payload = { ver: 0, vol: 1, luck: 0, cash: [], events: [] }; // duels are always a fair market
    let run; try { run = await db.createRun({ player_id: p.id, week, start_payload: payload, issued: [] }); }
    catch (e) { if (e.code === '23505') return bad(409, 'You already started this duel.'); throw e; }
    return ok({ runId: run.id, week, cfg: enc(payload), duel: d.id });
  }

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
    if (run.week.startsWith(DUEL) || run.week.startsWith(CHAL)) { await db.updateRun(run.id, patch); return ok({ none: true }); }
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
    const chal = run.week.startsWith(CHAL) ? await db.challenge(run.week.slice(CHAL.length)) : null;
    if (run.week.startsWith(CHAL) && (!chal || chal.status !== 'open')) return reject('This challenge has closed.');
    let S; try { S = replayRun({ week: run.week, days: chal?.days }, actions); } catch (e) { return reject('Replay failed: ' + e.message); }
    const nw = netWorth(S).total;
    if (!Number.isFinite(claimed) || claimed !== nw) return reject(`Score mismatch (claimed ${claimed}, replay ${nw}).`);
    const pays = [run.start_payload, ...(run.issued || [])], evs = await db.events(run.week);
    const targeted = new Set(evs.filter(e => e.player_id).map(e => e.id));
    const rigged = pays.some(x => x.vol !== 1 || x.luck !== 0 || (x.cash || []).length || (x.events || []).some(e => targeted.has(e.id)));
    const base = chal ? Number(chal.start_cash) : START_CASH;
    await db.updateRun(run.id, { status: 'submitted', final_nw: nw, ret: nw / base - 1, rigged: chal ? false : rigged, submitted_at: new Date().toISOString(), actions });
    const board = (await db.runs(run.week)).filter(r => r.status === 'submitted').sort((a, b) => Number(b.final_nw) - Number(a.final_nw));
    const out = { ok: true, nw, ret: nw / base - 1, rank: board.findIndex(r => r.id === run.id) + 1, of: board.length };
    if (run.week.startsWith(DUEL)) { const d = await db.duel(run.week.slice(DUEL.length)); if (d) out.duel = await duelView(db, d, p.id); }
    if (chal) out.challenge = await challengeView(db, chal, p.id);
    return ok(out);
  }
  return bad(404, 'Unknown request.');
}

// ---------------------------------------------------------------- admin (market god mode)
const clampN = (v, a, b) => Math.min(b, Math.max(a, Number(v)));
// ---- profile validation: the client is untrusted, so keep only known fields, with bounds
const int = (v, a, b, d = a) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
function cleanAvatar(a = {}) { a = a || {}; return { skin: int(a.skin, 0, 5), hair: int(a.hair, 0, 7), hairCol: int(a.hairCol, 0, 7), shirt: int(a.shirt, 0, 9), eyes: int(a.eyes, 0, 2), beard: int(a.beard, 0, 3), hat: int(a.hat, 0, 4), acc: int(a.acc, 0, 4), mouth: int(a.mouth, 0, 3), pants: int(a.pants, 0, 5) }; }
const ITEM_IDS = new Set(ITEMS.map(i => i.id)), TYPES = new Set(['buy', 'sell', 'short', 'cover']), TK = /^[A-Z]{2,5}$/;
function cleanProfile(pr = {}, prev = {}) {
  pr = pr || {};
  const c = pr.career && typeof pr.career === 'object' ? pr.career : prev?.career || {};
  const career = { nw: int(c.nw, -1e13, 1e13, 0), level: int(c.level, 0, LEVELS.length - 1), flex: int(c.flex, 0, 10000), items: (Array.isArray(c.items) ? c.items : []).filter(i => ITEM_IDS.has(i)).slice(0, 40), trades: int(c.trades, 0, 1e7), achievements: int(c.achievements, 0, 200), title: String(c.title || '').slice(0, 40) };
  const trades = (Array.isArray(pr.trades) ? pr.trades : []).filter(t => t && TYPES.has(t.type) && TK.test(t.ticker)).slice(-30)
    .map(t => ({ type: t.type, ticker: t.ticker, shares: int(t.shares, 1, 1e9), price: int(t.price, 1, 1e10), t: int(t.t, 0, 1e7), date: String(t.date || '').slice(0, 20), mode: t.mode === 'weekly' ? 'weekly' : 'career', pnl: t.pnl == null ? null : int(t.pnl, -1e13, 1e13) }));
  return { career, trades, live: cleanLive(pr.live) ?? prev?.live ?? null };
}
// Private snapshot of a player's game (cash, positions, loans, insider dealing) for the admin panel only.
// The client is untrusted, so keep plain data with bounded sizes; never shown to other players.
function cleanLive(x, depth = 0) {
  if (depth === 0) { if (!x || typeof x !== 'object' || Array.isArray(x)) return null; const out = cleanLive(x, 1); return JSON.stringify(out).length <= 60000 ? out : null; }
  if (x == null || typeof x === 'boolean') return x ?? null;
  if (typeof x === 'number') return Number.isFinite(x) ? Math.max(-1e15, Math.min(1e15, x)) : null;
  if (typeof x === 'string') return x.slice(0, 80);
  if (depth > 4) return null;
  if (Array.isArray(x)) return x.slice(0, 60).map(v => cleanLive(v, depth + 1));
  if (typeof x === 'object') { const o = {}; for (const k of Object.keys(x).slice(0, 40)) if (/^[A-Za-z0-9_]{1,24}$/.test(k)) o[k] = cleanLive(x[k], depth + 1); return o; }
  return null;
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
        return ok({ week, players: players.map(x => { const r = rm.get(x.id), lv = x.profile?.live; return { id: x.id, nickname: x.nickname, money: lv ? { nw: lv.nw, cash: lv.cash, debt: (lv.loans || []).reduce((a, l) => a + (Number(l?.owed) || 0), 0), mode: lv.mode, heat: lv.insider?.heat ?? 0, at: x.profile_at } : null, banned: x.banned, reason: x.ban_reason, vol: Number(x.vol_mult), luck: Number(x.luck), created: x.created_at, lastSeen: x.last_seen, locked: !!(x.locked_until && new Date(x.locked_until) > new Date()),
          run: r && { id: r.id, status: r.status, nw: r.final_nw && Number(r.final_nw), ret: r.ret, rigged: r.rigged, suspect: r.suspect, reason: r.reject_reason, started: r.started_at, submitted: r.submitted_at } }; }),
          events: evs, cash: cash.slice(0, 50) });
      }
      case 'reset': { // everyone (or the chosen players) starts a fresh career with $10,000
        const all = await db.players(), want = Array.isArray(body.playerIds) && body.playerIds.length ? new Set(body.playerIds.map(String)) : null;
        const targets = all.filter(x => !want || want.has(x.id));
        await Promise.all(targets.map(x => db.updatePlayer(x.id, { reset_ver: (x.reset_ver || 0) + 1 })));
        return ok({ reset: targets.length });
      }
      case 'challenge_create': {
        const title = String(body.title || '').trim().slice(0, 80), goal = body.goal === 'least' ? 'least' : 'most';
        const startCash = Math.round(Number(body.startCash) * 100), prize = Math.round(Number(body.prize || 0) * 100), days = Math.round(Number(body.days));
        if (!title) return bad(400, 'Give the challenge a name.');
        if (!Number.isFinite(startCash) || startCash < 100 || startCash > 1e15) return bad(400, 'Starting money must be between $1 and $10 trillion.');
        if (!Number.isFinite(prize) || prize < 0 || prize > 1e15) return bad(400, 'Prize must be between $0 and $10 trillion.');
        if (!(days >= 1 && days <= 24)) return bad(400, 'Length must be 1 to 24 game days.');
        const all = await db.players(), ids = [...new Set((Array.isArray(body.playerIds) ? body.playerIds : []).map(String))].filter(id => all.some(x => x.id === id));
        if (!ids.length) return bad(400, 'Pick at least one player.');
        const c = await db.createChallenge({ title, goal, start_cash: startCash, prize, days }, ids);
        return ok({ challenge: await challengeView(db, c, null) });
      }
      case 'challenges': { const cs = await db.challengesAll(); return ok({ challenges: await Promise.all(cs.slice(0, 30).map(c => challengeView(db, c, null))) }); }
      case 'challenge_close': { // ends the challenge and pays the prize to whoever is top among finished runs
        const c = await db.challenge(String(body.id || '')); if (!c) return bad(404, 'Challenge not found.'); if (c.status !== 'open') return bad(409, 'Already closed.');
        const v = await challengeView(db, c, null), top = v.rows.find(r => r.state === 'done');
        if (top && c.prize > 0) await db.addCash(top.id, Number(c.prize), `Prize for winning "${c.title}"`);
        await db.updateChallenge(c.id, { status: 'closed', winner: top?.id || null, closed_at: new Date().toISOString() });
        return ok({ winner: top?.nickname || null, prize: top ? Number(c.prize) : 0 });
      }
      case 'inspect': {
        const x = await player(); const [runs, duels] = await Promise.all([db.runs(), db.duelsFor(x.id)]);
        const names = new Map((await db.players()).map(q => [q.id, q.nickname]));
        return ok({ player: { id: x.id, nickname: x.nickname, created: x.created_at, lastSeen: x.last_seen, banned: x.banned, reason: x.ban_reason, vol: Number(x.vol_mult), luck: Number(x.luck) },
          career: x.profile?.career || null, trades: x.profile?.trades || [], live: x.profile?.live || null, updated: x.profile_at,
          runs: runs.filter(r => r.player_id === x.id).map(r => ({ week: r.week, status: r.status, nw: r.final_nw && Number(r.final_nw), ret: r.ret, rigged: r.rigged, started: r.started_at })).sort((a, b) => String(b.started).localeCompare(String(a.started))).slice(0, 30),
          duels: duels.slice(0, 30).map(d => ({ vs: names.get(d.challenger === x.id ? d.opponent : d.challenger) || '?', status: d.status, created: d.created_at })) });
      }
      case 'companies': { const S = createWeekly(week); return ok({ week, companies: S.order.map(t => ({ ticker: t, name: S.companies[t].name, sector: S.companies[t].sector, price: S.companies[t].price })) }); }
      case 'mods': { const x = await player(); const vol = clampN(body.vol ?? x.vol_mult, 0.25, 4), luck = clampN(body.luck ?? x.luck, -1, 1); return ok({ player: await db.updatePlayer(x.id, { vol_mult: vol, luck, mods_ver: x.mods_ver + 1 }) }); }
      case 'ban': { const x = await player(); return ok({ player: await db.updatePlayer(x.id, { banned: !!body.banned, ban_reason: body.banned ? String(body.reason || '').slice(0, 200) : null }) }); }
      case 'unlock': { const x = await player(); return ok({ player: await db.updatePlayer(x.id, { failed_logins: 0, locked_until: null }) }); }
      case 'resetPin': { const x = await player(); if (!PIN_RE.test(String(body.pin))) return bad(400, 'PIN must be 4 digits.'); await db.updatePlayer(x.id, { pin_hash: hashPin(String(body.pin)), failed_logins: 0, locked_until: null }); return ok({ ok: true }); }
      case 'cash': { const x = await player(); const amt = Math.round(Number(body.amount) * 100); if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > 1e12) return bad(400, 'Enter an amount in dollars, e.g. 5000 or -2500.'); return ok({ cash: await db.addCash(x.id, amt, String(body.note || '').trim().slice(0, 200)) }); }
      case 'event': {
        const kind = String(body.kind); if (!['crash', 'boom', 'announce'].includes(kind)) return bad(400, 'Unknown event.');
        const pump = kind === 'announce' && (body.unit === 'pct' || body.unit === 'usd'); // a stock pump: an amount, in dollars or percent, spread over some game days
        let mag = pump ? (Number(body.amount) >= 0 ? 0.12 : -0.12) : Number(body.magnitude); if (!Number.isFinite(mag)) return bad(400, 'Enter an impact.');
        mag = pump ? mag : kind === 'announce' ? clampN(mag, -0.4, 0.4) : clampN(Math.abs(mag), 0.01, 0.4); if (Math.abs(mag) < 0.01) return bad(400, 'Impact must be at least 1%.');
        if (pump) { const amt = Number(body.amount); if (!Number.isFinite(amt) || amt === 0) return bad(400, 'Enter an amount.'); if (body.unit === 'pct' && (amt < -90 || amt > 1000)) return bad(400, 'Percent must be between -90 and 1000.'); if (body.unit === 'usd' && Math.abs(amt) > 100000) return bad(400, 'Dollar amount is too large.'); }
        const row = { week, kind, magnitude: mag, game_day: body.day === '' || body.day == null ? null : clampN(body.day | 0, 0, WEEKLY_DAYS), player_id: body.playerId || null };
        if (kind === 'announce') {
          const S = createWeekly(week), t = String(body.ticker || '').toUpperCase(); if (!S.companies[t]) return bad(400, 'Pick a company.');
          if (pump) Object.assign(row, { unit: body.unit, amount: Number(body.amount), duration_days: clampN(Math.round(Number(body.duration) || 0), 0, 24) });
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
