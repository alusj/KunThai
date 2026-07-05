import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "../explore/errors";
import { validateVerticalMediaPackage } from "./verticalMediaValidation";

const BUSINESS_SELECT = "id,business_name,business_kind,description,city,country,country_iso,currency,address,phone,logo_url,banner_url,vertical_video_url,latitude,longitude,verification_status,open_time,close_time,delivery_enabled,pickup_enabled";
const COUNTRY_TIMEZONES = {
  BJ: "Africa/Porto-Novo", BF: "Africa/Ouagadougou", CV: "Atlantic/Cape_Verde", CI: "Africa/Abidjan",
  GM: "Africa/Banjul", GH: "Africa/Accra", GN: "Africa/Conakry", GW: "Africa/Bissau",
  LR: "Africa/Monrovia", ML: "Africa/Bamako", MR: "Africa/Nouakchott", NE: "Africa/Niamey",
  NG: "Africa/Lagos", SN: "Africa/Dakar", SL: "Africa/Freetown", TG: "Africa/Lome",
};
const WEEKDAY_INDEX = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

export function getMarketplaceBusinessDay(countryIso = "") {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: COUNTRY_TIMEZONES[String(countryIso).toUpperCase()] || "UTC" }).format(new Date());
    return WEEKDAY_INDEX[weekday] ?? new Date().getUTCDay();
  } catch {
    return new Date().getUTCDay();
  }
}

function nestedBusiness(row = {}) {
  const business = Array.isArray(row.marketplace_businesses) ? row.marketplace_businesses[0] : row.marketplace_businesses;
  return business || {};
}

function normalizeBusinessRow(row = {}) {
  const business = nestedBusiness(row);
  return {
    ...row,
    businessId: row.business_id,
    businessName: business.business_name || "UrMall business",
    businessKind: business.business_kind || "retail",
    city: row.city || business.city || "",
    country: business.country || "",
    countryIso: business.country_iso || "",
    currency: business.currency || "",
    address: row.address || business.address || "",
    phone: business.phone || "",
    description: business.description || "",
    logoUrl: business.logo_url || "",
    bannerUrl: business.banner_url || "",
    latitude: business.latitude ?? null,
    longitude: business.longitude ?? null,
    videoUrl: row.video_url || business.vertical_video_url || "",
    verificationStatus: business.verification_status || "pending",
    deliveryEnabled: Boolean(business.delivery_enabled),
    pickupEnabled: Boolean(business.pickup_enabled),
  };
}

function throwOrEmpty(error, message) {
  if (!error) return;
  if (isMissingTable(error)) return [];
  throw new Error(error.message || message);
}

export async function uploadMarketplaceVerticalImage(file, businessId, folder = "verticals") {
  if (!file) return "";
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) throw new Error("Sign in before uploading business images.");
  const extension = file.name?.split(".").pop() || "jpg";
  const path = `${userData.user.id}/${folder}/${businessId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("marketplace-business-media").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error(error.message || "Unable to upload this image.");
  return supabase.storage.from("marketplace-business-media").getPublicUrl(path).data.publicUrl;
}

export async function uploadMarketplaceVerticalVideo(file, businessId, folder = "vertical-videos") {
  if (!file) return "";
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) throw new Error("Sign in before uploading a business video.");
  const extension = file.name?.split(".").pop() || "mp4";
  const path = `${userData.user.id}/${folder}/${businessId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("marketplace-business-media").upload(path, file, { cacheControl: "3600", contentType: file.type || "video/mp4", upsert: false });
  if (error) throw new Error(error.message || "Unable to upload this video.");
  return supabase.storage.from("marketplace-business-media").getPublicUrl(path).data.publicUrl;
}

export async function fetchRestaurantMenu(businessId, dayOfWeek = new Date().getDay()) {
  let query = supabase.from("marketplace_restaurant_menu_items").select("*").eq("business_id", businessId).order("sort_order").order("created_at");
  if (Number.isInteger(dayOfWeek)) query = query.eq("day_of_week", dayOfWeek);
  const { data, error } = await query;
  const fallback = throwOrEmpty(error, "Unable to load this restaurant menu.");
  return fallback || data || [];
}

