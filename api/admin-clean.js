// /api/admin-clean.js
const KV_URL   = process.env.KV_REST_API_URL || process.env.UPSTASH_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REST_TOKEN;
const SECRET   = process.env.MAINTENANCE_SECRET || 'changeme';
const PATTERN  = process.env.REMINDER_KEY_PATTERN || 'reminder:*';

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
    const keys = resp?.[1] || [];
    out.push(...keys);
  } while (cursor !== '0');
  return out;
}

export default async function handler(req, res) {
  try {
    if ((req.query?.secret || '') !== SECRET) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    if (!KV_URL || !KV_TOKEN) {
      return res.status(500).json({ ok: false, error: 'KV env missing' });
    }

    const keys = await scanAll(PATTERN);
    let deleted = 0, kept = 0;
    const now = Date.now(), WEEK = 7 * 24 * 3600 * 1000;

    for (const k of keys) {
      const got = await kv(['GET', k]);
      const raw = got?.result; let obj;
      try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { obj = null; }
      if (!obj || typeof obj !== 'object') { kept++; continue; }
      const t = typeof obj?.dueAt === 'number' ? obj.dueAt : Date.parse(obj?.dueAt || '');
      if (obj?.sent && !Number.isNaN(t) && (now - t) > WEEK) {
        await kv(['DEL', k]); deleted++;
      } else {
        kept++;
      }
    }

    return res.json({ ok: true, keys: keys.length, deleted, kept });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
