// Run with the local server up (ADMIN_PASSWORD=localtest123 node tools/dev-web.js) and Playwright available:
//   node tools/e2e/ranked.cjs
// Plays a ranked week in the real browser game (buys, sells, a short, a Market God grant that arrives mid-run, and a
// buy of the cheapest stock with the whole balance) and checks the server's replay verifies the exact score.
const { chromium } = require('playwright'); const B = process.env.BASE || 'http://localhost:8787';
const post = async (path, body, h = {}) => (await fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.78.' + (Date.now() % 250) + '.3', ...h }, body: JSON.stringify(body) })).json();
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
(async () => {
  const r = await post('/api/game?op=register', { nickname: 'rk' + Date.now() % 100000, pin: '1234' });
  const pid = ((await post('/api/admin?op=overview', {}, { 'x-admin-key': 'localtest123' })).players || []).find(p => p.nickname === r.nickname)?.id;
  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.addInitScript(([t, n]) => { localStorage.setItem('mm.token', t); localStorage.setItem('mm.nick', n); localStorage.setItem('mm.guide.seen', '1'); }, [r.token, r.nickname]);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500);
  const c = p.locator('[data-act="start"]'); if (await c.count()) await c.first().click(); await p.waitForTimeout(300);
  await p.evaluate(() => window.__mm.startDuel()); await p.waitForTimeout(1000);
  check(await p.evaluate(() => window.__mm.G.S.mode?.online === true), 'ranked run started');

  const day = n => p.evaluate(async n => { for (let i = 0; i < n && !window.__mm.G.S.mode.done; i++) { window.__mm.run(6); await new Promise(r => setTimeout(r, 120)); } }, n);
  const res = [];
  res.push(await p.evaluate(() => { const S = window.__mm.G.S, act = window.__mm.act; const tks = Object.values(S.companies).filter(c => c.status === 'active').map(c => c.ticker);
    return [act('buy', tks[0], 10), act('buy', tks[1], 5)].map(x => x?.ok !== false || x.error); }));
  await day(3);
  await post('/api/admin?op=cash', { playerId: pid, amount: 1e10 / 1, note: 'e2e grant' }, { 'x-admin-key': 'localtest123' }); // $10B
  await day(2); await p.waitForTimeout(1500); await day(1); await p.waitForTimeout(800);
  const got = await p.evaluate(() => window.__mm.G.S.player.cash);
  check(got > 1e12, `Market God grant arrived mid-run (cash $${(got / 100).toExponential(2)})`);
  res.push(await p.evaluate(() => { const S = window.__mm.G.S, act = window.__mm.act; const tks = Object.values(S.companies).filter(c => c.status === 'active').map(c => c.ticker);
    const cheap = Object.values(S.companies).filter(c => c.status === 'active').sort((a, b) => a.price - b.price)[0];
    const n = Math.floor(S.player.cash / (cheap.price * 100 * 1.02));
    return [act('sell', tks[0], 4), act('short', tks[2], 3), act('buy', cheap.ticker, n)].map(x => x?.ok !== false || x.error); }));
  console.log('   orders:', JSON.stringify(res));
  await day(2);
  res.push(await p.evaluate(() => { const S = window.__mm.G.S; const tk = Object.values(S.companies).filter(c => c.status === 'active')[2].ticker; const x = window.__mm.act('cover', tk, 3); return [x?.ok !== false || x.error]; }));
  console.log('   cover:', JSON.stringify(res[2]));
  await day(40); await p.waitForTimeout(3000);
  const sub = await p.evaluate(() => ({ done: window.__mm.G.S.mode.done, sub: window.__mm.G.S.mode.sub, nw: window.__mm.nw().total }));
  check(sub.done, 'run finished');
  check(sub.sub?.ok === true, 'server verified the run: ' + JSON.stringify(sub.sub).slice(0, 200));
  check(sub.sub?.nw === sub.nw, `server replay net worth equals the game's (${sub.sub?.nw} vs ${sub.nw})`);
  check(!errors.length, 'no page errors ' + errors.join('; '));
  await br.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
