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
  const state = await fetchTransportOperationBadgeState(operatorAccount, companyAccount);
  return state.totalCount;
}

export async function fetchTransportOperationBadgeState(operatorAccount, companyAccount) {
  // Notification ids and scopes mirror the operator/company workspaces. Booking
  // counts stay tied to the live action queues and only clear after a status action.
  const companyAccess = companyAccount?.access || {};
  const canViewCompanyBookings = Boolean(
    companyAccess.isOwner || companyAccess.canViewAllBookings || companyAccess.operatorId,
  );
  const canViewCompanyNotifications = Boolean(
    companyAccess.isOwner || companyAccess.canViewCompanyActivity,
  );
  const [operatorState, companyState] = await Promise.all([
    operatorAccount?.id
      ? fetchOperatorDashboard(operatorAccount.id, operatorAccount.fleetId || null)
        .catch(() => operatorAccount?.dashboard || {})
        .then((dashboard) => {
          const scope = `transport:${operatorAccount.id}`;
          const bookingItems = (dashboard?.waitingPassengers || []).map((passenger) => ({
            ...passenger,
            id: `operator-waiting-${passenger.id}`,
            activityScope: scope,
            activitySource: "operator",
            unread: true,
          }));
          const notificationItems = (dashboard?.alerts || []).map((alert) => ({
            ...alert,
            id: `operator-alert-${alert.id}`,
            activityScope: scope,
            activitySource: "operator",
            unread: alert.status !== "read",
          }));
          return {
            bookingCount: bookingItems.length,
            notificationCount: getUnseenNotificationCount(scope, notificationItems, { unreadOnly: true }),
            bookingItems,
            notificationItems,
          };
        })
      : Promise.resolve({ bookingCount: 0, notificationCount: 0, bookingItems: [], notificationItems: [] }),
    companyAccount?.id && (canViewCompanyBookings || canViewCompanyNotifications)
      ? getTransportCompanyBookingQueue(companyAccount)
        .catch(() => [])
        .then((bookings) => {
          const scope = `transport:${companyAccount.id}`;
          const bookingItems = (canViewCompanyBookings ? bookings : []).map((booking) => ({
            ...booking,
            id: `company-booking-${booking.id}`,
            activityScope: scope,
            activitySource: "company",
            unread: true,
          }));
          const notificationItems = (canViewCompanyNotifications ? companyAccount.activities || [] : [])
            .filter((activity) => {
              const type = String(activity.activity_type || activity.activityType || "");
              return type.startsWith("operator_invite_") || type === "trip_status_updated";
            })
            .map((activity) => ({
              ...activity,
              id: `company-activity-${activity.id}`,
              activityScope: scope,
              activitySource: "company",
              unread: true,
            }));
          return {
            bookingCount: bookingItems.length,
            notificationCount: getUnseenNotificationCount(scope, notificationItems, { unreadOnly: true }),
            bookingItems,
            notificationItems,
          };
        })
      : Promise.resolve({ bookingCount: 0, notificationCount: 0, bookingItems: [], notificationItems: [] }),
  ]);

  const bookingCount = Number(operatorState.bookingCount || 0) + Number(companyState.bookingCount || 0);
  const notificationCount = Number(operatorState.notificationCount || 0) + Number(companyState.notificationCount || 0);
  return {
    bookingCount,
    notificationCount,
    totalCount: bookingCount + notificationCount,
    bookingItems: [...operatorState.bookingItems, ...companyState.bookingItems],
    notificationItems: [...operatorState.notificationItems, ...companyState.notificationItems],
  };
}
