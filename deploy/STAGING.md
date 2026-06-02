# Staging Runbook — Blue/Green Flip on the Prod Box

Staging is a **second docker stack** beside prod. nginx flips the public backend domain
between the two during a test window. **One APK** (URL unchanged) works against both; the
swap is entirely server-side.

> ⚠️ Trade-off you accepted: while flipped to staging, **real users hit staging too** — it
> is a cutover, not parallel. Keep test windows short and announced.

## Port map

| Service | Prod (host) | Staging (host) |
|---|---|---|
| backend | 3001 | **4001** |
| api-server | 8080 | **9080** |
| ocr | 8000 | **9000** |
| archive | 3003 | **4003** |

All bound to `127.0.0.1` — only nginx reaches them.

---

## One-time setup

1. **Neon staging branch** — Neon → Branches → branch off `main`. Copy its connection
   string (this is the staging `DATABASE_URL`; it carries a data copy and is disposable).

2. **Staging env files** — for each service, copy the template and fill:
   ```bash
   cp artifacts/backend/.env.staging.example     artifacts/backend/.env.staging
   cp artifacts/api-server/.env.staging.example  artifacts/api-server/.env.staging
   cp artifacts/archive-ui/.env.staging.example  artifacts/archive-ui/.env.staging
   cp services/ocr/.env.staging.example          services/ocr/.env.staging
   ```
   - `DATABASE_URL` in backend **and** archive = the **Neon branch** string. Never prod main.
   - Match `WHATSAPP_INTERNAL_SECRET` across backend + api-server staging files.
   - `.env.staging` is git-ignored — secrets never get committed.

3. **nginx upstream include** — install the flip target into nginx http context and point
   the vhost at it:
   ```bash
   sudo cp deploy/nginx/yashmotors-backend-active.conf /etc/nginx/conf.d/
   ```
   Then in the `yashmotorsbackend.mooo.com` server block set:
   ```nginx
   location / {
       proxy_pass http://yashmotors_backend_active;
       proxy_set_header Host              $host;
       proxy_set_header X-Real-IP         $remote_addr;
       proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
   ```bash
   sudo nginx -t && sudo nginx -s reload   # default upstream = prod :3001
   ```

---

## Bring staging up

```bash
# WHATSAPP_INTERNAL_SECRET is read from the shell env (same as prod compose).
export WHATSAPP_INTERNAL_SECRET=...   # staging value, matches the .env.staging files

docker compose -f docker-compose.staging.yml -p yashmotors-staging up -d --build
```

- `backend-migrate` runs **first** and applies pending migrations (incl. `0007` indexes) to
  the **Neon branch** — verify it exits 0 before testing.
- Containers/volumes are prefixed `yashmotors-staging_` → fully isolated from prod (own
  Redis, own empty `baileys_auth`).

Smoke-check staging directly (before flipping public traffic):
```bash
curl -s http://127.0.0.1:4001/healthz        # backend
curl -s http://127.0.0.1:9000/health         # ocr
```

---

## Test window

```bash
sudo deploy/flip-env.sh staging     # yashmotorsbackend.mooo.com → :4001
# ... run the APK / archive against staging ...
curl -s https://yashmotorsbackend.mooo.com/healthz   # confirm it's the staging build

sudo deploy/flip-env.sh prod        # flip back when done
```

The flip is an nginx reload (no dropped connections). Rollback = `flip-env.sh prod`.

---

## Tear down

```bash
docker compose -f docker-compose.staging.yml -p yashmotors-staging down
# add -v to also drop the staging volumes (Redis, baileys, model cache)
```
Refresh or delete the Neon branch when finished.

---

## WhatsApp caveat

A single WhatsApp number cannot host two primary Baileys sessions. The staging api-server
has its own empty `baileys_auth` volume, so it will want its own QR link. Options:
- Don't exercise WA flows in staging (everything else works), **or**
- Link a separate test number to the staging session.

Do not point staging at the prod number expecting both to stay connected.
