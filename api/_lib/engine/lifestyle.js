// Lifestyle and clout. Buying toys is pure status: it costs real money, does not count towards net
// worth, raises your Flex score and follower count, and is the first thing debt collectors take.
// With enough followers you can hype a stock yourself, which the Securities Commission notices if
// you sell into the rally.
import { TPD, dayOf } from './calendar.js';
import { applyImpulse } from './market.js';
import { netWorth } from './trading.js';
import { clamp } from './util.js';

export const ITEMS = [
  { id: 'stapler', name: 'Gold-plated stapler', price: 250000, flex: 1, fol: 40, blurb: 'Staples exactly as well as a normal one.' },
  { id: 'watch', name: 'Diamond wristwatch', price: 2500000, flex: 3, fol: 150, blurb: 'Tells the time. Mostly tells people you are rich.' },
  { id: 'suits', name: 'Twelve bespoke suits', price: 6000000, flex: 5, fol: 300, blurb: 'One for every month you might get subpoenaed.' },
  { id: 'car', name: 'Vortex V12 supercar', price: 35000000, flex: 12, fol: 1500, blurb: 'Zero to sixty in 2.8 seconds. Parking in 40 minutes.' },
  { id: 'penthouse', name: 'Penthouse above the exchange', price: 250000000, flex: 30, fol: 6000, blurb: 'Wake up, look down, see your stocks.' },
  { id: 'yacht', name: 'Superyacht "Margin Call"', price: 800000000, flex: 60, fol: 20000, blurb: 'Comes with a helipad and an existential crisis.' },
  { id: 'island', name: 'Private island', price: 2000000000, flex: 120, fol: 60000, blurb: 'No taxes, no neighbours, no Wi-Fi.' },
];
export const HYPE_MIN = 1000, HYPE_COOLDOWN_DAYS = 3, PAWN = 0.4, SEIZE = 0.35;
const err = error => ({ ok: false, error });
export const ensureLife = S => (S.player.life ||= { owned: [], followers: 300, hypes: [], lastHype: -99, ids: 0 });
export const flexScore = S => (S.player.life?.owned || []).reduce((a, o) => a + (ITEMS.find(i => i.id === o.id)?.flex || 0), 0);
export function flexTitle(f) { return f >= 200 ? 'Galactic Baller' : f >= 100 ? 'Certified Baller' : f >= 40 ? 'Big Spender' : f >= 12 ? 'Flashy' : f >= 1 ? 'Getting There' : 'Modest'; }

export function buyItem(S, id) {
  const L = ensureLife(S), p = S.player, it = ITEMS.find(i => i.id === id);
  if (!it) return err('That is not for sale.');
  if (it.price > p.cash) return err(`You need ${'$' + (it.price / 100).toLocaleString('en-US')} in cash.`);
  p.cash -= it.price; L.owned.push({ uid: ++L.ids, id, t: S.t, paid: it.price }); L.followers += it.fol;
  p.log.push({ type: 'flex', t: S.t, total: it.price, src: id }); if (p.log.length > 600) p.log.shift();
  return { ok: true, item: it };
}
export function pawnItem(S, uid) {
  const L = ensureLife(S), p = S.player, k = L.owned.findIndex(o => o.uid === uid); if (k < 0) return err('You do not own that.');
  const o = L.owned[k]; if (o.pledged) return err('That is pledged to a loan shark. Pay the loan off first.');
  const got = Math.round(o.paid * PAWN); L.owned.splice(k, 1); p.cash += got;
  L.followers = Math.max(50, Math.round(L.followers * 0.97));
  return { ok: true, got, item: ITEMS.find(i => i.id === o.id) };
}
/** collectors take toys first (most expensive first) at a terrible valuation */
export function seizeItems(S, need, loanId) {
  const L = S.player.life; if (!L || !L.owned.length || need <= 0) return { raised: 0, items: [] };
  let raised = 0; const items = [];
  // collateral pledged against this loan goes first, and all of it goes; then the priciest other toys
  for (const o of [...L.owned].sort((a, b) => (loanId && b.pledged === loanId) - (loanId && a.pledged === loanId) || b.paid - a.paid)) {
    if (raised >= need && !(loanId && o.pledged === loanId)) break; raised += Math.round(o.paid * SEIZE); items.push(ITEMS.find(i => i.id === o.id)?.name);
    L.owned = L.owned.filter(x => x !== o);
  }
  return { raised, items };
}

