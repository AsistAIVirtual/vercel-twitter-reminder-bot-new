// pages/api/admin-repair.js (Vercel serverless)
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
  const j = await res.json();
  return j;
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

function due(dueAt) {
  const now = Date.now();
  const t = typeof dueAt === 'number' ? dueAt : Date.parse(dueAt);
  return !Number.isNaN(t) && t <= now;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (!secret || secret !== (process.env.MAINTENANCE_SECRET || 'changeme')) {
    return new Response('forbidden', { status: 403 });
  }

  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REST_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    return new Response(JSON.stringify({ ok:false, error: 'KV env missing' }), { status: 500 });
  }

  const pattern = process.env.REMINDER_KEY_PATTERN || 'reminder:*';
  const keys = await scanAll(KV_URL, KV_TOKEN, pattern);

  // Twitter
  const { TwitterApi } = await import('twitter-api-v2');
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_KEY_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });

  let repaired=0, skipped=0, updated=0, errors=[];

  for (const k of keys) {
    const gr = await kvCmd(KV_URL, KV_TOKEN, ["GET", k]);
    const raw = gr?.result;
    let obj;
    try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { obj = null; }
    if (!obj || typeof obj !== 'object') { skipped++; continue; }

    const { sent, dueAt, tweetText } = obj;
    if (!sent && due(dueAt) && tweetText) {
      try {
        const tw = await client.v2.tweet(tweetText);
        obj.sent = true;
        obj.sentAt = new Date().toISOString();
        obj.tweetId = tw?.data?.id;
        await kvCmd(KV_URL, KV_TOKEN, ["SET", k, JSON.stringify(obj)]);
        repaired++;
        continue;
      } catch (e) {
        errors.push({ key:k, error: e?.message || String(e) });
      }
    } else {
      skipped++;
    }
  }

  return new Response(JSON.stringify({ ok:true, keys: keys.length, repaired, skipped, errors }), {
    headers: { 'content-type': 'application/json' }
  });
}
