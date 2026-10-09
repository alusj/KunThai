import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";
import { claimExploreAccountCache, hasOwnedCacheValue } from "./accountCache.js";
import {
  applySettingsPatch,
  hasServerSettings,
  mergeSettings,
} from "./preferencesModel.js";

export { DEFAULT_EXPLORE_SETTINGS, applySettingsPatch, mergeSettings } from "./preferencesModel.js";

const EXPLORE_SETTINGS_KEY = "explore-user-settings";
const PREFERENCES_TABLE = "explore_user_preferences";
export const EXPLORE_SETTINGS_EVENT = "kuntai-explore-settings-updated";

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

export function readExploreSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(EXPLORE_SETTINGS_KEY) || "null");
    return mergeSettings(value && typeof value === "object" ? value : {});
  } catch {
    return mergeSettings({});
  }
}

export function writeExploreSettings(settings) {
  const next = mergeSettings(settings);
  try {
    localStorage.setItem(EXPLORE_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked in private browsers; the event still updates screens.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EXPLORE_SETTINGS_EVENT, { detail: next }));
  }
  return next;
}

// Saves the full settings object to the signed-in account.
// Resolves { synced: true } when the server has it, { synced: false } when
// there is no account or no table to save to; throws when the save failed.
async function saveExploreSettingsToServer(settings, userId = "") {
  const resolvedUserId = userId || (await getCurrentUserId());
  if (!resolvedUserId) return { synced: false };

  const { error } = await supabase.from(PREFERENCES_TABLE).upsert(
    {
      user_id: resolvedUserId,
      settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isMissingTable(error)) return { synced: false };
    const failure = new Error(error.message || "Settings were not saved to your account.");
    failure.code = error.code;
    failure.savedOnDevice = true;
    throw failure;
  }
  return { synced: true };
}

// Loads the account's saved settings. When the account has none yet, the
// settings this device already holds for the same account are pushed up.
export async function fetchExploreSettings({ pushLocalWhenEmpty = true } = {}) {
  const userId = await getCurrentUserId();
  if (userId) claimExploreAccountCache(userId);
  const localSettings = readExploreSettings();

  if (!userId) {
    return localSettings;
  }

  const { data, error } = await supabase
    .from(PREFERENCES_TABLE)
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return localSettings;
    }
    throw error;
  }

  if (!hasServerSettings(data?.settings)) {
    if (pushLocalWhenEmpty && hasOwnedCacheValue(EXPLORE_SETTINGS_KEY, userId)) {
      await saveExploreSettingsToServer(localSettings, userId).catch(() => {});
    }
    return localSettings;
  }

  return writeExploreSettings(data.settings);
}

// patch: { section: { key: value } }. Each section is merged key by key onto
// the LATEST stored settings (never a screen's possibly stale copy), kept on
// this device, then saved to the account. Resolves { settings, synced };
// throws (error.savedOnDevice) when the server save failed — the device keeps
// the change either way.
export async function updateExploreSettings(patch) {
  const next = writeExploreSettings(applySettingsPatch(readExploreSettings(), patch));
  const result = await saveExploreSettingsToServer(next);
  return { settings: next, ...result };
}

export function updateExploreSettingsSection(section, patch) {
  return updateExploreSettings({ [section]: patch });
}

export function clearExploreLocalCache() {
  // These MUST match the real storage keys used across the Explore services,
  // otherwise the "Clear local cache" button silently clears nothing. It wipes
  // drafts, recent searches, and temporary navigation/posting state — but not
  // user settings, likes, or saves.
  [
    "exploreNavigation", // navigationService
    "explore-recent-searches", // searchService
    "explore-composer-draft", // composerUtils DRAFT_KEY
    "explore-message-activity", // messageService
    "explore-posting-notice", // postingProgressService
    "explore-video-review-jobs", // postingProgressService
  ].forEach((key) => localStorage.removeItem(key));
}

// --- Read receipts ----------------------------------------------------------
// Messages are still marked read on the server (unread badges depend on it),
// so "Read receipts: Off" is honoured where "Seen" is displayed: a sender
// shows "Seen" only when BOTH people share read receipts. Integration point
// for the conversation screen: canShowSeenFor(peerUserId).

// Whether this account shares read receipts (Settings > Messages > Receipts).
export function shareReadReceipts() {
  return readExploreSettings().messages.readReceipts !== false;
}

function isMissingRpc(error, name) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST202" || (message.includes(name) && (message.includes("schema cache") || message.includes("could not find")));
}

const peerReceiptsCache = new Map();
const PEER_RECEIPTS_TTL_MS = 60 * 1000;

// Whether the other person in a conversation shares read receipts. Unknown
// (error) reads as false so "Seen" is never shown against their wish.
export async function fetchPeerReadReceiptsEnabled(peerUserId) {
  if (!peerUserId) return false;
  const cached = peerReceiptsCache.get(peerUserId);
  if (cached && Date.now() - cached.at < PEER_RECEIPTS_TTL_MS) return cached.value;

  const { data, error } = await supabase.rpc("explore_peer_read_receipts_enabled", { peer_user_id: peerUserId });
  // Before the 2026-10-09 migration there is no way to know; keep the old behaviour.
  const value = error ? isMissingRpc(error, "explore_peer_read_receipts_enabled") : data === true;
  peerReceiptsCache.set(peerUserId, { at: Date.now(), value });
  return value;
}

// "Seen" may be shown on my messages only when both sides share receipts.
export async function canShowSeenFor(peerUserId) {
  if (!shareReadReceipts()) return false;
  return fetchPeerReadReceiptsEnabled(peerUserId).catch(() => false);
}
