# KunThai Churn Intelligence — plan

Status: decisions agreed 6 Nov 2026 (see §6) · nothing built yet · scope: **global** (every country in `kunthai_countries`)

Reference: the Orange Intelligence dashboard (omasta.vercel.app). It has headline KPIs, a 60-day churn rule, risk segments, churn signals, a district map, business-area pages and next best actions. KunThai keeps that shape but changes three things:

1. **Real data.** Scores come from what users actually do in KunThai. There is no synthetic dataset.
2. **Rules first, then a model.** Start with clear rules and scores that can be explained. Add a trained model only after 3+ months of real labelled outcomes.
3. **Connected actions.** Every recommendation can launch a real campaign through `admin_notification_campaigns` → `push_outbox`, and the dashboard measures who came back.

---

## 1. Definitions (to agree before any SQL)

| Term | Meaning |
|---|---|
| **Active day** | A day with at least one meaningful action (see §2). Opening a product counts as activity for **every** product, Explore, UrMall and UrRide included. |
| **Tenure** | Days since the first active day. Users with tenure < 30 days are scored as *New*, not churned. |
| **Churned** | No meaningful action in that product for **N days**, where N is set per product (below). |
| **At risk** | Still active, but the risk score is ≥ 60 out of 100. |
| **Revenue at risk** | Average monthly spend over the last 90 days (orders, bookings, subscriptions, credits), counted for at-risk and churned users. Always shown **in each country's own currency**. Amounts are never converted or added across currencies; the global view lists one total per currency. |
| **Recovered** | A churned or at-risk user who becomes active again within 30 days of a retention action. |

### Churn rule per product (proposed N)

| Product | Who | Meaningful action | Churn after |
|---|---|---|---|
| Explore | Every user | Explore open, post, comment, like, follow, message, Space joined | 30 days |
| Swip | Has opened Swip or uploaded a Swip | Swip open, Swip upload, like or comment on a Swip (`feed_scope = 'swip'`) | 30 days |
| UrMall buyer | Has placed ≥ 1 order | UrMall open, order, cart add, message to seller, review | 60 days |
| UrMall seller | Owns or admins a business | UrMall open, product or listing update, reply to customer, order handled | 30 days |
| UrRide passenger | Has booked ≥ 1 trip | UrRide open, trip, broadcast booking, rental, parcel | 60 days |
| UrRide operator | Operator or company member | UrRide open, goes online (location ping), accepts a trip | 14 days |

Each product keeps its own window. The windows are stored in a settings table (`churn_product_settings`), not hard-coded, so an admin with settings access can tune them without a migration.

Because app opens count as activity, the dashboard also shows **"opens only"**: users who still open a product but have stopped transacting. This is a strong early warning, worth +20 risk points (see §3).
| Business plan | Has a `kunthai_business_subscriptions` row | Renewal or payment | Lapsed past grace period |
| Credits | Has a `visibility_credit_wallets` balance | Spend, purchase or transfer | 60 days with an unused balance |

**Overall KunThai churn:** churned in every product the user has ever used.

---

## 2. Data layer

There is no single "last active" record per user today. `last_active_at` exists only on operator, fleet and admin tables. So the first step is:

### 2.1 `churn_activity_daily` (new table)
One row per user × product × day: `user_id, product, day, action_count, spend_minor, currency`.
Filled by a nightly `pg_cron` job that aggregates the existing tables:

| Product | Source tables |
|---|---|
| Explore | `explore_posts`, `explore_post_comments`, `explore_follows`, `explore_messages`, `explore_space_members`, `explore_ad_events` |
| UrMall | `marketplace_orders`, `marketplace_cart_items`, `marketplace_customer_messages`, `marketplace_reviews`, `marketplace_products`, `marketplace_vertical_bookings`, `marketplace_buyer_signals` |
| UrRide | `transport_trips`, `transport_broadcast_bookings`, `transport_rental_reservations`, `transport_parcel_handovers`, operator location pings |
| Money | `kunthai_business_subscription_events`, `visibility_credit_transactions`, `visibility_credit_purchases` |

