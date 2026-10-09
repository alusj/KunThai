# KAI: business registration and running costs (2026-10-10)

## SQL to run in Supabase (once)

`supabase/migrations/20261010110000_kai_usage_controls.sql`:

- adds `ai_usage_events.cached_tokens` (how many input tokens Gemini served from its context cache);
- answers served from KunThai's response cache are logged with `cached = true` and no longer count
  toward a member's rate limits;
- adds `kunthai_ai_global_usage_snapshot()` (service role only) for the global daily cost ceiling.

Safe to run more than once. Until it runs, KAI keeps working: usage rows are written without
`cached_tokens`, and the global ceiling counts only the spend each server instance has seen itself.
Test: `supabase/tests/kai_usage_controls.sql`.

## 1. Business registration understands the business type

The four UrMall business types are `retail` (shop), `vendor` (supplier/wholesale), `restaurant` and
`property_agent` (real estate; the old `hotel` type is treated the same way).

- **Type first.** A new registration starts with a default type, which KAI does not treat as a choice.
  Until the person has picked the type (in the form, in the chat, or by moving past step 1), KAI is
  shown only the type and the general fields, and it asks for the type first. Plain answers work:
  "I sell food" means restaurant, "I rent houses" means real estate, "wholesale supplier" means vendor,
  "I have a shop" means retail (several languages are understood). When an answer fits two types
  ("I sell food wholesale"), KAI asks the person to confirm.
- **Only fields that exist for that type.**
  - Categories: retail shops and vendors only. KAI never asks for, suggests, checks or fills
    categories for a restaurant or a real estate agent.
  - Vendor type, sales model, selling unit, minimum order, lead time, service areas and quotations:
    vendors only.
  - Delivery and pickup: shops, vendors and restaurants (for restaurants these are "meal delivery"
    and "meal pickup"); never real estate.
  - Restaurants are asked about cuisine and signature meals (written into the description), opening
    days, opening hours, and meal delivery or pickup.
  - Real estate agents are asked for the agent or company name, the property types they handle and
    the areas they serve (both written into the description, since the form has no separate field
    for them), and their opening days and hours.
  - Opening days are now offered to KAI as well (they were already saved with the business).
- **Enforced in code, not only in the prompt.** One rules module
  (`src/Backend/services/ai/businessKindPolicy.js`) is used by:
  - the registration screen, which filters the fields it shows KAI and drops values that do not
    apply before the person sees them, and again when the form is filled;
  - the server, which receives the business type with each message and removes values for fields
    that do not apply from KAI's fill proposal before it reaches the browser.
- In the guided "fill this form for me" questions, the business type is applied as soon as it is
  answered, so the next questions are the ones for that type.

### What the registration form itself does (not changed here)

The form already hides the categories picker for restaurants and real estate and clears categories
when the type changes. Two things outside KAI are worth a follow-up by whoever owns those files:

- `sellerRegistrationService.js` saves `identity.categories` for any type. If a stale draft ever held
  categories for a restaurant or real estate business, they would be saved. Saving them only when
  `usesMarketplaceCategories(kind)` is true would close this.
- `ReviewSubmitStep.jsx` prints the categories line for every type (it is empty in normal use).

## 2. Running costs

All of KAI goes through the single `/api/ai` function (assistant chat, writing tasks, registration
help). No new serverless functions were added.

### What is in place now

- **Answer cache.** Writing and summary tasks with a fixed answer for a fixed input reuse a stored
  answer instead of paying Gemini again. The key is a SHA-256 hash of exactly what Gemini would
  receive (task, model, instructions and section, the prompt with its language, response format, any
  photo), with spacing differences ignored. Only the hash is used as the key; text is never logged.
  - Shared between all members (no personal data): listing helpers, review and discussion summaries,
    product explanations, search understanding, image matching.
  - Kept per person and for a shorter time (the input may be private): improve, rewrite, shorten,
    expand, grammar, translate and summarise text, Explore caption, hashtag, title and topic
    suggestions from an unpublished draft, and photo search.
  - Not cached: the assistant chat and anything about cases, orders, rides or messages.
  - The cache lives in the `ai_response_cache` table, so every server instance shares it, with a
    small in-memory copy per instance. Expired rows are deleted automatically.
  - Two identical requests arriving together (a double tap) share one Gemini call.
