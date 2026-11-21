// Procedural news. Every template rolls its own (hidden) impact, so a headline's tone is
// not a reliable trading signal. News ripples to competitors, suppliers, sectors, the whole
// market, macro variables and schedules follow-up stories across days.
import { TPD, dayOf } from './calendar.js';
import { clamp, round, fmtBn } from './util.js';
import { applyImpulse, WEATHER, delistCompany } from './market.js';
import { FIRST, LAST, REGIONS, PORTS, REG, BROKERS, SOURCES, PREMIUM_SOURCE, PRODUCTS, FACILITIES, COMMODITY_BLOC } from './data/world.js';
import { onNewsSocial } from './social.js';
import { settleHooks } from './settle.js';

// ---------------------------------------------------------------- helpers
const exec = r => `${r.pick(FIRST)} ${r.pick(LAST)}`;
const active = (S, tk) => S.companies[tk] && S.companies[tk].status === 'active';
const comps = (S, c) => c.competitors.filter(t => active(S, t));
export const mapOf = (list, x) => { const o = {}; for (const t of list) o[t] = x; return o; };
export const M = (...maps) => { const o = {}; for (const m of maps) for (const k in m) o[k] = (o[k] || 0) + m[k]; return o; };
const compMap = (S, c, x) => mapOf(comps(S, c), x);
const supMap = (S, c, x) => mapOf(c.suppliers.filter(t => active(S, t)), x);
const custMap = (S, c, x) => mapOf(S.order.filter(t => S.companies[t].suppliers.includes(c.ticker)), x);
const peerMap = (S, c, x) => mapOf(S.order.filter(t => t !== c.ticker && S.companies[t].sector === c.sector), x);
const sectorOf = (S, sec) => S.order.filter(t => S.companies[t].sector === sec);
const mix = (r, outs) => { const o = r.weighted(outs, x => x[0]); return { v: r.normal(o[1], o[2]), tag: o[3] || 'x' }; };
const money = (r, lo, hi) => `$${(r.float(lo, hi)).toFixed(1)}B`;
const prod = (r, sec) => r.pick(PRODUCTS[sec] || PRODUCTS['Technology']);

function pickCo(S, r, o = {}) {
  let list = S.order.map(t => S.companies[t]);
  if (o.sectors) list = list.filter(c => o.sectors.includes(c.sector));
  if (o.tiers) list = list.filter(c => o.tiers.includes(c.tier));
  if (o.filter) list = list.filter(o.filter);
  if (!list.length) return null;
  return r.weighted(list, c => (1 + Math.log(1 + c.price * c.shares / 1e9)) * (S.t - (c.lastNewsT ?? -999) < 18 ? 0.35 : 1));
}
const coOf = (S, r, p, o) => (p.co && active(S, p.co) ? S.companies[p.co] : pickCo(S, r, o));
const status = (r, w) => r.weighted([['confirmed', w[0]], ['rumoured', w[1]], ['disputed', w[2]]], x => x[1])[0];

const TPL = {}; const ORDER = [];
function T(id, weight, fn, opt = {}) { TPL[id] = { id, weight, fn, ...opt }; if (weight > 0) ORDER.push(TPL[id]); }

