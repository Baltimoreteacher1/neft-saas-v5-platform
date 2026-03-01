# Neft SaaS Level v5 — Cloudflare Pages + Workers + D1 (No-Bundle, Production-Safe)

This repo is a **SaaS-ready** upgrade path for your education games:
- **Cloudflare Pages**: static web app (fast, global)
- **Cloudflare Worker**: JSON API (sessions, attempts, analytics)
- **Cloudflare D1**: SQL storage (students, sessions, attempts, mastery)
- **Optional Turnstile**: bot protection for public endpoints

## 0) What you get
- Secure-ish **teacher class codes** + **student PIN** login (no email required)
- Session + attempt logging (per question)
- Mastery aggregation by skill
- Export endpoints for teacher dashboards
- Offline-first client (queues events and flushes)

## 1) Deploy order (exact)
### A) Create D1 database
1. Install Wrangler locally OR use Cloudflare dashboard.
2. Create a D1 DB named: `neft_saas_v5`

### B) Deploy the Worker API
1. In Cloudflare dashboard: Workers & Pages → Create Worker
2. Upload `api/worker.mjs` and bind D1 as `DB`
3. Set Worker environment variables (Workers → Settings → Variables):
   - `APP_ENV=prod`
   - `JWT_SECRET=<random-long-secret>` (32+ chars)
   - `TURNSTILE_SECRET=` (optional)
4. Add routes if needed (or just use the Worker URL)

### C) Run D1 migrations
Run (local wrangler recommended):
- `wrangler d1 migrations apply neft_saas_v5 --remote`

Migration files are in `api/migrations`.

### D) Deploy Pages
1. Pages → Create project → connect GitHub repo
2. Build settings:
   - Framework: None
   - Output directory: `web/public`
3. Set Pages env var (Pages → Settings → Environment variables):
   - `API_BASE=https://<your-worker-subdomain>.workers.dev`

## 2) Local dev (optional)
- Worker: `wrangler dev api/worker.mjs`
- Web: serve `web/public` with any static server

## 3) Data model (high level)
- teachers (class code)
- students (student pin within class)
- sessions (start/end)
- attempts (question events)
- mastery snapshots (computed on demand)

## 4) Security notes
This is **classroom-sane** security:
- Avoids PII by default
- Uses signed tokens for session auth
For full district-grade auth, add SSO (Google/Microsoft) later.

---
© NeftOS / HELIX — SaaS v5 scaffold