- **Prompt prefix reuse.** Instructions are ordered fixed text first and the section line last.
  Everything that changes per message (the older-chat summary, screen data, registration rules, the
  message) is sent in the person's turn. Gemini's automatic (implicit) context cache can then bill
  the long repeated part at a discount. The number of cached tokens is recorded in
  `ai_usage_events.cached_tokens`, and the cost estimate charges them at the discounted rate.
- **Explicit context cache (optional, off by default).** When `AI_CONTEXT_CACHE_ENABLED=true`, the
  assistant's fixed rules and tool list are stored once in a Gemini cache (`caches.create`) and
  reused by every server instance until it expires. If Gemini refuses to create it (unsupported
  model, prefix too small) or later rejects it, KAI answers without it and waits before trying again.
  This only pays off when the assistant is busy: an explicit cache is billed for storage every hour
  it exists, while the implicit cache costs nothing extra.
- **Shorter conversations.** Each message sends the last 6 turns. KAI's own earlier replies are cut
  to 600 characters. Older questions are folded into one line of at most 400 characters ("Earlier in
  this chat the person asked about ..."), and older answers are never resent. The message, the
  screen data, each tool result, the reply length and the number of tool rounds all have limits.
- **Limits on every request.**
  - Per member, per minute, hour and day, plus a daily cost limit. These were already enforced on
    every request; when the usage table cannot be reached, the in-memory fallback now applies the
    hour and day limits too.
  - New: a **global 24-hour cost ceiling** for all members together. Once it is reached, members see
    "KAI is resting for a while. Please try again later." Answers already in the cache are still
    served.
  - New: a per-IP limit, checked before sign-in is verified. Every KAI call already requires a
    signed-in member (guests are refused), so this only stops floods of bad tokens. The IP address is
    never stored.
  - Usage is now logged before the model's answer is checked, so an answer that cannot be used still
    counts toward the limits.
- **In the app.** Identical requests share one network call, even after Stop followed by the same
  request again, because Gemini keeps generating, and billing, after the app stops waiting. The
  chat ignores a second send while a reply is still loading. Limit messages appear in the person's
  language (all 15 app languages).

### Expected savings (estimates; check `ai_usage_events` after a week)

- Long assistant chats send roughly 30-50% fewer history tokens per message, because older answers
  are no longer resent and recent ones are shortened.
- The fixed prompt prefix (about 2,000-3,000 tokens for the assistant) can now come from Gemini's
  implicit cache for every section and role. Google bills cached input at a fraction of the normal
  price: KunThai's estimate assumes a quarter, and the real discount is often larger.
- Repeated writing and summary requests that hit the cache cost nothing. Double taps and retries
  after Stop no longer pay twice.
- Worst case: the global ceiling caps KunThai's estimated KAI spend at `AI_GLOBAL_DAILY_COST_MICROS`
  per 24 hours (default $5, so about $150 a month). It works from KunThai's own estimate, so keep
  the `AI_PRICE_*` variables in line with Google's price list.

## Settings the owner can change (Vercel environment variables)

Every setting is optional; the default applies when it is unset. Costs are in micro-USD
(1,000,000 = $1).

| Variable | Default | What it does |
| --- | --- | --- |
| `AI_GLOBAL_DAILY_COST_MICROS` | `5000000` ($5) | Combined estimated spend for all members over the last 24 hours before KAI rests. `0` turns it off. |
| `AI_GLOBAL_SNAPSHOT_TTL_SECONDS` | `30` | How often each instance re-reads the global spend. |
| `AI_DAILY_COST_MICROS` | `400000` ($0.40) | One member's daily spend limit. |
| `AI_RATE_PER_MINUTE` / `_PER_HOUR` / `_PER_DAY` | `10` / `80` / `250` | One member's request limits (cached answers do not count). |
| `AI_RATE_PER_IP_PER_MINUTE` | `60` | Requests per minute from one IP address, per instance. `0` turns it off. |
| `AI_RESPONSE_CACHE_ENABLED` | `true` | Turns the answer cache on or off. |
| `AI_RESPONSE_CACHE_TTL_SECONDS` | `604800` (7 days) | How long shared answers are kept. |
| `AI_RESPONSE_CACHE_PERSONAL_TTL_SECONDS` | `86400` (1 day) | How long per-person answers are kept. |
| `AI_RESPONSE_CACHE_MEMORY_ENTRIES` | `120` | In-memory copies kept per instance. |
| `AI_RESPONSE_CACHE_CLEANUP_EVERY` | `200` | Expired cache rows are deleted on about one write in this many. |
| `AI_CONTEXT_CACHE_ENABLED` | `false` | Explicit Gemini context cache for the assistant prefix. |
| `AI_CONTEXT_CACHE_TTL_SECONDS` | `3600` | How long each explicit cache lives (storage is billed for this time). |
| `AI_CONTEXT_CACHE_MIN_TOKENS` | `1024` | Smallest prefix worth an explicit cache. |
| `AI_CACHED_INPUT_PRICE_RATIO` | `0.25` | Share of the input price charged for cached tokens in the estimate. |
| `AI_MAX_HISTORY_TURNS` | `6` | Chat turns resent with each message. |
| `AI_MAX_HISTORY_CHARS` | `4000` | Total characters of those turns. |
| `AI_MAX_HISTORY_TURN_CHARS` | `1200` | Longest single turn from the member. |
| `AI_MAX_HISTORY_MODEL_TURN_CHARS` | `600` | Longest single earlier reply from KAI. |
| `AI_HISTORY_SUMMARY_CHARS` | `400` | Length of the "earlier in this chat" line. `0` drops older turns. |
| `AI_MAX_MESSAGE_CHARS` | `1500` | Longest chat message. |
| `AI_MAX_FACTS_CHARS` | `6000` | Screen data sent with a chat message. |
| `AI_MAX_TOOL_RESULT_CHARS` | `7000` | Each tool result returned to the model. |
| `AI_MAX_TOOL_ROUNDS` | `2` | Tool rounds per message (can only be lowered, minimum 1). |
| `AI_ASSISTANT_MAX_OUTPUT_TOKENS` | `900` | Longest assistant reply. |
| `AI_MAX_OUTPUT_TOKENS_FAST` / `_STANDARD` / `_REASONING` | `640` / `1400` / `2400` | Reply ceilings per model tier. A task can ask for less, never more. |
| `AI_MAX_TEXT_CHARS`, `AI_MAX_LIST_ITEMS`, `AI_MAX_LIST_ITEM_CHARS`, `AI_MAX_BODY_BYTES`, `AI_MAX_IMAGE_BYTES` | unchanged | Input size limits for tasks (see `server/ai/aiConfig.js`). |
| `GEMINI_MODEL_FAST` / `_STANDARD` / `_REASONING`, `AI_PRICE_<MODEL>_INPUT` / `_OUTPUT` | unchanged | Model choice and prices used by the cost estimate. |

### Tuning tips

- Bills higher than expected: lower `AI_GLOBAL_DAILY_COST_MICROS` first, because it covers
  everything at once. Then lower `AI_DAILY_COST_MICROS` or `AI_RATE_PER_DAY`.
- Members see "resting" too often: raise the global ceiling, or look at
  `ai_usage_events` grouped by `task` to find which feature uses the most.
- The assistant gets heavy use (10 or more chats an hour per section): try
  `AI_CONTEXT_CACHE_ENABLED=true` for a week, then compare `cached_tokens` and `cost_micros` with the
  previous week.
- Answers lose the thread of long chats: raise `AI_MAX_HISTORY_TURNS` a little (each extra turn
  costs tokens on every message).