// ---------------------------------------------------------------- scandals
T('scandal_accounting', 0.6, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.85, -.13, .05], [.15, -.03, .03]]);
  return { cat: 'Scandal', tickers: [c.ticker], status: status(r, [.55, .15, .3]),
    head: r.pick([`Auditor flags "irregularities" in ${c.name} revenue recognition`, `${c.name} to restate two years of earnings after internal review`, `Auditor resigns at ${c.name} citing accounting concerns`]),
    body: `${c.name} said its audit committee is reviewing how part of recent revenue was booked. Management insists the core business is sound, but the disclosure has unsettled shareholders and lenders.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.12), peerMap(S, c, o.v * 0.05)) }, macro: { fear: 1 },
    chain: [{ p: .55, tpl: 'gov_probe', delay: [8, 30], params: { co: c.ticker } }, { p: .3, tpl: 'exec_resign', delay: [6, 24], params: { co: c.ticker } }], leak: true };
});
T('data_breach', 0.7, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Technology', 'AI', 'Banking', 'Entertainment', 'Consumer goods', 'Telecom', 'Crypto', 'Healthcare'] }); if (!c) return null; const o = mix(r, [[.9, -.05, .025], [.1, -.01, .02]]);
  const n = r.int(2, 90);
  return { cat: 'Scandal', tickers: [c.ticker], status: 'confirmed',
    head: r.pick([`Hackers expose records of ${n} million ${c.name} customers`, `${c.name} confirms major data breach`]),
    body: `${c.name} disclosed that attackers accessed customer data over several weeks. Regulators have been notified and the company expects remediation costs and possible penalties.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.1)) }, chain: [{ p: .4, tpl: 'gov_probe', delay: [12, 36], params: { co: c.ticker } }] };
});
T('safety_recall', 0.7, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Automotive', 'Aerospace', 'Healthcare', 'Consumer goods', 'Technology'] }); if (!c) return null; const o = mix(r, [[.9, -.06, .03], [.1, -.01, .02]]);
  return { cat: 'Scandal', tickers: [c.ticker], status: 'confirmed',
    head: r.pick([`${c.name} recalls ${r.int(20, 900)}k units over safety defect`, `${c.name} grounds products after safety scare`]),
    body: `${c.name} began a voluntary recall after reports of faults. Analysts are split on whether costs will be contained or whether liability claims will follow.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.18)) }, chain: [{ p: .35, tpl: 'gov_probe', delay: [12, 40], params: { co: c.ticker } }] };
});
T('exec_misconduct', 0.5, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.8, -.05, .03], [.2, .01, .03]]);
  return { cat: 'Scandal', tickers: [c.ticker], status: status(r, [.5, .3, .2]),
    head: `${c.name} chief ${exec(r)} placed on leave amid misconduct allegations`,
    body: `The board has appointed outside counsel to investigate. ${c.name} said operations are unaffected.`,
    impact: { co: { [c.ticker]: o.v } }, chain: [{ p: .55, tpl: 'exec_resign', delay: [6, 30], params: { co: c.ticker } }] };
});
T('whistleblower', 0.4, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.7, -.06, .03], [.3, 0, .02]]);
  return { cat: 'Scandal', tickers: [c.ticker], status: 'disputed', resolve: { p: 0.45, delay: [12, 40] },
    head: `Whistleblower alleges ${c.name} hid ${r.pick(['safety problems', 'weak demand', 'regulatory breaches', 'inflated user numbers'])}`,
    body: `A former employee filed a complaint with regulators. ${c.name} called the claims "baseless and misleading" and said it will contest them vigorously.`,
    impact: { co: { [c.ticker]: o.v } } };
});
// ---------------------------------------------------------------- regulation
T('gov_probe', 0.45, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.85, -.05, .025], [.15, 0, .03]]);
  return { cat: 'Government', tickers: [c.ticker], status: 'confirmed',
    head: r.pick([`${r.pick(REG)} opens formal investigation into ${c.name}`, `Regulators issue subpoenas to ${c.name}`, `${c.name} confirms government probe`]),
    body: `${c.name} said it will cooperate fully. Investigations of this kind can take weeks or months and may end in fines, remedies or nothing at all.`,
    impact: { co: M({ [c.ticker]: o.v }, peerMap(S, c, o.v * 0.08)) }, chain: [{ p: .8, tpl: 'gov_outcome', delay: [30, 120], params: { co: c.ticker } }], leak: true };
});
T('gov_outcome', 0, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.4, .05, .02, 'clear'], [.4, -.03, .02, 'fine'], [.2, -.08, .03, 'break']]);
  const hd = { clear: `${c.name} cleared as regulator closes probe`, fine: `${c.name} agrees settlement with regulators`, break: `Regulator orders structural remedies against ${c.name}` };
  return { cat: 'Government', tickers: [c.ticker], status: 'confirmed', head: hd[o.tag],
    body: o.tag === 'clear' ? 'No further action will be taken, ending months of uncertainty.' : o.tag === 'fine' ? 'The company will pay a penalty it said was "within provisions". Some investors saw it as a clean break from the uncertainty.' : 'The ruling goes further than the market had expected and may force changes to the business.',
    impact: { co: { [c.ticker]: o.v } } };
});
T('antitrust_sector', 0.35, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['AI', 'Technology', 'Banking', 'Telecom', 'Healthcare', 'Entertainment', 'Energy'] }); if (!c) return null;
  const sec = c.sector; const x = -r.float(.025, .05);
  return { cat: 'Government', sev: 3, tickers: [c.ticker, ...comps(S, c)].slice(0, 4), sectors: [sec], status: 'confirmed',
    head: `Government drafts tough new rules for ${sec === 'AI' ? 'AI developers' : sec.toLowerCase() + ' giants'}`,
    body: `A draft bill would impose new obligations on the largest firms in the ${sec} sector. Industry groups say it would raise costs; supporters say it is overdue.`,
    impact: { sec: { [sec]: x } }, macro: { fear: 1 } };
});
// ---------------------------------------------------------------- executives
T('exec_resign', 0.55, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.5, -.04, .03], [.3, .03, .03], [.2, -.08, .03]]);
  return { cat: 'Executive', tickers: [c.ticker], status: p.co ? 'confirmed' : status(r, [.7, .2, .1]),
    head: r.pick([`${c.name} CEO ${exec(r)} to step down`, `${c.name} chief executive resigns with immediate effect`, `Shock exit: ${c.name} boss ${exec(r)} quits`]),
    body: `${c.name} said the departure was by mutual agreement and that a search for a successor is under way. Whether investors cheer or fret depends on who they thought was running things.`,
    impact: { co: { [c.ticker]: o.v } }, chain: [{ p: .7, tpl: 'exec_successor', delay: [12, 48], params: { co: c.ticker } }], leak: true };
});
T('exec_successor', 0, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.5, .02, .02], [.5, -.02, .02]]);
  return { cat: 'Executive', tickers: [c.ticker], status: 'confirmed', head: `${c.name} names ${exec(r)} as new chief executive`, body: `The incoming CEO is described as ${r.pick(['an outsider with a turnaround record', 'a long-serving insider', 'a technologist who has never run a large company', 'a former regulator'])}. The market reaction will tell you how it was received.`, impact: { co: { [c.ticker]: o.v } } };
});
// ---------------------------------------------------------------- earnings-style
T('profit_warning', 0.7, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.85, -.11, .04], [.15, -.01, .02]]);
  return { cat: 'Earnings', tickers: [c.ticker], status: 'confirmed',
    head: r.pick([`${c.name} cuts full-year outlook`, `${c.name} warns profits will miss expectations`]),
    body: `${c.name} blamed ${r.pick(['weaker demand', 'rising input costs', 'currency headwinds', 'delayed contracts', 'competitive pricing'])}. Shares are likely to be volatile when trading resumes in earnest.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.1), peerMap(S, c, o.v * 0.08)) }, leak: true };
});
T('guidance_raise', 1.1, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.8, .06, .03], [.2, .005, .02]]);
  return { cat: 'Earnings', tickers: [c.ticker], status: 'confirmed',
    head: r.pick([`${c.name} lifts guidance on stronger demand`, `${c.name} flags upside to profit forecasts`]),
    body: `${c.name} said trading since the start of the quarter has exceeded management's plans, helped by ${r.pick(['strong orders', 'cost savings', 'new customers', 'favourable pricing'])}.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, o.v * 0.05)) }, leak: true };
});
// ---------------------------------------------------------------- products & science
T('product_launch', 1.5, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.55, .05, .03, 'hit'], [.3, -.01, .03, 'mixed'], [.15, -.06, .03, 'flop']]);
  const pr = prod(r, c.sector);
  const hd = { hit: `${c.name} unveils ${pr} to strong early reviews`, mixed: `${c.name} launches ${pr}; reviewers divided`, flop: `${c.name}'s ${pr} stumbles out of the gate` };
  return { cat: 'Product', tickers: [c.ticker], status: r.chance(0.12) ? 'disputed' : 'confirmed', head: hd[o.tag],
    body: `The launch is the most significant for ${c.name} in two years. ${o.tag === 'hit' ? 'Pre-orders exceeded internal targets.' : o.tag === 'mixed' ? 'Pricing and availability drew criticism alongside praise.' : 'Early users reported bugs and the rollout has been rocky.'}`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.25), supMap(S, c, o.v * 0.2)) }, leak: true };
});
T('product_delay', 0.5, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.85, -.05, .03], [.15, .0, .02]]);
  return { cat: 'Product', tickers: [c.ticker], status: 'confirmed', head: `${c.name} delays flagship ${prod(r, c.sector).replace(/^an? /, '')}`,
    body: `${c.name} pushed back the release by several months, citing quality and supply issues. Rivals may use the window to catch up.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.25)) } };
});
T('trial_soon', 0.35, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Healthcare'], tiers: ['spec', 'growth'] }); if (!c || c.trialPending) return null; c.trialPending = true;
  return { cat: 'Healthcare', tickers: [c.ticker], status: 'confirmed', head: `${c.name} to present pivotal trial data "within days"`,
    body: `Investors are bracing for a binary outcome. Options markets imply a very large move in either direction when the data lands.`,
    impact: { co: { [c.ticker]: r.normal(0.01, 0.015) } }, chain: [{ p: 1, tpl: 'trial_result', delay: [12, 40], params: { co: c.ticker } }], leak: true };
});
T('trial_result', 0, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; c.trialPending = false;
  const good = r.chance(0.35 + 0.35 * c.rep / 100); const v = good ? r.normal(.26, .07) : -Math.abs(r.normal(.33, .07));
  return { cat: 'Healthcare', sev: 5, tickers: [c.ticker], status: 'confirmed',
    head: good ? `${c.name} trial hits primary endpoint` : `${c.name} trial misses primary endpoint`,
    body: good ? `Patients on the treatment showed a statistically significant improvement versus placebo. The company will seek regulatory approval.` : `The treatment failed to separate from placebo. ${c.name} said it will review the full data set before deciding on next steps.`,
    impact: { co: M({ [c.ticker]: v }, compMap(S, c, good ? -0.01 : 0.01)) }, persist: 0.95 };
});
T('space_launch', 0.3, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Aerospace'], tiers: ['spec', 'growth'] }); if (!c) return null; const ok = r.chance(0.62); const v = ok ? r.normal(.1, .04) : -Math.abs(r.normal(.15, .05));
  return { cat: 'Technology', tickers: [c.ticker], status: 'confirmed', head: ok ? `${c.name} lands orbital booster on maiden mission` : `${c.name} launch ends in fireball`,
    body: ok ? 'The mission reached orbit and recovered its first stage, a milestone the company called "proof of the business model".' : 'Investigators will examine the failure. The company has insurance, but the schedule slip may matter more than the hardware.',
    impact: { co: M({ [c.ticker]: v }, ok ? mapOf(['ORBL', 'SKYW'].filter(t => active(S, t) && t !== c.ticker), 0.01) : {}) } };
});
T('ai_breakthrough', 0.55, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['AI', 'Technology'] }); if (!c) return null; const o = mix(r, [[.7, .07, .03], [.3, .01, .03]]);
  return { cat: 'AI', sev: 3, tickers: [c.ticker, ...comps(S, c).slice(0, 2)], sectors: ['AI'], status: status(r, [.7, .1, .2]),
    head: r.pick([`${c.name} researchers unveil model that crushes reasoning benchmarks`, `${c.name} claims AI breakthrough in autonomous problem-solving`]),
    body: `The result, if confirmed independently, would set a new state of the art. Rivals face a choice: spend to catch up, or fall behind. Chipmakers are watching demand projections closely.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.3), supMap(S, c, o.v * 0.3), mapOf(['VLTS'].filter(t => active(S, t)), o.v * 0.4)), fx: { AIF: 0.01 } }, macro: { fear: -1 }, leak: true };
});
T('discovery', 0.2, (S, r, p) => {
  const kinds = [
    { head: 'Lab demonstrates battery with triple the energy density', body: 'Researchers say the chemistry could be in vehicles within three years, threatening both oil demand and legacy battery makers.', co: { VLTD: .06, SLRG: .05, KSTM: .02, CBLT: .08, PGEN: -.025, ATDL: -.03 }, fx: { GREENF: .008 } },
    { head: 'Fusion experiment records net energy gain for sixty seconds', body: 'The result moves commercial fusion from "if" toward "when". Utilities and oil majors are reassessing long-term plans.', co: { FSNW: .22, SLRG: -.02, PGEN: -.02, ATDL: -.025 }, fx: {} },
    { head: 'Quantum-lattice prototype outperforms conventional chips on key tasks', body: 'The announcement lifts hopes for a new computing era, and raises questions about how long the current silicon lead lasts.', co: { QLOM: .15, HLXC: .03, VLTS: -.02, STKL: -.015 }, fx: { AIF: .004 } },
    { head: 'One-shot gene therapy cures inherited blood disorder in trial', body: 'The therapy may reshape how rare diseases are treated, rewarding gene-editing firms and threatening chronic-care franchises.', co: { GNMD: .14, LYRA: .1, VTLS: -.015, HLDX: .02 }, fx: {} },
  ];
  const k = r.pick(kinds); const co = {}; for (const t in k.co) if (active(S, t)) co[t] = k.co[t] * r.float(.8, 1.2);
  return { cat: 'Technology', sev: 4, tickers: Object.keys(co).slice(0, 5), status: 'confirmed', head: k.head, body: k.body, impact: { co, fx: k.fx }, macro: { conf: 0.01 } };
});
// ---------------------------------------------------------------- banking chain
T('bank_loss', 0.5, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Banking'], filter: x => x.ticker !== 'BMIN' }); if (!c) return null; const o = mix(r, [[.9, -.11, .04], [.1, -.03, .03]]);
  const loss = money(r, 0.6, 4.5);
  return { cat: 'Banking', sev: 4, tickers: [c.ticker], sectors: ['Banking'], status: 'confirmed',
    head: r.pick([`${c.name} stuns market with unexpected ${loss} loss`, `${c.name} reports shock loss on bad loans`]),
    body: `${c.name} took a large charge on ${r.pick(['commercial property', 'leveraged loans', 'trading positions', 'consumer credit'])}. Investors are asking which other lenders have similar exposures.`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, o.v * 0.35), peerMap(S, c, o.v * 0.25)), sec: { Healthcare: .008, 'Consumer goods': .008, Telecom: .008, AI: -.006, Crypto: -.01 } },
    macro: { fear: 4 }, stress: { banking: 16 },
    chain: [{ p: .65, tpl: 'bank_doubts', delay: [6, 18], params: { src: c.ticker } }, { p: .4, tpl: 'insurer_exposure', delay: [9, 30], params: { src: c.ticker } }, { p: .55, tpl: 'flight_to_safety', delay: [12, 36], params: {} }], leak: true };
});
T('bank_doubts', 0, (S, r, p) => {
  const c = pickCo(S, r, { sectors: ['Banking'], filter: x => x.ticker !== p.src && x.ticker !== 'BMIN' }); if (!c) return null;
  const src = S.companies[p.src]; const o = mix(r, [[.8, -.06, .03], [.2, -.01, .02]]);
  return { cat: 'Banking', tickers: [c.ticker], status: status(r, [.3, .5, .2]), resolve: { p: 0.4, delay: [12, 36] },
    head: `Investors question ${c.name} exposure after ${src ? src.name : 'rival'} losses`, body: `Credit analysts say ${c.name} holds similar assets. The bank pushed back, saying its book is "well-provisioned".`,
    impact: { co: { [c.ticker]: o.v } }, macro: { fear: 2 }, stress: { banking: 8 } };
});
T('insurer_exposure', 0, (S, r) => {
  if (!active(S, 'BMIN')) return null; const c = S.companies.BMIN;
  return { cat: 'Banking', tickers: ['BMIN'], status: 'confirmed', head: `Insurers brace for losses linked to banking turmoil`, body: `Bastion Mutual and peers hold corporate bonds and guarantees tied to troubled lenders. Analysts expect reserve increases.`, impact: { co: { BMIN: r.normal(-.04, .02) } }, stress: { banking: 3 } };
});
T('flight_to_safety', 0, (S, r) => ({ cat: 'Markets', sev: 3, sectors: ['Healthcare', 'Consumer goods', 'Telecom'], tickers: [], status: 'confirmed',
  head: 'Investors rotate into defensive stocks as bank worries spread', body: 'Healthcare, staples and telecom shares are outperforming while growth, crypto and AI names are sold. Strategists call it a classic flight to safety.',
  impact: { sec: { Healthcare: .015, 'Consumer goods': .012, Telecom: .012, AI: -.012, Crypto: -.02, Technology: -.008 }, mkt: -.004 }, macro: { fear: 3 } }));
