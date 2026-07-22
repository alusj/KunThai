import supabase from "../lib/supabaseClient";

// Personal data export. Every query below runs as the signed-in user, so RLS
// guarantees the export can only ever contain the requester's own rows. Tables
// that do not exist yet (or fail) are skipped instead of failing the export.

async function safeSelect(label, buildQuery) {
  try {
    const { data, error } = await buildQuery();
    if (error) return { label, rows: [], note: error.message };
    return { label, rows: data || [] };
  } catch (error) {
    return { label, rows: [], note: error?.message || "Unavailable" };
  }
}

export async function collectKunThaiDataExport(onProgress) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user?.id) {
    throw new Error("Sign in again to export your data.");
  }

  const report = (step) => {
    try {
      onProgress?.(step);
    } catch {
      // Progress display is best-effort.
    }
  };

  report("Preparing your account summary...");
  const account = {
    id: user.id,
    email: user.email || null,
    phone: user.phone || null,
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    provider: user.app_metadata?.provider || null,
    metadata: user.user_metadata || {},
  };

  const sections = [
    ["Explore profile", () => supabase.from("explore_profiles").select("*").eq("user_id", user.id)],
    ["Explore posts", () => supabase.from("explore_posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false })],
    ["People you follow", () => supabase.from("explore_follows").select("*").eq("follower_id", user.id)],
    ["Identity connections", () => supabase.from("explore_identity_connections").select("*").eq("connector_user_id", user.id)],
    ["Spaces you own", () => supabase.from("explore_spaces").select("*").eq("owner_user_id", user.id)],
    ["UrMall businesses", () => supabase.from("marketplace_businesses").select("*").eq("user_id", user.id)],
    ["UrMall orders", () => supabase.from("marketplace_orders").select("*").eq("buyer_id", user.id).order("created_at", { ascending: false })],
    ["UrMall reviews", () => supabase.from("marketplace_reviews").select("*").eq("buyer_id", user.id)],
    ["UrRide trips", () => supabase.from("transport_trips").select("*").eq("passenger_id", user.id).order("created_at", { ascending: false })],
    ["UrRide operator reviews", () => supabase.from("transport_operator_reviews").select("*").eq("passenger_id", user.id)],
    ["Visibility credit wallet", () => supabase.from("visibility_credit_wallets").select("*").eq("user_id", user.id)],
    ["Visibility credit history", () => supabase.from("visibility_credit_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false })],
    ["Invite links", () => supabase.from("visibility_invite_links").select("*").eq("user_id", user.id)],
  ];

  const collected = {};
  for (const [label, buildQuery] of sections) {
    report(`Collecting ${label.toLowerCase()}...`);
    const { rows, note } = await safeSelect(label, buildQuery);
    collected[label] = note && !rows.length ? { unavailable: note } : rows;
  }

  report("Packaging your export...");
  return {
    exportedAt: new Date().toISOString(),
    application: "KunThai",
    format: "kunthai-data-export/v1",
    account,
    data: collected,
  };
}

export function downloadDataExport(exportPayload) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kunthai-data-export-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
