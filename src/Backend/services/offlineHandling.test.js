import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createReadRetryingFetch, isFetchConnectionFault } from "./networkService.js";
import { isRetryableSupabaseRead, READ_ONLY_RPCS } from "../lib/supabaseReadRequests.js";

const REST = "https://example.supabase.co/rest/v1";
const read = (source) => readFileSync(new URL(source, import.meta.url), "utf8");

function offlineFault() {
  return new TypeError("Failed to fetch");
}

test("only data reads may wait out a lost connection: table GET/HEAD and read-only RPCs", () => {
  assert.equal(isRetryableSupabaseRead(`${REST}/transport_company_operator_invites?select=*`, "GET"), true);
  assert.equal(isRetryableSupabaseRead(`${REST}/marketplace_products?select=id`, "HEAD"), true);
  assert.equal(isRetryableSupabaseRead(`${REST}/rpc/kunthai_get_country_regions`, "POST"), true);
  // Writes are never held, whatever the table.
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.equal(isRetryableSupabaseRead(`${REST}/marketplace_products`, method), false, method);
  }
  // A volatile RPC can write, and so can one nobody has classified yet.
  assert.equal(isRetryableSupabaseRead(`${REST}/rpc/delete_my_marketplace_business`, "POST"), false);
  assert.equal(isRetryableSupabaseRead(`${REST}/rpc/some_future_function`, "POST"), false);
  // Auth keeps its own cached-session fallback; storage and functions are untouched.
  assert.equal(isRetryableSupabaseRead("https://example.supabase.co/auth/v1/user", "GET"), false);
  assert.equal(isRetryableSupabaseRead("https://example.supabase.co/storage/v1/object/public/a.png", "GET"), false);
  assert.equal(isRetryableSupabaseRead("https://example.supabase.co/functions/v1/push-send", "POST"), false);
});

test("the read-only RPC list names only functions the client actually calls", () => {
  const clientSource = read("../../../src/Backend/services/regions/regionService.js");
  assert.ok(READ_ONLY_RPCS.size > 0);
  assert.ok(READ_ONLY_RPCS.has("kunthai_get_country_regions"));
  assert.match(clientSource, /kunthai_get_country_regions/);
  // Every write-capable RPC the deletion and credits flows use stays out.
  for (const name of ["delete_my_marketplace_business", "spend_visibility_credits", "grant_visibility_credits"]) {
    assert.equal(READ_ONLY_RPCS.has(name), false, name);
  }
});

test("a read that loses the connection waits, retries and resolves — it never reaches the screen as an error", async () => {
  let calls = 0;
  const waits = [];
  let holds = 0;
  const fetchStub = async () => {
    calls += 1;
    if (calls < 3) throw offlineFault();
    return { ok: true, status: 200 };
  };
  const fetchWithRetry = createReadRetryingFetch(fetchStub, {
    isRead: () => true,
    onHold: () => { holds += 1; },
    wait: async ({ attempt }) => { waits.push(attempt); },
  });
  const response = await fetchWithRetry(`${REST}/fleets?select=*`, { method: "GET" });
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [0, 1], "backs off per attempt");
  assert.equal(holds, 1, "announces once when it starts waiting, not on every retry");
});

test("a write that loses the connection fails at once and is never replayed", async () => {
  let calls = 0;
  let waited = false;
  const fetchWithRetry = createReadRetryingFetch(async () => {
    calls += 1;
    throw offlineFault();
  }, { isRead: () => false, wait: async () => { waited = true; } });
  await assert.rejects(fetchWithRetry(`${REST}/marketplace_orders`, { method: "POST", body: "{}" }), /Failed to fetch/);
  assert.equal(calls, 1);
  assert.equal(waited, false);
});

