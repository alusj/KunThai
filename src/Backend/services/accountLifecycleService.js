import supabase from "../lib/supabaseClient";
import { apiUrl } from "../lib/apiUrl";
import { APPLE_NATIVE_CLIENT_ID, canUseNativeAppleSignIn, confirmAppleForAccountDeletion } from "./appleNativeSignIn";

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

// Accounts with a linked Apple identity must have their Apple tokens revoked
// (App Store requirement) before the account is deleted. On iOS the person
// confirms with the Apple sheet and the server revokes; if that is cancelled
// or fails, nothing is deleted and they can try again. Web and Android have
// no native Apple confirmation, so deletion goes ahead there unchanged (the
// person can still remove KunThai under Apple ID → Sign in with Apple).
// Accounts without Apple (Google, Facebook, phone, email) skip this entirely.
async function revokeAppleBeforeDeletion() {
  if (!canUseNativeAppleSignIn()) return;
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const session = sessionData?.session;
  const identities = userData?.user?.identities || session?.user?.identities || [];
  if (!identities.some((identity) => identity?.provider === "apple") || !session?.access_token) return;

  const confirmation = await confirmAppleForAccountDeletion();
  if (confirmation.status === "cancelled") {
    throw new Error("Apple confirmation needed");
  }

  let response;
  try {
    response = await fetch(apiUrl("/api/apple-revoke"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ authorizationCode: confirmation.authorizationCode, clientId: APPLE_NATIVE_CLIENT_ID }),
    });
  } catch {
    throw new Error("Apple disconnect failed");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    throw new Error(result?.code === "apple_account_mismatch" ? "Wrong Apple ID used" : "Apple disconnect failed");
  }
}

export async function deleteKunThaiAccount() {
  await revokeAppleBeforeDeletion();

  const { error } = await supabase.rpc("delete_kunthai_account");

  if (error) {
    const failure = new Error("KunThai could not delete your account right now. Please try again.");
    // The database's own reason, shown small under the buttons so a blocked
    // delete can be traced (e.g. a protection rule or a linked record).
    failure.detail = [error.message, error.details].filter(Boolean).join(" | ").slice(0, 240);
    throw failure;
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The auth user is already gone; local cleanup below is enough.
  }

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Storage can be unavailable (private mode); safe to ignore.
  }
}

export async function fetchAccountDeactivation() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("explore_profiles")
    .select("deactivated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return data?.deactivated_at || null;
}

const DEACTIVATION_CHECK_MS = 30_000;
let deactivationCheck = { at: 0, promise: null };

/**
 * Whether the signed-in account is deactivated, cached for 30 s so composers
 * and the comments drawer stay instant. The database refuses posts and
 * comments from a deactivated account anyway; this only explains it early.
 */
export function checkOwnAccountDeactivated() {
  if (!deactivationCheck.promise || Date.now() - deactivationCheck.at > DEACTIVATION_CHECK_MS) {
    deactivationCheck = { at: Date.now(), promise: fetchAccountDeactivation().then(Boolean).catch(() => false) };
  }
  return deactivationCheck.promise;
}

export async function setAccountDeactivated(deactivated) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in to manage your account.");
  }

  // .select() returns the rows really changed: RLS or a missing profile turns
  // the update into a silent no-op otherwise. Posts of a deactivated account
  // are hidden from feeds server-side (explore_author_is_deactivated read rule
  // and the ranked feed functions, migration 20261006150000).
  const { data, error } = await supabase
    .from("explore_profiles")
    .update({
      deactivated_at: deactivated ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("user_id, deactivated_at");

  if (error || !data?.length || Boolean(data[0].deactivated_at) !== Boolean(deactivated)) {
    throw new Error(
      deactivated
        ? "KunThai could not deactivate your account right now. Please try again."
        : "KunThai could not reactivate your account right now. Please try again.",
    );
  }

  deactivationCheck = { at: Date.now(), promise: Promise.resolve(Boolean(deactivated)) };
  return deactivated;
}
