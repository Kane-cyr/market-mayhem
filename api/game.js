import { getDb } from './_lib/db.js';
import { handleGame } from './_lib/core.js';
export const config = { maxDuration: 20 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try { const out = await handleGame(await getDb(), String(req.query.op || ''), req.method === 'POST' ? req.body : req.query, req.headers); res.status(out.status).json(out.body); }
  catch (e) { console.error(e); res.status(e.config ? 503 : 500).json({ error: e.config ? 'The game server is not set up yet.' : 'Server error. Try again.' }); }
}
