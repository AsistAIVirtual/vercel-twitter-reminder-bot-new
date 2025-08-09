// /api/admin-repair.js
import { TwitterApi } from 'twitter-api-v2';

const KV_URL   = process.env.KV_REST_API_URL || process.env.UPSTASH_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REST_TOKEN;
const SECRET   = process.env.MAINTENANCE_SECRET || 'changeme';
const PATTERN  = process.env.REMINDER_KEY_PATTERN || 'reminder:*';

// Upstash KV komut helper
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

function isDue(dueAt) {
  const now = Date.now();
  const t = typeof dueAt === 'number' ? dueAt : Date.parse(dueAt);
  return !Number.isNaN(t) && t <= now;
}

export default async function handler(req, res) {
  try {
    if ((req.query?.secret || '') !== SECRET) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    if (!KV_URL || !KV_TOKEN) {
      return res.status(500).json({ ok: false, error: 'KV env missing' });
    }

    // Twitter client (BOT hesabın)
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_KEY_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    const keys = await scanAll(PATTERN);
    let repaired = 0, skipped = 0, errors = [];

    for (const k of keys) {
      const got = await kv(['GET', k]);
      const raw = got?.result;
      let obj;
      try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { obj = null; }
      if (!obj || typeof obj !== 'object') { skipped++; continue; }

      const { sent, dueAt, tweetText } = obj;
      if (!sent && isDue(dueAt) && tweetText) {
        try {
          const tw = await client.v2.tweet(tweetText);
          obj.sent = true;
          obj.sentAt = new Date().toISOString();
          obj.tweetId = tw?.data?.id;
          await kv(['SET', k, JSON.stringify(obj)]);
          repaired++;
        } catch (e) {
          errors.push({ key: k, error: e?.message || String(e) });
        }
      } else {
        skipped++;
      }
    }

    return res.json({ ok: true, keys: keys.length, repaired, skipped, errors });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
