# Store privacy forms — answers to click through (2026-11-01)

Worked out from the code on 2026-11-01 (KAI consent build). Apple's App Privacy and Google's Data safety
forms only exist inside App Store Connect and Play Console, so they are filled in there by hand. If a
feature changes what it stores, update this file and both forms.

Ground rules used below:

- **No tracking.** No ad SDK, no IDFA/AAID; Facebook advertiser-ID collection and auto app events are
  off (`Info.plist`). Answer "No" to Apple's tracking question.
- **Service providers are not "sharing".** Google Gemini (KAI), Supabase (database/storage), Sightengine
  (photo/video moderation), Monime, Apple and Google Play process data *for* KunThai. Play's definition
  excludes them from "shared"; Apple does not ask about them separately.
- **What other members see because the user posted it** (profile, posts, listings, messages) is the
  app's function, not sharing.
- **Not collected:** contacts (the contact picker sends numbers once to match and never stores them, and
  only browsers offer it), health, browsing history, crash/diagnostics (no crash SDK), payment card
  numbers (Apple / Google Play / Monime hold those).

---

## Apple — App Store Connect → App Privacy

1. "Do you or your third-party partners collect data from this app?" → **Yes**
2. Tick these data types. For every one: **Linked to the user: Yes**, **Used for tracking: No**.

| Category | Data type | Purposes to tick | Where in KunThai |
|---|---|---|---|
| Contact Info | Name | App Functionality | Profile, business and operator registration |
| Contact Info | Email Address | App Functionality | Sign-in, account, receipts |
| Contact Info | Phone Number | App Functionality | Sign-in/OTP, UrRide, orders, mobile money |
| Contact Info | Physical Address | App Functionality | Delivery address book, business address |
| Financial Info | Other Financial Info | App Functionality | Seller payout bank / KunThai Money details |
| Location | Precise Location | App Functionality | UrRide pickups, operator Active mode, live share, maps |
| Location | Coarse Location | App Functionality, Third-Party Advertising | Region/country; targeting of seller promotions |
| User Content | Emails or Text Messages | App Functionality | In-app chats |
| User Content | Photos or Videos | App Functionality | Posts, Swips, listings, profile, verification selfies |
| User Content | Audio Data | App Functionality | Voice notes, video sound |
| User Content | Customer Support | App Functionality | Help requests, reports, appeals |
| User Content | Other User Content | App Functionality | Posts, comments, listings, reviews, KAI requests |
| Identifiers | User ID | App Functionality | KunThai account / public ID |
| Identifiers | Device ID | App Functionality | Push notification tokens |
| Purchases | Purchase History | App Functionality | Visibility Credit purchases, marketplace orders, rides |
| Usage Data | Product Interaction | App Functionality, Analytics | Post/Swip views and reactions, post analytics |
| Usage Data | Advertising Data | Third-Party Advertising | Impressions of seller promotions |
| Other Data | Other Data Types | App Functionality | Date of birth; ID/vehicle/business documents for verification |

Leave everything else unticked (Health & Fitness, Payment Info, Credit Info, Sensitive Info, Contacts,
Browsing History, Search History, Diagnostics).

> Coarse Location and Advertising Data are ticked for **Third-Party Advertising** because sellers'
> promotions are shown to members by region. If you'd rather call them KunThai's own promotions, use
> "Developer's Advertising or Marketing" instead. Either is fine; don't leave them out.

---

## Google — Play Console → App content → Data safety

**Overview questions**

- Does your app collect or share any of the required user data types? → **Yes**
- Is all of the user data collected by your app encrypted in transit? → **Yes**
- Do you provide a way for users to request that their data is deleted? → **Yes**
  - Delete-account URL: `https://kunthai.app/policy-center/account-deletion`

**Data types**: for every row, **Collected: Yes**, **Shared: No**, **Processed ephemerally: No**.

| Category | Data type | Required or optional | Purposes |
|---|---|---|---|
| Location | Approximate location | Optional | App functionality, Advertising or marketing |
| Location | Precise location | Optional | App functionality |
| Personal info | Name | Required | App functionality, Account management |
| Personal info | Email address | Required | App functionality, Account management |
| Personal info | User IDs | Required | App functionality, Account management |
| Personal info | Address | Optional | App functionality |
| Personal info | Phone number | Required | App functionality, Account management, Fraud prevention, security, and compliance |
| Personal info | Other info (date of birth, ID documents) | Optional | App functionality, Fraud prevention, security, and compliance |
| Financial info | Purchase history | Optional | App functionality |
| Financial info | Other financial info (payout account) | Optional | App functionality |
| Messages | Other in-app messages | Optional | App functionality |
| Photos and videos | Photos | Optional | App functionality |
| Photos and videos | Videos | Optional | App functionality |
| Audio | Voice or sound recordings | Optional | App functionality |
| Files and docs | Files and docs (verification uploads) | Optional | App functionality, Fraud prevention, security, and compliance |
| App activity | App interactions | Optional | App functionality, Analytics, Advertising or marketing |
| App activity | Other user-generated content | Optional | App functionality |
| Device or other IDs | Device or other IDs (push tokens) | Optional | App functionality |

Leave out: Contacts, Health and fitness, Calendar, Web browsing, Installed apps, Emails, SMS/MMS,
App info and performance (no crash SDK), Credit info, User payment info.

**Same page, also required for the Android release:**

- App content → **Foreground service permissions** → declare `FOREGROUND_SERVICE_LOCATION`, use case
  "UrRide operators share their position with nearby passengers while Active; a notification is always
  shown". Attach a short video of going Active with the notification visible.
- No `ACCESS_BACKGROUND_LOCATION` is requested, so the separate background-location declaration does
  not apply.

---

## Data sent to an AI provider (both stores)

There is no separate "AI" box on either form. What KAI sends to Google Gemini (text, photos, the
screen being asked about) is covered by **Other User Content / Photos** above, and Gemini acts as
KunThai's service provider. The in-app consent card (asked once before the first KAI request, names
Google Gemini, links to the Privacy Policy's KAI section) is what Apple Guideline 5.1.2(i) checks. Say
so in the App Review notes:

> KAI, our in-app assistant, is powered by Google Gemini. Before anything is sent, the app asks once
> for permission, names Google Gemini, and links to the KAI section of our Privacy Policy. Nothing is
> sent if the user taps "Not now".
