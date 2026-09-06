import supabase from "../../Backend/lib/supabaseClient";
export { buildPublicCompanyTabs } from "./publicTransportCompanyProfilePolicy";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value) {
  return String(value || "").trim();
}

function normalizeReview(row = {}) {
  return {
    id: row.id,
    passengerName: text(row.passenger_name) || "Verified passenger",
    rating: toNumber(row.rating),
    reviewText: text(row.review_text),
    companyResponse: text(row.company_response),
    createdAt: row.created_at || null,
    respondedAt: row.responded_at || null,
  };
}

function normalizePublicFleet(row = {}) {
  return {
    id: row.company_fleet_id || row.id,
    runtimeFleetId: row.runtime_fleet_id || null,
    fleetCode: text(row.fleet_code),
    fleetName: text(row.fleet_name) || "Company fleet",
    fleetType: text(row.fleet_type) || "Fleet",
    serviceCategory: text(row.service_category),
    operatorName: text(row.operator_name) || "Operator not assigned",
    operatorCode: text(row.operator_code),
    plateNumber: text(row.plate_number),
    make: text(row.make),
    model: text(row.model),
    color: text(row.color),
    verificationStatus: text(row.verification_status) || "pending",
    activeStatus: text(row.active_status) || "offline",
    isAvailable: Boolean(row.is_available),
    rating: toNumber(row.rating),
    reviewCount: toNumber(row.review_count),
    photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : [],
  };
}

function normalizeRental(row = {}) {
  return {
    id: row.id,
    title: text(row.title) || "Self-drive rental",
    fleetCode: text(row.fleet_code),
    fleetType: text(row.fleet_type) || "Rental",
    status: text(row.status) || "unavailable",
    currency: text(row.currency),
    ratePerHour: toNumber(row.rate_per_hour),
    ratePerDay: toNumber(row.rate_per_day),
    ratePerWeek: toNumber(row.rate_per_week),
    distanceRate: toNumber(row.distance_rate),
    timeNegotiable: Boolean(row.time_negotiable),
    distanceNegotiable: Boolean(row.distance_negotiable),
    pickupAddress: text(row.pickup_address),
    photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : [],
  };
}

function normalizeCompany(row = {}) {
  return {
    id: row.id,
    companyName: text(row.company_name) || "Transport company",
    companyCode: text(row.company_code),
    companyType: text(row.company_type),
    phone: text(row.phone),
    email: text(row.email),
    country: text(row.country),
    city: text(row.city),
    address: text(row.address),
    operatingAreas: Array.isArray(row.operating_areas) ? row.operating_areas.filter(Boolean) : [],
    supportPolicy: text(row.support_policy),
    verificationStatus: text(row.verification_status) || "pending",
    rating: toNumber(row.rating),
    reviewCount: toNumber(row.review_count),
    fleetCount: toNumber(row.fleet_count),
    rentalCount: toNumber(row.rental_count),
    fleetTypes: Array.isArray(row.fleet_types) ? row.fleet_types.filter(Boolean) : [],
  };
}

export async function searchPublicTransportCompanies(query, { country = "", limit = 20 } = {}) {
  const value = text(query);
  if (value.length < 2) return [];

  const { data, error } = await supabase.rpc("search_public_transport_companies", {
    p_query: value,
    p_country: text(country) || null,
    p_limit: Math.min(Math.max(Number(limit) || 20, 1), 40),
  });

  if (error) throw new Error(error.message || "Company search is temporarily unavailable.");
  return (Array.isArray(data) ? data : []).map(normalizeCompany);
}

export async function fetchPublicTransportCompanyProfile(companyId) {
  const { data, error } = await supabase.rpc("get_public_transport_company_profile", {
    p_company_id: companyId,
  });

  if (error) throw new Error(error.message || "Unable to open this company profile.");
  if (!data?.company) return null;

  return {
    company: normalizeCompany(data.company),
    fleets: (Array.isArray(data.fleets) ? data.fleets : []).map(normalizePublicFleet),
    rentals: (Array.isArray(data.rentals) ? data.rentals : []).map(normalizeRental),
    reviews: (Array.isArray(data.reviews) ? data.reviews : []).map(normalizeReview),
  };
}

export async function fetchTransportCompanyReviewEligibility(companyId) {
  const { data, error } = await supabase.rpc("get_transport_company_review_eligibility", {
    p_company_id: companyId,
  });

  if (error) throw new Error(error.message || "Unable to check review eligibility.");
  const result = Array.isArray(data) ? data[0] : data;
  return {
    eligible: Boolean(result?.eligible),
    tripId: result?.trip_id || null,
    reason: text(result?.reason),
  };
}

export async function submitTransportCompanyReview({ companyId, tripId, rating, reviewText }) {
  const { data, error } = await supabase.rpc("submit_verified_transport_company_review", {
    p_company_id: companyId,
    p_trip_id: tripId,
    p_rating: Number(rating),
    p_review_text: text(reviewText),
  });

  if (error) throw new Error(error.message || "Unable to publish your review.");
  return data;
}

export const publicTransportCompanyMappers = {
  normalizeCompany,
  normalizePublicFleet,
  normalizeRental,
  normalizeReview,
};
