import { db } from '../db/index.js';
import { onpremDeployments } from '../db/schema/index.js';
import { and, isNotNull, gte, lte, sql } from 'drizzle-orm';
import { sendPatchReminders } from './slack-notification.service.js';

interface UpcomingPatch {
  id: string;
  clientName: string;
  nextScheduledPatchDate: string;
  currentVersion: string | null;
  environmentType: string;
  daysUntilPatch: number;
}

/**
 * Get deployments with upcoming patch dates (within specified days)
 */
export async function getUpcomingPatches(daysAhead: number = 10): Promise<UpcomingPatch[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  try {
    const results = await db
      .select({
        id: onpremDeployments.id,
        clientName: onpremDeployments.clientName,
        nextScheduledPatchDate: onpremDeployments.nextScheduledPatchDate,
        currentVersion: onpremDeployments.currentVersion,
        environmentType: onpremDeployments.environmentType,
      })
      .from(onpremDeployments)
      .where(
        and(
          isNotNull(onpremDeployments.nextScheduledPatchDate),
          gte(onpremDeployments.nextScheduledPatchDate, today.toISOString()),
          lte(onpremDeployments.nextScheduledPatchDate, futureDate.toISOString())
        )
      )
      .orderBy(onpremDeployments.nextScheduledPatchDate);

    return results.map((result) => {
      const patchDate = new Date(result.nextScheduledPatchDate!);
      const daysUntilPatch = Math.ceil(
        (patchDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: result.id,
        clientName: result.clientName,
        nextScheduledPatchDate: result.nextScheduledPatchDate!,
        currentVersion: result.currentVersion,
        environmentType: result.environmentType,
        daysUntilPatch,
      };
    });
  } catch (error) {
    console.error('Error fetching upcoming patches:', error);
    throw error;
  }
}

/**
 * Check for upcoming patches and send notifications
 */
export async function checkAndNotifyUpcomingPatches(): Promise<void> {
  console.log('Checking for upcoming patch schedules...');

  try {
    const upcomingPatches = await getUpcomingPatches(10);

    if (upcomingPatches.length === 0) {
      console.log('No upcoming patches in the next 10 days.');
      return;
    }

    console.log(`Found ${upcomingPatches.length} upcoming patch(es). Sending notifications...`);

    // Format for Slack notification
    const patchNotifications = upcomingPatches.map((patch) => ({
      clientName: patch.clientName,
      nextPatchDate: new Date(patch.nextScheduledPatchDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      daysUntilPatch: patch.daysUntilPatch,
      currentVersion: patch.currentVersion,
      environmentType: patch.environmentType,
    }));

    await sendPatchReminders(patchNotifications);
    console.log('Patch reminders sent successfully.');
  } catch (error) {
    console.error('Error in patch reminder check:', error);
  }
}