T('bank_stress_test', 0.3, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Banking'], filter: x => x.ticker !== 'BMIN' }); if (!c) return null; const fail = r.chance(.55); const v = fail ? r.normal(-.07, .03) : r.normal(.025, .02);
  return { cat: 'Banking', tickers: [c.ticker], status: 'confirmed', head: fail ? `${c.name} fails regulatory stress test` : `${c.name} sails through regulatory stress test`,
    body: fail ? 'The shortfall means curbs on dividends and buybacks until capital is rebuilt.' : 'The bank comfortably exceeded capital requirements, reassuring depositors and shareholders.',
    impact: { co: M({ [c.ticker]: v }, compMap(S, c, fail ? -v * 0.2 : 0)) }, stress: { banking: fail ? 8 : -4 } };
});
T('bank_run_rumour', 0.25, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Banking'], filter: x => x.ticker !== 'BMIN' && x.ticker !== 'MRFB' }); if (!c) return null;
  return { cat: 'Banking', tickers: [c.ticker], status: 'rumoured', resolve: { p: 0.25, delay: [8, 24] }, head: `Rumours of liquidity squeeze at ${c.name} trigger sell-off`,
    body: `Social media chatter claims large depositors are pulling funds from ${c.name}. The bank has not commented. Unverified rumours of this kind have occasionally been entirely false, and occasionally not.`,
    impact: { co: M({ [c.ticker]: r.normal(-.12, .03) }, peerMap(S, c, -.012)) }, stress: { banking: 8 }, macro: { fear: 2 } };
});
T('bank_profit', 0.4, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Banking'] }); if (!c) return null; const v = r.normal(.05, .025);
  return { cat: 'Banking', tickers: [c.ticker], status: 'confirmed', head: `${c.name} posts record lending profit`, body: `Strong loan growth and low defaults lifted ${c.name}'s earnings, easing concerns about credit quality.`, impact: { co: M({ [c.ticker]: v }, peerMap(S, c, v * .2)) }, stress: { banking: -5 } };
});
// ---------------------------------------------------------------- M&A and alliances
T('takeover_bid', 0.28, (S, r) => {
  if (S.order.length < 28) return null;
  const targets = S.order.map(t => S.companies[t]).filter(c => !c.takeover && c.tier !== 'blue' || (c.tier === 'blue' && c.price * c.shares < 25e9 && !c.takeover));
  const tg = targets.length ? r.pick(targets) : null; if (!tg) return null;
  const caps = tg.price * tg.shares;
  const acq = pickCo(S, r, { filter: x => x.ticker !== tg.ticker && x.price * x.shares > caps * 3 && (x.sector === tg.sector || r.chance(.35)) }); if (!acq) return null;
  tg.takeover = { by: acq.ticker, until: S.t + TPD * 40 };
  const prem = r.float(.15, .32); const bid = round(tg.price * (1 + prem), 2);
  return { cat: 'M&A', sev: 4, tickers: [tg.ticker, acq.ticker], status: status(r, [.55, .35, .1]), resolve: { p: 0.6, delay: [8, 30] },
    head: r.pick([`${acq.name} makes $${(bid * tg.shares / 1e9).toFixed(1)}B bid for ${tg.name}`, `${tg.name} receives takeover approach from ${acq.name}`]),
    body: `The offer of $${bid.toFixed(2)} per share represents a ${(prem * 100).toFixed(0)}% premium. ${tg.name}'s board will consider it; regulators may scrutinise the deal. Bids like this are sometimes raised, rejected or blocked.`,
    impact: { co: { [tg.ticker]: r.normal(prem * .8, .04), [acq.ticker]: r.normal(-.025, .02) } }, persist: 0.9,
    chain: [{ p: 1, tpl: 'ma_outcome', delay: [60, 200], params: { co: tg.ticker, by: acq.ticker } }], leak: true };
});
T('ma_outcome', 0, (S, r, p) => {
  const tg = S.companies[p.co]; const acq = S.companies[p.by]; if (!tg || tg.status !== 'active') return null;
  const o = p.forced || r.weighted(['accept', 'block', 'sweeten'], x => ({ accept: .45, block: .3, sweeten: .25 })[x]);
  const A = acq && acq.status === 'active' ? acq.ticker : null; const an = acq ? acq.name : 'the bidder';
  if (o === 'accept') {
    return { cat: 'M&A', sev: 4, tickers: [tg.ticker, A].filter(Boolean), status: 'confirmed', head: `${tg.name} agrees to be acquired by ${an}`,
      body: `Shareholders will receive cash at the agreed price and the stock will be delisted on closing. Holders are paid out at the deal price.`,
      impact: { co: { [tg.ticker]: .01, ...(A ? { [A]: r.normal(.005, .02) } : {}) } }, effects: [{ delist: { ticker: tg.ticker, kind: 'acquired', mult: 1.005 } }] };
  }
  if (o === 'block') {
    tg.takeover = null;
    return { cat: 'M&A', sev: 3, tickers: [tg.ticker, A].filter(Boolean), status: 'confirmed', head: `Regulator blocks ${an} takeover of ${tg.name}`, body: `The deal would harm competition, the regulator said. The bidder walked away and the takeover premium has evaporated.`,
      impact: { co: { [tg.ticker]: r.normal(-.12, .03), ...(A ? { [A]: r.normal(.02, .015) } : {}) } } };
  }
  return { cat: 'M&A', sev: 3, tickers: [tg.ticker, A].filter(Boolean), status: 'confirmed', head: `${an} sweetens offer for ${tg.name} after board rejection`,
    body: `A higher bid brings the board to the table. Talks continue, though a deal is not yet certain.`, impact: { co: { [tg.ticker]: r.normal(.05, .02), ...(A ? { [A]: -.015 } : {}) } },
    chain: [{ p: 1, tpl: 'ma_outcome', delay: [30, 90], params: { co: tg.ticker, by: p.by, forced: 'accept' } }] };
});
T('partnership', 1.0, (S, r, p) => {
  const a = coOf(S, r, p); if (!a) return null; const b = pickCo(S, r, { filter: x => x.ticker !== a.ticker && (x.sector !== a.sector) }); if (!b) return null;
  const va = mix(r, [[.65, .035, .02], [.35, -.005, .02]]), vb = mix(r, [[.65, .03, .02], [.35, -.005, .02]]);
  return { cat: 'Corporate', tickers: [a.ticker, b.ticker], status: 'confirmed', head: `${a.name} and ${b.name} announce strategic alliance`,
    body: `The companies will co-develop ${r.pick(['new products', 'a shared platform', 'joint distribution channels'])}. Terms were not disclosed.`, impact: { co: { [a.ticker]: va.v, [b.ticker]: vb.v } }, leak: true };
});
// ---------------------------------------------------------------- geopolitics, trade, oil
T('conflict_flare', 0.22, (S, r) => {
  const a = r.pick(REGIONS), b = r.pick(REGIONS.filter(x => x !== a));
  return { cat: 'Geopolitics', sev: 4, tickers: ['SKYW', 'PGEN', 'STRW'].filter(t => active(S, t)), sectors: ['Aerospace', 'Energy'], status: 'confirmed',
    head: r.pick([`Border clashes between ${a} and ${b} rattle markets`, `Tensions flare as ${a} and ${b} trade accusations`]),
    body: `Military activity near key shipping lanes has pushed oil higher and raised fear premiums. Defence stocks are in demand; airlines and consumer cyclicals are under pressure.`,
    impact: { co: { SKYW: .035, SBLD: .06, PGEN: .03, ATDL: .04, STRW: -.05, KSTM: -.012, RDGB: -.015 }, mkt: -.012 }, macro: { fear: 5, oilTarget: 1.1 },
    chain: [{ p: .55, tpl: 'conflict_ceasefire', delay: [30, 120] }, { p: .2, tpl: 'conflict_escalation', delay: [18, 60] }] };
});
T('conflict_escalation', 0, (S, r) => ({ cat: 'Geopolitics', sev: 4, tickers: ['SKYW', 'PGEN'].filter(t => active(S, t)), status: 'confirmed', head: 'Conflict escalates as diplomatic talks collapse', body: 'Markets sold off broadly as traders priced a longer, deeper confrontation. Oil moved higher again.',
  impact: { co: { SKYW: .03, PGEN: .03, STRW: -.05 }, mkt: -.018 }, macro: { fear: 6, oilTarget: 1.08 } }));