export async function saveRestaurantMenuItem(businessId, input = {}) {
  const hasNewMedia = Boolean(input.coverImageFile || input.videoFile || Array.from(input.extraImageFiles || []).length);
  if (!input.id || hasNewMedia) await validateVerticalMediaPackage(input);
  const [imageUrl, imageUrls, videoUrl] = hasNewMedia || !input.id ? await Promise.all([
    uploadMarketplaceVerticalImage(input.coverImageFile, businessId, "restaurant-menu/covers"),
    Promise.all(Array.from(input.extraImageFiles || []).map((file) => uploadMarketplaceVerticalImage(file, businessId, "restaurant-menu/gallery"))),
    uploadMarketplaceVerticalVideo(input.videoFile, businessId, "restaurant-menu/videos"),
  ]) : [input.image_url || "", input.image_urls || [], input.video_url || ""];
  const payload = {
    business_id: businessId,
    day_of_week: Number(input.day_of_week),
    meal_period: input.meal_period || "all_day",
    name: String(input.name || "").trim(),
    description: String(input.description || "").trim(),
    price: Number(input.price || 0),
    image_url: imageUrl || null,
    image_urls: imageUrls,
    video_url: videoUrl,
    preparation_minutes: Number(input.preparation_minutes || 20),
    available: input.available !== false,
    updated_at: new Date().toISOString(),
  };
  if (!payload.name) throw new Error("Add the menu item name.");
  const query = input.id
    ? supabase.from("marketplace_restaurant_menu_items").update(payload).eq("id", input.id).eq("business_id", businessId)
    : supabase.from("marketplace_restaurant_menu_items").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.message || "Unable to save this menu item.");
  return data;
}

export async function toggleRestaurantMenuItem(item, available) {
  const { error } = await supabase.from("marketplace_restaurant_menu_items").update({ available, updated_at: new Date().toISOString() }).eq("id", item.id);
  if (error) throw new Error(error.message || "Unable to update menu availability.");
}

function getMarketplaceMediaPath(url = "") {
  const marker = "/object/public/marketplace-business-media/";
  const index = String(url).indexOf(marker);
  return index >= 0 ? decodeURIComponent(String(url).slice(index + marker.length)) : "";
}

async function removeMarketplaceMedia(urls = []) {
  const paths = Array.from(new Set(urls.map(getMarketplaceMediaPath).filter(Boolean)));
  if (!paths.length) return;
  await supabase.storage.from("marketplace-business-media").remove(paths);
}

export async function deleteRestaurantMenuItem(item) {
  const { error } = await supabase.from("marketplace_restaurant_menu_items").delete().eq("id", item.id).eq("business_id", item.business_id);
  if (error) throw new Error(error.message || "Unable to delete this meal.");
  await removeMarketplaceMedia([item.image_url, ...(item.image_urls || []), item.video_url]);
}

export async function fetchHotelWorkspace(businessId) {
  const [imagesResult, roomsResult, businessResult] = await Promise.all([
    supabase.from("marketplace_hotel_images").select("*").eq("business_id", businessId).order("is_cover", { ascending: false }).order("sort_order"),
    supabase.from("marketplace_hotel_rooms").select("*").eq("business_id", businessId).order("nightly_rate"),
    supabase.from("marketplace_businesses").select("vertical_video_url").eq("id", businessId).maybeSingle(),
  ]);
  const imagesFallback = throwOrEmpty(imagesResult.error, "Unable to load hotel images.");
  const roomsFallback = throwOrEmpty(roomsResult.error, "Unable to load hotel rooms.");
  return { images: imagesFallback || imagesResult.data || [], rooms: roomsFallback || roomsResult.data || [], videoUrl: businessResult.data?.vertical_video_url || "" };
}

