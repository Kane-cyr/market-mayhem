// Player progression: investor levels (unlock features), achievements, challenges, reputation.
import { TPD, dayOf } from './calendar.js';
import { netWorth, positions, sectorWeights } from './trading.js';
import { rivalNetWorth } from './rivals.js';
import { clamp, round } from './util.js';

export const LEVELS = [
  { lvl: 0, name: 'Unknown Retail Investor', nw: 0, unlock: 'Basic charts, news and trading.' },
  { lvl: 1, name: 'Active Trader', nw: 12000, unlock: 'Detailed research reports: fair-value ranges and analyst verdicts.' },
  { lvl: 2, name: 'Rising Trader', nw: 20000, unlock: 'Advanced portfolio analytics and special portfolio challenges.' },
  { lvl: 3, name: 'Seasoned Investor', nw: 40000, unlock: 'Exclusive news feed (The Gilded Ledger) and the elite investor leaderboard.' },
  { lvl: 4, name: 'Portfolio Manager', nw: 100000, unlock: 'Historical market archives: every event, chain and crisis.' },
  { lvl: 5, name: 'Market Mover', nw: 250000, unlock: 'Scenario stress tests in research reports.' },
  { lvl: 6, name: 'Market Millionaire', nw: 1000000, unlock: 'Prestige title and bragging rights.' },
  { lvl: 7, name: 'Tycoon', nw: 5000000, unlock: 'You are now a name rivals whisper.' },
  { lvl: 8, name: 'Market Legend', nw: 25000000, unlock: 'The top of the fictional financial world.' },
];
export const FEATURES = { research: 1, analytics: 2, challenges: 2, exclusive: 3, elite: 3, archive: 4, scenarios: 5 };
export const levelFor = nwCents => { let l = 0; for (const x of LEVELS) if (nwCents / 100 >= x.nw) l = x.lvl; return l; };
export const hasFeature = (S, f) => S.player.level >= FEATURES[f];

export const ACHIEVEMENTS = [
  { id: 'first_trade', name: 'Open for Business', desc: 'Make your first trade.', icon: '◆' },
  { id: 'nw_25k', name: 'Getting Serious', desc: 'Reach a $25,000 portfolio.', icon: '▲' },
  { id: 'nw_100k', name: 'Six Figures', desc: 'Reach your first $100,000 portfolio.', icon: '▲▲' },
  { id: 'nw_1m', name: 'Market Millionaire', desc: 'Reach $1,000,000.', icon: '★' },
  { id: 'streak10', name: 'On a Roll', desc: 'Make 10 consecutive profitable trades.', icon: '⟳' },
  { id: 'survive_recession', name: 'Weathered the Storm', desc: 'Survive a recession without losing more than 40% of your wealth.', icon: '☂' },
  { id: 'breakout', name: 'Breakout Spotter', desc: 'Hold a small company that doubles while you own it.', icon: '✦' },
  { id: 'recover_loss', name: 'Phoenix', desc: 'Recover from a 20% portfolio drawdown.', icon: '↺' },
  { id: 'diversified', name: 'Spread the Risk', desc: 'Hold meaningful positions in 6 different sectors.', icon: '⬡' },
  { id: 'diamond', name: 'Diamond Hands', desc: 'Hold a position for 90 days and exit with a 15%+ gain.', icon: '◇' },
  { id: 'buy_fear', name: 'Buy the Fear', desc: 'Buy during storms or panic, then sell for a 10%+ gain.', icon: '⚡' },
  { id: 'dividend', name: 'Paid to Wait', desc: 'Receive your first dividend.', icon: '$' },
  { id: 'patient', name: 'Patient Hunter', desc: 'Have a limit or stop order fill.', icon: '◎' },
  { id: 'witness', name: 'Market Historian', desc: 'Live through 3 major economic events.', icon: '⌛' },
  { id: 'rank1', name: 'King of the Hill', desc: 'Top the Rising Traders leaderboard.', icon: '♛' },
  { id: 'giant', name: 'Giant Killer', desc: 'Overtake an elite tycoon.', icon: '⚔' },
  { id: 'big_short', name: 'The Big Short', desc: 'Close a short for a 25%+ profit.', icon: '↓' },
  { id: 'squeezed', name: 'Squeezed', desc: 'Get margin-called on a short.', icon: '!' },
  { id: 'baller', name: 'Baller', desc: 'Own a supercar or better.', icon: '★' },
  { id: 'legend', name: 'Market Legend', desc: 'Reach $25 million and survive the party.', icon: '♛' },
  { id: 'shark_bait', name: 'Shark Bait', desc: 'Pay back a loan shark in full.', icon: '$' },
  { id: 'kneecaps', name: 'Friendly Visit', desc: 'Get a house call from the debt collectors.', icon: '!' },
];

