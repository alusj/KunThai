import supabase from "../lib/supabaseClient";
import { clearExploreMessageCache } from "./explore/messageService";
import { claimExploreAccountCache, clearExploreAccountCache } from "./explore/accountCache.js";

const SOCIAL_CACHE_KEYS = [
  "explore-liked-posts",
  "explore-saved-posts",
  "explore-hidden-posts",
  "explore-notifications-cache",
  "explore-notifications-cache:meta",
  "explore-posts-feed",
  "explore-posts-connections",
];
const EXPLORE_NAVIGATION_KEY = "exploreNavigation";
const ACCOUNT_HISTORY_KEY = "kuntai.auth.accountHistory";
const SWITCH_ACCOUNT_PREFILL_KEY = "kuntai.auth.switchAccountPrefill";
const OAUTH_FLOW_KEY = "kuntai.auth.oauthFlow";
const SESSION_VAULT_KEY = "kuntai.auth.sessionVault";
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

// --- Session vault -----------------------------------------------------------
// Keeps the latest session tokens per signed-in account so Switch Account can
// restore a previous account directly instead of forcing a fresh sign-in.
// Tokens live in localStorage with the same exposure as the active Supabase
// session itself; signing an account out purges its vault entry.

function readSessionVault() {
  if (typeof localStorage === "undefined") return {};
  const vault = safeParse(localStorage.getItem(SESSION_VAULT_KEY), {});
  return vault && typeof vault === "object" ? vault : {};
}

function writeSessionVault(vault) {
  try {
    localStorage.setItem(SESSION_VAULT_KEY, JSON.stringify(vault));
  } catch {
    // Storage can be blocked in private browsers; switching then falls back to sign-in.
  }
}

export function vaultSessionSnapshot(session) {
  const userId = session?.user?.id;
  if (!userId || !session?.refresh_token) return;
  const vault = readSessionVault();
  vault[userId] = {
    access_token: session.access_token || "",
    refresh_token: session.refresh_token,
    savedAt: Date.now(),
  };
  writeSessionVault(vault);
}

export function readVaultedSession(userId) {
  if (!userId) return null;
  const entry = readSessionVault()[userId];
  return entry?.refresh_token ? entry : null;
}

export function hasVaultedSession(userId) {
  return Boolean(readVaultedSession(userId));
}

export function purgeVaultedSession(userId) {
  if (!userId) return;
  const vault = readSessionVault();
  if (vault[userId]) {
    delete vault[userId];
    writeSessionVault(vault);
  }
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

// Reads the pending OAuth flow without clearing it (onboarding consumes it).
export function peekOAuthFlow() {
  if (typeof sessionStorage === "undefined") return null;
  const value = safeParse(sessionStorage.getItem(OAUTH_FLOW_KEY), null);
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
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("kuntai.transport.dashboard.v1:")) {
      localStorage.removeItem(key);
    }
  }
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
  // Signing out is an explicit end of this account's device access, so its
  // vaulted switch tokens must go too. "Everywhere" only revokes THIS
  // account's sessions, so other accounts saved on this device stay ready.
  try {
    const { data } = await supabase.auth.getSession();
    purgeVaultedSession(data?.session?.user?.id);
  } catch {
    // Vault cleanup is best-effort; sign-out must still proceed.
  }

  clearExploreMessageCache();
  clearSocialSessionCache();
  clearExploreAccountCache();
  clearTransientSessionNavigation();
  // Default sign-out only ends this device's session; other devices stay
  // signed in unless the user explicitly signs out everywhere.
  const { error } = await supabase.auth.signOut({ scope: allDevices ? "global" : "local" });

  if (error) {
    throw error;
  }
}

// "Add account": opens sign-in for another account WITHOUT signing the current
// one out (a sign-out revokes its refresh token, which would break switching
// back). The current session is kept in the vault and only this device's
// copy of the active session is dropped before a full reload.
export async function startAddSocialAccount() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) vaultSessionSnapshot(data.session);
  clearExploreMessageCache();
  clearSocialSessionCache();
  clearExploreAccountCache();
  clearTransientSessionNavigation();
  try {
    const storageKey = supabase.auth.storageKey;
    if (storageKey) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}-code-verifier`);
      localStorage.removeItem(`${storageKey}-user`);
    }
  } catch {
    // Storage blocked: fall back to a normal sign-out below.
    await signOutSocialSession();
    return;
  }
  window.location.reload();
}

// Ends this account's sessions on every other device; this one stays signed in.
export async function signOutOtherDevices() {
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) throw error;
}

// Forgets a saved account on this device (list entry and its switch tokens).
export function removeRememberedSocialAccount(accountId) {
  if (!accountId || typeof localStorage === "undefined") return getRememberedSocialAccounts();
  purgeVaultedSession(accountId);
  const next = getRememberedSocialAccounts().filter((account) => account.id !== accountId);
  try {
    localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked in private browsers.
  }
  return next;
}

export async function switchSocialAccount() {
  clearSocialSessionCache();
  await signOutSocialSession();
}

export async function switchToRememberedSocialAccount(account = {}) {
  const remembered = normalizeRememberedAccount(account);

  // Instant path: this account previously signed in on this device and its
  // session tokens are still vaulted, so restore them directly.
  const stored = readVaultedSession(remembered.id);
  if (stored) {
    clearExploreMessageCache();
    clearSocialSessionCache();
    clearExploreAccountCache();
    clearTransientSessionNavigation();

    // Do NOT sign the current account out here: local sign-out revokes its
    // refresh token server-side, which would break switching back to it.
    // setSession simply replaces the active session on this device.
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });

    if (!error && data?.session?.user?.id === remembered.id) {
      vaultSessionSnapshot(data.session);
      // Full reload so every per-account cache, hook, and realtime channel
      // boots cleanly for the restored account.
      window.location.reload();
      return { switched: true };
    }

    // Tokens were revoked or expired; forget them and fall back to sign-in.
    purgeVaultedSession(remembered.id);
  }

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SWITCH_ACCOUNT_PREFILL_KEY, JSON.stringify({
      displayName: remembered.displayName,
      identifier: remembered.identifier,
      provider: remembered.provider,
    }));
  }

  await signOutSocialSession();
  return { switched: false };
}

// --- Per-account Explore settings ---------------------------------------------
// On every sign-in (and app start with a session) the settings, privacy and
// blocked-account caches are claimed for that account, so a previous account's
// values never show; then the account's saved values are loaded (or this
// device's values for the same account are pushed up when it has none).
let hydratedExploreUserId = "";

function hydrateExploreAccount(userId) {
  if (!userId || hydratedExploreUserId === userId) return;
  hydratedExploreUserId = userId;
  Promise.all([
    import("./explore/preferencesService"),
    import("./explore/safetyService"),
  ])
    .then(([preferences, safety]) => Promise.allSettled([
      preferences.fetchExploreSettings(),
      safety.fetchPrivacySettings(),
      safety.fetchBlockedUsers(),
    ]))
    .catch(() => {
      hydratedExploreUserId = "";
    });
}

if (typeof window !== "undefined" && supabase?.auth?.onAuthStateChange) {
  // Synchronous work only inside the callback: supabase-js holds its auth lock
  // while notifying, so network calls are deferred to the next task.
  supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user?.id || "";
    if (event === "SIGNED_OUT") {
      hydratedExploreUserId = "";
      clearExploreAccountCache();
      return;
    }
    if (!userId || !["INITIAL_SESSION", "SIGNED_IN"].includes(event)) return;
    claimExploreAccountCache(userId);
    window.setTimeout(() => hydrateExploreAccount(userId), 0);
  });
}
