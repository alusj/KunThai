// Company alert switches (Fleet HQ > Company notifications) and which switch
// each company activity belongs to. No Supabase or DOM access, so it is
// unit-tested. Must match push_company_activity_preference_key in the database.

export const DEFAULT_COMPANY_NOTIFICATION_PREFERENCES = {
  newBookings: true,
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

export function normalizePreferences(settings = {}) {
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

export function getCompanyActivityPreferenceKey(activity = {}) {
  const type = String(activity.activity_type || activity.activityType || "");
  if (type.startsWith("operator_invite_")) return "operatorInvitations";
  // A new booking on a company fleet (push only; the app lists bookings from
  // its booking queue).
  if (type === "trip_requested") return "newBookings";
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
