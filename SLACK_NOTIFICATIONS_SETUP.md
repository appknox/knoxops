# Slack Notifications Setup Guide

This guide explains how to set up automated Slack notifications for upcoming on-prem patch schedules.

## 🎯 Features

- **Automated Daily Checks**: Runs every day at 9:00 AM
- **10-Day Window**: Notifies about patches scheduled in the next 10 days
- **Color-Coded Urgency**:
  - 🔴 Critical: ≤3 days remaining
  - 🟡 Soon: 4-7 days remaining
  - 🟢 Upcoming: 8-10 days remaining
- **Detailed Info**: Shows client name, environment, current version, and days remaining

## 📋 Setup Steps

### 1. Create Slack Incoming Webhook

1. Go to your Slack workspace
2. Visit: https://api.slack.com/messaging/webhooks
3. Click **"Create your Slack app"**
4. Choose **"From scratch"**
5. Name your app (e.g., "KnoxAdmin Notifications")
6. Select your workspace
7. Click **"Incoming Webhooks"** in the left sidebar
8. Toggle **"Activate Incoming Webhooks"** to ON
9. Click **"Add New Webhook to Workspace"**
10. Select the channel where notifications should be sent (e.g., `#ops-alerts`)
11. Click **"Allow"**
12. **Copy the Webhook URL** (starts with `https://hooks.slack.com/services/...`)

### 2. Configure Environment Variable

Add the webhook URL to your `.env` file:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### 3. Restart Server

```bash
npm run dev
```

You should see in the logs:
```
✓ Scheduled job registered: Daily patch reminders at 9:00 AM
```

## 🧪 Testing

### Option 1: Preview Upcoming Patches (No Notification)

```bash
curl -X GET http://localhost:3000/api/notifications/patch-reminders/preview \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "upcomingPatches": [
    {
      "clientName": "ABC Corp",
      "nextScheduledPatchDate": "2026-03-15T00:00:00.000Z",
      "daysUntilPatch": 5,
      "currentVersion": "1.2.3",
      "environmentType": "production"
    }
  ],
  "count": 1
}
```

### Option 2: Manually Trigger Notification (Admin Only)

```bash
curl -X POST http://localhost:3000/api/notifications/patch-reminders/trigger \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Response:
```json
{
  "message": "Patch reminder notifications triggered successfully",
  "upcomingPatchesCount": 3
}
```

## 📊 Example Slack Message

```
🔔 Upcoming Patch Schedule Reminders
3 clients require patch updates in the next 10 days:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Client: ABC Corp
Environment: production

Current Version: 1.2.3
Next Patch: 🟡 Mar 15, 2026 (5 days)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Client: XYZ Inc
Environment: poc

Current Version: 1.1.0
Next Patch: 🔴 Mar 12, 2026 (2 days)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Legend: 🔴 Critical (≤3 days) | 🟡 Soon (4-7 days) | 🟢 Upcoming (8-10 days)
```

## ⏰ Schedule Configuration

The default schedule is **9:00 AM daily**. To change this, edit `src/services/scheduler.service.ts`:

```typescript
// Current: Daily at 9 AM
cron.schedule('0 9 * * *', async () => { ... });

// Examples:
// Every day at 10 AM:
cron.schedule('0 10 * * *', async () => { ... });

// Every Monday at 9 AM:
cron.schedule('0 9 * * 1', async () => { ... });

// Twice daily (9 AM and 5 PM):
cron.schedule('0 9,17 * * *', async () => { ... });
```

**Cron Format:** `minute hour day month dayOfWeek`

## 🔧 Customization

### Change Notification Threshold

To change from 10 days to a different window, edit `src/services/patch-reminder.service.ts`:

```typescript
// Change this line:
const upcomingPatches = await getUpcomingPatches(10); // 10 days

// To:
const upcomingPatches = await getUpcomingPatches(7);  // 7 days
const upcomingPatches = await getUpcomingPatches(14); // 14 days
```

### Customize Urgency Colors

Edit the urgency thresholds in `src/services/slack-notification.service.ts`:

```typescript
// Current logic:
const urgencyEmoji = patch.daysUntilPatch <= 3 ? '🔴'
  : patch.daysUntilPatch <= 7 ? '🟡'
  : '🟢';

// Customize as needed:
const urgencyEmoji = patch.daysUntilPatch <= 2 ? '🔴'  // Critical: 2 days
  : patch.daysUntilPatch <= 5 ? '🟡'                    // Soon: 3-5 days
  : '🟢';                                                // Upcoming: 6-10 days
```

## 🛠 Troubleshooting

### Notifications Not Sending

1. **Check webhook URL**: Verify `SLACK_WEBHOOK_URL` is set correctly
2. **Test manually**: Use the trigger endpoint to test
3. **Check logs**: Look for errors in server console
4. **Verify permissions**: Ensure webhook has permission to post to channel

### Server Logs

You should see:
```
Initializing scheduled jobs...
✓ Scheduled job registered: Daily patch reminders at 9:00 AM
Running initial patch check (development mode)...
Checking for upcoming patch schedules...
Found 3 upcoming patch(es). Sending notifications...
Slack notification sent successfully
Patch reminders sent successfully.
```

### No Upcoming Patches

If you see "No upcoming patches in the next 10 days", ensure:
1. Deployments have `nextScheduledPatchDate` set
2. Dates are within the next 10 days
3. Dates are in the future (not past)

## 📝 API Endpoints

### GET /api/notifications/patch-reminders/preview

Preview upcoming patches without sending notification.

**Query Parameters:**
- `daysAhead` (number, default: 10): How many days ahead to check

**Requires:** `read:OnPrem` permission

### POST /api/notifications/patch-reminders/trigger

Manually trigger patch reminder notifications.

**Requires:** `manage:OnPrem` permission (admin only)

## 🔒 Security

- The trigger endpoint requires admin permissions
- Webhook URL should be kept secret (use environment variables)
- Never commit `.env` file to version control
- Consider IP whitelisting for webhook endpoint if needed

## 📚 Further Reading

- [Slack Incoming Webhooks Documentation](https://api.slack.com/messaging/webhooks)
- [Node-Cron Syntax](https://github.com/node-cron/node-cron#cron-syntax)
- [Slack Block Kit Builder](https://app.slack.com/block-kit-builder) (for customizing messages)
