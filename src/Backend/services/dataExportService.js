import { Capacitor } from "@capacitor/core";
import supabase from "../lib/supabaseClient";
import { t as i18nText } from "../../i18n/index";

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

  report(i18nText("exploreSettingsFix.exportPreparing"));
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
    ["Your comments", () => supabase.from("explore_post_comments").select("*").eq("user_id", user.id).order("created_at", { ascending: false })],
    ["Posts you liked", () => supabase.from("explore_post_likes").select("*").eq("user_id", user.id)],
    ["Posts you saved", () => supabase.from("explore_post_saves").select("*").eq("user_id", user.id)],
    ["Comments you liked", () => supabase.from("explore_comment_likes").select("*").eq("user_id", user.id)],
    ["Explore settings", () => supabase.from("explore_user_preferences").select("*").eq("user_id", user.id)],
    ["Privacy settings", () => supabase.from("explore_user_privacy_settings").select("*").eq("user_id", user.id)],
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
  for (const [index, [label, buildQuery]] of sections.entries()) {
    report(i18nText("exploreSettingsFix.exportCollecting", { value0: index + 1, value1: sections.length }));
    const { rows, note } = await safeSelect(label, buildQuery);
    collected[label] = note && !rows.length ? { unavailable: note } : rows;
  }

  report(i18nText("exploreSettingsFix.exportPackaging"));
  return {
    exportedAt: new Date().toISOString(),
    application: "KunThai",
    format: "kunthai-data-export/v1",
    account,
    data: collected,
  };
}

function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Hands the export file to the person. Resolves what really happened:
//   "shared"      — the system share sheet took the file (save to Files, mail…)
//   "downloaded"  — the browser started a download
//   "cancelled"   — the share sheet was closed without choosing anything
//   "unavailable" — this device can neither share nor download the file
// The app has no Filesystem/Share plugin, so it relies on the WebView's
// Web Share support; a WebView cannot download files with <a download>.
export async function deliverDataExport(exportPayload) {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `kunthai-data-export-${stamp}.json`;
  const text = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([text], { type: "application/json" });

  const native = isNativeApp();
  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File === "function") {
    const file = new File([blob], name, { type: "application/json" });
    const canShareFile = typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : false;
    if (canShareFile && native) {
      try {
        await navigator.share({ files: [file], title: "KunThai data export" });
        return "shared";
      } catch (error) {
        return error?.name === "AbortError" ? "cancelled" : "unavailable";
      }
    }
  }

  if (native) return "unavailable";

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
