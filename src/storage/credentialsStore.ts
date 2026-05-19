import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import type { TwitterCredentials, TikTokCredentials, InstagramCredentials } from '../types.js';

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.cookiesDir, { recursive: true });
}

// ---- Twitter ----

export async function saveTwitterCredentials(
  cookie: string,
  queryId: string,
  actAsUserId?: string
): Promise<void> {
  await ensureDir();
  const data: TwitterCredentials = { cookie, queryId, actAsUserId, updatedAt: new Date().toISOString() };
  await fs.writeFile(
    path.join(config.cookiesDir, 'twitter.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

export async function loadTwitterCredentials(): Promise<TwitterCredentials | null> {
  try {
    const raw = await fs.readFile(
      path.join(config.cookiesDir, 'twitter.json'),
      'utf-8'
    );
    return JSON.parse(raw) as TwitterCredentials;
  } catch {
    return null;
  }
}

// ---- TikTok ----

export async function saveTikTokCredentials(
  creds: Omit<TikTokCredentials, 'updatedAt'>
): Promise<void> {
  await ensureDir();
  const data: TikTokCredentials = { ...creds, updatedAt: new Date().toISOString() };
  await fs.writeFile(
    path.join(config.cookiesDir, 'tiktok.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

export async function loadTikTokCredentials(): Promise<TikTokCredentials | null> {
  try {
    const raw = await fs.readFile(
      path.join(config.cookiesDir, 'tiktok.json'),
      'utf-8'
    );
    return JSON.parse(raw) as TikTokCredentials;
  } catch {
    return null;
  }
}

// ---- YouTube ----

export async function saveYouTubeCookie(cookie: string): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(config.cookiesDir, 'youtube.txt'), cookie, 'utf-8');
}

export async function loadYouTubeCookie(): Promise<string | null> {
  try {
    return await fs.readFile(path.join(config.cookiesDir, 'youtube.txt'), 'utf-8');
  } catch {
    return null;
  }
}

// ---- Reddit ----

export async function saveRedditCookie(cookie: string): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(config.cookiesDir, 'reddit.txt'), cookie, 'utf-8');
}

export async function loadRedditCookie(): Promise<string | null> {
  try {
    return await fs.readFile(path.join(config.cookiesDir, 'reddit.txt'), 'utf-8');
  } catch {
    return null;
  }
}

// ---- Instagram ----

export async function saveInstagramCredentials(
  creds: Omit<InstagramCredentials, 'updatedAt'>
): Promise<void> {
  await ensureDir();
  const data: InstagramCredentials = { ...creds, updatedAt: new Date().toISOString() };
  await fs.writeFile(
    path.join(config.cookiesDir, 'instagram.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

export async function loadInstagramCredentials(): Promise<InstagramCredentials | null> {
  try {
    const raw = await fs.readFile(
      path.join(config.cookiesDir, 'instagram.json'),
      'utf-8'
    );
    return JSON.parse(raw) as InstagramCredentials;
  } catch {
    return null;
  }
}

// ---- Delete (disconnect) ----

const CREDENTIAL_FILES: Record<string, string> = {
  twitter: 'twitter.json',
  tiktok: 'tiktok.json',
  instagram: 'instagram.json',
  youtube: 'youtube.txt',
  reddit: 'reddit.txt',
};

export async function deleteCredentials(platform: string): Promise<void> {
  const filename = CREDENTIAL_FILES[platform];
  if (!filename) return;
  try {
    await fs.unlink(path.join(config.cookiesDir, filename));
  } catch {
    // Ignore — file may not exist
  }
}
