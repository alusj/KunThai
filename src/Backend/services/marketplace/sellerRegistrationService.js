import supabase from "../../lib/supabaseClient";
import {
  getActiveCountryProfile,
  storeCountryContext,
} from "../../../data/westAfricanCountryProfiles";
import { isMissingColumn } from "../explore/errors";

export const BUSINESS_CATEGORIES = [
  "Electronics",
  "Electricals",
  "Machinery & Tools",
  "Furniture",
  "Fashion & Clothing",
  "Beauty & Personal Care",
  "Health & Pharmacy",
  "Food & Groceries",
  "Restaurants & Catering",
  "Agriculture & Farming",
  "Construction & Building Materials",
  "Automotive (Cars, Bikes, Parts)",
  "Mobile Phones & Accessories",
  "Computers & IT Equipment",
  "Home Appliances",
  "Real Estate & Property",
  "Hotels & Accommodation",
  "Transport & Logistics",
  "Education & Training",
  "Events & Entertainment",
  "Printing & Branding",
  "Professional Services (Legal, Accounting, etc.)",
  "Cleaning & Maintenance",
  "Security Services",
  "Religious & Community Services",
  "Wholesale & Bulk Supply",
  "General Merchandise",
  "Other",
];

export const URMALL_BUSINESS_KINDS = [
  { id: "retail", label: "Retail Store", description: "Products, stock, discounts, delivery, and pickup." },
  { id: "restaurant", label: "Restaurant", description: "Daily menus, meal availability, food orders, and preparation times." },
  { id: "hotel", label: "Hotel", description: "Property galleries, rooms, nightly rates, and availability." },
  { id: "property_agent", label: "Property Agent", description: "Verified houses, apartments, land, and commercial property for rent or sale." },
];

const ACTIVE_BUSINESS_PREFIX = "kunthai.marketplace.active-business.v1";
export const MARKETPLACE_BUSINESS_CHANGED_EVENT = "kunthai-marketplace-business-changed";

export const INITIAL_REGISTRATION = {
  identity: {
    businessKind: "retail",
    businessName: "",
    categories: [],
    otherCategory: "",
    description: "",
    logoFile: null,
    logoName: "",
    bannerFile: null,
    bannerName: "",
  },
  location: {
    country: "",
    city: "",
    address: "",
    phone: "",
    whatsappEnabled: false,
    whatsapp: "",
    email: "",
    website: "",
    discoverableNearby: true,
    coordinates: null,
  },
  operations: {
    businessType: "both",
    deliveryEnabled: true,
    pickupEnabled: true,
    operatingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    openTime: "09:00",
    closeTime: "18:00",
  },
  trustPayout: {
    idDocumentFile: null,
    idDocumentName: "",
    businessDocumentFile: null,
    businessDocumentName: "",
    connectKunThaiMoney: true,
    bankName: "",
    accountNumber: "",
    accountName: "",
    skipped: false,
  },
};

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    throw new Error("You must be signed in to register a business.");
  }
  return data.user.id;
}

async function uploadBusinessFile(userId, file, folder) {
  if (!file) return "";

  const extension = file.name.split(".").pop() || "bin";
  const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("marketplace-business-media").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) {
    throw new Error(error.message || "Unable to upload business file.");
  }

  const { data } = supabase.storage.from("marketplace-business-media").getPublicUrl(path);
  return data.publicUrl;
}

