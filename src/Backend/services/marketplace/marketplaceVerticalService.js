import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "../explore/errors";
import { optimizeImageFile } from "./imageOptimization";
import { validateVerticalMediaPackage } from "./verticalMediaValidation";

const BUSINESS_SELECT = "id,business_name,business_kind,description,city,country,country_iso,currency,address,phone,whatsapp_enabled,whatsapp,logo_url,banner_url,vertical_video_url,latitude,longitude,verification_status,open_time,close_time,delivery_enabled,pickup_enabled";
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
    whatsappEnabled: Boolean(business.whatsapp_enabled),
    whatsapp: business.whatsapp || "",
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
  // Downscale + re-encode before upload to keep Storage and Egress down.
  const optimized = await optimizeImageFile(file);
  const extension = optimized.name?.split(".").pop() || "jpg";
  const path = `${userData.user.id}/${folder}/${businessId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("marketplace-business-media").upload(path, optimized, { cacheControl: "31536000", contentType: optimized.type || undefined, upsert: false });
  if (error) throw new Error(error.message || "Unable to upload this image.");
  return supabase.storage.from("marketplace-business-media").getPublicUrl(path).data.publicUrl;
}

export async function uploadMarketplaceVerticalVideo(file, businessId, folder = "vertical-videos") {
  if (!file) return "";
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) throw new Error("Sign in before uploading a business video.");
  const extension = file.name?.split(".").pop() || "mp4";
  const path = `${userData.user.id}/${folder}/${businessId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("marketplace-business-media").upload(path, file, { cacheControl: "31536000", contentType: file.type || "video/mp4", upsert: false });
  if (error) throw new Error(error.message || "Unable to upload this video.");
  return supabase.storage.from("marketplace-business-media").getPublicUrl(path).data.publicUrl;
}

async function uploadVerticalMediaPackage(businessId, input, folders, onProgress) {
  onProgress?.("cover");
  const coverUrl = await uploadMarketplaceVerticalImage(input.coverImageFile, businessId, folders.cover);
  onProgress?.("gallery");
  const extraUrls = [];
  for (const file of Array.from(input.extraImageFiles || [])) {
    extraUrls.push(await uploadMarketplaceVerticalImage(file, businessId, folders.gallery));
  }
  onProgress?.("video");
  const videoUrl = await uploadMarketplaceVerticalVideo(input.videoFile, businessId, folders.video);
  return [coverUrl, extraUrls, videoUrl];
}

export async function fetchRestaurantMenu(businessId, dayOfWeek = new Date().getDay()) {
  let query = supabase.from("marketplace_restaurant_menu_items").select("*").eq("business_id", businessId).order("sort_order").order("created_at");
  // A meal shows for a given weekday when it is marked available every day, or
  // when that weekday is one of its selected available_days.
  if (Number.isInteger(dayOfWeek)) query = query.or(`available_everyday.eq.true,available_days.cs.{${dayOfWeek}}`);
  const { data, error } = await query;
  const fallback = throwOrEmpty(error, "Unable to load this restaurant menu.");
  return fallback || data || [];
}

// A menu row is served on a weekday when it is available every day or that
// weekday is one of its selected days. Falls back to the legacy day_of_week for
// rows saved before multi-day availability existed.
export function menuItemServedOnDay(row, dayOfWeek) {
  if (!row) return false;
  if (row.available_everyday) return true;
  if (Array.isArray(row.available_days) && row.available_days.length) {
    return row.available_days.map(Number).includes(Number(dayOfWeek));
  }
  return Number(row.day_of_week) === Number(dayOfWeek);
}

// Resolve the availability part of the payload: every-day (default) clears the
// day list; specific-days requires at least one valid weekday and re-anchors the
// legacy day_of_week to the first selected day.
function normalizeMenuAvailability(input = {}) {
  const everyday = input.available_everyday !== false;
  if (everyday) return { available_everyday: true, available_days: [] };
  const days = Array.from(new Set(
    (Array.isArray(input.available_days) ? input.available_days : [])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )).sort((a, b) => a - b);
  if (!days.length) throw new Error("Pick at least one day, or make the meal available every day.");
  return { available_everyday: false, available_days: days, day_of_week: days[0] };
}

