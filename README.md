# KnoxOps — Admin Portal

Internal admin portal for managing on-premise deployments, device inventory, and licence key lifecycle.

- **Backend:** Fastify + Node.js (ESM) + Drizzle ORM + PostgreSQL
- **Frontend:** React + TypeScript + Vite + Zustand + Tailwind CSS
- **Auth:** JWT (access + refresh) + Google OIDC SSO
- **Notifications:** Slack Incoming Webhooks

> Full technical reference: [`docs/architecture.md`](docs/architecture.md)

---

## Modules

| Module | Route | Status |
|--------|-------|--------|
| Device Management | `/devices` | Live |
| On-Premise Client Management | `/onprem` | Live |
| Slack Notifications | `/onprem/notifications` | Live |
| GitHub Releases | `/onprem/releases` | Live |
| Settings & Users | `/settings` | Live |
| Dashboard | `/dashboard` | Planned |

---

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 16
- pnpm / npm

### Backend Setup

```bash
cd knoxadmin
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, SLACK_* vars
npm run db:migrate     # apply Drizzle migrations
npm run dev            # starts on http://localhost:3000
```

### Frontend Setup

```bash
cd knoxadmin-client
npm install
npm run dev            # starts on http://localhost:5173 (proxies /api → :3000)
```

### Database Migrations

```bash
# Generate a new migration after schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Push schema directly (dev only)
npm run db:push
```

### Bulk Device Import

Import scripts live in `scripts/`. Requires `ADMIN_USER_ID` env var (any admin user UUID from the `users` table).

```bash
ADMIN_USER_ID=<uuid> npx tsx scripts/import-all-devices.ts
```

Place xlsx files in the project root before running:
- `android-devices.xlsx`
- `ios-devices.xlsx`
- `cambinoix-devices.xlsx`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing access/refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL (default `7d`) |
| `SMTP_HOST/USER/PASS` | SMTP config for invite emails |
| `OIDC_CLIENT_ID/SECRET/ISSUER` | Google SSO credentials |
| `OIDC_CALLBACK_URL` | OAuth2 redirect URI |
| `SLACK_WEBHOOK_URL` | General Slack webhook |
| `SLACK_DEVICE_WEBHOOK_URL` | Device event notifications |
| `FRONTEND_URL` | Used for CORS and email links |
| `GITHUB_TOKEN` | GitHub PAT for release management |
| `GITHUB_OWNER` / `GITHUB_REPO` | Target repo for releases |

---

## User Roles

| Role | Devices | OnPrem | Users |
|------|---------|--------|-------|
| `admin` | Manage | Manage | Full |
| `onprem_admin` | — | Manage | — |
| `onprem_viewer` | — | Read | — |
| `full_editor` | Manage | — | — |
| `full_viewer` | Read | — | — |
| `devices_viewer` | Read (own only) | — | — |
