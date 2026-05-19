import { config } from '../config.js';
import type { FeedItem } from '../types.js';
import type { TwitterCredentials } from '../types.js';

const TWITTER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Default features object required by X GraphQL — may need periodic updates
const HOME_TIMELINE_FEATURES = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

function parseCookieValue(cookieString: string, name: string): string {
  const match = cookieString.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? '';
}

function upsertCookieValue(cookieString: string, name: string, value: string): string {
  const encoded = encodeURIComponent(value);
  const re = new RegExp(`(?:^|;\\s*)${name}=[^;]*`);
  if (re.test(cookieString)) {
    return cookieString.replace(re, (m) => (m.startsWith(';') ? `; ${name}=${encoded}` : `${name}=${encoded}`));
  }
  return `${cookieString}; ${name}=${encoded}`;
}

// Recursively walk the X timeline instruction tree to find tweet results
function extractTweets(obj: unknown, results: FeedItem[]): void {
  if (!obj || typeof obj !== 'object') return;

  const o = obj as Record<string, unknown>;

  // Look for tweet_results.result containing legacy tweet data
  if (o['tweet_results'] && typeof o['tweet_results'] === 'object') {
    const tweetResult = (o['tweet_results'] as Record<string, unknown>)['result'] as
      | Record<string, unknown>
      | undefined;
    if (tweetResult) {
      const legacy = tweetResult['legacy'] as Record<string, unknown> | undefined;
      const userLegacy = (
        (tweetResult['core'] as Record<string, unknown> | undefined)
          ?.['user_results'] as Record<string, unknown> | undefined
      )?.['result'] as Record<string, unknown> | undefined;

      if (legacy && typeof legacy['full_text'] === 'string') {
        const id = String(legacy['id_str'] ?? tweetResult['rest_id'] ?? '');
        const text = legacy['full_text'] as string;
        const createdAt = legacy['created_at'] as string | undefined;
        const author =
          (userLegacy?.['legacy'] as Record<string, unknown> | undefined)?.['name'] ??
          (userLegacy?.['legacy'] as Record<string, unknown> | undefined)?.['screen_name'] ??
          '';

        if (id) {
          results.push({
            title: text.slice(0, 100) + (text.length > 100 ? '…' : ''),
            description: text,
            url: `https://x.com/i/web/status/${id}`,
            author: String(author),
            date: createdAt ? new Date(createdAt) : new Date(),
          });
        }
      }
    }
  }

  // Recurse into arrays and objects
  for (const value of Object.values(o)) {
    if (Array.isArray(value)) {
      for (const v of value) extractTweets(v, results);
    } else if (typeof value === 'object' && value !== null) {
      extractTweets(value, results);
    }
  }
}

export async function fetchTwitterFeed(creds: TwitterCredentials): Promise<FeedItem[]> {
  const { queryId, actAsUserId } = creds;
  const cookie = actAsUserId ? upsertCookieValue(creds.cookie, 'twid', `u=${actAsUserId}`) : creds.cookie;

  const ct0 = parseCookieValue(cookie, 'ct0');
  if (!ct0) {
    throw new Error('ct0 cookie not found in Twitter credentials — please re-sync');
  }

  // Allow env override for manual testing; otherwise use stored queryId
  const effectiveQueryId = config.twitterHomeQueryId || queryId;

  const variables = {
    count: 40,
    includePromotedContent: true,
    latestControlAvailable: true,
    requestContext: 'launch',
    withCommunity: true,
    seenTweetIds: [],
  };

  const url = `https://x.com/i/api/graphql/${effectiveQueryId}/HomeTimeline`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'x-csrf-token': ct0,
      authorization: `Bearer ${config.twitterBearerToken}`,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'content-type': 'application/json',
      'User-Agent': TWITTER_UA,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://x.com/home',
      'x-twitter-client-language': 'en',
      ...(actAsUserId ? { 'x-act-as-user-id': actAsUserId } : {}),
    },
    body: JSON.stringify({
      variables,
      features: HOME_TIMELINE_FEATURES,
      queryId: effectiveQueryId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twitter API returned ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const results: FeedItem[] = [];
  extractTweets(json, results);

  if (results.length === 0) {
    throw new Error(
      'Twitter returned no tweets — queryId may be stale. Re-sync via extension.'
    );
  }

  return results.slice(0, 50);
}
