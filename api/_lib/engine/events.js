// Major, multi-stage economic events. Each stage shifts drifts, valuation premiums and macro
// variables for its duration, and drip-feeds follow-on news. Some are rare and memorable.
import { TPD, dayOf } from './calendar.js';
import { clamp, fmtBn, round } from './util.js';
import { publishCustom, schedule, FN, mapOf } from './news.js';
import { centralBank } from './macro.js';
import { bankrupt } from './corporate.js';
import { REGIONS } from './data/world.js';

const act = (S, ts) => ts.filter(t => S.companies[t] && S.companies[t].status === 'active');
const co = (S, o) => { const r = {}; for (const t in o) if (S.companies[t]?.status === 'active') r[t] = o[t]; return r; };
const N = (cat, head, body, impact = {}, x = {}) => ({ cat, head, body, impact, status: 'confirmed', ...x });
const spec = (S, ts) => act(S, ts);

export const MAJOR = {
  AI_BUBBLE: {
    name: 'The AI Bubble', blurb: 'AI valuations balloon on hype, then collide with the problem of profitability.', cooldown: 240, premiumKeys: ['AI'],
    prob: S => 0.0028 * (S.premium.AI < 1.2 ? 1 : 0.3),
    stages: [
      { name: 'Mania', days: [26, 38], drift: { AIF: 0.0006, 'S:AI': 0.0003 }, premium: { AI: 1.9 }, fear: -4,
        head: 'AI MANIA: investors stampede into artificial intelligence stocks', body: 'Funding rounds are doubling in size and every chatbot is "transformative". Strategists call it the start of a new era. Sceptics remember other eras.',
        impact: { sec: { AI: 0.05 }, mkt: 0.006 }, macro: { conf: 0.05 },
        news: [{ at: 0.2, b: (S, r) => N('AI', `Record funding: ${S.companies.CRTX?.name || 'AI lab'} raises ${fmtBn(r.int(4, 14) * 1e9)} at sky-high valuation`, 'Investors piled in at a valuation more than 40 times revenue.', { co: co(S, { CRTX: .04, AXCG: .05, MFRG: .02 }) }) },
          { at: 0.45, b: (S, r) => N('Markets', 'Retail investors pile into AI funds; trading volumes hit record', 'Brokerages reported the busiest weeks on record, led by small-cap AI names.', { sec: { AI: .02 } }) },
          { at: 0.7, b: (S, r) => N('AI', 'Voltaris order book stretches into next year on AI chip demand', 'Data-centre customers are placing multi-year orders to secure supply.', { co: co(S, { VLTS: .045, NRLT: .015 }) }) }] },
      { name: 'Euphoria', days: [12, 20], drift: { AIF: 0.0003, 'S:AI': 0.0002 }, premium: { AI: 2.4 }, fear: -2,
        head: 'AI stocks double in months as warnings mount', body: 'Valuations have decoupled from earnings. A few prominent voices have started to say so out loud.', impact: { sec: { AI: 0.025 } },
        news: [{ at: 0.3, b: (S, r) => N('Analyst', 'Analysts warn AI valuations are "detached from earnings"', 'Three major brokers cautioned clients, though each kept buy ratings on their favourite names.', { sec: { AI: -.012 } }, { status: 'confirmed' }) },
          { at: 0.65, b: (S, r) => N('AI', 'Start-up with no revenue valued at $18B in latest round', 'The company has "an exciting roadmap". It does not have customers.', { co: co(S, { AXCG: .06 }), sec: { AI: .008 } }) }] },
      { name: 'Cracks', days: [8, 14], drift: { AIF: -0.0003, 'S:AI': -0.0002 }, premium: { AI: 1.5 }, fear: 4,
        head: 'Doubts creep in as AI profits lag the promises', body: 'Several large AI buyers are quietly cutting experimental budgets. The market has not yet decided whether this is a wobble or a turn.', impact: { sec: { AI: -0.04 } },
        news: [{ at: 0.2, b: (S, r) => N('AI', 'Cortexa burns cash faster than forecast', 'Compute costs ate more than expected. The company says it has "ample runway".', { co: co(S, { CRTX: -.07, AXCG: -.05 }) }) },
          { at: 0.55, b: (S, r) => N('AI', 'Enterprise customers pause AI spending, survey finds', 'The survey of 400 firms found a third had delayed projects. Vendors dispute the sample.', { sec: { AI: -.02 } }, { status: 'disputed', resolve: { p: 0.6, delay: [12, 30] } }) },
          { at: 0.85, b: (S, r) => N('Markets', 'Short-sellers circle AI darlings as insiders sell', 'Disclosures show executives at several AI firms sold stock in recent weeks.', { sec: { AI: -.015 } }) }] },
      { name: 'Deflation', days: [14, 24], drift: { AIF: -0.0012, 'S:AI': -0.0006, 'S:Technology': -0.0002 }, premium: { AI: 0.6 }, fear: 12, funding: true,
        head: 'THE AI BUBBLE BURSTS: AI stocks collapse as investors flee', body: 'A disappointing earnings season from a bellwether triggered a wave of selling. Cash-burning AI companies are suddenly struggling to raise money.',
        impact: { sec: { AI: -0.09, Technology: -0.03 }, mkt: -0.018, co: { VLTS: -0.06 } }, macro: { conf: -0.1 },
        news: [{ at: 0.15, b: (S, r) => N('AI', 'Axiom Cognition slashes forecast, announces layoffs', 'The start-up said revenue would be a fraction of earlier guidance.', { co: co(S, { AXCG: -.18 }) }) },
          { at: 0.4, b: (S, r) => N('AI', 'Chipmaker trims outlook as AI customers cancel orders', 'Orders for advanced accelerators were pushed out, management said.', { co: co(S, { VLTS: -.08 }) }) },
          { at: 0.65, b: (S, r) => N('AI', 'Lenders freeze credit lines to AI infrastructure firms', 'Banks are reassessing collateral values for data-centre projects.', { sec: { AI: -.03 }, co: co(S, { ALDC: -.02 }) }) },
          { at: 0.85, b: (S, r) => N('Markets', 'AI sell-off enters third week; funds report heavy redemptions', 'Strategists said the unwinding is far from over, though some bargain hunters are circling the profitable survivors.', { sec: { AI: -.02 } }) }] },
      { name: 'Aftermath', days: [20, 30], drift: { AIF: 0.0003, 'S:AI': 0.0002 }, premium: { AI: 0.95 }, fear: -6, unfund: true,
        head: 'Survivors emerge from the AI bust: profitable names recover first', body: 'Investors are rediscovering earnings. Firms with real customers and cash flow are rallying; the rest remain in the doghouse.', impact: { co: { NRLT: .03, HLXC: .015, MFRG: .02 } },
        news: [{ at: 0.4, b: (S, r) => N('AI', 'Neuralyth posts profit beat as AI winners separate from losers', 'Its margins held up while rivals reported losses.', { co: co(S, { NRLT: .035, CRTX: -.01 }) }) }] },
    ],
  },
  BANKING_CRISIS: {
    name: 'The Banking Crisis', blurb: 'Bank losses trigger a loss of confidence, deposit flight and a credit crunch.', cooldown: 260, premiumKeys: [],
    prob: S => 0.0018 + (S.macro.stress.banking > 50 ? 0.1 : S.macro.stress.banking > 35 ? 0.02 : 0),
    start: (S, ev, r) => { const b = act(S, ['IVTR', 'ALDC', 'PRSM']); const shuffled = r.shuffle(b.length ? b : S.order.filter(t => S.companies[t].sector === 'Banking' && t !== 'BMIN')); ev.data.weak = shuffled[0]; ev.data.second = shuffled[1] || shuffled[0]; },
    stages: [
      { name: 'Tremors', days: [5, 9], drift: { 'S:Banking': -0.0006 }, fear: 6, stress: 30,
        head: (S, ev) => `BANK SHOCK: ${S.companies[ev.data.weak]?.name || 'a lender'} reveals massive loan losses`, body: 'Bad commercial property loans have wiped out a year of profits. Investors are asking who else is exposed.',
        impact: (S, ev) => ({ co: { [ev.data.weak]: -0.14 }, sec: { Banking: -0.03 }, mkt: -0.008 }),
        news: [{ at: 0.4, b: (S, r) => N('Banking', 'Credit spreads widen as investors fret over bank exposures', 'The cost of insuring bank debt jumped to the highest in two years.', { sec: { Banking: -.015 } }) },
          { at: 0.75, b: (S, r) => N('Government', 'Regulator launches emergency review of lender balance sheets', 'Officials said they were "monitoring the situation closely".', { sec: { Banking: -.01 } }) }] },
      { name: 'Contagion', days: [6, 12], drift: { 'S:Banking': -0.001, MKT: -0.0003 }, fear: 10, stress: 25, funding: true, macro: { growth: -0.6, unemp: 0.2 },
        head: (S, ev) => `CONTAGION: depositors run on ${S.companies[ev.data.second]?.name || 'a second bank'}; interbank lending freezes`, body: 'Queues formed outside branches and online withdrawals surged. Banks are refusing to lend to each other.',
        impact: (S, ev) => ({ co: { [ev.data.second]: -0.15, BMIN: -0.05 }, sec: { Banking: -0.04, Crypto: -0.03, AI: -0.012 }, mkt: -0.02 }),
        news: [{ at: 0.25, b: (S, r) => N('Banking', 'Insurers hit by bank bond losses', 'Bastion Mutual and peers are marking down corporate bond holdings tied to troubled lenders.', { co: co(S, { BMIN: -.04 }) }) },
          { at: 0.5, b: (S, r) => N('Markets', 'Investors rotate into defensive stocks as bank worries spread', 'Healthcare, staples and telecoms outperformed in a sea of red.', { sec: { Healthcare: .015, 'Consumer goods': .012, Telecom: .012, AI: -.015, Crypto: -.02 }, mkt: -.006 }) },
          { at: 0.8, b: (S, r) => N('Banking', 'Credit crunch: companies struggle to roll over loans', 'Businesses report banks refusing new credit lines.', { sec: { Banking: -.015, Automotive: -.02, Entertainment: -.015 } }) }] },
      { name: 'Panic', days: [5, 9], drift: { 'S:Banking': -0.0012, MKT: -0.0007 }, fear: 15, stress: 20, macro: { growth: -1.0 },
        head: (S, ev) => `PANIC: ${S.companies[ev.data.weak]?.name || 'a major lender'} on the brink as markets tumble`, body: 'Trading was halted in several bank stocks. Officials are in emergency talks. This is no longer a sector problem.',
        impact: { sec: { Banking: -0.06 }, mkt: -0.03 },
        enter: (S, ev, r) => { const c = S.companies[ev.data.weak]; if (c && c.status === 'active' && r.chance(0.65) && c.ticker !== 'MRFB') bankrupt(S, c, `${c.name} could not withstand a run on deposits and has failed.`); },
        news: [{ at: 0.4, b: (S, r) => N('Banking', 'Trading halted in bank stocks as selling accelerates', 'Exchanges triggered circuit breakers twice in one session.', { sec: { Banking: -.03 }, mkt: -.012 }) },
          { at: 0.8, b: (S, r) => N('Government', 'Central bank and Treasury in emergency talks', 'Officials declined to comment but cancelled scheduled appearances.', { mkt: -.004 }) }] },
      { name: 'Intervention', days: [6, 10], drift: { 'S:Banking': 0.0006, MKT: 0.0006 }, fear: -10, unfund: true,
        head: 'RESCUE: government backstop and emergency rate cut calm markets', body: 'The Treasury guaranteed deposits and the central bank cut rates and opened liquidity lines. Panic is easing, but trust will take time to rebuild.',
        impact: { sec: { Banking: 0.05 }, mkt: 0.025 },
        enter: (S, ev, r) => { centralBank(S, { forceDelta: -0.5, emergency: true, head: 'Aurelian Central Bank slashes rates by 50bp in emergency move', body: 'The surprise cut came alongside a government guarantee of bank deposits and fresh liquidity facilities.' }); },
        news: [{ at: 0.5, b: (S, r) => N('Banking', 'Banks tap emergency liquidity as funding markets thaw', 'Usage of the central bank facility peaked and began to fall, a sign of stabilising nerves.', { sec: { Banking: .02 } }) }] },
      { name: 'Recovery', days: [24, 40], drift: { 'S:Banking': 0.0003, MKT: 0.00015 }, fear: -6, macro: { growth: 0.5 },
        head: 'Banking sector stabilises, but the scars remain', body: 'Lending is recovering slowly. Regulators are drawing up tougher capital rules, and some banks have emerged as bargains.', impact: { sec: { Banking: 0.02 } }, news: [] },
    ],
  },
  ENERGY_SHOCK: {
    name: 'The Energy Shock', blurb: 'A supply disruption sends oil soaring, rewarding producers and punishing transport and manufacturing.', cooldown: 200, premiumKeys: [],
    prob: S => 0.0034,
    stages: [
      { name: 'Supply disruption', days: [5, 8], drift: { OIL: 0.0035 }, oil: 112, fear: 5, macro: { infl: 0.8 },
        head: 'ENERGY SHOCK: pipeline sabotage and output cuts send oil soaring', body: 'A major supply route has been cut and producers are holding back output. Crude jumped by double digits in days.',
        impact: { co: { PGEN: .06, ATDL: .09, SLRG: .03, STRW: -.09, KSTM: -.03, RDGB: -.045 }, mkt: -0.01 }, news: [] },
      { name: 'Peak prices', days: [10, 18], drift: { OIL: 0.001 }, oil: 138, fear: 3, macro: { growth: -0.5, infl: 0.6 }, premium: { GREEN: 1.2 },
        head: 'Oil tops $130 as shortages bite; governments weigh rationing', body: 'Airlines are cancelling flights and factories are cutting shifts. Energy majors are posting record profits.',
        impact: { co: { PGEN: .03, ATDL: .05, SLRG: .04, STRW: -.07 }, mkt: -0.008 },
        news: [{ at: 0.3, b: (S, r) => N('Energy', 'Petrogen posts record profit as oil surges', 'The oil major benefited from realised prices well above its planning assumption.', { co: co(S, { PGEN: .03, ATDL: .02 }) }) },
          { at: 0.55, b: (S, r) => N('Corporate', 'Stratos Airways grounds a fifth of its fleet', 'Soaring jet fuel costs have made many routes unprofitable.', { co: co(S, { STRW: -.06, SKYW: -.01 }) }) },
          { at: 0.8, b: (S, r) => N('Corporate', 'Truckers strike over fuel costs; supply chains strained', 'Freight bottlenecks are adding to inflation worries.', { co: co(S, { RDGB: -.04, EVHR: -.02 }), sec: { 'Consumer goods': -.006 } }) }] },
      { name: 'Relief', days: [8, 14], drift: { OIL: -0.0015 }, oil: 92, fear: -3,
        head: 'Reserve release and diplomacy ease the oil squeeze', body: 'Governments tapped strategic stockpiles and a partial reopening of the supply route eased prices.', impact: { co: { STRW: .06, RDGB: .03, KSTM: .02, PGEN: -.03, ATDL: -.05 }, mkt: .008 }, news: [] },
      { name: 'Normalisation', days: [20, 30], oil: 74, fear: -2, macro: { infl: -0.5 },
        head: 'Oil returns towards normal as windfall-tax debate begins', body: 'Politicians are eyeing record energy profits. Consumers are still feeling the earlier price spike.', impact: { co: { PGEN: -.01 } },
        news: [{ at: 0.4, b: (S, r) => N('Government', 'Treasury floats windfall tax on energy profits', 'Oil majors warned a tax would deter investment.', { co: co(S, { PGEN: -.03, ATDL: -.025 }) }, { status: 'rumoured', resolve: { p: .5, delay: [20, 50] } }) }] },
    ],
  },
  CRYPTO_COLLAPSE: {
    name: 'The Crypto Collapse', blurb: 'A major unlisted exchange fails, spreading losses to companies exposed to digital assets.', cooldown: 220, premiumKeys: ['CRYPTO'],
    prob: S => 0.0026,
    stages: [
      { name: 'Whispers', days: [3, 6], drift: { CRYPTO: -0.0006 }, fear: 2, crypto: 15,
        head: 'Rumours swirl as Zenith Digital Exchange pauses withdrawals', body: 'Customers report delays withdrawing funds from Zenith, one of the largest private exchanges. The company blamed "technical issues". Rumours of a liquidity hole spread across social media.',
        status: 'rumoured', impact: { co: { HVEX: -.04, LDGR: -.03, HSHF: -.05 }, fx: { CRYPTO: -0.02 } }, resolve: { p: 0.9, delay: [10, 20] }, news: [] },
      { name: 'Collapse', days: [3, 5], drift: { CRYPTO: -0.0025 }, premium: { CRYPTO: 0.45 }, fear: 8, crypto: 40,
        head: 'CRYPTO COLLAPSE: Zenith Digital Exchange files for insolvency, freezing customer funds', body: 'The exchange admitted a multi-billion shortfall. Customers may recover little. Everyone in digital assets is now trying to work out who else was exposed.',
        impact: { co: { HVEX: -.12, LDGR: -.16, HSHF: -.2, ALDC: -.05 }, fx: { CRYPTO: -0.09 }, sec: { Crypto: -0.02 } },
        news: [{ at: 0.5, b: (S, r) => N('Crypto', 'Miners dump tokens to raise cash as prices tumble', 'Hashforge said it sold part of its reserves to cover power costs.', { co: co(S, { HSHF: -.08 }) }) }] },
      { name: 'Contagion', days: [8, 12], drift: { CRYPTO: -0.0008 }, premium: { CRYPTO: 0.4 }, fear: 4, crypto: 20,
        head: 'Contagion spreads as crypto lenders halt redemptions and regulators circle', body: 'Lenders and funds with exposure to Zenith are freezing withdrawals. Regulators are drafting emergency rules.',
        impact: { co: { LDGR: -.06, HVEX: -.04, ALDC: -.03 }, sec: { Crypto: -0.02 } },
        news: [{ at: 0.4, b: (S, r) => N('Crypto', 'Aldgate Capital discloses crypto lending losses', 'The bank said exposure was "limited and provisioned". Investors are not entirely convinced.', { co: co(S, { ALDC: -.05 }) }) }],
        enter: (S, ev, r) => { if (r.chance(0.5)) schedule(S, S.t + r.int(6, 24), { kind: 'tpl', tpl: 'stablecoin_depeg', params: {} }); } },
      { name: 'Rebuild', days: [20, 35], drift: { CRYPTO: 0.0004 }, premium: { CRYPTO: 0.7 }, fear: -4,
        head: 'Crypto stabilises under tougher rules; survivors gain share', body: 'The largest regulated exchanges have picked up customers fleeing failed rivals. Rebuilding trust will take years.',
        impact: { co: { HVEX: .05, LDGR: .03 } }, news: [] },
    ],
  },
  TECH_BOOM: {
    name: 'The Technology Boom', blurb: 'A genuine breakthrough sparks a long period of growth, investment and optimism.', cooldown: 240, premiumKeys: ['AI'],
    prob: S => 0.0032,
    stages: [
      { name: 'Breakthrough', days: [3, 5], drift: { MKT: 0.0003, AIF: 0.0004 }, premium: { AI: 1.25 }, fear: -3,
        head: 'TECHNOLOGY BOOM: lab unveils room-temperature superconducting chips', body: 'Independent researchers have reproduced the result. The technology promises vast efficiency gains in computing, power and transport.',
        impact: { co: { VLTS: .14, HLXC: .05, QLOM: .1, NRLT: .04, PXLN: .04, AXCG: .08 }, sec: { Technology: .03, AI: .025 }, mkt: .012, fx: { AIF: .01 } }, macro: { conf: 0.06 }, news: [] },
      { name: 'Adoption', days: [18, 28], drift: { 'S:Technology': 0.0004, 'S:AI': 0.0003, MKT: 0.0002, CONS: 0.0002 }, macro: { growth: 0.8, conf: 0.04 }, fear: -4,
        head: 'Adoption accelerates: factories and data centres race to retool', body: 'Order books are filling and capital spending is surging. Productivity forecasts are being revised sharply upward.', impact: { sec: { Technology: .02, Automotive: .01 } },
        news: [{ at: 0.3, b: (S, r) => N('Technology', 'Orders flood in at Voltaris as customers retool', 'Backlog hit a record, with deliveries sold out for the year.', { co: co(S, { VLTS: .05 }) }) },
          { at: 0.65, b: (S, r) => N('Product', 'Carmakers announce next-generation platforms built on new chips', 'Volta Dynamics and Kestrel both promised range and cost improvements.', { co: co(S, { VLTD: .04, KSTM: .03, AUTN: .05 }) }) }] },
      { name: 'Boom', days: [18, 30], drift: { MKT: 0.00025 }, premium: { AI: 1.4 }, macro: { growth: 0.4, infl: 0.3, conf: 0.05 }, fear: -4,
        head: 'Boom times: record listings and soaring confidence', body: 'Households and firms are spending freely. Some officials are starting to talk about overheating.', impact: { mkt: .01 },
        news: [{ at: 0.3, b: (S, r) => N('Economy', 'Consumer confidence hits multi-year high', 'Households reported record optimism about jobs and incomes.', { sec: { 'Consumer goods': .012, Entertainment: .012 }, mkt: .004 }) },
          { at: 0.7, b: (S, r) => N('Markets', 'Valuation worries return as boom enters its third month', 'Bears say prices are racing ahead of even optimistic earnings.', { sec: { Technology: -.01 } }, { status: 'confirmed' }) }] },
      { name: 'Maturation', days: [14, 22], drift: { MKT: -0.0001, 'S:Technology': -0.0002 }, premium: { AI: 1.1 }, fear: 2,
        head: 'Boom matures as central bank leans against overheating', body: 'Policymakers raised rates to cool the economy. Growth stocks wobbled, but the underlying technology revolution is real.', impact: { sec: { Technology: -.015 }, mkt: -.006 },
        enter: (S, ev, r) => { centralBank(S, { forceDelta: 0.25, head: 'Aurelian Central Bank raises rates to cool booming economy', body: 'Policymakers cited strong demand and rising prices. Markets had partly anticipated the move.' }); }, news: [] },
    ],
  },
  RECESSION: {
    name: 'The Great Slowdown', blurb: 'Growth stalls and unemployment climbs. Cyclical sectors suffer; defensive sectors cope.', cooldown: 280, premiumKeys: [],
    prob: S => 0.0020 + (S.macro.growth < 1.2 ? 0.006 : 0),
    stages: [
      { name: 'Warning signs', days: [10, 16], drift: { MKT: -0.00012, CONS: -0.0003 }, macro: { growth: -1.2, unemp: 0.4, conf: -0.1 }, fear: 4,
        head: 'Recession fears mount as factory orders slump and the yield curve inverts', body: 'Surveys point to falling demand. Some economists see a soft landing; others have started drafting recession notes.', impact: { sec: { Automotive: -.015, 'Consumer goods': -.008, Entertainment: -.012 }, mkt: -.006 },
        news: [{ at: 0.4, b: (S, r) => N('Economy', 'Retail sales disappoint for third month', 'Spending on big-ticket items fell sharply.', { co: co(S, { EVHR: -.04, MVLC: -.03 }) }) }] },
      { name: 'Contraction', days: [24, 38], drift: { MKT: -0.00022, CONS: -0.0006, 'S:Automotive': -0.0003 }, macro: { growth: -3.2, unemp: 1.4, infl: -0.8, conf: -0.2 }, fear: 8, funding: true,
        head: 'RECESSION: economy contracts for second straight quarter as unemployment surges', body: 'Businesses are cutting jobs and investment. Cyclical sectors are in the firing line; healthcare and staples are holding up better.', impact: { sec: { Automotive: -.04, Entertainment: -.03, Aerospace: -.03, Banking: -.02, Technology: -.02 }, mkt: -.02 },
        news: [{ at: 0.2, b: (S, r) => N('Economy', 'Layoffs sweep manufacturing as orders dry up', 'Job cuts were announced at a string of industrial employers.', { sec: { Automotive: -.02 } }) },
          { at: 0.45, b: (S, r) => N('Corporate', 'Luxury demand falls as wealthy shoppers retrench', 'Even high-end customers are spending less.', { co: co(S, { MVLC: -.05 }) }) },
          { at: 0.7, b: (S, r) => N('Corporate', 'Corporate bankruptcies rise to decade high', 'Highly indebted companies are struggling to refinance.', { sec: { Entertainment: -.015, Aerospace: -.015 } }) }] },
      { name: 'Trough and stimulus', days: [10, 16], drift: { MKT: 0.0003 }, macro: { growth: 1.5, conf: 0.1 }, fear: -8, unfund: true,
        head: 'Stimulus package and rate cut signal the trough', body: 'The government unveiled a spending programme and the central bank cut rates. Markets rallied sharply on hopes the worst is over.', impact: { mkt: .02 },
        enter: (S, ev, r) => { centralBank(S, { forceDelta: -0.5, emergency: true, head: 'Aurelian Central Bank cuts rates by 50bp to fight recession', body: 'Policymakers cited a deteriorating labour market. The cut accompanied a large government stimulus announcement.' }); }, news: [] },
      { name: 'Recovery', days: [30, 45], drift: { MKT: 0.00012, CONS: 0.0003 }, macro: { growth: 1.0, conf: 0.1 }, fear: -4,
        head: 'Green shoots: economy exits recession', body: 'Hiring is stabilising and consumers are cautiously spending again. The rebound will not be even across sectors.', impact: { sec: { Automotive: .015, Entertainment: .012 } }, news: [] },
    ],
  },
  TRADE_WAR: {
    name: 'Tariff Tumult', blurb: 'Retaliatory tariffs disrupt supply chains and hit exporters.', cooldown: 180, premiumKeys: [],
    prob: S => 0.0028,
    start: (S, ev, r) => { ev.data.a = r.pick(REGIONS); ev.data.b = r.pick(REGIONS.filter(x => x !== ev.data.a)); },
    stages: [
      { name: 'Escalation', days: [8, 12], drift: { MKT: -0.0002, 'S:Automotive': -0.0003, 'S:Technology': -0.0002 }, macro: { infl: 0.4, growth: -0.5 }, fear: 4,
        head: (S, ev) => `TRADE WAR: sweeping tariffs imposed between ${ev.data.a} and ${ev.data.b}`, body: 'Duties of up to 25% hit cars, electronics and consumer goods. Exporters and companies with complex supply chains face higher costs.',
        impact: { sec: { Automotive: -.04, Technology: -.035, 'Consumer goods': -.025, Aerospace: -.02, Energy: .01 }, mkt: -.01 }, news: [] },
      { name: 'Retaliation', days: [10, 16], drift: { 'S:Technology': -0.0003, 'S:Automotive': -0.0002, MKT: -0.0001 }, fear: 3,
        head: 'Retaliation: partners hit back as supply chains scramble', body: 'Counter-tariffs target farm goods and aircraft. Executives are reconsidering factory locations.', impact: { sec: { Aerospace: -.03, Technology: -.02, Automotive: -.02 }, mkt: -.008 },
        news: [{ at: 0.5, b: (S, r) => N('Trade', 'Skyward Aerospace warns tariffs could delay deliveries', 'The planemaker said parts for its latest jets cross several borders.', { co: co(S, { SKYW: -.04 }) }) }] },
      { name: 'Truce', days: [10, 16], drift: { MKT: 0.0004 }, fear: -4,
        head: 'Truce: negotiators agree to roll back most tariffs', body: 'A phased rollback was announced after a summit. Exporters rallied; the damage to confidence will take longer to repair.', impact: { sec: { Automotive: .035, Technology: .03, 'Consumer goods': .02, Aerospace: .025 }, mkt: .012 }, news: [] },
    ],
  },
  GREEN_SUBSIDY: {
    name: 'The Green Mobility Act', blurb: 'A government subsidy transforms electric vehicles and clean energy.', cooldown: 200, premiumKeys: ['GREEN'],
    prob: S => 0.003,
    stages: [
      { name: 'Announcement', days: [3, 5], drift: { GREENF: 0.0006 }, premium: { GREEN: 1.5 }, fear: -2,
        head: 'SUBSIDY SHOCK: government unveils sweeping green mobility and energy subsidies', body: 'Tax credits, grants and procurement targets will reward electric vehicles, storage and renewables. Oil and diesel-dependent firms face higher costs.',
        impact: { co: { SLRG: .12, VLTD: .09, FSNW: .12, NVCL: .1, CBLT: .12, KSTM: .04, PGEN: -.04, ATDL: -.05, RDGB: -.03 }, fx: { GREENF: .02 } }, news: [] },
      { name: 'Implementation', days: [24, 36], drift: { GREENF: 0.0003 }, macro: { growth: 0.2 }, fear: -2,
        head: 'Subsidy rollout lifts clean-energy order books', body: 'Utilities and carmakers are bringing forward investment decisions. Supply chains are struggling to keep up.', impact: { co: { SLRG: .02, VLTD: .015 } },
        news: [{ at: 0.3, b: (S, r) => N('Investment', 'Solaris Grid wins multi-year grid storage contracts', 'The awards are underpinned by the new subsidy scheme.', { co: co(S, { SLRG: .06, NVCL: .04 }) }) },
          { at: 0.7, b: (S, r) => N('Corporate', 'Kestrel Motors accelerates electric pivot; shares jump', 'The legacy automaker said subsidies make its transition plan viable.', { co: co(S, { KSTM: .07, RDGB: -.01 }) }) }] },
      { name: 'Fatigue', days: [18, 28], drift: { GREENF: -0.0004 }, premium: { GREEN: 1.05 },
        head: 'Subsidy fatigue: critics question the cost as green stocks cool', body: 'A budget watchdog warned of ballooning costs. Investors are asking whether the boom was a policy sugar-rush.', impact: { co: { SLRG: -.03, VLTD: -.02, FSNW: -.04 } }, news: [] },
    ],
  },
};
const ORDER_IDS = Object.keys(MAJOR);

