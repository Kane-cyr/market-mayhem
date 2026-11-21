// Local stand-in for Vercel: serves web/public and routes /api/game and /api/admin to the same
// handlers. Uses Supabase if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, else in-memory data.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const { default: game } = await import('../api/game.js');
const { default: admin } = await import('../api/admin.js');
const PORT = Number(process.env.PORT || 8787), ROOT = 'public';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/game' || u.pathname === '/api/admin') {
    let raw = ''; for await (const c of req) raw += c;
    req.query = Object.fromEntries(u.searchParams); try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    const r = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { res.writeHead(this.statusCode, { ...this.headers, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); } };
    return (u.pathname === '/api/game' ? game : admin)(req, r);
  }
  let p = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' ) p = '/index.html'; if (p === '/admin') p = '/admin.html';
  try { const f = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(f); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log(`MARKET MAYHEM online (local) at http://localhost:${PORT}  ·  admin: /admin`));