test("errors that are not the connection surface immediately instead of looping", async () => {
  // fetch throws a TypeError for a malformed request too; retrying that would spin forever.
  assert.equal(isFetchConnectionFault(new TypeError("Failed to parse URL from bad url")), false);
  assert.equal(isFetchConnectionFault(new DOMException("aborted", "AbortError")), false);
  assert.equal(isFetchConnectionFault(new TypeError("Failed to fetch")), true);
  assert.equal(isFetchConnectionFault(new TypeError("NetworkError when attempting to fetch resource.")), true);
  assert.equal(isFetchConnectionFault(new TypeError("Load failed")), true);

  let calls = 0;
  const fetchWithRetry = createReadRetryingFetch(async () => {
    calls += 1;
    throw new TypeError("Failed to parse URL from bad url");
  }, { isRead: () => true, wait: async () => {} });
  await assert.rejects(fetchWithRetry("bad url", {}), /Failed to parse URL/);
  assert.equal(calls, 1);
});

test("a caller that aborts is released with an AbortError, whether mid-request or while waiting", async () => {
  const waitUntilAborted = ({ signal }) => new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

  // Aborted before the failed attempt is handled.
  const early = new AbortController();
  const failing = createReadRetryingFetch(async () => { throw offlineFault(); }, { isRead: () => true, onHold: () => {}, wait: waitUntilAborted });
  const earlyPending = failing(`${REST}/trips?select=*`, { method: "GET", signal: early.signal });
  early.abort();
  await assert.rejects(earlyPending, (error) => error.name === "AbortError");

  // Aborted while the read is already waiting for the connection.
  const late = new AbortController();
  let holding;
  const held = new Promise((resolve) => { holding = resolve; });
  const waiting = createReadRetryingFetch(async () => { throw offlineFault(); }, { isRead: () => true, onHold: () => holding(), wait: waitUntilAborted });
  const latePending = waiting(`${REST}/trips?select=*`, { method: "GET", signal: late.signal });
  await held;
  late.abort();
  await assert.rejects(latePending, (error) => error.name === "AbortError");
});