export function createEvents() { return { active: [], history: [], cooldown: {}, lastStart: -999, uid: 0 }; }

function enterStage(S, ev, idx) {
  const def = MAJOR[ev.id], st = def.stages[idx], r = S.rng.events;
  ev.stage = idx; ev.stageStart = S.t;
  ev.stageEnd = S.t + r.int(st.days[0] * TPD, st.days[1] * TPD);
  const dur = ev.stageEnd - ev.stageStart;
  if (st.drift) for (const k in st.drift) S.drifts.push({ key: k, v: st.drift[k], from: S.t, until: ev.stageEnd, src: ev.uid });
  if (st.premium) for (const k in st.premium) S.premiumTarget[k] = st.premium[k];
  if (st.oil) S.macro.oilBase = st.oil;
  if (st.fear) S.macro.fearBoost += st.fear * 2.2;
  if (st.stress) S.macro.stress.banking = clamp(S.macro.stress.banking + st.stress, 0, 100);
  if (st.crypto) S.macro.stress.crypto = clamp(S.macro.stress.crypto + st.crypto, 0, 100);
  if (st.funding) S.fundingStress = Math.max(S.fundingStress, ev.stageEnd + TPD * 10);
  if (st.unfund) S.fundingStress = 0;
  const m = st.macro; if (m) { if (m.growth) S.macro.gShift += m.growth; if (m.infl) S.macro.iShift += m.infl; if (m.unemp) S.macro.uShift += m.unemp; if (m.conf) S.macro.confidence = clamp(S.macro.confidence + m.conf, -1, 1); }
  if (st.enter) st.enter(S, ev, r);
  const head = typeof st.head === 'function' ? st.head(S, ev) : st.head;
  const impact = typeof st.impact === 'function' ? st.impact(S, ev) : st.impact;
  const tickers = Object.keys(impact?.co || {}).filter(t => S.companies[t]);
  publishCustom(S, { cat: 'Major Event', sev: 5, major: true, eventId: ev.id, chainId: `E${ev.uid}`, head, body: st.body, status: st.status || 'confirmed', tickers: tickers.slice(0, 4), sectors: Object.keys(impact?.sec || {}).slice(0, 3), impact: impact || {}, resolve: st.resolve, persist: 0.9 });
  (st.news || []).forEach((n, i) => schedule(S, S.t + Math.max(1, Math.floor(n.at * dur)), { kind: 'fn', fn: 'eventNews', args: { uid: ev.uid, stage: idx, i } }));
}

