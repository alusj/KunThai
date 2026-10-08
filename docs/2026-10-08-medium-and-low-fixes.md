# Medium and low-priority fixes (2026-10-08)

## SQL to run in Supabase

Run these after the earlier 2026-10-07 files, in this order. Each one is
safe to run twice.

1. `supabase/migrations/20261008120000_urmall_promotion_pricing_fixes.sql`
   - **Boost duration:** matches what the seller is shown
     (10 credits = 2.5 days).
   - **Admins' boosts:** admins with product access can start boosts, paid
     from their own credits.
   - **Live boosts:** cannot be retargeted for free.
   - **Expired boosts:** their flags are cleared.
   - **Order totals:** checked on the server for product and cart orders.
   - **Notifications:** credit-purchase notifications are never doubled.
   - **Renewal job:** one failing subscription no longer undoes the others;
     a withdrawn plan never leaves a paid plan without an end date.
2. `supabase/migrations/20261008130000_urride_operator_fixes.sql`
   - **Plate check:** one plate is registered once, across solo and company
     fleets.
3. `supabase/migrations/20261008140000_urride_company_fixes.sql`
   - **Invites:** expire after 30 days.
   - **Removing an operator:** withdraws all their invites and clears their
     vehicles.
   - **Deleted rentals:** no longer use a plan slot.
   - **Fleet deletion:** cleans up the vehicle record.
   - **Owner:** cannot be invited as an operator.
   - **Rentals:** requests can be confirmed while the vehicle is hidden;
     expired requests no longer block deletion; "reserved / rented out"
     status shows; the list is paged.
   - **Reviews:** a review-eligibility check.

Tests (disposable databases):

- `supabase/tests/urmall_promotion_pricing_fixes.sql`
- `supabase/tests/urride_operator_fixes.sql`
- `supabase/tests/urride_company_fixes.sql`

## App changes

### UrMall seller dashboard

- **Profile edits:** the dashboard, header and switcher refresh after an
  edit, and a changed address clears the old map pin.
- **Country and phone:** the country is chosen from a list in store
  settings, and phone and WhatsApp numbers are checked.
- **Restaurant, hotel and property businesses:** no "add your first
  product" alert; retail-only rules no longer block settings.
- **Loading errors:** failed loads show "couldn't load" with Retry instead
  of an endless skeleton.
- **Permissions:** Seller Board follows each admin's permissions, and
  admins never briefly get owner rights.
- **Sign-out:** seller data and drafts are cleared on sign-out and when the
  account changes.
- **Overview:**
  - Open/closed comes from opening hours.
  - The rating and review count are real.
  - Today's revenue counts orders completed today.
- **Orders:** counts and revenue refresh after an order action, and amounts
  show in the order's currency.
- **Confirmations:** removing an admin asks first.
- **Seller search:** removed (it was fake).
- **Small fixes:**
  - The alerts bell explains when it can't open.
  - Activity buttons handle a deleted product.
  - "Vendor" and verification statuses are translated.
- **Activity and live updates:** dismissed activity stays dismissed, and
  header live updates follow the active business.
- **Back gesture:** works inside menu sub-pages.

### UrMall promotions and pricing

- **Promote state:** the "Promote" option reflects whether a boost is
  live.
- **Bulk prices:** use the lower of the tier price and the discount.
- **Drafts:** a restored draft asks again for lost files.
- **Card amounts:** limited to 2 decimals.
- **Auto-renew:** changing plan keeps the current setting.
- **Plan limits:** limit errors show readable text.

### UrRide operators

- **Company mode:** shows no solo trips or earnings.
- **Editing a solo fleet:**
  - No longer takes a company vehicle offline.
  - Keeps Trip controls.
  - Keeps visibility.
- **Company invites:** a new operator can accept one; skipped documents
  show correctly.
- **Duplicate plates:** blocked.
- **Menu:** "Trip controls" opens the controls; "Schedule" is removed.
- **Dashboard figures:**
  - Reviews show the true count and average.
  - Today's earnings count trips completed today.
- **Small fixes:**
  - The availability toggle no longer jumps back.
  - Back after choosing Solo or Company works.
  - The verification badge refreshes.
  - Photo fields accept images only.

### UrRide company and rentals

- **Invites:** expire after 30 days, and removing an operator clears
  everything they had.
- **Plan counts:** deleted rentals stop counting; "operator spaces used"
  counts only active invites.
- **Fleet deletion:** a deleted fleet no longer breaks the operator's
  dashboard ("No vehicle assigned").
- **Access:**
  - Only the owner can open the company editor.
  - Suspended admins lose management access.
- **Switching company:** shows the right rentals.
- **Rentals:**
  - Requests can be confirmed while the vehicle is hidden.
  - Requests whose pickup time passed expire.
  - "Reserved / rented out" status shows.
  - The rental list is paged.
  - Reviews only show when allowed.
  - Empty states are explained.
  - Already-uploaded photos are kept when a later one fails.
- **Listings:** the owner cannot invite themselves; operators are no longer
  listed twice; Fleets and Rentals are counted separately; the Rentals tab
  label is translated.
- **Settings:** a notification setting that fails to save reverts.
- **Saved operators:** the badge count matches the list; buttons show the
  saved state; re-saving keeps the name.

## Behaviour choices worth knowing

- **Suspending** an operator takes their vehicles offline but keeps their
  assignments, so restoring them is one step. **Removing** clears
  everything.
- **Deleting a fleet whose vehicle has trip history** keeps that vehicle
  record (offline and hidden) for the history.
- **Changing a fleet's service category** to one that adds a capability
  turns that capability on.
- **Meal, room and property orders** have no line items, so their totals
  are not yet checked on the server.

## Not bugs (features not built yet)

- **Payments menu:** seller payouts are not built yet, so the menu shows
  information pages only.
- **Seller reviews / reputation:** the screen exists but is not linked
  from any menu.
