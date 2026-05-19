import type { FeedItem } from '../types.js';
import type { TikTokCredentials } from '../types.js';

const TIKTOK_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface TikTokAuthor {
  uniqueId?: string;
  nickname?: string;
}

interface TikTokVideo {
  cover?: string;
}

interface TikTokItem {
  id?: string;
  desc?: string;
  createTime?: number;
  author?: TikTokAuthor;
  video?: TikTokVideo;
}

interface TikTokResponse {
  itemList?: TikTokItem[];
  statusCode?: number;
  status_code?: number;
}

export async function fetchTikTokFeed(creds: TikTokCredentials): Promise<FeedItem[]> {
  const { cookie, baseUrl, aid, appName } = creds;

  const url = new URL(baseUrl);
  // Apply standard For You params; merge over any already in the baseUrl
  url.searchParams.set('aid', aid);
  url.searchParams.set('app_name', appName);
  url.searchParams.set('count', '30');
  url.searchParams.set('from_page', 'fyp');

  const res = await fetch(url.toString(), {
    headers: {
      Cookie: cookie,
      'User-Agent': TIKTOK_UA,
      Referer: 'https://www.tiktok.com/',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`TikTok API returned ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as TikTokResponse;

  const statusCode = json.statusCode ?? json.status_code ?? 0;
  if (statusCode !== 0) {
    throw new Error(
      `TikTok API error status ${statusCode} — cookie may be expired. Re-sync via extension.`
    );
  }

  const items = json.itemList ?? [];
  if (items.length === 0) {
    throw new Error(
      'TikTok returned an empty For You feed — cookie may be expired or endpoint changed. Re-sync.'
    );
  }

  return items.slice(0, 50).map((item): FeedItem => {
    const authorId = item.author?.uniqueId ?? 'unknown';
    const videoId = item.id ?? '';
    const url =
      videoId && authorId !== 'unknown'
        ? `https://www.tiktok.com/@${authorId}/video/${videoId}`
        : 'https://www.tiktok.com/';

    return {
      title: item.desc || '(TikTok video)',
      description: item.desc || '(TikTok video)',
      url,
      author: item.author?.nickname ?? authorId,
      date: item.createTime ? new Date(item.createTime * 1000) : new Date(),
      enclosureUrl: item.video?.cover,
      enclosureType: 'image/jpeg',
    };
  });
}
