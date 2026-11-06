import supabase from "../Backend/lib/supabaseClient";
import { isAdminPreview } from "./adminService";
import {
  previewChurnAccess,
  previewChurnAccessList,
  previewChurnCampaignAudience,
  previewChurnCampaignResults,
  previewChurnCampaignSend,
  previewChurnLeaders,
  previewChurnOverview,
  previewChurnProductDetail,
  previewChurnRegions,
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

// Phase 4: sector detail and regions ------------------------------------------

export async function getChurnProductDetail({ product, country } = {}) {
  if (isAdminPreview()) return previewDelay(previewChurnProductDetail(product, blank(country)));
  return unwrap(
    await supabase.rpc("admin_churn_product_detail", { p_product: product, p_country: blank(country) }),
    "Unable to load this sector.",
  );
}

export async function getChurnRegions({ country, product, parent = null } = {}) {
  if (isAdminPreview()) return previewDelay(previewChurnRegions(country, blank(product), parent));
  return unwrap(
    await supabase.rpc("admin_churn_regions", { p_country: country, p_product: blank(product), p_parent: parent }),
    "Unable to load areas.",
  );
}

// Phase 5: campaigns ---------------------------------------------------------------

function campaignArgs({ product, country, audience = "attention", signal = "", action = "", holdoutPct = 10 }) {
  // `action` narrows the audience to people this message is suggested for; the chosen
  // message itself goes as p_message_action on send.
  return {
    p_product: product,
    p_country: blank(country),
    p_status: audience,
    p_signal: signal || null,
    p_action: action || null,
    p_holdout_pct: holdoutPct,
  };
}

export async function previewChurnCampaign(input) {
  if (isAdminPreview()) return previewDelay(previewChurnCampaignAudience(input));
  return unwrap(await supabase.rpc("admin_churn_campaign_preview", campaignArgs(input)), "Unable to check this audience.");
}

export async function sendChurnCampaign(input) {
  if (isAdminPreview()) return previewDelay(previewChurnCampaignSend(input));
  return unwrap(
    await supabase.rpc("admin_churn_campaign_send", { ...campaignArgs(input), p_messages: input.messages, p_name: input.name || null, p_message_action: input.messageAction || null }),
    "Unable to send the campaign.",
  );
}

export async function getChurnCampaigns() {
  if (isAdminPreview()) return previewDelay(previewChurnCampaignResults());
  return unwrap(await supabase.rpc("admin_churn_campaigns", { p_limit: 50 }), "Unable to load campaign results.") || [];
}