FN.eventNews = (S, a) => {
  const ev = S.events.active.find(e => e.uid === a.uid); if (!ev || ev.stage !== a.stage) return;
  const n = MAJOR[ev.id].stages[a.stage].news[a.i]; const sp = n.b(S, S.rng.events, ev); if (!sp) return;
  publishCustom(S, { ...sp, eventId: ev.id, chainId: `E${ev.uid}`, tickers: sp.tickers || Object.keys(sp.impact?.co || {}).slice(0, 3) });
};

export function startEvent(S, id, o = {}) {
  const def = MAJOR[id]; if (!def) return null;
  const ev = { uid: ++S.events.uid, id, name: def.name, start: S.t, startDay: dayOf(S.t), stage: 0, data: {} };
  S.events.active.push(ev); S.events.lastStart = S.t;
  if (def.start) def.start(S, ev, S.rng.events);
  enterStage(S, ev, 0);
  return ev;
}

function endEvent(S, ev) {
  const def = MAJOR[ev.id];
  for (const k of def.premiumKeys) S.premiumTarget[k] = 1;
  if (ev.id === 'ENERGY_SHOCK') S.macro.oilBase = 72;
  S.events.active = S.events.active.filter(e => e.uid !== ev.uid);
  S.events.history.push({ uid: ev.uid, id: ev.id, name: ev.name, start: ev.start, end: S.t, startDay: ev.startDay, endDay: dayOf(S.t) });
  S.events.cooldown[ev.id] = dayOf(S.t) + def.cooldown;
  S.stats.majorEvents++;
}

