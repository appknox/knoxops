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

### Running with Docker (recommended)

The full stack (backend + frontend + postgres) runs via Docker Compose:

```bash
cp .env.example .env   # fill in required vars
docker-compose up
```

Services:
| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:3000 |
| API Docs (Swagger) | http://localhost:3000/docs |
| PostgreSQL | localhost:5432 |

On first run, seed the default admin user:

```bash
docker-compose exec knoxops npx tsx src/db/seed.ts
```

### Local Development

#### Backend

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, SLACK_* vars
npm run db:migrate     # apply Drizzle migrations
npm run dev            # starts on http://localhost:3000
```

#### Frontend

```bash
cd ../knoxops-client
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

## Device Detection (USB)

KnoxOps supports automatic device info detection when registering devices. The approach differs by platform:

### Android — WebUSB (browser-native, no agent needed)

Android detection runs entirely in the browser using the [WebUSB API](https://developer.mozilla.org/en-US/docs/Web/API/USB). No backend or local agent required.

**Requirements:**
- Chrome or Edge browser (Firefox/Safari do not support WebUSB)
- Page served over HTTPS or `localhost`
- USB Debugging enabled on the Android device

**How it works:**
1. Browser prompts to select the USB device via native Chrome dialog
2. ADB handshake happens in the browser (device shows "Allow USB Debugging?" prompt)
3. Browser runs `getprop` via ADB shell and parses device info
4. Form fields are pre-filled — no data touches the backend

> **Note:** If you see a "Unable to claim interface" error, your local ADB daemon is holding the USB connection. Run `adb kill-server` and try again.

---

### iOS — Local Agent

iOS detection requires the **KnoxOps Agent** running on the same machine as the browser. This is because WebUSB does not support iOS devices (Apple restricts USB access).

#### Starting the agent

```bash
# Install libimobiledevice (macOS)
brew install libimobiledevice

# Start the agent
cd agent
npm install
npm start
# Agent runs on http://localhost:17392
```

The wizard automatically detects whether the agent is running and shows setup instructions if it's offline.

**How it works:**
1. Browser calls `http://localhost:17392` (the local agent)
2. Agent runs `idevice_id`, `idevicepair`, `ideviceinfo` via libimobiledevice
3. Device info is returned to the browser and pre-fills the form

**Agent endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Check if agent is running |
| `POST /detect` | Find connected iOS device |
| `POST /pair` | Trust/pair the device |
| `POST /fetch` | Fetch full device info |

---

### Architecture summary

```
Browser (lab machine)
  ├── Android  →  WebUSB (direct USB, no network)
  └── iOS      →  localhost:17392 (local agent) → USB → iPhone

Cloud K8s
  ├── knoxops backend  (:3000)   — stores device data
  └── knoxops-client   (:80)     — serves the frontend
```

---

## CI/CD

Docker images are published to GHCR and Quay on every GitHub release.

| Image | Registry |
|-------|----------|
| `knoxops` | `ghcr.io/appknox/knoxops` / `quay.io/appknox/knoxops` |
| `knoxops-client` | `ghcr.io/appknox/knoxops-client` / `quay.io/appknox/knoxops-client` |

**Required GitHub secrets:**
- `QUAY_GITHUB_ACTION_PUSH_USERNAME`
- `QUAY_GITHUB_ACTION_PUSH_PASSWORD`
- `SLACK_WEBHOOK_URL`

A manual trigger workflow (`manual_ghcr.yaml`) is also available in GitHub Actions for publishing without a release.

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
