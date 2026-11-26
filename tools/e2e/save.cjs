// Run with the local server up (node tools/dev-web.js) and Playwright available:  node tools/e2e/save.cjs
// Fault injection on the local save: full storage, then a corrupted save on disk.
const { chromium } = require('playwright'); const B = process.env.BASE || 'http://localhost:8787';
const KEY = 'marketmayhem.save.v1';
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
(async () => {
  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('mm.guide.seen', '1'); });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(B); await p.waitForTimeout(1500);
  const c = p.locator('[data-act="start"]'); if (await c.count()) await c.first().click(); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__mm.G.S.player.cash = 777777; window.__mm.save(); });
  const good = await p.evaluate(k => localStorage.getItem(k), KEY);
  check(!!good && JSON.parse(good).player.cash === 777777, 'save written');

  // 1. storage full: every write of the save fails
  const full = await p.evaluate(k => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, v) { if (key === k) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, key, v); };
    window.__mm.G.S.player.cash = 888888; window.__mm.save();
    const out = { err: window.__mm.ui.saveErr, stored: JSON.parse(localStorage.getItem(k)).player.cash };
    Storage.prototype.setItem = orig; return out;
  }, KEY);
  check(/storage is full/.test(full.err || ''), 'full storage is reported to the player: ' + full.err);
  check(full.stored === 777777, 'the previous save is left intact when a write fails');
  const recovered = await p.evaluate(k => { window.__mm.save(); return { err: window.__mm.ui.saveErr, stored: JSON.parse(localStorage.getItem(k)).player.cash }; }, KEY);
  check(!recovered.err && recovered.stored === 888888, 'saving works again once there is room');

  // 2. a corrupted save on disk must not be silently replaced by a new game
  await p.evaluate(k => localStorage.setItem(k, '{"broken":'), KEY);
  await p.reload(); await p.waitForTimeout(1500);
  { const s2 = p.locator('[data-act="start"]'); if (await s2.count()) await s2.first().click(); await p.waitForTimeout(300); }
  await p.evaluate(() => window.__mm.save()); // the player carries on and the game saves
  const after = await p.evaluate(k => ({ main: localStorage.getItem(k), backup: localStorage.getItem(k + '.unreadable'), running: !!window.__mm.G.S }), KEY);
  check(after.running, 'the game still starts');
  check(after.main === '{"broken":' || after.backup === '{"broken":', 'the unreadable save is kept (in place or as a backup), not destroyed');
  check(!errors.length, 'no page errors ' + errors.join('; '));
  await br.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
