# Device Request Feature - Backend Implementation Summary

**Status:** Part 1 Complete

**Last Updated:** 2026-03-22

---

## Overview

Backend implementation for the Device Request feature, providing REST APIs for the full device request lifecycle: creation, approval/rejection, and completion with smart device suggestions and automatic side-effects.

---

## Database Schema

**File:** `src/db/schema/device-requests.ts`

```typescript
// Enum for status workflow
export const deviceRequestStatusEnum = pgEnum('device_request_status', [
  'pending',
  'approved',
  'rejected',
  'completed',
]);

// Main device_requests table
export const deviceRequests = pgTable('device_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  deviceType: varchar('device_type', { length: 50 }).notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  osVersion: varchar('os_version', { length: 50 }),
  purpose: varchar('purpose', { length: 255 }).notNull(),
  requestingFor: varchar('requesting_for', { length: 255 }), // Recipient name
  status: deviceRequestStatusEnum('status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  linkedDeviceId: uuid('linked_device_id'),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at'),
  rejectedBy: uuid('rejected_by'),
  rejectedAt: timestamp('rejected_at'),
  completedBy: uuid('completed_by'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Export inferred types
export type DeviceRequest = typeof deviceRequests.$inferSelect;
export type NewDeviceRequest = typeof deviceRequests.$inferInsert;
export type DeviceRequestStatus = typeof deviceRequestStatusEnum.enumValues;
```

**Indices:**
- `requestedBy` - for fast user request lookup
- `status` - for filtering by workflow state
- `createdAt` - for ordering recent requests

**Migration:** `drizzle/0012_device_requests_requesting_for.sql`
- Creates enum type
- Creates table with all columns
- Creates indices

---

## Service Layer

**File:** `src/modules/device-requests/device-requests.service.ts`

### Core Functions

#### 1. createRequest(input, userId)
```typescript
export async function createRequest(
  input: CreateDeviceRequestInput,
  userId: string
): Promise<DeviceRequest>
```
- Validates input schema
- Inserts new request with `status: 'pending'`
- Fetches requesting user for Slack notification
- Calls `sendDeviceRequestNotification()` with type='created'
- Returns full request object

#### 2. listRequests(userId, userRole)
```typescript
export async function listRequests(
  userId: string,
  userRole: 'admin' | 'write' | 'read'
): Promise<DeviceRequest[]>
```
- Admin/write: returns all requests sorted by createdAt DESC
- Read-only: returns only own requests (requestedBy = userId)
- Performs parallel user lookups:
  - Fetch all requestedBy users
  - Fetch all rejectedBy users
  - Fetch all approvedBy users
  - Fetch all completedBy users
- Maps user objects back to requests
- Returns fully populated requests

#### 3. getRequest(id, userId, userRole)
```typescript
export async function getRequest(
  id: string,
  userId: string,
  userRole: 'admin' | 'write' | 'read'
): Promise<DeviceRequest>
```
- Fetches single request by ID
- Throws ForbiddenError if read-only user viewing another's request
- Returns request with all user objects populated

#### 4. approveRequest(id, approverId)
```typescript
export async function approveRequest(
  id: string,
  approverId: string
): Promise<DeviceRequest>
```
- Validates request exists and status is 'pending'
- Updates: status→'approved', approvedBy, approvedAt
- Calls `sendDeviceRequestNotification()` with type='approved'
- Returns updated request
- Throws BadRequestError if not in pending state

#### 5. rejectRequest(id, rejecterId, reason)
```typescript
export async function rejectRequest(
  id: string,
  rejecterId: string,
  reason: string
): Promise<DeviceRequest>
```
- Validates request exists and status is pending or approved
- Updates: status→'rejected', rejectionReason, rejectedBy, rejectedAt
- Calls `sendDeviceRequestNotification()` with type='rejected'
- Returns updated request
- Throws BadRequestError if already rejected or completed

