// Chart controls: zoom in, zoom out, reset and full-screen for the company price chart and the
// MMX 40 index chart on the Markets page. The company chart also zooms with the mouse wheel or a
// pinch, and drags sideways to scroll back in time. Esc leaves full screen.
(() => {
  'use strict';
  const ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  };
  const ic = k => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  document.head.append(Object.assign(document.createElement('style'), { textContent: `
  .cx-bar{position:absolute;top:8px;right:76px;z-index:6;display:flex;gap:4px;padding:3px;border-radius:10px;background:rgba(12,13,17,.72);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.08)}
  .cx-bar button{width:30px;height:28px;display:grid;place-items:center;border:0;border-radius:7px;background:none;color:var(--dim,#a8abb4);cursor:pointer;padding:0}
  .cx-bar button:hover{background:rgba(255,255,255,.08);color:#fff}
  .cx-bar .cx-full{width:auto;padding:0 9px;gap:6px;display:flex;align-items:center;font:600 12px/1 var(--sans,system-ui)}
  .cx-idx{top:10px;right:12px}
  .cx-tip{position:absolute;left:12px;bottom:30px;z-index:6;font:11px var(--sans,system-ui);color:var(--mute,#6e727d);pointer-events:none}
  html.cx-on-co main section.chartpane{position:fixed;inset:10px;z-index:9000;display:flex;flex-direction:column;background:var(--panel,#101115);border:1px solid var(--line2,#262930);border-radius:16px;box-shadow:0 30px 90px #000c;overflow:hidden;animation:cx-in .28s cubic-bezier(.2,.7,.2,1)}
  html.cx-on-co main section.chartpane .chartbox{flex:1;height:auto!important;min-height:0}
  html.cx-on-idx main .card:has(> #cv-idx){position:fixed;inset:10px;z-index:9000;display:flex;flex-direction:column;box-shadow:0 30px 90px #000c;animation:cx-in .28s cubic-bezier(.2,.7,.2,1)}
  html.cx-on-idx main #cv-idx{flex:1;height:auto!important;min-height:0}
  html.cx-on-co::after,html.cx-on-idx::after{content:'';position:fixed;inset:0;background:rgba(4,5,8,.7);z-index:8999}
  @keyframes cx-in{from{opacity:0;transform:scale(.97)}}
  @media(max-width:760px){.cx-bar{right:64px;top:6px}html.cx-on-co main section.chartpane,html.cx-on-idx main .card:has(> #cv-idx){inset:0;border-radius:0}}
  ` }));

  const root = document.documentElement, ui = () => window.__mm?.ui;
  const redraw = () => dispatchEvent(new Event('resize')); // the game re-renders and re-sizes its charts on resize
  function full(which, on) {
    root.classList.toggle('cx-on-' + which, on);
    for (const k of ['co', 'idx']) if (k !== which) root.classList.remove('cx-on-' + k);
    redraw(); setTimeout(redraw, 320);
  }
  const isFull = which => root.classList.contains('cx-on-' + which);
  function act(which, what) {
    if (what === 'full') return full(which, !isFull(which));
    if (which === 'co') {
      const c = ui()?.chart; if (!c) return; const x = (c.cv.clientWidth || 600) * 0.82;
      if (what === 'in') c.zoom(0.7, x); else if (what === 'out') c.zoom(1 / 0.7, x); else { c.n = c.defN || 100; c.end = -4; c.draw(); }
      return;
    }
    const U = ui(); if (!U) return; const all = window.__mm?.G?.S?.idx?.daily?.length || 120, n = U.idxN || 120;
    U.idxN = what === 'in' ? Math.max(15, Math.round(n * 0.65)) : what === 'out' ? Math.min(Math.max(all, 30), Math.round(n / 0.65)) : 120;
    window.__mm.render(); redraw();
  }
  function bar(which) {
    const b = document.createElement('div'); b.className = 'cx-bar' + (which === 'idx' ? ' cx-idx' : ''); b.dataset.cx = which;
    const f = isFull(which);
    b.innerHTML = `<button data-z="out" title="Zoom out: see more">${ic('minus')}</button><button data-z="in" title="Zoom in">${ic('plus')}</button><button data-z="reset" title="Reset the view">${ic('reset')}</button><button class="cx-full" data-z="full" title="${f ? 'Exit full screen (Esc)' : 'Full screen'}">${ic(f ? 'exit' : 'full')}<span>${f ? 'Exit' : 'Expand'}</span></button>`;
    b.addEventListener('click', e => { const z = e.target.closest('[data-z]')?.dataset.z; if (z) { e.stopPropagation(); act(which, z); } });
    b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('dblclick', e => e.stopPropagation());
    return b;
  }
  // the game redraws its pages, so put the controls back whenever they go missing
  function ensure() {
    const box = document.querySelector('main .chartbox');
    if (box) {
      const cur = box.querySelector(':scope > .cx-bar');
      if (!cur || cur.querySelector('.cx-full span')?.textContent !== (isFull('co') ? 'Exit' : 'Expand')) { cur?.remove(); box.append(bar('co')); }
      if (!box.querySelector(':scope > .cx-tip')) { const t = document.createElement('div'); t.className = 'cx-tip'; t.textContent = matchMedia('(pointer:coarse)').matches ? 'Pinch to zoom · drag to scroll back' : 'Scroll to zoom · drag to scroll back · double-click to reset'; box.append(t); }
    } else if (isFull('co')) root.classList.remove('cx-on-co');
    const idx = document.querySelector('main #cv-idx');
    if (idx) {
      const card = idx.parentElement; if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      const cur = card.querySelector(':scope > .cx-bar');
      if (!cur || cur.querySelector('.cx-full span')?.textContent !== (isFull('idx') ? 'Exit' : 'Expand')) { cur?.remove(); card.append(bar('idx')); }
    } else if (isFull('idx')) root.classList.remove('cx-on-idx');
  }
  new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('keydown', e => { if (e.key === 'Escape' && (isFull('co') || isFull('idx'))) { e.stopPropagation(); full('co', false); root.classList.remove('cx-on-idx'); redraw(); } }, true);
  addEventListener('hashchange', () => { if (isFull('co') || isFull('idx')) { root.classList.remove('cx-on-co', 'cx-on-idx'); } });
  ensure();
})();
