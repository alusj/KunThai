import supabase from "../lib/supabaseClient";

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

export async function deleteKunThaiAccount() {
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
