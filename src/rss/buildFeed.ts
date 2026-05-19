import RSS from 'rss';
import { config } from '../config.js';
import type { FeedItem, Platform } from '../types.js';

const PLATFORM_TITLES: Record<Platform, string> = {
  twitter: 'Twitter / X — For You',
  youtube: 'YouTube — Home Feed',
  reddit: 'Reddit — Home Feed',
  tiktok: 'TikTok — For You',
  instagram: 'Instagram — Home Feed',
};

const PLATFORM_SITES: Record<Platform, string> = {
  twitter: 'https://x.com',
  youtube: 'https://www.youtube.com',
  reddit: 'https://www.reddit.com',
  tiktok: 'https://www.tiktok.com',
  instagram: 'https://www.instagram.com',
};

export function buildFeed(platform: Platform, items: FeedItem[]): string {
  const feed = new RSS({
    title: PLATFORM_TITLES[platform],
    description: `Personalized ${PLATFORM_TITLES[platform]} delivered as RSS`,
    feed_url: `${config.publicBaseUrl}/rss/${platform}`,
    site_url: PLATFORM_SITES[platform],
    language: 'en',
    ttl: 15,
    pubDate: new Date(),
  });

  for (const item of items) {
    const entry: RSS.ItemOptions = {
      title: item.title || '(no title)',
      description: item.description,
      url: item.url,
      date: item.date,
      author: item.author,
    };
    if (item.enclosureUrl) {
      entry.enclosure = {
        url: item.enclosureUrl,
        type: item.enclosureType ?? 'image/jpeg',
      };
    }
    feed.item(entry);
  }

  return feed.xml({ indent: true });
}
