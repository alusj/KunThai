import { supabase } from "../supabaseClient";

export async function saveSearchHistory({
  userId,
  searchText,
  placeName,
  placeAddress,
  lat,
  lng,
  category = null,
  selected = true,
}) {
  if (!userId || !searchText) return;

  try {
    await supabase.from("nearby_area_search_history").insert({
      user_id: userId,
      search_text: searchText,
      place_name: placeName,
      place_address: placeAddress,
      lat,
      lng,
      category,
      selected,
    });
  } catch (error) {
    console.error("saveSearchHistory", error);
  }
}

export async function getRecentSearchHistory(userId) {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("nearby_area_search_history")
      .select("*")
      .eq("user_id", userId)
      .order("searched_at", { ascending: false })
      .limit(12);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("getRecentSearchHistory", error);
    return [];
  }
}

export async function getApprovedNearbyLocations() {
  try {
    const { data, error } = await supabase
      .from("nearby_area_locations")
      .select("*")
      .eq("status", "approved")
      .eq("visibility", "public")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("getApprovedNearbyLocations", error);
    return [];
  }
}

export async function getLiveOperators() {
  try {
    const { data, error } = await supabase
      .from("transport_operator_locations")
      .select("*")
      .eq("available", true)
      .in("status", ["online", "busy"]);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("getLiveOperators", error);
    return [];
  }
}

export async function getTrafficSnapshots() {
  try {
    const { data, error } = await supabase
      .from("nearby_area_traffic_snapshots")
      .select("*");

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("getTrafficSnapshots", error);
    return [];
  }
}

export async function getNearbyReports() {
  try {
    const { data, error } = await supabase
      .from("nearby_area_reports")
      .select("*")
      .in("status", ["submitted", "verified"]);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error("getNearbyReports", error);
    return [];
  }
}

export function subscribeToOperators(callback) {
  return supabase
    .channel("transport_operator_locations_live")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "transport_operator_locations",
      },
      (payload) => {
        callback?.(payload);
      }
    )
    .subscribe();
}

export function subscribeToTraffic(callback) {
  return supabase
    .channel("nearby_area_traffic_live")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "nearby_area_traffic_snapshots",
      },
      (payload) => {
        callback?.(payload);
      }
    )
    .subscribe();
}

export function subscribeToReports(callback) {
  return supabase
    .channel("nearby_area_reports_live")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "nearby_area_reports",
      },
      (payload) => {
        callback?.(payload);
      }
    )
    .subscribe();
}