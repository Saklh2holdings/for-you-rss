# Deploy ForYou RSS on Railway

**Your setup:** Railway runs the API. Your Mac runs Chrome + VPN + extension (for TikTok/Instagram capture and re-sync).

---

## Architecture

| Component | Where it runs |
|-----------|----------------|
| Node server (`/rss/*`, polling, credentials) | **Railway** |
| Chrome extension (cookies, TikTok capture, sync) | **Your Mac** (browser open, VPN as needed) |
| `cookies/` + `output/` (feeds) | **Railway volume** (persistent) |

---

## Step 1 — Deploy on Railway (GitHub auto-deploy)

Repo: `Saklh2holdings/for-you-rss` · Project: **for-you-rss**

**Auto-deploy on push to `main`** is wired via GitHub Actions (`.github/workflows/deploy-railway.yml`).  
The repo secret `RAILWAY_TOKEN` is your Railway **project token** (Settings → Tokens).

Each push to `main` runs `railway up --ci --service for-you-rss`, which builds with `railway.json` and deploys.

Production URL: `https://for-you-rss-production.up.railway.app`

Manual deploy from your Mac (optional):

```bash
export RAILWAY_TOKEN="your_project_token"
./scripts/deploy-railway.sh
```

---

## Step 2 — Add a volume (so feeds survive restarts)

1. Project → your service → **Volumes**
2. **Add volume**, mount path: `/data`
3. Service → **Variables**, add:

```env
COOKIES_DIR=/data/cookies
OUTPUT_DIR=/data/output
```

Redeploy once after adding variables.

---

## Step 3 — Environment variables

In Railway → service → **Variables**:

| Variable | Value |
|----------|--------|
| `PUBLIC_BASE_URL` | `https://YOUR-RAILWAY-URL.up.railway.app` (no trailing slash) |
| `ADMIN_API_KEY` | Long random secret (see below) |
| `COOKIES_DIR` | `/data/cookies` |
| `OUTPUT_DIR` | `/data/output` |

Generate a key locally:

```bash
openssl rand -hex 32
```

Optional: `TWITTER_BEARER_TOKEN` if you use a custom one.

`PORT` is set automatically by Railway — do not override.

---

## Step 4 — Configure Chrome extension (on your Mac)

1. Extension → **Options**
2. **Server URL:** `https://YOUR-RAILWAY-URL.up.railway.app`
3. **Admin API Key:** same as `ADMIN_API_KEY` on Railway
4. **Save**
5. Reload extension at `chrome://extensions`
6. **Sync** each platform (green) once

Keep Chrome running with VPN when you use TikTok. TikTok/Instagram updates still come from your browser; the server stores the RSS.

---

## Step 5 — Verify

```bash
curl https://YOUR-RAILWAY-URL.up.railway.app/health
```

After sync from extension:

- `https://YOUR-RAILWAY-URL.up.railway.app/rss/twitter`
- `https://YOUR-RAILWAY-URL.up.railway.app/rss/youtube`
- `https://YOUR-RAILWAY-URL.up.railway.app/rss/reddit`
- `https://YOUR-RAILWAY-URL.up.railway.app/rss/tiktok`
- `https://YOUR-RAILWAY-URL.up.railway.app/rss/instagram`

---

## Alternative — Deploy from Mac with project token

On Railway: **Project Settings → Tokens → Create** (production).

```bash
cd /Users/sak/Desktop/foryou-rss
export RAILWAY_TOKEN="your_project_token"
npx @railway/cli link    # pick for-you-rss → production
npx @railway/cli up
```

Then set variables in Railway dashboard as in Step 3.

---

## Push local code to GitHub (if GitHub deploy is missing latest changes)

```bash
cd /Users/sak/Desktop/foryou-rss
git init
git add .
git commit -m "ForYou RSS: Railway-ready deploy"
git remote add origin https://github.com/Saklh2holdings/for-you-rss.git
git push -u origin main
```

Railway redeploys automatically on push if connected.

---

## Daily operation

- **You:** Chrome open, logged in, VPN if TikTok needs it; extension enabled
- **Railway:** Polls every 15 minutes; serves RSS URLs
- **Re-sync** in extension when you switch accounts or cookies expire

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Feeds empty after redeploy | Re-sync all platforms in extension |
| TikTok not updating | Scroll TikTok once; check extension points to Railway URL |
| 401 on sync | `ADMIN_API_KEY` must match in extension + Railway |
| Twitter wrong account | Use separate Chrome profile per account, or Re-sync on active account |
