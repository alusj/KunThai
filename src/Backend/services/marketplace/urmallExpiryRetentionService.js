import supabase from "../../lib/supabaseClient";
import { invalidateCache } from "../../lib/queryCache";

export const URMALL_RETENTION_UPDATED_EVENT = "kunthai-urmall-retention-updated";

export function normalizeUrMallRetention(raw = {}) {
  const retention = raw.case;
  return {
    available: raw.available !== false,
    canSelect: raw.can_select === true,
    excessCount: Number(raw.pending_delete_count || 0),
    case: retention ? {
      id: retention.id,
      businessId: retention.business_id,
      status: retention.status,
      startedAt: retention.started_at,
      deleteAfter: retention.delete_after,
      deletedCount: Number(retention.deleted_count || 0),
      retainedIds: Array.isArray(retention.retained_ids)
        ? retention.retained_ids.filter((id) => raw.can_select !== true || raw.items?.some((item) => item.id === id && item.eligibleToKeep))
        : [],
    } : null,
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

export async function fetchUrMallRetention(businessId) {
  if (!businessId) return normalizeUrMallRetention();
  const { data, error } = await supabase.rpc("get_urmall_expiry_retention", { p_business_id: businessId });
  if (error) {
    // No warning/cleanup is invented before the database policy is deployed.
    if (["PGRST202", "42883"].includes(error.code)) return normalizeUrMallRetention({ available: false });
    throw new Error(error.message || "Unable to check your listing retention notice.");
  }
  return normalizeUrMallRetention(data);
}

export function notifyUrMallRetentionUpdated(businessId) {
  invalidateCache("marketplace-products|");
  invalidateCache("marketplace-promoted|");
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("kunthai.urmall.browse.catalog.v1");
  } catch { /* The next network read remains authoritative. */ }
  for (const name of [URMALL_RETENTION_UPDATED_EVENT, "marketplace-products-updated", "marketplace-vertical-listing-updated"]) {
    window.dispatchEvent(new CustomEvent(name, { detail: { businessId } }));
  }
}

export async function selectUrMallRetainedInventory(caseId, itemIds) {
  const { data, error } = await supabase.rpc("select_urmall_retained_inventory", {
    p_case_id: caseId,
    p_item_ids: itemIds,
  });
  if (error) throw new Error(error.message || "Unable to save your retained listings.");
  const state = normalizeUrMallRetention(data);
  notifyUrMallRetentionUpdated(state.case?.businessId);
  return state;
}
