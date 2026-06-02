import supabase from "../../Backend/lib/supabaseClient";

const DRAFT_KEY = "kuntai.transport.operatorDraft";
const LEGACY_ACCOUNT_KEY = "kuntai.transport.operatorAccount";

function safeParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function normalizeVerification(value) {
  const map = {
    not_verified: "notVerified",
    verification_pending: "pending",
    verified: "verified",
    verified_recommended: "recommended",
    notVerified: "notVerified",
    pending: "pending",
    recommended: "recommended",
  };

  return map[value] || value || "pending";
}

function normalizeCategory(value) {
  return String(value || "Transport").toLowerCase();
}

function normalizeFleetType(value) {
  return String(value || "Car").toLowerCase();
}

function displayCategory(value) {
  const map = { transport: "Transport", delivery: "Delivery", both: "Both" };
  return map[value] || value || "Transport";
}

function displayFleetType(value) {
  const map = { car: "Car", motorcycle: "Motorcycle", tricycle: "Tricycle" };
  return map[value] || value || "Fleet";
}

async function getCurrentUserId(message = "Sign in to manage your fleet.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user.id;
}

function mapOperatorAccount(row, fleet, extras = {}) {
  if (!row) return null;

  const form = {
    name: row.full_name || "",
    phone: row.phone || "",
    city: row.city || "",
    emergencyContact: row.emergency_contact || "",
    category: displayCategory(fleet?.service_category),
    fleetType: displayFleetType(fleet?.fleet_type),
    plateNumber: fleet?.plate_number || "",
    fleetName: fleet?.fleet_name || "",
    make: fleet?.make || "",
    model: fleet?.model || "",
    year: fleet?.manufacture_year ? String(fleet.manufacture_year) : "",
    color: fleet?.color || "",
    operatingArea: fleet?.operating_area || "",
    availability: fleet?.availability || "Full-time",
    fuelType: fleet?.fuel_type || "",
    carBodyType: fleet?.car_body_type || "",
    maxLoad: fleet?.max_load || "",
    baseFare: fleet?.base_fare ? String(fleet.base_fare) : "",
    pricePerKm: fleet?.price_per_km ? String(fleet.price_per_km) : "",
    pricePerHour: fleet?.price_per_hour ? String(fleet.price_per_hour) : "",
    priceHint: fleet?.price_hint || "",
    homeBaseLocation: fleet?.home_base_location || "",
    deliveryBodyType: fleet?.delivery_body_type || "",
  };

  return {
    id: row.id,
    fleetId: fleet?.id || "",
    operatorId: row.operator_code,
    displayCode: row.display_code || `KT-${row.operator_code}`,
    form,
    answers: fleet?.safety_answers || {},
    uploads: extras.uploads || {},
    documentsSkipped: Boolean(row.documents_skipped),
    verificationStatus: normalizeVerification(fleet?.verification_status || row.verification_status),
    activeStatus: fleet?.active_status || "offline",
    isVisibleToPassengers: Boolean(fleet?.is_visible_to_passengers),
    walletBalance: Number(row.wallet_balance || 0),
    pendingPayout: Number(row.pending_payout || 0),
    status: row.account_status || "pending_review",
    savedAt: row.updated_at || row.created_at,
    dashboard: extras.dashboard || null,
  };
}

function patchStoredOperatorAccount(patch) {
  if (typeof localStorage === "undefined") return;
  const stored = safeParse(localStorage.getItem(LEGACY_ACCOUNT_KEY));
  if (!stored) return;

  localStorage.setItem(
    LEGACY_ACCOUNT_KEY,
    JSON.stringify({
      ...stored,
      ...patch,
      dashboard: stored.dashboard && patch.dashboard
        ? { ...stored.dashboard, ...patch.dashboard }
        : patch.dashboard || stored.dashboard,
    }),
  );
}

