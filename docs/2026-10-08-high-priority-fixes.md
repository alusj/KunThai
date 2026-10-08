# High-priority fixes (2026-10-08)

## SQL to run in Supabase (in this order, after the red-flag file)

1. `supabase/migrations/20261007170000_business_plan_fairness.sql`
   - **Plan upgrades.** Upgrading during a paid term keeps the term and its
     cadence; a yearly subscriber stays yearly. The seller pays only the
     difference for the time left.
   - **New terms.** A new term (for example monthly → yearly) starts now,
     with the unused time credited toward the new price.
   - **Early renewal.** Auto-renewing plans renew up to 75 minutes before
     they end, and the new term starts at the old end date. Paid UrMall
     businesses no longer drop to ten visible listings while the hourly job
     catches up.
2. `supabase/migrations/20261007180000_urride_fleet_management.sql`
   - **Fleet actions.** "Remove operator" and "Delete fleet" are one checked
     action for the owner and fleet managers, so they work for managers
     instead of showing success while nothing changed.
   - **One operator per company fleet.** Nobody else can be invited to a
     fleet, or accept an older invite, while it has an accepted operator.

Tests (disposable databases):

- `supabase/tests/business_plan_fairness.sql`
- `supabase/tests/urride_fleet_management.sql`

## App changes

**UrMall**

- **Business switcher.** "Add another business" shows a skeleton while the
  account type and plan check load.
- **Product edits.**
  - Existing gallery photos are kept, shown and can be removed; new photos
    are added to them, up to six.
  - Paused and out-of-stock products can be resumed even when the plan is
    full, because they already count toward the limit.
  - Setting stock above zero in the edit form puts an out-of-stock product
    back on sale.
  - An edit that saved nothing is reported instead of "Product updated".
- **Meal and property edits.** Adding a photo or video keeps the cover,
  the other photos and the video, and no longer fails with
  "Add one cover image".
- **Switching business.**
  - Every seller screen's cache is emptied and the workspace is rebuilt for
    the new business.
  - A reply in a chat that belongs to another of your businesses is
    stopped with a clear message.
- **Order list.** Every pending or shipped order is listed, plus the 30
  newest finished ones; before, only the newest 20 orders were listed.
- **Registration.** A registration that fails after the business row was
  created removes it again, so submitting once more works.

**UrRide**

- **Fleet actions.** Delete fleet and Remove operator use the checked
  database action. Without the migration they report when nothing was
  changed.
- **Company mode.** Fleet editing is hidden while working in company mode,
  and the save refuses it. It used to overwrite the operator's own solo
  fleet. Saving an edit keeps the Solo/Company switch.
- **Solo registration.**
  - The plate check runs before the operator profile is written.
  - A profile left without a fleet by a failed submit reopens the
    registration wizard instead of an empty dashboard.
