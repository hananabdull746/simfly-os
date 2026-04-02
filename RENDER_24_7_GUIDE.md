# SimFly OS 24/7 Deployment Guide - Render

## Problem: Bot Dies After 10 Minutes

Render free tier spins down after 15 minutes of inactivity on web service.
**Solution:** Use Cron Job + Health Check to keep alive.

---

## Method 1: Cron Job (Recommended)

### Step 1: Create Uptime Service (Free Alternative)
Use external service to ping your bot every 10 minutes:

**Option A: UptimeRobot (FREE)**
1. Go to https://uptimerobot.com
2. Create FREE account
3. Add Monitor:
   - Type: HTTP(s)
   - Friendly Name: SimFly OS
   - URL: `https://your-app.onrender.com`
   - Monitoring Interval: 5 minutes
4. Save

**Option B: Cron-job.org (FREE)**
1. Go to https://cron-job.org
2. Create account
3. Create Cron Job:
   - URL: `https://your-app.onrender.com`
   - Schedule: Every 5 minutes
   - HTTP Method: GET
4. Save

**Option C: Pingmat (Easiest)**
Just visit: `https://pingmat.onrender.com/?url=YOUR_URL`

---

## Method 2: Self-Ping (Built-in)

Add this code to your bot to ping itself every 10 minutes:

```javascript
// Add at the bottom of index.js, before initWhatsApp

const https = require('https');
const http = require('http');

// Self-ping every 10 minutes
const SELF_URL = process.env.RENDER_URL;

if (SELF_URL) {
    setInterval(() => {
        const protocol = SELF_URL.startsWith('https') ? https : http;
        const req = protocol.get(SELF_URL, (res) => {
            log(`Self-ping: ${res.statusCode}`);
        });
        req.on('error', (e) => {
            log(`Self-ping error: ${e.message}`, 'warn');
        });
        req.end();
    }, 600000); // 10 minutes
}
```

---

## Method 3: Render Cron Job (Paid)

If you upgrade Render:
1. Go to Dashboard → Cron Jobs
2. Create new Cron Job
3. Command: `curl https://your-app.onrender.com`
4. Schedule: `*/10 * * * *` (every 10 minutes)

---

## Memory Optimization Tips

### 1. Reduce Puppeteer Memory
Already applied in code:
- `--single-process` flag
- `--no-zygote` flag
- `--disable-dev-shm-usage` flag

### 2. Clear Chat History
Bot now auto-clears:
- Old logs (keeps 30)
- Old conversations (keeps 50)
- Old processed messages (keeps 50)

### 3. Force Garbage Collection
Already added `--expose-gc` flag in package.json

### 4. Reduce Max Memory
Already set: `--max-old-space-size=200`

---

## Render Environment Variables

Set these in Render Dashboard → Environment:

```
NODE_ENV=production
GROQ_API_KEY=your_key_here
ADMIN_NUMBER=923001234567
RENDER_URL=https://your-app-name.onrender.com
```

---

## Render Service Settings

### Build Command:
```bash
npm install
```

### Start Command:
```bash
npm start
```

### Instance Type:
- Free Tier: Web Service (sleeps after 15 min)
- Alternative: Background Worker (if available)

---

## Troubleshooting

### Bot Stops After 10 Minutes
**Fix:**
1. Add UptimeRobot/Cron-job.org ping
2. Check logs in Render Dashboard
3. Ensure RENDER_URL is set correctly

### Memory Limit Exceeded
**Fix:**
- Bot now uses ~80-120MB (optimized)
- If still high, restart from dashboard
- Check if many images being processed

### QR Code Expires
**Fix:**
- Scan immediately when deployed
- Session persists after restart (LocalAuth)
- If disconnected, re-deploy and scan again

### AI Not Responding
**Fix:**
- Check GROQ_API_KEY in env vars
- Check Groq rate limits (20 req/min, 1M tokens/day)
- Dashboard shows AI status

---

## Quick Health Check Commands

Test if bot is alive:
```bash
curl https://your-app.onrender.com/
```

Expected output:
```
SimFly OS v2.1 | 🟢 LIVE | AI: GROQ | Messages: 42
```

---

## Monitoring Dashboard

Access your bot dashboard at:
```
https://your-app.onrender.com/dashboard/YOUR_TOKEN
```

Shows:
- Bot status (Live/Offline)
- Messages count
- Orders count
- Memory usage
- Recent logs

---

## Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Render connected to GitHub repo
- [ ] Environment variables set
- [ ] Deploy successful
- [ ] QR code scanned
- [ ] Admin notification received
- [ ] Test message sent
- [ ] UptimeRobot/Cron-job configured
- [ ] Dashboard accessible

---

## Alternative Hosting (If Render Fails)

### Railway (Free Tier)
- Better uptime than Render
- Automatic deployments
- PostgreSQL included

### Fly.io (Free Tier)
- 3 shared-cpu-1 VMs free
- 3GB storage
- Good for 24/7

### VPS (Paid but Cheap)
- DigitalOcean Droplet ($5/month)
- AWS EC2 t2.micro (free tier 12 months)
- Vultr ($2.50/month)

---

## Emergency Restart

If bot crashes:
1. Go to Render Dashboard
2. Click "Manual Deploy" → "Clear Cache & Deploy"
3. Or use API: `curl -X POST https://api.render.com/v1/services/SERVICE_ID/deploys`

---

**Remember: Use UptimeRobot + Self-ping for best 24/7 uptime on free tier!**

---

*Last Updated: 2026-04-02*
*Version: 2.1*
