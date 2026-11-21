// Corporate lifecycle: earnings, dividends, funding, bankruptcies and IPOs.
import { dayOf, dateOf } from './calendar.js';
import { clamp, round, fmtBn } from './util.js';
import { applyImpulse, delistCompany, listCompany, totalCap, WEATHER } from './market.js';
import { publishCustom, M, mapOf } from './news.js';
import { settleHooks, payDividend } from './settle.js';
import { RESERVE } from './data/companies.js';

export const corporateHooks = { earnings, dividend, cashCheck };

function earnings(S, c) {
  const r = S.rng.market, mo = S.macro;
  let s = r.normal(0, 0.055) + 0.004 * (mo.growth - 2.6) * c.loads.cs + 0.0006 * (c.rep - 60);
  let gd = r.chance(0.3) ? -0.8 * s + r.normal(0, 0.03) : r.normal(0, 0.035) + 0.3 * s;
  s = clamp(s, -0.2, 0.2); gd = clamp(gd, -0.2, 0.2);
  const impulse = clamp(s + 0.9 * gd, -0.25, 0.25);
  const prevMargin = c.margin;
  c.growth = clamp(c.growth + 0.35 * s + 0.25 * gd, -0.3, 1.6);
  c.margin = clamp(c.margin + 0.12 * s * (c.margin < 0 ? 0.5 : 1), -6, 0.6);
  c.revenue *= 1 + 0.4 * s;
  c.rep = clamp(c.rep + s * 30, 5, 99);
  c.fv = c.fv; // recomputed tomorrow
  const q = Math.floor(dateOf(S.t).month / 3) + 1;
  const qrev = c.revenue / 4, eps = (qrev * c.margin) / c.shares, cons = eps / (1 + s * (c.margin > 0 ? 2.2 : -1.2));
  const beat = s > 0.035 ? 'beats' : s < -0.035 ? 'misses' : 'matches';
  const guide = gd > 0.03 ? 'raises' : gd < -0.03 ? 'cuts' : 'maintains';
  const conflict = (s > 0.035 && gd < -0.03) || (s < -0.035 && gd > 0.03);
  const head = conflict ? `${c.name} ${beat} Q${q} estimates but ${guide} outlook` : r.pick([`${c.name} ${beat} Q${q} expectations, ${guide} guidance`, `${c.name} Q${q}: results ${beat === 'matches' ? 'in line' : beat.replace('beats', 'top').replace('misses', 'miss')} forecasts; outlook ${guide === 'maintains' ? 'unchanged' : guide === 'raises' ? 'raised' : 'trimmed'}`]);
  const body = `Revenue ran at ${fmtBn(qrev)} for the quarter with ${c.margin >= 0 ? 'net margin' : 'a net loss margin'} of ${(Math.abs(c.margin) * 100).toFixed(1)}% (${prevMargin >= c.margin ? 'down' : 'up'} from ${(prevMargin * 100).toFixed(1)}%). ${eps >= 0 ? 'EPS' : 'Loss per share'} of $${Math.abs(eps).toFixed(2)} compared with consensus $${Math.abs(cons).toFixed(2)}. Management ${guide} full-year guidance${conflict ? ', a mixed message that left analysts debating the real signal' : ''}.`;
  c.lastReport = { t: S.t, q, s: round(s, 4), gd: round(gd, 4), eps: round(eps, 3) };
  publishCustom(S, { cat: 'Earnings', tickers: [c.ticker], status: 'confirmed', head, body, sev: clamp(1 + Math.round(Math.abs(impulse) / 0.03), 1, 4),
    impact: { co: M({ [c.ticker]: impulse }, mapOf(c.competitors.filter(t => S.companies[t]?.status === 'active'), impulse * 0.08)) }, persist: 0.3 });
}

function dividend(S, c) {
  const dps = round(c.price * c.div / 4, 4);
  if (dps < 0.005) return;
  const before = c.price;
  c.price = Math.max(0.01, round(c.price - dps, 4));
  c.fvScale *= 1 - dps / before;
  payDividend(S, c, dps);
  S.stats.dividendsDeclared++;
  publishCustom(S, { cat: 'Dividend', sev: 1, tickers: [c.ticker], status: 'confirmed', head: `${c.name} pays quarterly dividend of $${dps.toFixed(2)} per share`, body: `Shares trade ex-dividend today; the payment equates to a ${(c.div * 100).toFixed(1)}% annual yield at recent prices. Holders have been credited.`, impact: {} });
}

