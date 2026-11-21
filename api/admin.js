import { getDb } from './_lib/db.js';
import { handleAdmin } from './_lib/core.js';
export const config = { maxDuration: 20 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try { const out = await handleAdmin(await getDb(), String(req.query.op || ''), req.body, req.headers); res.status(out.status).json(out.body); }
  catch (e) { console.error(e); res.status(e.config ? 503 : 500).json({ error: e.config ? 'The game server is not set up yet.' : 'Server error. Try again.' }); }
}
