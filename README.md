# Yash Motors (TATA) — Workshop Management System

Garage management platform for Yash Motors TATA dealership. Handles job cards, customer communication via WhatsApp, and workshop workflow.

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo SDK 54, React Native, Expo Router |
| Backend | Express 5, Drizzle ORM, PostgreSQL (Neon) |
| WhatsApp | Baileys (Bot API) |
| Auth | JWT, PIN-based login |
| Images | S3 presigned uploads |
| OCR | ML Kit (on-device) |

## Structure

```directory
artifacts/
├── mobile/          — React Native app (Expo Router)
├── backend/         — Express API + Drizzle + NeonDB
├── api-server/      — WhatsApp Bot (Baileys)
└── mockup-sandbox/  — Prototypes
```

## Quick Start

```bash
# Backend
cd artifacts/backend
pnpm run dev          # API on :3001

# Mobile
cd artifacts/mobile
npx expo start        # Expo dev server

# WhatsApp Bot
cd artifacts/api-server
pnpm run dev          # Bot on :5000
```

## DB Migrations

```bash
cd artifacts/backend
pnpm run db:generate  # Generate migration from schema changes
pnpm run db:migrate   # Apply to database
pnpm run db:push      # Direct push (dev only)
```

## Typecheck

```bash
pnpm run typecheck    # Full workspace typecheck
```
