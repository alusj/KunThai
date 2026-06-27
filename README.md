# KunThai Web

KunThai Web is a Vite/React app with three main surfaces:

- Explore social feed, Swip video, messages, profiles, notifications, and safety flows.
- UrMall marketplace for buyers and seller businesses.
- Transport booking, operator, company, live-trip, and Area View flows.

The backend for this repo is Supabase plus Vercel serverless functions in `api/`.

## Setup

```bash
npm install
npm run dev
```

The local Vite server defaults to `http://localhost:3000`.

## Required Environment

Create `.env.local` with:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MAPTILER_KEY=
VITE_MAPTILER_STYLE_ID=streets-v2
VITE_CONTENT_MODERATION_ENABLED=false
```

Serverless functions also use these deployment-only variables:

```bash
OPENROUTESERVICE_KEY=
KUNTHAI_CONTENT_MODERATION_ENABLED=false
SIGHTENGINE_USER=
SIGHTENGINE_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Do not expose `OPENROUTESERVICE_KEY`, `SIGHTENGINE_USER`, `SIGHTENGINE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or `CRON_SECRET` with a `VITE_` prefix.

## Validation

```bash
npm run lint
npm run build
npm run check
```

`npm test` currently aliases `npm run check`; add focused unit/integration tests as business-critical flows stabilize.

## Supabase

Version all reviewed migration SQL in `supabase/migrations/`. Local linked-project state and legacy schema snapshots remain ignored.

Apply migrations with:

```bash
supabase db push
```

## Administration

The protected admin workspace is available at `/admin`. It provides:

- Chief Admin and Super Admin access across Explore, UrMall, and Transport.
- Scoped officer assignments by role, sector, region, and authority level.
- Unified report, verification, support, finance, and safety cases.
- Case assignment, decisions, notes, approvals, SLA tracking, and immutable audit history.
- Notification drafting, approval, publication, and delivery into the user notification feed.
- Admin team management, operational analytics, and audited feature controls.

Apply `20260627120000_kunthai_admin_foundation.sql` before opening the workspace. The migration does not appoint an administrator automatically. Create the intended KunThai account first, find its UUID in the Supabase SQL editor, and bootstrap it from the trusted SQL session:

```sql
select id, email
from auth.users
where lower(email) = lower('owner@example.com');

select public.bootstrap_kunthai_chief_admin(
  '00000000-0000-0000-0000-000000000000'::uuid,
  true
);
```

The second argument appoints a `super_admin` when `true` and a `chief_admin` when `false`. Super Admins may appoint additional Chief Admins. Chief Admins can manage lower-ranked operational roles and have full panel access, but cannot appoint Super Admins.

All production administrators must complete TOTP multi-factor authentication. The service-role key must never be exposed to the browser.

Scheduled notification delivery calls `/api/admin-publish-scheduled` every ten minutes. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` in the server deployment environment.

During local development only, `/admin?preview=chief` opens a non-production Chief Admin preview with sample operational data. Production builds remove this preview path.

## Deployment

The Vercel API functions are:

- `api/route-directions.js` for OpenRouteService routing.
- `api/moderate-post.js` for content moderation.

`vercel.json` increases moderation function duration for media review.

## Known Product Dependencies

UrMall payment collection, settlement, withdrawals, and bank onboarding still need a real payment provider decision before they can become money-moving flows. Until then, the UI should keep payment and payout history disabled or explicitly marked as unavailable.
