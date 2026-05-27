# Mobile — Yash Motors Field App

React Native (Expo) app for service advisors and technicians. Handles case creation via OCR intake, real-time status updates, photo uploads, and WhatsApp group coordination.

## Stack

| Layer | Tech |
|-------|------|
| Framework | React Native, Expo SDK 54, New Architecture |
| Router | Expo Router (file-based) |
| State | Zustand + `zustand/middleware` persist (AsyncStorage) |
| Data fetching | TanStack Query v5 |
| Forms | Controlled components + Zustand intake store |
| Build | EAS Build (development APK + production) |

## Environment Variables

Set in `app.json` / `eas.json` `env` blocks, or a local `.env`:

```env
EXPO_PUBLIC_API_URL=https://yashmotorsbackend.mooo.com
```

## Key Screens

| Route | Description |
|-------|-------------|
| `/` (index) | Case list with search + pull-to-refresh |
| `/(cases)/[caseNumber]` | Case detail — status, timeline, photos, WhatsApp |
| `/intake` | New case intake form |
| `/ocr-preview` | OCR result review before case creation |
| `/image-sharing` | Bulk photo share to WhatsApp |
| `/whatsapp-workflow` | Manual WhatsApp group creation workflow |

## Roles & Permissions

| Role | Can Create | Can Update Status | Can Upload Photos | Can Delete |
|------|-----------|-------------------|-------------------|------------|
| superadmin / admin | ✓ | ✓ | ✓ | ✓ |
| advisor | ✓ | ✓ | ✓ | ✗ |
| technician | ✗ | Internal only | ✓ (repairs) | ✗ |

## Photo Upload Architecture

Intake photos upload in the **background** after case creation — the user is navigated to the case detail immediately. Progress is tracked via `useIntakeStore.uploadProgress` and shown as a pinned banner on the case detail screen.

Repair photos (added from case detail) upload inline with a spinner.

Both use a presign → S3 PUT → confirm flow (max 200 images per batch).

## Building

```bash
# Start dev server (requires EAS dev build installed on device)
npx expo start

# Queue EAS development build (APK, prod API)
eas build --profile development --platform android

# Production build
eas build --profile production --platform android
```

## Native Module Notes

`react-native-bootsplash` and `react-native-share` use `TurboModuleRegistry.getEnforcing` — they crash Expo Go at import time. Both are lazy-required with try/catch fallbacks so the app still runs in Expo Go for rapid iteration. They work correctly in EAS dev and production builds.