export async function saveHotelMediaPackage(businessId, input = {}) {
  await validateVerticalMediaPackage(input);
  const [coverUrl, extraUrls, videoUrl] = await Promise.all([
    uploadMarketplaceVerticalImage(input.coverImageFile, businessId, "hotel-gallery/covers"),
    Promise.all(Array.from(input.extraImageFiles || []).map((file) => uploadMarketplaceVerticalImage(file, businessId, "hotel-gallery/images"))),
    uploadMarketplaceVerticalVideo(input.videoFile, businessId, "hotel-gallery/videos"),
  ]);
  const rows = [coverUrl, ...extraUrls].map((imageUrl, index) => ({
    business_id: businessId,
    image_url: imageUrl,
    caption: index === 0 ? "Hotel cover" : `Hotel image ${index}`,
    is_cover: index === 0,
    sort_order: index * 10,
  }));
  const { error: imageError } = await supabase.from("marketplace_hotel_images").insert(rows);
  if (imageError) throw new Error(imageError.message || "Unable to save hotel images.");
  const { error: videoError } = await supabase.from("marketplace_businesses").update({ vertical_video_url: videoUrl, updated_at: new Date().toISOString() }).eq("id", businessId);
  if (videoError) throw new Error(videoError.message || "Unable to save the hotel video.");
  return { coverUrl, extraUrls, videoUrl };
}

export async function addHotelImage(businessId, file, caption = "") {
  const imageUrl = await uploadMarketplaceVerticalImage(file, businessId, "hotel-gallery");
  const { count } = await supabase.from("marketplace_hotel_images").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  const { data, error } = await supabase.from("marketplace_hotel_images").insert({
    business_id: businessId,
    image_url: imageUrl,
    caption: String(caption || "").trim(),
    is_cover: Number(count || 0) === 0,
    sort_order: Number(count || 0) * 10,
  }).select().single();
  if (error) throw new Error(error.message || "Unable to add this hotel image.");
  return data;
}

export async function deleteHotelImage(image) {
  const { error } = await supabase.from("marketplace_hotel_images").delete().eq("id", image.id).eq("business_id", image.business_id);
  if (error) throw new Error(error.message || "Unable to delete this hotel image.");
  await removeMarketplaceMedia([image.image_url]);
}

export async function deleteHotelVideo(businessId, videoUrl) {
  const { error } = await supabase.from("marketplace_businesses").update({ vertical_video_url: null, updated_at: new Date().toISOString() }).eq("id", businessId);
  if (error) throw new Error(error.message || "Unable to delete this hotel video.");
  await removeMarketplaceMedia([videoUrl]);
}

export async function saveHotelRoom(businessId, input = {}) {
  const imageUrls = [...(input.image_urls || [])];
  if (input.imageFile) imageUrls.push(await uploadMarketplaceVerticalImage(input.imageFile, businessId, "hotel-rooms"));
  const payload = {
    business_id: businessId,
    name: String(input.name || "").trim(),
    description: String(input.description || "").trim(),
    nightly_rate: Number(input.nightly_rate || 0),
    capacity: Number(input.capacity || 1),
    rooms_available: Number(input.rooms_available || 1),
    amenities: String(input.amenitiesText || "").split(",").map((item) => item.trim()).filter(Boolean),
    image_urls: imageUrls,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  };
  if (!payload.name) throw new Error("Add a room name.");
  const query = input.id
    ? supabase.from("marketplace_hotel_rooms").update(payload).eq("id", input.id).eq("business_id", businessId)
    : supabase.from("marketplace_hotel_rooms").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.message || "Unable to save this room.");
  return data;
}

export async function fetchPropertyListings(businessId) {
  const { data, error } = await supabase.from("marketplace_property_listings").select("*").eq("business_id", businessId).order("updated_at", { ascending: false });
  const fallback = throwOrEmpty(error, "Unable to load property listings.");
  return fallback || data || [];
}

