# WebhookGuard — Antigravity Build Playbook

A copy-paste sequence of prompts for **Google Antigravity** to build WebhookGuard for the "Agents of SigNoz" hackathon (WeMakeDevs × SigNoz). Built around your stack: Next.js/TS/Tailwind, Node/Express, Redis, MongoDB, Django, GitHub Actions, SigNoz (via Foundry).

---

## 0. How to use this doc

1. Do the phases **in order**. Each phase = one Antigravity prompt (or a short cluster of prompts if marked "sub-steps").
2. Every prompt below starts with a **context header** — always keep that line in, even if you shorten the rest. It's what stops Antigravity from improvising a different architecture halfway through.
3. Phase 1 creates a **living knowledge base file** (`PROJECT_CONTEXT.md`) in the repo root. Every prompt after that tells Antigravity to *read it first, act, then update it*. This is your single source of truth — if Antigravity ever seems confused mid-hackathon, your fallback prompt is just: *"Read PROJECT_CONTEXT.md fully before doing anything else, then continue with: [next task]."*
4. Frontend and backend are split into **separate phase tracks** so two teammates can run Antigravity in parallel without prompt collisions — just make sure whoever finishes a shared-contract step (API routes, DB schema) updates `PROJECT_CONTEXT.md` before the other side depends on it.

---

## 1. UI component sourcing — which kit for which part

From your `UI Design Websites.docx`, here's the mapping I'd actually use (skip the rest to stay fast):

| Part of the app | Kit | Why |
|---|---|---|
| Dashboard tables, forms, nav, comboboxes (webhook list, customer list, filters) | **Origin UI** (originui.com) | 200+ copy-paste components, shadcn conventions, accessible by default — this is your workhorse for data-heavy screens |
| The "acknowledged but no state change" alert card / live drift banner | **Skiper UI** (skiper-ui.com) | Scroll-reveal + micro-interaction components make the anomaly card feel alive when it fires live during the demo |
| The moment a webhook flips from "OK" → "DRIFT DETECTED" (your single most demoable moment) | **Vengeance UI** (vengenceui.com) | Text morph/flip animation + hover trail effects — perfect for a state transition judges will actually notice |
| Landing/pitch page (hero, bento grid explaining the problem, marquee of "trusted stack" logos) | **Magic UI** (magicui.design) | Built for landing/marketing pages exactly like a hackathon pitch page — marquee, bento grid, animated text reveals |
| Accessible modals, animated buttons, form elements (settings, "connect Stripe" modal) | **VibeUI** (vibeui.dev) | WAI-ARIA accessible, TypeScript-first, no animation logic to hand-roll |
| Extra flourish if you have spare time (particle backgrounds, animated lists for the event log feed) | **React Bits** (reactbits.dev) | GSAP/Framer Motion/Three.js-powered, use sparingly — don't let it fight with Lenis smooth scroll |
| Quick one-off pulls (pricing/FAQ block if you add a "why this matters" section) | **21st.dev** | Marketplace, single shadcn CLI command per component — fine for one-offs, don't build your core UI around it |

