# PROJECT CONTEXT — WebhookGuard Knowledge Base

This document serves as the single source of truth for the WebhookGuard project architecture, service configurations, schemas, APIs, and current build logs.

---

## Architecture Overview
*   **Monorepo Structure**:
    *   `/frontend` (Next.js Dashboard application)
    *   `/webhook-service` (Node/Express HMAC verification, Redis idempotency checks, & BullMQ async worker)
    *   `/reconciliation` (Django periodic drift detection service)
    *   `/infra` (Docker-compose config, SigNoz Foundry yaml, GitHub Action workflows)
*   **Idempotency & Queueing**: Redis stores idempotency keys (`idempotency:<event_id>`) with a short TTL and powers the BullMQ queue for async webhook execution.
*   **Database**: MongoDB is the primary source of truth storing webhook logs and active customer subscription states.
*   **GitHub Actions Workflow**: Runs a scheduled trigger pointing to Django's reconciliation script.
*   **Observability**: OpenTelemetry instrumentation integrated with a self-hosted SigNoz instance.

---

## Services & Ports
| Service Name | Port | Description | Status |
| :--- | :--- | :--- | :--- |
| **Next.js Dashboard** | 3000 | Founder UI dashboard | Not yet built |
| **Express Webhook Service** | 3001 | Webhook ingestion and worker | Built |
| **Django Reconciliation** | 8000 | Python reconciliation script & REST endpoint | Not yet built |
| **MongoDB** | 27017 | Database instance | Not yet built |
| **Redis** | 6379 | Idempotency store & job queue | Not yet built |
| **SigNoz UI** | 8080 | APM dashboards and metrics UI | Not yet built |
| **SigNoz OTel Collector** | 4317 (gRPC) / 4318 (HTTP) | OpenTelemetry telemetry ingestion | Not yet built |
| **SigNoz MCP Server** | 8001 | AI agent query endpoint for traces/metrics | Not yet built |

---

## Data Models (MongoDB schemas)
*   **`events` collection**: *Not yet built* (Expected fields: `event_id`, `type`, `received_at`, `acknowledged_at`, `processed`, `expected_state_change`, `actual_state_change`, `drift_detected`).
*   **`subscriptions` collection**: *Not yet built* (Expected fields: `customer_id`, `status`, `plan_value`, `last_updated_at`, `at_risk`).
*   **`reconciliation_runs` collection**: *Not yet built* (Expected fields: `drift_count`, `drift_rate`, `dollars_at_risk`, `timestamp`).

---

## API Contracts
### Express Webhook Service
*   **POST `/webhooks/stripe`**:
    *   *Description*: Accepts signed mock Stripe webhook event.
    *   *Headers*: `stripe-signature` (Format: `t=TIMESTAMP,v1=SIGNATURE`) or `x-stripe-signature`
    *   *Payload*: `{ id: string, type: string, created: number, data: { object: { customer: string, plan_value: number } } }`
    *   *Responses*:
        *   `200 OK` (New): `{ received: true, duplicate: false }`
        *   `200 OK` (Duplicate): `{ received: true, duplicate: true }`
        *   `400 Bad Request`: `{ error: string }`
        *   `500 Internal Error`: `{ error: string }`
    *   *Status*: Built.

### Next.js Dashboard / General APIs
*   **GET `/api/events`**:
    *   *Description*: Paginated listing of events for dashboard event log.
    *   *Status*: Not yet built.
*   **GET `/api/subscriptions`**:
    *   *Description*: List of current customers and subscription statuses.
    *   *Status*: Not yet built.

### Django Reconciliation Service
*   **GET `/api/reconciliation/latest`**:
    *   *Description*: Fetches rollup stats of the latest reconciliation run.
    *   *Status*: Not yet built.

---

## Environment Variables
### `webhook-service`
*   `PORT`: Port for Express server (default `3001`).
*   `MONGODB_URI`: Connection string for MongoDB (default `mongodb://localhost:27017/webhookguard`).
*   `REDIS_URL`: Connection string for Redis (default `redis://localhost:6379`).
*   `WEBHOOK_SIGNING_SECRET`: Secret to verify HMAC signature (default `whsec_mocksecret123456`).
*   `SIMULATE_DRIFT_BUG`: Toggles whether async queue worker skips subscription status database update for drift types (default `false`).

### `reconciliation`
*   *Not yet built* (Required: `MONGODB_URI`, `OTEL_EXPORTER_OTLP_ENDPOINT`).

---

## Frontend Component Inventory
*   **Lenis**: Not yet built (Globally configured for smooth scrolling).
*   **Framer Motion**: Not yet built (Global motion variables/variants).
*   **Origin UI**: Not yet built (Data table, filter combobox, dashboard sidebar).
*   **VibeUI**: Not yet built (Accessible modal, animated button).
*   **Skiper UI**: Not yet built (Scroll-reveal alert card).
*   **Vengeance UI**: Not yet built (Text morph badge).
*   **Magic UI**: Not yet built (Bento grid, animated hero text, tech logo marquee).

---

## SigNoz Instrumentation Map
*   **Traces**:
    *   *Not yet built* (Expected trace per webhook event containing spans: `receive_webhook`, `verify_signature`, `redis_idempotency_check`, `enqueue_job`, `process_job`, `mongo_write_state_change`).
*   **Attributes**:
    *   *Not yet built* (Expected: `drift_detected` bool tag on `process_job` span).
*   **Metrics**:
    *   *Not yet built* (Expected: `webhookguard.drift_rate`, `webhookguard.dollars_at_risk`).

---

## Decisions Log
*   **2026-07-24**: Initialized repository layout, `.gitignore`, and `PROJECT_CONTEXT.md` tracking document. We chose a monorepo structure with distinct backend tracks (Express vs. Django) to isolate ingest latency and reconciliation query workloads.

---

## Current Build Status
- [x] **Phase 0** — Repo scaffold + knowledge base setup
- [x] **Phase B1** — Express webhook receiver + Redis idempotency
- [ ] **Phase B2** — MongoDB schemas + event log query APIs (Next)
- [ ] **Phase B3** — Django reconciliation service
- [ ] **Phase B4** — GitHub Actions scheduler
- [ ] **Phase B5** — SigNoz instrumentation (backend traces/metrics)
- [ ] **Phase I1** — SigNoz via Foundry + local orchestration (docker-compose)
- [ ] **Phase I2** — SigNoz dashboards & the demo alert rule
- [ ] **Phase F1** — Next.js scaffold + Lenis + Framer Motion
- [ ] **Phase F2** — Install UI kit components (Origin, Vibe, Skiper, Vengeance)
- [ ] **Phase F3** — Dashboard pages (wired to Express / Django API endpoints)
- [ ] **Phase F4** — Landing/pitch page (Magic UI showcase)
- [ ] **Phase X1** — End-to-end wiring check (CORS, URLs, OTel flow)
- [ ] **Phase X2** — Signed test payload generator CLI + DEMO_SCRIPT.md
