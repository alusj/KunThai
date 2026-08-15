// Native (Capacitor) OAuth + identity linking for Google, Facebook and Apple.
//
// Root cause this service fixes: inside the native app the old flow called
// supabase.auth.signInWithOAuth({ redirectTo: window.location.origin }). That
// navigates the webview away and the provider callback (a custom URL scheme)
// is never captured, so no session is ever created — the user lands back on
// Login signed-out. Here we instead open the provider in the system browser,
// catch the `app.kunthai.mobile://auth/callback?code=...` deep link, and
// exchange the PKCE code for a Supabase session.
//
// The web flow is untouched: on the web `signInWithOAuth` still redirects the
// page and `detectSessionInUrl` completes the exchange automatically.

import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

import supabase from "../lib/supabaseClient";

// Custom scheme registered in iOS Info.plist and the Android manifest, and
// allow-listed in Supabase Redirect URLs (app.kunthai.mobile://**).
export const NATIVE_AUTH_REDIRECT = "app.kunthai.mobile://auth/callback";

// UI listens for this to clear its loading state and surface errors. Payload:
// { status: "success" | "error" | "cancelled", mode?: "signin" | "link",
//   message?: string }.
export const OAUTH_SETTLED_EVENT = "kuntai-oauth-settled";

const isDev = Boolean(import.meta.env?.DEV);

// Dev-only breadcrumbs. Never logs codes, tokens, or session objects.
function devLog(step, extra) {
  if (!isDev) return;
  if (extra === undefined) console.log(`[KunThai OAuth] ${step}`);
  else console.log(`[KunThai OAuth] ${step}`, extra);
}

export function isNativePlatform() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Native uses the custom scheme; web keeps the existing origin-based callback.
export function resolveOAuthRedirect() {
  return isNativePlatform() ? NATIVE_AUTH_REDIRECT : window.location.origin;
}

function providerQueryParams(provider, intent) {
  // Preserve Google's account chooser (and consent on first sign-up).
  if (provider === "google") {
    return { prompt: intent === "signup" ? "select_account consent" : "select_account" };
  }
  return undefined;
}

// --- Module-level listener state (registered once, app-wide) -----------------
let listenersBound = false;
let processing = false;
let sawCallback = false;
const handledCodes = new Set();

function emitSettled(detail) {
  window.dispatchEvent(new CustomEvent(OAUTH_SETTLED_EVENT, { detail }));
}

async function closeBrowserQuietly() {
  try {
    await Browser.close();
  } catch {
    // The in-app browser may already be gone (user dismissed it) — ignore.
  }
}

function parseCallback(url) {
  let query = "";
  let hash = "";
  const hashIndex = url.indexOf("#");
  if (hashIndex >= 0) hash = url.slice(hashIndex + 1);
  const queryIndex = url.indexOf("?");
  if (queryIndex >= 0) query = url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);

  const queryParams = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);
  return {
    code: queryParams.get("code"),
    error: queryParams.get("error") || hashParams.get("error"),
    errorDescription: queryParams.get("error_description") || hashParams.get("error_description"),
  };
}

function mapProviderError(error, description) {
  const value = `${error || ""} ${description || ""}`.toLowerCase();
  if (value.includes("access_denied") || value.includes("cancel") || value.includes("denied")) {
    return "Sign-in was cancelled or permission was declined.";
  }
  if (value.includes("provider is not enabled") || value.includes("not enabled") || value.includes("validation_failed")) {
    return "This sign-in method is not enabled. Please try another option or contact support.";
  }
  return description || "The sign-in provider reported an error. Please try again.";
}

function mapExchangeError(err) {
  const message = String(err?.message || "").toLowerCase();
  if (
    message.includes("already linked") ||
    message.includes("identity is already") ||
    message.includes("already been registered") ||
    message.includes("already registered")
  ) {
    return "This social account is already connected to another KunThai account.";
  }
  if (message.includes("manual linking") || message.includes("linking is disabled")) {
    return "Account linking is turned off for KunThai. Please contact support.";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Network problem completing sign-in. Check your connection and try again.";
  }
  return err?.message || "We couldn't finish signing you in. Please try again.";
}

