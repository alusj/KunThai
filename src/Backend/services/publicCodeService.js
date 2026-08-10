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
  const detectedKind = detectPublicCodeKind(value);
  if (!detectedKind) return null;
  const { data, error } = await supabase.rpc("resolve_kunthai_code", { lookup: String(value || "") });
  if (!error && data?.kind) {
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

  // Dedicated fallback for account IDs. Several invite fields need to remain
  // usable while older environments are still missing the cross-surface
  // resolver, and this hardened RPC is indexed on the canonical KTU identity.
  if (detectedKind === "kunthai") {
    const { data: rows, error: lookupError } = await supabase.rpc("lookup_kunthai_account_by_public_id", {
      input_public_id: String(value || ""),
    });
    if (lookupError) return null;
    const account = Array.isArray(rows) ? rows[0] : rows;
    if (!account?.user_id) return null;
    return {
      kind: "kunthai",
      code: account.public_id || String(value || ""),
      title: account.full_name || account.username || "KunThai account",
      subtitle: account.username ? `@${account.username}` : account.city || "",
      avatarUrl: account.avatar_url || "",
      userId: account.user_id,
      businessId: "",
      operatorId: "",
    };
  }

  return null;
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
