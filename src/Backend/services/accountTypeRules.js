// Account type rules (no app imports; unit-tested under Node).
//   personal — discovery, shopping and bookings; no UrMall/UrRide registration
//   business / both — may register UrMall businesses and UrRide fleets/companies
export const ACCOUNT_TYPES = ["personal", "business", "both"];

export function normalizeAccountType(value) {
  const type = String(value || "").trim().toLowerCase();
  return ACCOUNT_TYPES.includes(type) ? type : "personal";
}

export function accountTypeOfUser(user) {
  return normalizeAccountType(user?.user_metadata?.account_type);
}

export function canRegisterBusinesses(accountType) {
  const type = normalizeAccountType(accountType);
  return type === "business" || type === "both";
}

/** Switching to Personal is refused while UrMall or UrRide business accounts remain. */
export function personalSwitchBlocked(owned = {}) {
  return Boolean(owned.urmall || owned.urride);
}
