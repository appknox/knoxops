import { db } from '../db/index.js';
import { onpremDeployments, users } from '../db/schema/index.js';
import { and, isNotNull, gte, lte, eq } from 'drizzle-orm';
import { sendPatchReminders } from './slack-notification.service.js';

interface UpcomingPatch {
  id: string;
  clientName: string;
  nextScheduledPatchDate: string;
  currentVersion: string | null;
  environmentType: string;
  daysUntilPatch: number;
  csmName: string | null;
}

/**
 * Get deployments with upcoming patch dates (within specified days)
 */
export async function getUpcomingPatches(daysAhead: number = 10): Promise<UpcomingPatch[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  // Look back 30 days for overdue patches
  const lookbackDate = new Date(today);
  lookbackDate.setDate(lookbackDate.getDate() - 30);

  try {
    const results = await db
      .select({
        id: onpremDeployments.id,
        clientName: onpremDeployments.clientName,
        nextScheduledPatchDate: onpremDeployments.nextScheduledPatchDate,
        currentVersion: onpremDeployments.currentVersion,
        environmentType: onpremDeployments.environmentType,
        csmFirstName: users.firstName,
        csmLastName: users.lastName,
      })
      .from(onpremDeployments)
      .leftJoin(users, eq(onpremDeployments.associatedCsmId, users.id))
      .where(
        and(
          eq(onpremDeployments.clientStatus, 'active'),
          isNotNull(onpremDeployments.nextScheduledPatchDate),
          gte(onpremDeployments.nextScheduledPatchDate, lookbackDate),
          lte(onpremDeployments.nextScheduledPatchDate, futureDate)
        )
      )
      .orderBy(onpremDeployments.nextScheduledPatchDate);

    return results.map((result) => {
      const patchDate = new Date(result.nextScheduledPatchDate!);
      const daysUntilPatch = Math.ceil(
        (patchDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      const csmName = result.csmFirstName && result.csmLastName
        ? `${result.csmFirstName} ${result.csmLastName}`
        : null;

      return {
        id: result.id,
        clientName: result.clientName,
        nextScheduledPatchDate: result.nextScheduledPatchDate!.toISOString(),
        currentVersion: result.currentVersion,
        environmentType: result.environmentType,
        daysUntilPatch,
        csmName,
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
    const allPatches = await getUpcomingPatches(10);

    if (allPatches.length === 0) {
      console.log('No upcoming patches in the next 10 days.');
      return;
    }

    // Split into overdue and upcoming
    const overduePatches = allPatches.filter(p => p.daysUntilPatch < 0);
    const upcomingPatches = allPatches.filter(p => p.daysUntilPatch >= 0);

    console.log(`Found ${allPatches.length} patch(es): ${overduePatches.length} overdue, ${upcomingPatches.length} upcoming. Sending notifications...`);

    // Format overdue patches for Slack notification
    if (overduePatches.length > 0) {
      const overdueNotifications = overduePatches.map((patch) => ({
        clientName: patch.clientName,
        nextPatchDate: new Date(patch.nextScheduledPatchDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        daysUntilPatch: patch.daysUntilPatch,
        currentVersion: patch.currentVersion,
        environmentType: patch.environmentType,
        csmName: patch.csmName,
      }));
      await sendPatchReminders(overdueNotifications, 'overdue');
    }

    // Format upcoming patches for Slack notification
    if (upcomingPatches.length > 0) {
      const upcomingNotifications = upcomingPatches.map((patch) => ({
        clientName: patch.clientName,
        nextPatchDate: new Date(patch.nextScheduledPatchDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        daysUntilPatch: patch.daysUntilPatch,
        currentVersion: patch.currentVersion,
        environmentType: patch.environmentType,
        csmName: patch.csmName,
      }));
      await sendPatchReminders(upcomingNotifications, 'upcoming');
    }

    console.log('Patch reminders sent successfully.');
  } catch (error) {
    console.error('Error in patch reminder check:', error);
  }
}

/**
 * Send patch reminder for a specific deployment
 */
export async function sendDeploymentPatchReminder(deploymentId: string): Promise<void> {
  try {
    const deployment = await db
      .select({
        id: onpremDeployments.id,
        clientName: onpremDeployments.clientName,
        nextScheduledPatchDate: onpremDeployments.nextScheduledPatchDate,
        currentVersion: onpremDeployments.currentVersion,
        environmentType: onpremDeployments.environmentType,
        clientStatus: onpremDeployments.clientStatus,
        csmFirstName: users.firstName,
        csmLastName: users.lastName,
      })
      .from(onpremDeployments)
      .leftJoin(users, eq(onpremDeployments.associatedCsmId, users.id))
      .where(and(
        eq(onpremDeployments.id, deploymentId),
        eq(onpremDeployments.clientStatus, 'active'),
        isNotNull(onpremDeployments.nextScheduledPatchDate)
      ))
      .limit(1);

    if (!deployment || deployment.length === 0) {
      throw new Error('Deployment not found, not active, or no scheduled patch date');
    }

    const patch = deployment[0];
    const patchDate = new Date(patch.nextScheduledPatchDate!);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilPatch = Math.ceil(
      (patchDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    const csmName = patch.csmFirstName && patch.csmLastName
      ? `${patch.csmFirstName} ${patch.csmLastName}`
      : null;

    const patchNotification = {
      clientName: patch.clientName,
      nextPatchDate: patchDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      daysUntilPatch,
      currentVersion: patch.currentVersion,
      environmentType: patch.environmentType,
      csmName,
    };

    // Determine notification type based on days
    const notificationType = daysUntilPatch < 0 ? 'overdue' : 'upcoming';
    await sendPatchReminders([patchNotification], notificationType);
    console.log(`Patch reminder sent for ${patch.clientName}`);
  } catch (error) {
    console.error(`Error sending patch reminder for deployment ${deploymentId}:`, error);
    throw error;
  }
}
