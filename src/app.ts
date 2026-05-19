import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import {
  saveTwitterCredentials,
  saveTikTokCredentials,
  saveInstagramCredentials,
  saveYouTubeCookie,
  saveRedditCookie,
  loadTwitterCredentials,
  loadTikTokCredentials,
  loadInstagramCredentials,
  loadYouTubeCookie,
  loadRedditCookie,
} from './storage/credentialsStore.js';
import { readFeedXml, writeFeedXml, readAllMeta, updateMeta, deleteFeedCache } from './storage/feedCache.js';
import { deleteCredentials } from './storage/credentialsStore.js';
import { pollOnePlatform } from './jobs/pollFeeds.js';
import { buildFeed } from './rss/buildFeed.js';
import { readBrowserItems, writeBrowserItems, mergeBrowserItems, deleteBrowserItems } from './storage/browserFeedStore.js';
import { PLATFORMS, type Platform, type FeedItem } from './types.js';

// ---- Zod schemas ----

const TwitterSchema = z.object({
  cookie: z.string().min(1, 'cookie is required'),
  queryId: z.string().min(1, 'queryId is required — install the extension and scroll your For You feed on X'),
  actAsUserId: z.string().min(1).optional(),
});

const TikTokSchema = z.object({
  cookie: z.string().min(1, 'cookie is required'),
  baseUrl: z.string().url('baseUrl must be a valid URL — install the extension and scroll your For You feed on TikTok'),
  aid: z.string().min(1, 'aid is required'),
  appName: z.string().min(1, 'appName is required'),
});

const InstagramSchema = z.object({
  cookie: z.string().min(1, 'cookie is required'),
  baseUrl: z.string().url('baseUrl must be a valid URL — install the extension and scroll your Home feed on Instagram'),
});

const YouTubeSchema = z.object({
  cookie: z.string().min(1, 'cookie is required'),
});

const RedditSchema = z.object({
  cookie: z.string().min(1, 'cookie is required'),
});

const CredentialsBodySchema = z
  .object({
    twitter: TwitterSchema.optional(),
    tiktok: TikTokSchema.optional(),
    instagram: InstagramSchema.optional(),
    youtube: YouTubeSchema.optional(),
    reddit: RedditSchema.optional(),
  })
  .refine(
    (body) =>
      body.twitter !== undefined ||
      body.tiktok !== undefined ||
      body.instagram !== undefined ||
      body.youtube !== undefined ||
      body.reddit !== undefined,
    { message: 'At least one platform must be provided' }
  );

// ---- App ----

