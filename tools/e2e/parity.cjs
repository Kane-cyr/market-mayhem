// Run with the local server up (ADMIN_PASSWORD=localtest123 node tools/dev-web.js) and Playwright available:
//   node tools/e2e/parity.cjs [runs]
// Plays random ranked weeks in the real browser game (the minified bundle) and submits them. The server replays each
// with its own engine copy, so every run must verify with exactly the game's net worth: any difference between the
// two engines shows up here as a rejected run.
const { chromium } = require('playwright'); const B = process.env.BASE || 'http://localhost:8787';
const RUNS = Number(process.argv[2]) || 3;
const post = async (path, body, h = {}) => (await fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.80.' + Math.floor(Math.random() * 250) + '.4', ...h }, body: JSON.stringify(body) })).json();
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
(async () => {
  const br = await chromium.launch();
  for (let run = 0; run < RUNS; run++) {
    const r = await post('/api/game?op=register', { nickname: 'pz' + run + (Date.now() % 10000), pin: '1234' });
    const pid = ((await post('/api/admin?op=overview', {}, { 'x-admin-key': 'localtest123' })).players || []).find(p => p.nickname === r.nickname)?.id;
    const ctx = await br.newContext();
    await ctx.addInitScript(([t, n]) => { localStorage.setItem('mm.token', t); localStorage.setItem('mm.nick', n); localStorage.setItem('mm.guide.seen', '1'); }, [r.token, r.nickname]);
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(B); await p.waitForTimeout(1200);
    const c = p.locator('[data-act="start"]'); if (await c.count()) await c.first().click(); await p.waitForTimeout(200);
    await p.evaluate(() => window.__mm.startDuel()); await p.waitForTimeout(800);
    if (run % 2) await post('/api/admin?op=cash', { playerId: pid, amount: [5e4, 1e9, 1e10][run % 3], note: 'parity grant' }, { 'x-admin-key': 'localtest123' });
    const stats = await p.evaluate(async seed => {
      let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32), pick = a => a[Math.floor(rnd() * a.length)];
      const M = window.__mm, S = () => M.G.S; let ok = 0, refused = 0;
      while (!S().mode.done) {
        for (let i = 0; i < 3; i++) {
          const st = S(), tks = Object.values(st.companies).filter(c => c.status === 'active').map(c => c.ticker), tk = pick(tks);
          const own = Object.keys(st.player.holdings), sh = Object.keys(st.player.shorts || {}), cash = st.player.cash;
          const q = pick([1, 3, 25, 400, Math.max(1, Math.floor(cash / 100 / st.companies[tk].price / 4)), 0, -1, 2.5]);
          const a = pick([['buy', tk, q], ['buy', tk, q], ['sell', pick(own.length ? own : [tk]), q], ['short', tk, q], ['cover', pick(sh.length ? sh : [tk]), q],
            ['order', { ticker: tk, side: pick(['buy', 'sell']), type: pick(['limit', 'stop']), shares: Math.abs(Math.round(q)) || 1, price: st.companies[tk].price * pick([0.93, 1.07]) }],
            ['cancel', st.player.orders[0]?.id ?? 1], ['hype', tk]]);
          const res = M.act(...a); res?.ok === false ? refused++ : ok++;
        }
        M.run(6); await new Promise(r => setTimeout(r, 60));
      }
      return { ok, refused };
    }, 1234 + run * 77);
    await p.waitForTimeout(3000);
    const out = await p.evaluate(() => ({ sub: window.__mm.G.S.mode.sub, nw: window.__mm.nw().total, n: window.__mm.G.S.actions.length }));
    check(out.sub?.ok === true && out.sub.nw === out.nw, `run ${run + 1}: ${out.n} logged actions (${stats.ok} ok, ${stats.refused} refused) verified with identical net worth ${out.nw}` + (out.sub?.ok ? '' : ' -> ' + JSON.stringify(out.sub)));
    check(!errors.length, `run ${run + 1}: no page errors ${errors.join('; ')}`);
    await ctx.close();
  }
  await br.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
