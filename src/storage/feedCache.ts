import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import type { Platform, PlatformMeta } from '../types.js';

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.outputDir, { recursive: true });
}

function xmlPath(platform: Platform): string {
  return path.join(config.outputDir, `${platform}.xml`);
}

function metaPath(): string {
  return path.join(config.outputDir, 'meta.json');
}

export async function writeFeedXml(platform: Platform, xml: string): Promise<void> {
  await ensureDir();
  await fs.writeFile(xmlPath(platform), xml, 'utf-8');
}

export async function readFeedXml(platform: Platform): Promise<string | null> {
  try {
    return await fs.readFile(xmlPath(platform), 'utf-8');
  } catch {
    return null;
  }
}

export async function readAllMeta(): Promise<Record<Platform, PlatformMeta>> {
  try {
    const raw = await fs.readFile(metaPath(), 'utf-8');
    return JSON.parse(raw) as Record<Platform, PlatformMeta>;
  } catch {
    return {
      twitter: { hasCredentials: false, hasLiveEndpoint: false },
      youtube: { hasCredentials: false, hasLiveEndpoint: false },
      reddit: { hasCredentials: false, hasLiveEndpoint: false },
      tiktok: { hasCredentials: false, hasLiveEndpoint: false },
      instagram: { hasCredentials: false, hasLiveEndpoint: false },
    };
  }
}

export async function updateMeta(
  platform: Platform,
  update: Partial<PlatformMeta>
): Promise<void> {
  await ensureDir();
  const all = await readAllMeta();
  all[platform] = { ...all[platform], ...update };
  await fs.writeFile(metaPath(), JSON.stringify(all, null, 2), 'utf-8');
}

export async function deleteFeedCache(platform: Platform): Promise<void> {
  // Delete the XML file
  try {
    await fs.unlink(xmlPath(platform));
  } catch {
    // Ignore — file may not exist
  }
  // Remove platform entry from meta.json
  try {
    const all = await readAllMeta();
    delete (all as Record<string, unknown>)[platform];
    await fs.writeFile(metaPath(), JSON.stringify(all, null, 2), 'utf-8');
  } catch {
    // Ignore
  }
}
