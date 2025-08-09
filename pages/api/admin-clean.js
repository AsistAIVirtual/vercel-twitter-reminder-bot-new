// pages/api/admin-clean.js (Vercel serverless)
export const config = { runtime: 'edge' };

async function kvCmd(url, token, cmd) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(cmd)
  });
  return res.json();
}

async function scanAll(url, token, pattern='reminder:*') {
  let cursor = "0"; const out = [];
  do {
    const r = await kvCmd(url, token, ["SCAN", cursor, "MATCH", pattern, "COUNT", "1000"]);
    cursor = r[0]; const keys = r[1] || [];
    out.push(...keys);
  } while (cursor !== "0");
  return out;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!secret || secret !== (process.env.MAINTENANCE_SECRET || 'changeme')) {
    return new Response('forbidden', { status: 403 });
  }

  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) return new Response(JSON.stringify({ ok:false, error:'KV env missing' }), { status:500 });

  const pattern = process.env.REMINDER_KEY_PATTERN || 'reminder:*';
  const keys = await scanAll(KV_URL, KV_TOKEN, pattern);

  let deleted=0, kept=0;
  const week = 7*24*3600*1000;
  const now = Date.now();

  for (const k of keys) {
    const gr = await kvCmd(KV_URL, KV_TOKEN, ["GET", k]);
    const raw = gr?.result; let obj;
    try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { obj=null; }
    if (!obj || typeof obj !== 'object') { kept++; continue; }
    const t = typeof obj?.dueAt === 'number' ? obj.dueAt : Date.parse(obj?.dueAt || '');
    if (obj?.sent && !Number.isNaN(t) && (now - t) > week) {
      await kvCmd(KV_URL, KV_TOKEN, ["DEL", k]); deleted++;
    } else { kept++; }
  }

  return new Response(JSON.stringify({ ok:true, keys: keys.length, deleted, kept }), {
    headers: { 'content-type': 'application/json' }
  });
}