App opens: add a light `touch_product_open(product)` RPC that the app calls at most once per day, per user, per product (Explore, UrMall, UrRide, and the operator and seller sides). Opens are stored as their own `action_type = 'open'` so we can tell "opens only" apart from real transactions. This is the only new client code in the data layer.

### 2.2 `churn_user_features` (rebuilt nightly)
One row per user × product with: days since last active, tenure, active days in the last 7/30/90 days, the trend (last 30 vs the 30 before), spend in the last 30 vs prior 30, order and booking counts, support tickets and reports, notification opt-out, push token present, country and region (`kunthai_account_regions`).

### 2.3 `churn_scores` (rebuilt nightly, history kept)
`user_id, product, scored_on, status (new|active|at_risk|churned), score 0–100, segment, top_signals jsonb, revenue_at_risk, recommended_action`.
History lets us show trends and later train a model on real outcomes.

### 2.4 Privacy and access
- Users who opted out in `explore_recommendation_privacy` or the privacy settings, and accounts that are deleted or held under `platform_account_controls`, are **not scored**.
- **Product assignment:** each admin can be given churn access to all products or only one or two (for example, only UrRide operators, or UrMall buyers and sellers). Add `churn_product_scopes text[] default '{all}'` to `admin_assignments`, beside the existing `sector_scopes` and `region_scopes`. Every churn RPC filters by both product scope and region scope, so a UrRide admin in one country sees only that slice, and screens and nav items for unassigned products are hidden.
- Admins see only aggregates unless they hold the new `churn.users.view` permission. User-level rows go through an RPC that writes to `admin_audit_logs`.
- Row-level security: no client access to the churn tables. Reads go only through security-definer RPCs that check `admin_role_permissions`.

---

## 3. Risk score (v1, rule-based)

Points per product, capped at 100. Every signal stores a plain-language reason that is shown to admins.

| Signal | Points |
|---|---|
| Days inactive > 50% of the churn window | +30 |
| Opens only: still opening, no transaction for > 50% of the window (UrMall and UrRide) | +20 |
| Activity down ≥ 60% (last 30 vs prior 30 days) | +25 |
| Spend down ≥ 50% | +15 |
| Stopped a habit (for example, weekly orders stopped) | +15 |
| Open complaint, dispute or report against them in the last 30 days | +10 |
| Push disabled or no device token | +5 |
| Bad experience: cancelled order or trip, low review given | +10 |
| Seller: unanswered customer messages > 48h | +15 |
| Business plan: in grace period (a renewal was missed) | +60 |
| Business plan: auto-renew off and ending within 14 days | +40 |
| Business plan: plan change scheduled | +20 |

Business plans skip the activity signals; their churn is a lapsed plan (expired, cancelled or back to free). Complaints = cases from reports, support and safety queues (not verification) that the user raised or is the subject of.

Segments, as on the Orange dashboard: **Low (0–39) · Medium (40–59) · High, still active (60–100) · Churned · New**.

Like Orange, the dashboard shows **signal lift** ("users with a usage collapse churn 12× more"), labelled *associations, not causes*.

**v2 (after ~3 months of score history):** a gradient-boosted model trained on `churn_scores` outcomes, run as a scheduled job (outside Postgres). Its scores sit beside the rules, and it is promoted only if it beats the rules on precision for the top 10% of users.

---

## 4. Admin console screens

New sidebar item **Churn intelligence** under *Operations*, with permission `churn.view`. It follows the sector filter that already exists (All / Explore / UrMall / Transport).

