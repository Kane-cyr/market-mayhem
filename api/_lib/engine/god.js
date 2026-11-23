// Market god mode. Admin-issued settings for one player's weekly run, delivered by the server as
// "sync" payloads. Every payload is logged with the tick it arrived at, so the server can replay
// the run exactly. vol: volatility multiplier (0.25-4). luck: -1..1, tilts the player's own
// positions. cash: one-off grants or fines. events: market-wide crashes or booms on a given day.
import { TPD } from './calendar.js';
import { publishCustom } from './news.js';
import { clamp } from './util.js';

const CRASH = ['Mystery sell-off rips through the market', 'Panic selling hits every sector at once', 'Algorithms dump everything; nobody knows why'];
const BOOM = ['Euphoric buying sweeps the market', 'Stocks rocket on a wave of mystery optimism', 'Everything is going up and nobody can explain it'];

export function applyGod(S, pl) {
  if (!pl) return;
  const g = (S.god ||= { vol: 1, luck: 0, ver: 0, applied: [] });
  if (Number.isFinite(pl.ver)) g.ver = pl.ver;
  if (Number.isFinite(pl.vol)) g.vol = clamp(pl.vol, 0.25, 4);
  if (Number.isFinite(pl.luck)) g.luck = clamp(pl.luck, -1, 1);
  const p = S.player;
  for (const c of pl.cash || []) {
    if (g.applied.includes('c' + c.id) || !Number.isInteger(c.amount)) continue; g.applied.push('c' + c.id);
    const amt = c.amount >= 0 ? c.amount : -Math.min(p.cash, -c.amount); p.cash += amt;
    p.notifications.push({ t: S.t, kind: amt >= 0 ? 'fill' : 'warn', text: amt >= 0 ? `A mysterious wire transfer landed: +$${Math.round(amt / 100).toLocaleString('en-US')}.` : `Your bank charged "account fees" of $${Math.round(-amt / 100).toLocaleString('en-US')}. Nobody can explain them.` });
  }
  const start = S.mode?.startT ?? S.t;
  for (const e of pl.events || []) {
    if (g.applied.includes('e' + e.id)) continue; g.applied.push('e' + e.id);
    const kind = ['boom', 'crash', 'announce'].includes(e.kind) ? e.kind : 'crash';
    const mag = kind === 'announce' ? clamp(Number(e.mag) || 0, -0.4, 0.4) : clamp(Math.abs(Number(e.mag)) || 0.08, 0.01, 0.4);
    const at = e.day == null ? S.t + 1 : Math.max(S.t + 1, start + Math.max(0, e.day | 0) * TPD);
    const unit = e.unit === 'usd' || e.unit === 'pct' ? e.unit : null; // how far, and over how long, a stock is pumped (announcements only)
    const amt = unit ? clamp(Number(e.amt) || 0, unit === 'pct' ? -90 : -100000, unit === 'pct' ? 1000 : 100000) : null, dur = unit ? clamp(Math.round(Number(e.dur) || 0), 0, 24) : null;
    (S.godEvents ||= []).push({ id: e.id, kind, mag, t: at, ticker: e.ticker ? String(e.ticker).slice(0, 8) : null, text: e.text ? String(e.text).slice(0, 160) : '', who: e.who ? String(e.who).slice(0, 40) : '', unit, amt, dur });
  }
}

/** every tick: fire any queued market-wide god events, dressed as ordinary market news */
export function godTick(S) {
  if (!S.godEvents?.length) return;
  for (const e of S.godEvents) {
    if (e.done || e.t > S.t) continue; e.done = true;
    if (e.kind === 'announce') {
      const c = S.companies[e.ticker]; if (!c || c.status !== 'active') continue;
      const who = e.who || 'A Very Important Person';
      publishCustom(S, { cat: 'Statement', sev: Math.abs(e.mag) >= 0.1 ? 5 : 4, status: 'confirmed', tickers: [c.ticker], source: who,
        head: `${who}: "${e.text || (e.mag > 0 ? `${c.name} makes great products. The best.` : `${c.name} is a disaster. Sad.`)}"`,
        body: `${who} singled out ${c.name} in public remarks today. Traders reacted instantly.`, impact: { co: { [c.ticker]: e.unit ? 0 : e.mag } }, persist: 0.75 });
      c.buzz += 10;
      if (e.unit) { // spread the move evenly over e.dur game days
        const L = clamp(e.unit === 'usd' ? Math.log(Math.max(0.05, (c.price + e.amt) / c.price)) : Math.log(1 + e.amt / 100), Math.log(0.1), Math.log(11));
        S.impulses.push({ t: c.ticker, rem: L, left: Math.max(1, Math.round(e.dur * TPD)), start: S.t + 1 }); // starts next tick: a window to trade c.sentiment = clamp(c.sentiment + (L > 0 ? 0.3 : -0.3), -1, 1);
      }
      continue;
    }
    const up = e.kind === 'boom', pick = (up ? BOOM : CRASH)[e.id % 3];
    publishCustom(S, { cat: 'Markets', sev: e.mag >= 0.1 ? 5 : 4, status: 'confirmed', tickers: [], head: pick, body: up ? 'Buyers poured in across every sector. Analysts are scrambling for a reason.' : 'Every sector fell together. Analysts are scrambling for a reason.', impact: { mkt: up ? e.mag : -e.mag }, persist: 0.7 });
  }
}
