import {
  loadTwitterCredentials,
  loadTikTokCredentials,
  loadInstagramCredentials,
  loadYouTubeCookie,
  loadRedditCookie,
} from '../storage/credentialsStore.js';
import { writeFeedXml, updateMeta } from '../storage/feedCache.js';
import { readBrowserItems } from '../storage/browserFeedStore.js';
import { buildFeed } from '../rss/buildFeed.js';
import { fetchTwitterFeed } from '../fetchers/twitter.js';
import { fetchYouTubeFeed } from '../fetchers/youtube.js';
import { fetchRedditFeed } from '../fetchers/reddit.js';
import { fetchTikTokFeed } from '../fetchers/tiktok.js';
import { fetchInstagramFeed } from '../fetchers/instagram.js';
import type { Platform } from '../types.js';

export interface PollResult {
  ok: boolean;
  itemCount?: number;
  error?: string;
  skipped?: boolean;
}

export async function pollOnePlatform(platform: Platform): Promise<PollResult> {
  const tag = `[poll:${platform}]`;
  try {
    let items;

    if (platform === 'twitter') {
      const creds = await loadTwitterCredentials();
      if (!creds) {
        console.log(`${tag} No credentials — skipping`);
        return { ok: false, skipped: true, error: 'No credentials stored. POST /credentials first.' };
      }
      if (!creds.queryId) {
        console.log(`${tag} Missing queryId — re-sync via extension and scroll For You on X`);
        return { ok: false, skipped: true, error: 'Missing queryId. Re-sync via extension after scrolling For You on X.' };
      }
      items = await fetchTwitterFeed(creds);
    } else if (platform === 'tiktok') {
      const creds = await loadTikTokCredentials();
      if (!creds) {
        console.log(`${tag} No credentials — skipping`);
        return { ok: false, skipped: true, error: 'No credentials stored. POST /credentials first.' };
      }
      if (!creds.baseUrl) {
        console.log(`${tag} Missing baseUrl — re-sync via extension and scroll For You on TikTok`);
        return { ok: false, skipped: true, error: 'Missing baseUrl. Re-sync via extension after scrolling For You on TikTok.' };
      }
      items = await fetchTikTokFeed(creds);
    } else if (platform === 'youtube') {
      const cookie = await loadYouTubeCookie();
      if (!cookie) {
        console.log(`${tag} No credentials — skipping`);
        return { ok: false, skipped: true, error: 'No credentials stored. POST /credentials first.' };
      }
      const browserItems = await readBrowserItems('youtube');
      try {
        items = await fetchYouTubeFeed(cookie);
      } catch (err) {
        if (browserItems.length > 0) {
          console.log(`${tag} Server fetch failed; using ${browserItems.length} browser-pushed items`);
          items = browserItems;
        } else {
          throw err;
        }
      }
    } else if (platform === 'instagram') {
      const creds = await loadInstagramCredentials();
      if (!creds) {
        console.log(`${tag} No credentials — skipping`);
        return { ok: false, skipped: true, error: 'No credentials stored. POST /credentials first.' };
      }
      if (!creds.baseUrl) {
        console.log(`${tag} Missing baseUrl — re-sync via extension and scroll Home feed on Instagram`);
        return { ok: false, skipped: true, error: 'Missing baseUrl. Re-sync via extension after scrolling Home on Instagram.' };
      }
      items = await fetchInstagramFeed(creds);
    } else {
      // reddit
      const cookie = await loadRedditCookie();
      if (!cookie) {
        console.log(`${tag} No credentials — skipping`);
        return { ok: false, skipped: true, error: 'No credentials stored. POST /credentials first.' };
      }
      items = await fetchRedditFeed(cookie);
    }

    const xml = buildFeed(platform, items);
    await writeFeedXml(platform, xml);
    await updateMeta(platform, {
      lastFetch: new Date().toISOString(),
      lastError: undefined,
      itemCount: items.length,
    });
    console.log(`${tag} OK — ${items.length} items`);
    return { ok: true, itemCount: items.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${tag} ERROR — ${msg}`);
    await updateMeta(platform, { lastError: msg });
    return { ok: false, error: msg };
  }
}

export async function pollFeeds(): Promise<void> {
  console.log('[poll] Starting feed refresh…');
  await Promise.allSettled([
    pollOnePlatform('twitter'),
    pollOnePlatform('youtube'),
    pollOnePlatform('reddit'),
    pollOnePlatform('tiktok'),
    pollOnePlatform('instagram'),
  ]);
  console.log('[poll] Done');
}
