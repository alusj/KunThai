// Which Supabase requests are reads, and so may wait out a lost connection and
// retry by themselves (see createReadRetryingFetch in networkService).
//
// Table reads are GET/HEAD. RPCs are always POST, so they are classified by the
// function itself: the list below is every RPC the app calls that Postgres
// records as STABLE or IMMUTABLE, and Postgres refuses to let such a function
// write. Anything not listed — including a new RPC nobody has added yet — is
// treated as a write and fails straight away, which is the safe default.
//
// Taken from the live database on 2026-09-21. To refresh it, list
//   select proname, provolatile from pg_proc p join pg_namespace n
//     on n.oid = p.pronamespace where nspname = 'public'
// and keep the names the client calls whose provolatile is 's' or 'i'.
export const READ_ONLY_RPCS = new Set([
  "admin_campaign_location_options",
  "admin_campaign_region_counts",
  "admin_check_campaign_test_recipient",
  "admin_dashboard_summary",
  "admin_estimate_campaign_audience",
  "admin_get_audit_log",
  "admin_get_campaign_metrics",
  "admin_get_user_workspace",
  "admin_get_user_workspace_v2",
  "admin_list_marketplace_conversations",
  "admin_list_team",
  "admin_lookup_campaign_user",
  "admin_search_campaign_users",
  "admin_search_users",
  "admin_search_users_v2",
  "admin_search_users_v3",
  "get_explore_ad_analytics",
  "get_explore_post_analytics",
  "get_explore_profile_directory",
  "get_marketplace_review_eligibility",
  "get_my_admin_access",
  "get_my_urmall_business_type_capacity",
  "get_public_transport_company_affiliations",
  "get_public_transport_company_profile",
  "get_public_transport_fleet_contacts",
  "get_public_transport_fleet_stats",
  "get_public_transport_operator_reviews",
  "get_recommended_explore_ads",
  "get_transport_company_review_eligibility",
  "get_transport_review_eligibility",
  "get_transport_trip_operator_contacts",
  "kunthai_get_client_country_config",
  "kunthai_get_country_regions",
  "kunthai_get_my_region",
  "kunthai_resolve_region_match",
  "list_transport_rentals",
  "match_contacts_to_kunthai_accounts",
  "search_public_transport_companies",
]);

const REST_PATH = /\/rest\/v1\/([^?#]*)/;

export function isRetryableSupabaseRead(url, method) {
  const match = REST_PATH.exec(String(url || ""));
  // Auth, storage and edge functions keep their own failure handling: auth
  // falls back to the cached session, and holding it would stall every action.
  if (!match) return false;
  const path = match[1];
  if (path.startsWith("rpc/")) {
    const name = path.slice(4).split("/")[0];
    return READ_ONLY_RPCS.has(name);
  }
  return method === "GET" || method === "HEAD";
}
