// The fictional social network: influencers with hidden skill and agendas, whose public
// reputation moves as their predictions are proven right or wrong.
import { TPD, dayOf } from './calendar.js';
import { INFLUENCERS, VOICES } from './data/influencers.js';
import { clamp, round, fill, sgn } from './util.js';
import { applyImpulse, effectiveValue, WEATHER } from './market.js';
import { publishCustom } from './news.js';

export function createInfluencers(S) {
  const r = S.rng.social;
  return INFLUENCERS.map(d => {
    const n = 30; const hits = Math.round(n * (0.3 + 0.55 * d.skill) + r.normal(0, 2)); const misses = n - hits;
    const inf = {
      id: d.id, handle: d.handle, name: d.name, bio: d.bio, personality: d.personality, philosophy: d.philosophy, favs: d.favs, voice: d.voice, hue: d.hue,
      followers: d.followers, rep: d.rep, skill: d.skill, hype: d.hype, bias: d.bias, rate: d.rate, agenda: d.agenda ? { ...d.agenda, bag: [], pumps: {}, revealed: false } : null,
      hits, misses, flats: 0, pending: [], history: [], postCount: 0, joined: -r.int(200, 900) * TPD,
    };
    for (let i = 0; i < 8; i++) { // archived track record
      const c = r.pick(S.order); const ok = r.chance(hits / n);
      inf.history.push({ id: -i - 1, t: -(i + 1) * TPD * r.int(6, 20), ticker: c, dir: r.chance(0.5 + d.bias * 0.3) ? 1 : -1, pct: r.int(4, 40), status: ok ? 'hit' : 'miss', ret: round((ok ? 1 : -1) * r.float(0.02, 0.2), 3), archived: true });
    }
    return inf;
  });
}

export function assignAgendas(S) {
  const r = S.rng.social;
  for (const inf of S.influencers) {
    if (!inf.agenda) continue;
    const pool = inf.agenda.type === 'pump' ? S.order.filter(t => ['spec', 'growth'].includes(S.companies[t].tier) && S.companies[t].price * S.companies[t].shares < 12e9) : S.order.filter(t => S.companies[t].tier === 'blue' && inf.favs.includes(S.companies[t].sector));
    inf.agenda.bag = r.shuffle(pool).slice(0, 2);
  }
}

const engage = (r, inf, mult = 1) => { const likes = Math.round(inf.followers * (0.002 + 0.006 * inf.hype) * r.float(0.3, 1.7) * mult); return { likes, reposts: Math.round(likes * r.float(0.12, 0.35)), replies: Math.round(likes * r.float(0.04, 0.12)) }; };

function influence(S, inf, tickers, dir, conv, mult = 1) {
  for (const t of tickers) {
    const c = S.companies[t]; if (!c || c.status !== 'active') continue;
    const capF = clamp(Math.pow(2e9 / (c.price * c.shares), 0.25), 0.6, 2.5);
    const reach = Math.log10(inf.followers) / 6, cred = inf.rep / 100;
    const eff = dir * conv * reach * cred * 0.012 * capF * mult;
    applyImpulse(S, t, eff, { persist: 0.2, rate: 0.4, sentiment: false });
    c.sentiment = clamp(c.sentiment + eff * 6, -1, 1); c.buzz += 0.8;
  }
}

function addPost(S, inf, kind, text, tickers, dir, conv, extra = {}) {
  const id = (S.ids.post = (S.ids.post || 0) + 1);
  const post = { id, t: S.t, infl: inf.id, kind, text, tickers, dir, conv: round(conv, 2), ...engage(S.rng.social, inf, kind === 'rumour' ? 1.4 : 1), ...extra };
  S.posts.push(post); if (S.posts.length > 600) S.posts.shift();
  inf.postCount++;
  return post;
}

