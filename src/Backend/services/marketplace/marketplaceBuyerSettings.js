// UrMall buyer settings (UrMall menu > Settings). Stored on this device,
// except "New from stores you viewed", which the database must also know
// (it decides who gets that notification) and is saved with the account's
// other notification switches.

import supabase from "../../lib/supabaseClient";

const SETTINGS_KEY = "kunthai.urmall.buyerSettings.v1";
export const URMALL_BUYER_SETTINGS_EVENT = "kunthai-urmall-buyer-settings-changed";

const DEFAULTS = {
  orderAlerts: true,
  messageAlerts: true,
  storeUpdates: true,
  personalizedSuggestions: true,
};

export function getUrMallBuyerSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUrMallBuyerSettings(patch = {}) {
  const next = { ...getUrMallBuyerSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the switch still applies for this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(URMALL_BUYER_SETTINGS_EVENT, { detail: next }));
  }
  return next;
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || "";
}

/** Reads the account's "New from stores you viewed" switch (default on). */
export async function fetchStoreUpdatesEnabled() {
  try {
    const userId = await currentUserId();
    if (!userId) return getUrMallBuyerSettings().storeUpdates;
    const { data, error } = await supabase
      .from("user_notification_preferences")
      .select("urmall_store_updates_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return getUrMallBuyerSettings().storeUpdates;
    const enabled = data?.urmall_store_updates_enabled !== false;
    saveUrMallBuyerSettings({ storeUpdates: enabled });
    return enabled;
  } catch {
    return getUrMallBuyerSettings().storeUpdates;
  }
}

/** Saves the switch for the account; throws when it could not be saved. */
export async function saveStoreUpdatesEnabled(enabled) {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to change this setting.");
  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert({ user_id: userId, urmall_store_updates_enabled: Boolean(enabled), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
  saveUrMallBuyerSettings({ storeUpdates: Boolean(enabled) });
}

/** Deletes everything UrMall learned from this buyer's views and searches. */
export async function clearUrMallShoppingActivity() {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to clear your activity.");
  const { error } = await supabase.from("marketplace_buyer_signals").delete().eq("user_id", userId);
  if (error) throw error;
}
