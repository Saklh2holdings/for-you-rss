import path from 'path';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  adminApiKey: process.env.ADMIN_API_KEY ?? '',
  twitterBearerToken:
    process.env.TWITTER_BEARER_TOKEN ??
    'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  twitterHomeQueryId: process.env.TWITTER_HOME_QUERY_ID ?? '',
  cookiesDir: process.env.COOKIES_DIR ?? path.join(process.cwd(), 'cookies'),
  outputDir: process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output'),
};