function say(S, inf, key, vars) {
  const v = VOICES[inf.voice]; const arr = v[key] || v.rec;
  return fill(S.rng.social.pick(arr), vars);
}
const vars = (S, t, o = {}) => { const c = S.companies[t]; return { t: `$${t}`, co: c ? c.name : '', sec: c ? c.sector : '', ...o }; };

function pickCall(S, inf, wantBull) {
  const r = S.rng.social;
  let pool = S.order.filter(t => inf.favs.includes(S.companies[t].sector));
  if (pool.length < 3 || r.chance(0.3)) pool = S.order;
  const sample = r.shuffle(pool).slice(0, 8);
  let best = null;
  for (const t of sample) {
    const c = S.companies[t]; const sig = Math.log(effectiveValue(S, c) / c.price);
    const sc = inf.skill * sig * 1.2 + (1 - inf.skill) * (r.normal(0, 0.12) + 0.5 * inf.hype * c.sentiment) + inf.bias * 0.02;
    const v = wantBull ? sc : -sc;
    if (!best || v > best.v) best = { t, v, sc };
  }
  return best;
}

function track(S, inf, t, dir, pct, days) {
  const id = (S.ids.pred = (S.ids.pred || 0) + 1);
  inf.pending.push({ id, t: S.t, ticker: t, dir, pct, horizon: days * TPD, px: S.companies[t].price });
  return id;
}

export function socialTick(S) {
  const r = S.rng.social; const w = WEATHER[S.weather.id];
  for (const inf of S.influencers) {
    if (!r.chance((inf.rate / TPD) * (0.85 + 0.3 * w.vol))) continue;
    const roll = r.next(); const v = inf.voice;
    const rumourBias = ['rumour', 'insider', 'pumper', 'hype'].includes(v) ? 0.18 : 0.04;
    if (roll < 0.1 + rumourBias) postRumour(S, inf);
    else if (roll < 0.18 + rumourBias) postWarn(S, inf);
    else if (roll < 0.23 + rumourBias) postLive(S, inf);
    else postCall(S, inf);
  }
}

function postCall(S, inf) {
  const r = S.rng.social; let t, dir, agendaPost = false;
  const ag = inf.agenda;
  if (ag && ag.bag.length && S.order.includes(ag.bag[0]) && r.chance(0.5)) {
    const bt = r.pick(ag.bag.filter(x => S.companies[x]?.status === 'active')); if (bt) { t = bt; dir = ag.type === 'pump' ? 1 : -1; agendaPost = true; ag.pumps[t] = (ag.pumps[t] || 0) + 1; if (!ag.peak) ag.peak = {}; ag.peak[t] = Math.max(ag.peak[t] || 0, S.companies[t].price); ag.lastPush = ag.lastPush || {}; ag.lastPush[t] = S.t; }
  }
  if (!t) {
    const wantBull = r.chance(clamp(0.5 + inf.bias * 0.35 + S.mktSent * 0.1, 0.1, 0.9));
    const b = pickCall(S, inf, wantBull); t = b.t; dir = wantBull ? 1 : -1;
  }
  const c = S.companies[t]; const sig = Math.log(effectiveValue(S, c) / c.price);
  const pct = clamp(Math.round((Math.abs(sig) * 100 * 0.6 + 4) * (1 + inf.hype * 2.2)), 3, 160);
  const days = r.int(6, 22); const asPredict = r.chance(0.5);
  const key = asPredict ? (dir > 0 ? 'predict' : 'predictBear') : (dir > 0 ? 'rec' : 'recBear');
  const conv = clamp(0.35 + inf.hype * 0.5 + r.float(0, 0.2), 0.2, 1);
  const text = say(S, inf, key, vars(S, t, { pct, days }));
  const tracked = key.startsWith('predict') || r.chance(0.5);
  const p = addPost(S, inf, asPredict ? 'predict' : 'rec', text, [t], dir, conv, { pct: tracked ? pct : null, days: tracked ? days : null, agenda: agendaPost ? true : undefined });
  if (tracked) p.predId = track(S, inf, t, dir, pct, days);
  influence(S, inf, [t], dir, conv, agendaPost ? 1.5 : 1);
}

