// /api/admin-scan.js
const KV_URL   = process.env.KV_REST_API_URL || process.env.UPSTASH_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REST_TOKEN;
const SECRET   = process.env.MAINTENANCE_SECRET || 'changeme';

async function kv(cmd) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  });
  return r.json();
}
async function scanAll(pattern) {
  let cursor = '0', out = [];
  do {
    const resp = await kv(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '1000']);
    cursor = resp?.[0] ?? '0';
    out.push(...(resp?.[1] || []));
  } while (cursor !== '0');
  return out;
}
export default async function handler(req, res) {
  try {
    if ((req.query?.secret || '') !== SECRET) return res.status(403).json({ ok:false, error:'forbidden' });
    if (!KV_URL || !KV_TOKEN)       return res.status(500).json({ ok:false, error:'KV env missing' });
    const pattern = req.query?.pattern || process.env.REMINDER_KEY_PATTERN || 'reminder:*';
    const keys = await scanAll(pattern);
    const sample = [];
    for (const k of keys.slice(0, 5)) {
      const got = await kv(['GET', k]);
      sample.push({ key: k, raw: got?.result });
    }
    return res.json({ ok:true, pattern, count: keys.length, sample });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