function cashCheck(S, c) {
  const r = S.rng.market, mo = S.macro;
  if (S.fundingStress > S.t) c.cash += (c.revenue * c.margin / 360) * 0.6;
  const burn = (c.revenue * -c.margin) / 360; if (burn <= 0) return;
  const runway = c.cash / burn;
  const cap = c.price * c.shares;
  if (c.cash < 0 && r.chance(0.35 * (1 + mo.fear / 60)) || (runway < 25 && S.fundingStress > S.t && r.chance(0.06))) return bankrupt(S, c);
  if (runway < 100 && r.chance(0.3)) {
    const funding = S.fundingStress > S.t || mo.fear > 70 || c.sentiment < -0.6;
    if (funding && r.chance(0.7)) { if (runway < 40) c.cash -= 0; return; }
    const amt = Math.max(burn * 540, cap * 0.07);
    const px = c.price * 0.93; c.shares += amt / px; c.cash += amt;
    applyImpulse(S, c.ticker, -0.035, { persist: 0 });
    publishCustom(S, { cat: 'Corporate', sev: 2, tickers: [c.ticker], status: 'confirmed', head: `${c.name} raises ${fmtBn(amt)} in share sale to fund growth`, body: `The offering dilutes existing shareholders by about ${(amt / (cap + amt) * 100).toFixed(0)}% but extends the cash runway by roughly ${Math.round(amt / burn / 30)} months.`, impact: {} });
  } else if (runway < 60 && !c.warned) {
    c.warned = true;
    publishCustom(S, { cat: 'Corporate', sev: 3, tickers: [c.ticker], status: 'confirmed', head: `${c.name} warns of "substantial doubt" about its ability to continue`, body: `${c.name} has only about ${Math.max(1, Math.round(runway))} days of cash left at the current burn rate and is exploring financing options.`, impact: { co: { [c.ticker]: -0.1 } }, persist: 0.7 });
  }
}

export function bankrupt(S, c, why) {
  if (c.status !== 'active') return;
  const settle = Math.max(0.01, c.price * 0.02);
  publishCustom(S, { cat: 'Bankruptcy', sev: 5, tickers: [c.ticker], status: 'confirmed',
    head: `${c.name} files for bankruptcy`, body: `${why || `${c.name} ran out of cash and failed to secure rescue financing.`} Equity holders are expected to recover very little. The stock will be delisted, with holdings written down to a token settlement value.`,
    impact: { co: M(mapOf(c.competitors.filter(t => S.companies[t]?.status === 'active'), 0.025), mapOf(S.order.filter(t => S.companies[t].suppliers.includes(c.ticker)), -0.03), mapOf(S.order.filter(t => t !== c.ticker && S.companies[t].sector === c.sector), -0.012)) }, macro: { fear: 3 } });
  delistCompany(S, c, 'bankrupt', settle, settleHooks);
  S.stats.bankruptcies++;
}

/** daily: maybe list a new company */
export function maybeIPO(S) {
  const r = S.rng.events, day = dayOf(S.t);
  if (!S.reserve.length || day < 12) return;
  const gap = 40 - S.order.length;
  const p = gap > 0 ? 0.07 : 0.014;
  if (!r.chance(p * (S.weather.id === 'panic' || S.weather.id === 'thunder' ? 0.3 : 1))) return;
  const def = S.reserve.shift();
  const px = round(def.p * r.normal(1, 0.06), 2);
  const c = listCompany(S, def, px);
  const pop = clamp(r.normal(0.08, 0.14), -0.2, 0.5);
  applyImpulse(S, c.ticker, pop, { persist: 0.4, rate: 0.35 });
  publishCustom(S, { cat: 'IPO', sev: 3, tickers: [c.ticker], status: 'confirmed',
    head: `${c.name} (${c.ticker}) debuts on the exchange at $${px.toFixed(2)}`, body: `${def.desc} The ${c.sector.toLowerCase()} newcomer is valued at ${fmtBn(px * c.shares)}. New listings are volatile and information is thin: they can be the next breakout or a short-lived fad.`, impact: {} });
  S.stats.ipos++;
}