export function canHype(S, ticker) {
  const L = ensureLife(S), c = S.companies[ticker];
  if (!c || c.status !== 'active') return err('That stock is not trading.');
  if (L.followers < HYPE_MIN) return err(`You need ${HYPE_MIN.toLocaleString('en-US')} followers to move a stock. You have ${Math.round(L.followers).toLocaleString('en-US')}.`);
  if (dayOf(S.t) - L.lastHype < HYPE_COOLDOWN_DAYS) return err('Post too often and people stop listening. Wait a couple of days.');
  return { ok: true };
}
/** post hype about a stock to your followers: a short-lived pump proportional to your reach */
export function hype(S, ticker) {
  const ok = canHype(S, ticker); if (!ok.ok) return ok;
  const L = ensureLife(S), c = S.companies[ticker], r = S.rng.insider;
  const reach = Math.log10(L.followers) / 6, capF = clamp(Math.pow(2e9 / (c.price * c.shares), 0.25), 0.6, 2.5);
  const eff = clamp(0.06 * reach * capF * (0.8 + r.next() * 0.4), 0.01, 0.18);
  applyImpulse(S, ticker, eff, { persist: 0.1, rate: 0.35, sentiment: false });
  c.sentiment = clamp(c.sentiment + eff * 4, -1, 1); c.buzz += 3;
  L.lastHype = dayOf(S.t); L.hypes.push({ t: S.t, ticker, px0: c.price, judged: false }); if (L.hypes.length > 30) L.hypes.shift();
  const text = r.pick([`$${ticker} is the most undervalued stock on the planet. I'm all in. 🚀`, `Not financial advice but $${ticker} is about to rip. Load up.`, `Everyone sleeping on $${ticker}. Not me. Not anymore.`, `$${ticker}. That's the tweet.`, `My sources (me) say $${ticker} doubles by Friday.`]);
  const id = (S.ids.post = (S.ids.post || 0) + 1), f = L.followers;
  S.posts.push({ id, t: S.t, infl: 'player', kind: 'rec', text, tickers: [ticker], dir: 1, conv: 1, likes: Math.round(f * (0.03 + r.next() * 0.04)), reposts: Math.round(f * 0.008), replies: Math.round(f * 0.004) });
  if (S.posts.length > 600) S.posts.shift();
  const I = S.player.insider; if (I) I.heat += 4;
  return { ok: true, eff };
}

/** daily: followers drift with your results; hypes that worked win followers, flops lose them */
export function lifeDaily(S) {
  const L = S.player.life; if (!L) return;
  const p = S.player, nw = netWorth(S).total, ret = p.prevDayNW > 0 ? nw / p.prevDayNW - 1 : 0;
  L.followers = Math.max(50, Math.round(L.followers * (1 + 0.004 + clamp(ret, -0.05, 0.1) * 0.6)));
  for (const h of L.hypes) {
    if (h.judged || S.t - h.t < 2 * TPD) continue; h.judged = true;
    const c = S.companies[h.ticker]; const r = c ? c.price / h.px0 - 1 : 0;
    if (r > 0.03) { L.followers = Math.round(L.followers * 1.12); p.notifications.push({ t: S.t, kind: 'fill', text: `Your $${h.ticker} call is up ${(r * 100).toFixed(0)}%. Followers love you.` }); }
    else { L.followers = Math.round(L.followers * 0.92); p.notifications.push({ t: S.t, kind: 'warn', text: `Your $${h.ticker} call flopped (${(r * 100).toFixed(0)}%). Some followers left.` }); }
  }
}