function normalizeBusiness(row, categories = [], payoutMethod = null, documents = []) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    businessKind: row.business_kind || "retail",
    identity: {
      businessKind: row.business_kind || "retail",
      businessName: row.business_name,
      categories: categories.map((item) => item.category),
      otherCategory: "",
      description: row.description,
      logoUrl: row.logo_url || "",
      bannerUrl: row.banner_url || "",
      logoName: row.logo_url ? "Uploaded logo" : "",
      bannerName: row.banner_url ? "Uploaded banner" : "",
    },
    location: {
      country: row.country,
      countryIso: row.country_iso || "",
      currency: row.currency || "",
      city: row.city,
      address: row.address,
      phone: row.phone,
      whatsappEnabled: row.whatsapp_enabled,
      whatsapp: row.whatsapp,
      email: row.email,
      website: row.website_url || "",
      discoverableNearby: row.discoverable_nearby,
      coordinates:
        typeof row.latitude === "number" && typeof row.longitude === "number"
          ? { latitude: row.latitude, longitude: row.longitude }
          : null,
    },
    operations: {
      businessType: row.business_type,
      deliveryEnabled: row.delivery_enabled,
      pickupEnabled: row.pickup_enabled,
      operatingDays: Array.isArray(row.operating_days) ? row.operating_days : ["Mon", "Tue", "Wed", "Thu", "Fri"],
      openTime: row.open_time || "",
      closeTime: row.close_time || "",
    },
    trustPayout: {
      idDocumentName: documents.find((item) => item.document_type === "id")?.file_name || "",
      businessDocumentName: documents.find((item) => item.document_type === "business")?.file_name || "",
      connectKunThaiMoney: Boolean(payoutMethod?.kunthai_money_connected),
      bankName: payoutMethod?.bank_name || "",
      accountNumber: payoutMethod?.account_number_mask || "",
      accountName: payoutMethod?.account_name || "",
      skipped: Boolean(payoutMethod?.skipped),
    },
    readinessScore: row.readiness_score,
    verificationStatus: row.verification_status,
  };
}

function activeBusinessStorageKey(userId) {
  return `${ACTIVE_BUSINESS_PREFIX}.${userId}`;
}

export async function setActiveRegisteredBusiness(businessId) {
  const userId = await getCurrentUserId();
  if (businessId) localStorage.setItem(activeBusinessStorageKey(userId), businessId);
  else localStorage.removeItem(activeBusinessStorageKey(userId));
  window.dispatchEvent(new CustomEvent(MARKETPLACE_BUSINESS_CHANGED_EVENT, { detail: { businessId } }));
  return businessId;
}

export async function readRegisteredBusinesses() {
  const userId = await getCurrentUserId();
  const { data: rows, error } = await supabase
    .from("marketplace_businesses")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  const businesses = await Promise.all((rows || []).map(async (business) => {
    const [{ data: categories }, { data: payoutMethod }, { data: documents }] = await Promise.all([
      supabase.from("marketplace_business_categories").select("category").eq("business_id", business.id),
      supabase.from("marketplace_payout_methods").select("*").eq("business_id", business.id).maybeSingle(),
      supabase.from("marketplace_business_documents").select("*").eq("business_id", business.id),
    ]);
    return normalizeBusiness(business, categories || [], payoutMethod || null, documents || []);
  }));

  return businesses;
}

export async function readRegisteredBusiness() {
  const userId = await getCurrentUserId();
  const businesses = await readRegisteredBusinesses();
  if (!businesses.length) return null;
  const activeId = localStorage.getItem(activeBusinessStorageKey(userId));
  const business = businesses.find((item) => item.id === activeId) || businesses[0];
  if (business.id !== activeId) localStorage.setItem(activeBusinessStorageKey(userId), business.id);
  storeCountryContext(business.location.country);
  return business;
}

export async function hasRegisteredBusiness() {
  const business = await readRegisteredBusiness();
  return Boolean(business);
}