/** every tick: advance stages */
export function eventsTick(S) {
  for (const ev of [...S.events.active]) {
    if (S.t >= ev.stageEnd) {
      const def = MAJOR[ev.id];
      if (ev.stage + 1 < def.stages.length) enterStage(S, ev, ev.stage + 1); else endEvent(S, ev);
    }
  }
}

/** daily: maybe trigger a new major event */
export function rollEvents(S) {
  const day = dayOf(S.t), r = S.rng.events, played = day - (S.startDay ?? 0);
  if (S.suppressMajor || day < 24 || played < 12 || S.events.active.length >= 2 || S.t - S.events.lastStart < TPD * 22) return null;
  const cands = ORDER_IDS.filter(id => !S.events.active.some(e => e.id === id) && (S.events.cooldown[id] || 0) <= day);
  if (!cands.length) return null;
  const forced = S.events.history.length === 0 && S.events.active.length === 0 && played >= 55;
  for (const id of cands.sort(() => 0)) {
    const p = MAJOR[id].prob(S);
    if (forced ? false : r.chance(p * 0.7)) return startEvent(S, id);
  }
  if (forced) return startEvent(S, r.pick(cands.filter(i => i !== 'BANKING_CRISIS' && i !== 'RECESSION')));
  return null;
}
export function eventProgress(S, ev) {
  const def = MAJOR[ev.id]; const st = def.stages[ev.stage];
  return { name: def.name, stage: st.name, stageIndex: ev.stage, stages: def.stages.length, frac: clamp((S.t - ev.stageStart) / Math.max(1, ev.stageEnd - ev.stageStart), 0, 1), blurb: def.blurb };
}
export { mapOf, round };
