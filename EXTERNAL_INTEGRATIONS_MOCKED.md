# External Integrations - Mocking Summary

## ✅ Mocked (Tests Safe to Run)

### 1. Slack Webhooks
**Mocked in:** `tests/setup.ts` (lines 11-21)
**Impact:** NO real Slack messages will be sent

**Functions Mocked:**
- `sendSlackNotification()` - Device/OnPrem notifications
- `sendDeviceSlackNotification()` - Device-specific notifications
- `sendPatchReminders()` - Patch reminders to channels
- `sendSaleAnnouncement()` - Device sale announcements
- `getWebhook()`, `getDeviceWebhook()`, `getSaleWebhook()`

**Tests Protected:**
- Device request creation/approval/rejection/completion
- License request creation/upload/cancellation
- Patch reminder notifications
- Device check-in/check-out digests
- Device sale announcements

---

### 2. Email Service (Nodemailer)
**Mocked in:** `tests/setup.ts` (lines 23-30)
**Impact:** NO real emails will be sent to inboxes

**Functions Mocked:**
- `sendEmail()` - Generic email sender
- `sendInviteEmail()` - User invitation emails
- `sendPasswordResetEmail()` - Password reset emails
- `sendReleaseEmail()` - Release notification emails

**Tests Protected:**
- User invite creation/resend
- Password reset flows
- Release sharing with clients

---

### 3. AWS S3 File Storage
**Mocked in:** `tests/setup.ts` (lines 32-52)
**Impact:** NO files will be uploaded/downloaded from AWS S3

**Functions Mocked:**
- `savePrerequisiteFile()` - Returns mock S3 key
- `saveSslCertificateFile()` - Returns mock S3 key
- `saveDocumentFile()` - Returns mock S3 key
- `saveLicenseFile()` - Returns mock S3 key
- `getSignedUrl()` - Returns mocked signed URL
- `deleteFileFromS3()` - Mock deletion
- `fileExistsInS3()` - Always returns true
- `getS3FileStream()` - Returns mock buffer

**Tests Protected:**
- Prerequisite file uploads/downloads
- SSL certificate uploads/downloads
- Document uploads/downloads/deletion
- License file uploads/downloads
- Batch download as ZIP

---

## Running Tests Safely

All these mocks are automatically loaded via `vitest.config.ts` setupFiles configuration:

```bash
cd /Users/appknox/Documents/projects/knoxadmin-workplace/knoxadmin
npm test                    # Run all tests - NO external calls made
npm test -- devices.test.ts # Run specific test file
npm test -- --coverage      # Run with coverage report
```

**Important:** Tests will now:
- ✅ Pass without real Slack webhooks configured
- ✅ Pass without SMTP/email service running
- ✅ Pass without AWS S3 credentials
- ✅ Run faster (no network latency)
- ✅ Avoid polluting Slack channels, email inboxes, or S3 buckets

---

## Verification

To verify mocks are working:

```typescript
// Example: Check that Slack wasn't actually called
import { sendSlackNotification } from '../src/services/slack-notification.service.js';
import { vi } from 'vitest';

it('should not call Slack for device request', async () => {
  // Make API call
  const response = await app.inject({...});

  // Verify mock was called (if logic calls it)
  // expect(sendSlackNotification).toHaveBeenCalled();

  // Or verify it wasn't called
  // expect(sendSlackNotification).not.toHaveBeenCalled();
});
```

---

## Production Impact

**ZERO production impact** because:
- Mocks only apply to test environment
- Real code uses real services in production
- Environment: Test database + Mocked integrations
- Production: Real database + Real Slack/Email/S3

---

## What Tests Still Verify

Even with mocks, tests verify:
- ✅ API endpoint logic and business rules
- ✅ Database operations (real test DB)
- ✅ Authorization and RBAC
- ✅ Request/response formats
- ✅ Error handling
- ✅ State transitions
- ✅ Audit logging

Tests do NOT verify:
- ❌ Actual Slack message formatting (that's integration testing)
- ❌ Email delivery (that's integration testing)
- ❌ S3 actual file storage (that's integration testing)
- ❌ Network/API reliability (that's load testing)

These can be tested separately with integration tests against staging environment.

---

## Files Modified

1. **tests/setup.ts** - Added vi.mock() calls for 3 services
2. **vitest.config.ts** - No changes needed (already configured correctly)

## Date Added
2026-04-03