test("the Supabase client routes every request through the read-retrying fetch", () => {
  const source = read("../lib/supabaseClient.js");
  assert.match(source, /global:\s*\{[\s\S]*?fetch: createReadRetryingFetch\(\(\.\.\.args\) => fetch\(\.\.\.args\), \{ isRead: isRetryableSupabaseRead \}\)/);
});

// friendlyErrorService imports the i18n bundles (extensionless paths), so it is
// run in a context with its imports replaced, like the other service tests.
function friendlyErrors({ online = true, announcer = true } = {}) {
  const announced = [];
  const source = read("./friendlyErrorService.js")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const api = runInNewContext(`${source}\n({ inlineErrorMessage, isConnectionFailure, isNetworkError })`, {
    t: (key) => ({ "common.networkLost": "Sorry, you've lost your network connection. Please check your internet and try again.", "common.tryAgain": "Something went wrong. Please try again." })[key] || key,
    TRANSLATIONS: {
      en: { common: { networkLost: "Sorry, you've lost your network connection. Please check your internet and try again." } },
      fr: { common: { networkLost: "Désolé, vous avez perdu votre connexion réseau." } },
    },
    isOnline: () => online,
    announceConnectionTrouble: () => {
      announced.push(true);
      return announcer;
    },
  });
  return { ...api, announced };
}

test("a lost connection never renders inside a component: inline messages are empty and the global toast speaks", () => {
  const errors = friendlyErrors();
  // Raw fetch fault, and the friendly line a service already rethrew, in any language.
  assert.equal(errors.inlineErrorMessage(new TypeError("Failed to fetch"), "Unable to load invites."), "");
  assert.equal(errors.inlineErrorMessage(new Error("Sorry, you've lost your network connection. Please check your internet and try again."), "x"), "");
  assert.equal(errors.inlineErrorMessage(new Error("Désolé, vous avez perdu votre connexion réseau."), "x"), "");
  assert.equal(errors.announced.length, 3);
});

test("genuine backend and validation errors still show where they happened", () => {
  const errors = friendlyErrors();
  assert.equal(errors.inlineErrorMessage(new Error("This invite has already been accepted."), "fallback"), "This invite has already been accepted.");
  assert.equal(errors.inlineErrorMessage(new Error(""), "Unable to load invites."), "Unable to load invites.");
  assert.equal(errors.announced.length, 0);
});

test("offline, a plain human message is still that message rather than 'lost connection'", () => {
  const errors = friendlyErrors({ online: false });
  assert.equal(errors.isNetworkError(new Error("Enter a business name.")), false);
  assert.equal(errors.isNetworkError(new Error("")), true);
  assert.equal(errors.isNetworkError(new TypeError("x is not a function")), true);
});

test("without a global announcer (admin console) the message is kept so a failure is never silent", () => {
  const errors = friendlyErrors({ announcer: false });
  assert.equal(
    errors.inlineErrorMessage(new TypeError("Failed to fetch"), "x"),
    "Sorry, you've lost your network connection. Please check your internet and try again.",
  );
});

test("the UrRide company invitations card no longer carries an offline message", () => {
  const transport = read("../../components/transport/Transport.jsx");
  assert.match(transport, /setOperatorInviteStatus\(inlineErrorMessage\(error, t\("urride\.transport\.status\.invitesLoadError"\)\)\)/);
  // The panel only renders for invites or a real status message.
  assert.match(transport, /if \(!visibleInvites\.length && !status\) return null;/);
});

test("offline notices of their own are gone from Area View, the feed, the loader and feedback forms", () => {
  const areaScreen = read("../../components/transport/NearbyAreaScreen.jsx");
  const areaMap = read("../../components/transport/area/NearbyAreaMap.jsx");
  const feed = read("../hooks/useExploreFeed.js");
  const app = read("../../App.jsx");
  const toast = read("./toastService.js");
  assert.doesNotMatch(areaScreen, /suppressGlobalNetworkToasts|urride\.areaView\.netOffline/);
  assert.doesNotMatch(areaMap, /setMapBlocked\("offline"\)|urride\.areaMap\.offline"/);
  assert.doesNotMatch(feed, /"Network unavailable\."|"network-unavailable"/);
  // The feed announced going offline itself too; only the global toast does now.
  assert.doesNotMatch(feed, /addEventListener\("offline"/);
  assert.match(feed, /function showFeedRefreshToast\(showingSavedPosts\)/);
  assert.equal((feed.match(/showFeedRefreshToast\(/g) || []).length, 2, "defined once, called once from the load path");
  assert.doesNotMatch(app, /k78bc44dac752|k5668eeef0e08|kd1d9af29fa05/);
  // Action toasts that fail offline re-show the global toast instead of their own.
  assert.match(toast, /if \(typeof rawMessage === "string" && isConnectionFailure\(rawMessage\)\) \{\s*if \(announceConnectionTrouble\(\)\) return;/);
  // With no global announcer (admin console) it is the same short offline line.
  assert.match(toast, /if \(announceConnectionTrouble\(\)\) return;\s*rawMessage = t\("common\.offlineBanner"\);/);
  for (const file of ["../../components/Explore/SocialMenu/userCare/YourVoiceScreen.jsx", "../../components/shared/ScreenshotVoiceCard.jsx"]) {
    assert.match(read(file), /if \(!announceConnectionTrouble\(\)\) setFeedback/);
  }
});

test("a MoMo status check that loses the connection keeps waiting instead of sending the person back to pay again", () => {
  const card = read("../../components/Explore/SocialMenu/profile/ProfileHeaderCard.jsx");
  assert.match(card, /if \(!error\.pending && isConnectionFailure\(error\)\) \{[\s\S]*?whenOnline\(\(\) => \{[\s\S]*?pollMomoStatus\(purchaseId, attempt\);[\s\S]*?return;\s*\}/);
});
