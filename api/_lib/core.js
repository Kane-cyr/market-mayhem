// MARKET MAYHEM online: request handling, independent of Vercel so it can be tested directly.
// handleGame / handleAdmin take (db, op, body, headers) and return { status, body }.
import { createWeekly, replayRun, weekId } from './engine/game.js';
import { netWorth } from './engine/trading.js';
import { WEEKLY_DAYS } from './engine/game.js';
import { ITEMS } from './engine/lifestyle.js';
import { INFLUENCERS } from './engine/data/influencers.js';
import { LEVELS, levelFor } from './engine/progress.js';
import { createHash } from 'node:crypto';
import { NICK_RE, PIN_RE, MAX_FAILS, LOCK_MIN, hashPin, checkPin, makeToken, readToken, adminOk } from './auth.js';

const ok = body => ({ status: 200, body });
const bad = (status, error, extra = {}) => ({ status, body: { error, ...extra } });
const START_CASH = 1000000; // cents ($10,000)
const BIG = 1e40; // largest money value (cents) the server accepts; far beyond anything the game reaches
// Anti-cheat limits. The career game runs in the player's browser, so its numbers are self-reported.
const SEND_DAY_CAP = 100000000;              // $1,000,000 a day can be sent to other players
const GIFT_DAY_CAP = 5;                      // gifts a day, and each item at most once a day
const JUMP_X = 30, JUMP_MIN = 500000000; // backstop: a 30x jump of over $5,000,000 with no trades and nothing held
const dollars = c => '$' + Math.round(Number(c) / 100).toLocaleString('en-US');
// Per-IP limits on the doors people knock on: new accounts, wrong PINs (across all accounts, so one PIN cannot
// be tried on everyone) and wrong admin passwords. IPs are hashed before they are stored.
const LIMITS = { reg: [15, 60], fail: [30, 15], admin: [10, 15] }; // [attempts, minutes]
const ipKey = (kind, headers = {}) => { const ip = String(headers['x-real-ip'] || headers['x-vercel-forwarded-for'] || String(headers['x-forwarded-for'] || '').split(',')[0] || 'local').trim(); return kind + ':' + createHash('sha256').update('mm-rate|' + ip).digest('base64url').slice(0, 22); };
const overLimit = async (db, kind, headers) => { const [n, min] = LIMITS[kind]; return (await db.hitsSince(ipKey(kind, headers), new Date(Date.now() - min * 6e4).toISOString())) >= n; };
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64'); // light obfuscation; god settings are not shown in the game
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const startTick = (() => { const memo = {}; return w => (memo[w] ??= createWeekly(w).t); })();

