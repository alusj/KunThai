import supabase from "../lib/supabaseClient";

// Admin restrictions/suspensions affecting the signed-in user's own UrMall
// businesses, UrRide operator profile or UrRide company. Enforcement itself
// happens in the database (RLS + triggers); this only explains it to the
// owner. Never throws: a banner is a courtesy.
export async function getMyEnforcementNotices() {
  try {
    const { data, error } = await supabase.rpc("get_my_enforcement_notices");
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

const CAPABILITY_LABELS = {
  listings: "adding or editing listings",
  orders: "receiving new orders",
  promotions: "running promotions",
  messaging: "messaging customers",
  discovery: "appearing in search",
  trips: "taking new trips",
  operators: "inviting operators",
};

export function describeEnforcementNotice(notice) {
  if (!notice) return null;
  const suspended = notice.status === "suspended" || notice.status === "temporarily_suspended";
  const until = notice.ends_at ? new Date(notice.ends_at) : null;
  const blocked = (notice.capabilities || []).map((key) => CAPABILITY_LABELS[key] || key);
  return {
    suspended,
    title: suspended ? `${notice.label} is suspended` : `${notice.label} is restricted`,
    detail: suspended
      ? "Customers cannot see or use it while the suspension is in place."
      : `Paused: ${blocked.join(", ")}.`,
    message: notice.public_message || "",
    until,
  };
}
