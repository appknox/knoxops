import cron from 'node-cron';
import { checkAndNotifyUpcomingPatches } from './patch-reminder.service.js';

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduledJobs(): void {
  console.log('Initializing scheduled jobs...');

  // Run patch reminder check daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily patch reminder check at', new Date().toISOString());
    try {
      await checkAndNotifyUpcomingPatches();
    } catch (error) {
      console.error('Error in scheduled patch reminder:', error);
    }
  });

  console.log('✓ Scheduled job registered: Daily patch reminders at 9:00 AM');

  // Optional: Run on startup for testing (comment out in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('Running initial patch check (development mode)...');
    setTimeout(() => {
      checkAndNotifyUpcomingPatches().catch(console.error);
    }, 5000); // Wait 5 seconds after startup
  }
}

/**
 * Manually trigger patch reminder check (for testing)
 */
export async function triggerPatchReminderManually(): Promise<void> {
  console.log('Manually triggering patch reminder check...');
  await checkAndNotifyUpcomingPatches();
}