// The single entry point that turns a callback deep link into a session. Safe
// to call from both appUrlOpen (warm) and getLaunchUrl (cold start); duplicate
// deliveries of the same code are ignored.
async function handleCallbackUrl(rawUrl) {
  const url = String(rawUrl || "");
  if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;

  sawCallback = true;
  devLog("callback received");

  const { code, error, errorDescription } = parseCallback(url);

  // Bring the user back to the app; the SFSafariViewController / Custom Tab has
  // served its purpose.
  await closeBrowserQuietly();

  if (error) {
    devLog("provider returned error");
    emitSettled({ status: "error", message: mapProviderError(error, errorDescription) });
    return;
  }

  if (!code) {
    emitSettled({ status: "error", message: "Sign-in did not return an authorization code. Please try again." });
    return;
  }

  if (processing || handledCodes.has(code)) {
    devLog("duplicate callback ignored");
    return;
  }

  processing = true;
  handledCodes.add(code);

  try {
    devLog("code exchange started");
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error("Session was not established after sign-in. Please try again.");
    }

    devLog("session established");
    // The auth-state listener (useAuth) now routes the user to their existing
    // profile or into onboarding — nothing provider- or UI-specific here.
    emitSettled({ status: "success" });
  } catch (err) {
    devLog("code exchange failed");
    emitSettled({ status: "error", message: mapExchangeError(err) });
  } finally {
    processing = false;
  }
}

// Register the deep-link handlers ONCE at app startup. No-op on the web and
// idempotent so repeated calls (e.g. React strict-mode double effects) are
// safe.
export function initNativeOAuth() {
  if (listenersBound || !isNativePlatform()) return;
  listenersBound = true;

  CapacitorApp.addListener("appUrlOpen", (event) => {
    handleCallbackUrl(event?.url);
  });

  // Cold start: the OS may have terminated the app while the browser was open,
  // then relaunched it via the callback URL.
  CapacitorApp.getLaunchUrl()
    .then((result) => {
      if (result?.url) handleCallbackUrl(result.url);
    })
    .catch(() => {});

  // If the browser is dismissed and no callback ever arrives, release the
  // loading state so the button never spins forever.
  Browser.addListener("browserFinished", () => {
    window.setTimeout(() => {
      if (!sawCallback && !processing) {
        devLog("browser closed without callback (treated as cancel)");
        emitSettled({ status: "cancelled" });
      }
    }, 400);
  });

  devLog("native OAuth listeners bound", { platform: Capacitor.getPlatform() });
}

// Kick off a native sign-in: create the PKCE authorize URL (without letting
// supabase-js redirect the webview) and open it in the system browser.
export async function startNativeOAuth({ provider, intent = "signin" }) {
  sawCallback = false;
  devLog("start sign-in", { provider, intent, platform: Capacitor.getPlatform() });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_AUTH_REDIRECT,
      skipBrowserRedirect: true,
      queryParams: providerQueryParams(provider, intent),
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("Could not start sign-in. Please try again.");

  await Browser.open({ url: data.url });
}

// Link an additional provider to the CURRENTLY signed-in KunThai user. Works on
// native (custom-scheme callback, reusing the same handler) and web (page
// redirect). Requires the user to already be authenticated.
export async function linkOAuthIdentity(provider) {
  if (isNativePlatform()) {
    sawCallback = false;
    devLog("start link", { provider });

    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: NATIVE_AUTH_REDIRECT,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("Could not start account linking. Please try again.");

    await Browser.open({ url: data.url });
    return;
  }

  // Web: navigate to the provider; detectSessionInUrl completes the link on
  // return to the origin.
  const { error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}