#### 6. completeRequest(id, completerId, linkedDeviceId?)
```typescript
export async function completeRequest(
  id: string,
  completerId: string,
  linkedDeviceId?: string
): Promise<{ request: DeviceRequest; changeLog?: AuditLog }>
```
- Validates request exists and status is 'approved'
- Wraps in database transaction
- Updates request: status→'completed', linkedDeviceId, completedBy, completedAt
- **Device Side-Effects** (if linkedDeviceId provided):
  - Fetches device by ID (throws if not found)
  - Fetches device current state for audit comparison
  - Updates device:
    - `status: 'inactive'`
    - `purpose: request.purpose`
    - `assignedTo: request.requestingFor || request.requester.name`
  - Creates audit log entry with:
    - `type: 'device_updated'`
    - `tableName: 'devices'`
    - `recordId: linkedDeviceId`
    - `before: { status, purpose, assignedTo }`
    - `after: { status, purpose, assignedTo }`
    - `changedBy: completerId`
- Calls `sendDeviceRequestNotification()` with type='completed'
- Returns request + changeLog
- Transaction rolls back if device update fails
- Throws BadRequestError if not approved or device not found

---

## Controller Layer

**File:** `src/modules/device-requests/device-requests.controller.ts`

Handlers for each endpoint:

1. **createHandler(request, reply)**
   - Extracts userId from request context
   - Validates body against Fastify schema
   - Calls service.createRequest()
   - Returns 201 with request

2. **listHandler(request, reply)**
   - Extracts userId + userRole from context
   - Calls service.listRequests()
   - Returns 200 with paginated results

3. **getByIdHandler(request, reply)**
   - Extracts userId + userRole from context
   - Validates id from params
   - Calls service.getRequest()
   - Returns 200 or 403

4. **approveHandler(request, reply)**
   - Extracts userId from context
   - Validates id from params
   - Calls service.approveRequest()
   - Returns 200 with updated request

5. **rejectHandler(request, reply)**
   - Extracts userId from context
   - Validates id + reason from params/body
   - Calls service.rejectRequest()
   - Returns 200 with updated request

6. **completeHandler(request, reply)**
   - Extracts userId from context
   - Validates id + linkedDeviceId from params/body
   - Calls service.completeRequest()
   - Returns 200 with { request, changeLog }

---

## Routes

**File:** `src/modules/device-requests/device-requests.routes.ts`

Registered at `/api/device-requests`:

### POST /
Create a new device request.

**Auth:** authenticate + authorize('read', 'Device')

**Body Schema:**
```json
{
  "deviceType": "mobile|tablet|charging_hub",
  "platform": "iOS|Android|Cambrionix",
  "osVersion": "string?",
  "purpose": "string",
  "requestingFor": "string?"
}
```

**Response:** 201
```json
{
  "id": "uuid",
  "requestedBy": "uuid",
  "deviceType": "mobile",
  "platform": "iOS",
  "purpose": "Testing",
  "status": "pending",
  "createdAt": "2026-03-22T10:00:00Z"
}
```

### GET /
List all or own device requests (paginated).

**Auth:** authenticate + authorize('read', 'Device')

**Query Params:**
```
page=1&limit=20
```

