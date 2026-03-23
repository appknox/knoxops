# KnoxOps — Architecture & Technical Reference

> Version 1.0 — March 2026

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Database Schema](#3-database-schema)
4. [Role-Based Access Control](#4-role-based-access-control)
5. [Device Management Module](#5-device-management-module)
6. [On-Premise Client Management](#6-on-premise-client-management)
7. [Slack Notification System](#7-slack-notification-system)
8. [API Reference](#8-api-reference)
9. [Dashboard (Planned)](#9-dashboard-planned)
10. [Known Issues & Decisions](#10-known-issues--decisions)

---

## 1. System Architecture

KnoxOps is an internal admin portal for managing on-premise deployments, device inventory, and licence key lifecycle. It provides role-based access for admins, CSMs, and viewers with full audit logging and Slack integration.

### 1.1 High-Level Architecture

```
Frontend — React + TypeScript (Vite)
┌─────────────────────────────────────────────┐
│  Pages / Components                          │
│  Zustand Stores                              │
│  Axios API Client                            │
└──────────────────┬──────────────────────────┘
                   │ REST /api/*
┌──────────────────▼──────────────────────────┐
│  Backend — Fastify + Node.js (ESM)           │
│  Route Handlers                              │
│  Auth Middleware (JWT + CASL)                │
│  Business Services                           │
└──────┬────────────────────────┬─────────────┘
       │                        │ async .catch
┌──────▼──────┐        ┌────────▼────────┐
│  Data Layer  │        │ External Services│
│  Drizzle ORM │        │ Slack Webhooks  │
│  PostgreSQL  │        │ GitHub API      │
│  File System │        └─────────────────┘
└─────────────┘
```

### 1.2 Request Lifecycle

1. Browser sends HTTP request → Vite dev server proxies `/api/*` to Fastify
2. `authenticate()` middleware validates JWT → 401 if invalid
3. `authorize()` middleware checks CASL permissions → 403 if denied
4. Route handler calls service layer
5. Service executes Drizzle SQL query against PostgreSQL
6. Response serialized by `fast-json-stringify` and returned
7. Slack notification fired async (`.catch()` — never blocks response)

---

## 2. Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI component library |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool + `/api` proxy |
| React Router | 6.x | Client-side routing |
| Zustand | 4.x | Global state management |
| Axios | 1.x | HTTP client with JWT interceptors |
| React Hook Form + Zod | — | Form management + schema validation |
| Tailwind CSS | 3.x | Utility-first styling (primary: `#E5493A`) |
| Lucide React | — | Icons |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js (ESM) | 22.x | Runtime — ES modules throughout |
| Fastify | 4.x | HTTP framework with JSON schema validation |
| `@fastify/multipart` | 9.x | File uploads (50MB limit) |
| `@fastify/jwt` | — | JWT auth tokens |
| Drizzle ORM | 0.30.x | Type-safe SQL with PostgreSQL dialect |
| Drizzle Kit | — | Migration generation |
| CASL | — | Role-based authorization |
| `jsonwebtoken` | — | Signed download tokens (10-day expiry) |

---

## 3. Database Schema

### 3.1 Core Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `users` | `id`, `email`, `role`, `status`, `password_hash` | Roles: `admin`, `onprem_admin`, `onprem_viewer`, `full_editor`, `full_viewer`, `devices_viewer` |
| `devices` | `id`, `name`, `serial_number`, `type`, `status`, `manufacturer`, `model`, `purpose`, `assigned_to`, `metadata` (jsonb) | `metadata` stores platform, colour, imei, cpuArch, udid, etc. |
| `device_requests` | `id`, `request_no`, `device_type`, `platform`, `purpose`, `status`, `linked_device_id` | Status: `pending → approved → completed / rejected` |
| `onprem_deployments` | `id`, `client_name`, `client_status`, `current_version`, `license` (jsonb), `infrastructure` (jsonb), `associated_csm_id` | `license` and `infrastructure` are JSONB |
| `onprem_license_requests` | `id`, `request_no`, `deployment_id`, `status`, `request_type`, `target_version`, `fingerprint` | Sequence starts at 1000 |
| `entity_comments` | `id`, `entity_type`, `entity_id`, `text`, `created_by` | Shared comment table for devices + onprem |
| `audit_logs` | `id`, `user_id`, `module`, `action`, `entity_type`, `entity_id`, `changes` | Full audit trail |

### 3.2 JSONB Columns

**`onprem_deployments.license`**
```json
{
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-12-31T00:00:00.000Z",
  "numberOfApps": 10,
  "userFullName": "John Doe",
  "email": "john@client.com",
  "pricingPlan": "per app"
}
```

**`onprem_deployments.infrastructure`**
```json
{
  "fingerprint": "93453453454353453000009",
  "hypervisor": "VMware vSphere",
  "serverCores": 16,
  "serverRam": "64GB",
  "networkType": "dedicated"
}
```

**`devices.metadata`**
```json
{
  "platform": "iOS",
  "colour": "Space Gray",
  "cpuArch": "ARM64",
  "osVersion": "17.2",
  "udid": "abc123...",
  "modelNumber": "A2896",
  "imei": "123456789012345",
  "imei2": "987654321098765",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "rom": "256GB",
  "adapterSerial": "EC043Y9316-GST220A12",
  "powerCordSerial": "QIA0T0N6-QT3"
}
```

**JSONB Merge Pattern** — when updating a single field inside a JSONB column, always merge rather than overwrite:
```ts
sql`coalesce(${col}, '{}'::jsonb) || ${'{"fingerprint":"..."}'}::jsonb`
```

### 3.3 Migrations History

| Migration | Description |
|-----------|-------------|
| `0001–0011` | Core tables: users, devices, onprem_deployments, audit_logs, comments, documents |
| `0012` | Creates `device_requests` table; adds `requesting_for` column |
| `0013` | Creates `onprem_license_requests` (sequence starts at 1000) |
| `0014` | Adds `license_request_type` enum; `request_type` + `target_version` columns |
| `0015` | Adds `fingerprint VARCHAR(500)` to `onprem_license_requests` |
| `0016` | Adds `sold`, `for_sale` to `device_status` enum |
| `0017` | Adds `not_verified` to `device_status` enum |

---

## 4. Role-Based Access Control

### 4.1 Roles

| Role | Devices | OnPrem | User Management |
|------|---------|--------|-----------------|
| `admin` | Manage | Manage | Full |
| `onprem_admin` | None | Manage | None |
| `onprem_viewer` | None | Read | None |
| `full_editor` | Manage | None | None |
| `full_viewer` | Read | None | None |
| `devices_viewer` | Read (own only) | None | None |

### 4.2 Authorization Flow

```
Request → authenticate() (JWT) → 401 if invalid
        → authorize() (CASL)  → 403 if no permission
        → Route Handler
        → ownership check (if read-only role) → 403 if not owner
        → Service Layer → Database
```

### 4.3 Permission Matrix

| Action | Resource | Required Permission |
|--------|----------|---------------------|
| View devices / requests | Device | `read:Device` |
| Register device / approve request | Device | `manage:Device` |
| View deployments / licence requests | OnPrem | `read:OnPrem` |
| Create / upload / cancel licence request | OnPrem | `manage:OnPrem` |
| Trigger Slack notifications | OnPrem | `manage:OnPrem` |
| Manage users & invites | — | `admin` role only |

---

## 5. Device Management Module

### 5.1 Device Naming Convention

Devices get an auto-generated name based on platform prefix + sequential counter:

| Platform | Prefix | Example |
|----------|--------|---------|
| Android | A | A001, A002 … |
| iOS | B | B001, B002 … |
| Cambrionix (Charging Hub) | C | C001, C002 … |
| Other | D | D001, D002 … |

### 5.2 Device Types & Statuses

**Types:** `server`, `workstation`, `mobile`, `tablet`, `iot`, `network`, `charging_hub`, `other`

**Statuses:** `active` (In Inventory), `inactive` (Checked Out), `maintenance` (Out for Repair), `decommissioned` (Removed), `for_sale`, `sold`, `not_verified`

### 5.3 Device Request Workflow

```
User submits → pending
                ├─ Admin approves → approved
                │     └─ Admin links device → completed
                │          (device: status=inactive, purpose+assignedTo updated atomically)
                └─ Admin rejects → rejected
```

**Device Suggestion API**
```
GET /api/devices/suggest?platform=iOS&osVersion=13
```
Returns up to 50 active devices. If `osVersion` provided, sorted by numeric distance (exact match first).

---

## 6. On-Premise Client Management

### 6.1 Deployment Fields

| Field | Type | Notes |
|-------|------|-------|
| `clientName` | varchar | Display name |
| `clientStatus` | enum | `active / inactive / cancelled` |
| `currentVersion` | varchar | Updated on licence completion |
| `environmentType` | enum | `production / staging / development` |
| `license` | jsonb | startDate, endDate, numberOfApps, pricingPlan |
| `infrastructure` | jsonb | fingerprint, hypervisor, serverCores, serverRam, networkType |
| `associatedCsmId` | uuid FK | Included in patch reminders |
| `nextScheduledPatchDate` | date | Drives patch reminder scheduler |

### 6.2 Licence Request Workflow

```
User submits → pending
                └─ Admin uploads licence file → completed
                     (updates deployment.currentVersion, license, infrastructure.fingerprint)
                ├─ User/Admin cancels → cancelled
```

**One Active Request Rule:** Only one `pending` request per deployment. Returns `400` with existing request number if violated.

### 6.3 Licence File Download

Uses signed JWT tokens (10-day expiry):

1. Frontend calls `POST /onprem/license-requests/:id/generate-token` → `{ token, expiresAt }`
2. Frontend opens `GET /onprem/license-requests/:id/download?token=...` in new tab
3. Backend verifies JWT, streams file from `uploads/license-files/{deploymentId}/{requestId}/`

---

## 7. Slack Notification System

### 7.1 Webhooks

| Env Var | Used For |
|---------|----------|
| `SLACK_DEVICE_WEBHOOK_URL` | Device request create / approve / reject / complete |
| `SLACK_ONPREM_WEBHOOK_URL` | Licence request events; patch reminders; device check-in/out digests |

### 7.2 Notification Types

| Trigger | Emoji | Key Fields |
|---------|-------|------------|
| Device request created | 📋 | Request #, Platform, Type, Purpose, Requesting for |
| Device request approved | ✅ | Request #, Approved by, Device info |
| Device request rejected | ❌ | Request #, Rejected by, Reason |
| Device request completed | 📦 | Request #, Device allocated, Completed by |
| Licence request created | 📋 | Request #, Type, Client, License period |
| Licence file uploaded | ✅ | Request #, Client, File name, Valid period |
| Licence request cancelled | ❌ | Request #, Client, Cancelled by, Reason |
| Patch reminder (upcoming) | 🔔 | Client, Days until patch, Current version, CSM |
| Patch reminder (overdue) | ⚠️ | Client, Days overdue, Current version, CSM |
| Device check-in digest | 📱 | Devices checked in today |
| Device check-out digest | 📤 | Devices checked out today |

### 7.3 Fire-and-Forget Pattern

All Slack calls use `.catch()` — never `await`. A Slack failure must never block or roll back a DB transaction.

```ts
// Correct
sendSlackNotification(payload).catch(console.error);

// Wrong — blocks response and can roll back DB commit
await sendSlackNotification(payload);
```

### 7.4 Scheduled Notifications

| Schedule | Notification | Trigger Condition |
|----------|-------------|-------------------|
| Daily 9:00 AM | Patch reminders | `nextScheduledPatchDate` within 10 days or overdue ≤ 30 days |
| Daily (configurable) | Device check-in digest | Devices registered that date |
| Daily (configurable) | Device check-out digest | Devices checked out that date |

Manual triggers available via the Notifications tab (with client selection for patch reminders).

---

## 8. API Reference

### 8.1 Authentication

All endpoints except `POST /auth/login` require `Authorization: Bearer <token>`. Tokens are refreshed automatically by the Axios interceptor using the refresh token in an `httpOnly` cookie.

### 8.2 Device Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/devices` | `read:Device` | List devices with filters |
| POST | `/devices` | `manage:Device` | Register new device (auto-generates name) |
| GET | `/devices/stats` | `read:Device` | Inventory statistics |
| GET | `/devices/suggest` | `read:Device` | Suggest devices by platform/OS |
| GET | `/devices/distinct-os-versions` | `read:Device` | Available OS versions per platform |
| PATCH | `/devices/:id` | `manage:Device` | Update device fields |
| DELETE | `/devices/:id` | `manage:Device` | Soft delete |
| POST | `/device-requests` | `read:Device` | Submit device request |
| PATCH | `/device-requests/:id/approve` | `manage:Device` | Approve request |
| PATCH | `/device-requests/:id/reject` | `manage:Device` | Reject with reason |
| PATCH | `/device-requests/:id/complete` | `manage:Device` | Complete + link device |

### 8.3 On-Premise Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/onprem/deployments` | `read:OnPrem` | List all deployments |
| POST | `/onprem/deployments` | `manage:OnPrem` | Create deployment |
| GET | `/onprem/deployments/:id` | `read:OnPrem` | Get deployment detail |
| PATCH | `/onprem/deployments/:id` | `manage:OnPrem` | Update deployment |
| GET | `/onprem/licence-requests/all` | `read:OnPrem` | All requests across clients |
| POST | `/onprem/:id/license-requests` | `read:OnPrem` | Submit licence request |
| POST | `/onprem/:id/license-requests/:rid/upload` | `manage:OnPrem` | Upload licence file (multipart) |
| POST | `/onprem/:id/license-requests/:rid/cancel` | `manage:OnPrem` | Cancel pending request |
| POST | `/onprem/license-requests/:id/generate-token` | `read:OnPrem` | Generate 10-day download token |
| GET | `/onprem/license-requests/:id/download` | token-based | Download licence file |

### 8.4 Notification Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications/patch-reminders/preview` | Preview upcoming patches (no Slack sent) |
| POST | `/notifications/patch-reminders/trigger` | Send patch reminders (accepts `deploymentIds[]`) |
| GET | `/notifications/device-checkin/preview` | Preview today's check-ins |
| POST | `/notifications/device-checkin/trigger` | Send check-in digest |
| GET | `/notifications/device-checkout/preview` | Preview today's check-outs |
| POST | `/notifications/device-checkout/trigger` | Send check-out digest |

### 8.5 Fastify Serialization Note

All response schemas **must** include `additionalProperties: true` or explicitly list every returned field. Without this, `fast-json-stringify` silently strips unlisted fields, returning empty objects or missing data.

---

## 9. Dashboard (Planned)

Default landing page aggregating data from all modules without new backend routes.

### Component Structure

```
DashboardPage
├── Stats Grid (2 cols)
│   ├── OnpremDeploymentsCard  — donut: active/inactive/cancelled
│   └── DeviceInventoryCard    — donut: in-use/available
└── Activity + Sidebar Grid (3 cols)
    ├── RecentActivityFeed     — last 5 audit log entries
    └── Sidebar
        ├── QuickActionsCard   — role-gated nav links
        └── UpcomingPatchesCard — next 10-day patch preview
```

### Data Sources

| Card | Endpoint | Role Gate |
|------|----------|-----------|
| OnPrem donut | `GET /onprem/deployments` | `onprem_admin`, `onprem_viewer`, `admin` |
| Device donut | `GET /devices/stats` | `full_editor`, `full_viewer`, `admin` |
| Recent Activity | `GET /audit-logs?limit=5` | `admin` only |
| Upcoming Patches | `GET /notifications/patch-reminders/preview` | onprem roles + `admin` |

All 4 fetches run in parallel via `Promise.allSettled()` — a single API failure only affects its own card.

---

## 10. Known Issues & Decisions

### 10.1 Resolved Issues

| Issue | Root Cause | Fix |
|-------|------------|-----|
| Blank data in requests tab | Fastify response schema without `additionalProperties: true` — `fast-json-stringify` strips unlisted fields | Added `additionalProperties: true` to all response schemas |
| File upload 413 error | Fastify global `bodyLimit: 1MB` fires before `@fastify/multipart` | Set `bodyLimit: 50 * 1024 * 1024` on Fastify instance |
| Upload succeeds but returns error | `sendSlackNotification()` re-throws on failure, rolling back DB commit | Changed all Slack calls to `.catch()` fire-and-forget |
| Download → "site can't be reached" | `require('fs')` used in ESM module — crashes Node process | Replaced with `import { createReadStream } from 'fs'` |
| Non-admin users see 0 licence requests | `listAllLicenseRequests` filtered non-admins to own requests only | Removed filter |
| JSONB fingerprint update fails (42P18) | PostgreSQL cannot infer type of `$1` in `jsonb_build_object` | Use `JSON.stringify() + ::jsonb` cast |
| Clients tab always selected | `useMatch('/onprem/:id')` matches all single-segment paths including tab names | Added `knownSlugs` exclusion set |
| Select-all fires on single row click in notifications | `ref.current.indeterminate = true` triggers React synthetic `onChange` | Removed `useRef`; checkbox is fully controlled |

### 10.2 Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Drizzle ORM over Prisma | Lighter weight, closer to raw SQL, better TypeScript inference for complex queries |
| Zustand over Redux | Minimal boilerplate; sufficient for this scale; no context provider needed |
| JWT download tokens (not auth tokens) | Allows shareable download links without exposing user credentials; 10-day expiry |
| JSONB for infrastructure + license | Fields vary per client; avoids sparse columns; `||` operator enables safe partial updates |
| No chart library for dashboard donuts | Pure CSS `conic-gradient` is sufficient; saves bundle weight |
| Fire-and-forget Slack notifications | Slack is non-critical; must never block or roll back a user-facing DB transaction |
| `not_verified` device status | Separate from `active` — means device exists but hasn't been validated/confirmed yet |
| Charging hub metadata (adapterSerial, powerCordSerial) | Stored as `{serial}-{modelNumber}` in JSONB metadata; hub serial stored separately as main `serial_number` |
