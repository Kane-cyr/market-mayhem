// Run with the local server up (ADMIN_PASSWORD=localtest123 node tools/dev-web.js) and Playwright available:
//   node tools/e2e/rewards.cjs
// End-to-end: Market God cash reaches the career game exactly once through lost acks, reloads and a second tab.
const { chromium } = require('playwright'); const B = 'http://localhost:8787';
const post = async (path, body, h = {}) => (await fetch(B + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.77.' + (Date.now() % 250) + '.9', ...h }, body: JSON.stringify(body) })).json();
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
(async () => {
  const r = await post('/api/game?op=register', { nickname: 'ee' + Date.now() % 100000, pin: '1234' });
  const me = (await post('/api/game?op=me', {}, { authorization: 'Bearer ' + r.token }));
  const players = (await post('/api/admin?op=overview', {}, { 'x-admin-key': 'localtest123' }));
  const pid = (players.players || []).find(p => p.nickname === r.nickname)?.id;
  check(!!pid && !!me.nickname, 'registered player visible to admin');
  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.addInitScript(([t, n]) => { localStorage.setItem('mm.token', t); localStorage.setItem('mm.nick', n); localStorage.setItem('mm.guide.seen', '1'); }, [r.token, r.nickname]);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500);
  const c = p.locator('[data-act="start"]'); if (await c.count()) await c.first().click(); await p.waitForTimeout(500);
  await p.evaluate(() => window.__mm.save(true));
  const cash = () => p.evaluate(() => window.__mm.G.S.player.cash);
  const c0 = await cash();

  await post('/api/admin?op=cash', { playerId: pid, amount: 5000, note: 'e2e' }, { 'x-admin-key': 'localtest123' });
  let acks = 0; await p.route('**/api/game?op=ack', route => { acks++; route.abort(); }); // the acknowledgement is lost
  await p.reload(); await p.waitForTimeout(2500);
  const c1 = await cash();
  check(c1 - c0 === 500000, `cash applied once after claim (+$${(c1 - c0) / 100})`);
  check(acks >= 1, 'client tried to acknowledge after saving');

  await p.reload(); await p.waitForTimeout(2500); // the server offers it again; the save already holds it
  const c2 = await cash();
  check(c2 === c1, `reload with a lost ack does not pay twice (${(c2 - c0) / 100})`);

  await p.unroute('**/api/game?op=ack');
  await p.reload(); await p.waitForTimeout(2500);
  const left = await post('/api/game?op=claim', {}, { authorization: 'Bearer ' + r.token });
  check(left.none === true, 'acknowledged: nothing left pending on the server');
  check(await cash() === c1, 'still paid exactly once');

  // two tabs: the second one saves newer progress; the first must not overwrite it
  const p2 = await ctx.newPage(); await p2.goto(B); await p2.waitForTimeout(1500);
  await p2.evaluate(() => { window.__mm.G.S.player.cash += 123; window.__mm.save(true); });
  const saved = await p2.evaluate(() => localStorage.getItem('marketmayhem.save.v1'));
  await p.evaluate(() => window.__mm.save(true));
  const after = await p.evaluate(() => localStorage.getItem('marketmayhem.save.v1'));
  check(after === saved, 'older tab did not overwrite the newer save');
  check(/another tab/.test(await p.evaluate(() => document.body.innerText)), 'older tab shows the conflict warning');
  check(!errors.length, 'no page errors ' + errors.join('; '));
  await br.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
