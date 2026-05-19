# ForYou RSS

Personal RSS feeds from your Twitter/X, YouTube, Reddit, and TikTok For You / home feeds.

Runs a Node.js server that polls each platform every 15 minutes using your session cookies and serves standard RSS at `GET /rss/:platform`. A Chrome extension captures the live API endpoint metadata (Twitter GraphQL hash, TikTok For You URL) and syncs credentials to the server with one click.

---

## Quick start

### 1. Install and start the server

```bash
npm install
cp .env.example .env
npm run dev
```

Server listens on `http://localhost:3000` by default.

---

### 2. Install the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder

The ForYou RSS icon appears in your toolbar.

---

### 3. Configure the extension

1. Click the extension icon → click **Options** (bottom right of popup)
2. Set **Server URL** (default: `http://localhost:3000` — change to your Railway URL after deployment)
3. If you set `ADMIN_API_KEY` in `.env`, paste it in the **Admin API Key** field
4. Click **Save**

---

### 4. Capture credentials

The popup shows a coloured dot for each platform:

| Dot | Meaning |
|-----|---------|
| 🟢 Green | Ready — cookies + endpoint captured |
| 🟡 Yellow | Logged in, but scroll the feed to capture the live endpoint |
| 🔴 Red | Not logged in |

**Steps per platform:**

#### Twitter / X
1. Log in at [x.com](https://x.com)
2. Open your **For You** tab and scroll a few posts — the extension intercepts the live GraphQL query ID automatically
3. Dot turns **green**

#### TikTok
1. Log in at [tiktok.com](https://www.tiktok.com)
2. Open your **For You** page and scroll a few videos
3. Dot turns **green**

#### YouTube
1. Log in at [youtube.com](https://www.youtube.com) — no extra scrolling needed
2. Dot turns **green** immediately

#### Reddit
1. Log in at [reddit.com](https://www.reddit.com) — no extra scrolling needed
2. Dot turns **green** immediately

---

### 5. Sync

Click **Sync** in the popup. Only green platforms are included. The server stores credentials and runs a feed poll immediately.

---

### 6. Subscribe in your RSS reader

| Platform | Feed URL |
|----------|----------|
| Twitter / X | `http://localhost:3000/rss/twitter` |
| YouTube | `http://localhost:3000/rss/youtube` |
| Reddit | `http://localhost:3000/rss/reddit` |
| TikTok | `http://localhost:3000/rss/tiktok` |

The server polls every 15 minutes and updates the feeds automatically.

---

## API reference

### `POST /credentials`

Store or update credentials for one or more platforms.

```json
{
  "twitter": {
    "cookie": "auth_token=...; ct0=...",
    "queryId": "live-hash-from-extension"
  },
  "tiktok": {
    "cookie": "sessionid=...; ttwid=...",
    "baseUrl": "https://www.tiktok.com/api/recommend/item_list",
    "aid": "1988",
    "appName": "tiktok_web"
  },
  "youtube": { "cookie": "..." },
  "reddit": { "cookie": "reddit_session=..." }
}
```

Returns `{ "ok": true, "updated": ["twitter", "tiktok"] }`.

Twitter and TikTok require `queryId` / `baseUrl` respectively — these are captured by the extension. Without them the server rejects the update with a `400`.

### `GET /rss/:platform`

Returns RSS XML for `twitter`, `youtube`, `reddit`, or `tiktok`. Returns `503` if no feed has been fetched yet.

### `GET /health`

Returns per-platform status including `hasCredentials`, `hasLiveEndpoint`, `lastFetch`, `lastError`, and `itemCount`.

---

## Manual credential sync (without extension)

If you can't use the extension, capture values from DevTools manually:

**Twitter `queryId`**: Open DevTools → Network → filter for `HomeTimeline` → copy the path segment after `/graphql/` (e.g. `abc123def456`).

**TikTok `baseUrl`**: Open DevTools → Network → filter for `item_list` → copy the full URL path without personal query params.

Then POST to the server:

```bash
curl -X POST http://localhost:3000/credentials \
  -H 'Content-Type: application/json' \
  -d '{
    "twitter": {
      "cookie": "auth_token=...; ct0=...",
      "queryId": "YOUR_QUERY_ID"
    }
  }'
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Used in RSS feed URLs |
| `ADMIN_API_KEY` | *(unset)* | Optional: protect POST /credentials |
| `TWITTER_BEARER_TOKEN` | *(guest bearer)* | X API authorization header |
| `TWITTER_HOME_QUERY_ID` | *(unset)* | Manual fallback queryId for Twitter |
| `COOKIES_DIR` | `./cookies` | Credential storage directory |
| `OUTPUT_DIR` | `./output` | RSS feed cache directory |

---

## Deployment (Railway)

**Full guide:** [DEPLOY-RAILWAY.md](./DEPLOY-RAILWAY.md)

Quick version:

1. Deploy repo `Sakh2holdings/for-you-rss` to Railway project **serene-grace** (GitHub deploy)
2. Mount volume at `/data`, set `COOKIES_DIR` / `OUTPUT_DIR` to `/data/cookies` and `/data/output`
3. Set `PUBLIC_BASE_URL` + `ADMIN_API_KEY` on Railway
4. Extension Options → Railway URL + same API key → **Sync** all platforms
5. Keep Chrome open on your Mac (VPN for TikTok if needed) for browser capture

CLI deploy (optional): `export RAILWAY_TOKEN=... && ./scripts/deploy-railway.sh`

---

## Caveats

- Uses unofficial / reverse-engineered platform APIs. May break when platforms update their frontends.
- Twitter's GraphQL query ID rotates occasionally. Re-sync via the extension if feeds stop updating.
- Stores session cookies on disk in `cookies/`. Do not expose the server to the internet without `ADMIN_API_KEY`.
- For personal, self-hosted use only. Review each platform's Terms of Service before use.