function postRumour(S, inf) {
  const r = S.rng.social;
  const real = S.queue.filter(q => q.kind === 'publish' && !q.cancel && q.spec.tickers && q.spec.tickers.length && !q.tipped);
  let t, dir, truth;
  if (real.length && r.chance(0.3 + 0.45 * inf.skill)) {
    const q = r.pick(real); q.tipped = true; t = q.spec.tickers[0]; const co = q.spec.impact?.co || {}; dir = sgn(Object.values(co).reduce((a, b) => a + b, 0)) || 1; truth = true;
  } else {
    t = r.pick(S.order); dir = r.chance(0.5 + inf.bias * 0.3) ? 1 : -1; truth = false;
  }
  if (!S.companies[t]) return;
  const text = say(S, inf, 'rumour', vars(S, t));
  const conv = clamp(0.3 + inf.hype * 0.4, 0.2, 0.9);
  addPost(S, inf, 'rumour', text, [t], dir, conv, { truth });
  influence(S, inf, [t], dir, conv * 0.8, 1.1);
}

function postWarn(S, inf) {
  const r = S.rng.social; const w = S.weather.id;
  const sec = r.pick(inf.favs); const tk = S.order.filter(t => S.companies[t].sector === sec);
  if (!tk.length) return; const t = r.pick(tk);
  const dir = (inf.bias < -0.3 || w === 'thunder' || w === 'panic') ? -1 : (inf.bias > 0.5 ? 1 : -1);
  const text = say(S, inf, 'warn', vars(S, t, { sec }));
  addPost(S, inf, 'warn', text, [t], dir, 0.4);
  influence(S, inf, tk.slice(0, 3), dir * 0.5, 0.4, 0.7);
}

function postLive(S, inf) {
  const r = S.rng.social; const pool = S.order.filter(t => inf.favs.includes(S.companies[t].sector)); if (!pool.length) return;
  const t = r.pick(pool);
  addPost(S, inf, 'live', say(S, inf, 'live', vars(S, t)), [t], 0, 0.3, { liveAt: S.t + r.int(6, 12) });
  S.companies[t].buzz += 1.5;
}

/** influencers react to published news */
export function onNewsSocial(S, item) {
  if (item.sev < 2 || item.channel !== 'public') return;
  const r = S.rng.social;
  if (item.sev === 2 && !r.chance(0.25)) return;
  const cands = S.influencers.filter(i => item.sectors.some(s => i.favs.includes(s)) || r.chance(0.12));
  const chosen = r.shuffle(cands).slice(0, item.sev >= 4 ? 3 : 2);
  for (const inf of chosen) {
    if (!r.chance(0.6)) continue;
    const t = item.tickers.find(x => S.companies[x]?.status === 'active');
    if (!t) { addPost(S, inf, 'react', say(S, inf, 'warn', vars(S, S.order[0], { sec: item.sectors[0] || 'the market' })).replace(/\$\w+/g, item.sectors[0] || 'the sector'), [], 0, 0.3, { newsId: item.id }); continue; }
    const correct = r.chance(0.5 + 0.42 * inf.skill);
    let dir = item.dir || 0; if (!correct) dir = -dir || (r.chance(0.5) ? 1 : -1);
    if (!dir) dir = r.chance(0.5 + inf.bias * 0.3) ? 1 : -1;
    const conv = clamp(0.3 + inf.hype * 0.5, 0.2, 1);
    addPost(S, inf, 'react', say(S, inf, dir > 0 ? 'reactPos' : 'reactNeg', vars(S, t)), [t], dir, conv, { newsId: item.id });
    influence(S, inf, [t], dir, conv * 0.7, 0.8);
  }
}

