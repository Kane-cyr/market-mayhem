// Insider network: unlocks at $450,000 of net worth (or cash). Contacts sell tips drawn from
// stories that are already queued to break. Tips are often wrong, timing is vague, and trading on
// them draws the attention of the Aurelian Securities Commission.
//
// Nothing here changes the market. Tips only READ the news queue, and all randomness uses the
// separate 'insider' stream, so buying a tip or getting caught never alters any price.
import { TPD, dayOf } from './calendar.js';
import { netWorth, positions, sell } from './trading.js';
import { clamp } from './util.js';

export const INSIDER_UNLOCK = 0; // kept for older imports: the network now opens after your first trade
// A ladder of sources. Everyone starts with Dodgy Dave (right about 3 times in 10). Paying for an
// introduction to the next contact buys better accuracy, at a higher fee and with more attention.
export const CONTACTS = [
  { id: 'dave', name: 'Dodgy Dave', role: 'Drinks at the same pub as half the City. "Knows a guy."', fee: 0.0015, min: 5000, acc: 0.3, heat: 3, intro: 0, note: 'Right about 3 times in 10.' },
  { id: 'clerk', name: 'The Night Clerk', role: 'Photocopies documents at a corporate law firm after hours.', fee: 0.004, min: 30000, acc: 0.5, heat: 6, intro: 250000, note: 'Right about half the time.' },
  { id: 'banker', name: 'Silvia Marrow', role: 'Mergers banker at Halberd & Crane. Expensive taste in lunches.', fee: 0.009, min: 100000, acc: 0.68, heat: 11, intro: 1500000, note: 'Right about 7 times in 10.' },
  { id: 'director', name: 'The Director', role: 'Sits on four boards. Never says which.', fee: 0.018, min: 400000, acc: 0.85, heat: 20, intro: 7500000, note: 'Rarely wrong. Very visible.' },
];
const COOLDOWN_DAYS = 2, MAX_TIPS = 3, SUSPEND_DAYS = 10, BAN_DAYS = 30;
const err = error => ({ ok: false, error });

export function ensureInsider(S) {
  const I = (S.player.insider ||= { unlocked: false, tips: [], heat: 0, flagged: [], case: null, history: [], suspendedUntil: -1, bannedUntil: -1, lastTip: {}, ids: 0 });
  I.met ||= ['dave']; return I;
}
export const tipFee = (S, contact) => Math.max(contact.min, Math.round(Math.max(0, netWorth(S).total) * contact.fee));
export const isSuspended = S => (S.player.insider?.suspendedUntil ?? -1) > S.t;
export const heatLabel = h => h < 20 ? 'Low' : h < 50 ? 'Noticed' : h < 90 ? 'High' : 'Critical';

export function checkUnlock(S) {
  const I = ensureInsider(S); if (I.unlocked) return false;
  if (S.player.stats.firstTrade == null) return false;
  I.unlocked = true;
  S.player.notifications.push({ t: S.t, kind: 'warn', text: 'Someone slipped a napkin under your door. The insider network is open.' });
  (S.player.scenes ||= []).push({ kind: 'insider_intro', t: S.t });
  return true;
}

/** stories already queued to break that move a specific company: the raw material for tips */
function candidates(S) {
  const out = [], horizon = S.t + 20 * TPD;
  for (const q of S.queue) {
    if (q.t <= S.t || q.t > horizon) continue;
    let co = null, sign = 1, scale = 1;
    if (q.kind === 'publish' && !q.cancel) co = q.spec?.impact?.co;
    else if (q.kind === 'resolve') { co = q.impact?.co; sign = q.truth ? 1 : -1; scale = q.truth ? 1 - q.factor : q.factor; }
    if (!co) continue;
    for (const t in co) { const c = S.companies[t], v = co[t] * scale; if (c && c.status === 'active' && Math.abs(v) >= 0.02) out.push({ ticker: t, dir: Math.sign(v) * sign, mag: Math.abs(v), due: q.t }); }
  }
  return out;
}

