import type { FeedItem } from '../types.js';

const REDDIT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface RedditChild {
  data: {
    id: string;
    title: string;
    selftext?: string;
    url: string;
    permalink: string;
    author: string;
    created_utc: number;
    thumbnail?: string;
  };
}

interface RedditListing {
  data: { children: RedditChild[] };
}

export async function fetchRedditFeed(cookie: string): Promise<FeedItem[]> {
  const res = await fetch('https://www.reddit.com/best/.json?limit=50', {
    headers: {
      Cookie: cookie,
      'User-Agent': REDDIT_UA,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit returned ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as RedditListing;
  const children = json?.data?.children ?? [];

  if (children.length === 0) {
    throw new Error('Reddit returned an empty feed — cookie may be expired or not logged in');
  }

  return children.slice(0, 50).map((child) => {
    const post = child.data;
    const thumbnail =
      post.thumbnail &&
      post.thumbnail !== 'self' &&
      post.thumbnail !== 'default' &&
      post.thumbnail.startsWith('http')
        ? post.thumbnail
        : undefined;

    return {
      title: post.title,
      description: post.selftext ? post.selftext.slice(0, 500) : post.title,
      url: `https://www.reddit.com${post.permalink}`,
      author: post.author,
      date: new Date(post.created_utc * 1000),
      enclosureUrl: thumbnail,
      enclosureType: 'image/jpeg',
    };
  });
}
