# Yash Motors — Workshop Operations Platform

Enterprise-grade workshop management system for Tata-authorised dealership operations. Covers the full vehicle lifecycle from customer arrival through delivery, with role-based access for advisors, technicians, and management.

---

## Architecture

```
pnpm workspace
├── artifacts/mobile        — Expo React Native app (Android + iOS)
├── artifacts/backend       — REST API server (Express + PostgreSQL)
├── artifacts/api-server    — WhatsApp automation server (Baileys)
├── lib/api-client-react    — Generated React Query API client (Orval)
├── lib/api-spec            — OpenAPI specification
└── lib/api-zod             — Generated Zod schemas
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 54, React Native 0.81.5, expo-router v6 |
| State | Zustand, TanStack Query v5 |
| UI | Plus Jakarta Sans, expo-blur, react-native-reanimated 4 |
| Backend | Node.js 22, Express, TypeScript (ESM) |
| Database | PostgreSQL + Drizzle ORM |
| Queue | Redis + BullMQ |
| Storage | AWS S3 (presigned direct upload) |
| Auth | JWT + PIN-based (4-digit) |
| WhatsApp | Baileys (WA Web API) |
| Build | EAS (Expo Application Services) |
| Package Manager | pnpm workspaces |

---

## Roles

| Role | Access |
|---|---|
| `superadmin` | Full access — all cases, all screens, management dashboard |
| `admin` | Full access — all cases, all screens, management dashboard |
| `advisor` | Own cases only — intake, photos, WhatsApp workflow |
| `technician` | All open cases — view timeline, upload repair photos |

---

## Features

- **Vehicle Intake** — OCR-assisted number plate scan, customer details, GPS-tagged photos
- **Case Timeline** — Immutable audit log of all events (status changes, photos, messages)
- **Photo Management** — Direct S3 upload via presigned URLs, batch upload, bulk download/share, primary photo selection
- **WhatsApp Workflow** — Native deeplink group creation with pre-saved contacts, auto-formatted intake message
- **Push Notifications** — Real-time case updates via Expo notifications
- **Management Dashboard** — Case volume charts, technician activity, department breakdown (admin only)
- **Role-Based Navigation** — Tab bar and screens adapt per user role

---

## Project Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+
- Redis 7+
- AWS account (S3 bucket in `ap-south-1`)
- Expo account + EAS CLI

### Install

```bash
pnpm install
```

### Backend Environment

Create `artifacts/backend/.env`:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/yashmotors
JWT_SECRET=your-secret-min-16-chars
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET=your-bucket-name
S3_REGION=ap-south-1
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Mobile Environment

Create `artifacts/mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3001
```

---

## Database

```bash
# Run migrations
cd artifacts/backend && pnpm run db:migrate

# Seed departments + users (default PIN: 1234)
pnpm run db:seed

# Full reset + re-seed (testing only — destroys all data)
pnpm run db:reset-and-seed
```

---

## Development

```bash
# Backend (hot reload)
cd artifacts/backend && pnpm run dev

# WhatsApp server
cd artifacts/api-server && pnpm run dev

# Mobile (Expo dev server)
cd artifacts/mobile && pnpm run dev
```

---

## Building the App

Builds are handled by EAS on Expo's cloud infrastructure.

```bash
cd artifacts/mobile

# Internal APK (sideload / WhatsApp distribution)
eas build --profile apk --platform android

# Production AAB (Play Store)
eas build --profile production --platform android

# Development build (expo-dev-client)
eas build --profile development --platform android
```

Build profiles are defined in `artifacts/mobile/eas.json`.

Download built APKs from [expo.dev](https://expo.dev) → your project → Builds.

---

## Deployment (Server)

The backend and WhatsApp server run on a VPS (Ubuntu). Standard deployment:

```bash
# Pull latest
git pull

# Install deps
pnpm install

# Run pending migrations
cd artifacts/backend && pnpm run db:migrate

# Restart services
pm2 restart backend
pm2 restart api-server
```

Backend runs on port `3001`. Domain: `yashmotorsbackend.mooo.com`.

---

## EAS Releases on GitHub

EAS doesn't push directly to GitHub Releases. Two options:

### Option A — Manual (current)

1. Build on EAS: `eas build --profile apk --platform android`
2. Download APK from [expo.dev](https://expo.dev)
3. GitHub → Releases → Draft new release → upload APK → set tag (`v1.0.1`) → publish

### Option B — GitHub Actions (automated)

Add `.github/workflows/release.yml`:

```yaml
name: EAS Build + GitHub Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install

      - uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build APK
        run: |
          cd artifacts/mobile
          eas build --profile apk --platform android --non-interactive --json > build.json
          echo "BUILD_URL=$(cat build.json | jq -r '.[0].artifacts.buildUrl')" >> $GITHUB_ENV

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: |
            ## Yash Motors ${{ github.ref_name }}

            **Download APK:** ${{ env.BUILD_URL }}

            Built with EAS — [View on Expo](${{ env.BUILD_URL }})
          token: ${{ secrets.GITHUB_TOKEN }}
```

**Setup for Option B:**
1. Generate Expo token: expo.dev → Account Settings → Access Tokens
2. Add to GitHub: repo → Settings → Secrets → `EXPO_TOKEN`
3. Push a tag to trigger: `git tag v1.0.1 && git push origin v1.0.1`

The release will link to the EAS-hosted APK — no re-upload needed.

---

## Version History

| Version | Notes |
|---|---|
| 1.0.1 | Navbar redesign, media upload infrastructure, branding assets, DB reset tooling |
| 1.0.0 | Initial release |

---

## Default Credentials (Development / Testing)

Seeded users and their PINs are defined in `artifacts/backend/src/db/seed.ts`. Do not commit real credentials or production PINs to this repository.
