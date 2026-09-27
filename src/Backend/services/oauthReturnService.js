// Web return from a social sign-in (Google / Facebook / Apple).
//
// Supabase sends the browser back to kunthai.app either with `?code=...`
// (PKCE: supabase-js exchanges it on startup) or with `error` /
// `error_description` when sign-in failed. supabase-js swallows both kinds of
// failure, so the person silently lands on Login again and it looks like the
// app sent them "back to sign up". This module captures the return URL before
// supabase-js reads it, and lets Login show what actually went wrong.
//
// No Supabase import here: supabaseClient.js calls captureOAuthReturn() before
// creating the client, and Login passes the client in.

import { describeOAuthFailure } from "./oauthErrors.js";

const OAUTH_PARAM_KEYS = ["code", "error", "error_code", "error_description", "state"];

let captured = null;
let failurePromise = null;

function parseReturn(href) {
  try {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const pick = (key) => url.searchParams.get(key) || hash.get(key) || "";
    return {
      hasCode: Boolean(url.searchParams.get("code")),
      error: pick("error"),
      errorCode: pick("error_code"),
      description: pick("error_description"),
    };
  } catch {
    return null;
  }
}

export function captureOAuthReturn(href = typeof window !== "undefined" ? window.location.href : "") {
  if (captured !== null) return;
  const parsed = href ? parseReturn(href) : null;
  captured = parsed && (parsed.hasCode || parsed.error || parsed.description) ? parsed : false;
}

function cleanReturnUrl() {
  try {
    const url = new URL(window.location.href);
    OAUTH_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
    if (/(^|&)(error|error_description|access_token)=/.test(url.hash.replace(/^#/, ""))) url.hash = "";
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Cosmetic only.
  }
}

// Resolves to a user-facing message when this page load was a failed OAuth
// return, otherwise "". Worked out once per page load; later callers (e.g. a
// remount of Login) get the same answer.
export function takeOAuthReturnFailure(supabase, provider = "") {
  if (!captured) return Promise.resolve("");
  if (!failurePromise) failurePromise = explainReturn(supabase, provider).catch(() => "");
  return failurePromise;
}

async function explainReturn(supabase, provider) {
  if (captured.error || captured.description) {
    cleanReturnUrl();
    return describeOAuthFailure({
      error: captured.error,
      code: captured.errorCode,
      description: captured.description,
      provider,
    });
  }

  // A code came back: initialize() resolves with the result of supabase-js's
  // own startup exchange. No session afterwards means the exchange failed.
  const { error } = await supabase.auth.initialize();
  const { data } = await supabase.auth.getSession();
  if (data?.session) return "";

  cleanReturnUrl();
  return describeOAuthFailure({
    error: error?.name || "",
    code: error?.code || "flow_state",
    description: error?.message || "",
    provider,
  });
}

// Test hook.
export function resetOAuthReturnForTests() {
  captured = null;
  failurePromise = null;
}
