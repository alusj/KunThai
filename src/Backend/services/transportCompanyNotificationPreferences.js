import supabase from "../lib/supabaseClient";
import { isMissingTable } from "./explore/errors";
import {
  companyActivityNotificationEnabled,
  DEFAULT_COMPANY_NOTIFICATION_PREFERENCES,
  getCompanyActivityPreferenceKey,
  normalizePreferences,
} from "./transportCompanyNotificationModels.js";

export { companyActivityNotificationEnabled, DEFAULT_COMPANY_NOTIFICATION_PREFERENCES, getCompanyActivityPreferenceKey };

const TABLE = "transport_company_notification_preferences";
const STORAGE_PREFIX = "kuntai.transport.companyNotifications.";

function storageKey(companyId = "", userId = "") {
  return `${STORAGE_PREFIX}${userId || "user"}.${companyId || "company"}`;
}


export function readCompanyNotificationPreferences(companyId, userId) {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(storageKey(companyId, userId)) || "null"));
  } catch {
    return normalizePreferences();
  }
}

function writeLocalPreferences(companyId, userId, settings) {
  const next = normalizePreferences(settings);
  try {
    localStorage.setItem(storageKey(companyId, userId), JSON.stringify(next));
  } catch {
    // Continue with the in-memory value when mobile storage is unavailable.
  }
  return next;
}

export async function fetchCompanyNotificationPreferences(companyId, userId) {
  const local = readCompanyNotificationPreferences(companyId, userId);
  if (!companyId || !userId) return local;

  const { data, error } = await supabase
    .from(TABLE)
    .select("settings")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return local;
    throw error;
  }
  return data?.settings ? writeLocalPreferences(companyId, userId, data.settings) : local;
}

export async function updateCompanyNotificationPreferences(companyId, userId, settings) {
  if (!companyId || !userId) return writeLocalPreferences(companyId, userId, settings);
  const next = normalizePreferences(settings);

  // Save to the server first: a failed save must leave the device copy as it
  // was, or the toggle would come back "on" after the next refresh.
  const { error } = await supabase.from(TABLE).upsert({
    company_id: companyId,
    user_id: userId,
    settings: next,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,user_id" });

  if (error && !isMissingTable(error)) throw error;
  return writeLocalPreferences(companyId, userId, next);
}
