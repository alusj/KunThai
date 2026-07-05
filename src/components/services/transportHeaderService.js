import supabase from "../../Backend/lib/supabaseClient";
import { getUnseenNotificationCount } from "../../Backend/services/notificationSeenStore";
import { fetchActiveTrips } from "./passengerTransportService";
import { getTransportCompanyBookingQueue } from "./transportCompanyService";
import { fetchOperatorDashboard } from "./transportOperatorAccountService";

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
    id: `trip-${trip.id}:${trip.rawStatus || trip.status || trip.stage || "updated"}`,
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

function mapCompanyBooking(booking) {
  return {
    id: `company-booking-${booking.id}`,
    type: "company_booking",
    title: "Company operator booking",
    body: `${booking.operatorName || "A company operator"} received a pending ${String(booking.requestType || "booking").toLowerCase()} request.`,
    meta: [booking.fleetName, booking.time].filter(Boolean).join(" - "),
    fleetId: booking.fleetId,
    createdAt: booking.createdAt || booking.time || "",
    unread: true,
  };
}

function mapCompanyActivity(activity) {
  return {
    id: `company-activity-${activity.id}`,
    type: "company_activity",
    title: activity.title || "Fleet HQ update",
    body: activity.body || "A company transport action was updated.",
    meta: formatTime(activity.created_at || activity.createdAt),
    createdAt: activity.created_at || activity.createdAt || "",
    unread: true,
  };
}

function sortNotifications(items = []) {
  return [...items].sort((a, b) => {
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function fetchTransportNotifications(operatorAccount, companyAccount, options = {}) {
  const includePassenger = options.includePassenger !== false;
  const includeOperator = options.includeOperator !== false;
  const includeCompany = options.includeCompany !== false;

  const tripNotifications = includePassenger
    ? (await fetchActiveTrips())
      .filter((trip) => !["requested", "waiting_operator", "pending_confirmation"].includes(trip.rawStatus))
      .map(mapTripNotification)
    : [];

  const companyItems = includeCompany && companyAccount?.id
    ? await Promise.all([
        getTransportCompanyBookingQueue(companyAccount).catch(() => []),
        Promise.resolve((companyAccount.activities || []).filter((activity) => {
          const type = String(activity.activity_type || activity.activityType || "");
          return type.startsWith("operator_invite_") || type === "trip_status_updated";
        })),
      ]).then(([bookings, activities]) => [
        ...bookings.map(mapCompanyBooking),
        ...activities.map(mapCompanyActivity),
      ])
    : [];

  if (!includeOperator || !operatorAccount?.id) {
    return sortNotifications([...companyItems, ...tripNotifications]);
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

  return sortNotifications([...(data || []).map(mapOperatorAlert), ...companyItems, ...tripNotifications]);
}

export async function fetchTransportOperationBadgeCount(operatorAccount, companyAccount) {
  // Badge counts only items the user has not yet viewed. Scopes and item ids
  // mirror the ones marked seen by OperatorDashboardScreen (operator-waiting-*)
  // and CompanyWorkspaceScreen (company-booking-*) so viewing those panels
  // clears the header and bottom-tab badges.
  const counts = await Promise.all([
    operatorAccount?.id
      ? fetchOperatorDashboard(operatorAccount.id, operatorAccount.fleetId || null)
        .then((dashboard) => dashboard?.waitingPassengers || [])
        .catch(() => operatorAccount?.dashboard?.waitingPassengers || [])
        .then((passengers) => getUnseenNotificationCount(
          `transport:${operatorAccount.id}`,
          passengers.map((passenger) => ({ ...passenger, id: `operator-waiting-${passenger.id}`, unread: true })),
          { unreadOnly: true },
        ))
      : Promise.resolve(0),
    companyAccount?.id
      ? getTransportCompanyBookingQueue(companyAccount)
        .then((bookings) => getUnseenNotificationCount(
          `transport:${companyAccount.id}`,
          bookings.map((booking) => ({ ...booking, id: `company-booking-${booking.id}`, unread: true })),
          { unreadOnly: true },
        ))
        .catch(() => 0)
      : Promise.resolve(0),
  ]);

  return counts.reduce((sum, count) => sum + Number(count || 0), 0);
}
