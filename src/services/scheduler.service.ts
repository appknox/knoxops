import cron from 'node-cron';
import { checkAndNotifyUpcomingPatches } from './patch-reminder.service.js';
import { sendDeviceCheckinDigest, sendDeviceCheckoutDigest } from './device-checkin.service.js';

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduledJobs(): void {
  console.log('Initializing scheduled jobs...');

  // Run patch reminder check daily at 9 AM
  cron.schedule('0 23 * * *', async () => {
    console.log('Running daily patch reminder check at', new Date().toISOString());
    try {
      await checkAndNotifyUpcomingPatches();
    } catch (error) {
      console.error('Error in scheduled patch reminder:', error);
    }
  });

  console.log('✓ Scheduled job registered: Daily patch reminders at 11:00 PM');

  // Device check-in + check-out digests — daily at 6 PM
  cron.schedule('0 23 * * *', async () => {
    console.log('Running daily device digest at', new Date().toISOString());
    try {
      const checkins = await sendDeviceCheckinDigest();
      console.log(`Check-in digest: ${checkins} device(s)`);
    } catch (error) {
      console.error('Error in check-in digest:', error);
    }
    try {
      const checkouts = await sendDeviceCheckoutDigest();
      console.log(`Check-out digest: ${checkouts} device(s)`);
    } catch (error) {
      console.error('Error in check-out digest:', error);
    }
  });
  console.log('✓ Scheduled job registered: Daily device digests at 11:00 PM');

}

/**
 * Manually trigger patch reminder check (for testing)
 */
export async function triggerPatchReminderManually(): Promise<void> {
  console.log('Manually triggering patch reminder check...');
  await checkAndNotifyUpcomingPatches();
}

/**
 * Manually trigger device digests (for testing)
 */
export async function triggerDeviceCheckingManually(): Promise<{
  checkinCount: number;
  checkoutCount: number;
}> {
  console.log('Manually triggering device digests...');
  const checkinCount = await sendDeviceCheckinDigest();
  const checkoutCount = await sendDeviceCheckoutDigest();
  return { checkinCount, checkoutCount };
}
