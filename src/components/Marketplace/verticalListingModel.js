import {
  createVerticalBooking,
} from "../../Backend/services/marketplace/marketplaceVerticalService";
import { createBuyerProductOrder, sendBuyerMarketplaceMessage } from "../../Backend/services/marketplace/buyerMarketplaceService";
import { urMallShareToastOptions } from "../../Backend/services/shareCtaService";
import { showToast } from "../../Backend/services/toastService";
import { t } from "../../i18n";
import { shortErrorToast } from "../../Backend/services/friendlyErrorService";
import { mealServedDays } from "../../Backend/services/marketplace/restaurantMealDays";

// Shared vertical-listing model + buyer actions. The discovery feed
// (VerticalMarketplace) and a vertical seller's own profile
// (SellerProfileDrawer) both open meals, rooms and properties through these, so
// a listing reads and behaves the same wherever a shopper taps it.

export function mealPeriodLabel(period) {
  return period ? String(period).replaceAll("_", " ") : t("urmall.vertical.allDay");
}

function propertyUnitSymbol(unit) {
  return { sqm: "m²", sqft: "ft²", acres: "acres", plots: "plots", hectares: "ha" }[unit] || unit || "";
}

// Buyer-facing property spec line — shows only the attributes that apply to the
// listing's type (land size for land, floor area for commercial, rooms for the
// rest) so each category reads uniquely.
export function buildPropertySpecifications(item) {
  const isLandType = item.property_type === "land";
  const isCommercialType = item.property_type === "commercial";
  const isHotelType = item.property_type === "hotel";
  const parts = [item.property_type];
  if (isLandType && Number(item.land_size) > 0) parts.push(`${Number(item.land_size).toLocaleString()} ${propertyUnitSymbol(item.land_size_unit)}`.trim());
  if ((isCommercialType || isHotelType) && Number(item.floor_area) > 0) parts.push(`${Number(item.floor_area).toLocaleString()} ${propertyUnitSymbol(item.floor_area_unit)}`.trim());
  if (isHotelType) {
    if (Number(item.rooms) > 0) parts.push(t("urmall.vertical.roomsN", { count: item.rooms }));
    if (Number(item.star_rating) > 0) parts.push(t("urmall.vertical.starN", { count: item.star_rating }));
  }
  if (!isLandType && !isHotelType) {
    parts.push(t("urmall.vertical.bedroomsN", { count: item.bedrooms || 0 }));
    parts.push(t("urmall.vertical.bathroomsN", { count: item.bathrooms || 0 }));
  }
  if (Number(item.parking_spaces) > 0) parts.push(t("urmall.vertical.parkingN", { count: item.parking_spaces }));
  if (!isLandType && !isHotelType) parts.push(item.furnished ? t("urmall.vertical.furnished") : t("urmall.vertical.notFurnished"));
  return parts.filter(Boolean).join(" · ");
}

// "hotel" is the whole property (its gallery and room types); "room" is one
// bookable room type inside it. Both belong to the same hotel business.
function isHotelVerticalType(type) {
  return type === "hotel" || type === "room";
}

const numberOrUndefined = (value) => (Number(value) > 0 ? Number(value) : undefined);