export async function savePropertyListing(businessId, input = {}) {
  const hasNewMedia = Boolean(input.coverImageFile || input.videoFile || Array.from(input.extraImageFiles || []).length);
  if (!input.id || hasNewMedia) await validateVerticalMediaPackage(input);
  const [coverUrl, extraUrls, videoUrl] = hasNewMedia || !input.id ? await Promise.all([
    uploadMarketplaceVerticalImage(input.coverImageFile, businessId, "properties/covers"),
    Promise.all(Array.from(input.extraImageFiles || []).map((file) => uploadMarketplaceVerticalImage(file, businessId, "properties/gallery"))),
    uploadMarketplaceVerticalVideo(input.videoFile, businessId, "properties/videos"),
  ]) : [input.image_urls?.[0] || "", input.image_urls?.slice(1) || [], input.video_url || ""];
  const imageUrls = [coverUrl, ...extraUrls];
  const payload = {
    business_id: businessId,
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    purpose: input.purpose || "rent",
    property_type: input.property_type || "house",
    price: Number(input.price || 0),
    rent_period: input.purpose === "rent" ? input.rent_period || "month" : null,
    bedrooms: Number(input.bedrooms || 0),
    bathrooms: Number(input.bathrooms || 0),
    furnished: Boolean(input.furnished),
    address: String(input.address || "").trim(),
    city: String(input.city || "").trim(),
    image_urls: imageUrls,
    video_url: videoUrl,
    amenities: String(input.amenitiesText || "").split(",").map((item) => item.trim()).filter(Boolean),
    availability_status: input.availability_status || "available",
    published: Boolean(input.published),
    updated_at: new Date().toISOString(),
  };
  if (!payload.title || !payload.address) throw new Error("Add the property title and location.");
  const query = input.id
    ? supabase.from("marketplace_property_listings").update(payload).eq("id", input.id).eq("business_id", businessId)
    : supabase.from("marketplace_property_listings").insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.message || "Unable to save this property.");
  return data;
}

export async function deletePropertyListing(item) {
  const { error } = await supabase.from("marketplace_property_listings").delete().eq("id", item.id).eq("business_id", item.business_id);
  if (error) throw new Error(error.message || "Unable to delete this property.");
  await removeMarketplaceMedia([...(item.image_urls || []), item.video_url]);
}

export async function createVerticalBooking(product, input = {}) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const buyerId = authData?.user?.id;
  if (authError || !buyerId) throw new Error("Sign in before requesting a booking.");

  const payload = {
    business_id: product.businessId || product.seller?.id,
    buyer_id: buyerId,
    listing_id: product.id || null,
    listing_type: product.verticalType,
    listing_name: String(product.name || "").trim(),
    buyer_name: String(input.buyerName || "").trim(),
    phone: String(input.phone || "").trim(),
    start_date: input.startDate,
    end_date: input.endDate || null,
    note: String(input.note || "").trim(),
  };
  if (!payload.business_id || !["hotel", "property"].includes(payload.listing_type)) throw new Error("This listing cannot accept bookings yet.");
  if (!payload.buyer_name || !payload.phone || !payload.start_date) throw new Error("Add your name, phone number, and booking date.");

  const { data, error } = await supabase.from("marketplace_vertical_bookings").insert(payload).select().single();
  if (error) throw new Error(error.message || "Unable to send this booking request.");
  window.dispatchEvent(new CustomEvent("marketplace-vertical-activity-updated", { detail: { businessId: payload.business_id } }));
  return data;
}