Skip **Free Framer Assets** (that's for no-code Framer sites, not your Next.js codebase) and **HorizonX** (paid subscription, not worth it for a 1-week hackathon).

Most of these (Origin UI, Skiper UI, Vengeance UI, Magic UI) install via the **shadcn CLI** or their own CLI, dropping editable source into your project — so Antigravity can pull individual components on demand instead of installing a whole package. You'll tell it exactly which component to pull in each frontend prompt below.

---

## 2. SigNoz — how it plugs into Idea 1

Grounded in the current SigNoz docs (self-host is now installed via **Foundry**, not the old `install.sh`/`docker-compose` files — those are deprecated):

- **Install**: `foundryctl` CLI + a `casting.yaml` targeting `flavor: compose, mode: docker` → `foundryctl cast -f casting.yaml`. Spins up ClickHouse, Postgres metastore, the OTel collector (ports 4317/4318), and the SigNoz UI on port 8080.
- **MCP server (optional but a great hackathon flex)**: Foundry can also deploy the SigNoz MCP server (port 8000) alongside the stack, so Antigravity itself (or Claude Code) can *query your traces/metrics/alerts directly* instead of you tabbing over to the SigNoz UI. Enable via `mcp.spec.enabled: true` in `casting.yaml`, then connect with an API key from Settings → API Keys.
- **What gets traced**: one trace per webhook event, spanning `receive → signature verify → Redis idempotency check → queue → async handler (Django/Node) → MongoDB write`. A custom span attribute `drift_detected: true/false` flags the anomaly. This is instrumented with OpenTelemetry SDKs, exported to the OTel collector at `4317`.
- **Metrics**: drift rate over time, `$ at risk` (custom metric = subscription value × drift count).
- **Dashboard**: reconciliation results vs. acknowledgment rate, side by side.
- **Alert**: fires when a webhook is acknowledged but no corresponding DB write happens within N seconds — configured in SigNoz Alerts UI, backed by the trace/span data.

---

## 3. The persistent context block (paste this into Antigravity FIRST, once)

Paste this as your very first message in the Antigravity session, before any task prompt. Re-paste it (or a one-line reference to it) at the start of any *new* Antigravity session/window.

```
PROJECT CONTEXT — READ AND RETAIN FOR THE ENTIRE SESSION

We are building "WebhookGuard" for the Agents of SigNoz hackathon (WeMakeDevs x SigNoz).

Problem: Stripe (and similar) webhooks can return 200 OK while doing nothing —
the handler silently no-ops, so no exception is thrown and no monitoring catches it.
Founders lose real revenue because acknowledged events never produce the expected
state change (e.g. invoice.payment_failed never revokes access).

What we're building: a webhook receiver + reconciliation system that periodically
checks "did every acknowledged event actually produce the expected DB state change?"
and flags drift, in real time, visible in a founder-facing dashboard AND in SigNoz.

Fixed architecture (do not substitute or "improve" these choices without asking):
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS, deployed as the
  founder-facing dashboard. Uses Lenis for smooth scrolling and Framer Motion for
  animation. UI components sourced from Origin UI, Skiper UI, Vengeance UI, Magic UI,
  and VibeUI (installed piecemeal via shadcn CLI where applicable) — never invent
  a different component library.
- Webhook receiver: Node.js + Express. Receives simulated signed Stripe-style
  webhook payloads (we are NOT using a real Stripe account — we build our own
  signed test payload generator). Does the minimum work, then queues the rest.
- Redis: idempotency-key store (dedupe webhook retries) + async job queue for the
  webhook handler's real work.
- MongoDB: source of truth. Two collections minimum: `events` (event log — every
  acknowledged webhook) and `subscriptions` (current billing state per customer).
- Django (separate service, separate repo folder /reconciliation): periodically
  diffs "events acknowledged" vs "subscription state actually changed." This is a
  DELIBERATE second backend, mirroring the real-world two-backend drift pattern —
  do not merge this into the Express service.
- GitHub Actions: scheduled workflow that triggers the Django reconciliation job.
- Observability: SigNoz (self-hosted via Foundry/Docker), instrumented with
  OpenTelemetry across Express and Django. One trace per webhook event:
  receive -> verify signature -> Redis idempotency check -> queue -> async handler
  -> Mongo write. Custom span attribute `drift_detected`. Custom metrics: drift
  rate over time, $ at risk. One SigNoz alert: acknowledged-but-no-write within N
  seconds.

Ground rule: A file called PROJECT_CONTEXT.md lives in the repo root and is the
single source of truth for architecture decisions, API contracts, DB schemas,
env vars, ports, and current build status. Before starting ANY task, read
PROJECT_CONTEXT.md in full. After finishing ANY task, update the relevant
section(s) of PROJECT_CONTEXT.md (don't wait to be asked). If something in this
message conflicts with PROJECT_CONTEXT.md later in the project, PROJECT_CONTEXT.md
wins, because it reflects what was actually built.

Confirm you've understood this, then wait for the first task prompt.
```

---

## 4. Phase 0 — Repo scaffold + knowledge base file

```
CONTEXT: Refer to the WebhookGuard project context from my previous message.
This is Phase 0 of the build — repo scaffolding.

TASK:
1. Create the monorepo folder structure:
   /frontend        (Next.js dashboard)
   /webhook-service (Node/Express receiver)
   /reconciliation  (Django service)
   /infra           (docker-compose or Foundry casting.yaml, GitHub Actions workflows)
   /PROJECT_CONTEXT.md  (repo root)

2. Create PROJECT_CONTEXT.md with these exact sections, each currently marked
   "Not yet built":
   ## Architecture Overview
   ## Services & Ports
   ## Data Models (MongoDB schemas)
   ## API Contracts (endpoint, method, request/response shape, owning service)
   ## Environment Variables (per service)
   ## Frontend Component Inventory (which UI kit each component came from)
   ## SigNoz Instrumentation Map (which span/trace covers which code path)
   ## Decisions Log (dated, one line each, why we chose X over Y)
   ## Current Build Status (checklist, updated after every phase)

3. Add root-level README.md summarizing the problem, architecture, and how to run
   all services locally.

4. Initialize git, add a root .gitignore covering node_modules, .env,
   __pycache__, venv, .next, and Django's db.sqlite3 if any.

After creating these, update PROJECT_CONTEXT.md's "Current Build Status" to
mark Phase 0 complete, and stop for my review before continuing.
```

---

## BACKEND TRACK

### Phase B1 — Express webhook receiver + Redis idempotency

```
CONTEXT: Refer to PROJECT_CONTEXT.md in the repo root — read it fully before
starting. This is Phase B1, backend track, webhook-service.

TASK: In /webhook-service, build a Node.js + Express (TypeScript) service:
1. POST /webhooks/stripe — accepts a signed test payload (we're simulating
   Stripe, not using a real account). Verify a fake HMAC signature using a
   shared secret from env var WEBHOOK_SIGNING_SECRET.
2. On receipt: check Redis for the event's idempotency key
   (`idempotency:<event_id>`). If already processed, return 200 immediately
   without reprocessing. If new, store the key with a short TTL, push the event
   onto a Redis-backed queue (use BullMQ), and return 200 immediately — the
   handler should do minimal synchronous work, matching the
   "acknowledge fast, process async" pattern.
3. A separate queue worker (same service, separate process/file) consumes the
   queue and does the "real work": writes the event to MongoDB `events`
   collection, and applies the expected state change to the `subscriptions`
   collection (e.g. invoice.payment_failed -> flag subscription as at-risk).
4. Deliberately support a "buggy mode" toggle (env var SIMULATE_DRIFT_BUG=true)
   where the worker acknowledges certain event types but skips the actual
   state-change write — this is what we'll trigger live in the demo for SigNoz
   to catch.
5. Add structured logging (event id, type, processed/skipped, timestamp).

Do NOT add SigNoz/OpenTelemetry instrumentation yet — that's a later phase.

When done, update PROJECT_CONTEXT.md: add the /webhooks/stripe endpoint under
API Contracts, the Redis key patterns and queue name under Architecture
Overview, and mark Phase B1 complete in Current Build Status.
```

### Phase B2 — MongoDB schemas + event log

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first. This is Phase B2,
backend track, still in /webhook-service (or a shared /shared-models folder if
Django needs the same schema shape).

TASK:
1. Define Mongoose schemas:
   - `events`: event_id, type, received_at, acknowledged_at, processed (bool),
     expected_state_change (string, e.g. "subscription.status -> past_due"),
     actual_state_change (string, nullable), drift_detected (bool, default
     null until reconciliation runs).
   - `subscriptions`: customer_id, status, plan_value, last_updated_at,
     at_risk (bool).
2. Seed a script (scripts/seed.ts) that creates 5-10 fake customers/
   subscriptions so the dashboard has data to show immediately.
3. Add a GET /api/events and GET /api/subscriptions read endpoint (for the
   frontend dashboard to consume) with basic pagination.

When done, update PROJECT_CONTEXT.md's Data Models and API Contracts sections
with the exact schema fields and the two new GET endpoints. Mark Phase B2
complete.
```

### Phase B3 — Django reconciliation service

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first, especially the
Data Models section from Phase B2 so the schemas match exactly. This is
Phase B3, backend track, /reconciliation.

TASK: Build a separate Django service (its own venv/requirements.txt) whose
only job is reconciliation — do not let it become a general-purpose API.
1. A management command `reconcile.py` that:
   - Reads all `events` from MongoDB (use pymongo, matching the exact
     collection/field names from PROJECT_CONTEXT.md's Data Models section)
     where processed=true and drift_detected is still null.
   - For each event, checks whether the corresponding subscription's state
     actually reflects the expected_state_change.
   - Writes drift_detected=true/false back onto the event document.
   - Computes and stores a rollup: drift_count, drift_rate,
     dollars_at_risk (drift_count x average subscription plan_value) into a
     new `reconciliation_runs` collection with a timestamp.
2. Expose one lightweight endpoint (Django REST or plain view),
   GET /api/reconciliation/latest, returning the most recent rollup — this is
   what the frontend dashboard polls.
3. Make the command runnable both locally (`python manage.py reconcile`) and
   via a documented entrypoint GitHub Actions can call in CI.

When done, update PROJECT_CONTEXT.md: add `reconciliation_runs` to Data
Models, add the new endpoint to API Contracts, note in Decisions Log why
reconciliation is a separate Django service rather than folded into Express.
Mark Phase B3 complete.
```

### Phase B4 — GitHub Actions scheduler

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first. This is Phase B4,
backend track, /infra/.github/workflows.

TASK: Add a GitHub Actions workflow `reconciliation.yml` that:
1. Runs on a schedule (every 5 minutes is fine for a live demo — note in a
   comment that production would be less frequent).
2. Also supports workflow_dispatch so we can trigger it manually on stage
   during the demo.
3. Sets up Python, installs /reconciliation's requirements, sets the Mongo
   connection env var from a GitHub secret, and runs
   `python manage.py reconcile`.

When done, update PROJECT_CONTEXT.md's Current Build Status marking Phase B4
complete, and note the workflow file path under Architecture Overview.
```

### Phase B5 — SigNoz instrumentation (backend)

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first, especially the
SigNoz Instrumentation Map section (currently empty) and the exact code paths
built in B1-B3. This is Phase B5, backend track — the observability core of
the whole project.

TASK:
1. In /webhook-service, add the OpenTelemetry Node SDK. Instrument these spans
   per webhook event, all under one parent trace keyed by event_id:
   - `receive_webhook` (HTTP handler entry)
   - `verify_signature`
   - `redis_idempotency_check`
   - `enqueue_job`
   - `process_job` (the async worker)
   - `mongo_write_state_change`
   Add a custom span attribute `drift_detected` (bool) on the `process_job`
   span — true when SIMULATE_DRIFT_BUG causes the state-change write to be
   skipped.
2. In /reconciliation (Django), add the OpenTelemetry Python SDK. Instrument
   the `reconcile` management command as its own trace, with spans per event
   checked, and emit a custom metric `webhookguard.drift_rate` and
   `webhookguard.dollars_at_risk` after each run.
3. Configure both services to export via OTLP to the SigNoz collector at
   localhost:4317 (env var OTEL_EXPORTER_OTLP_ENDPOINT), using
   OTEL_SERVICE_NAME=webhook-service and OTEL_SERVICE_NAME=reconciliation-service
   respectively so they're distinguishable in SigNoz.

Do NOT set up the SigNoz stack itself yet — that's the infra phase. Just wire
the instrumentation so it's ready to export the moment SigNoz is running.

When done, fill in PROJECT_CONTEXT.md's SigNoz Instrumentation Map with every
span name, which service/file it lives in, and what each custom
attribute/metric means. Mark Phase B5 complete.
```

---

## INFRA TRACK

### Phase I1 — SigNoz via Foundry + local orchestration

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first. This is Phase I1,
infra track, /infra.

TASK:
1. Add a root docker-compose.yml (or per-service Dockerfiles + one compose
   file) that runs webhook-service, reconciliation's Postgres/Mongo
   dependencies if any, MongoDB, and Redis together for local dev — one
   command to bring the whole app stack up.
2. Add /infra/signoz/casting.yaml for installing SigNoz itself via Foundry:
   apiVersion v1alpha1, kind Installation, deployment.flavor: compose,
   deployment.mode: docker. Include an `mcp` block with enabled: true so the
   SigNoz MCP server also comes up on port 8000 (useful so we, or Antigravity,
   can query SigNoz data directly during the hackathon instead of only using
   the UI).
3. Add a short /infra/SIGNOZ_SETUP.md documenting: install foundryctl via
   `curl -fsSL https://signoz.io/foundry.sh | bash`, then
   `foundryctl cast -f casting.yaml`, then open http://localhost:8080, then
   create an API key under Settings -> API Keys for the MCP server.
4. Make sure webhook-service and reconciliation's OTEL_EXPORTER_OTLP_ENDPOINT
   env vars point at this SigNoz collector's exposed port (4317).

When done, update PROJECT_CONTEXT.md's Services & Ports table with every port
(8080 SigNoz UI, 4317/4318 OTLP, 8000 MCP, plus app ports), and mark Phase I1
complete.
```

### Phase I2 — SigNoz dashboards & the demo alert

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first, especially the
SigNoz Instrumentation Map from Phase B5. This is Phase I2, infra track.

TASK: This phase is mostly done inside the SigNoz UI (localhost:8080), not in
code — Antigravity, walk me through it step by step and stop for confirmation
before I actually click into SigNoz:
1. Build a dashboard panel showing acknowledgment rate vs. reconciled drift
   rate side by side, sourced from the `webhookguard.drift_rate` metric.
2. Build a panel showing dollars_at_risk over time.
3. Create one alert rule: fire when a `process_job` span has
   drift_detected=true and more than N seconds have passed since
   `receive_webhook` without a corresponding `mongo_write_state_change` span
   completing. This is our live demo trigger.
4. If you generate any dashboard JSON or alert config as code (SigNoz supports
   config-as-code), write it into /infra/signoz/dashboards/ and
   /infra/signoz/alerts/ so it's version-controlled and reproducible for
   judges, not just clicked together live.

When done, update PROJECT_CONTEXT.md noting where dashboard/alert config
lives, and mark Phase I2 complete.
```

---

## FRONTEND TRACK

### Phase F1 — Next.js scaffold + Lenis + Framer Motion + design tokens

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first, especially API
Contracts from Phases B2/B3 (the dashboard will consume those endpoints).
This is Phase F1, frontend track, /frontend.

TASK:
1. Scaffold Next.js (App Router, TypeScript, Tailwind CSS).
2. Install and configure Lenis for smooth scrolling: wrap the root layout in a
   Lenis provider/hook so scroll is smooth site-wide, but make sure it doesn't
   break in-page anchor links or any data table's internal scroll (tables
   should scroll natively, not through Lenis).
