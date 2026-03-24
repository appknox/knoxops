import 'dotenv/config';
import { env } from './config/env.js';
import { buildApp } from './app.js';
import { initializeScheduledJobs } from './services/scheduler.service.js';
import { seedDefaultSettings, loadSettings } from './modules/settings/settings.service.js';

async function main() {
  const app = await buildApp();

  try {
    // Seed and load settings from database
    await seedDefaultSettings();
    await loadSettings();

    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`Server running at http://${env.HOST}:${env.PORT}`);
    console.log(`API docs at http://${env.HOST}:${env.PORT}/docs`);

    // Initialize scheduled jobs (cron tasks)
    initializeScheduledJobs();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
