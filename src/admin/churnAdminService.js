import supabase from "../Backend/lib/supabaseClient";
import { isAdminPreview } from "./adminService";
import {
  previewChurnAccess,
  previewChurnAccessList,
  previewChurnLeaders,
  previewChurnOverview,
  previewChurnWatchlist,
} from "./churnPreviewData";

const previewDelay = (value) => new Promise((resolve) => window.setTimeout(() => resolve(structuredClone(value)), 150));

function unwrap(result, fallbackMessage) {
  if (result.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

const blank = (value) => (value && value !== "all" ? value : null);

export async function getChurnAccess() {
  if (isAdminPreview()) return previewDelay(previewChurnAccess);
  return unwrap(await supabase.rpc("admin_churn_access"), "Unable to load churn intelligence.");
}

export async function getChurnOverview({ country, product } = {}) {
  if (isAdminPreview()) return previewDelay(previewChurnOverview(blank(country), blank(product)));
  return unwrap(
    await supabase.rpc("admin_churn_overview", { p_country: blank(country), p_product: blank(product) }),
    "Unable to load churn intelligence.",
  );
}

export async function getChurnLeaders({ country, product, days = 30 } = {}) {
  if (isAdminPreview()) return previewDelay(previewChurnLeaders(blank(country), blank(product), days));
  return unwrap(
    await supabase.rpc("admin_churn_leaders", { p_country: blank(country), p_product: blank(product), p_days: days }),
    "Unable to load growth and leaders.",
  );
}

export async function getChurnWatchlist({ country, product, status = "attention", search = "", limit = 50, offset = 0 } = {}) {
  if (isAdminPreview()) return previewDelay(previewChurnWatchlist(blank(country), blank(product), status));
  return unwrap(
    await supabase.rpc("admin_churn_watchlist", {
      p_country: blank(country),
      p_product: blank(product),
      p_status: status,
      p_search: search.trim() || null,
      p_limit: limit,
      p_offset: offset,
    }),
    "Unable to load the watchlist.",
  );
}

export async function getChurnAccessList() {
  if (isAdminPreview()) return previewDelay(previewChurnAccessList);
  return unwrap(await supabase.rpc("admin_churn_list_access"), "Unable to load churn access.") || [];
}

export async function setChurnProductScopes(assignmentId, products, reason = "") {
  if (isAdminPreview()) return previewDelay({ assignmentId, products });
  return unwrap(
    await supabase.rpc("admin_set_churn_product_scopes", { p_assignment_id: assignmentId, p_products: products, p_reason: reason }),
    "Unable to save access.",
  );
}