3. Install Framer Motion. Set up a shared `motion.ts` (or similar) with a
   couple of reusable variants (fadeInUp, staggerChildren) so animations stay
   consistent across components instead of every component reinventing easing
   curves.
4. Set up a base design system: color tokens, spacing, and font choices in
   tailwind.config — keep it distinct and intentional, not default-shadcn-gray.
   This is a hackathon pitch product, it should look opinionated.
5. Do NOT build any page content yet — this phase is infrastructure only.

When done, update PROJECT_CONTEXT.md's Frontend Component Inventory section
with a header noting Lenis + Framer Motion are wired globally, and list the
design tokens chosen. Mark Phase F1 complete.
```

### Phase F2 — Install UI kit components (dashboard set)

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first. This is Phase F2,
frontend track, /frontend.

TASK: Pull in these specific components — use each library's own CLI (shadcn
CLI for the ones built on shadcn conventions) rather than copy-pasting by
hand, so we keep upstream update paths:
1. From Origin UI (originui.com): a data table component (for the webhook
   event log), a combobox/filter component (filter events by type/customer),
   and a nav sidebar component (for the dashboard shell).
2. From VibeUI (vibeui.dev): an accessible modal component (for "connect
   Stripe" / settings), and an animated button component.
3. From Skiper UI (skiper-ui.com): one scroll-reveal card component — this
   will house the live drift-alert card.
4. From Vengeance UI (vengenceui.com): the text morph/flip component — this
   will animate a badge from "OK" to "DRIFT DETECTED" when reconciliation
   flags an event.

After installing, list every component pulled, its source library, and which
dashboard feature it's earmarked for.

When done, update PROJECT_CONTEXT.md's Frontend Component Inventory table
with: component name | source library | used in (feature). Mark Phase F2
complete.
```