T('conflict_ceasefire', 0, (S, r) => ({ cat: 'Geopolitics', sev: 3, tickers: ['STRW', 'PGEN'].filter(t => active(S, t)), status: 'confirmed', head: 'Ceasefire holds as regional tensions ease', body: 'Relief swept through markets: oil dropped, airlines rallied and defence names gave back some gains.',
  impact: { co: { STRW: .05, KSTM: .015, SKYW: -.02, PGEN: -.025 }, mkt: .012 }, macro: { fear: -4, oilTarget: 0.93 } }));
T('trade_tariffs', 0.25, (S, r) => {
  const a = r.pick(REGIONS), b = r.pick(REGIONS.filter(x => x !== a));
  return { cat: 'Trade', sev: 3, tickers: [], status: 'confirmed', head: `${a} imposes new tariffs on ${b} imports`,
    body: `Manufacturers with international supply chains are most exposed. Domestic producers may benefit, but retaliation risk is high.`,
    impact: { sec: { Automotive: -.03, Technology: -.025, 'Consumer goods': -.018, Aerospace: -.012, Energy: .008 }, mkt: -.006 }, macro: { fear: 2, infl: .03 },
    chain: [{ p: .45, tpl: 'trade_retaliation', delay: [24, 80] }, { p: .45, tpl: 'trade_easing', delay: [60, 180] }] };
});
T('trade_retaliation', 0, () => ({ cat: 'Trade', sev: 3, tickers: [], status: 'confirmed', head: 'Trading partners retaliate with tariffs of their own', body: 'Exporters took the hit as the dispute widened. Investors are bracing for a drawn-out trade fight.', impact: { sec: { Automotive: -.025, Technology: -.02, 'Consumer goods': -.015, Aerospace: -.02 }, mkt: -.008 }, macro: { fear: 3 } }));
T('trade_easing', 0, () => ({ cat: 'Trade', sev: 3, tickers: [], status: 'confirmed', head: 'Trade talks yield tariff rollback', body: 'Negotiators agreed to remove most of the recent duties. Exporters rallied.', impact: { sec: { Automotive: .03, Technology: .025, 'Consumer goods': .018, Aerospace: .015 }, mkt: .01 }, macro: { fear: -3 } }));
T('oil_cut', 0.3, (S, r) => ({ cat: 'Energy', sev: 3, tickers: ['PGEN', 'ATDL', 'STRW'].filter(t => active(S, t)), sectors: ['Energy'], status: 'confirmed',
  head: `${COMMODITY_BLOC} agrees surprise output cut`, body: 'Crude jumped on the news. Producers are the obvious winners; airlines, truckmakers and consumers are the obvious losers.',
  impact: { co: { PGEN: .04, ATDL: .06, STRW: -.04, RDGB: -.025, KSTM: -.012, SLRG: .012 }, mkt: -.003 }, macro: { oilTarget: 1.1, infl: .02 } }));
