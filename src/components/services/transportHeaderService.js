import supabase from "../../Backend/lib/supabaseClient";
import { fetchActiveTrips } from "./passengerTransportService";

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapTripNotification(trip) {
  return {
    id: `trip-${trip.id}`,
    type: "trip",
    title: trip.title,
    body: `${trip.status} - ${trip.stage}`,
    meta: [trip.mode, trip.fare].filter(Boolean).join(" - "),
    fleetId: trip.fleetId,
    createdAt: "",
    unread: trip.priority === "live",
  };
}

function mapOperatorAlert(row) {
  return {
    id: `operator-alert-${row.id}`,
    type: "operator",
    title: row.title || "Operator alert",
    body: row.body || "",
    meta: formatTime(row.created_at),
    alertId: row.id,
    createdAt: row.created_at,
    unread: row.status !== "read",
  };
}

export async function fetchTransportNotifications(operatorAccount) {
  const passengerTrips = await fetchActiveTrips();
  const tripNotifications = passengerTrips.map(mapTripNotification);

  if (!operatorAccount?.id) {
    return tripNotifications;
  }

  const { data, error } = await supabase
    .from("transport_operator_alerts")
    .select("*")
    .eq("operator_id", operatorAccount.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    throw error;
  }

  return [...(data || []).map(mapOperatorAlert), ...tripNotifications].sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