function evPayload(e) { return { id: e.id, ...(e.late ? { late: true } : {}), kind: e.kind, mag: Number(e.magnitude), day: e.game_day ?? null, ticker: e.ticker || null, text: e.headline || null, who: e.speaker || null, ...(e.kind === 'setprice' ? { price: Number(e.amount) } : {}), ...(e.unit ? { unit: e.unit, amt: Number(e.amount), dur: e.duration_days ?? 0 } : {}) }; }
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
  const [ids, runs, players] = await Promise.all([db.challengePlayers(c.id), db.runs(CHAL + c.id), db.playersBrief()]);
  const pm = new Map(players.map(x => [x.id, x])), rm = new Map(runs.filter(r => r.status !== 'removed').map(r => [r.player_id, r]));
  const rows = ids.map(id => { const r = rm.get(id); return { id, nickname: pm.get(id)?.nickname || '?', me: id === me, state: !r ? 'waiting' : r.status === 'submitted' ? 'done' : r.status === 'rejected' ? 'void' : 'playing', nw: r?.status === 'submitted' ? Number(r.final_nw) : null, ret: r?.status === 'submitted' ? r.ret : null }; });
  const sign = c.goal === 'least' ? 1 : -1;
  rows.sort((a, b) => (a.nw == null) - (b.nw == null) || sign * ((a.nw ?? 0) - (b.nw ?? 0)));
  return { id: c.id, title: c.title, goal: c.goal, startCash: Number(c.start_cash), prize: Number(c.prize), days: c.days, status: c.status, created: c.created_at,
    winner: c.winner ? pm.get(c.winner)?.nickname || '?' : null, rows: rows.map(({ id, ...r }) => (me === null ? { id, ...r } : r)) };
}
// ---- the players' social feed. Posts that name a stock with a bullish or bearish stance, and the likes and
// reposts they get, are fed into the crowd flow, so a viral post moves that stock in everyone else's market.
const SOCIAL_W = { post: 0.004, like: 0.001, repost: 0.003, comment: 0.0005 };
const TICK_RE = /\$([A-Z]{2,5})\b/;
const BEEF = {
  sage: ['Young one, I have held shares longer than you have held opinions.', 'Patience beats noise. You are mostly noise.', 'I will be here in ten years. Will your portfolio?'],
  hype: ['Imagine fading me. Could not be you. Wait, it is you.', 'Ratio. Also I am up 400% this month, so.', 'Cope harder. We are going to the moon and you are not invited.'],
  quant: ['Your argument has a sample size of one: you.', 'I ran the numbers on your take. It is negative alpha.', 'Correlation: you talking, my P/L going up.'],
};
const beefLine = (inf, said) => { const pool = BEEF[inf.voice] || ['Interesting take. Wrong, but interesting.', 'Who are you again?', 'Bold words from someone with your returns.', 'I will remember this when you are buying my bags.']; return pool[(said.length + inf.id.length) % pool.length]; };
function mentions(text) { const t = text.toLowerCase(); return INFLUENCERS.filter(i => t.includes('@' + i.handle.toLowerCase()) || (i.name.length > 4 && t.includes('@' + i.name.toLowerCase().split(' ')[0]))); }
async function beef(db, p, post, text) { // a tagged influencer replies, and their followers pile in against your call
  for (const inf of mentions(text).slice(0, 2)) {
    await db.addComment(post.id, null, beefLine(inf, text), `${inf.name} @${inf.handle}`);
    if (post.ticker && post.stance) await db.addFlows([{ player_id: p.id, ticker: post.ticker, frac: -post.stance * 0.003 * Math.min(3, inf.followers / 300000) }]);
  }
}
async function socialFlow(db, pid, post, kind) { if (post?.ticker && post.stance) await db.addFlows([{ player_id: pid, ticker: post.ticker, frac: post.stance * SOCIAL_W[kind] }]); }
async function feedView(db, me, posts) {
  const ids = posts.map(x => x.id).concat(posts.map(x => x.repost_of).filter(Boolean));
  const [players, stats, orig] = await Promise.all([db.playersBrief(), db.postStats(ids, me), db.postsByIds(posts.map(x => x.repost_of).filter(Boolean))]);
  const pm = new Map(players.map(x => [x.id, x])), om = new Map(orig.map(x => [x.id, x]));
  const one = x => { const a = pm.get(x.author), st = stats[x.id] || {}; return { id: x.id, nickname: a?.nickname || '?', avatar: a?.avatar || {}, mine: x.author === me, body: x.body, ticker: x.ticker, stance: x.stance, at: x.created_at, edited: !!x.edited_at, likes: st.likes || 0, liked: !!st.liked, comments: st.comments || 0, reposts: st.reposts || 0 }; };
  return posts.filter(x => pm.get(x.author) && !pm.get(x.author).banned).map(x => ({ ...one(x), repost: x.repost_of && om.get(x.repost_of) ? one(om.get(x.repost_of)) : null }));
}
async function handleSocial(db, p, op, body) {
  const text = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  if (op === 'sfeed') { const posts = await db.posts(Number(body.before) || null, 50); return ok({ posts: await feedView(db, p.id, posts) }); }
  if (op === 'post') {
    const b = text(body.body); if (!b) return bad(400, 'Write something first.');
    if ((await db.recentPosts(p.id, 60)) >= 5) return bad(429, 'Slow down. Five posts a minute is plenty.');
    const tk = (String(body.ticker || '').toUpperCase().match(/^[A-Z]{2,5}$/) || b.match(TICK_RE)?.slice(1) || [null])[0];
    const stance = tk ? Math.max(-1, Math.min(1, Math.round(Number(body.stance) || 0))) : 0;
    const post = await db.addPost({ author: p.id, body: b, ticker: tk, stance }); await socialFlow(db, p.id, post, 'post'); await beef(db, p, post, b); return ok({ ok: true });
  }
  if (op === 'announce') { // a company owner's announcement: a post that hits the named stock harder than a normal post
    const own = String(body.company || '').toUpperCase(), tk = String(body.ticker || '').toUpperCase(), stance = Math.sign(Number(body.stance) || 0), mag = Math.max(0.002, Math.min(0.02, Number(body.mag) || 0.01));
    if (!(p.profile?.live?.empire || []).includes(own)) return bad(403, 'You can only make announcements for companies you own.');
    if (!/^[A-Z]{2,5}$/.test(tk) || !stance) return bad(400, 'Pick a stock and which way it moves.');
    const b = text(body.body); if (!b) return bad(400, 'Write the announcement.');
    if ((await db.recentPosts(p.id, 60)) >= 5) return bad(429, 'Slow down.');
    await db.addPost({ author: p.id, body: b, ticker: tk, stance }); await db.addFlows([{ player_id: p.id, ticker: tk, frac: stance * mag }]);
    return ok({ ok: true });
  }
  const post = await db.post(Number(body.id)); if (!post) return bad(404, 'That post is gone.');
  if (op === 'post_edit') {
    if (post.author !== p.id) return bad(403, 'You can only edit your own posts.');
    const b = text(body.body); if (!b) return bad(400, 'Write something first.');
    await db.updatePost(post.id, { body: b, edited_at: new Date().toISOString() }); return ok({ ok: true });
  }
  if (op === 'post_delete') { if (post.author !== p.id) return bad(403, 'You can only delete your own posts.'); await db.deletePost(post.id); return ok({ ok: true }); }
  if (op === 'like') { const on = !!body.on; const changed = await db.setLike(post.id, p.id, on); if (changed && on) await socialFlow(db, p.id, post, 'like'); return ok({ ok: true }); }
  if (op === 'repost') {
    if (post.author === p.id) return bad(400, 'You cannot repost yourself.');
    const src = post.repost_of ? (await db.post(post.repost_of)) || post : post;
    if ((await db.recentPosts(p.id, 60)) >= 5) return bad(429, 'Slow down.');
    await db.addPost({ author: p.id, body: text(body.body) || '🔁', ticker: src.ticker, stance: src.stance, repost_of: src.id }); await socialFlow(db, p.id, src, 'repost'); return ok({ ok: true });
  }
  if (op === 'comment') { const b = text(body.body); if (!b) return bad(400, 'Write something first.'); await db.addComment(post.id, p.id, b); await socialFlow(db, p.id, post, 'comment'); if ((await db.comments(post.id)).filter(c => c.npc).length < 6) await beef(db, p, post, b); return ok({ ok: true }); }
  if (op === 'comments') {
    const [cs, players] = await Promise.all([db.comments(post.id), db.playersBrief()]); const pm = new Map(players.map(x => [x.id, x]));
    return ok({ comments: cs.map(c => ({ nickname: c.npc || pm.get(c.author)?.nickname || '?', npc: !!c.npc, body: c.body, at: c.created_at, mine: c.author === p.id })) });
  }
  return bad(404, 'Unknown request.');
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
      if (await overLimit(db, 'reg', headers)) return bad(429, 'Too many new accounts from your connection. Try again in an hour.');
      try { const p = await db.createPlayer(nick, hashPin(pin)); await db.hit(ipKey('reg', headers)); return ok({ token: makeToken(p.id), nickname: p.nickname }); }
      catch (e) { if (e.code === '23505') return bad(409, 'That nickname is taken.'); throw e; }
    }
    if (await overLimit(db, 'fail', headers)) return bad(429, 'Too many wrong PINs from your connection. Try again in 15 minutes.');
    const p = await db.playerByNick(nick); if (!p) { await db.hit(ipKey('fail', headers)); return bad(401, 'Wrong nickname or PIN.'); }
    if (p.locked_until && new Date(p.locked_until) > new Date()) return bad(429, 'Too many wrong PINs. Try again in a few minutes.');
    if (!checkPin(pin, p.pin_hash)) {
      const f = (p.failed_logins || 0) + 1;
      await db.updatePlayer(p.id, f >= MAX_FAILS ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MIN * 6e4).toISOString() } : { failed_logins: f });
      await db.hit(ipKey('fail', headers));
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
    const { live: _live, audit: _audit, ...rest } = x.profile || {}, flagged = !!x.profile?.audit?.flag && viewer?.id !== x.id; // they still see their own numbers
    const pub = flagged ? { ...rest, career: null, trades: [], unverified: true } : rest; // flagged numbers are not shown to other players
    return ok({ nickname: x.nickname, avatar: x.avatar || {}, profile: pub, updated: x.profile_at, followers, following, me: viewer?.id === x.id,
      weekly: run && run.status === 'submitted' ? { nw: Number(run.final_nw), ret: run.ret } : null });
  }
  if (op === 'players') { // public: trader directory
    const ps = (await db.playersCareer()).filter(x => !x.banned).map(x => ({ nickname: x.nickname, avatar: x.avatar || {}, nw: x.flag ? null : x.career?.nw ?? null, level: x.flag ? 0 : x.career?.level ?? 0, flex: x.flag ? 0 : x.career?.flex ?? 0, seen: x.last_seen }));
    ps.sort((a, b) => (b.nw ?? -1) - (a.nw ?? -1)); return ok({ rows: ps.slice(0, 200) });
  }
  if (op === 'board') {
    const week = String(body.week || weekId()).slice(0, 10);
    const [runs, players] = await Promise.all([db.runs(week), db.playersBrief()]);
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
    profile.career = verifyCareer(profile.career, p.profile?.career);
    profile.audit = await audit(db, p, profile);
    await db.setProfile(p.id, avatar, profile); return ok({ ok: true });
  }
  if (op === 'follow') {
    const x = await db.playerByNick(String(body.nick || '')); if (!x) return bad(404, 'No trader by that name.'); if (x.id === p.id) return bad(400, 'You cannot follow yourself.');
    if (body.on && (await db.following(p.id)).length >= 200) return bad(400, 'You follow enough people already.');
    await db.follow(p.id, x.id, !!body.on); return ok({ ok: true, following: !!body.on });
  }
  if (op === 'feed') { // recent trades by everyone you follow
    const ids = await db.following(p.id); const rows = [];
    for (const id of ids.slice(0, 200)) { const x = await db.player(id); if (!x || x.banned || x.profile?.audit?.flag) continue; for (const t of (x.profile?.trades || []).slice(-15)) rows.push({ ...t, nickname: x.nickname, avatar: x.avatar || {}, at: x.profile_at }); }
    rows.sort((a, b) => (new Date(b.at) - new Date(a.at)) || (b.t - a.t)); return ok({ rows: rows.slice(0, 80), following: ids.length });
  }
  if (op === 'me') { const run = await db.runFor(p.id, weekId()); return ok({ nickname: p.nickname, week: weekId(), run: run && { id: run.id, status: run.status, nw: run.final_nw && Number(run.final_nw), ret: run.ret, reason: run.reject_reason } }); }

  if (op === 'claim') { // career mode: money and events from the Market God reach a signed-in player without a ranked run
    // events: everything newer than the last one this game has applied (so nothing is missed while offline or
    // during an update); a brand-new game only gets the last 15 minutes. Older ones are marked late: they move
    // prices but skip the cutscene and its 10-second trading pause.
    const after = Number.isInteger(body.after) && body.after >= 0 ? body.after : null;
    const [cash, evs] = await Promise.all([db.pendingCash(p.id), after != null ? db.eventsAfter(after) : db.events(weekId())]);
    const fresh = forPlayer(evs, p.id).filter(e => after != null ? e.id > after : Date.now() - new Date(e.created_at) < 15 * 6e4)
      .map(e => Date.now() - new Date(e.created_at) > 3 * 6e4 ? { ...e, late: true } : e);
    const reset = p.reset_ver || 0, gifts = await db.claimGifts(p.id);
    const gv = gifts.map(g => ({ id: g.id, item: g.item_id, paid: Number(g.paid), from: g.from }));
    const got = cash.length ? await db.claimCash(cash.map(c => c.id)) : []; // another tab may have taken some of these a moment ago
    if (!got.length && !fresh.length) return ok({ none: true, reset, gifts: gv });
    return ok({ reset, gifts: gv, cfg: enc({ cash: got.map(cashPayload), events: fresh.map(evPayload) }) });
  }

  if (op === 'duels' || op === 'duel_create' || op === 'duel_accept' || op === 'duel_decline') return handleDuel(db, p, op, body);

  if (['sfeed', 'announce', 'post', 'post_edit', 'post_delete', 'like', 'repost', 'comment', 'comments'].includes(op)) return handleSocial(db, p, op, body);
  if (op === 'rugpull') { // dump everything and crash the stock in every other player's market
    const tk = String(body.ticker || '').toUpperCase(); if (!/^[A-Z]{2,5}$/.test(tk)) return bad(400, 'Pick a stock.');
    const size = Math.max(0.4, Math.min(1, Number(body.size) || 1));
    await db.addFlows([{ player_id: p.id, ticker: tk, frac: -size }]);
    await db.addPost({ author: p.id, body: `🧶 RUG PULL. I just dumped my entire $${tk} bag. Good luck, everyone.`, ticker: tk, stance: -1 });
    return ok({ ok: true });
  }
  if (op === 'crowd') { // everyone's career trades push prices for everyone else: report yours, collect theirs
    const fl = body.flows && typeof body.flows === 'object' ? Object.entries(body.flows).slice(0, 60) : [];
    const rows = fl.filter(([t, v]) => /^[A-Z]{2,5}$/.test(t) && Number.isFinite(Number(v)) && Number(v) !== 0).map(([t, v]) => ({ player_id: p.id, ticker: t, frac: Math.max(-1, Math.min(1, Number(v))) }));
    if (rows.length) await db.addFlows(rows);
    const now = new Date(), since = new Date(Math.max(Date.parse(body.since) || 0, now - 15 * 6e4));
    const sum = {}; for (const f of await db.flowsSince(since.toISOString(), p.id)) sum[f.ticker] = (sum[f.ticker] || 0) + Number(f.frac);
    if (Math.random() < 0.02) db.pruneFlows(new Date(now - 864e5).toISOString()).catch(() => {});
    return ok({ now: now.toISOString(), crowd: sum });
  }
  if (op === 'inbox') { // conversations, newest first, with unread counts
    const ms = await db.messagesFor(p.id), conv = new Map();
    for (const m of ms) { const other = m.sender === p.id ? m.recipient : m.sender; const c = conv.get(other) || { other, last: m, unread: 0 }; if (m.recipient === p.id && !m.read_at) c.unread++; conv.set(other, c); }
    const ps = new Map((await db.playersBrief()).map(x => [x.id, x]));
    const rows = [...conv.values()].filter(c => ps.get(c.other)).map(c => ({ nickname: ps.get(c.other).nickname, avatar: ps.get(c.other).avatar || {}, unread: c.unread, last: c.last.body.slice(0, 80), at: c.last.created_at, mine: c.last.sender === p.id }));
    return ok({ rows, unread: rows.reduce((a, r) => a + r.unread, 0) });
  }
  if (op === 'thread') {
    const x = await db.playerByNick(String(body.nick || '')); if (!x) return bad(404, 'No trader by that name.');
    const ms = await db.messagesBetween(p.id, x.id); await db.markRead(x.id, p.id);
    return ok({ nickname: x.nickname, avatar: x.avatar || {}, messages: ms.map(m => ({ mine: m.sender === p.id, body: m.body, at: m.created_at, seen: m.sender === p.id && !!m.read_at })) });
  }
  if (op === 'send_money') { // career cash from one player to another, checked against the sender's last snapshot
    const x = await db.playerByNick(String(body.nick || '').trim()); if (!x || x.banned) return bad(404, 'No trader by that name.'); if (x.id === p.id) return bad(400, 'You cannot pay yourself.');
    const amt = Math.round(Number(body.amount)); if (!Number.isInteger(amt) || amt < 100) return bad(400, 'Send at least $1.');
    const live = p.profile?.live; if (!live || live.mode !== 'career') return bad(400, 'Open your career game first, then try again.');
    if (amt > Number(live.cash || 0)) return bad(400, 'You do not have that much cash.');
    if (p.profile?.audit?.flag) return bad(403, 'Your account is under review, so sending money is paused. The Market God will look at it.');
    const sent = await db.sentSince(p.id, new Date(Date.now() - 864e5).toISOString()), left = Math.max(0, SEND_DAY_CAP - sent);
    if (amt > left) return bad(400, left > 0 ? `You can send up to ${dollars(SEND_DAY_CAP)} a day. You have ${dollars(left)} left today.` : `You have sent your ${dollars(SEND_DAY_CAP)} for today. Try again tomorrow.`);
    const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    await db.addCash(x.id, amt, `${p.nickname} sent you money${note ? ': ' + note : ''}`, p.id);
    await db.setProfile(p.id, p.avatar || {}, { ...p.profile, live: { ...live, cash: Number(live.cash) - amt } });
    await db.addMessage(p.id, x.id, `💸 Sent you $${(amt / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}${note ? ' · ' + note : ''}`);
    return ok({ ok: true });
  }
  if (op === 'send_gift') {
    const x = await db.playerByNick(String(body.nick || '').trim()); if (!x || x.banned) return bad(404, 'No trader by that name.'); if (x.id === p.id) return bad(400, 'You cannot gift yourself.');
    const it = ITEMS.find(i => i.id === String(body.item)); if (!it) return bad(400, 'That is not a real item.');
    if (!(p.profile?.career?.items || []).includes(it.id)) return bad(400, 'You do not own that item.');
    if (p.profile?.audit?.flag) return bad(403, 'Your account is under review, so sending gifts is paused. The Market God will look at it.');
    const recent = await db.giftsSince(p.id, new Date(Date.now() - 864e5).toISOString());
    if (recent.length >= GIFT_DAY_CAP) return bad(400, `You can send ${GIFT_DAY_CAP} gifts a day. Try again tomorrow.`);
    if (recent.some(g => g.item_id === it.id)) return bad(400, `You already gave away a ${it.name} today. Buy another one tomorrow.`);
    await db.addGift(p.id, x.id, it.id, it.price); // valued at the shop price; the sender's own figure is ignored
    await db.addMessage(p.id, x.id, `🎁 Sent you a gift: ${it.name}`);
    return ok({ ok: true });
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
    const payload = { ver: p.mods_ver, vol: Number(p.vol_mult), luck: Number(p.luck), cash: [], events: forPlayer(evs, p.id).map(evPayload) };
    let run; try { run = await db.createRun({ player_id: p.id, week, start_payload: payload, issued: [] }); }
    catch (e) { if (e.code === '23505') return bad(409, 'You already started this week.'); throw e; }
    const got = cash.length ? await db.markCash(cash.map(c => c.id), run.id) : [];
    if (got.length) { payload.cash = got.map(cashPayload); await db.updateRun(run.id, { start_payload: payload }); }
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
    const got = cash.length ? await db.markCash(cash.map(c => c.id), run.id) : [];
    if (p.mods_ver === last.ver && !got.length && !fresh.length) { await db.updateRun(run.id, patch); return ok({ none: true }); }
    const payload = { ver: p.mods_ver, vol: Number(p.vol_mult), luck: Number(p.luck), cash: got.map(cashPayload), events: fresh.map(evPayload) };
    await db.updateRun(run.id, { ...patch, issued: [...(run.issued || []), payload] });
    return ok({ cfg: enc(payload) });
  }

  if (op === 'submit') {
    const run = await db.run(String(body.runId || ''));
    if (!run || run.player_id !== p.id) return bad(404, 'Run not found.');
    if (run.status !== 'active') return bad(409, 'This run was already submitted.');
    const actions = body.actions, claimed = Number(body.claimed);
    const reject = async reason => { await db.updateRun(run.id, { status: 'rejected', reject_reason: reason, submitted_at: new Date().toISOString(), actions: Array.isArray(actions) ? actions.slice(0, 5000) : null }); return bad(422, 'Your score could not be verified.', { reason }); };
    if (!Array.isArray(actions) || !actions.length || actions.length > 20000) return reject('Missing or oversized action log.');
    // god payloads in the log must be exactly what the server issued: the start payload first, then syncs
    const first = actions[0];
    if (!Array.isArray(first) || first[1] !== 'god' || first[0] !== startTick(run.week) || !same(first[2], run.start_payload)) return reject('Run did not start with the issued settings.');
    const pool = [...(run.issued || [])];
    for (const a of actions.slice(1)) if (Array.isArray(a) && a[1] === 'god') { const k = pool.findIndex(x => same(x, a[2])); if (k < 0) return reject('Unrecognised settings in log.'); pool.splice(k, 1); }
    const chal = run.week.startsWith(CHAL) ? await db.challenge(run.week.slice(CHAL.length)) : null;
    if (run.week.startsWith(CHAL) && (!chal || chal.status !== 'open')) return reject('This challenge has closed.');
    // runs started before trading went fee-free are checked against the old rules too
    let S, nw; try { S = replayRun({ week: run.week, days: chal?.days }, actions); nw = netWorth(S).total; } catch (e) { S = null; nw = NaN; var replayErr = e; }
    if (nw !== claimed) { try { const L = replayRun({ week: run.week, days: chal?.days }, actions, { legacyFees: true }), lnw = netWorth(L).total; if (lnw === claimed) { S = L; nw = lnw; } } catch { /* keep the first result */ } }
    if (!S) return reject('Replay failed: ' + (replayErr?.message || 'unknown'));
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
// Flags a career upload whose net worth or cash grew faster than the game allows, after allowing for money the
// server itself handed over (Market God, other players) and for recent Market God events that move prices.
// A flag stays until the Market God clears it; flagged players are hidden from the trader list and cannot send.
// Anti-cheat, judged on trades rather than on how fast someone gets rich (fast legitimate play is fine).
// Each career upload carries the game time and the price of every stock the player trades or holds. The server
// remembers the last price it saw for each stock in that player's market; a price that rose further than the market
// can move in the game time that passed is flagged. Market God events and other players' pumps or rug pulls on a
// stock skip the check for it; going back in time (a reset or an older save) starts the record afresh. A balance
// that appears with no trades and no holdings at all (typed into the console) is flagged too.
// MOVE_LOG: the largest real rise, as a natural log, measured in the game's own market over N game days.
const MOVE_LOG = [[1, 1.177], [2, 1.524], [5, 2.397], [10, 3.015], [30, 4.477], [90, 8.161]]; // measured over 12 game years in 3 markets (GigaChad Coin)
function maxRise(days) {
  const d = Math.max(days, 1 / 6); let prev = [0, 0];
  for (const [n, v] of MOVE_LOG) { if (d <= n) return prev[1] + (v - prev[1]) * (d - prev[0]) / (n - prev[0]); prev = [n, v]; }
  const [n, v] = MOVE_LOG.at(-1); return v * d / n;
}
const allowedRise = days => maxRise(days) * 1.5 + 0.7; // generous margin: about 2x on top of the biggest real move
async function audit(db, p, profile) {
  const prev = p.profile?.audit || {}, now = Date.now(), live = profile.live?.mode === 'career' ? profile.live : null;
  const nw = Math.max(Number(profile.career?.nw) || 0, Number(live?.cash) || 0);
  const keep = { last: nw, t: live ? Number(live.t) || 0 : prev.t ?? 0, held: !!(live && ((live.holdings || []).length || (live.shorts || []).length)), at: now };
  if (prev.flag) return { ...prev, ...keep, flag: prev.flag };
  if (!live) return { ...prev, ...keep };
  const t = Number(live.t) || 0, backInTime = prev.t != null && t < Number(prev.t) - 6;
  const prices = backInTime ? {} : { ...(prev.prices || {}) };
  // what is new since the last upload: trades after the last game time seen, then current holdings and shorts
  const lastT = backInTime ? -1 : Number(prev.t ?? -1);
  const obs = [];
  for (const tr of profile.trades || []) if (tr.mode === 'career' && Number(tr.t) >= lastT && Number(tr.t) <= t) obs.push({ tk: tr.ticker, t: Number(tr.t), px: Number(tr.price), what: tr.type });
  for (const h of [...(live.holdings || []), ...(live.shorts || [])]) if (h && /^[A-Z]{2,5}$/.test(h.tk) && Number(h.px) > 0) obs.push({ tk: h.tk, t, px: Number(h.px), what: 'held' });
  obs.sort((a, b) => a.t - b.t);
  const since = new Date(Math.min(now - 15 * 6e4, Number(prev.at) || now - 15 * 6e4) - 5 * 6e4).toISOString();
  const [credits, evs, flows] = await Promise.all([db.creditsSince(p.id, since), db.events(weekId()), db.flowsSince(since, p.id)]);
  const recentEvs = forPlayer(evs, p.id).filter(e => new Date(e.created_at) > new Date(since));
  const pumped = {}; for (const f of flows) if (Number(f.frac) > 0) pumped[f.ticker] = (pumped[f.ticker] || 0) + Number(f.frac); // other players' buying pushes prices up (at most +25% per 20 s)
  for (const k in pumped) if (pumped[k] < 0.01) delete pumped[k];
  const marketWide = recentEvs.some(e => !e.ticker), excused = new Set([...recentEvs.filter(e => e.ticker).map(e => e.ticker), ...Object.keys(pumped)]);
  let flag = null;
  for (const o of obs) {
    const ref = prices[o.tk];
    if (ref && o.t >= ref[0] && !marketWide && !excused.has(o.tk)) {
      const days = (o.t - ref[0]) / 6, rise = Math.log(o.px / ref[1]);
      if (rise > allowedRise(days) && !flag) flag = { at: new Date(now).toISOString(), tk: o.tk, from: ref[1], to: o.px, days: Math.round(days * 10) / 10,
        why: `${o.tk} ${o.what === 'held' ? 'was priced' : o.what === 'sell' || o.what === 'cover' ? 'was sold' : 'was traded'} at ${dollars(o.px)}, up from ${dollars(ref[1])} ${days < 1 ? 'the same day' : `${Math.round(days * 10) / 10} game days earlier`}. The market cannot move that fast.` };
    }
    if (!ref || o.t >= ref[0]) prices[o.tk] = [o.t, o.px];
  }
  // the whole portfolio cannot grow faster than the most volatile stock could carry it, even fully borrowed (4x)
  const touched = new Set([...(prev.heldTk || []), ...obs.map(o => o.tk)]);
  const godTouched = recentEvs.some(e => !e.ticker || touched.has(e.ticker)); // a Market God event moved something this player owns or trades
  const heldExcused = godTouched;
  const crowdGrow = Object.keys(pumped).length ? Math.pow(1.25, Math.min(90, Math.ceil((now - (Number(prev.at) || now)) / 20000) + 1)) : 1;
  if (!flag && !backInTime && prev.t != null && prev.last != null && !marketWide && !heldExcused) {
    const days = Math.max(0, (t - Number(prev.t)) / 6), from = Math.max(START_CASH, Number(prev.last) || 0), grow = 4 * Math.exp(allowedRise(days)) * crowdGrow;
    if (nw > from * grow + credits * grow && nw - from > JUMP_MIN)
      flag = { at: new Date(now).toISOString(), from, to: nw, days: Math.round(days * 10) / 10, why: `Net worth went from ${dollars(from)} to ${dollars(nw)} in ${days < 1 ? 'under a game day' : Math.round(days * 10) / 10 + ' game days'}, faster than any stock in the market could carry it.` };
  }
  // money out of nowhere: a big jump with no trades since the last upload and no holdings before or after
  const base = Math.max(START_CASH, Number(prev.last) || Number(p.profile?.career?.nw) || START_CASH);
  if (!flag && !backInTime && !godTouched && prev.t != null && !obs.some(o => o.what !== 'held') && !prev.held && !keep.held && nw > Math.max(base * JUMP_X, base + JUMP_MIN) + credits * JUMP_X)
    flag = { at: new Date(now).toISOString(), from: base, to: nw, why: `Money went from ${dollars(base)} to ${dollars(nw)} with no trades and nothing held.` };
  const tks = Object.keys(prices); if (tks.length > 120) for (const k of tks.sort((a, b) => prices[a][0] - prices[b][0]).slice(0, tks.length - 120)) delete prices[k];
  const heldTk = [...new Set([...(live.holdings || []), ...(live.shorts || [])].map(h => h?.tk).filter(Boolean))].slice(0, 60);
  return { ...keep, prices, heldTk, flag };
}
// The browser reports career stats; keep the ones the server can check consistent with each other.
// Levels only ever go up in the game, so a level may rise only as far as the reported net worth allows and an
// earned level is never taken away. Flex (bragging points) is recomputed from the items owned.
const ITEM_FLEX = new Map(ITEMS.map(i => [i.id, Number(i.flex) || 0]));
function verifyCareer(c, prev) {
  if (!c) return c;
  const earned = Math.max(Number(prev?.level) || 0, levelFor(Math.max(0, Number(c.nw) || 0)));
  return { ...c, level: Math.min(Number(c.level) || 0, earned), flex: (c.items || []).reduce((a, id) => a + (ITEM_FLEX.get(id) || 0), 0) };
}
function cleanProfile(pr = {}, prev = {}) {
  pr = pr || {};
  const c = pr.career && typeof pr.career === 'object' ? pr.career : prev?.career || {};
  const career = { nw: int(c.nw, -BIG, BIG, 0), level: int(c.level, 0, LEVELS.length - 1), flex: int(c.flex, 0, 10000), items: (Array.isArray(c.items) ? c.items : []).filter(i => ITEM_IDS.has(i)).slice(0, 40), trades: int(c.trades, 0, 1e7), achievements: int(c.achievements, 0, 200), title: String(c.title || '').slice(0, 40) };
  const trades = (Array.isArray(pr.trades) ? pr.trades : []).filter(t => t && TYPES.has(t.type) && TK.test(t.ticker)).slice(-30)
    .map(t => ({ type: t.type, ticker: t.ticker, shares: int(t.shares, 1, 1e300), price: int(t.price, 1, 1e300), t: int(t.t, 0, 1e7), date: String(t.date || '').slice(0, 20), mode: t.mode === 'weekly' ? 'weekly' : 'career', pnl: t.pnl == null ? null : int(t.pnl, -BIG, BIG) }));
  return { career, trades, live: cleanLive(pr.live) ?? prev?.live ?? null };
}
// Private snapshot of a player's game (cash, positions, loans, insider dealing) for the admin panel only.
// The client is untrusted, so keep plain data with bounded sizes; never shown to other players.
function cleanLive(x, depth = 0) {
  if (depth === 0) { if (!x || typeof x !== 'object' || Array.isArray(x)) return null; const out = cleanLive(x, 1); return JSON.stringify(out).length <= 60000 ? out : null; }
  if (x == null || typeof x === 'boolean') return x ?? null;
  if (typeof x === 'number') return Number.isFinite(x) ? Math.max(-BIG, Math.min(BIG, x)) : null;
  if (typeof x === 'string') return x.slice(0, 80);
  if (depth > 4) return null;
  if (Array.isArray(x)) return x.slice(0, 60).map(v => cleanLive(v, depth + 1));
  if (typeof x === 'object') { const o = {}; for (const k of Object.keys(x).slice(0, 40)) if (/^[A-Za-z0-9_]{1,24}$/.test(k)) o[k] = cleanLive(x[k], depth + 1); return o; }
  return null;
}
export async function handleAdmin(db, op, body = {}, headers = {}) {
  if (await overLimit(db, 'admin', headers)) return bad(429, 'Too many wrong passwords. Try again in 15 minutes.');
  if (!adminOk(headers['x-admin-key'])) { await db.hit(ipKey('admin', headers)); return bad(401, 'Wrong admin password.'); }
  body = body || {};
  const week = String(body.week || weekId()).slice(0, 10);
  const player = async () => { const x = await db.player(String(body.playerId || '')); if (!x) throw Object.assign(new Error('Player not found.'), { http: 404 }); return x; };
  try {
    switch (op) {
      case 'overview': {
        const [players, runs, evs, cash] = await Promise.all([db.players(), db.runs(week), db.events(week), db.cashList()]);
        const rm = new Map(runs.map(r => [r.player_id, r]));
        return ok({ week, players: players.map(x => { const r = rm.get(x.id), lv = x.profile?.live; return { id: x.id, nickname: x.nickname, flag: x.profile?.audit?.flag || null, money: lv ? { nw: lv.nw, cash: lv.cash, debt: (lv.loans || []).reduce((a, l) => a + (Number(l?.owed) || 0), 0), mode: lv.mode, heat: lv.insider?.heat ?? 0, at: x.profile_at } : null, banned: x.banned, reason: x.ban_reason, vol: Number(x.vol_mult), luck: Number(x.luck), created: x.created_at, lastSeen: x.last_seen, locked: !!(x.locked_until && new Date(x.locked_until) > new Date()),
          run: r && { id: r.id, status: r.status, nw: r.final_nw && Number(r.final_nw), ret: r.ret, rigged: r.rigged, suspect: r.suspect, reason: r.reject_reason, started: r.started_at, submitted: r.submitted_at } }; }),
          events: evs, cash: cash.slice(0, 50) });
      }
      case 'reset': { // everyone (or the chosen players) starts a fresh career with $10,000
        const all = await db.players(), want = Array.isArray(body.playerIds) && body.playerIds.length ? new Set(body.playerIds.map(String)) : null;
        const targets = all.filter(x => !want || want.has(x.id));
        await Promise.all(targets.map(x => db.updatePlayer(x.id, { reset_ver: (x.reset_ver || 0) + 1, profile: { ...(x.profile || {}), audit: null } })));
        return ok({ reset: targets.length });
      }
      case 'clearflag': { // the Market God has looked at a flagged player and accepts their current numbers
        const x = await player(), nw = Number(x.profile?.career?.nw) || START_CASH;
        await db.updatePlayer(x.id, { profile: { ...(x.profile || {}), audit: { hist: [[Date.now(), nw]], flag: null, last: nw } } });
        return ok({ ok: true });
      }
      case 'market_reset': { // the whole market starts over: every career restarts at $10,000 in a brand-new market,
        // and this week's events, ranked runs, crowd pressure and undelivered Market God cash are cleared
        const all = await db.players(), runs = await db.runs(week);
        await Promise.all(all.map(x => db.updatePlayer(x.id, { reset_ver: (x.reset_ver || 0) + 1, profile: { ...(x.profile || {}), audit: null } })));
        await Promise.all(runs.map(r => db.deleteRun(r.id)));
        await db.deleteEvents(week); await db.pruneFlows(new Date(Date.now() + 864e5).toISOString()); await db.dropPendingCash();
        return ok({ players: all.length, runs: runs.length });
      }
      case 'challenge_create': {
        const title = String(body.title || '').trim().slice(0, 80), goal = body.goal === 'least' ? 'least' : 'most';
        const startCash = Math.round(Number(body.startCash) * 100), prize = Math.round(Number(body.prize || 0) * 100), days = Math.round(Number(body.days));
        if (!title) return bad(400, 'Give the challenge a name.');
        if (!Number.isFinite(startCash) || startCash < 100 || startCash > 1e15) return bad(400, 'Starting money must be between $1 and $10 trillion.');
        if (!Number.isFinite(prize) || prize < 0 || prize > 1e15) return bad(400, 'Prize must be between $0 and $10 trillion.');
        if (!(days >= 1 && days <= 24)) return bad(400, 'Length must be 1 to 24 game days.');
        const all = await db.playersBrief(), ids = [...new Set((Array.isArray(body.playerIds) ? body.playerIds : []).map(String))].filter(id => all.some(x => x.id === id));
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
        const names = new Map((await db.playersBrief()).map(q => [q.id, q.nickname]));
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
        const kind = String(body.kind); if (!['crash', 'boom', 'announce', 'setprice'].includes(kind)) return bad(400, 'Unknown event.');
        if (kind === 'setprice') { // fix a stock at exactly this price
          const t = String(body.ticker || '').toUpperCase(), price = Number(body.price);
          if (!createWeekly(week).companies[t]) return bad(400, 'Pick a company.');
          if (!Number.isFinite(price) || price <= 0) return bad(400, 'Enter a price above $0.');
          if (price > 1e12) return bad(400, 'The most a share can cost is $1,000,000,000,000.');
          return ok({ event: await db.addEvent({ week, kind, magnitude: 0.12, amount: price, ticker: t, speaker: null, headline: null, game_day: body.day === '' || body.day == null ? null : clampN(body.day | 0, 0, WEEKLY_DAYS), player_id: body.playerId || null }) });
        }
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