T('oil_glut', 0.3, (S, r) => ({ cat: 'Energy', sev: 3, tickers: ['PGEN', 'ATDL', 'STRW'].filter(t => active(S, t)), sectors: ['Energy'], status: 'confirmed',
  head: `${COMMODITY_BLOC} ramps up production; crude slides`, body: 'Cheaper fuel is a gift to airlines and freight, and a headache for drillers and the oil majors.',
  impact: { co: { PGEN: -.035, ATDL: -.055, STRW: .045, RDGB: .02, KSTM: .01, SLRG: -.012 }, mkt: .003 }, macro: { oilTarget: 0.91, infl: -.02 } }));
// ---------------------------------------------------------------- investment & corporate
T('sovereign_stake', 0.3, (S, r, p) => {
  const c = coOf(S, r, p, { tiers: ['growth', 'spec'] }); if (!c) return null; const v = r.normal(c.tier === 'spec' ? .13 : .06, .03);
  return { cat: 'Investment', tickers: [c.ticker], status: status(r, [.8, .1, .1]), head: `Sovereign fund takes ${r.int(4, 14)}% stake in ${c.name}`, body: `The investment signals long-term confidence from a deep-pocketed backer and gives ${c.name} a cushion against volatile markets.`, impact: { co: { [c.ticker]: v } }, leak: true };
});
T('capex', 0.6, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.55, .025, .02], [.45, -.02, .02]]);
  return { cat: 'Investment', tickers: [c.ticker], status: 'confirmed', head: `${c.name} to invest ${money(r, 1, 18)} in new ${r.pick(FACILITIES)}`, body: `The spending plan impressed some analysts and alarmed others who fear lower returns on capital and a hit to near-term free cash flow.`, impact: { co: { [c.ticker]: o.v } } };
});
T('gov_contract', 0.8, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Aerospace', 'Technology', 'AI', 'Telecom', 'Automotive', 'Healthcare', 'Energy'] }); if (!c) return null; const v = r.normal(.055, .025);
  return { cat: 'Investment', tickers: [c.ticker], status: 'confirmed', head: `${c.name} wins multi-year government contract worth ${money(r, 0.5, 9)}`, body: `The award gives ${c.name} visible revenue for years. Rivals that bid and lost may face questions.`, impact: { co: M({ [c.ticker]: v }, compMap(S, c, -v * .12)) }, leak: true };
});
T('buyback', 0.8, (S, r, p) => {
  const c = coOf(S, r, p, { tiers: ['blue', 'growth'], filter: x => x.margin > 0.05 }); if (!c) return null; const v = r.normal(.03, .015);
  return { cat: 'Corporate', tickers: [c.ticker], status: 'confirmed', head: `${c.name} authorises ${money(r, .5, 8)} share buyback`, body: `Management said the shares are undervalued. Buybacks support the price but can also mask slowing growth.`, impact: { co: { [c.ticker]: v } } };
});
T('div_change', 0.4, (S, r, p) => {
  const c = coOf(S, r, p, { filter: x => x.div > 0 }); if (!c) return null; const up = r.chance(.6);
  const v = up ? r.normal(.03, .015) : r.normal(-.06, .025);
  if (!up) { c.div = round(c.div * .6, 4); } else c.div = round(c.div * 1.12, 4);
  return { cat: 'Corporate', tickers: [c.ticker], status: 'confirmed', head: up ? `${c.name} raises dividend by 12%` : `${c.name} slashes dividend to conserve cash`, body: up ? 'Income investors rejoiced; growth investors shrugged.' : 'The cut was larger than analysts expected and puts income funds in a difficult position.', impact: { co: { [c.ticker]: v } } };
});
T('analyst_move', 1.6, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const up = r.chance(.6); const o = mix(r, [[.55, up ? .022 : -.022, .012], [.45, up ? -.004 : .004, .01]]);
  const bk = r.pick(BROKERS);
  return { cat: 'Analyst', tickers: [c.ticker], status: 'confirmed', head: up ? `${bk} upgrades ${c.name} to "overweight"` : `${bk} downgrades ${c.name} on valuation`, body: `${bk} ${up ? 'sees' : 'cites'} ${r.pick(['better-than-expected margins', 'stretched multiples', 'a stronger product cycle', 'macro uncertainty', 'competitive pressure'])}. Broker calls have a mixed record of moving shares for long.`, impact: { co: { [c.ticker]: o.v } } };
});
T('layoffs', 0.6, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const o = mix(r, [[.5, .03, .02], [.5, -.035, .02]]);
  return { cat: 'Corporate', tickers: [c.ticker], status: 'confirmed', head: `${c.name} to cut ${r.int(3, 18)}% of workforce`, body: `Management called it a "reset for profitable growth". Investors disagree on whether this signals efficiency or distress.`, impact: { co: { [c.ticker]: o.v } }, macro: { unemp: .02 } };
});
T('strike', 0.35, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Automotive', 'Aerospace', 'Consumer goods', 'Energy', 'Telecom', 'Entertainment'] }); if (!c) return null; const v = r.normal(-.04, .02);
  return { cat: 'Corporate', tickers: [c.ticker], status: 'confirmed', head: `Workers at ${c.name} walk out in pay dispute`, body: `Production has slowed at several sites. Union leaders and management have yet to schedule talks.`, impact: { co: M({ [c.ticker]: v }, compMap(S, c, -v * .15)) } };
});
T('disaster', 0.2, (S, r) => {
  const pt = r.pick(PORTS);
  return { cat: 'World', sev: 3, tickers: ['BMIN'].filter(t => active(S, t)), status: 'confirmed', head: `Typhoon batters ${pt}; insurers brace for claims`, body: `Port operations are suspended and supply chains face weeks of disruption. Property insurers expect heavy losses; manufacturers dependent on the port may see delays.`,
    impact: { co: { BMIN: r.normal(-.06, .02), KSTM: -.01, PXLN: -.008, EVHR: -.01 }, sec: { Automotive: -.006 } }, macro: { fear: 1 } };
});
T('cyberattack_sector', 0.2, (S, r) => {
  const sec = r.pick(['Banking', 'Telecom', 'Technology', 'Healthcare', 'Energy']);
  return { cat: 'Technology', sev: 3, tickers: sectorOf(S, sec).slice(0, 4), sectors: [sec], status: 'confirmed', head: `Coordinated cyberattack disrupts ${sec.toLowerCase()} firms`, body: `State-linked hackers are suspected. Services were restored within hours at most firms, but regulators are demanding answers.`, impact: { sec: { [sec]: r.normal(-.03, .012) } }, macro: { fear: 1.5 } };
});
// ---------------------------------------------------------------- crypto
T('crypto_reg', 0.3, (S, r) => ({ cat: 'Crypto', sev: 3, tickers: ['HVEX', 'LDGR', 'HSHF'].filter(t => active(S, t)), sectors: ['Crypto'], status: 'confirmed', head: 'Regulators propose tough rules for digital-asset exchanges',
  body: 'Licensing and custody requirements would raise costs for smaller players. Larger, regulated firms say clarity is welcome; the details may matter more than the headline.',
  impact: { co: { HVEX: r.normal(-.02, .04), LDGR: r.normal(-.04, .03), HSHF: r.normal(-.05, .03) }, fx: { CRYPTO: -0.012 } }, macro: { fear: 1 } }));