1. **Overview:** total users, churned, at risk, revenue at risk (one figure per currency in the global view), with the change since last week. Bars for days since last activity. A customer health donut. A **world, then country, then region** map from `kunthai_countries` and `kunthai_country_regions`, where clicking drills down one level.
2. **Growth and leaders** (the positive side of churn):
   - **Leading countries:** ranked by active users, new users, growth against last period, churn rate and spend (each in its own currency). Tap a country to see its leading regions.
   - **Leading sectors:** Explore, Swip, UrMall buyers and sellers, UrRide passengers and operators, Business plans, Credits. Ranked by daily/weekly/monthly active users (DAU/WAU/MAU), stickiness (DAU ÷ MAU), growth and churn.
   - **Most active users:** the top users per sector and per country by active days and actions in the last 7/30 days, plus *rising* users (biggest jump against the prior period). Shown with names only for `churn.users.view`, otherwise as counts.
   - **Cross-sector use:** how many users are in 1, 2 or 3+ sectors, and which pairs go together (for example Swip + UrMall). Multi-sector users churn less, so this guides cross-promotion.
   - **Cohorts:** retention by signup month, for each sector.
   - **Time patterns:** which days are busiest in each country.
3. **Executive insights:** the same five questions as Orange. How many are at risk? Which segments? Which signals? Who to prioritise? What should each team do?
4. **Product pages:** Explore, Swip, UrMall buyers, UrMall sellers, UrRide passengers, UrRide operators, Business plans, Credits. Each has its own rule, a funnel and the top signals.
5. **Watchlist:** a table of high-risk users with their score, reasons, spend, region and last action. Filters and CSV export (audit-logged). Clicking a user opens the existing Users drawer.
6. **Campaigns:** pick a segment, then a suggested action, then a message template (all languages from i18n). This creates an `admin_notification_campaigns` row and sends through `push_outbox`. **No second-admin approval:** an admin with `churn.campaigns.send` can send to any segment within their product and region scope. Every send is recorded in `admin_audit_logs`, and the campaign stays visible in Results.
7. **Results:** for each campaign, the recovered rate against a **10% holdout** that gets nothing. This is the real proof that retention works, and the Orange version doesn't have it.

### Suggested actions (v1 library)

| Segment | Action |
|---|---|
| Explore, fading creator | "Your followers miss you" push and a boost credit |
| UrMall buyer, stopped ordering | Reminder about saved or cart items, or a store promotion (`marketplace_promotions`) |
| UrMall seller, inactive | Support check-in case, unanswered-message nudge |
| UrRide passenger, stopped booking | Saved places and a top-rated nearby operator reminder |
| UrRide operator, offline | Company manager alert and a demand-in-your-area push |
| Business plan near renewal | Renewal reminder and the price lock shown (`kunthai_business_plan_price_locks`) |
| Credits unused | "You have X credits", one-tap boost |

---

## 5. Build phases

