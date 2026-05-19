/**
 * ForYou RSS — MV3 background service worker
 *
 * Responsibilities:
 *  1. Intercept Twitter GraphQL requests → capture queryId for HomeTimeline
 *  2. Intercept TikTok For You feed requests → capture baseUrl, aid, appName
 *  3. Store captures in chrome.storage.local
 *  4. Expose getPlatformStatus() results via chrome.runtime.onMessage
 */

const TWITTER_GRAPHQL_PATTERN = /https:\/\/(x\.com|twitter\.com)\/i\/api\/graphql\/([^/]+)\//;
const TIKTOK_FYP_PATTERN = /https:\/\/www\.tiktok\.com\/api\/recommend\/item_list/;
const INSTAGRAM_HOME_PATTERN = /https:\/\/www\.instagram\.com\/api\/v1\/feed\/timeline\//;
const INSTAGRAM_DEFAULT_BASE_URL = 'https://www.instagram.com/api/v1/feed/timeline/';
const TIKTOK_AUTO_ALARM = 'tiktok_auto_capture';

let tiktokCaptureRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureTikTokAutoAlarm() {
  chrome.alarms.create(TIKTOK_AUTO_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 15,
  });
}

async function runTikTokAutoCapture() {
  if (tiktokCaptureRunning) return;
  tiktokCaptureRunning = true;
  let tabId = null;

  try {
    const syncSettings = await chrome.storage.sync.get(['serverUrl', 'adminApiKey']);
    const localState = await chrome.storage.local.get(['intercepted', 'platformSync']);
    const platformSync = localState.platformSync ?? {};
    const intercepted = localState.intercepted ?? {};

    // Respect the user's explicit connect/disconnect state from popup
    if (!platformSync.tiktok?.ok) return;

    const serverUrl = (syncSettings.serverUrl ?? 'http://localhost:3000').replace(/\/$/, '');
    const adminApiKey = syncSettings.adminApiKey ?? '';

    // Refresh credentials first so server keeps TikTok session current
    const credResult = await syncPlatforms(['tiktok'], serverUrl, adminApiKey, intercepted);
    if (!credResult.ok) {
      console.warn('[tiktok:auto] skipped:', credResult.error);
      return;
    }

    // Open an inactive TikTok tab, auto-scroll briefly, then close it.
    // The content scripts will capture item_list responses and push them.
    const tab = await chrome.tabs.create({
      url: 'https://www.tiktok.com/foryou',
      active: false,
    });
    if (!tab.id) return;
    tabId = tab.id;

    await sleep(5000);

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        let ticks = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
          ticks += 1;
          if (ticks >= 12) clearInterval(timer);
        }, 1000);
      },
    });

    await sleep(16000);
  } catch (err) {
    console.warn('[tiktok:auto] error:', err instanceof Error ? err.message : String(err));
  } finally {
    if (tabId !== null) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // Tab may already be gone; ignore.
      }
    }
    tiktokCaptureRunning = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureTikTokAutoAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureTikTokAutoAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIKTOK_AUTO_ALARM) {
    runTikTokAutoCapture();
  }
});

// Ensure alarm exists whenever service worker evaluates.
ensureTikTokAutoAlarm();

// ---- Intercept Twitter ----
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const match = details.url.match(TWITTER_GRAPHQL_PATTERN);
    if (!match) return;

    // Only care about HomeTimeline operations
    if (!details.url.includes('HomeTimeline')) return;

    const queryId = match[2];
    chrome.storage.local.get(['intercepted'], (result) => {
      const existing = result.intercepted ?? {};
      chrome.storage.local.set({
        intercepted: {
          ...existing,
          twitter: { queryId, capturedAt: new Date().toISOString() },
        },
      });
    });
  },
  { urls: ['https://x.com/i/api/graphql/*', 'https://twitter.com/i/api/graphql/*'] }
);

// Capture exact headers from the active Twitter HomeTimeline request.
// This helps when users are logged into multiple accounts and have switched
// active posting context in the UI.
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const match = details.url.match(TWITTER_GRAPHQL_PATTERN);
    if (!match) return;
    if (!details.url.includes('HomeTimeline')) return;

    const queryId = match[2];
    const headers = details.requestHeaders ?? [];
    const cookieHeader = headers.find((h) => h.name.toLowerCase() === 'cookie')?.value ?? '';
    const csrfHeader = headers.find((h) => h.name.toLowerCase() === 'x-csrf-token')?.value ?? '';
    const actAsUserIdHeader =
      headers.find((h) => h.name.toLowerCase() === 'x-act-as-user-id')?.value ??
      headers.find((h) => h.name.toLowerCase() === 'x-user-id')?.value ??
      '';

    if (!cookieHeader) return;

    chrome.storage.local.get(['intercepted'], (result) => {
      const existing = result.intercepted ?? {};
      chrome.storage.local.set({
        intercepted: {
          ...existing,
          twitter: {
            ...(existing.twitter ?? {}),
            queryId,
            requestCookie: cookieHeader,
            csrfToken: csrfHeader || existing?.twitter?.csrfToken,
            actAsUserId: actAsUserIdHeader || existing?.twitter?.actAsUserId,
            capturedAt: new Date().toISOString(),
          },
        },
      });
    });
  },
  { urls: ['https://x.com/i/api/graphql/*', 'https://twitter.com/i/api/graphql/*'] },
  ['requestHeaders', 'extraHeaders']
);

