import fs from 'fs/promises';
import cron from 'node-cron';
import { config } from './config.js';
import { buildApp } from './app.js';
import { pollFeeds } from './jobs/pollFeeds.js';

async function bootstrap(): Promise<void> {
  // Ensure storage directories exist
  await Promise.all([
    fs.mkdir(config.cookiesDir, { recursive: true }),
    fs.mkdir(config.outputDir, { recursive: true }),
  ]);

  const app = buildApp();

  app.listen(config.port, () => {
    console.log(`[server] Listening on http://localhost:${config.port}`);
    console.log(`[server] Public base URL: ${config.publicBaseUrl}`);

    // Run one poll immediately on startup, then every 15 minutes
    pollFeeds().catch((err) => console.error('[startup poll] Unexpected error:', err));
    cron.schedule('*/15 * * * *', () => {
      pollFeeds().catch((err) => console.error('[cron poll] Unexpected error:', err));
    });

    console.log('[cron] Scheduled every 15 minutes');
  });
}

bootstrap().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
