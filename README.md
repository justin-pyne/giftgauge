# GiftGauge

GiftGauge helps people evaluate gift ideas. A recipient privately builds a "taste profile" (things they own, want, like, dislike, hobbies, style, budget). A gift giver uses a share code to submit a gift idea and gets back an AI-generated 1–10 score with pros, cons, and a confidence rating — **without ever seeing the recipient's raw preferences.**

This repository contains only the application. Terraform, Kubernetes manifests, Helm charts, and CI/CD pipelines are intentionally **not** included here — they will be added in a later phase of the DevOps final project. The application has been built so that adding those layers later is straightforward.

---

## Architecture

```
                            ┌────────────────────┐
                            │   Frontend (5173)  │
                            │  React + Vite + TS │
                            └─────────┬──────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
  ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
  │ profile-service  │      │ sharing-service  │      │ scoring-service  │
  │     :3001        │      │     :3002        │      │     :3003        │
  │                  │      │                  │      │                  │
  │ Owns profiles,   │      │ Owns share codes │      │ Reads private    │
  │ preferences,     │      │ and gift-giver   │      │ profile + calls  │
  │ owner tokens     │      │ submissions      │      │ AI to score gift │
  └────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
           │                         │                         │
           └─────────────────────────┼─────────────────────────┘
                                     ▼
                           ┌──────────────────────┐
                           │     Postgres         │
                           │  (local container or │
                           │   AWS RDS in prod)   │
                           └──────────────────────┘
```

Three independent stateless Node.js + Express + TypeScript services, each with its own database connection pool. They share a single Postgres database for now (a normal pattern for a small monolithic data model), but each service only owns specific tables and treats the others as private.

---

## Privacy Model

> **Gift givers never see the recipient's raw taste profile.**

- `GET /api/share/:shareCode` returns only `occasion`, `budgetMin`, `budgetMax`, and a validity flag. It never returns preferences.
- `POST /api/scores` accepts a share code from a gift giver and uses the recipient's preferences **internally** to call the AI. The response only contains the score, summary, pros, cons, confidence, and budget fit.
- `GET /api/profiles/:profileId` requires an `x-owner-token` header that only the recipient receives at profile creation time. Without it the endpoint returns 401.

---

## Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js 20 + Express + TypeScript |
| Database | Postgres 16 (local container; RDS in production) |
| DB driver | `pg` (no ORM — keeps it simple and inspectable) |
| Migrations | Plain SQL files, Flyway-compatible naming |
| Logging | `pino` — structured JSON to stdout |
| Metrics | `prom-client` — `/metrics` Prometheus endpoint |
| AI | Mock by default (`AI_MODE=mock`); optional `AI_MODE=openai` |

---

## Local Development

You need Docker and Docker Compose. Nothing else.

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- Frontend: <http://localhost:5173>
- Profile Service: <http://localhost:3001/health>
- Sharing Service: <http://localhost:3002/health>
- Scoring Service: <http://localhost:3003/health>

The first time you run, the `migrator` service applies `V1` and `V2` to a fresh Postgres volume, then exits.

### Reset the database

```bash
docker compose down -v
docker compose up --build
```

The `-v` flag removes the Postgres volume so the next start re-runs migrations against an empty DB.

### View logs

```bash
docker compose logs -f profile-service
docker compose logs -f sharing-service
docker compose logs -f scoring-service
```

All three services emit structured JSON logs to stdout — ready for Promtail / Loki ingestion later.

### Test health and metrics endpoints

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
curl http://localhost:3001/metrics

curl http://localhost:3002/health
curl http://localhost:3003/health
```

---

## API: Manual Smoke Test with `curl`

A complete end-to-end flow you can paste into a terminal:

```bash
# 1. Create a profile
curl -s -X POST http://localhost:3001/api/profiles \
  -H 'content-type: application/json' \
  -d '{"displayName":"Justin","occasion":"Birthday","budgetMin":25,"budgetMax":100}'
# => { "profileId": "...", "ownerToken": "..." }

# Save those for the next calls
PROFILE_ID=...
OWNER_TOKEN=...

# 2. Add preferences
curl -s -X POST "http://localhost:3001/api/profiles/$PROFILE_ID/preferences" \
  -H 'content-type: application/json' \
  -H "x-owner-token: $OWNER_TOKEN" \
  -d '{"category":"likes","text":"vintage cameras"}'

curl -s -X POST "http://localhost:3001/api/profiles/$PROFILE_ID/preferences" \
  -H 'content-type: application/json' \
  -H "x-owner-token: $OWNER_TOKEN" \
  -d '{"category":"hobbies","text":"vinyl records"}'

# 3. Generate a share code
curl -s -X POST "http://localhost:3001/api/profiles/$PROFILE_ID/share-code" \
  -H "x-owner-token: $OWNER_TOKEN"
# => { "shareCode": "GIFT-XXXXXX" }

SHARE_CODE=GIFT-XXXXXX

# 4. (Gift giver side) Look up safe public info
curl -s "http://localhost:3002/api/share/$SHARE_CODE"

# 5. Submit a gift idea (sharing service)
curl -s -X POST "http://localhost:3002/api/share/$SHARE_CODE/submissions" \
  -H 'content-type: application/json' \
  -d '{"giverName":"Alex","giftName":"Bluetooth record player","giftDescription":"Portable record player with built-in speakers","estimatedPrice":80}'

# 6. Score the gift idea (scoring service)
curl -s -X POST http://localhost:3003/api/scores \
  -H 'content-type: application/json' \
  -d "{\"shareCode\":\"$SHARE_CODE\",\"giverName\":\"Alex\",\"giftName\":\"Bluetooth record player\",\"giftDescription\":\"Portable record player with built-in speakers\",\"estimatedPrice\":80}"