export async function submitSellerRegistration(registration) {
  const userId = await getCurrentUserId();
  storeCountryContext(registration.location.country);
  const countryProfile = getActiveCountryProfile(registration.location.country);
  if (!registration.trustPayout.idDocumentFile || !registration.trustPayout.businessDocumentFile) {
    throw new Error("Upload both your identity document and business registration document before submitting.");
  }
  const readinessScore = calculateReadinessScore(registration);
  const [logoUrl, bannerUrl, idDocumentUrl, businessDocumentUrl] = await Promise.all([
    uploadBusinessFile(userId, registration.identity.logoFile, "logos"),
    uploadBusinessFile(userId, registration.identity.bannerFile, "banners"),
    uploadBusinessFile(userId, registration.trustPayout.idDocumentFile, "documents"),
    uploadBusinessFile(userId, registration.trustPayout.businessDocumentFile, "documents"),
  ]);

  const verified = Boolean(idDocumentUrl || businessDocumentUrl);
  const businessPayload = {
    user_id: userId,
    business_kind: registration.identity.businessKind || "retail",
    business_name: registration.identity.businessName.trim(),
    description: registration.identity.description.trim(),
    country: registration.location.country.trim(),
    country_iso: countryProfile.iso2,
    currency: countryProfile.currency.code,
    city: registration.location.city.trim(),
    address: registration.location.address.trim(),
    phone: registration.location.phone.trim(),
    whatsapp_enabled: registration.location.whatsappEnabled,
    whatsapp: registration.location.whatsapp.trim(),
    email: registration.location.email.trim(),
    website_url: registration.location.website.trim(),
    discoverable_nearby: registration.location.discoverableNearby,
    latitude: registration.location.coordinates?.latitude ?? null,
    longitude: registration.location.coordinates?.longitude ?? null,
    business_type: registration.operations.businessType,
    delivery_enabled: ["retail", "restaurant"].includes(registration.identity.businessKind) && registration.operations.deliveryEnabled,
    pickup_enabled: ["retail", "restaurant"].includes(registration.identity.businessKind) && registration.operations.pickupEnabled,
    operating_days: registration.operations.operatingDays || [],
    open_time: registration.operations.openTime || null,
    close_time: registration.operations.closeTime || null,
    logo_url: logoUrl || null,
    banner_url: bannerUrl || null,
    verification_status: verified ? "submitted" : "pending",
    readiness_score: readinessScore,
    updated_at: new Date().toISOString(),
  };

  let { data: business, error } = await supabase.from("marketplace_businesses").insert(businessPayload).select().maybeSingle();

  if (
    error &&
    ["website_url", "operating_days", "country_iso", "currency", "business_kind"].some((column) => isMissingColumn(error, column))
  ) {
    const {
      website_url: _websiteUrl,
      operating_days: _operatingDays,
      country_iso: _countryIso,
      currency: _currency,
      business_kind: _businessKind,
      ...fallbackPayload
    } = businessPayload;
    const fallback = await supabase.from("marketplace_businesses").insert(fallbackPayload).select().maybeSingle();
    business = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  await supabase.from("marketplace_business_categories").delete().eq("business_id", business.id);
  if (registration.identity.categories.length) {
    const { error: categoryError } = await supabase.from("marketplace_business_categories").insert(
      registration.identity.categories.map((category) => ({ business_id: business.id, category })),
    );
    if (categoryError) throw new Error(categoryError.message);
  }

  const payoutPayload = registration.trustPayout.skipped
    ? {
        business_id: business.id,
        method_type: "skipped",
        kunthai_money_connected: false,
        bank_name: "",
        account_number_mask: "",
        account_name: "",
        skipped: true,
      }
    : {
        business_id: business.id,
        method_type: registration.trustPayout.connectKunThaiMoney ? "kunthai_money" : "bank",
        kunthai_money_connected: registration.trustPayout.connectKunThaiMoney,
        bank_name: registration.trustPayout.bankName.trim(),
        account_number_mask: registration.trustPayout.accountNumber
          ? `**** ${registration.trustPayout.accountNumber.slice(-4)}`
          : "",
        account_name: registration.trustPayout.accountName.trim(),
        skipped: false,
      };

  const { error: payoutError } = await supabase
    .from("marketplace_payout_methods")
    .upsert(payoutPayload, { onConflict: "business_id" });
  if (payoutError) throw new Error(payoutError.message);

  const documentRows = [
    idDocumentUrl
      ? {
          business_id: business.id,
          document_type: "id",
          file_name: registration.trustPayout.idDocumentName,
          file_url: idDocumentUrl,
        }
      : null,
    businessDocumentUrl
      ? {
          business_id: business.id,
          document_type: "business",
          file_name: registration.trustPayout.businessDocumentName,
          file_url: businessDocumentUrl,
        }
      : null,
  ].filter(Boolean);

  if (documentRows.length) {
    const { error: documentError } = await supabase.from("marketplace_business_documents").insert(documentRows);
    if (documentError) throw new Error(documentError.message);
  }

  await supabase.from("marketplace_activities").insert({
    business_id: business.id,
    activity_type: "product",
    title: "Business profile created",
    description: `${business.business_name} was registered as a seller business.`,
    status: "completed",
    meta: "Registration",
  });

  await setActiveRegisteredBusiness(business.id);
  return readRegisteredBusiness();
}

export async function updateRegisteredBusinessProfile(updates) {
  const currentBusiness = await readRegisteredBusiness();
  if (!currentBusiness?.id) {
    throw new Error("No registered business profile was found.");
  }

  const userId = await getCurrentUserId();
  const registration = {
    identity: {
      ...currentBusiness.identity,
      ...(updates.identity || {}),
      logoFile: updates.identity?.logoFile || null,
      bannerFile: updates.identity?.bannerFile || null,
      businessKind: updates.identity?.businessKind || currentBusiness.businessKind || "retail",
    },
    location: {
      ...currentBusiness.location,
      ...(updates.location || {}),
    },
    operations: {
      ...currentBusiness.operations,
      ...(updates.operations || {}),
    },
    trustPayout: {
      ...currentBusiness.trustPayout,
      ...(updates.trustPayout || {}),
      idDocumentFile: updates.trustPayout?.idDocumentFile || null,
      businessDocumentFile: updates.trustPayout?.businessDocumentFile || null,
    },
  };
  const [logoUrl, bannerUrl, idDocumentUrl, businessDocumentUrl] = await Promise.all([
    uploadBusinessFile(userId, registration.identity.logoFile, "logos"),
    uploadBusinessFile(userId, registration.identity.bannerFile, "banners"),
    uploadBusinessFile(userId, registration.trustPayout.idDocumentFile, "documents"),
    uploadBusinessFile(userId, registration.trustPayout.businessDocumentFile, "documents"),
  ]);

  const businessPayload = {
    business_kind: registration.identity.businessKind || currentBusiness.businessKind || "retail",
    business_name: registration.identity.businessName.trim(),
    description: registration.identity.description.trim(),
    country: registration.location.country.trim(),
    city: registration.location.city.trim(),
    address: registration.location.address.trim(),
    phone: registration.location.phone.trim(),
    whatsapp_enabled: Boolean(registration.location.whatsappEnabled),
    whatsapp: registration.location.whatsapp.trim(),
    email: registration.location.email.trim(),
    website_url: registration.location.website.trim(),
    discoverable_nearby: Boolean(registration.location.discoverableNearby),
    latitude: registration.location.coordinates?.latitude ?? null,
    longitude: registration.location.coordinates?.longitude ?? null,
    business_type: registration.operations.businessType || "both",
    delivery_enabled: ["retail", "restaurant"].includes(registration.identity.businessKind) && Boolean(registration.operations.deliveryEnabled),
    pickup_enabled: ["retail", "restaurant"].includes(registration.identity.businessKind) && Boolean(registration.operations.pickupEnabled),
    operating_days: registration.operations.operatingDays || [],
    open_time: registration.operations.openTime || null,
    close_time: registration.operations.closeTime || null,
    logo_url: logoUrl || currentBusiness.identity.logoUrl || null,
    banner_url: bannerUrl || currentBusiness.identity.bannerUrl || null,
    readiness_score: calculateReadinessScore(registration),
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from("marketplace_businesses")
    .update(businessPayload)
    .eq("id", currentBusiness.id);

  if (error && (isMissingColumn(error, "website_url") || isMissingColumn(error, "operating_days") || isMissingColumn(error, "business_kind"))) {
    const { website_url: _websiteUrl, operating_days: _operatingDays, business_kind: _businessKind, ...fallbackPayload } = businessPayload;
    const fallback = await supabase
      .from("marketplace_businesses")
      .update(fallbackPayload)
      .eq("id", currentBusiness.id);
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  if (updates.identity?.categories) {
    await supabase.from("marketplace_business_categories").delete().eq("business_id", currentBusiness.id);
    const categories = registration.identity.categories.filter(Boolean);
    if (categories.length) {
      const { error: categoryError } = await supabase.from("marketplace_business_categories").insert(
        categories.map((category) => ({ business_id: currentBusiness.id, category })),
      );
      if (categoryError) throw new Error(categoryError.message);
    }
  }

  const payoutPayload = registration.trustPayout.skipped
    ? {
        business_id: currentBusiness.id,
        method_type: "skipped",
        kunthai_money_connected: false,
        bank_name: "",
        account_number_mask: "",
        account_name: "",
        skipped: true,
      }
    : {
        business_id: currentBusiness.id,
        method_type: registration.trustPayout.connectKunThaiMoney ? "kunthai_money" : "bank",
        kunthai_money_connected: Boolean(registration.trustPayout.connectKunThaiMoney),
        bank_name: registration.trustPayout.bankName?.trim?.() || "",
        account_number_mask: registration.trustPayout.accountNumber
          ? `**** ${String(registration.trustPayout.accountNumber).slice(-4)}`
          : currentBusiness.trustPayout.accountNumber || "",
        account_name: registration.trustPayout.accountName?.trim?.() || "",
        skipped: false,
      };

  const { error: payoutError } = await supabase
    .from("marketplace_payout_methods")
    .upsert(payoutPayload, { onConflict: "business_id" });
  if (payoutError) throw new Error(payoutError.message);

  const documentRows = [
    idDocumentUrl
      ? {
          business_id: currentBusiness.id,
          document_type: "id",
          file_name: registration.trustPayout.idDocumentName,
          file_url: idDocumentUrl,
        }
      : null,
    businessDocumentUrl
      ? {
          business_id: currentBusiness.id,
          document_type: "business",
          file_name: registration.trustPayout.businessDocumentName,
          file_url: businessDocumentUrl,
        }
      : null,
  ].filter(Boolean);

  if (documentRows.length) {
    const { error: documentError } = await supabase.from("marketplace_business_documents").insert(documentRows);
    if (documentError) throw new Error(documentError.message);
  }

  return readRegisteredBusiness();
}

export function calculateReadinessScore(registration) {
  const usesCategories = registration.identity.businessKind === "retail";
  const usesFulfillment = ["retail", "restaurant"].includes(registration.identity.businessKind);
  const checks = [
    registration.identity.businessName,
    !usesCategories || registration.identity.categories.length > 0,
    registration.identity.description,
    registration.identity.logoFile || registration.identity.logoUrl || registration.identity.logoName,
    registration.location.country,
    registration.location.city,
    registration.location.address,
    registration.location.phone,
    registration.location.email,
    registration.location.website,
    registration.location.coordinates,
    registration.operations.businessType,
    !usesFulfillment || registration.operations.deliveryEnabled || registration.operations.pickupEnabled,
    registration.operations.openTime,
    registration.operations.closeTime,
    registration.trustPayout.idDocumentFile || registration.trustPayout.idDocumentName,
    registration.trustPayout.businessDocumentFile || registration.trustPayout.businessDocumentName,
    registration.trustPayout.connectKunThaiMoney || registration.trustPayout.bankName,
  ];

  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}
