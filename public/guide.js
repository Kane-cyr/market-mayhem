// "How to play" guide. Opens by itself on a first visit, and any time from Menu > How to play.
(() => {
  'use strict';
  const KEY = 'mm.guide.seen';
  const seen = () => { try { return !!localStorage.getItem(KEY); } catch { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } };
  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v != null && v !== false) k === 'class' ? (n.className = v) : k === 'style' ? (n.style.cssText = v) : k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };

  const STEPS = [
    { icon: '📈', title: 'Welcome to Market Mayhem',
      body: ['A stock market where everything is invented: the companies, the people, the countries and the money. You start with **$10,000** and a market of **40+ fictional companies** across 11 sectors, from AI and banking to energy, entertainment and crypto.',
        'Your goal is simple: grow your net worth. Nothing here is real money and nothing here is financial advice.',
        'Time only moves when you let it. Use the controls at the top to pause, play at 1x to 3x speed, or jump a day (+1D) or a week (+1W). Take as long as you like to think.'] },
    { icon: '🛒', title: 'Buying and selling',
      body: ['Open **Companies**, pick a stock and press **Buy**. You can buy at the market price, or place an order at a price you choose and wait for it to fill. Every trade has a small fee.',
        '**Sell** to lock in profit or cut a loss. Think a stock is about to fall? **Short** it: you profit when the price drops, and you lose when it rises. Watch your margin. If a short moves too far against you, the broker closes it for you.',
        'Some companies pay **dividends**, so you earn cash just for holding them. Add stocks to your **watchlist** (the panel on the right) to keep an eye on them.'] },
    { icon: '📰', title: 'Reading the market',
      body: ['Prices move on how a company is doing, on sentiment, on news, on interest rates, oil, the economy, the weather and big world events. The market never scripts itself for you or against you.',
        '**News** comes as rumours and as confirmed stories. Rumours can be wrong. Headlines are not signals, and the first reaction is often not the right one. The **Fear** gauge and market weather at the bottom show the mood.',
        'As you level up you unlock **research reports** with fair-value estimates and analyst verdicts, so you can tell a bargain from a bubble.'] },
    { icon: '🐸', title: 'Meme coins',
      body: ['Four joke tokens trade in the Crypto sector: **WOOF** (Woofcoin), **RBIT** (Ribbit Coin), **MOON** (MoonShot Token) and **CHAD** (GigaChad Coin).',
        'They have no real business behind them. They move on hype and the mood of the crypto market, and they are wildly more volatile than anything else: a coin can double in a few days and halve just as quickly.',
        'That makes them the fastest way to get rich and the fastest way to get wrecked. If you play them, keep your bets small.'] },
    { icon: '📣', title: 'Influencers and hype',
      body: ['Open **Social** to see what influencers are saying. Some are sharp. Some are wrong. Some are lying so you buy what they already own.',
        'You can **hype** a stock you hold to your own followers and nudge it up. Just do not get caught dumping it afterwards.',
        'The same goes for tips: check them against the news and the numbers before you trust them.'] },
    { icon: '🦈', title: 'Loan sharks',
      body: ['Need more firepower? **Loan sharks** will lend you money, no questions asked. It is fast cash at ridiculous interest.',
        '**Vinnie** is slow and steady at about 1.5% a day. **Big Tony** charges 3% a day for 10 days. **Knuckles & Sons** will lend you three times your net worth at 6% a day, and you have six days to pay.',
        'Put your toys up as **collateral** (watches, yachts, houses) and they will lend you more. Miss the deadline and the shark bursts into your office: pay on the spot, or beg for two more days at 30% extra, but they only listen twice.',
        'Ignore them and they keep your collateral and still take every cent you owe, then the sharks stop lending to you for a while. Borrowing multiplies your wins and your losses, so be careful.'] },
    { icon: '🕶️', title: 'The insider network and the good life',
      body: ['Make your first trade and someone will find you. The **Insider network** passes you tips. They are illegal and risky: tips can be wrong, and the Securities Commission is watching for people who trade on them.',
        'Got money? **Lifestyle** lets you buy toys, from watches to yachts. They raise your flex score and show up in your office for visitors to see. In a pinch you can pawn them again.'] },
    { icon: '🏢', title: 'Companies, the feed and your phone',
      body: ['Once you are worth **$100 million** you can buy whole companies: haggle with the owner, take it private, and it pays you its profits every day. Owners can make announcements that move the market, if they have earned them.',
        'The **feed** (📣) is where traders post. Tag a stock with $ or an influencer with @, like, repost and comment. Real players\' trades and posts push prices for everyone else, so crowds can pump a stock and dump it.',
        'Your **phone** (💬) lets you message other players, send money and gifts, share tips, and text the loan sharks and insiders. The 📜 button shows your full trading history.'] },
    { icon: '🏆', title: 'Levels, achievements and challenges',
      body: ['Your net worth sets your level, from **Unknown Retail Investor** all the way up to **Market Legend**. Each level unlocks something new: research reports, analytics, archives and more.',
        'Collect **achievements** for milestones, and take on **challenges** once you reach Rising Trader.',
        'Your game saves in your browser as you play. Use the Menu to save, copy your save, or start a new game.'] },
    { icon: '🤝', title: 'Play with other people',
      body: ['Create a trader from the **Menu** (a nickname and a 4-digit PIN) and you can play with everyone else.',
        '**Weekly challenge:** everyone gets the same market for 24 game days. Your score is checked by the server and ranked on the leaderboard.',
        '**1v1 duels:** challenge any trader by username, or open them from the leaderboard. You both get the same market and the same $10,000, and the higher % return wins. Find it under the ⚔ button.',
        '**Follow traders** to see their latest trades under Leaderboard → Following, and copy a trade with one tap.'] },
  ];

  const md = t => t.split('**').map((p, i) => i % 2 ? h('b', {}, p) : p);

  const css = h('style', {}, `
  #mmg-back{position:fixed;inset:0;z-index:9300;background:rgba(5,8,14,.82);display:none;align-items:center;justify-content:center;padding:12px;overflow:auto}
  #mmg-back.on{display:flex}
  #mmg{width:min(560px,100%);background:var(--panel,#161a25);color:var(--text,#d1d4dc);border:1px solid var(--line2,#2f3545);border-radius:14px;padding:22px 22px 16px;font:15px/1.55 system-ui,sans-serif;box-shadow:0 20px 60px #000a}
  #mmg .gic{font-size:40px;line-height:1.15}#mmg h2{margin:8px 0 10px;font-size:22px}
  #mmg p{margin:0 0 10px;color:var(--dim,#b4b8c4)}#mmg p b{color:var(--text,#fff)}
  #mmg .gdots{display:flex;gap:6px;justify-content:center;margin:12px 0}
  #mmg .gdots i{width:8px;height:8px;border-radius:50%;background:var(--line2,#2f3545)}#mmg .gdots i.on{background:#2962ff}
  #mmg .gnav{position:static;width:auto;height:auto;background:none;border:0;padding:0;display:flex;justify-content:space-between;align-items:center;gap:8px}
  #mmg button{cursor:pointer;border:1px solid var(--line2,#2f3545);background:transparent;color:inherit;border-radius:9px;padding:9px 16px;font:600 14px system-ui}
  #mmg button.p{background:#2962ff;border-color:#2962ff;color:#fff}#mmg button.skip{border:0;color:var(--mute,#8a8fa0);font-weight:500}
  #mmg .gbody{min-height:230px}`);
  document.head.append(css);

  const back = h('div', { id: 'mmg-back' });
  const box = h('div', { id: 'mmg', role: 'dialog', 'aria-label': 'How to play' });
  back.append(box); document.body.append(back);
  let i = 0;

  function draw() {
    const s = STEPS[i], last = i === STEPS.length - 1;
    box.replaceChildren(
      h('div', { class: 'gbody' }, h('div', { class: 'gic' }, s.icon), h('h2', {}, s.title), ...s.body.map(t => h('p', {}, md(t)))),
      h('div', { class: 'gdots' }, ...STEPS.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
      h('div', { class: 'gnav' },
        h('button', { class: 'skip', onclick: close }, last ? '' : 'Skip'),
        h('div', { style: 'display:flex;gap:8px' },
          i > 0 ? h('button', { onclick: () => { i--; draw(); } }, 'Back') : null,
          h('button', { class: 'p', onclick: () => (last ? close() : (i++, draw())) }, last ? 'Start playing' : 'Next'))));
    box.querySelector('button.p')?.focus();
  }
  function open() { i = 0; back.classList.add('on'); draw(); }
  function close() { back.classList.remove('on'); mark(); }
  window.mmGuide = { open };

  // keep the game's hotkeys (space = play/pause, 1-3 = speed) from firing while the guide is up
  document.addEventListener('keydown', e => {
    if (!back.classList.contains('on')) return;
    if (e.key === 'ArrowRight' && i < STEPS.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } else if (e.key === 'Escape') close();
    if (!(e.key === 'Enter' && document.activeElement?.tagName === 'BUTTON')) { e.stopPropagation(); if (e.key === ' ') e.preventDefault(); }
  }, true);
  document.addEventListener('click', e => { const t = e.target.closest('[data-act="guide"]'); if (t) { e.preventDefault(); open(); } });

  // first visit: show it once the player has signed in
  if (!seen()) { const go = () => setTimeout(open, 400); let t = ''; try { t = localStorage.getItem('mm.token') || ''; } catch { /* ignore */ } if (t) addEventListener('mm-signed-in', go, { once: true }); else addEventListener('mm-signed-in', go, { once: true }); }
})();