export function buyTip(S, contactId) {
  const I = ensureInsider(S), p = S.player, ct = CONTACTS.find(c => c.id === contactId), rng = S.rng.insider;
  if (!ct) return err('Unknown contact.');
  if (!I.unlocked) return err('Make your first trade and someone will find you.');
  if (!I.met.includes(ct.id)) return err(`You have not been introduced to ${ct.name} yet.`);
  if (I.bannedUntil > S.t) return err('Your contacts have gone quiet while the Commission is watching.');
  const active = I.tips.filter(x => x.expires > S.t);
  if (active.length >= MAX_TIPS) return err(`You can hold at most ${MAX_TIPS} live tips.`);
  if (dayOf(S.t) - (I.lastTip[ct.id] ?? -99) < COOLDOWN_DAYS) return err(`${ct.name} will not talk again so soon.`);
  if (isSuspended(S)) return err('Nobody will talk to you while you are suspended.');
  const fee = tipFee(S, ct); if (fee > p.cash) return err('Not enough cash for this tip.');
  p.cash -= fee; I.lastTip[ct.id] = dayOf(S.t); I.heat += ct.heat * 0.3;
  const cand = candidates(S);
  let tip;
  if (cand.length && rng.chance(ct.acc)) {
    const x = rng.weighted(cand, c => c.mag);
    const days = Math.max(1, Math.ceil((x.due - S.t) / TPD) + rng.int(0, 3));
    tip = { ticker: x.ticker, dir: x.dir, days, real: true };
  } else {
    const t = rng.pick(S.order);
    tip = { ticker: t, dir: rng.chance(0.5) ? 1 : -1, days: rng.int(2, 12), real: false };
  }
  const say = tip.dir > 0
    ? rng.pick(['Something good lands for {t} within {d} days. Do not ask how I know.', 'Buy {t}. A deal is being signed. {d} days, give or take.', '{t} has news coming in about {d} days. It is the kind people celebrate.'])
    : rng.pick(['Get out of {t}. Bad news lands within {d} days.', '{t} is about to disappoint, maybe {d} days. You did not hear it from me.', 'I would not be holding {t} in {d} days. That is all I will say.']);
  const rec = { id: ++I.ids, t: S.t, contact: ct.id, ticker: tip.ticker, dir: tip.dir, real: tip.real, cost: fee, px0: S.companies[tip.ticker].price,
    text: say.replace('{t}', '$' + tip.ticker).replace('{d}', String(tip.days)), expires: S.t + (tip.days + 3) * TPD };
  I.tips.push(rec); if (I.tips.length > 40) I.tips.shift();
  p.log.push({ type: 'tip', t: S.t, ticker: tip.ticker, total: fee, src: ct.id }); if (p.log.length > 600) p.log.shift();
  return { ok: true, tip: rec, fee };
}

/** pay for an introduction to the next contact on the ladder */
export function meet(S, contactId) {
  const I = ensureInsider(S), p = S.player, k = CONTACTS.findIndex(c => c.id === contactId), ct = CONTACTS[k];
  if (!ct) return err('Unknown contact.');
  if (!I.unlocked) return err('Make your first trade and someone will find you.');
  if (I.met.includes(ct.id)) return err('You already know them.');
  if (!I.met.includes(CONTACTS[k - 1].id)) return err(`Get to know ${CONTACTS[k - 1].name} first.`);
  if (ct.intro > p.cash) return err('Not enough cash for the introduction.');
  p.cash -= ct.intro; I.met.push(ct.id);
  p.log.push({ type: 'intro', t: S.t, total: ct.intro, src: ct.id }); if (p.log.length > 600) p.log.shift();
  return { ok: true, contact: ct };
}

/** called after every completed trade (manual or order fill) */
export function onTrade(S, res) {
  if (!res?.ok) return; const I = ensureInsider(S); if (!I.unlocked) checkUnlock(S);
  const nw = Math.max(1, netWorth(S).total), notional = res.price * res.shares;
  // dumping a stock you just hyped is market manipulation
  const hyped = (S.player.life?.hypes || []).find(h => h.ticker === res.ticker && S.t - h.t <= 3 * TPD);
  if (hyped && (res.side === 'sell' || res.side === 'short')) { const add = 10 + Math.min(45, 70 * notional / nw); I.heat += add; if (I.case) I.case.heat += add; I.flagged.push({ t: S.t, ticker: res.ticker, side: 'sell', shares: res.shares, px: res.price, tip: 0 }); }
  const tip = I.tips.find(x => x.ticker === res.ticker && x.t <= S.t && x.expires > S.t); if (!tip) return;
  const aligned = (res.side === 'buy' || res.side === 'cover') === (tip.dir > 0);
  const add = (4 + Math.min(45, 70 * notional / nw)) * (aligned ? 1 : 0.4) * (1 + CONTACTS.find(c => c.id === tip.contact).heat / 30);
  I.heat += add; if (I.case) I.case.heat += add;
  I.flagged.push({ t: S.t, ticker: res.ticker, side: res.side === 'cover' ? 'buy' : res.side === 'short' ? 'sell' : res.side, shares: res.shares, px: res.price, tip: tip.id });
  if (I.flagged.length > 60) I.flagged.shift();
}