### Phase F3 — Dashboard pages (data wired to backend)

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first, especially API
Contracts (GET /api/events, GET /api/subscriptions, GET
/api/reconciliation/latest) and Frontend Component Inventory from Phase F2.
This is Phase F3, frontend track, /frontend.

TASK: Build these dashboard pages, wiring real data from the backend
endpoints (use fetch/SWR/React Query, your choice, but be consistent):
1. `/dashboard` — overview: acknowledgment rate vs drift rate summary cards,
   $ at risk headline number, using Framer Motion for the number's count-up
   animation on load.
2. `/dashboard/events` — the event log table (Origin UI data table), each row
   showing event type, timestamp, acknowledged status, and the
   OK/DRIFT-DETECTED badge (Vengeance UI text morph) that animates when a row
   updates after a reconciliation run.
3. `/dashboard/customers` — subscription list per customer, at-risk customers
   highlighted.
4. The live drift-alert card (Skiper UI scroll-reveal) that appears at the top
   of `/dashboard/events` the moment a new drift is detected — this is the
   component to have on screen during the "trigger the bug live" demo moment.
5. Poll GET /api/reconciliation/latest every 5-10s (or on manual "Run
   reconciliation now" button that hits the GitHub Actions workflow_dispatch
   or the Django endpoint directly) so the badges update live without a page
   refresh.

