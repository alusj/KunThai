# UrMall plan limits (2026-10-10)

UrMall plans only. UrRide plans, prices and limits are unchanged.

| Plan | Active products, meals or properties | Restaurant meal days | Price | Admins |
| --- | --- | --- | --- | --- |
| Free | 5 | up to 5 days a week | free | 0 |
| Pro | up to 30 | all 7 days | 30 credits / 30 days, 300 / year (unchanged) | 1 |
| Premium | unlimited | all 7 days | 100 credits / 30 days, 1000 / year (was 75 / 750) | 5 |

The limit is per business and covers every business kind: Shop and Vendor
products (everything that is not a draft or pending review), restaurant meals
(shown or hidden) and published Real Estate properties. Business-type limits
(Free 1, Pro 2, Premium 4) are unchanged.

## SQL to run in Supabase (once)

Run `supabase/migrations/20261010100000_urmall_plan_limits_2026.sql` in the SQL
editor after `20261009150000_native_push_tokens.sql`. It is safe to run more than
once and changes no listing.

- Plan rows: `product_limit` 5 / 30 / null, new column `meal_day_limit`
  (Free 5, others null = all 7 days), Premium `credit_cost` 100 and
  `yearly_credit_cost` 1000, and feature lines that describe the new limits.
- Product capacity: the three guards (`marketplace_products`,
  `marketplace_restaurant_menu_items`, `marketplace_property_listings`) are
  re-created on `kunthai_guard_urmall_inventory_capacity`, which counts all
  kinds together through `kunthai_urmall_retention_inventory`. Vendor
  products, meals and properties were already guarded since 20260905130000;
  this only makes sure every installation has those triggers. Legacy hotel
  rooms (no new hotel businesses can be created) are not counted, as before.
- Meal days: new trigger `kunthai_guard_urmall_meal_days`. A meal's days are
  "every day" (7), else its `available_days`, else the legacy `day_of_week`.
  The restaurant's days are the union over all its meals, shown or hidden.
  On a plan with `meal_day_limit` a new or changed meal may cover at most 5
  days, and the restaurant at most 5 days in total. Refusals use the usual
  `KUNTHAI_PLAN_LIMIT|urmall|meal_days|<count>|<limit>|<plan>` message with an
  English detail, so the app shows its plan-limit notice.
- Premium price: periods already running keep the price paid
  (`kunthai_business_plan_price_locks`, used by `change_kunthai_business_plan`
  to value unused time). Renewals read the catalogue, so the new price applies
  from the next renewal. Each running Premium subscriber gets one notice.
- Admin workspace: `admin_get_user_workspace_v2` now adds `plan_listing_count`
  (the number the guard counts) to UrMall businesses and subscription usage.
  The previous function is kept as
  `admin_get_user_workspace_v2_before_plan_limits_2026` and still does every
  permission check.

## Existing sellers

- Nothing is deleted, hidden or unpublished. A Free business with more than 5
  listings keeps them all. It can edit them and change a product between
  active and paused (both hold a place), but cannot add or publish another
  listing until it is below 5 or upgrades. As before, publishing a draft
  product or an unpublished property counts as adding one. The plans screen
  says so.
- A restaurant already serving meals on 6 or 7 days keeps those meals and days
  (hiding and showing a meal, or saving it unchanged, always works). On Free it
  cannot add a day it does not already use, and a new or changed meal may cover
  at most 5 days. A meal can always keep or reduce its own days.
- Expiry/retention is unchanged: it does not read `product_limit`. Only when a
  paid plan expires does the business show its ten retained listings, exactly
  as before (it is not reduced to five). Changing that number would be a
  separate owner decision.
- Premium subscribers keep their current period at 75 (or 750 a year); the
  renewal charges 100 (or 1000). Pro subscribers see no change.

Test: `supabase/tests/urmall_plan_limits_2026.sql` (disposable
`urmall_plan_limits_test` database; loads the real retention and fairness
migrations and applies this one three times).

## App changes

- Fallback plan catalogue, plan cards and the registration plan explainer show
  the new numbers and prices; plan feature lines are translated (new
  `urmallPlans2026` namespace, all 15 languages).
- The plans screen explains when a business is above its limit and that its
  listings stay published.
- Restaurant meal form on Free: a new meal starts on the selected day instead
  of "every day"; "Every day" and a 6th or 7th day are refused with a
  translated explanation and a "See plans" button that opens the plans screen;
  the form shows "Meals on N of 7 days". The same notice appears when the
  server refuses a meal (day or listing limit).
- Admin user workspace usage bars count the listings that use the plan for
  every business kind.
