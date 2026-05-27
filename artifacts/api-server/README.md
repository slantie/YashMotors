# API Server — WhatsApp Bridge

Thin Express service that owns the Baileys WhatsApp session. Receives job requests from the Backend (authenticated via shared secret) and executes WhatsApp actions: group creation, message sending, invite link retrieval.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 20 (ESM), TypeScript |
| Framework | Express |
| WhatsApp SDK | `@whiskeysockets/baileys` 6.7.23 (pinned) |
| Session storage | `baileys_auth/` volume (Docker) or local dir |
| Logging | Pino |

> **Build note**: Baileys ships as CJS. `build.mjs` bundles it into an ESM-compatible output before the server starts.

## Environment Variables

```env
PORT=8080
WHATSAPP_INTERNAL_SECRET=<same value as backend's WHATSAPP_INTERNAL_SECRET>
```

## Endpoints

All routes require `Authorization: Bearer <WHATSAPP_INTERNAL_SECRET>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{ status, connected, qrPending }` |
| `GET` | `/whatsapp/qr` | Returns QR payload (PNG base64) for scanning |
| `POST` | `/whatsapp/group` | Create group, returns `{ groupId, inviteLink }` |
| `POST` | `/whatsapp/message` | Send message to existing group/JID |

## First-Run QR Auth

On first start (no saved session), the service generates a QR code. Open `http://localhost:8080/whatsapp/qr` (or admin panel) and scan with WhatsApp. Session keys are persisted to `baileys_auth/` — the `baileys_auth` Docker volume keeps them across restarts.

If the session disconnects (logout / device removed), the `/health` endpoint returns `connected: false`. Re-scan the QR to restore.

## Running

```bash
# Dev
pnpm dev

# Production (Docker)
docker compose up api-server
```

Session volume:
```yaml
volumes:
  baileys_auth:  # persists auth_info_baileys/ across rebuilds
```