When done, update PROJECT_CONTEXT.md's Frontend Component Inventory (mark
which pages consume which endpoints) and Current Build Status. Mark Phase F3
complete.
```

### Phase F4 — Landing/pitch page

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first. This is Phase F4,
frontend track, /frontend.

TASK: Build a `/` landing page for the hackathon pitch, separate from the
dashboard app:
1. Hero section (Magic UI animated text reveal) stating the problem: webhooks
   returning 200 OK while doing nothing, real dollar loss.
2. A bento grid (Magic UI) explaining: the problem / our fix / the SigNoz
   integration, three panels.
3. A marquee (Magic UI) listing the tech stack logos (Next.js, Redis, MongoDB,
   Django, SigNoz).
4. A CTA button (VibeUI animated button) linking to /dashboard.
5. Respect the Lenis smooth scroll and shared Framer Motion variants from
   Phase F1 — don't introduce a second competing scroll/animation system here.

When done, update PROJECT_CONTEXT.md's Frontend Component Inventory with the
landing page's components, and mark Phase F4 complete.
```

---

## 5. Integration & demo track (do last, both teammates together)

### Phase X1 — End-to-end wiring check

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first, including every
API Contract and every Service & Port entry. This is Phase X1, integration.

TASK: Do a full walkthrough and report back, don't fix anything yet unless I
confirm:
1. Confirm webhook-service, MongoDB, Redis, reconciliation, SigNoz (via
   Foundry), and frontend all start cleanly from the documented commands in
   README.md and /infra/SIGNOZ_SETUP.md.
