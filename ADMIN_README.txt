ADMIN QUICK GUIDE (No code skills needed)

1) On Vercel, open your project → Settings → Environment Variables, make sure ALL exist:
   - KV_REST_API_URL  (or UPSTASH_REST_URL)
   - KV_REST_API_TOKEN (or UPSTASH_REST_TOKEN)
   - TWITTER_API_KEY
   - TWITTER_API_KEY_SECRET
   - TWITTER_ACCESS_TOKEN
   - TWITTER_ACCESS_TOKEN_SECRET
   - MAINTENANCE_SECRET = set a secret like: myStrongSecret123
   - REMINDER_KEY_PATTERN = reminder:*   (change if your keys differ)

2) Deploy (git push). After deployment, run these from your browser:

   REPAIR MISSED REMINDERS (send now):
   https://<your-vercel-domain>/api/admin-repair?secret=YOUR_SECRET

   CLEAN OLD SENT REMINDERS (older than 7 days):
   https://<your-vercel-domain>/api/admin-clean?secret=YOUR_SECRET

3) You’ll get a JSON result:
   { ok:true, repaired: <number>, errors:[...] }

Notes:
- Both endpoints require the secret, so only you can trigger them.
- They work with either KV_REST_* or UPSTASH_REST_* env names.
- If nothing gets repaired, check REMINDER_KEY_PATTERN. Try: reminders:* or *reminder*