| Phase | What | Done when |
|---|---|---|
| **1. Data** ✅ written | `20261106131000_churn_activity_layer.sql`: `churn_product_settings` (8 sectors), `churn_activity_daily` (with the account's country), `churn_spend_daily` (per currency, never converted), `touch_product_open()`, `churn_refresh_activity()`, nightly cron at 02:30 UTC, 90-day backfill. App calls in App.jsx (Explore, UrMall buyer or seller, UrRide), Swip.jsx and Transport.jsx (operator dashboards) | Dry run on live data, rolled back: every sector filled, about 95% of rows have a country |
| **2. Scores** ✅ written | `20261106140000_churn_scores.sql`: `churn_score_rules()` (pure, 22 cases in `supabase/tests/churn_score_rules.sql`), `churn_user_features` (also the "most active" figures: active days 7/14/30/90, actions, growth, spend), `churn_scores` (daily history), `churn_user_overall` view, `churn_score_users()` after the nightly refresh. Not scored: deactivated, suspended or banned accounts (the app has no analytics opt-out yet). Explore uses last sign-in and push-token refresh as a stand-in for browsing until opens are tracked. Sectors that count opens are marked `provisional` until open data covers a full window. Credits = users who bought or spent credits, not starter balances. Business plan revenue isn't counted yet | Dry run on live data: all tests pass; 41 users scored |
| **3. Overview, growth and watchlist** ✅ written | `20261106150000_churn_admin.sql`: `admin_assignments.churn_product_scopes`, permissions `churn.view` / `churn.users.view` (granted to super/chief admin, operations lead, sector managers; totals only for notification officer, analyst, auditor), `churn_admin_scope()` pairing sectors × products × countries per assignment, RPCs `admin_churn_access`, `admin_churn_overview`, `admin_churn_leaders`, `admin_churn_watchlist` (audit-logged), `admin_churn_list_access` / `admin_set_churn_product_scopes` (`team.manage`, audit-logged). Admin page **Churn intelligence** (Operations) with tabs Overview, Growth and leaders, Watchlist, Access; text in all 15 languages (`src/i18n/adminChurn.js`) | Dry run on live data as super admin and as a limited admin (UrMall sellers in SL only, watchlist refused); checked in the browser with admin preview data |
| **4. Product pages and map** ✅ applied | `20261106160000_churn_product_regions.sql`: `admin_churn_product_detail()` (rule, what counts as activity, engagement funnel, score bands, signal lift against a score day ≥ 14 days back, spend, top countries) and `admin_churn_regions()` (country → region → district from `kunthai_account_regions.region_path`). Pick a sector on the Overview to see its detail; the **Regions** tab shows heat tiles. KunThai regions have no boundary shapes, so this is a tile grid, not a geographic map | Every sector shows its own rule, funnel and signals; lift shows once 14 days of scores exist |
| **5. Campaigns and results** ✅ applied | `20261106161000_churn_campaigns.sql`: permission `churn.campaigns.send`, `churn_campaigns` + `churn_campaign_members`, `admin_churn_campaign_preview()`, `admin_churn_campaign_send()`, `admin_churn_campaigns()`. **Campaigns** tab: choose sector, audience, optional signal, message (15-language templates in `src/admin/churnCampaignTemplates.js`, editable per language), holdout (default 10%), check the audience, then send with a second click | First real campaign still to be sent by an admin; results build over its 30-day window |
| **6. Model (later)** | Train and compare against the rules | Only after ~3 months of history |

Migrations are applied by hand one file at a time, as usual (no `db push`).

### Campaign rules (Phase 5)

- **Sending:** each campaign is an ordinary `admin_notification_campaigns` row (category `marketing`, in-app + push, status completed), so the existing triggers send the push and respect each person's push and **marketing** opt-outs. It also shows in the Notifications analytics.
- **Language:** each person gets the message in the language of their account country (`kunthai_countries.locale`), otherwise English. Only French, Portuguese, German and Japanese countries currently map to a non-English locale.
- **Holdout:** a deterministic random 10% (0–50% allowed) gets nothing. Results compare *came back* (any open or action in that sector from the day after sending, for 30 days) between the messaged people and the holdout.
- **Skipped:** anyone messaged by any churn campaign in the last 7 days, and anyone (messaged or held back) still inside the 30-day window of a campaign for the same sector, so a holdout is never contaminated.
- **Limits:** at most 5,000 people per campaign; title 100, message 300 (push shows 180), button 40 characters. No second approval; every send is audit-logged (`churn.campaign.sent`).

---

## 6. Decisions (6 Nov 2026)

1. **Churn windows:** each product keeps its own window (§1), stored in a settings table so it can be tuned later. Each admin can be assigned all products or only one or two (`churn_product_scopes`, §2.4).
2. **Countries:** global from v1. Every country in `kunthai_countries`.
3. **Campaign approval:** no second admin needed. Sends are audit-logged.
4. **App opens:** count as activity for UrMall and UrRide too. "Opens only" is tracked as an early-warning signal.
5. **Currency:** revenue at risk is always in each country's own currency, never converted.