function gainOn(S, f) {
  const c = S.companies[f.ticker]; const now = Math.round((c ? c.price : f.px / 100) * 100);
  return f.side === 'buy' ? (now - f.px) * f.shares : (f.px - now) * f.shares;
}

/** pay a fine from cash, selling the largest positions first if cash is short. Cash never goes negative. */
function payFine(S, fine) {
  const p = S.player;
  for (const x of positions(S)) { if (p.cash >= fine) break; const h = p.holdings[x.ticker]; if (h) sell(S, x.ticker, h.shares, { source: 'seizure' }); }
  const paid = Math.min(fine, p.cash); p.cash -= paid; return paid;
}

export function insiderDaily(S) {
  const I = ensureInsider(S), p = S.player, rng = S.rng.insider;
  if (!I.unlocked) checkUnlock(S);
  I.heat *= 0.96; if (I.heat < 0.5) I.heat = 0;
  I.tips = I.tips.filter(x => x.expires > S.t - 30 * TPD);
  // tips that went cold: was the contact right?
  for (const x of I.tips) {
    if (x.outcome || x.expires > S.t || x.px0 == null) continue;
    const c = S.companies[x.ticker]; const r = c ? c.price / x.px0 - 1 : 0; x.ret = r;
    x.outcome = Math.abs(r) < 0.02 ? 'flat' : Math.sign(r) === x.dir ? 'right' : 'wrong';
    const rec = ((I.record ||= {})[x.contact] ||= { right: 0, wrong: 0, flat: 0 }); rec[x.outcome]++;
    const who = CONTACTS.find(k => k.id === x.contact)?.name || 'Your contact';
    p.notifications.push({ t: S.t, kind: x.outcome === 'right' ? 'fill' : 'warn', text: `${who}'s tip on $${x.ticker} was ${x.outcome === 'right' ? 'RIGHT' : x.outcome === 'wrong' ? 'WRONG' : 'a dud'} (${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}%).` });
  }
  I.flagged = I.flagged.filter(f => f.t > S.t - 60 * TPD);
  if (I.case) {
    if (S.t < I.case.ends) return;
    const c = I.case; I.case = null;
    const guilty = rng.chance(clamp(c.heat / 130, 0.12, 0.9));
    if (!guilty) { I.heat *= 0.5; I.history.push({ t: S.t, outcome: 'dropped' }); p.notifications.push({ t: S.t, kind: 'fill', text: 'The Securities Commission dropped its inquiry. Lucky.' }); return; }
    const nw = netWorth(S).total, gain = I.flagged.reduce((a, f) => a + Math.max(0, gainOn(S, f)), 0);
    const fine = Math.min(Math.round(nw * 0.6), Math.max(Math.round(gain * 2), Math.round(nw * 0.05)));
    const paid = payFine(S, fine);
    p.orders = p.orders.filter(o => o.side !== 'buy'); I.suspendedUntil = S.t + SUSPEND_DAYS * TPD; I.bannedUntil = S.t + BAN_DAYS * TPD; I.heat = 0; I.flagged = []; I.tips = [];
    p.rep = (p.rep || 0) - 20;
    I.history.push({ t: S.t, outcome: 'fined', fine: paid });
    p.log.push({ type: 'fine', t: S.t, total: paid, src: 'commission' }); if (p.log.length > 600) p.log.shift();
    p.notifications.push({ t: S.t, kind: 'warn', text: `Insider trading penalty: fined $${(paid / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} and barred from buying for ${SUSPEND_DAYS} days.` });
    return;
  }
  if (I.heat > 0) {
    const pr = Math.min(0.3, 0.12 * (I.heat / 100) ** 2);
    if (rng.chance(pr)) {
      I.case = { opened: S.t, ends: S.t + rng.int(8, 14) * TPD, heat: I.heat };
      p.notifications.push({ t: S.t, kind: 'warn', text: 'The Aurelian Securities Commission has opened an inquiry into your trading.' });
    }
  }
}
