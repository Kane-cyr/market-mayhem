// Macroeconomy: rates, inflation, growth, unemployment, oil, confidence, plus scheduled data releases.
import { dayOf, sessionOf } from './calendar.js';
import { clamp, round } from './util.js';
import { publishCustom } from './news.js';

export function createMacro() {
  return {
    rate: 3.5, inflation: 2.4, growth: 2.6, unemployment: 5.0, confidence: 0.1,
    oil: 72, oilTarget: 72, oilBase: 72, fear: 26, fearBoost: 0, stress: { banking: 0, crypto: 0 },
    gShift: 0, iShift: 0, uShift: 0, lastUnemp: 5.0, lastInfl: 2.4, lastGrowth: 2.6, lastDecision: null, nextMeeting: 0,
  };
}

export function dailyMacro(S) {
  const mo = S.macro, r = S.rng.macro;
  mo.gShift *= 0.985; mo.iShift *= 0.985; mo.uShift *= 0.985;
  const gT = 2.6 + mo.gShift - 0.22 * (mo.rate - 3.5);
  mo.growth = clamp(mo.growth + 0.06 * (gT - mo.growth) + 0.1 * r.normal(), -6, 8);
  const iT = 2.4 + mo.iShift + 0.014 * (mo.oil - 72) - 0.12 * (mo.rate - 3.5);
  mo.inflation = clamp(mo.inflation + 0.05 * (iT - mo.inflation) + 0.04 * r.normal(), -1, 12);
  const uT = 5 + mo.uShift;
  mo.unemployment = clamp(mo.unemployment + 0.04 * (uT - mo.unemployment) - 0.03 * (mo.growth - 2.6) + 0.02 * r.normal(), 2.5, 14);
  const d = S.idx.daily; const ret20 = d.length > 20 ? d[d.length - 1] / d[d.length - 21] - 1 : 0;
  const cT = clamp(0.35 * (mo.growth - 2.6) / 2.6 - 0.12 * (mo.unemployment - 5) + 1.5 * ret20, -1, 1);
  mo.confidence = clamp(mo.confidence + 0.06 * (cT - mo.confidence) + 0.01 * r.normal(), -1, 1);
  mo.oilBase += 0.0 * r.normal();
  mo.oilTarget += 0.03 * (mo.oilBase - mo.oilTarget) + mo.oilTarget * 0.004 * r.normal();
  mo.oilTarget = clamp(mo.oilTarget, 35, 200);
  mo.stress.banking *= 0.965; mo.stress.crypto *= 0.965;
}

/** where policy "should" be, and what the market expects at the next meeting */
export function rateOutlook(S) {
  const mo = S.macro;
  const desired = 3.0 + 0.8 * (mo.inflation - 2.3) + 0.4 * (mo.growth - 2.6) - (mo.fear > 60 ? 0.5 : 0) - mo.stress.banking * 0.01;
  const gap = desired - mo.rate;
  const expected = gap > 0.15 ? 0.25 : gap < -0.15 ? -0.25 : 0;
  const pHike = clamp(0.5 + gap * 1.6, 0.02, 0.97) * (expected >= 0 ? 1 : 0.6);
  const pCut = clamp(0.5 - gap * 1.6, 0.02, 0.97) * (expected <= 0 ? 1 : 0.6);
  return { desired: round(desired, 2), gap: round(gap, 2), expected, pHike: round(pHike, 2), pCut: round(pCut, 2), label: expected > 0 ? 'Hike expected' : expected < 0 ? 'Cut expected' : 'Hold expected' };
}

function rateImpacts(S, delta, surprise) {
  const co = {};
  for (const t of S.order) { const c = S.companies[t]; co[t] = -(0.5 * delta + 1.0 * surprise) * c.loads.rs * 0.04; }
  return co;
}

export function centralBank(S, o = {}) {
  const mo = S.macro, r = S.rng.macro; const out = rateOutlook(S);
  let delta;
  if (o.forceDelta !== undefined) delta = o.forceDelta;
  else if (out.gap > 0.3) delta = r.chance(0.8) ? 0.25 : 0;
  else if (out.gap < -0.3) delta = r.chance(0.8) ? -0.25 : 0;
  else delta = r.chance(0.06) ? (out.gap >= 0 ? 0.25 : -0.25) : 0;
  if (mo.rate + delta < 0.25) delta = 0.25 - mo.rate; if (mo.rate + delta > 10) delta = 10 - mo.rate;
  const expected = o.emergency ? 0 : out.expected;
  const surprise = delta - expected;
  const newRate = round(mo.rate + delta, 2);
  const word = delta > 0 ? 'raises' : delta < 0 ? 'cuts' : 'holds';
  const head = o.head || (delta === 0 ? `Aurelian Central Bank holds rates at ${mo.rate.toFixed(2)}%` : `Aurelian Central Bank ${word} rates by ${Math.abs(delta * 100).toFixed(0)}bp to ${newRate.toFixed(2)}%`);
  const body = o.body || (delta === 0 ? `Policymakers left the benchmark rate unchanged, citing ${out.gap > 0 ? 'persistent price pressures' : 'a cooling economy'}. ${Math.abs(surprise) > 0.1 ? 'The decision was not what markets had expected.' : 'The decision was widely anticipated.'}`
    : `${delta > 0 ? 'Higher borrowing costs weigh on indebted growth companies; banks may benefit from wider margins.' : 'Cheaper borrowing is a tailwind for leveraged and long-duration growth stocks.'} ${Math.abs(surprise) > 0.1 ? 'Markets had priced something different, so the move delivered a surprise.' : 'Markets had largely priced the move.'}`);
  const item = publishCustom(S, { cat: 'Rates', sev: Math.abs(surprise) > 0.1 || o.emergency ? 4 : 2, status: 'confirmed', head, body, tickers: [], sectors: ['Banking'], impact: { co: rateImpacts(S, delta, surprise) }, persist: 0, macro: { fear: surprise > 0.1 ? 1 : surprise < -0.1 ? -1 : 0 } });
  mo.rate = newRate; mo.lastDecision = { t: S.t, delta, surprise, newRate };
  return item;
}