/** daily: resolve predictions, evolve reputation and followers, expose agendas */
export function socialDaily(S) {
  const r = S.rng.social;
  for (const inf of S.influencers) {
    const keep = [];
    for (const p of inf.pending) {
      const c = S.companies[p.ticker];
      if (!c || c.status !== 'active') { continue; }
      if (S.t - p.t < p.horizon) { keep.push(p); continue; }
      const ret = c.price / p.px - 1; const good = p.dir * ret;
      const status = good > 0.01 ? 'hit' : good < -0.01 ? 'miss' : 'flat';
      if (status === 'hit') { inf.hits++; inf.rep = clamp(inf.rep + 0.9 + (p.pct > 40 ? 0.6 : 0), 5, 98); inf.followers = Math.round(inf.followers * 1.004); }
      else if (status === 'miss') { inf.misses++; inf.rep = clamp(inf.rep - (1.1 + (p.pct > 40 ? 0.9 : 0)), 5, 98); inf.followers = Math.round(inf.followers * 0.994); }
      else inf.flats++;
      inf.history.unshift({ id: p.id, t: p.t, resolved: S.t, ticker: p.ticker, dir: p.dir, pct: p.pct, status, ret: round(ret, 4) });
      if (inf.history.length > 80) inf.history.pop();
      if (status === 'hit' && r.chance(0.3)) addPost(S, inf, 'result', `${inf.hype > 0.5 ? 'CALLED IT. ' : 'Update: '}$${p.ticker} ${p.dir > 0 ? 'up' : 'down'} ${Math.abs(ret * 100).toFixed(1)}% since my call. ${inf.hype > 0.5 ? 'Who\'s still doubting?' : 'The thesis played out.'}`, [p.ticker], 0, 0.2);
    }
    inf.pending = keep;
    inf.followers = Math.round(inf.followers * (1 + r.normal(0.0004, 0.0015)));
    // agenda exposure
    const ag = inf.agenda;
    if (ag && !ag.revealed && ag.lastPush) {
      for (const t of Object.keys(ag.pumps)) {
        const c = S.companies[t]; if (!c || c.status !== 'active') continue;
        const peak = ag.peak?.[t] || c.price; ag.peak[t] = Math.max(peak, c.price);
        const fell = ag.type === 'pump' ? c.price / ag.peak[t] - 1 < -0.14 : c.price / ag.peak[t] - 1 > -0.001;
        if (ag.pumps[t] >= 3 && S.t - ag.lastPush[t] > TPD * 4 && ag.type === 'pump' && fell && r.chance(0.35)) {
          ag.revealed = true; inf.rep = clamp(inf.rep - 22, 5, 98); inf.followers = Math.round(inf.followers * 0.8);
          publishCustom(S, { cat: 'Social', sev: 3, tickers: [t], status: 'confirmed', head: `Regulator probes online promotion of ${c.name}; influencer @${inf.handle} disclosed holdings`,
            body: `Filings show @${inf.handle} held ${c.name} shares while repeatedly recommending them to ${Math.round(inf.followers / 1000)}k followers. The influencer said recommendations were "independent". Followers have been unimpressed.`,
            impact: { co: { [t]: -0.05 } } });
        } else if (ag.pumps[t] >= 4 && ag.type === 'dump' && r.chance(0.04)) {
          ag.revealed = true; inf.rep = clamp(inf.rep - 18, 5, 98); inf.followers = Math.round(inf.followers * 0.85);
          publishCustom(S, { cat: 'Social', sev: 3, tickers: [t], status: 'confirmed', head: `Short position revealed: @${inf.handle} was betting against ${c.name}`,
            body: `Disclosure data show @${inf.handle} held a bearish position in ${c.name} while publicly warning followers. Critics call it a conflict of interest; the influencer says the warnings were "sincere and well-researched".`,
            impact: { co: { [t]: 0.02 } } });
        }
      }
    }
  }
}

export function accuracy(inf) { const n = inf.hits + inf.misses; return n ? inf.hits / n : 0; }
export function streakInfo(inf) { let s = 0; for (const h of inf.history) { if (h.status === 'hit') s++; else break; } return s; }
export { dayOf };
