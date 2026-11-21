// Cash settlement for delistings and dividends, applied to the player and rival investors.
import { recordClose } from './trading.js';
import { settleShort, shortDividend } from './shorts.js';

export const settleHooks = {
  settle(S, c) {
    const price = c.settle, p = S.player, h = p.holdings[c.ticker];
    if (h) {
      const proceeds = Math.floor(h.shares * price * 100);
      p.cash += proceeds;
      recordClose(S, c.ticker, h.shares, proceeds, h.cost, 0, c.status === 'acquired' ? 'acquired' : 'bankrupt', price);
      delete p.holdings[c.ticker];
    }
    settleShort(S, c);
    p.orders = p.orders.filter(o => o.ticker !== c.ticker);
    p.watchlist = p.watchlist.filter(t => t !== c.ticker);
    for (const r of S.rivals) {
      const sh = r.holdings[c.ticker];
      if (sh) { r.cash += sh * price; delete r.holdings[c.ticker]; }
    }
  },
};

export function payDividend(S, c, dps) {
  const p = S.player, h = p.holdings[c.ticker];
  if (h) {
    const cents = Math.floor(h.shares * dps * 100);
    if (cents > 0) {
      p.cash += cents; p.dividends += cents;
      p.log.push({ type: 'dividend', t: S.t, ticker: c.ticker, shares: h.shares, amount: cents });
      if (p.log.length > 600) p.log.shift();
      p.stats.dividendCount++;
    }
  }
  shortDividend(S, c, dps);
  for (const r of S.rivals) { const sh = r.holdings[c.ticker]; if (sh) r.cash += sh * dps; }
}