function release(S, kind) {
  const mo = S.macro, r = S.rng.macro;
  if (kind === 'jobs') {
    const exp = mo.lastUnemp + r.normal(0, 0.05); const act = round(mo.unemployment + r.normal(0, 0.04), 1);
    const s = clamp((exp - act) / 0.2, -2, 2); const jobs = Math.round((mo.growth - 0.5) * 80 + r.normal(0, 30));
    publishCustom(S, { cat: 'Economy', sev: Math.abs(s) > 1 ? 3 : 2, status: 'confirmed', tickers: [], sectors: ['Consumer goods'],
      head: `Employment: unemployment ${act > mo.lastUnemp ? 'rises' : act < mo.lastUnemp ? 'falls' : 'steady'} at ${act.toFixed(1)}% (expected ${exp.toFixed(1)}%)`,
      body: `The economy ${jobs >= 0 ? 'added' : 'lost'} ${Math.abs(jobs)}k jobs. ${s > 0.3 ? 'A stronger-than-expected labour market supports consumer spending and cyclical sectors.' : s < -0.3 ? 'Weaker hiring raises concerns about consumer demand, though it may also ease pressure on the central bank.' : 'The data was broadly in line with forecasts.'}`,
      impact: { sec: { 'Consumer goods': s * 0.014, Entertainment: s * 0.015, Automotive: s * 0.012, Aerospace: s * 0.008, Banking: s * 0.006 }, mkt: s * 0.003 }, macro: { conf: s * 0.01 }, persist: 0.3 });
    mo.lastUnemp = act;
  } else if (kind === 'inflation') {
    const exp = mo.lastInfl + r.normal(0, 0.08); const act = round(mo.inflation + r.normal(0, 0.05), 1);
    const s = clamp((exp - act) / 0.25, -2, 2); const co = {}; for (const t of S.order) co[t] = s * S.companies[t].loads.rs * 0.012;
    publishCustom(S, { cat: 'Economy', sev: Math.abs(s) > 1 ? 3 : 2, status: 'confirmed', tickers: [], sectors: [],
      head: `Inflation ${act > exp + 0.1 ? 'surprises to upside' : act < exp - 0.1 ? 'cools more than expected' : 'in line'} at ${act.toFixed(1)}%`,
      body: `Annual consumer prices rose ${act.toFixed(1)}% against forecasts of ${exp.toFixed(1)}%. ${s < -0.3 ? 'Hot inflation raises the odds of higher rates, which hurts highly valued growth shares.' : s > 0.3 ? 'Lower inflation encourages hopes of cheaper money.' : 'Rate expectations were little changed.'}`,
      impact: { co }, persist: 0.2 });
    mo.lastInfl = act;
  } else if (kind === 'gdp') {
    const exp = mo.lastGrowth + r.normal(0, 0.2); const act = round(mo.growth + r.normal(0, 0.15), 1); const s = clamp((act - exp) / 0.5, -2, 2);
    publishCustom(S, { cat: 'Economy', sev: Math.abs(s) > 1 ? 3 : 2, status: 'confirmed', tickers: [], sectors: [],
      head: `GDP growth ${act >= 0 ? '' : 'contracts '}${act.toFixed(1)}% annualised, ${s > 0.3 ? 'beating' : s < -0.3 ? 'missing' : 'matching'} forecasts of ${exp.toFixed(1)}%`,
      body: act < 0 ? 'The economy shrank in the quarter. Two consecutive negative readings would meet the common definition of recession.' : 'Output expanded, with consumer spending and business investment the main contributors.',
      impact: { mkt: s * 0.006 }, macro: { conf: s * 0.015 }, persist: 0.4 });
    mo.lastGrowth = act;
  }
}

/** called each tick; fires scheduled central-bank decisions and data releases */
export function scheduledMacro(S) {
  const day = dayOf(S.t), s = sessionOf(S.t), dm = day % 30;
  if (day < 3) return;
  if (dm === 14 && s === 3) centralBank(S);
  else if (dm === 4 && s === 2) release(S, 'jobs');
  else if (dm === 9 && s === 2) release(S, 'inflation');
  else if (day % 90 === 20 && s === 2) release(S, 'gdp');
}