function parseOptionalCoordinate(value) {
  if (value == null || value === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function mapTrip(row) {
  const tripType = row.trip_type || row.trip_mode || "ride";
  const pickupLat = parseOptionalCoordinate(row.pickup_latitude);
  const pickupLng = parseOptionalCoordinate(row.pickup_longitude);
  const destinationLat = parseOptionalCoordinate(row.destination_latitude);
  const destinationLng = parseOptionalCoordinate(row.destination_longitude);
  return {
    id: row.id,
    passengerId: row.passenger_id,
    name: row.passenger_name || "Passenger",
    pickup: row.pickup_label || "Pickup pending",
    destination: row.destination_label || "Destination pending",
    route: [row.pickup_label, row.destination_label].filter(Boolean).join(" to ") || "Passenger request",
    time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    fare: row.fare_amount ? `${row.fare_currency || "SLE"} ${Number(row.fare_amount).toFixed(2)}` : "Fare pending",
    note: row.status || "Waiting for operator",
    status: row.status,
    tripType,
    requestType: tripType === "delivery" ? "Package delivery" : "Passenger ride",
    packageDescription: row.package_description || "",
    bookingMethod: row.booking_method || "distance",
    estimatedDistanceKm: Number(row.estimated_distance_km || 0),
    bookedHours: Number(row.booked_hours || 0),
    pickupPoint: pickupLat != null && pickupLng != null
      ? { lat: pickupLat, lng: pickupLng }
      : null,
    destinationPoint: destinationLat != null && destinationLng != null
      ? { lat: destinationLat, lng: destinationLng }
      : null,
    raw: row,
  };
}

function mapReview(row) {
  return {
    id: row.id,
    passengerName: row.passenger_name || "Passenger",
    rating: Number(row.rating || 0),
    reviewText: row.review_text || "",
    responseText: row.response_text || "",
    createdAt: row.created_at,
  };
}

function mapAlert(row) {
  return {
    id: row.id,
    type: row.alert_type,
    status: row.status,
    title: row.title,
    body: row.body || "",
    actionLabel: row.action_label || "",
    actionTarget: row.action_target || "",
    createdAt: row.created_at,
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    type: row.transaction_type,
    amount: Number(row.amount || 0),
    currency: row.currency || "SLE",
    status: row.status,
    description: row.description || "",
    createdAt: row.created_at,
  };
}

export function getOperatorDraft() {
  return safeParse(localStorage.getItem(DRAFT_KEY));
}

export function saveOperatorDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

export function getLegacyOperatorAccount() {
  return safeParse(localStorage.getItem(LEGACY_ACCOUNT_KEY));
}

export async function getOperatorAccount() {
  const userId = await getCurrentUserId();
  const { data: operator, error } = await supabase
    .from("transport_operators")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!operator) return null;

  const [{ data: fleets, error: fleetError }, dashboard] = await Promise.all([
    supabase
      .from("transport_fleets")
      .select("*")
      .eq("operator_id", operator.id)
      .order("updated_at", { ascending: false })
      .limit(1),
    fetchOperatorDashboard(operator.id),
  ]);

  if (fleetError) throw new Error(fleetError.message);

  const account = mapOperatorAccount(operator, fleets?.[0], { dashboard });
  localStorage.setItem(LEGACY_ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export async function fetchOperatorDashboard(operatorId = null) {
  let resolvedOperatorId = operatorId;

  if (!resolvedOperatorId) {
    const userId = await getCurrentUserId();
    const { data: operator, error } = await supabase
      .from("transport_operators")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    resolvedOperatorId = operator?.id;
  }

  if (!resolvedOperatorId) return null;

  const { data: operator, error: operatorError } = await supabase
    .from("transport_operators")
    .select("*")
    .eq("id", resolvedOperatorId)
    .maybeSingle();
  if (operatorError) throw new Error(operatorError.message);
  if (!operator) return null;

  const { data: fleets, error: fleetError } = await supabase
    .from("transport_fleets")
    .select("*")
    .eq("operator_id", operator.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (fleetError) throw new Error(fleetError.message);

  const fleet = fleets?.[0] || null;
  const fleetId = fleet?.id;

  const [
    { data: waitingTrips, error: waitingError },
    { data: todayTrips, error: todayError },
    { data: historyTrips, error: historyError },
    { data: alerts, error: alertsError },
    { data: reviews, error: reviewsError },
    { data: transactions, error: transactionsError },
    { data: documents, error: documentsError },
  ] = await Promise.all([
    fleetId
      ? supabase
          .from("transport_trips")
          .select("*")
          .eq("fleet_id", fleetId)
          .in("status", ["pending_confirmation", "waiting_operator", "requested", "accepted", "arrived", "start_requested", "in_progress", "paused"])
          .order("created_at", { ascending: false })
      : { data: [], error: null },
    fleetId
      ? supabase
          .from("transport_trips")
          .select("*")
          .eq("fleet_id", fleetId)
          .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      : { data: [], error: null },
    fleetId
      ? supabase
          .from("transport_trips")
          .select("*")
          .eq("fleet_id", fleetId)
          .in("status", ["completed", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [], error: null },
    supabase
      .from("transport_operator_alerts")
      .select("*")
      .eq("operator_id", operator.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("transport_operator_reviews")
      .select("*")
      .eq("operator_id", operator.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("transport_operator_transactions")
      .select("*")
      .eq("operator_id", operator.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("transport_operator_documents")
      .select("*")
      .eq("operator_id", operator.id)
      .order("uploaded_at", { ascending: false }),
  ]);

  const errors = [waitingError, todayError, historyError, alertsError, reviewsError, transactionsError, documentsError].filter(Boolean);
  if (errors.length) throw new Error(errors[0].message);

  const completedToday = (todayTrips || []).filter((trip) => trip.status === "completed");
  const earningsToday = completedToday.reduce((sum, trip) => sum + Number(trip.fare_amount || 0), 0);
  const averageRating = reviews?.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : Number(fleet?.rating || 0);

  return {
    operator,
    fleet,
    waitingPassengers: (waitingTrips || []).map(mapTrip),
    tripHistory: (historyTrips || []).map(mapTrip),
    today: {
      trips: completedToday.length,
      earnings: earningsToday,
      acceptanceRate: Number(fleet?.acceptance_rate || 0),
      averageResponseSeconds: Number(fleet?.average_response_seconds || 0),
    },
    tripControls: {
      acceptsRide: Boolean(fleet?.accepts_ride),
      acceptsDelivery: Boolean(fleet?.accepts_delivery),
      maxDistanceKm: fleet?.max_distance_km || "",
      startTime: fleet?.operating_hours_start || "",
      endTime: fleet?.operating_hours_end || "",
      pauseReason: fleet?.pause_reason || "",
    },
    verificationCenter: {
      status: normalizeVerification(fleet?.verification_status || operator.verification_status),
      note: operator.verification_note || "",
      documents: documents || [],
    },
    earnings: {
      walletBalance: Number(operator.wallet_balance || 0),
      pendingPayout: Number(operator.pending_payout || 0),
      today: earningsToday,
      transactions: (transactions || []).map(mapTransaction),
    },
    reviews: {
      averageRating,
      count: reviews?.length || 0,
      items: (reviews || []).map(mapReview),
    },
    alerts: (alerts || []).map(mapAlert),
  };
}

export async function saveOperatorAccount(account) {
  const userId = await getCurrentUserId("Sign in before submitting your fleet.");
  const form = account.form || {};
  const operatorCode = account.operatorId || account.displayCode?.replace("KT-", "");
  const documentsSkipped = Boolean(account.documentsSkipped);
  const verificationStatus = documentsSkipped ? "not_verified" : "verification_pending";

  const { data: operator, error: operatorError } = await supabase
    .from("transport_operators")
    .upsert(
      {
        user_id: userId,
        operator_code: operatorCode,
        full_name: form.name?.trim() || "Operator",
        phone: form.phone?.trim() || "",
        city: form.city?.trim() || "",
        emergency_contact: form.emergencyContact?.trim() || "",
        documents_skipped: documentsSkipped,
        verification_status: verificationStatus,
        account_status: "submitted",
        profile_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "operator_code" },
    )
    .select()
    .maybeSingle();

  if (operatorError) throw new Error(operatorError.message);

  const { data: fleet, error: fleetError } = await supabase
    .from("transport_fleets")
    .upsert(
      {
        operator_id: operator.id,
        service_category: normalizeCategory(form.category),
        fleet_type: normalizeFleetType(form.fleetType),
        fleet_name: form.fleetName?.trim() || form.fleetType || "Registered Fleet",
        plate_number: form.plateNumber?.trim() || "NO-PLATE",
        make: form.make?.trim() || "",
        model: form.model?.trim() || "",
        manufacture_year: form.year ? Number(form.year) : null,
        color: form.color?.trim() || "",
        operating_area: form.operatingArea?.trim() || "",
        availability: form.availability || "Full-time",
        home_base_location: form.homeBaseLocation?.trim() || "",
        fuel_type: form.fuelType?.trim() || "",
        car_body_type: form.carBodyType?.trim() || "",
        max_load: form.maxLoad?.trim() || "",
        delivery_body_type: form.deliveryBodyType?.trim() || "",
        base_fare: form.baseFare ? Number(form.baseFare) : null,
        price_per_km: form.pricePerKm ? Number(form.pricePerKm) : null,
        price_per_hour: form.pricePerHour ? Number(form.pricePerHour) : null,
        price_hint: form.priceHint?.trim() || [
          form.pricePerKm ? `SLE ${Number(form.pricePerKm).toLocaleString()} per km` : "",
          form.pricePerHour ? `SLE ${Number(form.pricePerHour).toLocaleString()} per hour` : "",
        ].filter(Boolean).join(" | "),
        safety_answers: account.answers || {},
        verification_status: verificationStatus,
        accepts_ride: ["Transport", "Both"].includes(form.category),
        accepts_delivery: ["Delivery", "Both"].includes(form.category),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "operator_id,plate_number" },
    )
    .select()
    .maybeSingle();

  if (fleetError) throw new Error(fleetError.message);

  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(LEGACY_ACCOUNT_KEY);

  const dashboard = await fetchOperatorDashboard(operator.id);
  return mapOperatorAccount(operator, fleet, { dashboard });
}

export async function updateOperatorAvailability(fleetId, active, pauseReason = "") {
  if (!fleetId) throw new Error("Fleet profile is missing.");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("transport_fleets")
    .update({
      active_status: active ? "active" : "offline",
      is_visible_to_passengers: Boolean(active),
      pause_reason: active ? "" : pauseReason,
      last_active_at: now,
      updated_at: now,
    })
    .eq("id", fleetId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  const activeStatus = data?.active_status || (active ? "active" : "offline");
  patchStoredOperatorAccount({
    activeStatus,
    isVisibleToPassengers: Boolean(data?.is_visible_to_passengers ?? active),
    savedAt: data?.updated_at || now,
    dashboard: data ? { fleet: data } : undefined,
  });

  return data || {
    id: fleetId,
    active_status: activeStatus,
    is_visible_to_passengers: Boolean(active),
    updated_at: now,
  };
}

export async function updateTripControls(fleetId, controls) {
  if (!fleetId) throw new Error("Fleet profile is missing.");
  const { error } = await supabase
    .from("transport_fleets")
    .update({
      accepts_ride: Boolean(controls.acceptsRide),
      accepts_delivery: Boolean(controls.acceptsDelivery),
      max_distance_km: controls.maxDistanceKm ? Number(controls.maxDistanceKm) : null,
      operating_hours_start: controls.startTime || null,
      operating_hours_end: controls.endTime || null,
      pause_reason: controls.pauseReason || "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", fleetId);

  if (error) throw new Error(error.message);
}

export async function markOperatorAlertRead(alertId) {
  if (!alertId) return;
  const { error } = await supabase
    .from("transport_operator_alerts")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) throw new Error(error.message);
}

export function subscribeOperatorTrips(fleetId, onChange) {
  if (!fleetId || typeof onChange !== "function") return () => {};

  const channel = supabase
    .channel(`transport-operator-trips-${fleetId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transport_trips", filter: `fleet_id=eq.${fleetId}` },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function clearOperatorAccount() {
  localStorage.removeItem(LEGACY_ACCOUNT_KEY);
  localStorage.removeItem(DRAFT_KEY);
}
