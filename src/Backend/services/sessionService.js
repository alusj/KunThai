import supabase from "../lib/supabaseClient";
import { clearExploreMessageCache } from "./explore/messageService";

const SOCIAL_CACHE_KEYS = [
  "explore-liked-posts",
  "explore-saved-posts",
  "explore-hidden-posts",
  "explore-notifications-cache",
  "explore-posts-feed",
  "explore-posts-connections",
];
const EXPLORE_NAVIGATION_KEY = "exploreNavigation";
const ACCOUNT_HISTORY_KEY = "kuntai.auth.accountHistory";
const SWITCH_ACCOUNT_PREFILL_KEY = "kuntai.auth.switchAccountPrefill";
const OAUTH_FLOW_KEY = "kuntai.auth.oauthFlow";
const DEFAULT_EXPLORE_NAVIGATION = {
  activeTab: "UrFeed",
  menuStack: [],
};

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getAccountIdentifier(account = {}) {
  return account.email || account.phone || account.identifier || "";
}

function normalizeRememberedAccount(input = {}) {
  const metadata = input.user_metadata || input.metadata || {};
  const email = input.email || "";
  const phone = input.phone || metadata.phone_number || "";
  const provider = input.app_metadata?.provider || input.provider || (phone ? "phone" : "email");
  const identifier = input.identifier || email || phone || "";
  const displayName =
    input.displayName ||
    input.display_name ||
    metadata.display_name ||
    metadata.full_name ||
    metadata.name ||
    email?.split("@")[0] ||
    phone ||
    "KunThai account";

  return {
    id: input.id || input.userId || identifier,
    avatarUrl: input.avatarUrl || input.avatar_url || metadata.avatar_url || "",
    displayName,
    email,
    identifier,
    lastUsedAt: input.lastUsedAt || new Date().toISOString(),
    phone,
    provider,
  };
}

export function getRememberedSocialAccounts() {
  if (typeof localStorage === "undefined") return [];
  const accounts = safeParse(localStorage.getItem(ACCOUNT_HISTORY_KEY), []);
  return Array.isArray(accounts) ? accounts.map(normalizeRememberedAccount).filter((account) => account.id || account.identifier) : [];
}

export function rememberSocialAccount(user = {}) {
  if (!user?.id || typeof localStorage === "undefined") return [];
  const account = normalizeRememberedAccount(user);
  const existing = getRememberedSocialAccounts();
  const next = [
    account,
    ...existing.filter((item) => item.id !== account.id && getAccountIdentifier(item) !== account.identifier),
  ].slice(0, 8);
  localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function consumeSwitchAccountPrefill() {
  if (typeof sessionStorage === "undefined") return null;
  const value = safeParse(sessionStorage.getItem(SWITCH_ACCOUNT_PREFILL_KEY), null);
  sessionStorage.removeItem(SWITCH_ACCOUNT_PREFILL_KEY);
  return value;
}

export function rememberOAuthFlow(provider, intent = "signin") {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(OAUTH_FLOW_KEY, JSON.stringify({
    provider,
    intent,
    startedAt: Date.now(),
  }));
}

export function consumeOAuthFlow() {
  if (typeof sessionStorage === "undefined") return null;
  const value = safeParse(sessionStorage.getItem(OAUTH_FLOW_KEY), null);
  sessionStorage.removeItem(OAUTH_FLOW_KEY);
  if (!value?.provider || Date.now() - Number(value.startedAt || 0) > 30 * 60 * 1000) return null;
  return value;
}

export function clearOAuthFlow() {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(OAUTH_FLOW_KEY);
}

function clearSocialSessionCache() {
  SOCIAL_CACHE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
}

const SESSION_CONTINUITY_KEY = "kuntai-session-continuity";

// Tracks which user this browser tab already booted for. A hard refresh keeps
// the marker, so boot code can restore navigation instead of resetting it;
// a fresh sign-in (or account switch) sees a mismatch and resets normally.
export function readSessionContinuity() {
  try {
    return sessionStorage.getItem(SESSION_CONTINUITY_KEY) || "";
  } catch {
    return "";
  }
}

export function markSessionContinuity(userId) {
  try {
    sessionStorage.setItem(SESSION_CONTINUITY_KEY, String(userId || ""));
  } catch {
    // Storage can be blocked in private browsers; continuity is best-effort.
  }
}

export function clearTransientSessionNavigation() {
  try {
    localStorage.setItem(EXPLORE_NAVIGATION_KEY, JSON.stringify(DEFAULT_EXPLORE_NAVIGATION));
    sessionStorage.removeItem("exploreFeedScrollY");
  } catch {
    // Storage can be blocked in private browsers; sign-out should still work.
  }

  if (window.location.hash) {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
}

export async function signOutSocialSession({ allDevices = false } = {}) {
  clearExploreMessageCache();
  clearSocialSessionCache();
  clearTransientSessionNavigation();
  // Default sign-out only ends this device's session; other devices stay
  // signed in unless the user explicitly signs out everywhere.
  const { error } = await supabase.auth.signOut({ scope: allDevices ? "global" : "local" });

  if (error) {
    throw error;
  }
}

export async function switchSocialAccount() {
  clearSocialSessionCache();
  await signOutSocialSession();
}

export async function switchToRememberedSocialAccount(account = {}) {
  const remembered = normalizeRememberedAccount(account);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SWITCH_ACCOUNT_PREFILL_KEY, JSON.stringify({
      displayName: remembered.displayName,
      identifier: remembered.identifier,
      provider: remembered.provider,
    }));
  }

  await signOutSocialSession();
}
