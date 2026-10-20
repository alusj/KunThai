import supabase from "../lib/supabaseClient";

// What KunThai still needs from the signed-in person to finish verifying
// them: open document requests, and requests they already answered that are
// waiting for another look. Empty when signed out or before the RPC exists.
export async function readMyVerificationRequests({ sector = "" } = {}) {
  try {
    const { data, error } = await supabase.rpc("get_my_verification_requests");
    if (error || !Array.isArray(data)) return [];
    return sector ? data.filter((entry) => entry?.sector === sector) : data;
  } catch {
    return [];
  }
}
