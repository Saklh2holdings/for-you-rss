export type Platform = 'twitter' | 'youtube' | 'reddit' | 'tiktok' | 'instagram';

export const PLATFORMS: Platform[] = ['twitter', 'youtube', 'reddit', 'tiktok', 'instagram'];

export interface FeedItem {
  title: string;
  description: string;
  url: string;
  author?: string;
  date: Date;
  enclosureUrl?: string;
  enclosureType?: string;
}

// Per-platform credential shapes stored on disk

export interface TwitterCredentials {
  cookie: string;
  queryId: string;
  actAsUserId?: string;
  updatedAt: string;
}

export interface TikTokCredentials {
  cookie: string;
  baseUrl: string;
  aid: string;
  appName: string;
  updatedAt: string;
}

export interface InstagramCredentials {
  cookie: string;
  baseUrl: string;
  updatedAt: string;
}

// Credentials as accepted by POST /credentials
export interface CredentialsPayload {
  twitter?: { cookie: string; queryId: string; actAsUserId?: string };
  tiktok?: { cookie: string; baseUrl: string; aid: string; appName: string };
  instagram?: { cookie: string; baseUrl: string };
  youtube?: { cookie: string };
  reddit?: { cookie: string };
}

export interface PlatformMeta {
  hasCredentials: boolean;
  hasLiveEndpoint: boolean;
  lastFetch?: string;
  lastError?: string;
  itemCount?: number;
}