T('crypto_hack', 0.25, (S, r) => ({ cat: 'Crypto', sev: 3, tickers: ['HVEX', 'LDGR', 'HSHF'].filter(t => active(S, t)), sectors: ['Crypto'], status: 'confirmed', head: `Hackers drain ${money(r, .2, 1.4)} from DeFi lending protocol`, body: 'The exploit rattled confidence in decentralised finance. Exchanges say customer funds are safe.',
  impact: { co: { HVEX: -.025, LDGR: -.03, HSHF: -.04 }, fx: { CRYPTO: -.015 } }, stress: { crypto: 8 } }));
T('crypto_etf', 0.25, (S, r) => ({ cat: 'Crypto', sev: 3, tickers: ['HVEX', 'LDGR', 'HSHF'].filter(t => active(S, t)), sectors: ['Crypto'], status: status(r, [.6, .25, .15]), head: 'Regulator approves first spot digital-asset fund', body: 'The decision opens the door for traditional investors. Exchanges and miners stand to benefit from inflows.',
  impact: { co: { HVEX: .06, LDGR: .04, HSHF: .07 }, fx: { CRYPTO: .018 } }, stress: { crypto: -8 } }));
T('stablecoin_depeg', 0.12, (S, r) => ({ cat: 'Crypto', sev: 4, tickers: ['LDGR', 'HVEX'].filter(t => active(S, t)), sectors: ['Crypto'], status: 'confirmed', head: 'Major stablecoin slips below its dollar peg', body: 'Redemptions surged before the peg partly recovered. Payment firms and exchanges holding the token are scrambling to reassure customers.',
  impact: { co: { LDGR: r.normal(-.11, .03), HVEX: r.normal(-.06, .02), HSHF: -.05 }, fx: { CRYPTO: -.03 } }, stress: { crypto: 16 }, macro: { fear: 2 } }));