export function buildApp(): express.Application {
  const app = express();

  // Full CORS handler including Chrome's Private Network Access header
  // (required for HTTPS pages like TikTok to POST to http://localhost)
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Access-Control-Request-Private-Network');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json());

  // Optional API key guard for POST /credentials
  function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    if (!config.adminApiKey) return next();
    const authHeader = req.headers.authorization ?? '';
    if (authHeader !== `Bearer ${config.adminApiKey}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  // ---- POST /credentials ----
  app.post('/credentials', requireApiKey, async (req: Request, res: Response) => {
    const result = CredentialsBodySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
      return;
    }

    const body = result.data;
    const updated: string[] = [];

    try {
      if (body.twitter) {
        await saveTwitterCredentials(body.twitter.cookie, body.twitter.queryId, body.twitter.actAsUserId);
        await updateMeta('twitter', { hasCredentials: true, hasLiveEndpoint: true });
        updated.push('twitter');
      }
      if (body.tiktok) {
        await saveTikTokCredentials(body.tiktok);
        await updateMeta('tiktok', { hasCredentials: true, hasLiveEndpoint: true });
        updated.push('tiktok');
      }
      if (body.instagram) {
        await saveInstagramCredentials(body.instagram);
        await updateMeta('instagram', { hasCredentials: true, hasLiveEndpoint: true });
        updated.push('instagram');
      }
      if (body.youtube) {
        await saveYouTubeCookie(body.youtube.cookie);
        await updateMeta('youtube', { hasCredentials: true, hasLiveEndpoint: true });
        updated.push('youtube');
      }
      if (body.reddit) {
        await saveRedditCookie(body.reddit.cookie);
        await updateMeta('reddit', { hasCredentials: true, hasLiveEndpoint: true });
        updated.push('reddit');
      }

      res.json({ ok: true, updated });
    } catch (err) {
      console.error('[credentials] save error:', err);
      res.status(500).json({ error: 'Failed to save credentials' });
    }
  });

  // ---- DELETE /credentials/:platform ----
  app.delete('/credentials/:platform', requireApiKey, async (req: Request, res: Response) => {
    const platform = req.params.platform as string;
    if (!(PLATFORMS as string[]).includes(platform)) {
      res.status(400).json({ ok: false, error: `Unknown platform. Valid values: ${PLATFORMS.join(', ')}` });
      return;
    }

    try {
      await deleteCredentials(platform as Platform);
      await deleteFeedCache(platform as Platform);
      await deleteBrowserItems(platform as Platform);
      const all = await readAllMeta();
      delete (all as Record<string, unknown>)[platform];
      console.log(`[api] Disconnected ${platform}`);
      res.json({ ok: true, platform });
    } catch (err) {
      console.error(`[credentials] delete error for ${platform}:`, err);
      res.status(500).json({ ok: false, error: 'Failed to disconnect platform' });
    }
  });

  // ---- POST /poll/:platform ----
  app.post('/poll/:platform', requireApiKey, async (req: Request, res: Response) => {
    const platform = req.params.platform as string;
    if (!(PLATFORMS as string[]).includes(platform)) {
      res.status(400).json({
        ok: false,
        error: `Unknown platform. Valid values: ${PLATFORMS.join(', ')}`,
      });
      return;
    }

    console.log(`[api] Manual poll triggered for ${platform}`);
    const result = await pollOnePlatform(platform as Platform);

    if (result.ok) {
      res.json({ ok: true, itemCount: result.itemCount });
    } else {
      res.status(result.skipped ? 422 : 500).json({ ok: false, error: result.error });
    }
  });

  // ---- POST /feed/:platform  (browser-pushed items, no server-side fetch needed) ----
  //
  // Accepts pre-fetched items from the Chrome extension content script.
  // TikTok requires X-Bogus signatures that can only be generated in-browser,
  // so the content script intercepts responses and pushes them here instead.
  app.post('/feed/:platform', requireApiKey, async (req: Request, res: Response) => {
    const platform = req.params.platform as string;
    if (!(PLATFORMS as string[]).includes(platform)) {
      res.status(400).json({ ok: false, error: `Unknown platform. Valid values: ${PLATFORMS.join(', ')}` });
      return;
    }

    const { items } = req.body as { items?: unknown[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ ok: false, error: '`items` must be a non-empty array' });
      return;
    }

    // Normalise items — dates come in as ISO strings from JSON
    const feedItems: FeedItem[] = items.map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        title:        String(r.title ?? '(no title)'),
        description:  String(r.description ?? r.title ?? ''),
        url:          String(r.url ?? ''),
        author:       r.author ? String(r.author) : undefined,
        date:         r.date ? new Date(r.date as string) : new Date(),
        enclosureUrl: r.enclosureUrl ? String(r.enclosureUrl) : undefined,
        enclosureType: r.enclosureType ? String(r.enclosureType) : undefined,
      };
    }).filter((i) => i.url);

    try {
      const currentItems = await readBrowserItems(platform as Platform);
      const mergedItems = mergeBrowserItems(currentItems, feedItems, 300);
      const xml = buildFeed(platform as Platform, mergedItems);
      await writeFeedXml(platform as Platform, xml);
      await writeBrowserItems(platform as Platform, mergedItems);
      await updateMeta(platform as Platform, {
        hasCredentials: true,
        hasLiveEndpoint: true,
        lastFetch: new Date().toISOString(),
        itemCount: mergedItems.length,
      });
      console.log(`[api] Browser-pushed feed for ${platform} — incoming: ${feedItems.length}, total: ${mergedItems.length}`);
      res.json({ ok: true, itemCount: mergedItems.length, incomingCount: feedItems.length });
    } catch (err) {
      console.error(`[api] /feed/${platform} error:`, err);
      res.status(500).json({ ok: false, error: 'Failed to write feed' });
    }
  });

  // ---- GET /rss/:platform ----
  app.get('/rss/:platform', async (req: Request, res: Response) => {
    const platform = req.params.platform as string;
    if (!(PLATFORMS as string[]).includes(platform)) {
      res.status(400).json({
        error: `Unknown platform. Valid values: ${PLATFORMS.join(', ')}`,
      });
      return;
    }

    const xml = await readFeedXml(platform as Platform);
    if (!xml) {
      res.status(503).json({
        error: `Feed not ready. POST /credentials for ${platform} and wait for the next poll (every 15 min).`,
      });
      return;
    }

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  });

  // ---- GET /health ----
  app.get('/health', async (_req: Request, res: Response) => {
    const [twitterCreds, tiktokCreds, instagramCreds, youtubeCookie, redditCookie, meta] =
      await Promise.all([
        loadTwitterCredentials(),
        loadTikTokCredentials(),
        loadInstagramCredentials(),
        loadYouTubeCookie(),
        loadRedditCookie(),
        readAllMeta(),
      ]);

    res.json({
      platforms: {
        twitter: {
          ...meta.twitter,
          hasCredentials: twitterCreds !== null,
          hasLiveEndpoint: Boolean(twitterCreds?.queryId),
        },
        tiktok: {
          ...meta.tiktok,
          hasCredentials: tiktokCreds !== null,
          hasLiveEndpoint: Boolean(tiktokCreds?.baseUrl),
        },
        instagram: {
          ...meta.instagram,
          hasCredentials: instagramCreds !== null,
          hasLiveEndpoint: Boolean(instagramCreds?.baseUrl),
        },
        youtube: {
          ...meta.youtube,
          hasCredentials: youtubeCookie !== null,
          hasLiveEndpoint: true,
        },
        reddit: {
          ...meta.reddit,
          hasCredentials: redditCookie !== null,
          hasLiveEndpoint: true,
        },
      },
    });
  });

  return app;
}
