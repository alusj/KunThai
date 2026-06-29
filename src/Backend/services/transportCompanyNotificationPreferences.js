import supabase from "../lib/supabaseClient";
import { isMissingTable } from "./explore/errors";

const TABLE = "transport_company_notification_preferences";
const STORAGE_PREFIX = "kuntai.transport.companyNotifications.";

export const DEFAULT_COMPANY_NOTIFICATION_PREFERENCES = {
  operatorInvitations: true,
  bookingAccepted: true,
  operatorArrived: true,
  startApproval: true,
  tripStarted: true,
  tripPaused: true,
  tripCompleted: true,
  tripCancelled: true,
  otherTripUpdates: true,
};

function storageKey(companyId = "", userId = "") {
  return `${STORAGE_PREFIX}${userId || "user"}.${companyId || "company"}`;
}

function normalizePreferences(settings = {}) {
  return { ...DEFAULT_COMPANY_NOTIFICATION_PREFERENCES, ...(settings || {}) };
}

function parseMetadata(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
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
  const next = writeLocalPreferences(companyId, userId, settings);
  if (!companyId || !userId) return next;

  const { error } = await supabase.from(TABLE).upsert({
    company_id: companyId,
    user_id: userId,
    settings: next,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,user_id" });

  if (error && !isMissingTable(error)) throw error;
  return next;
}

export function getCompanyActivityPreferenceKey(activity = {}) {
  const type = String(activity.activity_type || activity.activityType || "");
  if (type.startsWith("operator_invite_")) return "operatorInvitations";
  if (type !== "trip_status_updated") return "otherTripUpdates";

  const status = String(parseMetadata(activity.metadata).status || "").toLowerCase();
  const statusKeys = {
    accepted: "bookingAccepted",
    arrived: "operatorArrived",
    start_requested: "startApproval",
    in_progress: "tripStarted",
    paused: "tripPaused",
    completed: "tripCompleted",
    cancelled: "tripCancelled",
  };
  return statusKeys[status] || "otherTripUpdates";
}

export function companyActivityNotificationEnabled(activity, settings) {
  return normalizePreferences(settings)[getCompanyActivityPreferenceKey(activity)] !== false;
}