// Capture Twitter "acting as" account id from any X API call, not only timeline.
// Some account-switching flows attach this header on different endpoints.
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = details.requestHeaders ?? [];
    const actAsUserIdHeader =
      headers.find((h) => h.name.toLowerCase() === 'x-act-as-user-id')?.value ??
      headers.find((h) => h.name.toLowerCase() === 'x-user-id')?.value ??
      '';
    if (!actAsUserIdHeader) return;

    chrome.storage.local.get(['intercepted'], (result) => {
      const existing = result.intercepted ?? {};
      chrome.storage.local.set({
        intercepted: {
          ...existing,
          twitter: {
            ...(existing.twitter ?? {}),
            actAsUserId: actAsUserIdHeader,
            capturedAt: new Date().toISOString(),
          },
        },
      });
    });
  },
  { urls: ['https://x.com/i/api/*', 'https://twitter.com/i/api/*'] },
  ['requestHeaders', 'extraHeaders']
);

// ---- Intercept TikTok ----
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!TIKTOK_FYP_PATTERN.test(details.url)) return;

    try {
      const url = new URL(details.url);
      const baseUrl = `${url.origin}${url.pathname}`;
      const aid = url.searchParams.get('aid') ?? '1988';
      const appName = url.searchParams.get('app_name') ?? 'tiktok_web';

      chrome.storage.local.get(['intercepted'], (result) => {
        const existing = result.intercepted ?? {};
        chrome.storage.local.set({
          intercepted: {
            ...existing,
            tiktok: { baseUrl, aid, appName, capturedAt: new Date().toISOString() },
          },
        });
      });
    } catch {
      // ignore parse errors
    }
  },
  { urls: ['https://www.tiktok.com/api/recommend/item_list*'] }
);

// ---- Intercept Instagram ----
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!INSTAGRAM_HOME_PATTERN.test(details.url)) return;

    try {
      const url = new URL(details.url);
      const baseUrl = `${url.origin}${url.pathname}`;
      chrome.storage.local.get(['intercepted'], (result) => {
        const existing = result.intercepted ?? {};
        chrome.storage.local.set({
          intercepted: {
            ...existing,
            instagram: { baseUrl, capturedAt: new Date().toISOString() },
          },
        });
      });
    } catch {
      // ignore parse errors
    }
  },
  { urls: ['https://www.instagram.com/api/v1/feed/timeline/*'] }
);

// ---- Cookie helpers ----

/**
 * Returns true if the given cookie name exists for the domain.
 */
async function hasCookie(domain, name) {
  const cookie = await chrome.cookies.get({ url: `https://${domain}`, name });
  return cookie !== null;
}

