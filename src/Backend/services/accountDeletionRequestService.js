import supabase from "../lib/supabaseClient";
import { isMissingTable } from "./explore/errors";
import { readRegisteredBusiness, readRegisteredBusinesses } from "./marketplace/sellerRegistrationService";
import { getOnboardingProfile } from "./onboardingService";

async function getCurrentUser(message = "Sign in before requesting account deletion.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user;
}

function pick(row = {}, keys = []) {
  return Object.fromEntries(keys.map((key) => [key, row[key] ?? ""]));
}

function countResult(result) {
  if (result.error && !isMissingTable(result.error)) throw new Error(result.error.message);
  if (result.error && isMissingTable(result.error)) return { rows: [], count: 0 };
  return { rows: result.data || [], count: Number(result.count ?? (result.data || []).length) };
}

async function recentRows(table, select, column, value, limit = 6) {
  return countResult(await supabase
    .from(table)
    .select(select, { count: "exact" })
    .eq(column, value)
    .order("created_at", { ascending: false })
    .limit(limit));
}

async function submitDeletionRequest({ surface, targetId, reason, snapshot }) {
  const { data, error } = await supabase.rpc("request_account_deletion", {
    surface_key: surface,
    target_id: targetId,
    request_reason: String(reason || "").trim(),
    source_snapshot: snapshot,
  });

  if (error) throw new Error(error.message || "Unable to send this deletion request to admin.");
  return data;
}

export async function requestUrMallAccountDeletion(businessId, reason = "") {
  const user = await getCurrentUser("Sign in before requesting business deletion.");
  const businesses = await readRegisteredBusinesses();
  const activeBusiness = businesses.find((business) => business.id === businessId) || await readRegisteredBusiness();
  if (!activeBusiness?.id || activeBusiness.id !== businessId) {
    throw new Error("Choose one of your own UrMall businesses before requesting deletion.");
  }

  const [
    orders,
    messages,
    products,
    bookings,
    menuItems,
    hotelRooms,
    propertyListings,
  ] = await Promise.all([
    recentRows("marketplace_orders", "id,status,total_amount,buyer_name,preview,item_count,created_at", "business_id", businessId),
    recentRows("marketplace_customer_messages", "id,buyer_name,topic,preview,message_type,unread,created_at", "business_id", businessId),
    recentRows("marketplace_products", "id,name,status,stock,price,category,created_at", "business_id", businessId),
    recentRows("marketplace_vertical_bookings", "id,listing_name,listing_type,buyer_name,phone,status,start_date,end_date,created_at", "business_id", businessId),
    recentRows("marketplace_restaurant_menu_items", "id,name,available,price,created_at", "business_id", businessId),
    recentRows("marketplace_hotel_rooms", "id,name,nightly_rate,rooms_available,active,created_at", "business_id", businessId),
    recentRows("marketplace_property_listings", "id,title,purpose,property_type,price,availability_status,published,created_at", "business_id", businessId),
  ]);

  const snapshot = {
    id: activeBusiness.id,
    surface: "UrMall",
    surface_key: "urmall_business",
    user_id: user.id,
    reporter_id: user.id,
    business_id: activeBusiness.id,
    business_name: activeBusiness.identity?.businessName || "UrMall business",
    account_name: activeBusiness.identity?.businessName || "UrMall business",
    business_kind: activeBusiness.businessKind || "retail",
    verification_status: activeBusiness.verificationStatus || "",
    readiness_score: activeBusiness.readinessScore || 0,
    country: activeBusiness.location?.country || "",
    country_iso: activeBusiness.location?.countryIso || "",
    city: activeBusiness.location?.city || "",
    address: activeBusiness.location?.address || "",
    phone: activeBusiness.location?.phone || "",
    email: activeBusiness.location?.email || "",
    logo_url: activeBusiness.identity?.logoUrl || "",
    banner_url: activeBusiness.identity?.bannerUrl || "",
    reason: String(reason || "").trim(),
    products_count: products.count,
    orders_count: orders.count,
    messages_count: messages.count,
    bookings_count: bookings.count,
    menu_items_count: menuItems.count,
    hotel_rooms_count: hotelRooms.count,
    property_listings_count: propertyListings.count,
    recent_orders: orders.rows.map((row) => pick(row, ["id", "status", "total_amount", "buyer_name", "preview", "item_count", "created_at"])),
    recent_messages: messages.rows.map((row) => pick(row, ["id", "buyer_name", "topic", "preview", "message_type", "unread", "created_at"])),
    recent_bookings: bookings.rows.map((row) => pick(row, ["id", "listing_name", "listing_type", "buyer_name", "phone", "status", "start_date", "end_date", "created_at"])),
    recent_products: products.rows.map((row) => pick(row, ["id", "name", "status", "stock", "price", "category", "created_at"])),
  };

  return submitDeletionRequest({
    surface: "urmall_business",
    targetId: activeBusiness.id,
    reason,
    snapshot,
  });
}

export async function requestUrRideAccountDeletion(reason = "") {
  const user = await getCurrentUser("Sign in before requesting UrRide account deletion.");
  const profile = await getOnboardingProfile(user).catch(() => null);
  const [trips, supportTickets] = await Promise.all([
    recentRows("transport_trips", "id,status,trip_type,title,pickup_label,destination_label,fare_amount,fare_currency,created_at", "passenger_id", user.id),
    recentRows("transport_support_tickets", "id,topic,priority,status,created_at", "passenger_id", user.id),
  ]);

  const displayName = profile?.displayName || profile?.fullName || profile?.full_name || user.user_metadata?.full_name || user.email || "UrRide passenger";
  const snapshot = {
    id: user.id,
    surface: "UrRide",
    surface_key: "urride_account",
    user_id: user.id,
    reporter_id: user.id,
    account_name: displayName,
    email: user.email || profile?.email || "",
    phone: profile?.phone || profile?.phoneNumber || profile?.phone_number || "",
    country: profile?.country || "",
    country_iso: profile?.countryCode || profile?.country_code || "",
    reason: String(reason || "").trim(),
    trips_count: trips.count,
    support_tickets_count: supportTickets.count,
    recent_trips: trips.rows.map((row) => pick(row, ["id", "status", "trip_type", "title", "pickup_label", "destination_label", "fare_amount", "fare_currency", "created_at"])),
    recent_support_tickets: supportTickets.rows.map((row) => pick(row, ["id", "topic", "priority", "status", "created_at"])),
  };

  return submitDeletionRequest({
    surface: "urride_account",
    targetId: user.id,
    reason,
    snapshot,
  });
}