2. Confirm the OTEL_EXPORTER_OTLP_ENDPOINT env vars in both backend services
   actually match SigNoz's exposed collector port.
3. Confirm CORS/API base URLs in frontend match the actual running ports of
   webhook-service and reconciliation.
4. List anything in PROJECT_CONTEXT.md that's now stale vs. what's actually in
   the code (ports that changed, endpoints that were renamed, etc).

Report findings as a checklist. Wait for my go-ahead before fixing anything.
```

### Phase X2 — Signed test payload generator + demo script

```
CONTEXT: Refer to PROJECT_CONTEXT.md — read it fully first. This is Phase X2,
integration/demo prep.

TASK:
1. Build a small CLI script (Node, in /webhook-service/scripts) that generates
   signed test Stripe-style payloads (invoice.payment_failed,
   invoice.payment_succeeded, customer.subscription.updated at minimum) and
   POSTs them to /webhooks/stripe, matching the HMAC signing scheme built in
   Phase B1.
2. Add a `--drift` flag that sends an event while SIMULATE_DRIFT_BUG is
   effectively on for that specific event (or toggles the service env var),
   so we can trigger the bug on demand during the live demo.
3. Write DEMO_SCRIPT.md at the repo root: numbered steps for the live demo —
   start services, open dashboard, open SigNoz UI, run 4-5 normal events, run
   1 drift event, show the badge flip on the dashboard, show the SigNoz trace
   with drift_detected=true, show the alert firing.

When done, update PROJECT_CONTEXT.md's Current Build Status marking the
project demo-ready, and list DEMO_SCRIPT.md under Architecture Overview as
the canonical run-of-show.
```

---

## 6. Fallback prompt (use anytime Antigravity seems to drift off-context)

```
Stop. Before continuing, read PROJECT_CONTEXT.md in the repo root in full —
every section, not a summary. Our architecture is fixed (Next.js + Express +
Redis + MongoDB + Django reconciliation + SigNoz via Foundry) and is not to be
changed without me explicitly asking. Once you've re-read it, restate in one
sentence what you now understand the current build status to be, then
continue with: [describe the specific next task].
```