// The facts of a meal, room, hotel or property that the mapped product does
// not keep in a structured form. Only what the buyer can already see on the
// listing; never the seller's phone, email or WhatsApp.
export function verticalListingFacts(type, item = {}) {
  if (type === "restaurant") {
    return {
      mealPeriod: item.meal_period || undefined,
      cuisine: item.cuisine || item.cuisine_type || undefined,
      preparationMinutes: numberOrUndefined(item.preparation_minutes),
      servedDays: mealServedDays(item),
    };
  }
  if (type === "room") {
    return {
      capacity: numberOrUndefined(item.capacity),
      roomsAvailable: Number(item.rooms_available || 0),
      amenities: Array.isArray(item.amenities) ? item.amenities.filter(Boolean).slice(0, 15) : undefined,
    };
  }
  if (type === "hotel") {
    return {
      roomTypes: (item.rooms || []).slice(0, 10).map((room) => ({
        name: room.name || room.room_type || "",
        nightlyRate: Number(room.nightly_rate || 0),
        capacity: numberOrUndefined(room.capacity),
      })),
    };
  }
  if (type === "property") {
    return {
      propertyType: item.property_type || undefined,
      purpose: item.purpose || undefined,
      rentPeriod: item.purpose === "rent" ? item.rent_period || "month" : undefined,
      bedrooms: numberOrUndefined(item.bedrooms),
      bathrooms: numberOrUndefined(item.bathrooms),
      parkingSpaces: numberOrUndefined(item.parking_spaces),
      furnished: item.property_type === "land" ? undefined : Boolean(item.furnished),
      landSize: numberOrUndefined(item.land_size) ? `${Number(item.land_size)} ${item.land_size_unit || ""}`.trim() : undefined,
      floorArea: numberOrUndefined(item.floor_area) ? `${Number(item.floor_area)} ${item.floor_area_unit || ""}`.trim() : undefined,
      rooms: numberOrUndefined(item.rooms),
      starRating: numberOrUndefined(item.star_rating),
      address: item.address || undefined,
      city: item.city || undefined,
    };
  }
  return {};
}