async function getCookieHeader(domain) {
  const cookies = await chrome.cookies.getAll({ domain });
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

// ---- Platform status ----

/**
 * @returns {{ status: 'green'|'yellow'|'red', cookieHeader: string|null, metadata: object|null }}
 */
async function getPlatformStatus(platform, intercepted) {
  if (platform === 'twitter') {
    const [hasAuthToken, hasCt0] = await Promise.all([
      hasCookie('x.com', 'auth_token'),
      hasCookie('x.com', 'ct0'),
    ]);
    const hasCookies = hasAuthToken && hasCt0;
    const hasQueryId = Boolean(intercepted?.twitter?.queryId);

    if (!hasCookies) return { status: 'red', cookieHeader: null, metadata: null };

    const cookieHeader = await getCookieHeader('x.com');
    if (!hasQueryId) {
      return { status: 'yellow', cookieHeader, metadata: null };
    }
    return { status: 'green', cookieHeader, metadata: intercepted.twitter };
  }

  if (platform === 'tiktok') {
    const [hasSession, hasTtwid] = await Promise.all([
      hasCookie('tiktok.com', 'sessionid'),
      hasCookie('tiktok.com', 'ttwid'),
    ]);
    const hasCookies = hasSession && hasTtwid;
    const cap = intercepted?.tiktok;
    const hasEndpoint = Boolean(cap?.baseUrl && cap?.aid && cap?.appName);

    if (!hasCookies) return { status: 'red', cookieHeader: null, metadata: null };

    const cookieHeader = await getCookieHeader('tiktok.com');
    if (!hasEndpoint) {
      return { status: 'yellow', cookieHeader, metadata: null };
    }
    return { status: 'green', cookieHeader, metadata: cap };
  }

  if (platform === 'youtube') {
    const has1PSID = await hasCookie('youtube.com', '__Secure-1PSID');
    if (!has1PSID) return { status: 'red', cookieHeader: null, metadata: null };
    const cookieHeader = await getCookieHeader('youtube.com');
    return { status: 'green', cookieHeader, metadata: null };
  }

  if (platform === 'instagram') {
    const [hasSession, hasUserId] = await Promise.all([
      hasCookie('instagram.com', 'sessionid'),
      hasCookie('instagram.com', 'ds_user_id'),
    ]);
    const hasCookies = hasSession && hasUserId;
    const cap = intercepted?.instagram;
    const baseUrl = cap?.baseUrl ?? INSTAGRAM_DEFAULT_BASE_URL;

    if (!hasCookies) return { status: 'red', cookieHeader: null, metadata: null };

    const cookieHeader = await getCookieHeader('instagram.com');
    return { status: 'green', cookieHeader, metadata: { ...(cap ?? {}), baseUrl } };
  }

  if (platform === 'reddit') {
    const hasSession = await hasCookie('reddit.com', 'reddit_session');
    if (!hasSession) return { status: 'red', cookieHeader: null, metadata: null };
    const cookieHeader = await getCookieHeader('reddit.com');
    return { status: 'green', cookieHeader, metadata: null };
  }

  return { status: 'red', cookieHeader: null, metadata: null };
}

// ---- Shared sync helper ----

async function syncPlatforms(platforms, serverUrl, adminApiKey, intercepted) {
  const statusMap = {};
  await Promise.all(
    platforms.map(async (p) => {
      statusMap[p] = await getPlatformStatus(p, intercepted);
    })
  );

  const body = {};

  for (const p of platforms) {
    const info = statusMap[p];
    if (info.status !== 'green') continue;

    if (p === 'twitter') {
      body.twitter = {
        cookie: intercepted.twitter.requestCookie ?? info.cookieHeader,
        queryId: intercepted.twitter.queryId,
        ...(intercepted.twitter.actAsUserId ? { actAsUserId: intercepted.twitter.actAsUserId } : {}),
      };
    } else if (p === 'tiktok') {
      body.tiktok = {
        cookie: info.cookieHeader,
        baseUrl: intercepted.tiktok.baseUrl,
        aid: intercepted.tiktok.aid,
        appName: intercepted.tiktok.appName,
      };
    } else if (p === 'instagram') {
      body.instagram = {
        cookie: info.cookieHeader,
        baseUrl: intercepted?.instagram?.baseUrl ?? INSTAGRAM_DEFAULT_BASE_URL,
      };
    } else if (p === 'youtube') {
      body.youtube = { cookie: info.cookieHeader };
    } else if (p === 'reddit') {
      body.reddit = { cookie: info.cookieHeader };
    }
  }

  if (Object.keys(body).length === 0) {
    return { ok: false, error: 'Platform is not ready to sync' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (adminApiKey) headers['Authorization'] = `Bearer ${adminApiKey}`;

  const res = await fetch(`${serverUrl}/credentials`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, error: `Server returned ${res.status}: ${json.error ?? ''}` };
  }

  return { ok: true, updated: json.updated ?? [] };
}

// ---- Message handlers (used by popup and content scripts) ----

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TIKTOK_ITEMS') {
    const items = message.items;
    if (!Array.isArray(items) || !items.length) {
      sendResponse({ ok: false, error: 'No items received' });
      return false;
    }

    chrome.storage.sync.get(['serverUrl', 'adminApiKey'], async (syncResult) => {
      const serverUrl = (syncResult.serverUrl ?? 'http://localhost:3000').replace(/\/$/, '');
      const adminApiKey = syncResult.adminApiKey ?? '';

      const headers = { 'Content-Type': 'application/json' };
      if (adminApiKey) headers['Authorization'] = `Bearer ${adminApiKey}`;

      try {
        const res = await fetch(`${serverUrl}/feed/tiktok`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ items }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({
            ok: false,
            error: json.error ?? `Server returned ${res.status}`,
          });
          return;
        }
        sendResponse({
          ok: true,
          itemCount: json.itemCount ?? items.length,
        });
      } catch {
        sendResponse({ ok: false, error: 'Server unreachable' });
      }
    });
    return true; // async sendResponse
  }

  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['intercepted', 'platformSync'], async (result) => {
      const intercepted = result.intercepted ?? {};
      const platformSync = result.platformSync ?? {};

      const [twitter, tiktok, instagram, youtube, reddit] = await Promise.all([
        getPlatformStatus('twitter', intercepted),
        getPlatformStatus('tiktok', intercepted),
        getPlatformStatus('instagram', intercepted),
        getPlatformStatus('youtube', intercepted),
        getPlatformStatus('reddit', intercepted),
      ]);

      sendResponse({ twitter, tiktok, instagram, youtube, reddit, platformSync });
    });
    return true;
  }

  // Disconnect a platform
  if (message.type === 'DISCONNECT_PLATFORM') {
    const platform = message.platform;
    chrome.storage.sync.get(['serverUrl', 'adminApiKey'], async (syncResult) => {
      const serverUrl = (syncResult.serverUrl ?? 'http://localhost:3000').replace(/\/$/, '');
      const adminApiKey = syncResult.adminApiKey ?? '';

      chrome.storage.local.get(['platformSync'], async (localResult) => {
        const platformSync = localResult.platformSync ?? {};

        try {
          const headers = { 'Content-Type': 'application/json' };
          if (adminApiKey) headers['Authorization'] = `Bearer ${adminApiKey}`;

          const res = await fetch(`${serverUrl}/credentials/${platform}`, {
            method: 'DELETE',
            headers,
          });

          const json = await res.json().catch(() => ({}));

          if (!res.ok) {
            sendResponse({ ok: false, error: json.error ?? `Server returned ${res.status}` });
            return;
          }

          // Clear the platform from local sync record
          delete platformSync[platform];
          await chrome.storage.local.set({ platformSync });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    });
    return true;
  }

  // Re-sync a platform (same as SYNC_PLATFORM — re-captures fresh cookies + re-posts)
  if (message.type === 'RESYNC_PLATFORM') {
    // Delegate to the same logic as SYNC_PLATFORM by re-using the message
    message.type = 'SYNC_PLATFORM';
    // Fall through to SYNC_PLATFORM handler below
  }

  // Single-platform sync
  if (message.type === 'SYNC_PLATFORM') {
    const platform = message.platform;
    chrome.storage.sync.get(['serverUrl', 'adminApiKey'], async (syncResult) => {
      const serverUrl = (syncResult.serverUrl ?? 'http://localhost:3000').replace(/\/$/, '');
      const adminApiKey = syncResult.adminApiKey ?? '';

      chrome.storage.local.get(['intercepted', 'platformSync'], async (localResult) => {
        const intercepted = localResult.intercepted ?? {};
        const platformSync = localResult.platformSync ?? {};

        try {
          // Step 1: store credentials on the server
          const credResult = await syncPlatforms([platform], serverUrl, adminApiKey, intercepted);

          if (!credResult.ok) {
            platformSync[platform] = {
              at: new Date().toISOString(),
              ok: false,
              error: credResult.error,
              rssUrl: null,
            };
            await chrome.storage.local.set({ platformSync });
            sendResponse({ ok: false, error: credResult.error, rssUrl: null });
            return;
          }

          // Step 2: immediately trigger a feed fetch so the RSS is ready at once
          let pollError = null;
          let itemCount = null;
          try {
            const headers = { 'Content-Type': 'application/json' };
            if (adminApiKey) headers['Authorization'] = `Bearer ${adminApiKey}`;
            const pollRes = await fetch(`${serverUrl}/poll/${platform}`, {
              method: 'POST',
              headers,
            });
            const pollJson = await pollRes.json().catch(() => ({}));
            if (pollRes.ok && pollJson.ok) {
              itemCount = pollJson.itemCount ?? null;
            } else {
              pollError = pollJson.error ?? `Poll returned ${pollRes.status}`;
            }
          } catch (e) {
            pollError = e instanceof Error ? e.message : String(e);
          }

          const rssUrl = `${serverUrl}/rss/${platform}`;
          platformSync[platform] = {
            at: new Date().toISOString(),
            ok: true,
            error: pollError,          // null on full success; non-null if creds saved but poll failed
            rssUrl,
            itemCount,
          };

          await chrome.storage.local.set({ platformSync });
          if (platform === 'tiktok') {
            runTikTokAutoCapture();
          }
          sendResponse({ ok: true, rssUrl, itemCount, pollError });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          platformSync[platform] = {
            at: new Date().toISOString(),
            ok: false,
            error: msg,
            rssUrl: null,
          };
          await chrome.storage.local.set({ platformSync });
          sendResponse({ ok: false, error: msg, rssUrl: null });
        }
      });
    });
    return true;
  }
});
