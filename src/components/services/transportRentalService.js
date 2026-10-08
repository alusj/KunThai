import supabase from "../../Backend/lib/supabaseClient";

import { createRentalCatalogueCache } from "./rentalCatalogueCache";
const catalogueCache = createRentalCatalogueCache((country) => listTransportRentals({ country }));
export const cachedRentalCatalogue = (country) => catalogueCache.read(country);
export const loadRentalCatalogue = (country, force = false) => catalogueCache.load(country, force);

async function rentalRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  if (!name.startsWith("list_") && !name.startsWith("check_")) catalogueCache.clear();
  return data;
}
export const setRentalAvailability = (id, available) => rentalRpc("set_transport_rental_availability", { p_rental_id: id, p_available: available });
export const deleteRentalFleet = (id) => rentalRpc("delete_transport_rental_fleet", { p_rental_id: id });
export const checkRentalAvailability = (id, startsAt, endsAt) => rentalRpc("check_transport_rental_availability", { p_rental_id: id, p_starts_at: new Date(startsAt).toISOString(), p_ends_at: new Date(endsAt).toISOString() });
export const listRentalReviews = (id) => rentalRpc("list_transport_rental_reviews", { p_rental_id: id });
export const saveRentalReview = (id, rating, body) => rentalRpc("save_transport_rental_review", { p_rental_id: id, p_rating: rating, p_body: body });
const REVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Whether the signed-in renter may post (or once edit) a review, using the
// server's own rules. Before that function is deployed, fall back to the same
// 30-day completed-rental window from the renter's reservations.
export async function getRentalReviewEligibility(rentalId) {
  const { data, error } = await supabase.rpc("get_transport_rental_review_eligibility", { p_rental_id: rentalId });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return { eligible: Boolean(row?.eligible), mode: row?.mode || "" };
  }
  if (!["PGRST202", "42883"].includes(error.code)) throw new Error(error.message);
  const rows = await listRentalReservations(rentalId);
  const now = Date.now();
  const recent = rows.some((row) => row.status === "completed"
    && now - new Date(row.completed_at || row.updated_at).getTime() < REVIEW_WINDOW_MS);
  return { eligible: recent, mode: recent ? "new" : "" };
}
export const proposeRentalPrice = (id, total) => rentalRpc("propose_transport_rental_price", { p_reservation_id: id, p_total: total });
export const acceptRentalPrice = (id, total) => rentalRpc("accept_transport_rental_price", { p_reservation_id: id, p_total: total });

const RENTAL_PAGE_SIZE = 200;
const RENTAL_MAX_PAGES = 10;

function rentalListError(error) {
  return new Error(["PGRST202", "42883"].includes(error.code)
    ? "Rental listings are being prepared. Please try again shortly."
    : "Rental listings could not be loaded. Check your connection and try again.");
}

// Reads every page of listings (the server returns at most one page per call).
export async function listTransportRentals({ rentalId = null, companyId = null, country = null } = {}) {
  const base = { p_rental_id: rentalId, p_company_id: companyId, p_country: country };
  const rows = [];
  for (let page = 0; page < RENTAL_MAX_PAGES; page += 1) {
    const { data, error } = await supabase.rpc("list_transport_rentals", { ...base, p_limit: RENTAL_PAGE_SIZE, p_offset: page * RENTAL_PAGE_SIZE });
    if (error) {
      // Older servers have no paging parameters; they return a single page.
      if (page === 0 && ["PGRST202", "42883"].includes(error.code)) {
        const legacy = await supabase.rpc("list_transport_rentals", base);
        if (legacy.error) throw rentalListError(legacy.error);
        return legacy.data || [];
      }
      throw rentalListError(error);
    }
    rows.push(...(data || []));
    if (!data || data.length < RENTAL_PAGE_SIZE) break;
  }
  return rows;
}

export async function saveTransportRental(fleetId, details) {
  const { data, error } = await supabase.rpc("save_transport_rental", { p_fleet_id: fleetId, p_details: details });
  if (error) throw new Error(error.message);
  catalogueCache.clear();
  return data;
}

export async function listRentalReservations(rentalId = null) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    if (rentalId) return [];
    throw new Error("Sign in to view your rental reservations.");
  }
  let query = supabase.from("transport_rental_reservations").select("*").order("created_at", { ascending: false });
  if (rentalId) query = query.eq("rental_id", rentalId);
  else query = query.eq("customer_user_id", user.id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function requestTransportRental(rentalId, form) {
  const { data, error } = await supabase.rpc("request_transport_rental", {
    p_rental_id: rentalId, p_starts_at: new Date(form.startsAt).toISOString(), p_ends_at: new Date(form.endsAt).toISOString(),
    p_rate_unit: form.unit, p_customer_name: form.name, p_contact_phone: form.phone, p_note: form.note || "",
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function listCompanyRentalActivity(rentalIds) {
  if (!rentalIds.length) return [];
  // RLS still restricts these records to the company owner and active admins.
  const rows = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from("transport_rental_reservations")
      .select("id,rental_id,status,customer_name,starts_at,ends_at,created_at")
      .in("rental_id", rentalIds).order("created_at", { ascending: false }).order("id")
      .range(start, start + pageSize - 1);
    if (error) throw new Error("Rental activity could not be loaded. Refresh to try again.");
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function updateRentalReservation(id, status) {
  const { error } = await supabase.rpc("update_transport_rental_reservation", { p_reservation_id: id, p_status: status });
  if (error) throw new Error(error.message);
}

export function subscribeRentalChanges(onChange, rentalId = null) {
  const channel = supabase.channel(`rentals-${rentalId || "all"}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_rental_reservations", ...(rentalId ? { filter: `rental_id=eq.${rentalId}` } : {}) }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_company_rentals" }, onChange).subscribe();
  return () => supabase.removeChannel(channel);
}