# => { "scoreId": "...", "score": 8, "summary": "...", "pros": [...], "cons": [...], "confidenceScore": 90, "budgetFit": "good" }
```

---

## API Reference Summary

### Profile Service — `:3001`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | — | Liveness |
| GET | `/ready` | — | Readiness (checks DB) |
| GET | `/metrics` | — | Prometheus metrics |
| POST | `/api/profiles` | — | Create profile, returns `ownerToken` |
| GET | `/api/profiles/:profileId` | `x-owner-token` | Owner-only private view |
| POST | `/api/profiles/:profileId/preferences` | `x-owner-token` | Add a preference item |
| POST | `/api/profiles/:profileId/share-code` | `x-owner-token` | Create a share code |

### Sharing Service — `:3002`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health`, `/ready`, `/metrics` | — | Ops endpoints |
| GET | `/api/share/:shareCode` | — | Public-safe info only (no preferences) |
| POST | `/api/share/:shareCode/submissions` | — | Gift giver submits an idea |

### Scoring Service — `:3003`
| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health`, `/ready`, `/metrics` | — | Ops endpoints |
| POST | `/api/scores` | — | Score a gift idea against a private profile |
| GET | `/api/scores/:scoreId` | — | Retrieve a previously generated score |

---

## Database Migrations

Migrations live in `database/migrations/` and follow Flyway-style naming so the same files can be picked up by Flyway in EKS later if desired.

```
database/migrations/
  V1__initial_schema.sql          # tables: profiles, preferences, share_links, gift_submissions, gift_scores
  V2__add_scoring_metadata.sql    # adds confidence_score and budget_fit to gift_scores
```

A small bash + `psql` migrator container (defined in `docker-compose.yml` and `scripts/migrate.sh`) tracks applied migrations in a `schema_migrations` table and applies any new ones in lexicographic order. Backend services will not start until migrations complete (Compose `depends_on` with `service_completed_successfully`).

For the **Day 2 schema-change demo** in the EKS phase, you will be able to:
1. Deploy the app with only `V1` applied.
2. Then run a migration job that applies `V2`.
3. Show that the running services pick up the new columns without restart, because the application code is forward-compatible — it `SELECT`s and writes `confidence_score` / `budget_fit` only via `ALTER`-added columns and treats `NULL` results as "not yet computed."

> **Note on `owner_token` storage:** for simplicity in this class project the owner token is stored as plain text in the `profiles` table. In production you should hash it (e.g. SHA-256 with a per-row salt) and only store the hash, comparing on lookup. This is called out so the production path is clear.

---

## EKS / DevOps Readiness — How This Repo Sets Up the Next Phase

This is just the application, but it has been built to drop cleanly into the DevOps stack you'll layer on top later.

**Container readiness**
- Every backend service has a production-oriented multi-stage Dockerfile, runs as a non-root user, listens on `0.0.0.0`, reads `PORT` and `DATABASE_URL` from environment variables, and handles `SIGTERM` gracefully (closes the DB pool, drains the HTTP server). This is what EKS rolling updates and blue/green cutovers need.
- Services are stateless: no local file storage, no in-memory session state. You can run N replicas behind a `Service` and scale with HPA.

**Health endpoints for Kubernetes**
- `/health` is cheap and DB-independent — perfect for `livenessProbe`.
- `/ready` requires a working DB connection — perfect for `readinessProbe`. During RDS failover or Pod startup, traffic won't be routed until the DB pool is up.

**Metrics endpoints for Prometheus**
- Each service exposes `/metrics` in standard Prometheus exposition format on the same port as the API. A `ServiceMonitor` (kube-prometheus-stack) or scrape config can target these directly.
- Custom service-specific metrics are already implemented:
  - `profile_service_profiles_created_total`
  - `sharing_service_submissions_total`
  - `scoring_service_ai_requests_total`, `scoring_service_ai_request_duration_seconds`
- Standard HTTP request count / duration / error metrics are exported via middleware in all three services.

**Logs for Loki / Promtail**
- All services log structured JSON to stdout via `pino`. Fields include `service`, `level`, `requestId`, `method`, `path`, `statusCode`, `durationMs`, `err`. Promtail can ship these directly to Loki, and a single Grafana query can correlate a `requestId` across all three services.

**Database for RDS**
- The application reads `DATABASE_URL` only. There is no AWS-specific code in the app — switching from a local Postgres container to RDS is purely a matter of changing the env var.
- Connection pooling uses `pg.Pool` with sensible defaults so you can tune `max` per replica without code changes.

**Blue/green deployment**
- Services have no ordering dependencies and no startup-time data migrations. A blue/green flip with two ALB target groups (or two `Deployment`s plus a label-selector swap) is safe.
- Schema migrations run as a separate one-shot job (the `migrator` container) — not on service startup — which is the correct pattern for blue/green: migrate first, then flip traffic.

**What this repo deliberately does not include yet**
- No Terraform, no Helm charts, no Kubernetes manifests, no GitHub Actions workflows. Those will be added in subsequent phases of the project.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `migrator` container restarts repeatedly | Check `docker compose logs migrator` — usually a SQL syntax error in a migration file. |
| Backend service is stuck "starting" | It's waiting on the migrator to finish. Check `docker compose logs migrator`. |
| `/ready` returns 503 | DB pool can't connect. Check `DATABASE_URL` and that the `db` container is healthy. |
| Frontend can't reach backends | Verify `VITE_PROFILE_API_URL`, `VITE_SHARING_API_URL`, `VITE_SCORING_API_URL` in the running frontend container. In Compose, these point to `http://localhost:300X` because the browser, not the container, makes the calls. |
| Want to wipe and restart cleanly | `docker compose down -v && docker compose up --build` |
