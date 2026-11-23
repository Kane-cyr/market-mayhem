// "New look" preview. Off by default, so players see the classic game.
// Turn it on in your browser with  ?look=new  and back off with  ?look=classic  (remembered per browser).
// It regroups the left bar into a labelled sidebar with four sections, restyles the game in a calmer
// near-black theme with softer motion, and gives every listed company its own logo.
(() => {
  'use strict';
  const flag = new URLSearchParams(location.search).get('look');
  try { if (flag === 'new') localStorage.setItem('mm.look', 'new'); if (flag === 'classic') localStorage.removeItem('mm.look'); } catch {}
  let on = false; try { on = localStorage.getItem('mm.look') === 'new'; } catch {}
  window.mmLook = { on };
  if (!on) return;
  const root = document.documentElement; root.classList.add('look2');

  // ---------- company logos ----------
  // Each is a white mark drawn on a 40x40 tile in the company's brand colour.
  // s = stroked lines, f = filled shapes, x = raw extra markup.
  const L = {
    NRLT: { s: 'M12 14L20 21L28 14M20 21V29M12 14V26L20 29L28 26V14', f: [[12, 14], [28, 14], [20, 21], [20, 29], [12, 26], [28, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('') },
    CRTX: { s: 'M19 11c-4-2-9 1-9 5c-3 1-3 6 0 7c-1 4 4 7 9 5zM21 11c4-2 9 1 9 5c3 1 3 6 0 7c1 4-4 7-9 5zM14 18h3M23 22h3' },
    MFRG: { s: gear(), f: '<circle cx="20" cy="20" r="2.6"/>' },
    AXCG: { s: 'M13 29L20 12L27 29M15.5 23H24.5', x: '<ellipse cx="20" cy="20" rx="14" ry="5" transform="rotate(-24 20 20)" fill="none" stroke="#fff" stroke-width="1.6" opacity=".75"/>', f: '<circle cx="20" cy="12" r="2.4"/>' },
    HLXC: { s: 'M10 20c0-6 4-9 10-9s10 3 10 9-4 9-10 9-7-3-7-7 3-6 7-6 6 2 6 5-2 4-4 4' },
    PXLN: { f: '<rect x="10" y="10" width="9" height="9" rx="2.5"/><rect x="21" y="10" width="9" height="9" rx="2.5"/><rect x="10" y="21" width="9" height="9" rx="2.5"/><rect x="21" y="21" width="9" height="9" rx="2.5" opacity=".45"/>' },
    VLTS: { s: 'M16 8v4M20 8v4M24 8v4M16 28v4M20 28v4M24 28v4M8 16h4M8 20h4M8 24h4M28 16h4M28 20h4M28 24h4', x: '<rect x="12.5" y="12.5" width="15" height="15" rx="2.5" fill="none" stroke="#fff" stroke-width="2.4"/>', f: '<path d="M21.5 14.5l-4.5 6h3.5l-2 5 5-6.5H20z"/>' },
    STKL: { f: '<rect x="9" y="25" width="17" height="5" rx="2.5"/><rect x="13" y="17.5" width="17" height="5" rx="2.5" opacity=".8"/><rect x="17" y="10" width="14" height="5" rx="2.5" opacity=".6"/>' },
    MRFB: { f: '<path d="M8 15L20 8L32 15Z"/><rect x="8" y="29" width="24" height="3" rx="1"/><rect x="11" y="17" width="3.2" height="10" rx="1"/><rect x="18.4" y="17" width="3.2" height="10" rx="1"/><rect x="25.8" y="17" width="3.2" height="10" rx="1"/>' },
    ALDC: { s: 'M11 30V19a9 9 0 0 1 18 0V30M8 30H32M16 30V21M20 30V19.5M24 30V21' },
    BMIN: { f: '<path d="M10 31V13h4v3h3v-3h6v3h3v-3h4v18h-7v-6a3 3 0 0 0-6 0v6z"/>' },
    IVTR: { f: '<path d="M8 13h21c0 4-3 6.5-7.5 6.5V23h4v4H14.5v-4h4v-3.5C12 19.5 8 17.5 8 13z"/><rect x="11" y="29" width="18" height="3" rx="1.5"/>' },
    PGEN: { f: '<path d="M20 7c5 7 9 12 9 17.5a9 9 0 0 1-18 0C11 19 15 14 20 7z"/>', x: '<path d="M16 25a4 4 0 0 0 4 4" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2.2" stroke-linecap="round"/>' },
    SLRG: { s: 'M11 26a9 9 0 0 1 18 0M20 10v3M10.5 15l2 2M29.5 15l-2 2M7 26h2.5M30.5 26H33M8 31h24' },
    ATDL: { s: 'M14 31L20 9L26 31M16 24h8M17.6 18h4.8M11 31h18M20 9V6' },
    FSNW: { x: [0, 60, 120].map(a => `<ellipse cx="20" cy="20" rx="12" ry="4.6" transform="rotate(${a} 20 20)" fill="none" stroke="#fff" stroke-width="2"/>`).join(''), f: '<circle cx="20" cy="20" r="2.8"/>' },
    KSTM: { f: '<path d="M7 22c6-.5 10.5-4.5 14-12 1 6.5 5 10.5 12 12-6.5 1-10 3-12 7.5C19 25 14.5 23 7 22z"/>' },
    VLTD: { f: '<path d="M23.5 6L11.5 22.5h7.5L16 34l12.5-17H21z"/>' },
    RDGB: { s: 'M7 28L14 18L19 24L25 13L33 28M7 32H33' },
    AUTN: { s: 'M15 32L19 15M25 32L21 15M20 27v2.5M20 21v2M10 14a12 12 0 0 1 20 0' },
    VTLS: { s: 'M7 21h7l3-7 4 14 3-9 2 2h7' },
    GNMD: { s: 'M14 8c0 6 12 6 12 12s-12 6-12 12M26 8c0 6-12 6-12 12s12 6 12 12M16.5 11.5h7M16.5 28.5h7M15 20h10' },
    CRPT: { x: '<circle cx="20" cy="20" r="12.5" fill="none" stroke="#fff" stroke-width="2.4"/>', f: '<path d="M17.5 12.5h5v5h5v5h-5v5h-5v-5h-5v-5h5z"/>' },
    HLDX: { s: 'M7 20c4-6 8.5-9 13-9s9 3 13 9c-4 6-8.5 9-13 9s-9-3-13-9z', f: '<circle cx="20" cy="20" r="4.2"/>' },
    SKYW: { f: '<path d="M20 6.5c1.4 0 2 1.8 2 4v6l10 6v3l-10-3v6l3 2.2V33l-5-1.2-5 1.2v-2.3l3-2.2v-6l-10 3v-3l10-6v-6c0-2.2.6-4 2-4z"/>' },
    STRW: { f: '<path d="M7 27c9 0 19-5 26-16-2.5 10-10.5 18-22.5 19C9 30 7.6 29 7 27z"/><circle cx="29" cy="28" r="2.2" opacity=".7"/>' },
    ORBT: { f: '<circle cx="20" cy="20" r="7.2"/>', x: '<ellipse cx="20" cy="20" rx="14.5" ry="4.8" transform="rotate(-22 20 20)" fill="none" stroke="#fff" stroke-width="2.2"/>' },
    LMNS: { f: '<rect x="9" y="17" width="22" height="14" rx="2.5"/><path d="M9 15.5l20.5-5 1 4-20.5 5z"/>', x: '<path d="M14 14.2l2.2 3.6M20 12.8l2.2 3.6M26 11.4l2.2 3.6" stroke="rgba(0,0,0,.4)" stroke-width="2"/>' },
    PLSI: { f: '<path d="M16 11.5v17l14-8.5z"/>', s: 'M11 14.5a9 9 0 0 0 0 11' },
    STMN: { s: 'M8 14c4-3 8 3 12 0s8-3 12 0M8 20.5c4-3 8 3 12 0s8-3 12 0M8 27c4-3 8 3 12 0s8-3 12 0' },
    HSFD: { s: 'M9 19L20 10L31 19V31H9Z', f: '<path d="M20 17.5c3 3 4.5 5 4.5 7.5a4.5 4.5 0 0 1-9 0c0-2 1-3.2 2.2-4.2 0 1.8.8 2.4 1.8 2.4 0-2-.8-3.4.5-5.7z"/>' },
    BLBV: { f: '<path d="M31 8C17 8 9 15.5 9.5 30.5 23.5 31 31 23 31 8z"/>', x: '<path d="M12 28L25 14" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linecap="round"/>' },
    MVLC: { x: '<text x="20" y="26.5" text-anchor="middle" font-family="Didot,Georgia,serif" font-style="italic" font-weight="700" font-size="16" fill="#fff">MV</text><path d="M11 30.5h18" stroke="#fff" stroke-width="1.2" opacity=".7"/>' },
    EVHR: { s: 'M8 20L20 10L32 20M12 17V31H28V17M18 31V24.5H22V31' },
    TLNC: { s: 'M20 15V31M15 31L20 15L25 31M16.4 25.5h7.2M14 9.5a8 8 0 0 0 0 9.5M26 9.5a8 8 0 0 1 0 9.5', f: '<circle cx="20" cy="14" r="2.3"/>' },
    ORBL: { x: '<g transform="rotate(-30 20 20)"><rect x="16" y="16.5" width="8" height="7" rx="1.5" fill="#fff"/><rect x="5.5" y="16" width="8" height="8" rx="1" fill="#fff" opacity=".85"/><rect x="26.5" y="16" width="8" height="8" rx="1" fill="#fff" opacity=".85"/><path d="M13.5 20h2.5M24 20h2.5M20 23.5v3.5M16.5 30a4.5 4.5 0 0 1 7 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g>' },
    NXMB: { f: '<rect x="9" y="25" width="4.5" height="6" rx="1.2"/><rect x="15.5" y="20" width="4.5" height="11" rx="1.2"/><rect x="22" y="15" width="4.5" height="16" rx="1.2"/><rect x="28.5" y="10" width="4.5" height="21" rx="1.2"/>' },
    HVEX: { s: 'M20 7.5l10.5 4v8.5c0 6.5-4.5 10.5-10.5 12.5-6-2-10.5-6-10.5-12.5v-8.5zM15.5 20l3.5 3.5 6-7' },
    HSHF: { s: 'M17 9l-3 22M27 9l-3 22M10 16h21M9 24h21' },
    LDGR: { x: '<rect x="6.5" y="15.5" width="13" height="9" rx="4.5" fill="none" stroke="#fff" stroke-width="2.6"/><rect x="20.5" y="15.5" width="13" height="9" rx="4.5" fill="none" stroke="#fff" stroke-width="2.6"/>', s: 'M16 20h8' },
    WOOF: { f: '<ellipse cx="20" cy="25.5" rx="7.2" ry="6"/><ellipse cx="11.5" cy="17.5" rx="3" ry="3.6"/><ellipse cx="17" cy="11.5" rx="3" ry="3.8"/><ellipse cx="23" cy="11.5" rx="3" ry="3.8"/><ellipse cx="28.5" cy="17.5" rx="3" ry="3.6"/>' },
    RBIT: { f: '<ellipse cx="20" cy="24" rx="13" ry="8.5"/><circle cx="13" cy="15" r="5"/><circle cx="27" cy="15" r="5"/>', x: '<circle cx="13" cy="15" r="2.2" fill="rgba(0,0,0,.55)"/><circle cx="27" cy="15" r="2.2" fill="rgba(0,0,0,.55)"/><path d="M14 25c3 3 9 3 12 0" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="2" stroke-linecap="round"/>' },
    MOON: { f: '<path d="M23 8a12.5 12.5 0 1 0 9 20.5A10.5 10.5 0 0 1 23 8z"/><path d="M29.5 8l1.1 2.3 2.5.3-1.9 1.7.5 2.5-2.2-1.3-2.2 1.3.5-2.5-1.9-1.7 2.5-.3z"/>' },
    CHAD: { f: '<path d="M7 15.5h26v2.5c0 .8-.6 1.2-1.2 1.2-.8 6-3.8 7.3-6.8 7.3-3.4 0-5-2.6-5-6h0c0 3.4-1.6 6-5 6-3 0-6-1.3-6.8-7.3-.6 0-1.2-.4-1.2-1.2z"/>', s: 'M12 31c4 2.5 12 2.5 16 0' },
    NVCL: { x: '<rect x="7.5" y="12.5" width="22" height="15" rx="3" fill="none" stroke="#fff" stroke-width="2.4"/>', s: 'M32.5 17.5v5', f: '<rect x="11" y="16" width="4.5" height="8" rx="1"/><rect x="17" y="16" width="4.5" height="8" rx="1"/><rect x="23" y="16" width="3.5" height="8" rx="1" opacity=".5"/>' },
    LYRA: { s: 'M10 28L16 15L25 20L30 9', f: [[10, 28], [16, 15], [25, 20], [30, 9]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 3 ? 3 : 2.3}"/>`).join('') },
  };
  function gear() {
    let d = 'M27 20a7 7 0 1 1-14 0a7 7 0 1 1 14 0';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); d += `M${(20 + c * 9).toFixed(1)} ${(20 + s * 9).toFixed(1)}L${(20 + c * 12.5).toFixed(1)} ${(20 + s * 12.5).toFixed(1)}`; }
    return d;
  }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function logo(c, size = 34) {
    const g = L[c.ticker], hue = c.brand?.hue ?? 210, hue2 = c.brand?.hue2 ?? hue;
    const inner = g ? `${g.s ? `<path d="${g.s}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''}${g.f ? `<g fill="#fff">${g.f}</g>` : ''}${g.x || ''}`
      : `<text x="20" y="25" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Inter,system-ui,sans-serif">${esc(c.brand?.mono || c.ticker.slice(0, 2))}</text>`;
    // a solid tile with a soft diagonal sheen (no gradient ids, so copies never clash)
    return `<svg class="logo lg2" width="${size}" height="${size}" viewBox="0 0 40 40" aria-label="${esc(c.name)} logo"><rect width="40" height="40" rx="10" fill="hsl(${hue} 58% 42%)"/><path d="M0 10A10 10 0 0 1 10 0H40V14Q22 26 0 40Z" fill="hsl(${hue2} 70% 60%)" opacity=".18"/>${inner}</svg>`;
  }
  window.mmLogo = (c, size) => (c && c.ticker ? logo(c, size) : null);
  window.mmLogos = L;

  // ---------- theme ----------
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' }));
  const W = 224;
  const css = `
  html.look2{--bg:#08090b;--bg2:#0b0c0f;--panel:#101115;--panel2:#15171c;--panel3:#22252c;--line:#1a1c21;--line2:#262930;--grid:#14161a;
    --text:#eceef2;--dim:#a8abb4;--mute:#6e727d;--up:#22c55e;--down:#f04452;--accent:#f2f3f5;--blue:#f2f3f5;--r:10px;
    --sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono","SF Mono",ui-monospace,Menlo,monospace}
  html.look2 body{background:var(--bg);font-family:var(--sans);-webkit-font-smoothing:antialiased;letter-spacing:-.005em}
  html.look2 button.primary,html.look2 .bc-actions button.primary{color:#0a0b0d;font-weight:600;border-radius:10px}
  html.look2 .seg.speed button.on{color:#0a0b0d}
  html.look2 .post.me .av{color:#0a0b0d!important}
  html.look2 .card{border-radius:16px;padding:16px 18px;border-color:var(--line);background:linear-gradient(180deg,#121318,#0f1014)}
  html.look2 main{padding:22px 26px 56px}
  html.look2 .top{background:var(--bg);border-bottom-color:var(--line)}
  html.look2 .status{background:var(--bg)}
  html.look2 .side{background:var(--bg);border-left-color:var(--line)}
  html.look2 .seg{border-radius:10px;overflow:hidden}
  html.look2 input,html.look2 select,html.look2 textarea{border-radius:10px}
  html.look2 svg.lg2{border-radius:22%;flex:none}
  /* calmer motion: soft fades instead of snaps */
  html.look2 a,html.look2 button,html.look2 .row,html.look2 .card{transition:background-color .22s ease,color .22s ease,border-color .22s ease,opacity .22s ease}
  html.look2 main.lk-in{animation:lk-in .42s cubic-bezier(.2,.7,.2,1)}
  @keyframes lk-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  html.look2 .toasts>*{animation-duration:.45s!important}
  @media(prefers-reduced-motion:reduce){html.look2 main.lk-in{animation:none}}

  /* the grouped sidebar replaces the 20-icon strip on screens wider than a phone */
  #lk-nav{display:none}
  @media(min-width:761px){
    html.look2 .nav{display:none!important}
    html.look2 #app{margin-left:${W}px;grid-template-columns:0 minmax(0,1fr) 280px}
    html.look2 .top .brand{display:none}
    #lk-nav{display:flex;position:fixed;left:0;top:0;bottom:0;width:${W}px;z-index:30;flex-direction:column;background:#0b0c0f;border-right:1px solid var(--line);padding:18px 12px 14px;font:13px/1.3 var(--sans);color:var(--dim);overflow:auto;scrollbar-width:none}
  }
  @media(min-width:761px) and (max-width:1180px){html.look2 #app{grid-template-columns:0 minmax(0,1fr)}}
  #lk-nav .bd{display:flex;align-items:center;gap:10px;padding:2px 8px 20px;color:#fff;text-decoration:none}
  #lk-nav .bd b{display:block;font-weight:800;font-size:13px;letter-spacing:.08em;line-height:1.15}
  #lk-nav .grp{margin-bottom:4px}
  #lk-nav .gh{display:flex;align-items:center;width:100%;gap:8px;background:none;border:0;color:var(--mute);font:600 10.5px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;padding:12px 10px 8px;cursor:pointer;text-align:left}
  #lk-nav .gh:hover{color:var(--dim)}
  #lk-nav .gh .chev{margin-left:auto;transition:transform .25s ease;opacity:.7}
  #lk-nav .grp.open .gh .chev{transform:rotate(90deg)}
  #lk-nav .items{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s cubic-bezier(.2,.7,.2,1)}
  #lk-nav .grp.open .items{grid-template-rows:1fr}
  #lk-nav .items>div{overflow:hidden}
  #lk-nav .it{display:flex;align-items:center;gap:11px;width:100%;padding:8px 10px;border-radius:10px;color:var(--dim);text-decoration:none;background:none;border:0;font:500 13px/1.2 var(--sans);cursor:pointer;text-align:left;margin:1px 0}
  #lk-nav .it:hover{background:#15171c;color:#fff}
  #lk-nav .it.on{background:#1a1c22;color:#fff;box-shadow:inset 0 0 0 1px #24272e}
  #lk-nav .it svg{width:17px;height:17px;flex:none;opacity:.85}
  #lk-nav .it .n{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#f04452;color:#fff;font:700 10.5px/18px var(--sans);text-align:center}
  #lk-nav .sp{flex:1;min-height:12px}
  #lk-nav .lvl{margin:6px 4px 10px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#0f1014}
  #lk-nav .lvl .t{display:flex;justify-content:space-between;color:#fff;font-weight:600;font-size:12.5px}
  #lk-nav .lvl .nm{color:var(--mute);font-size:11.5px;margin-top:3px}
  #lk-nav .back{display:block;margin:8px 10px 0;color:var(--mute);font-size:11px;text-decoration:none}
  #lk-nav .back:hover{color:var(--dim)}
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  // ---------- sidebar ----------
  const P = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    building: '<path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7.5 8h1M7.5 12h1M7.5 16h1M15.5 13h1M15.5 17h1"/>',
    pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    paper: '<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zM17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    mega: '<path d="M3 10v4h3l7 4V6L6 10zM16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3.5 3.5 0 0 0 3.5 4M16 6h3.5a3.5 3.5 0 0 1-3.5 4M12 13v4M8.5 21h7M10 17h4v4h-4z"/>',
    swords: '<path d="M4 4l9 9M4 4v3.5M4 4h3.5M20 4l-9 9M20 4v3.5M20 4h-3.5M7 14l3 3M17 14l-3 3M6 18.5l1.5-1.5M18 18.5L16.5 17M4.5 20l2-2M19.5 20l-2-2"/>',
    brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    crown: '<path d="M4 18L3 7l5 4 4-6 4 6 5-4-1 11zM4 21h16"/>',
    dollar: '<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.6-1-1.7-1.7-3-1.7-1.8 0-3 1-3 2.3 0 3.2 6 1.8 6 4.8 0 1.3-1.3 2.4-3 2.4-1.4 0-2.6-.7-3.2-1.8M12 6v1.5M12 16.9v1.5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    save: '<path d="M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5l2.6-1.5M17.2 8l2.6-1.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
  };
  const ic = (k, w = 17) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;
  const NAV = [
    { id: 'trade', label: 'Trade', items: [['Dashboard', '#dashboard', 'grid'], ['Markets', '#markets', 'globe'], ['Companies', '#companies', 'building'], ['Portfolio', '#portfolio', 'pie'], ['Trading history', 'act:history', 'clock']] },
    { id: 'news', label: 'News & social', items: [['News', '#news', 'paper'], ['Social', '#social', 'chat'], ['Trader feed', 'act:feed', 'mega'], ['Messages', 'act:msgs', 'phone']] },
    { id: 'compete', label: 'Compete', items: [['Leaderboard', '#leaderboard', 'trophy'], ['1v1 duels', 'act:duels', 'swords']] },
    { id: 'empire', label: 'Your empire', items: [['Office', '#office', 'brief'], ['Lifestyle', '#life', 'star'], ['Buy companies', 'act:empire', 'crown'], ['Loan sharks', '#loans', 'dollar'], ['Insider network', '#insider', 'eye']] },
  ];
  const opened = new Set(['trade']);
  const nav = document.createElement('nav'); nav.id = 'lk-nav'; nav.setAttribute('aria-label', 'Main');
  const orig = sel => document.querySelector('#app .nav ' + sel);
  const badge = target => { // copy the unread counts the classic bar shows
    const o = target.startsWith('act:') ? orig(`[data-act="${target.slice(4)}"]`) : orig(`a[href="${target}"]`);
    const m = o && (o.textContent || '').match(/\d+/); return m ? m[0] : '';
  };
  const route = () => { const h = location.hash || '#dashboard'; return h.startsWith('#co-') ? '#companies' : h === '#watch' ? '#dashboard' : h; };
  function draw() {
    const r = route(), lv = (orig('') && (document.querySelector('#app .nav')?.textContent || '').match(/LV\s*(\d+)/)) || null;
    for (const g of NAV) if (g.items.some(i => i[1] === r)) opened.add(g.id);
    const S = window.__mm?.G?.S, lvl = lv ? lv[1] : (S?.player?.level ?? '');
    nav.innerHTML = `<a class="bd" href="#dashboard"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 7-8"/><path d="M15 7h4v4"/></svg><span><b>MARKET</b><b>MAYHEM</b></span></a>
      ${NAV.map(g => `<div class="grp ${opened.has(g.id) ? 'open' : ''}" data-g="${g.id}"><button class="gh" data-g="${g.id}" aria-expanded="${opened.has(g.id)}">${g.label}<span class="chev">${ic('chev', 13)}</span></button>
        <div class="items"><div>${g.items.map(([label, t, k]) => { const n = badge(t), cls = `it${t === r ? ' on' : ''}`;
          return t.startsWith('act:') ? `<button class="${cls}" data-act2="${t.slice(4)}">${ic(k)}<span>${label}</span>${n ? `<span class="n">${n}</span>` : ''}</button>`
            : `<a class="${cls}" href="${t}">${ic(k)}<span>${label}</span>${n ? `<span class="n">${n}</span>` : ''}</a>`; }).join('')}</div></div></div>`).join('')}
      <div class="sp"></div>
      ${lvl !== '' ? `<div class="lvl"><div class="t">Level ${lvl}</div><div class="nm">${esc(levelName(S))}</div></div>` : ''}
      <button class="it" data-act2="guide">${ic('help')}<span>How to play</span></button>
      <button class="it" data-act2="save">${ic('save')}<span>Save game</span></button>
      <button class="it" data-act2="menu">${ic('gear')}<span>Menu &amp; settings</span></button>
      <a class="back" href="?look=classic">Switch back to the classic look</a>`;
    nav.dataset.sig = sig();
  }
  function levelName(S) { const t = document.querySelector('#app .status')?.textContent || ''; const m = t.match(/Level\s*\d+\s*·\s*([^\n]+?)\s*$/); return m ? m[1] : ''; }
  const sig = () => route() + '|' + NAV.flatMap(g => g.items.map(i => badge(i[1]))).join(',') + '|' + [...opened].join(',') + '|' + ((document.querySelector('#app .nav')?.textContent || '').match(/LV\s*\d+/) || [''])[0];
  nav.addEventListener('click', e => {
    const gh = e.target.closest('.gh'); if (gh) { const id = gh.dataset.g; opened.has(id) ? opened.delete(id) : opened.add(id); gh.parentElement.classList.toggle('open'); gh.setAttribute('aria-expanded', opened.has(id)); nav.dataset.sig = sig(); return; }
    const b = e.target.closest('[data-act2]'); if (!b) return;
    const a = b.dataset.act2;
    if (a === 'guide') return window.mmGuide?.open();
    orig(`[data-act="${a}"]`)?.click();
  });
  function mount() { if (!document.body) return requestAnimationFrame(mount); document.body.append(nav); draw(); }
  mount();
  setInterval(() => { if (nav.dataset.sig !== sig()) draw(); }, 600);
  addEventListener('hashchange', () => { draw(); const m = document.querySelector('#app main'); if (m) { m.classList.remove('lk-in'); void m.offsetWidth; m.classList.add('lk-in'); } });
})();