**Response:** 200
```json
{
  "data": [
    {
      "id": "uuid",
      "requestedBy": "uuid",
      "requestedByUser": { "id", "firstName", "lastName", "email" },
      "deviceType": "mobile",
      "platform": "iOS",
      "purpose": "Testing",
      "requestingFor": "Sarah Smith",
      "status": "pending",
      "createdAt": "2026-03-22T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

### GET /:id
Get single device request.

**Auth:** authenticate + authorize('read', 'Device')

**Response:** 200 or 403 (if read-only and not owner)

### PATCH /:id/approve
Approve a pending request.

**Auth:** authenticate + authorize('manage', 'Device')

**Response:** 200 with approved request

### PATCH /:id/reject
Reject a request (pending or approved).

**Auth:** authenticate + authorize('manage', 'Device')

**Body Schema:**
```json
{
  "reason": "string"
}
```

**Response:** 200 with rejected request

### PATCH /:id/complete
Complete an approved request and optionally link a device.

**Auth:** authenticate + authorize('manage', 'Device')

**Body Schema:**
```json
{
  "linkedDeviceId": "uuid?"
}
```

**Response:** 200 with completed request + device changes

---

## Device Suggestion Service

**File:** `src/modules/devices/devices.service.ts` (Extended)

### suggestDevices(platform, osVersion?)
```typescript
export async function suggestDevices(
  platform: string,
  osVersion?: string
): Promise<SuggestedDevice[]>
```

**Logic:**
1. Query active devices filtering by platform
2. If osVersion provided:
   - Calculate numeric distance from each device's osVersion to requested version
   - Sort by distance (exact matches first), then by device name
3. Return max 50 devices with: id, name, model, platform, osVersion, status

**Query Example:**
```sql
SELECT id, name, model, platform, os_version, status
FROM devices
WHERE platform = $1
  AND status = 'active'
  AND is_deleted = false
ORDER BY ABS((os_version::float - $2::float)), name
LIMIT 50
```

**Used by:** CompleteRequestModal on frontend to suggest compatible devices

---

## Slack Notifications

**File:** `src/services/slack-notification.service.ts` (Extended)

### sendDeviceRequestNotification()

Sends formatted Block Kit messages to SLACK_DEVICE_WEBHOOK_URL:

#### Type: 'created'
```
📋 New Device Request [Request ID: xyz123]
Requested by: John Doe
Requesting for: Sarah Smith (if different)
Device: iOS Mobile · Android 13
Purpose: Testing
```

#### Type: 'approved'
```
✅ Device Request Approved [Request ID: xyz123]
Requested by: John Doe
Approved by: Admin User
Device: iOS Mobile · Android 13
Purpose: Testing
```

#### Type: 'rejected'
```
❌ Device Request Rejected [Request ID: xyz123]
Requested by: John Doe
Rejected by: Admin User
Device: iOS Mobile · Android 13
Purpose: Testing
Reason: Device not in budget allocation
```

#### Type: 'completed'
```
📦 Device Request Completed [Request ID: xyz123]
Requested by: John Doe
Completed by: Admin User
Device allocated: A003 - Pixel 7a
Purpose: Testing
```

**Features:**
- All notifications include Request ID in bold
- Purpose field included in all notifications
- Requesting For shown only if different from requester
- Device info (type, platform, OS) included in all notifications
- Rejection reason prominently displayed
- Device name/model shown for completions

---

## Integration Points

**File:** `src/app.ts`

Device requests routes registered at `POST|GET /api/device-requests`:
```typescript
await app.register(deviceRequestRoutes, { prefix: '/api/device-requests' });
```

Routes automatically mounted:
- POST / → create
- GET / → list
- GET /:id → getById
- PATCH /:id/approve → approve
- PATCH /:id/reject → reject
- PATCH /:id/complete → complete

---

## Error Handling

### HTTP Status Codes

- **201:** Created (POST request)
- **200:** Success (GET, PATCH)
- **400:** Bad Request (invalid status transition, missing device)
- **401:** Unauthorized (not authenticated)
- **403:** Forbidden (insufficient permissions, read-only user viewing another's request)
- **404:** Not Found (request not found)
- **500:** Server Error

### Thrown Errors

```typescript
// Invalid status transition
throw new BadRequestError(
  `Cannot approve request with status: ${request.status}. Must be pending.`
);

// Device not found during completion
throw new BadRequestError(
  `Device not found: ${linkedDeviceId}`
);