// ---------------------------------------------------------------- colour / noise
// ---------------------------------------------------------------- feel-good chaos
T('viral_moment', 0.7, (S, r, p) => {
  const c = coOf(S, r, p, { sectors: ['Consumer goods', 'Entertainment', 'Technology', 'Automotive', 'Telecom', 'AI', 'Crypto'] }); if (!c) return null; const o = mix(r, [[.75, .07, .035], [.25, .015, .02]]);
  const pr = prod(r, c.sector);
  return { cat: 'Viral', tickers: [c.ticker], status: r.chance(0.25) ? 'rumoured' : 'confirmed',
    head: r.pick([`${c.name}'s ${pr} goes viral after a celebrity unboxing`, `"${c.name} to the moon": retail traders pile in after a meme takes off`, `${c.name} CEO's dance video hits 40 million views`, `Shoppers queue overnight for ${c.name}'s ${pr}`]),
    body: `Social feeds are flooded with ${c.name} content. ${r.pick(['Analysts are scrambling to work out if any of it turns into sales.', 'Nobody can explain why, which has never stopped a rally before.', 'Short sellers are said to be "reconsidering their life choices".'])}`,
    impact: { co: M({ [c.ticker]: o.v }, compMap(S, c, -o.v * 0.1)) } };
});
T('record_quarter', 0.8, (S, r, p) => {
  const c = coOf(S, r, p, { filter: x => x.margin > 0 }); if (!c) return null; const o = mix(r, [[.8, .045, .02], [.2, .005, .015]]);
  return { cat: 'Earnings', tickers: [c.ticker], status: 'confirmed',
    head: r.pick([`${c.name} posts record sales month`, `${c.name} orders hit an all-time high`, `${c.name} smashes delivery targets`]),
    body: `Management credited ${r.pick(['demand nobody saw coming', 'a sales team running on pure espresso', 'new markets', 'a pricing change that worked'])}. A strong month is not a strong year, but it helps.`,
    impact: { co: M({ [c.ticker]: o.v }, supMap(S, c, o.v * 0.15)) }, leak: true };
});
T('noise', 2.2, (S, r, p) => {
  const c = coOf(S, r, p); if (!c) return null; const v = r.normal(0, .004);
  const heads = [`${c.name} CEO to headline Aurelis Industry Summit`, `${c.name} opens flagship campus`, `${c.name} appoints new chief financial officer`, `${c.name} backs youth coding programme`, `Survey: investors split on outlook for ${c.sector}`, `${c.name} reaffirms long-term targets at investor day`];
  return { cat: 'Corporate', sev: 1, tickers: [c.ticker], status: 'confirmed', head: r.pick(heads), body: 'Analysts saw little new information in the announcement, though some noted the tone was more cautious than last quarter.', impact: { co: { [c.ticker]: v } } };
});

export const TEMPLATES = TPL;

// ---------------------------------------------------------------- publication machinery
const MAG = [[0.012, 'Minimal'], [0.035, 'Moderate'], [0.08, 'Significant'], [9, 'Severe']];
function nextId(S, k) { S.ids[k] = (S.ids[k] || 0) + 1; return S.ids[k]; }

export function buildNews(S, tplId, params = {}) {
  const tp = TPL[tplId]; if (!tp) return null;
  const spec = tp.fn(S, S.rng.news, params);
  if (!spec) return null;
  spec.tpl = tplId; if (tp.fn && TPL[tplId].weight > 0 && !spec.leak) spec.leak = false;
  return spec;
}

function totalsFor(S, impact) {
  const tot = {};
  const add = (t, x) => { if (active(S, t) && isFinite(x)) tot[t] = (tot[t] || 0) + x; };
  if (impact.co) for (const t in impact.co) add(t, impact.co[t]);
  if (impact.sec) for (const s in impact.sec) for (const t of S.order) if (S.companies[t].sector === s) add(t, impact.sec[s]);
  if (impact.mkt) for (const t of S.order) add(t, impact.mkt * S.companies[t].loads.beta);
  return tot;
}

function applyImpact(S, impact, factor, persist) {
  const tot = totalsFor(S, impact); const rng = S.rng.news;
  for (const t in tot) {
    const x = tot[t] * factor;
    applyImpulse(S, t, x, { persist });
    if (Math.abs(x) > 0.04 && rng.chance(0.3)) applyImpulse(S, t, x * 0.3, { persist: 0, rate: 0.35 }); // overreaction that later corrects
  }
  if (impact.fx) for (const k in impact.fx) S.fxShock[k] = (S.fxShock[k] || 0) + impact.fx[k] * factor;
  return tot;
}

function applyMacro(S, m, f = 1) {
  if (!m) return; const mo = S.macro;
  if (m.fear) mo.fearBoost += m.fear * 2.2 * f;
  if (m.conf) mo.confidence = clamp(mo.confidence + m.conf * f, -1, 1);
  if (m.growth) mo.gShift += m.growth * f;
  if (m.infl) mo.iShift += m.infl * f;
  if (m.unemp) mo.uShift += m.unemp * f;
  if (m.oilTarget) mo.oilTarget = clamp(mo.oilTarget * Math.pow(m.oilTarget, f), 30, 220);
  if (m.rateDelta) mo.rate = clamp(mo.rate + m.rateDelta, 0.25, 12);
}

