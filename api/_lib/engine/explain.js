// "Why did my stock do that?" For every stock you hold or are short that moves 8% or more in a day,
// find the most likely reason from today's news, influencer posts and the wider market.
import { TPD } from './calendar.js';
import { indexLevel } from './market.js';

export const MOVE_THRESHOLD = 0.08;
const pctS = r => `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(0)}%`;

function cause(S, c, dir, since) {
  const fits = n => n.t >= since && n.channel === 'public' && (n.dir === dir || n.dir === 0);
  const score = n => n.sev * 10 + (n.mag || 0) * 100;
  const own = S.news.filter(n => fits(n) && n.tickers.includes(c.ticker)).sort((a, b) => score(b) - score(a))[0];
  if (own) return (own.status === 'rumoured' ? 'Rumour: ' : '') + own.head;
  const sec = S.news.filter(n => fits(n) && !n.tickers.length && n.sectors.includes(c.sector) && n.sev >= 2).sort((a, b) => score(b) - score(a))[0];
  if (sec) return `${c.sector} news: ${sec.head}`;
  const post = S.posts.filter(x => x.t >= since && x.tickers?.includes(c.ticker) && x.dir === dir).sort((a, b) => b.likes - a.likes)[0];
  if (post) { const inf = post.infl === 'player' ? null : S.influencers.find(i => i.id === post.infl); return inf ? `@${inf.handle} ${dir > 0 ? 'hyped it' : 'trashed it'} to ${Math.round(inf.followers / 1000)}K followers` : 'your own hype post did that'; }
  const big = S.news.filter(n => n.t >= since && n.channel === 'public' && (n.major || (n.sev >= 4 && !n.tickers.length))).sort((a, b) => b.sev - a.sev)[0];
  if (big) return `market-wide: ${big.head}`;
  const ir = indexLevel(S) / S.idx.prevClose - 1;
  if (Math.sign(ir) === dir && Math.abs(ir) > 0.015) return `the whole market ${dir > 0 ? 'rallied' : 'sold off'} (MMX ${pctS(ir)})`;
  return dir > 0 ? 'no headline. Buyers just piled in.' : 'no headline. Sellers just ran for the exits.';
}

/** call at day close, before prices roll over */
export function explainMoves(S) {
  const p = S.player, mine = new Set([...Object.keys(p.holdings), ...Object.keys(p.shorts || {})]); if (!mine.size) return;
  const since = S.t - TPD - 2; // today plus overnight
  for (const t of mine) {
    const c = S.companies[t]; if (!c || c.status !== 'active' || !c.prevClose) continue;
    const r = c.price / c.prevClose - 1; if (Math.abs(r) < MOVE_THRESHOLD) continue;
    const short = !p.holdings[t], good = short ? r < 0 : r > 0;
    const why = cause(S, c, Math.sign(r), since);
    (p.moves ||= []).push({ t: S.t, ticker: t, ret: r, why, short, good }); if (p.moves.length > 40) p.moves.shift();
    p.notifications.push({ t: S.t, kind: good ? 'fill' : 'warn', text: `${t} ${pctS(r)}${short ? ' (you are short)' : ''}: ${why}` });
  }
}