// Permission denied
throw new ForbiddenError(
  'Only request owner or admin can view this request'
);
```

---

## Validation

### Input Validation

**CreateDeviceRequestInput:**
- `deviceType`: Required, enum (mobile | tablet | charging_hub)
- `platform`: Required, string
- `osVersion`: Optional, string
- `purpose`: Required, string
- `requestingFor`: Optional, max 255 chars

### Status Transitions

```
pending → approved ✓
pending → rejected ✓
approved → rejected ✓
approved → completed ✓
rejected → (terminal) ✗
completed → (terminal) ✗
```

### Permission Checks

- **Create:** User must have read Device permission
- **List:** User must have read Device permission (filtered by role)
- **Get:** User must have read Device permission (403 if read-only and not owner)
- **Approve/Reject/Complete:** User must have manage Device permission

---

## Performance Considerations

### Database Queries

- **createRequest:** 1 insert + 1 select (user)
- **listRequests:** 1 query + parallel user lookups (4 separate queries if needed)
- **approveRequest:** 1 update + 1 select
- **completeRequest:** Transaction with:
  - 1 select (request)
  - 1 select (device)
  - 1 update (request)
  - 1 update (device)
  - 1 insert (audit log)

### Optimization

- Parallel user fetching in listRequests avoids N+1 queries
- Transactions prevent partial updates
- Indices on requestedBy and status enable fast filtering

---

## Testing

### Manual Testing

1. Create request → verify Slack notification sent
2. Create request with requestingFor → verify shown in Slack
3. Approve request → verify status + timestamps updated
4. Reject request → verify reason stored
5. Complete request with device → verify device status/purpose/assignedTo updated
6. Test permission scenarios:
   - Read-only user cannot approve/reject/complete
   - Read-only user cannot view other's requests
7. Test status transitions:
   - Cannot approve non-pending request
   - Cannot reject completed request

### Automated Testing

- Unit tests for service functions (status transitions, permissions)
- Integration tests for full workflow
- Database tests for audit logging

---

## Files Summary

| File | Status | Changes |
|------|--------|---------|
| `src/db/schema/device-requests.ts` | NEW | Schema with enum + table |
| `drizzle/0012_device_requests_requesting_for.sql` | NEW | Migration |
| `src/db/schema/index.ts` | MODIFIED | Export device-requests types |
| `src/modules/device-requests/device-requests.service.ts` | NEW | 6 service functions |
| `src/modules/device-requests/device-requests.controller.ts` | NEW | 6 controller handlers |
| `src/modules/device-requests/device-requests.routes.ts` | NEW | 6 routes + schemas |
| `src/modules/devices/devices.service.ts` | MODIFIED | Added suggestDevices() |
| `src/modules/devices/devices.controller.ts` | MODIFIED | Added suggest handler |
| `src/modules/devices/devices.routes.ts` | MODIFIED | Added GET /suggest route |
| `src/app.ts` | MODIFIED | Registered device-requests |
| `src/services/slack-notification.service.ts` | MODIFIED | Device request notifications |

---

## Deployment Checklist

- [ ] Run database migration: `npm run db:migrate`
- [ ] Verify SLACK_DEVICE_WEBHOOK_URL environment variable set
- [ ] Test API endpoints manually with curl/Postman
- [ ] Verify Slack notifications being sent
- [ ] Check audit logs created for device changes
- [ ] Test permission scenarios with different user roles
- [ ] Monitor error logs for any issues

---

## Known Issues & Fixes

### Issue 1: Incomplete Fastify Schema
**Root Cause:** Response schema didn't document all returned fields
**Fix:** Added complete field documentation including all user objects
**Status:** ✅ FIXED

### Issue 2: Unknown User Names
**Root Cause:** Service only joined one user table, missing rejectedBy/approvedBy/completedBy
**Fix:** Added parallel user fetching for all user ID columns
**Status:** ✅ FIXED

---

## Future Enhancements

1. Add request approval workflows (e.g., budget approval before device ordering)
2. Add device quantity limits per user/department
3. Add request expiration (e.g., request expires after 30 days pending)
4. Add bulk request operations
5. Add request analytics dashboard

