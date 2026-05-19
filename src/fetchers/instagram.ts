import type { FeedItem, InstagramCredentials } from '../types.js';

const INSTAGRAM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface InstagramOwner {
  username?: string;
}

interface InstagramCaptionNode {
  text?: string;
}

interface InstagramImageCandidate {
  url?: string;
}

interface InstagramImageVersions2 {
  candidates?: InstagramImageCandidate[];
}

interface InstagramMedia {
  id?: string;
  code?: string;
  taken_at?: number;
  user?: InstagramOwner;
  caption?: InstagramCaptionNode | null;
  image_versions2?: InstagramImageVersions2;
}

interface InstagramFeedItem {
  media_or_ad?: InstagramMedia;
}

interface InstagramTimelineResponse {
  feed_items?: InstagramFeedItem[];
  next_max_id?: string;
  more_available?: boolean;
  status?: string;
}

function pickCsrfToken(cookieHeader: string): string {
  const match = cookieHeader.match(/(?:^|;\s*)csrftoken=([^;]+)/i);
  return match?.[1] ?? '';
}

export async function fetchInstagramFeed(creds: InstagramCredentials): Promise<FeedItem[]> {
  const csrfToken = pickCsrfToken(creds.cookie);
  const seenUrls = new Set<string>();
  const collected: FeedItem[] = [];
  let nextMaxId: string | null = null;
  let page = 0;

  while (page < 6 && collected.length < 50) {
    const url = new URL(creds.baseUrl);
    url.searchParams.set('count', '30');
    if (nextMaxId) {
      url.searchParams.set('max_id', nextMaxId);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Cookie: creds.cookie,
        'User-Agent': INSTAGRAM_UA,
        Accept: '*/*',
        Referer: 'https://www.instagram.com/',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
      },
    });

    if (!res.ok) {
      throw new Error(`Instagram API returned ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as InstagramTimelineResponse;
    if (json.status && json.status !== 'ok') {
      throw new Error(`Instagram API returned status: ${json.status}`);
    }

    const feedItems = json.feed_items ?? [];
    for (const media of feedItems.map((item) => item.media_or_ad).filter((m): m is InstagramMedia => Boolean(m))) {
      const shortcode = media.code;
      const username = media.user?.username ?? 'instagram';
      if (!shortcode) continue;

      const caption = media.caption?.text?.trim() || '(Instagram post)';
      const entry: FeedItem = {
        title: caption.slice(0, 120),
        description: caption,
        url: `https://www.instagram.com/p/${shortcode}/`,
        author: username,
        date: media.taken_at ? new Date(media.taken_at * 1000) : new Date(),
        enclosureUrl: media.image_versions2?.candidates?.[0]?.url,
        enclosureType: 'image/jpeg',
      };
      if (!seenUrls.has(entry.url)) {
        seenUrls.add(entry.url);
        collected.push(entry);
      }
    }

    page += 1;
    nextMaxId = json.next_max_id ?? null;
    if (!json.more_available || !nextMaxId) {
      break;
    }
  }

  if (collected.length === 0) {
    throw new Error('Instagram feed had no usable media posts.');
  }

  return collected
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 50);
}
