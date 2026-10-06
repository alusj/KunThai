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
    throw new Error("KunThai could not delete your account right now. Please try again.");
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

export async function setAccountDeactivated(deactivated) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Sign in to manage your account.");
  }

  const { error } = await supabase
    .from("explore_profiles")
    .update({
      deactivated_at: deactivated ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      deactivated
        ? "KunThai could not deactivate your account right now. Please try again."
        : "KunThai could not reactivate your account right now. Please try again.",
    );
  }

  return deactivated;
}
