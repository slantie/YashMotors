# Backend — Yash Motors Case Management API

Express + Drizzle ORM REST API. Manages cases, events, images, users, and WhatsApp group creation via BullMQ jobs dispatched to the API Server.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 20 (ESM), TypeScript |
| Framework | Express 5 |
| ORM | Drizzle ORM + `postgres-js` |
| Database | PostgreSQL 16 |
| Queue | BullMQ + Redis |
| Storage | AWS S3 (presigned PUT/GET) |
| Auth | JWT (access + refresh tokens) |

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=<random 64-char string>
REFRESH_TOKEN_SECRET=<random 64-char string>
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=...
REDIS_HOST=redis
REDIS_PORT=6379
WHATSAPP_API_URL=http://api-server:8080
WHATSAPP_INTERNAL_SECRET=<shared secret with api-server>
OCR_URL=http://ocr:8000
PORT=3001
```

## Key Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Issue access + refresh tokens |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `GET` | `/cases` | List cases (role-filtered) |
| `POST` | `/cases` | Create new case |
| `GET` | `/cases/:id` | Case detail with events |
| `PUT` | `/cases/:id/internal-status` | Update workshop stage |
| `PUT` | `/cases/:id/customer-status` | Update customer-facing status |
| `PUT` | `/cases/:id/transfer` | Transfer case to another advisor |
| `DELETE` | `/cases/:id` | Soft-delete case |
| `POST` | `/cases/:id/images/presign` | Get S3 presigned PUT URL |
| `POST` | `/cases/:id/images/confirm` | Confirm uploaded batch (max 200) |
| `GET` | `/cases/:id/images` | List images with presigned GET URLs |
| `DELETE` | `/cases/:id/images/:imgId` | Delete image from S3 + DB |
| `POST` | `/cases/:id/whatsapp/group` | Enqueue WhatsApp group creation |
| `POST` | `/cases/:id/whatsapp/message` | Enqueue WhatsApp message |
| `GET` | `/cases/:id/whatsapp/status` | Check group creation status |

## Roles

`superadmin` → `admin` → `advisor` → `technician`

Advisors see only their own cases. Technicians can update internal status and upload photos but cannot delete.

## Database Migrations

Migrations are run automatically on startup via `drizzle-orm/postgres-js/migrator`. Migration files live in `drizzle/`. To generate a new migration after schema changes:

```bash
pnpm drizzle-kit generate
```

## Running

```bash
# Dev
pnpm dev

# Production (Docker)
docker compose up backend
```
