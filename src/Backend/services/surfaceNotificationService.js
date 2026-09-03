import supabase from "../lib/supabaseClient";
import {
  mapSurfacePlatformNotification,
  notificationBelongsToSurface,
  surfaceSectors,
} from "./surfaceNotificationModels";

export {
  isLegacyMisroutedExploreNotification,
  mapSurfacePlatformNotification,
  notificationBelongsToSurface,
} from "./surfaceNotificationModels";

async function resolveUserId(userId = "") {
  if (userId) return userId;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

export async function fetchSurfacePlatformNotifications(surface, { limit = 100, userId = "" } = {}) {
  const currentUserId = await resolveUserId(userId);
  const sectors = surfaceSectors(surface);
  if (!currentUserId || !sectors.length) return [];

  let query = supabase
    .from("platform_notifications")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  query = sectors.length === 1 ? query.eq("sector", sectors[0]) : query.in("sector", sectors);

  const { data, error } = await query;
  if (error && /platform_notifications|schema cache|does not exist/i.test(error.message || "")) return [];
  if (error) throw error;

  const now = Date.now();
  return (data || [])
    .filter((row) => notificationBelongsToSurface(row, surface))
    .filter((row) => !row.dismissed_at && (!row.expires_at || new Date(row.expires_at).getTime() > now))
    .map(mapSurfacePlatformNotification);
}

export function markSurfacePlatformNotificationRead(item, { actioned = false } = {}) {
  const id = item?.platformNotificationId || item?.rawId;
  if (!id) return Promise.resolve();
  const at = new Date().toISOString();
  return supabase
    .from("platform_notifications")
    .update({
      status: "read",
      read_at: at,
      seen_at: at,
      ...(actioned ? { actioned_at: at } : {}),
    })
    .eq("id", id);
}

export async function subscribeToSurfacePlatformNotifications(surface, listener, { userId = "" } = {}) {
  const currentUserId = await resolveUserId(userId);
  if (!currentUserId || !surfaceSectors(surface).length || typeof listener !== "function") return () => {};

  const channel = supabase
    .channel(`surface-notifications-${surface}-${currentUserId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "platform_notifications", filter: `user_id=eq.${currentUserId}` },
      (payload) => {
        const row = payload.new || payload.old;
        if (notificationBelongsToSurface(row, surface)) listener(payload);
      },
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
