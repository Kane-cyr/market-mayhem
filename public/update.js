// Tells players when a newer version of the game has been deployed, so a tab left open for days
// does not keep running an old copy. Checks the page's ETag every few minutes.
(() => {
  'use strict';
  let base = null, shown = false;
  async function tag() {
    try { const r = await fetch('/', { method: 'HEAD', cache: 'no-store' }); return r.ok ? r.headers.get('etag') : null; } catch { return null; }
  }
  function banner() {
    if (shown) return; shown = true;
    const b = document.createElement('div');
    b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9600;background:#2962ff;color:#fff;border-radius:10px;padding:10px 16px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 30px #0008;display:flex;gap:12px;align-items:center;max-width:calc(100vw - 24px)';
    b.textContent = 'A new version of Market Mayhem is out.';
    const go = document.createElement('button');
    go.textContent = 'Update now';
    go.style.cssText = 'border:0;border-radius:8px;padding:6px 12px;background:#fff;color:#2962ff;font:700 13px system-ui;cursor:pointer';
    // the game saves itself on pagehide, so reloading keeps progress
    go.onclick = () => location.reload();
    b.append(go); document.body.append(b);
  }
  async function check() {
    if (document.visibilityState !== 'visible') return;
    const t = await tag(); if (!t) return;
    if (base == null) base = t; else if (t !== base) banner();
  }
  check(); setInterval(check, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', check);
})();
