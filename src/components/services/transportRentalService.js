import supabase from "../../Backend/lib/supabaseClient";

export async function listTransportRentals({ rentalId = null, companyId = null, country = null } = {}) {
  const { data, error } = await supabase.rpc("list_transport_rentals", { p_rental_id: rentalId, p_company_id: companyId, p_country: country });
  if (error) throw new Error(["PGRST202", "42883"].includes(error.code)
    ? "Rental listings are being prepared. Please try again shortly."
    : "Rental listings could not be loaded. Check your connection and try again.");
  return data || [];
}

export async function saveTransportRental(fleetId, details) {
  const { data, error } = await supabase.rpc("save_transport_rental", { p_fleet_id: fleetId, p_details: details });
  if (error) throw new Error(error.message);
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
