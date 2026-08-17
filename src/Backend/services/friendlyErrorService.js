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
import { isOnline } from "./networkService";

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

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return `${error.name || ""} ${error.message || ""}`.toLowerCase();
}

// True when the failure looks like a lost/broken connection rather than a real
// server or validation error. Checks the live online flag first (definitive
// when the device reports itself offline), then the error text patterns.
export function isNetworkError(error) {
  if (!isOnline()) return true;
  const text = errorText(error);
  if (!text.trim()) return false;
  return NETWORK_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
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
  if (message) return message;
  return fallback || t("common.tryAgain");
}
