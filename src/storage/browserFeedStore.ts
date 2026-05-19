import fs from 'fs/promises';
import path from 'path';
import type { FeedItem, Platform } from '../types.js';
import { config } from '../config.js';

function itemsPath(platform: Platform): string {
  return path.join(config.outputDir, `${platform}-items.json`);
}

function normaliseItemDate(item: FeedItem): FeedItem {
  const date = item.date instanceof Date ? item.date : new Date(item.date);
  return {
    ...item,
    date: Number.isNaN(date.getTime()) ? new Date() : date,
  };
}

export async function readBrowserItems(platform: Platform): Promise<FeedItem[]> {
  try {
    const raw = await fs.readFile(itemsPath(platform), 'utf-8');
    const parsed = JSON.parse(raw) as Array<Omit<FeedItem, 'date'> & { date: string }>;
    return parsed.map((item) =>
      normaliseItemDate({
        ...item,
        date: new Date(item.date),
      })
    );
  } catch {
    return [];
  }
}

export async function writeBrowserItems(platform: Platform, items: FeedItem[]): Promise<void> {
  await fs.mkdir(config.outputDir, { recursive: true });
  const serializable = items.map((item) => ({
    ...item,
    date: normaliseItemDate(item).date.toISOString(),
  }));
  await fs.writeFile(itemsPath(platform), JSON.stringify(serializable, null, 2), 'utf-8');
}

export async function deleteBrowserItems(platform: Platform): Promise<void> {
  try {
    await fs.unlink(itemsPath(platform));
  } catch {
    // Ignore if file does not exist.
  }
}

export function mergeBrowserItems(existing: FeedItem[], incoming: FeedItem[], limit = 200): FeedItem[] {
  const byUrl = new Map<string, FeedItem>();

  for (const item of [...incoming, ...existing]) {
    const normalized = normaliseItemDate(item);
    if (!normalized.url) continue;
    const current = byUrl.get(normalized.url);
    if (!current) {
      byUrl.set(normalized.url, normalized);
      continue;
    }

    // Keep the newest snapshot for duplicates.
    if (normalized.date.getTime() > current.date.getTime()) {
      byUrl.set(normalized.url, normalized);
    }
  }

  return [...byUrl.values()]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}