export const CHALLENGES = [
  { id: 'steady', name: 'Steady Hands', desc: 'Finish 30 days up at least 5% without ever falling more than 4% below your starting value.', days: 30, rep: 120 },
  { id: 'moonshot', name: 'Moonshot', desc: 'Grow your net worth by 25% within 30 days.', days: 30, rep: 200 },
  { id: 'diversify', name: 'Spread Betting', desc: 'Hold at least 6 sectors with none above 30% of your stocks for 20 days.', days: 20, rep: 120 },
  { id: 'fortress', name: 'Defensive Fortress', desc: 'Keep 60%+ of your stocks in Healthcare, Consumer goods and Telecom for 30 days while losing no more than 6%.', days: 30, rep: 140 },
  { id: 'stormrider', name: 'Storm Rider', desc: 'Finish a 30-day window up at least 3% after at least 5 days of storm or panic weather.', days: 30, rep: 220 },
  { id: 'income', name: 'Dividend Collector', desc: 'Collect at least 3 dividend payments within 45 days.', days: 45, rep: 120 },
  { id: 'rivalry', name: 'Rival Slayer', desc: 'Beat the return of a chosen rival over 30 days.', days: 30, rep: 180 },
];

function toast(S, kind, text, extra = {}) { S.player.notifications.push({ t: S.t, kind, text, ...extra }); if (S.player.notifications.length > 80) S.player.notifications.shift(); }
import { setAward } from './shorts.js';
setAward((S, id) => award(S, id));
export function award(S, id) {
  const p = S.player; if (p.achievements[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id); p.achievements[id] = S.t; p.rep += 100;
  toast(S, 'achievement', `Achievement unlocked: ${a.name}`, { id });
}

export function afterTrade(S) {
  const p = S.player;
  if (p.stats.firstTrade != null) award(S, 'first_trade');
  if (p.stats.bestStreak >= 10) award(S, 'streak10');
  if (p.stats.orderFills > 0) award(S, 'patient');
  const lc = p.lastClose;
  if (lc && lc.t === S.t && lc.kind === 'sell') {
    if (lc.heldTicks >= 90 * TPD && lc.pct >= 0.15) award(S, 'diamond');
    if (lc.panicBuy && lc.pct >= 0.1) award(S, 'buy_fear');
  }
  updateLevel(S);
}

function updateLevel(S) {
  const p = S.player; const nw = netWorth(S).total;
  p.stats.peakNW = Math.max(p.stats.peakNW, nw);
  const lv = levelFor(p.stats.peakNW);
  if (lv > p.level) { p.level = lv; toast(S, 'level', `Level up: ${LEVELS[lv].name}. Unlocked: ${LEVELS[lv].unlock}`, { level: lv }); p.rep += 50; }
  if (p.level >= LEVELS.length - 1 && !p.endingSeen) { p.endingSeen = true; (p.scenes ||= []).push({ kind: 'ending', t: S.t }); award(S, 'legend'); }
  if ((p.life?.owned || []).some(o => ['car', 'penthouse', 'yacht', 'island'].includes(o.id))) award(S, 'baller');
}

export function progressDaily(S) {
  const p = S.player, day = dayOf(S.t), nw = netWorth(S).total;
  p.nwHistory.push(nw); if (p.nwHistory.length > 1500) p.nwHistory.shift();
  updateLevel(S);
  const peak = p.stats.peakNW;
  if (peak >= 2.5e6) award(S, 'nw_25k'); if (peak >= 1e7) award(S, 'nw_100k'); if (peak >= 1e8) award(S, 'nw_1m');
  if (p.stats.dividendCount > 0) award(S, 'dividend');
  if (S.stats.majorEvents >= 3) award(S, 'witness');
  // drawdown / recovery
  const d = p.dd;
  if (nw >= d.peak) { d.peak = nw; d.active = false; d.trough = nw; d.depth = 0; }
  else {
    d.trough = Math.min(d.trough, nw); d.depth = 1 - d.trough / d.peak;
    if (d.depth >= 0.2) d.active = true;
    if (d.active && nw >= d.peak - 0.2 * (d.peak - d.trough)) { award(S, 'recover_loss'); d.peak = nw; d.trough = nw; d.active = false; d.depth = 0; }
  }
  p.stats.maxDD = Math.max(p.stats.maxDD, d.depth);
  const pos = positions(S);
  const secs = new Set(pos.filter(x => x.weight >= 0.05).map(x => x.sector));
  if (secs.size >= 6) award(S, 'diversified');
  for (const x of pos) { const h = p.holdings[x.ticker]; const c = S.companies[x.ticker]; if (h.emerging && S.t - h.since >= 5 * TPD && c.price >= h.buyPx / 100 * 2) award(S, 'breakout'); }
  // recessions survived
  for (const e of S.events.history) {
    if (e.id === 'RECESSION' && !p.achievements.survive_recession && !e.judged) {
      e.judged = true; const startI = clamp(p.nwHistory.length - 1 - (day - e.startDay), 0, p.nwHistory.length - 1);
      const before = p.nwHistory[startI] || nw;
      if (p.stats.trades > 0 || Object.keys(p.holdings).length) { if (nw >= before * 0.6 && nw > 100000) award(S, 'survive_recession'); }
    }
  }
  // leaderboard achievements
  const rising = S.rivals.filter(r => r.tier === 'rising'), elite = S.rivals.filter(r => r.tier === 'elite');
  const nwD = nw / 100;
  if (rising.length && rising.every(r => nwD > rivalNetWorth(S, r)) && day - p.startDay > 10) award(S, 'rank1');
  if (elite.length && elite.some(r => nwD > rivalNetWorth(S, r))) award(S, 'giant');
  p.prevDayNW = nw;
  tickChallenge(S, nw);
}

// ---- challenges
export function offerChallenges(S) {
  const p = S.player; if (p.level < FEATURES.challenges) return;
  const c = p.challenges; if (c.active || c.offers.length) return;
  const pool = CHALLENGES.map(x => x.id); const r = S.rng.events;
  c.offers = r.shuffle(pool).slice(0, 3);
}
export function acceptChallenge(S, id) {
  const p = S.player, c = p.challenges; if (c.active) return { ok: false, error: 'A challenge is already active.' };
  if (p.level < FEATURES.challenges) return { ok: false, error: 'Reach Rising Trader to unlock challenges.' };
  const def = CHALLENGES.find(x => x.id === id); if (!def || !c.offers.includes(id)) return { ok: false, error: 'That challenge is not on offer.' };
  const nw = netWorth(S).total;
  let rival = null; if (id === 'rivalry') { const r = S.rng.events.pick(S.rivals.filter(x => x.tier === 'rising')); rival = { id: r.id, start: rivalNetWorth(S, r) }; }
  c.active = { id, startDay: dayOf(S.t), startNW: nw, minNW: nw, stormDays: 0, okDays: 0, divStart: p.stats.dividendCount, rival };
  c.offers = [];
  return { ok: true };
}
function tickChallenge(S, nw) {
  const p = S.player, c = p.challenges; if (p.level < FEATURES.challenges) return;
  if (!c.active) { offerChallenges(S); return; }
  const a = c.active, def = CHALLENGES.find(x => x.id === a.id); const day = dayOf(S.t), elapsed = day - a.startDay;
  a.minNW = Math.min(a.minNW, nw); const ret = nw / a.startNW - 1;
  const w = S.weather.id; if (w === 'thunder' || w === 'panic') a.stormDays++;
  const pos = positions(S); const sw = {}; let tot = 0; for (const x of pos) { sw[x.sector] = (sw[x.sector] || 0) + x.value; tot += x.value; }
  let result = null;
  switch (a.id) {
    case 'steady': if (a.minNW < a.startNW * 0.96) result = 'fail'; else if (elapsed >= def.days) result = ret >= 0.05 ? 'win' : 'fail'; break;
    case 'moonshot': if (ret >= 0.25) result = 'win'; else if (elapsed >= def.days) result = 'fail'; break;
    case 'diversify': { const ok = Object.keys(sw).length >= 6 && Math.max(...Object.values(sw)) / tot <= 0.3; a.okDays = ok ? a.okDays + 1 : 0; if (a.okDays >= def.days) result = 'win'; else if (elapsed >= def.days * 2) result = 'fail'; break; }
    case 'fortress': { const def_ = (sw['Healthcare'] || 0) + (sw['Consumer goods'] || 0) + (sw['Telecom'] || 0); const ok = tot > 0 && def_ / tot >= 0.6; a.okDays = ok ? a.okDays + 1 : a.okDays; if (a.minNW < a.startNW * 0.94) result = 'fail'; else if (elapsed >= def.days) result = a.okDays >= def.days * 0.9 ? 'win' : 'fail'; break; }
    case 'stormrider': if (elapsed >= def.days) result = (ret >= 0.03 && a.stormDays >= 5) ? 'win' : 'fail'; break;
    case 'income': if (p.stats.dividendCount - a.divStart >= 3) result = 'win'; else if (elapsed >= def.days) result = 'fail'; break;
    case 'rivalry': { const rv = S.rivals.find(r => r.id === a.rival.id); const rr = rivalNetWorth(S, rv) / a.rival.start - 1; if (elapsed >= def.days) result = ret > rr ? 'win' : 'fail'; break; }
  }
  if (result === 'win') { p.rep += def.rep; c.done.push({ id: a.id, day }); toast(S, 'challenge', `Challenge complete: ${def.name} (+${def.rep} reputation)`); c.active = null; }
  else if (result === 'fail') { c.failed.push({ id: a.id, day }); toast(S, 'warn', `Challenge failed: ${def.name}. You can try another.`); c.active = null; }
}
export function challengeStatus(S) {
  const a = S.player.challenges.active; if (!a) return null; const def = CHALLENGES.find(x => x.id === a.id);
  const nw = netWorth(S).total; return { ...def, a, elapsed: dayOf(S.t) - a.startDay, ret: nw / a.startNW - 1 };
}
export const reputation = S => S.player.rep + Object.keys(S.player.achievements).length * 0 + S.player.level * 0;
export { round, sectorWeights };
