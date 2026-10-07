// Turns raw thrown errors into plain-language messages anyone can understand.
//
// The most common confusing case is a dropped connection: the browser rejects
// fetch with "TypeError: Failed to fetch" (and supabase-js surfaces the same
// text), which means nothing to a real user. When we can tell the failure is a
// network fault, we replace it with a simple, localized "you've lost your
// network connection" line instead of the technical error. For everything else
// we keep the error's own message (or a gentle fallback) so genuine problems
// still surface.

import { t } from "../../i18n/index";
import { TRANSLATIONS } from "../../i18n/translations";
import { announceConnectionTrouble, isOnline } from "./networkService";

// Strings that browsers / fetch / supabase-js emit when a request never reached
// the network. Matched case-insensitively against the error message and name.
const NETWORK_ERROR_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network error",
  "network request failed",
  "load failed",
  "fetch failed",
  "the internet connection appears to be offline",
  "connection was lost",
  "err_internet_disconnected",
  "err_network",
  "err_connection",
  "err_name_not_resolved",
  "err_timed_out",
];

// Raw runtime / protocol noise that must never reach a user as a message. These
// are matched on message CONTENT only (never on the online flag), so ordinary
// human messages — including success toasts shown while offline — pass through
// untouched.
const TECHNICAL_NOISE_PATTERNS = [
  "typeerror",
  "referenceerror",
  "syntaxerror",
  "rangeerror",
  "is not a function",
  "is not defined",
  "cannot read propert",
  "undefined is not",
  "null is not",
  "[object object]",
  "unexpected token",
  "json.parse",
  "json parse",
  "internal server error",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "xmlhttprequest",
  // Safari's wording for a SyntaxError (bad JSON, base64 or URL).
  "did not match the expected pattern",
];

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return `${error.name || ""} ${error.message || ""}`.toLowerCase();
}

// True when the failure looks like a lost/broken connection rather than a real
// server or validation error. The error text decides first. While the device
// reports itself offline, an error with no readable message or raw runtime
// noise is also the connection — but a plain human message (a validation or
// business rule thrown before any request) is still that message.
export function isNetworkError(error) {
  const text = errorText(error);
  if (text.trim() && NETWORK_ERROR_PATTERNS.some((pattern) => text.includes(pattern))) return true;
  if (isOnline()) return false;
  const message = typeof error === "string" ? error : String(error?.message || "");
  const lower = message.trim().toLowerCase();
  return !lower
    || error?.name === "TypeError"
    || TECHNICAL_NOISE_PATTERNS.some((pattern) => lower.includes(pattern));
}

// The friendly "lost your connection" line in every language. Services often
// rethrow `new Error(friendlyErrorMessage(error))`, which drops the original
// error, so this is how a caught error is still recognised as the connection.
const NETWORK_LOST_TEXTS = new Set(
  Object.values(TRANSLATIONS)
    .map((bundle) => bundle?.common?.networkLost)
    .filter(Boolean),
);

// A lost connection, from the raw error or from a message already made friendly.
export function isConnectionFailure(errorOrMessage) {
  if (!errorOrMessage) return false;
  const message = typeof errorOrMessage === "string" ? errorOrMessage : String(errorOrMessage.message || "");
  if (NETWORK_LOST_TEXTS.has(message.trim())) return true;
  return isNetworkError(errorOrMessage);
}

// Every toast is 15–25 characters, spaces included (user rule, 2026-09-22).
export const TOAST_MIN_LENGTH = 15;
export const TOAST_MAX_LENGTH = 25;

// The message for a toast about a failed action. A server's own message is
// shown only when it is plain language and already fits a toast; otherwise the
// short, specific fallback for that action is ("Couldn't remove admin"). A lost
// connection still returns the network line, so showToast hands it to the one
// global offline toast.
export function shortErrorToast(error, fallback) {
  if (isConnectionFailure(error)) return t("common.networkLost");
  const message = friendlyErrorMessage(error, fallback);
  return message.length >= TOAST_MIN_LENGTH && message.length <= TOAST_MAX_LENGTH ? message : fallback;
}

// For a message shown inside a card, form, sheet or banner. A lost connection
// yields "" — the component keeps its normal state — and the global network
// toast says why instead. Everything else is the usual friendly message, so
// real backend and validation errors still show where they happened.
export function inlineErrorMessage(error, fallback = "") {
  if (isConnectionFailure(error) && announceConnectionTrouble()) return "";
  return friendlyErrorMessage(error, fallback);
}

// The main helper. Returns a message safe to show inline or in a toast:
//   - network fault  -> friendly localized "lost connection" line
//   - anything else   -> the error's own message, or `fallback` if it has none.
// `fallback` should itself be plain language; when omitted we use a gentle,
// localized "something went wrong, please try again".
export function friendlyErrorMessage(error, fallback = "") {
  if (isNetworkError(error)) {
    return t("common.networkLost");
  }
  const message = typeof error === "string" ? error : String(error?.message || "").trim();
  if (message) return sanitizeUserMessage(message);
  return fallback || t("common.tryAgain");
}

// Sanitizes an already-built string message right before it is shown (toast or
// inline). Network faults become the friendly "lost connection" line, raw
// technical noise becomes a gentle "something went wrong", and everything else
// — normal human copy — is returned unchanged. Content-only: a success message
// is never rewritten just because the device happens to be offline.
export function sanitizeUserMessage(message) {
  if (typeof message !== "string") return message;
  const text = message.trim();
  if (!text) return text;
  const lower = text.toLowerCase();
  if (NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return t("common.networkLost");
  }
  if (TECHNICAL_NOISE_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return t("common.tryAgain");
  }
  return text;
}
