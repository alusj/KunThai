import supabase from "../../Backend/lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "../../Backend/services/explore/errors";
import {
  formatCountryMoney,
  getActiveCountryProfile,
  getCountryCurrencyCode,
  normalizeCountryIso,
  storeCountryContext,
} from "../../data/westAfricanCountryProfiles";

const DRAFT_KEY = "kuntai.transport.operatorDraft";
const DRAFT_KEY_PREFIX = `${DRAFT_KEY}.`;
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

function normalizeOperatorCode(value) {
  const code = String(value || "").replace(/\D/g, "").slice(0, 5);
  return /^\d{5}$/.test(code) ? code : "";
}

function generateOperatorCode() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return String(10000 + (values[0] % 90000));
  }

  return String(Math.floor(10000 + Math.random() * 90000));
}

function normalizePlateNumber(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function getDraftKey(userId) {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

async function getCurrentUserId(message = "Sign in to manage your fleet.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user.id;
}

function mapOperatorAccount(row, fleet, extras = {}) {
  if (!row) return null;
  const countryProfile = getActiveCountryProfile(fleet?.country_iso || row.country_iso || fleet?.country || row.country);

  const form = {
    name: row.full_name || "",
    phone: row.phone || "",
    country: fleet?.country || row.country || countryProfile.name,
    countryCode: fleet?.country_iso || row.country_iso || countryProfile.iso2,
    currency: fleet?.currency || row.currency || countryProfile.currency.code,
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
    userId: row.user_id || "",
    fleetId: fleet?.id || "",
    operatorId: row.operator_code,
    displayCode: row.display_code || `KT-${row.operator_code}`,
    form,
    answers: fleet?.safety_answers || {},
    uploads: extras.uploads || {},
    documentsSkipped: Boolean(row.documents_skipped),
    verificationStatus: normalizeVerification(fleet?.verification_status || row.verification_status),
    activeStatus: fleet?.active_status || "offline",
    isVisibleToPassengers: Boolean(fleet?.is_visible_to_passengers ?? true),
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

function resolveCurrencyCode(value = "") {
  const raw = String(value || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return getCountryCurrencyCode(normalizeCountryIso(value));
}

function hasMissingCountryContextColumn(error) {
  return ["country", "country_iso", "currency"].some((column) => isMissingColumn(error, column));
}

function withoutCountryContext(payload) {
  const { country: _country, country_iso: _countryIso, currency: _currency, ...rest } = payload;
  return rest;
}

async function updateSelectSingle(tableName, payload, match = {}, optionalColumns = []) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    let query = supabase.from(tableName).update(nextPayload);
    Object.entries(match).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    const { data, error } = await query.select().maybeSingle();

    if (!error) return data;

    const missingColumn = optionalColumns.find((column) => nextPayload[column] !== undefined && isMissingColumn(error, column));
    if (!missingColumn) throw error;

    const { [missingColumn]: _removed, ...withoutMissingColumn } = nextPayload;
    nextPayload = withoutMissingColumn;
  }

  return null;
}

async function insertSelectSingle(tableName, payload, optionalColumns = []) {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase
      .from(tableName)
      .insert(nextPayload)
      .select()
      .maybeSingle();

    if (!error) return data;

    const missingColumn = optionalColumns.find((column) => nextPayload[column] !== undefined && isMissingColumn(error, column));
    if (!missingColumn) throw error;

    const { [missingColumn]: _removed, ...withoutMissingColumn } = nextPayload;
    nextPayload = withoutMissingColumn;
  }

  return null;
}

function uploadKeyToDocumentType(key = "") {
  if (key.startsWith("doc-additional-")) {
    return `Additional document ${key.replace("doc-additional-", "")}`;
  }
  if (key.startsWith("doc-")) return key.replace("doc-", "");
  if (key.startsWith("fleet-")) return `Fleet photo - ${key.replace("fleet-", "")}`;
  return key;
}

function normalizeUploadDocumentEntries(uploads = {}) {
  const now = new Date().toISOString();
  return Object.entries(uploads)
    .map(([key, fileName]) => {
      const name = typeof fileName === "string" ? fileName : fileName?.name || "";
      if (!name) return null;
      return {
        documentType: uploadKeyToDocumentType(key),
        fileName: name,
        uploadedAt: now,
        metadata: {
          source: key.startsWith("fleet-") ? "fleet_registration" : "operator_registration",
          fieldKey: key,
        },
      };
    })
    .filter(Boolean);
}

async function saveOperatorDocumentRows(operatorId, uploads = {}) {
  const entries = normalizeUploadDocumentEntries(uploads);
  if (!operatorId || !entries.length) return [];

  const { data: existingRows, error: existingError } = await supabase
    .from("transport_operator_documents")
    .select("*")
    .eq("operator_id", operatorId);

  if (existingError) throw existingError;

  const existingByType = new Map((existingRows || []).map((row) => [String(row.document_type || "").toLowerCase(), row]));
  const optionalColumns = ["file_name", "file_url", "document_url", "status", "metadata", "uploaded_at", "updated_at"];
  const savedRows = [];

  for (const entry of entries) {
    const payload = {
      operator_id: operatorId,
      document_type: entry.documentType,
      file_name: entry.fileName,
      file_url: null,
      document_url: null,
      status: "verification_pending",
      metadata: entry.metadata,
      uploaded_at: entry.uploadedAt,
      updated_at: new Date().toISOString(),
    };
    const existing = existingByType.get(entry.documentType.toLowerCase());
    const saved = existing?.id
      ? await updateSelectSingle("transport_operator_documents", payload, { id: existing.id }, optionalColumns)
      : await insertSelectSingle("transport_operator_documents", payload, optionalColumns);
    savedRows.push(saved || payload);
  }

  return savedRows;
}

function buildCountryContext(form = {}) {
  const countryProfile = getActiveCountryProfile(form.countryCode || form.country);
  const country = form.country || countryProfile.name;
  storeCountryContext(countryProfile.iso2);
  return {
    country,
    country_iso: countryProfile.iso2,
    currency: form.currency || countryProfile.currency.code,
  };
}

function mapTrip(row) {
  const tripType = row.trip_type || row.trip_mode || "ride";
  const pickupLat = parseOptionalCoordinate(row.pickup_latitude);
  const pickupLng = parseOptionalCoordinate(row.pickup_longitude);
  const destinationLat = parseOptionalCoordinate(row.destination_latitude);
  const destinationLng = parseOptionalCoordinate(row.destination_longitude);
  const fareCurrency = resolveCurrencyCode(row.fare_currency || row.country_iso || row.country);
  return {
    id: row.id,
    fleetId: row.fleet_id || "",
    passengerId: row.passenger_id,
    name: row.passenger_name || "Passenger",
    title: row.title || `${tripType === "delivery" ? "Package delivery" : "Passenger ride"} request`,
    mode: tripType === "delivery" ? "Delivery" : "Ride",
    pickup: row.pickup_label || "Pickup pending",
    destination: row.destination_label || "Destination pending",
    route: [row.pickup_label, row.destination_label].filter(Boolean).join(" to ") || "Passenger request",
    time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
    fare: row.fare_amount ? formatCountryMoney(row.fare_amount, fareCurrency) : "Fare pending",
    note: row.status || "Waiting for operator",
    status: row.status,
    rawStatus: row.status,
    tripType,
    requestType: tripType === "delivery" ? "Package delivery" : "Passenger ride",
    packageDescription: row.package_description || "",
    bookingMethod: row.booking_method || "distance",
    estimatedDistanceKm: Number(row.estimated_distance_km || 0),
    bookedHours: Number(row.booked_hours || 0),
    distanceCoveredMeters: Number(row.distance_covered_meters || 0),
    startedAt: row.started_at || "",
    completedAt: row.completed_at || "",
    pausedAt: row.paused_at || "",
    pausedSeconds: Number(row.paused_seconds || 0),
    contactPhone: row.contact_phone || "",
    fareAmount: Number(row.fare_amount || 0),
    fareCurrency,
    lastLocationLatitude: parseOptionalCoordinate(row.last_location_latitude),
    lastLocationLongitude: parseOptionalCoordinate(row.last_location_longitude),
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
  const currency = resolveCurrencyCode(row.currency || row.country_iso || row.country);
  return {
    id: row.id,
    type: row.transaction_type,
    amount: Number(row.amount || 0),
    currency,
    status: row.status,
    description: row.description || "",
    createdAt: row.created_at,
  };
}

export async function getOperatorDraft() {
  const userId = await getCurrentUserId("Sign in to continue your fleet draft.");
  const scopedDraft = safeParse(localStorage.getItem(getDraftKey(userId)));
  if (scopedDraft?.userId === userId) return scopedDraft;

  const legacyDraft = safeParse(localStorage.getItem(DRAFT_KEY));
  if (legacyDraft?.userId === userId) return legacyDraft;
  if (legacyDraft) localStorage.removeItem(DRAFT_KEY);
  return null;
}

export async function saveOperatorDraft(draft) {
  const userId = await getCurrentUserId("Sign in before saving your fleet draft.");
  const scopedDraft = { ...draft, userId };
  localStorage.setItem(getDraftKey(userId), JSON.stringify(scopedDraft));
  localStorage.removeItem(DRAFT_KEY);
  return scopedDraft;
}

export function getLegacyOperatorAccount() {
  const stored = safeParse(localStorage.getItem(LEGACY_ACCOUNT_KEY));
  return stored?.userId ? stored : null;
}

export async function getOperatorAccount() {
  const userId = await getCurrentUserId();
  const { data: operator, error } = await supabase
    .from("transport_operators")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!operator) {
    localStorage.removeItem(LEGACY_ACCOUNT_KEY);
    return null;
  }

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

  const errors = [
    waitingError,
    todayError,
    historyError,
    alertsError,
    reviewsError,
    transactionsError,
    documentsError && !isMissingTable(documentsError) ? documentsError : null,
  ].filter(Boolean);
  if (errors.length) throw new Error(errors[0].message);
  const operatorDocuments = documentsError && isMissingTable(documentsError) ? [] : documents || [];

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
      documents: operatorDocuments,
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
  const requestedOperatorCode = normalizeOperatorCode(account.operatorId || account.displayCode);
  const plateNumber = normalizePlateNumber(form.plateNumber);
  const documentsSkipped = Boolean(account.documentsSkipped);
  const verificationStatus = documentsSkipped ? "not_verified" : "verification_pending";
  const countryContext = buildCountryContext(form);

  if (!plateNumber) {
    throw new Error("Plate number is required so this fleet cannot be confused with another operator.");
  }

  const { data: existingOperator, error: existingOperatorError } = await supabase
    .from("transport_operators")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingOperatorError) throw new Error(existingOperatorError.message);

  const operatorPayload = {
    user_id: userId,
    full_name: form.name?.trim() || "Operator",
    phone: form.phone?.trim() || "",
    city: form.city?.trim() || "",
    ...countryContext,
    emergency_contact: form.emergencyContact?.trim() || "",
    documents_skipped: documentsSkipped,
    verification_status: verificationStatus,
    account_status: "submitted",
    profile_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let operator = existingOperator;

  if (existingOperator?.id) {
    let { data, error } = await supabase
      .from("transport_operators")
      .update(operatorPayload)
      .eq("id", existingOperator.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error && hasMissingCountryContextColumn(error)) {
      const fallback = await supabase
        .from("transport_operators")
        .update(withoutCountryContext(operatorPayload))
        .eq("id", existingOperator.id)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    operator = data;
  } else {
    let lastError = null;
    const seedCode = requestedOperatorCode || generateOperatorCode();
    const codeAttempts = [seedCode, ...Array.from({ length: 8 }, generateOperatorCode)];

    for (const operatorCode of codeAttempts) {
      let { data, error } = await supabase
        .from("transport_operators")
        .insert({
          ...operatorPayload,
          operator_code: operatorCode,
        })
        .select()
        .maybeSingle();

      if (error && hasMissingCountryContextColumn(error)) {
        const fallback = await supabase
          .from("transport_operators")
          .insert({
            ...withoutCountryContext(operatorPayload),
            operator_code: operatorCode,
          })
          .select()
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }

      if (!error) {
        operator = data;
        break;
      }

      lastError = error;
      if (error.code !== "23505") break;
    }

    if (!operator) {
      throw new Error(
        lastError?.code === "23505"
          ? "KunThai could not reserve a unique operator code. Please submit again."
          : lastError?.message || "Unable to create operator profile.",
      );
    }
  }

  const { data: plateConflict, error: plateConflictError } = await supabase
    .from("transport_fleets")
    .select("id, operator_id")
    .eq("plate_number", plateNumber)
    .neq("operator_id", operator.id)
    .limit(1);

  if (plateConflictError) throw new Error(plateConflictError.message);
  if (plateConflict?.length) {
    throw new Error("This plate number is already registered to another operator.");
  }

  const { data: existingFleets, error: existingFleetError } = await supabase
    .from("transport_fleets")
    .select("*")
    .eq("operator_id", operator.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingFleetError) throw new Error(existingFleetError.message);

  const fleetPayload = {
    operator_id: operator.id,
    service_category: normalizeCategory(form.category),
    fleet_type: normalizeFleetType(form.fleetType),
    fleet_name: form.fleetName?.trim() || form.fleetType || "Registered Fleet",
    plate_number: plateNumber,
    make: form.make?.trim() || "",
    model: form.model?.trim() || "",
    manufacture_year: form.year ? Number(form.year) : null,
    color: form.color?.trim() || "",
    operating_area: form.operatingArea?.trim() || "",
    availability: form.availability || "Full-time",
    home_base_location: form.homeBaseLocation?.trim() || "",
    ...countryContext,
    fuel_type: form.fuelType?.trim() || "",
    car_body_type: form.carBodyType?.trim() || "",
    max_load: form.maxLoad?.trim() || "",
    delivery_body_type: form.deliveryBodyType?.trim() || "",
    base_fare: form.baseFare ? Number(form.baseFare) : null,
    price_per_km: form.pricePerKm ? Number(form.pricePerKm) : null,
    price_per_hour: form.pricePerHour ? Number(form.pricePerHour) : null,
    price_hint: form.priceHint?.trim() || [
      form.pricePerKm ? `${formatCountryMoney(form.pricePerKm, form.currency || form.countryCode || form.country)} per km` : "",
      form.pricePerHour ? `${formatCountryMoney(form.pricePerHour, form.currency || form.countryCode || form.country)} per hour` : "",
    ].filter(Boolean).join(" | "),
    safety_answers: account.answers || {},
    verification_status: verificationStatus,
    accepts_ride: ["Transport", "Both"].includes(form.category),
    accepts_delivery: ["Delivery", "Both"].includes(form.category),
    is_visible_to_passengers: true,
    updated_at: new Date().toISOString(),
  };

  const existingFleet = existingFleets?.[0];
  const fleetQuery = existingFleet?.id
    ? supabase.from("transport_fleets").update(fleetPayload).eq("id", existingFleet.id)
    : supabase.from("transport_fleets").insert(fleetPayload);

  let { data: fleet, error: fleetError } = await fleetQuery.select().maybeSingle();

  if (fleetError && hasMissingCountryContextColumn(fleetError)) {
    const fallbackFleetPayload = withoutCountryContext(fleetPayload);
    const fallbackFleetQuery = existingFleet?.id
      ? supabase.from("transport_fleets").update(fallbackFleetPayload).eq("id", existingFleet.id)
      : supabase.from("transport_fleets").insert(fallbackFleetPayload);
    const fallback = await fallbackFleetQuery.select().maybeSingle();
    fleet = fallback.data;
    fleetError = fallback.error;
  }

  if (fleetError) throw new Error(fleetError.message);

  if (!documentsSkipped) {
    try {
      await saveOperatorDocumentRows(operator.id, account.uploads || {});
    } catch (error) {
      if (!isMissingTable(error)) throw new Error(error.message || "Unable to save operator documents.");
    }
  }

  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(getDraftKey(userId));
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
      is_visible_to_passengers: true,
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
    isVisibleToPassengers: Boolean(data?.is_visible_to_passengers ?? true),
    savedAt: data?.updated_at || now,
    dashboard: data ? { fleet: data } : undefined,
  });

  return data || {
    id: fleetId,
    active_status: activeStatus,
    is_visible_to_passengers: true,
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