export async function fetchVerticalBusinessActivity(businessId) {
  const [reviews, messages, orders, bookings] = await Promise.all([
    supabase.from("marketplace_reviews").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("marketplace_customer_messages").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("marketplace_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("marketplace_vertical_bookings").select("id,listing_name,listing_type,buyer_name,phone,start_date,end_date,note,status,created_at", { count: "exact" }).eq("business_id", businessId).order("created_at", { ascending: false }).limit(8),
  ]);
  const bookingRows = isMissingTable(bookings.error) ? [] : bookings.data || [];
  return {
    reviews: Number(reviews.count || 0),
    messages: Number(messages.count || 0),
    orders: Number(orders.count || 0),
    bookings: Number(bookings.count || bookingRows.length),
    recentBookings: bookingRows,
  };
}

export function subscribeMarketplaceVerticalDiscovery(onChange) {
  const channel = supabase.channel(`marketplace-vertical-discovery-${crypto.randomUUID()}`);
  ["marketplace_restaurant_menu_items", "marketplace_hotel_images", "marketplace_hotel_rooms", "marketplace_property_listings"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeVerticalBusinessActivity(businessId, onChange) {
  const channel = supabase.channel(`marketplace-vertical-activity-${businessId}-${crypto.randomUUID()}`);
  ["marketplace_vertical_bookings", "marketplace_customer_messages", "marketplace_reviews", "marketplace_orders"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `business_id=eq.${businessId}` }, onChange);
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

export async function fetchMarketplaceVerticalDiscovery({ limit = 30 } = {}) {
  const [menusResult, hotelImagesResult, roomsResult, propertiesResult] = await Promise.all([
    supabase.from("marketplace_restaurant_menu_items").select(`*, marketplace_businesses (${BUSINESS_SELECT})`).eq("available", true).order("updated_at", { ascending: false }).limit(limit * 7),
    supabase.from("marketplace_hotel_images").select(`*, marketplace_businesses (${BUSINESS_SELECT})`).order("is_cover", { ascending: false }).order("sort_order").limit(limit * 2),
    supabase.from("marketplace_hotel_rooms").select(`*, marketplace_businesses (${BUSINESS_SELECT})`).eq("active", true).gt("rooms_available", 0).order("nightly_rate").limit(limit * 2),
    supabase.from("marketplace_property_listings").select(`*, marketplace_businesses (${BUSINESS_SELECT})`).eq("published", true).eq("availability_status", "available").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(limit),
  ]);

  const menus = (throwOrEmpty(menusResult.error, "Unable to load today's menus.") || menusResult.data || [])
    .filter((row) => Number(row.day_of_week) === getMarketplaceBusinessDay(nestedBusiness(row).country_iso));
  const hotelImages = throwOrEmpty(hotelImagesResult.error, "Unable to load hotels.") || hotelImagesResult.data || [];
  const rooms = throwOrEmpty(roomsResult.error, "Unable to load hotel rooms.") || roomsResult.data || [];
  const properties = throwOrEmpty(propertiesResult.error, "Unable to load properties.") || propertiesResult.data || [];

  const imagesByBusiness = new Map();
  hotelImages.forEach((image) => {
    if (!imagesByBusiness.has(image.business_id)) imagesByBusiness.set(image.business_id, []);
    imagesByBusiness.get(image.business_id).push(image.image_url);
  });
  const hotelsByBusiness = new Map();
  hotelImages.forEach((image) => {
    if (hotelsByBusiness.has(image.business_id)) return;
    hotelsByBusiness.set(image.business_id, {
      ...normalizeBusinessRow(image),
      id: image.business_id,
      images: imagesByBusiness.get(image.business_id) || [],
      rooms: [],
      fromPrice: 0,
    });
  });
  rooms.forEach((room) => {
    const business = nestedBusiness(room);
    const current = hotelsByBusiness.get(room.business_id) || {
      ...normalizeBusinessRow(room),
      id: room.business_id,
      images: imagesByBusiness.get(room.business_id) || [],
      rooms: [],
      fromPrice: Number(room.nightly_rate || 0),
    };
    current.rooms.push(room);
    current.fromPrice = current.rooms.length === 1
      ? Number(room.nightly_rate || 0)
      : Math.min(current.fromPrice, Number(room.nightly_rate || 0));
    current.businessName = business.business_name || current.businessName;
    hotelsByBusiness.set(room.business_id, current);
  });

  return {
    restaurants: menus.map(normalizeBusinessRow),
    hotels: Array.from(hotelsByBusiness.values()),
    properties: properties.map(normalizeBusinessRow),
  };
}

// A buyer vertical earns its own tab once it carries this many live items;
// below that, its inventory stays mixed into the "All" feed.
export const MARKETPLACE_PARENT_TAB_MIN_ITEMS = 150;

async function countRows(query) {
  const { count, error } = await query;
  if (error) return 0;
  return Number(count || 0);
}

export async function fetchMarketplaceParentAvailability() {
  const [shop, food, hotels, property] = await Promise.all([
    countRows(
      supabase
        .from("marketplace_products")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gt("stock", 0),
    ),
    countRows(
      supabase
        .from("marketplace_restaurant_menu_items")
        .select("id", { count: "exact", head: true })
        .eq("available", true),
    ),
    countRows(
      supabase
        .from("marketplace_hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .gt("rooms_available", 0),
    ),
    countRows(
      supabase
        .from("marketplace_property_listings")
        .select("id", { count: "exact", head: true })
        .eq("published", true)
        .eq("availability_status", "available")
        .gt("expires_at", new Date().toISOString()),
    ),
  ]);

  return { shop, food, hotels, property };
}