export async function saveRestaurantMenuItem(businessId, input = {}, onProgress) {
  onProgress?.("prepare");
  const hasNewMedia = Boolean(input.coverImageFile || input.videoFile || Array.from(input.extraImageFiles || []).length);
  if (!input.id || hasNewMedia) await validateVerticalMediaPackage(input);
  const [imageUrl, imageUrls, videoUrl] = hasNewMedia || !input.id
    ? await uploadVerticalMediaPackage(businessId, input, { cover: "restaurant-menu/covers", gallery: "restaurant-menu/gallery", video: "restaurant-menu/videos" }, onProgress)
    : [input.image_url || "", input.image_urls || [], input.video_url || ""];
  onProgress?.("save");
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
    ...normalizeMenuAvailability(input),
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

export async function saveHotelMediaPackage(businessId, input = {}, onProgress) {
  onProgress?.("prepare");
  await validateVerticalMediaPackage(input);
  const [coverUrl, extraUrls, videoUrl] = await uploadVerticalMediaPackage(businessId, input, { cover: "hotel-gallery/covers", gallery: "hotel-gallery/images", video: "hotel-gallery/videos" }, onProgress);
  onProgress?.("save");
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

export async function savePropertyListing(businessId, input = {}, onProgress) {
  onProgress?.("prepare");
  const hasNewMedia = Boolean(input.coverImageFile || input.videoFile || Array.from(input.extraImageFiles || []).length);
  if (!input.id || hasNewMedia) await validateVerticalMediaPackage(input);
  const [coverUrl, extraUrls, videoUrl] = hasNewMedia || !input.id
    ? await uploadVerticalMediaPackage(businessId, input, { cover: "properties/covers", gallery: "properties/gallery", video: "properties/videos" }, onProgress)
    : [input.image_urls?.[0] || "", input.image_urls?.slice(1) || [], input.video_url || ""];
  onProgress?.("save");
  const imageUrls = [coverUrl, ...extraUrls];
  const propertyType = input.property_type || "house";
  const isLand = propertyType === "land";
  const isCommercial = propertyType === "commercial";
  const isHotel = propertyType === "hotel";
  const hasFloorArea = isCommercial || isHotel;
  const numberOrNull = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  // Coordinates may be negative (e.g. western/southern hemispheres) or zero, so
  // they only need to be finite — not positive like sizes/counts.
  const coordinateOrNull = (value) => {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const payload = {
    business_id: businessId,
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    purpose: input.purpose || "rent",
    property_type: propertyType,
    price: Number(input.price || 0),
    rent_period: input.purpose === "rent" ? input.rent_period || "month" : null,
    // Type-specific attributes: only the fields that apply to the chosen type
    // are stored; the rest are cleared so a listing never carries mismatched data.
    bedrooms: isLand || isHotel ? 0 : Number(input.bedrooms || 0),
    bathrooms: isLand || isHotel ? 0 : Number(input.bathrooms || 0),
    furnished: isLand || isHotel ? false : Boolean(input.furnished),
    land_size: isLand ? numberOrNull(input.land_size) : null,
    land_size_unit: isLand ? input.land_size_unit || "plots" : null,
    floor_area: hasFloorArea ? numberOrNull(input.floor_area) : null,
    floor_area_unit: hasFloorArea ? input.floor_area_unit || "sqm" : null,
    rooms: isHotel ? Number(input.rooms || 0) : 0,
    star_rating: isHotel ? numberOrNull(input.star_rating) : null,
    parking_spaces: isLand ? 0 : Number(input.parking_spaces || 0),
    address: String(input.address || "").trim(),
    city: String(input.city || "").trim(),
    latitude: coordinateOrNull(input.latitude),
    longitude: coordinateOrNull(input.longitude),
    image_urls: imageUrls,
    video_url: videoUrl,
    amenities: String(input.amenitiesText || "").split(",").map((item) => item.trim()).filter(Boolean),
    availability_status: input.availability_status || "available",
    authorization_status: "verified",
    published: Boolean(input.published),
    updated_at: new Date().toISOString(),
  };
  if (!payload.title || !payload.address) throw new Error("Add the property title and location.");
  const data = await writePropertyListing(businessId, input.id, payload);
  return data;
}

const TYPED_PROPERTY_COLUMNS = ["land_size", "land_size_unit", "floor_area", "floor_area_unit", "parking_spaces", "rooms", "star_rating"];

// Saves the listing, and if the typed-attribute columns are not present yet
// (migration not applied), retries once without them so the core listing still
// saves instead of failing outright.
async function writePropertyListing(businessId, id, payload) {
  const run = (body) => {
    const query = id
      ? supabase.from("marketplace_property_listings").update(body).eq("id", id).eq("business_id", businessId)
      : supabase.from("marketplace_property_listings").insert(body);
    return query.select().single();
  };
  const { data, error } = await run(payload);
  if (!error) return data;
  const message = String(error.message || "");
  const missingTypedColumn = TYPED_PROPERTY_COLUMNS.some((column) => message.includes(column));
  if (missingTypedColumn) {
    const fallback = { ...payload };
    TYPED_PROPERTY_COLUMNS.forEach((column) => delete fallback[column]);
    const retry = await run(fallback);
    if (!retry.error) return retry.data;
    throw new Error(retry.error.message || "Unable to save this property.");
  }
  throw new Error(error.message || "Unable to save this property.");
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
    .filter((row) => menuItemServedOnDay(row, getMarketplaceBusinessDay(nestedBusiness(row).country_iso)));
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
