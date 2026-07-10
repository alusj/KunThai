// Cross-surface public ID lookup. Every KunThai account has a KTU- code,
// every UrMall business a UM- code, and every UrRide operator a KT- code.
// Pasting any of them into any search bar resolves to the owning entity via
// the resolve_kunthai_code RPC (security definer, so results are found even
// across surfaces the viewer has never opened).

import supabase from "../lib/supabaseClient";

export const CODE_SURFACE_LABELS = {
  kunthai: "Explore",
  urmall: "UrMall",
  urride: "UrRide",
};

function compactCode(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function detectPublicCodeKind(value = "") {
  const compact = compactCode(value);
  if (compact.startsWith("KTU")) return compact.length >= 6 ? "kunthai" : "";
  if (compact.startsWith("UM")) return compact.length >= 5 && /^\d+$/.test(compact.slice(2)) ? "urmall" : "";
  if (compact.startsWith("KT")) return compact.length >= 5 && /^\d+$/.test(compact.slice(2)) ? "urride" : "";
  return "";
}

export async function resolvePublicCode(value) {
  if (!detectPublicCodeKind(value)) return null;
  const { data, error } = await supabase.rpc("resolve_kunthai_code", { lookup: String(value || "") });
  if (error || !data?.kind) return null;
  return {
    kind: data.kind,
    code: data.code || "",
    title: data.title || "",
    subtitle: data.subtitle || "",
    avatarUrl: data.avatar_url || "",
    userId: data.user_id || "",
    businessId: data.business_id || "",
    operatorId: data.operator_id || "",
  };
}

// Navigation from a code result to its home surface. Each surface handles
// its own deep-open event; page switching goes through the main-page bus.
export function openPublicCodeResult(result) {
  if (!result?.kind) return;

  if (result.kind === "kunthai") {
    window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "explore" } }));
    window.dispatchEvent(new CustomEvent("kuntai-open-profile", {
      detail: { userId: result.userId, displayName: result.title, avatarUrl: result.avatarUrl },
    }));
    return;
  }

  if (result.kind === "urmall") {
    window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "marketplace" } }));
    window.dispatchEvent(new CustomEvent("marketplace-open-seller", {
      detail: { seller: { id: result.businessId, name: result.title, logoUrl: result.avatarUrl, city: result.subtitle } },
    }));
    return;
  }

  if (result.kind === "urride") {
    window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "transport" } }));
  }
}