export function publishCustom(S, spec, o = {}) {
  const st = spec.status || 'confirmed';
  const factor = st === 'rumoured' ? 0.45 : st === 'disputed' ? 0.7 : 1;
  const persist = spec.persist ?? 0.85;
  const id = nextId(S, 'news');
  const tot = applyImpact(S, spec.impact || {}, factor, persist);
  applyMacro(S, spec.macro, factor);
  if (spec.stress) for (const k in spec.stress) S.macro.stress[k] = clamp(S.macro.stress[k] + spec.stress[k] * factor, 0, 100);
  const top = Object.keys(tot).sort((a, b) => Math.abs(tot[b]) - Math.abs(tot[a])).slice(0, 4);
  const maxAbs = Math.max(0, ...Object.values(tot).map(Math.abs), Math.abs(spec.impact?.mkt || 0) * 1.2);
  const mag = MAG.find(m => maxAbs < m[0])[1];
  const sev = spec.sev ?? clamp(1 + Math.round(maxAbs / 0.03), 1, 5);
  const tickers = (spec.tickers && spec.tickers.length ? spec.tickers : top).filter(t => S.companies[t]);
  const sectors = spec.sectors || [...new Set(tickers.map(t => S.companies[t].sector))].slice(0, 3);
  const item = {
    id, t: S.t, day: dayOf(S.t), cat: spec.cat, head: spec.head, body: spec.body, sev, status: st, mag,
    source: spec.source || (spec.channel === 'premium' ? PREMIUM_SOURCE : SOURCES[id % SOURCES.length]),
    channel: spec.channel || 'public', tickers, sectors, major: !!spec.major, eventId: spec.eventId || null,
    chainId: o.chainId || spec.chainId || null, parent: o.parent || spec.parent || null, leakOf: spec.leakOf || null,
    dir: Math.sign(tickers.reduce((a, t) => a + (tot[t] || 0), 0)),
    px: Object.fromEntries(top.map(t => [t, S.companies[t].price])), realized: null, updates: [],
  };
  S.news.push(item); if (S.news.length > 900) S.news.shift();
  for (const t of tickers) { const c = S.companies[t]; c.newsIds.push(id); if (c.newsIds.length > 40) c.newsIds.shift(); c.lastNewsT = S.t; }
  S.stats.newsCount++;
  // schedule: measure realised reaction, resolve rumours, chains
  schedule(S, S.t + TPD, { kind: 'measure', id });
  if (st !== 'confirmed' && spec.impact) {
    const truthP = spec.resolve?.p ?? 0.55; const d = spec.resolve?.delay || [10, 30];
    schedule(S, S.t + S.rng.news.int(d[0], d[1]), { kind: 'resolve', id, truth: S.rng.news.chance(truthP), factor, impact: spec.impact, persist, tickers, head: spec.head, cat: spec.cat });
  }
  if (spec.chain) for (const ch of spec.chain) if (S.rng.news.chance(ch.p)) schedule(S, S.t + S.rng.news.int(ch.delay[0], ch.delay[1]), { kind: 'tpl', tpl: ch.tpl, params: { ...(ch.params || {}) }, parent: id, chainId: item.chainId || id });
  if (spec.effects) for (const e of spec.effects) if (e.delist) {
    const c = S.companies[e.delist.ticker];
    if (c && c.status === 'active') delistCompany(S, c, e.delist.kind, c.price * (e.delist.mult || 1), settleHooks);
  }
  if (item.channel === 'public') onNewsSocial(S, item);
  return item;
}

export function schedule(S, t, data) {
  const q = S.queue; let i = q.length;
  while (i > 0 && q[i - 1].t > t) i--;
  q.splice(i, 0, { t, ...data });
}

/** process queue entries due at or before now */
export function processQueue(S) {
  const rng = S.rng.news;
  while (S.queue.length && S.queue[0].t <= S.t) {
    const q = S.queue.shift();
    if (q.kind === 'tpl') { const spec = buildNews(S, q.tpl, q.params); if (spec) publishCustom(S, spec, { parent: q.parent, chainId: q.chainId }); }
    else if (q.kind === 'publish') {
      if (q.cancel) { publishCustom(S, { cat: 'Retraction', sev: 1, channel: 'premium', status: 'confirmed', head: `RETRACTION: earlier report on ${q.about} did not materialise`, body: 'The Gilded Ledger withdraws its earlier report after sources changed their account.', tickers: q.tickers, impact: {}, leakOf: q.leakId }); const lk = S.news.find(n => n.id === q.leakId); if (lk) lk.updates.push({ t: S.t, text: 'Retracted: the story never materialised.' }); }
      else { const it = publishCustom(S, q.spec); const lk = S.news.find(n => n.id === q.leakId); if (lk) { lk.updates.push({ t: S.t, text: 'Confirmed: this story is now public.' }); lk.confirmedBy = it.id; } }
    }
    else if (q.kind === 'resolve') {
      const orig = S.news.find(n => n.id === q.id);
      const sign = q.truth ? (1 - q.factor) : -q.factor;
      const tot = applyImpact(S, q.impact, sign, q.persist);
      if (orig) { orig.status = q.truth ? 'confirmed' : 'denied'; orig.updates.push({ t: S.t, text: q.truth ? 'Update: the report has been confirmed.' : 'Update: the report was denied or proved unfounded.' }); }
      publishCustom(S, { cat: q.cat, sev: 2, status: 'confirmed', head: q.truth ? `CONFIRMED: ${q.head}` : `DENIED: ${q.head}`, body: q.truth ? 'The company or regulators have now confirmed the earlier reports.' : 'The earlier reports have been denied. Prices that moved on the rumour are adjusting.', tickers: q.tickers, impact: {}, parent: q.id });
    }
    else if (q.kind === 'measure') {
      const it = S.news.find(n => n.id === q.id); if (it) { it.realized = {}; for (const t in it.px) { const c = S.companies[t]; if (c) it.realized[t] = round(c.price / it.px[t] - 1, 4); } }
    }
    else if (q.kind === 'fn' && FN[q.fn]) FN[q.fn](S, q.args);
  }
  void rng;
}
export const FN = {}; // named deferred callbacks, registered by other modules

const BASE_RATE = 1.35 / TPD;
export function randomNews(S) {
  const rng = S.rng.news; const w = WEATHER[S.weather.id];
  const rate = BASE_RATE * (1 + 0.5 * (w.vol - 1)) * (S.newsMult ?? 1);
  let n = rng.chance(rate) ? 1 : 0; if (n && rng.chance(rate * 0.3)) n++;
  for (let i = 0; i < n; i++) {
    const cand = ORDER.filter(t => !t.gate || t.gate(S));
    const tp = rng.weighted(cand, t => t.weight * (S.tplBoost?.[t.id] || 1));
    const spec = buildNews(S, tp.id, {});
    if (!spec) continue;
    if (spec.leak && rng.chance(0.4) && S.t > 60) {
      const lead = rng.int(6, 14); const real = !rng.chance(0.14);
      const leakSpec = { cat: spec.cat, sev: Math.max(1, (spec.sev || 2) - 1), channel: 'premium', status: 'rumoured', tickers: spec.tickers, impact: {}, source: PREMIUM_SOURCE,
        head: `SOURCES: ${spec.head.replace(/^(.)/, c => c.toLowerCase())}`, body: `The Gilded Ledger understands this development is imminent. Our sources describe it as ${real ? 'very likely to be announced' : 'under discussion, with no final decision'}. Unconfirmed.` };
      const lk = publishCustom(S, leakSpec);
      schedule(S, S.t + lead, { kind: 'publish', spec, cancel: !real, leakId: lk.id, about: spec.tickers[0] || 'the sector', tickers: spec.tickers });
    } else publishCustom(S, spec);
  }
}
