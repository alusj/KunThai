import supabase from "../../lib/supabaseClient";
import {
  campaignRowInInbox,
  campaignRowInbox,
  isCampaignDelivery,
} from "./campaignModel";

// Admin campaign deliveries in the KunThai app: reading a person's campaign
// rows for a given inbox and recording what they did with them.
//
// Every receipt goes to the person's own platform_notifications row; the
// database guard trigger only lets them set timestamps (never content), so
// these writes are the analytics the admin campaign center reports.

export const CAMPAIGN_DELIVERIES_CHANGED_EVENT = "kunthai-campaign-deliveries-changed";

function notifyChanged(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CAMPAIGN_DELIVERIES_CHANGED_EVENT, { detail }));
}

function rowId(row) {
  return row?.platformNotificationId || row?.rawId || row?.id;
}

async function patchRow(row, patch) {
  const id = rowId(row);
  if (!id || String(id).includes(":")) return;
  const { error } = await supabase.from("platform_notifications").update(patch).eq("id", id);
  if (error) throw error;
  notifyChanged({ id, patch });
}

/** Whether a campaign row is still live (not expired, not removed from the inbox). */
export function campaignRowIsLive(row = {}, now = Date.now()) {
  if (row.status === "archived") return false;
  return !row.expires_at || new Date(row.expires_at).getTime() > now;
}

/** Inbox filter for any platform_notifications list. Non-campaign rows pass through. */
export function platformRowBelongsInInbox(row = {}, inbox, now = Date.now()) {
  if (!isCampaignDelivery(row)) return true;
  return campaignRowIsLive(row, now) && campaignRowInInbox(row) && campaignRowInbox(row) === inbox;
}

const SECTOR_FOR_INBOX = {
  explore: ["explore", "platform", "all"],
  urmall: ["marketplace"],
  "urmall.seller": ["marketplace"],
  urride: ["transport"],
  "urride.operator": ["transport"],
  "urride.company": ["transport"],
};

async function currentUserId(userId) {
  if (userId) return userId;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

/** Campaign rows for one inbox (seller dashboard, operator dashboard, …). */
export async function fetchCampaignInbox(inbox, { userId = "", limit = 50 } = {}) {
  const id = await currentUserId(userId);
  const sectors = SECTOR_FOR_INBOX[inbox];
  if (!id || !sectors) return [];
  const { data, error } = await supabase
    .from("platform_notifications")
    .select("*")
    .eq("user_id", id)
    .in("sector", sectors)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error && /platform_notifications|schema cache|does not exist/i.test(error.message || "")) return [];
  if (error) throw error;
  const now = Date.now();
  return (data || []).filter((row) => isCampaignDelivery(row) && platformRowBelongsInInbox(row, inbox, now));
}

export async function subscribeToCampaignDeliveries(listener, { userId = "" } = {}) {
  const id = await currentUserId(userId);
  if (!id || typeof listener !== "function") return () => {};
  const onLocalChange = () => listener();
  window.addEventListener(CAMPAIGN_DELIVERIES_CHANGED_EVENT, onLocalChange);
  const channel = supabase
    .channel(`campaign-deliveries-${id}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "platform_notifications", filter: `user_id=eq.${id}` }, listener)
    .subscribe();
  return () => {
    window.removeEventListener(CAMPAIGN_DELIVERIES_CHANGED_EVENT, onLocalChange);
    supabase.removeChannel(channel);
  };
}

// --- Receipts ----------------------------------------------------------------------------

/** The card/sheet/banner/inline card was shown on screen. */
export function recordCampaignPresented(row) {
  const at = new Date().toISOString();
  return patchRow(row, {
    displayed_at: row.displayed_at || at,
    seen_at: row.seen_at || at,
    last_presented_at: at,
    presentation_count: Number(row.presentation_count || 0) + 1,
  });
}

/** The row was listed in an inbox the person opened. */
export function recordCampaignSeenInInbox(row) {
  if (row.seen_at) return Promise.resolve();
  const at = new Date().toISOString();
  return patchRow(row, { seen_at: at, displayed_at: row.displayed_at || at });
}

/** Opened from an inbox (counts as read). */
export function recordCampaignRead(row) {
  if (row.read_at || row.status === "read") return Promise.resolve();
  const at = new Date().toISOString();
  return patchRow(row, { status: "read", read_at: at, seen_at: row.seen_at || at });
}

/** Tapped. `cta` is true when the action button (not just the card) was used. */
export function recordCampaignClick(row, { cta = false } = {}) {
  const at = new Date().toISOString();
  return patchRow(row, {
    status: "read",
    read_at: row.read_at || at,
    seen_at: row.seen_at || at,
    clicked_at: row.clicked_at || at,
    ...(cta ? { cta_clicked_at: row.cta_clicked_at || at, actioned_at: row.actioned_at || at } : {}),
  });
}

/**
 * Closed an on-screen presentation. The inbox copy of a "+ inbox"
 * presentation stays; a card-only presentation is removed entirely.
 */
export function recordCampaignDismissed(row) {
  const at = new Date().toISOString();
  return patchRow(row, {
    dismissed_at: row.dismissed_at || at,
    ...(campaignRowInInbox(row) ? {} : { status: "archived" }),
  });
}

/** Removed from an inbox list by the person. */
export function archiveCampaignInboxItem(row) {
  const at = new Date().toISOString();
  return patchRow(row, { status: "archived", dismissed_at: row.dismissed_at || at });
}

export function snoozeCampaign(row, until) {
  return patchRow(row, { snoozed_until: until });
}