export function mapVerticalProduct({ item, type }) {
  const isHotelType = isHotelVerticalType(type);
  const seller = {
    id: item.businessId || (type === "hotel" ? item.id : item.business_id),
    name: item.businessName || t("urmall.vertical.businessFallback"),
    city: item.city || "",
    country: item.country || "",
    countryCode: item.countryIso || "",
    currency: item.currency || "",
    location: item.address || item.city || "",
    address: item.address || "",
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    phone: item.phone || "",
    whatsappEnabled: Boolean(item.whatsappEnabled),
    whatsapp: item.whatsapp || "",
    bannerUrl: item.bannerUrl || "",
    description: item.description || "",
    businessKind: item.businessKind || (type === "restaurant" ? "restaurant" : isHotelType ? "hotel" : "property_agent"),
    category: type === "restaurant" ? t("urmall.vertical.catRestaurant") : isHotelType ? t("urmall.vertical.catHotel") : t("urmall.vertical.catProperty"),
    deliveryEnabled: Boolean(item.deliveryEnabled),
    pickupEnabled: Boolean(item.pickupEnabled),
    logoUrl: item.logoUrl || "",
    verificationStatus: item.verificationStatus || "pending",
  };
  const shared = {
    id: item.id,
    businessId: seller.id,
    isVertical: true,
    verticalType: type,
    seller,
    currency: item.currency || "",
    country: item.country || "",
    countryCode: item.countryIso || "",
    location: item.address || item.city || t("urmall.vertical.locationFromBusiness"),
    stock: 999,
    sales: 0,
    condition: "active",
    rating: 0,
    reviewCount: 0,
    createdAt: item.created_at || item.createdAt || "",
    allowNegotiation: false,
    deliveryAvailable: Boolean(item.deliveryEnabled),
    pickupAvailable: Boolean(item.pickupEnabled),
    // Plain listing facts for KAI (see verticalDetailFactsForAi).
    listingFacts: verticalListingFacts(type, item),
  };

  if (type === "restaurant") return {
    ...shared,
    name: item.name,
    category: t("urmall.vertical.restaurantMeal"),
    badgePrimary: t("urmall.vertical.catRestaurant"),
    badgeSecondary: mealPeriodLabel(item.meal_period),
    price: Number(item.price || 0),
    description: item.listingDescription || item.description || t("urmall.vertical.mealDescription", { name: seller.name }),
    imageUrl: item.image_url || item.bannerUrl || "",
    imageUrls: [item.image_url, ...(item.image_urls || [])].filter(Boolean),
    videoUrl: item.video_url || "",
    details: {
      subcategory: item.meal_period || "",
      cuisine: item.cuisine || item.cuisine_type || "",
      preparationMinutes: item.preparation_minutes || 20,
      specifications: t("urmall.vertical.mealSpec", { period: mealPeriodLabel(item.meal_period), minutes: item.preparation_minutes || 20 }),
    },
  };

  if (type === "hotel") return {
    ...shared,
    id: item.id || seller.id,
    name: item.businessName,
    category: t("urmall.vertical.catHotel"),
    badgePrimary: t("urmall.vertical.catHotel"),
    badgeSecondary: t("urmall.vertical.availableRooms"),
    price: Number(item.fromPrice || 0),
    description: item.description || t("urmall.vertical.hotelDescription", { name: seller.name }),
    imageUrl: item.images?.[0] || item.bannerUrl || "",
    imageUrls: item.images || [],
    videoUrl: item.videoUrl || "",
    details: {
      subcategory: "hotel",
      roomTypes: (item.rooms || []).map((room) => room.name || room.type).filter(Boolean).join(" "),
      specifications: t(item.rooms?.length === 1 ? "urmall.vertical.hotelSpecOne" : "urmall.vertical.hotelSpecMany", { count: item.rooms?.length || 0 }),
    },
  };

  // One bookable room type inside a hotel, so a shopper can open the exact room
  // they want rather than only the hotel as a whole.
  if (type === "room") {
    const roomsAvailable = Number(item.rooms_available || 0);
    return {
      ...shared,
      name: item.name,
      category: t("urmall.vertical.catHotelRoom"),
      badgePrimary: t("urmall.vertical.catHotel"),
      badgeSecondary: t("urmall.vertical.perNightSuffix"),
      price: Number(item.nightly_rate || 0),
      description: item.listingDescription || item.description || t("urmall.vertical.roomDescription", { name: seller.name }),
      imageUrl: item.image_urls?.[0] || item.bannerUrl || "",
      imageUrls: item.image_urls || [],
      videoUrl: item.video_url || "",
      stock: roomsAvailable,
      details: {
        subcategory: "room",
        capacity: Number(item.capacity || 1),
        roomsAvailable,
        amenities: Array.isArray(item.amenities) ? item.amenities.join(", ") : "",
        specifications: t("urmall.vertical.roomSpec", {
          count: Number(item.capacity || 1),
          rooms: roomsAvailable,
        }),
      },
    };
  }

  return {
    ...shared,
    name: item.title,
    category: t("urmall.vertical.propertyForPurpose", { purpose: item.purpose || "viewing" }),
    badgePrimary: t("urmall.vertical.catProperty"),
    badgeSecondary: t("urmall.vertical.forPurpose", { purpose: item.purpose || "viewing" }),
    price: Number(item.price || 0),
    description: item.listingDescription || item.description || t("urmall.vertical.propertyDescription", { name: seller.name }),
    imageUrl: item.image_urls?.[0] || item.bannerUrl || "",
    imageUrls: item.image_urls || [],
    videoUrl: item.video_url || "",
    allowNegotiation: true,
    details: {
      subcategory: item.property_type || "",
      purpose: item.purpose || "",
      bedrooms: item.bedrooms || 0,
      bathrooms: item.bathrooms || 0,
      specifications: buildPropertySpecifications(item),
    },
  };
}
// Buyer actions shared by every surface that opens a vertical listing.
export async function messageVerticalSeller(product, options = {}) {
  try {
    await sendBuyerMarketplaceMessage({
      seller: product.seller,
      product,
      topic: product.name,
      message: options.message || t("urmall.vertical.messageGreeting", { name: product.name }),
      messageType: options.messageType || "question",
    });
    showToast("Message sent to seller", "success");
  } catch (error) {
    showToast(shortErrorToast(error, "Message not sent"), "danger");
    throw error;
  }
}

export async function orderVerticalMeal(product, orderInput) {
  try {
    await createBuyerProductOrder(product, orderInput);
    showToast("Restaurant order sent", "success", urMallShareToastOptions());
  } catch (error) {
    showToast(shortErrorToast(error, "Order couldn't be sent"), "danger");
    throw error;
  }
}

export async function bookVerticalListing(product, bookingInput) {
  try {
    await createVerticalBooking(product, bookingInput);
    showToast("Booking request sent", "success", urMallShareToastOptions());
  } catch (error) {
    showToast(shortErrorToast(error, "Booking not sent"), "danger");
    throw error;
  }
}
