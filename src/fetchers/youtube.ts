import { Innertube } from 'youtubei.js';
import type { FeedItem } from '../types.js';

// ---- LockupView type helpers ----
// In youtubei.js v10 the HomeFeed returns LockupView nodes, not Video nodes.
// We navigate the tree manually rather than relying on typed getters.

interface Run { text: string }
interface TextObj { runs?: Run[]; text?: string }
interface MetadataPart { text?: TextObj }
interface MetadataRow { metadata_parts?: MetadataPart[] }
interface ContentMetadataView { metadata_rows?: MetadataRow[] }
interface LockupMetadataView { title?: TextObj; metadata?: ContentMetadataView }
interface NavigationEndpointPayload { videoId?: string }
interface NavigationEndpoint { payload?: NavigationEndpointPayload }

interface LockupViewNode {
  type: string;
  content_id?: string;
  content_type?: string;
  on_tap_endpoint?: NavigationEndpoint;
  metadata?: LockupMetadataView;
}

// Feed pages from youtubei.js have a has_continuation flag and getContinuation()
interface FeedPage {
  contents?: unknown;
  has_continuation?: boolean;
  getContinuation?: () => Promise<FeedPage>;
}

function getText(t: TextObj | undefined): string {
  if (!t) return '';
  if (t.text) return t.text;
  return t.runs?.[0]?.text ?? '';
}

function extractVideoId(node: LockupViewNode): string {
  return node.content_id ?? node.on_tap_endpoint?.payload?.videoId ?? '';
}

function extractTitle(node: LockupViewNode): string {
  return getText(node.metadata?.title);
}

function extractAuthor(node: LockupViewNode): string {
  const rows = node.metadata?.metadata?.metadata_rows ?? [];
  const firstPart = rows[0]?.metadata_parts?.[0];
  return getText(firstPart?.text);
}

function extractItemsFromPage(page: FeedPage): FeedItem[] {
  const grid = page.contents as { contents?: Array<{ content?: unknown }> } | undefined;
  const richItems = grid?.contents ?? [];
  const items: FeedItem[] = [];

  for (const richItem of richItems) {
    const node = richItem?.content as unknown as LockupViewNode | undefined;
    if (!node) continue;
    if (node.type !== 'LockupView') continue;
    if (node.content_type && node.content_type !== 'VIDEO') continue;

    const videoId = extractVideoId(node);
    if (!videoId) continue;

    const title = extractTitle(node) || '(YouTube video)';
    const author = extractAuthor(node);

    items.push({
      title,
      description: title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      author,
      date: new Date(),
      enclosureUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      enclosureType: 'image/jpeg',
    });
  }

  return items;
}

const MAX_ITEMS = 60;
const MAX_PAGES = 3;

export async function fetchYouTubeFeed(cookie: string): Promise<FeedItem[]> {
  const innertube = await Innertube.create({ cookie });
  let page = await innertube.getHomeFeed() as unknown as FeedPage;

  const seen = new Set<string>();
  const allItems: FeedItem[] = [];

  for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
    const pageItems = extractItemsFromPage(page);

    for (const item of pageItems) {
      // Deduplicate by URL across pages
      if (!seen.has(item.url)) {
        seen.add(item.url);
        allItems.push(item);
      }
    }

    if (allItems.length >= MAX_ITEMS) break;
    if (!page.has_continuation || typeof page.getContinuation !== 'function') break;

    try {
      page = await page.getContinuation();
    } catch {
      break;
    }
  }

  if (allItems.length === 0) {
    throw new Error(
      'YouTube returned no videos — cookie may be expired or feed structure changed. Re-sync via extension.'
    );
  }

  return allItems.slice(0, MAX_ITEMS);
}
