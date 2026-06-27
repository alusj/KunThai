import supabase from "../lib/supabaseClient";
import { isMissingTable } from "./explore/errors";

export async function getCurrentAccountControl(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("platform_account_controls")
    .select("user_id, status, reason, restricted_sectors, expires_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }

  if (data?.expires_at && new Date(data.expires_at) <= new Date()) return null;
  return data || null;
}

export function subscribeToAccountControl(userId, onChange) {
  if (!userId) return () => {};
  const channel = supabase
    .channel(`account-control:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "platform_account_controls", filter: `user_id=eq.${userId}` }, (payload) => {
      const next = payload.eventType === "DELETE" ? null : payload.new;
      if (next?.expires_at && new Date(next.expires_at) <= new Date()) onChange(null);
      else onChange(next || null);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
