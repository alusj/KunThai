import supabase from "../../lib/supabaseClient";
import {
  getActiveCountryProfile,
  storeCountryContext,
} from "../../../data/globalCountryProfiles";
import {
  formatDocumentRequirementLabel,
  getUrMallDocumentRequirements,
} from "../../../data/globalDocumentRequirements";
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
  { id: "property_agent", label: "Real Estate Agent", description: "Homes, apartments, land, and commercial property for rent or sale." },
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
    mainLabel: "Main store",
    branches: [],
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
    connectKunThaiMoney: false,
    bankName: "",
    accountNumber: "",
    accountName: "",
    skipped: true,
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
    cacheControl: "31536000",
    upsert: true,
  });

  if (error) {
    throw new Error(error.message || "Unable to upload business file.");
  }

  const { data } = supabase.storage.from("marketplace-business-media").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadBusinessDocumentRequirements(userId, trustPayout, requirements) {
  return Promise.all(
    requirements.map(async (requirement) => ({
      requirement,
      fileName: trustPayout[requirement.nameField] || "",
      fileUrl: await uploadBusinessFile(userId, trustPayout[requirement.fileField], "documents"),
    })),
  );
}

function buildBusinessDocumentRows(businessId, documentUploads) {
  return documentUploads
    .map(({ requirement, fileName, fileUrl }) => fileUrl
      ? {
          business_id: businessId,
          document_type: requirement.legacyDocumentType || requirement.key,
          file_name: fileName,
          file_url: fileUrl,
        }
      : null)
    .filter(Boolean);
}

export const MAX_BUSINESS_LOCATIONS = 10;

function normalizeBranchRow(row) {
  return {
    id: row.id,
    label: row.label || "Branch",
    address: row.address || "",
    city: row.city || "",
    country: row.country || "",
    coordinates:
      typeof row.latitude === "number" && typeof row.longitude === "number"
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
  };
}

function isMissingLocationsTable(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("marketplace_business_locations") &&
    (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"))
  );
}

// Every location (main store plus branches) lives in
// marketplace_business_locations; the primary row is also mirrored onto the
// business row's address/latitude/longitude columns for older readers.
async function saveBusinessLocations(businessId, registration) {
  const location = registration.location || {};
  const branches = (Array.isArray(location.branches) ? location.branches : [])
    .filter((branch) => branch && (String(branch.address || "").trim() || branch.coordinates))
    .slice(0, MAX_BUSINESS_LOCATIONS - 1);

  const rows = [
    {
      business_id: businessId,
      label: String(location.mainLabel || "Main store").trim() || "Main store",
      address: String(location.address || "").trim(),
      city: String(location.city || "").trim(),
      country: String(location.country || "").trim(),
      latitude: location.coordinates?.latitude ?? null,
      longitude: location.coordinates?.longitude ?? null,
      is_primary: true,
      position: 0,
    },
    ...branches.map((branch, index) => ({
      business_id: businessId,
      label: String(branch.label || `Branch ${index + 2}`).trim() || `Branch ${index + 2}`,
      address: String(branch.address || "").trim(),
      city: String(branch.city || location.city || "").trim(),
      country: String(branch.country || location.country || "").trim(),
      latitude: branch.coordinates?.latitude ?? null,
      longitude: branch.coordinates?.longitude ?? null,
      is_primary: false,
      position: index + 1,
    })),
  ];

  const { error: deleteError } = await supabase
    .from("marketplace_business_locations")
    .delete()
    .eq("business_id", businessId);
  if (deleteError) {
    if (isMissingLocationsTable(deleteError)) return;
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await supabase.from("marketplace_business_locations").insert(rows);
  if (insertError) {
    if (isMissingLocationsTable(insertError)) return;
    throw new Error(insertError.message);
  }
}

async function readBusinessLocations(businessId) {
  const { data, error } = await supabase
    .from("marketplace_business_locations")
    .select("*")
    .eq("business_id", businessId)
    .order("position", { ascending: true });

  if (error) return [];
  return data || [];
}

function normalizeBusiness(row, categories = [], payoutMethod = null, documents = [], locations = []) {
  if (!row) return null;

  const primaryLocation = locations.find((item) => item.is_primary) || null;
  const branchRows = locations.filter((item) => !item.is_primary);

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
      mainLabel: primaryLocation?.label || "Main store",
      branches: branchRows.map(normalizeBranchRow),
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
      connectKunThaiMoney: false,
      bankName: payoutMethod?.bank_name || "",
      accountNumber: payoutMethod?.account_number_mask || "",
      accountName: payoutMethod?.account_name || "",
      skipped: payoutMethod ? Boolean(payoutMethod.skipped) : true,
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

// Accepted admin roles surface the other owner's business in the same
// workspace list; RLS enforces what the admin can actually read or change
// per responsibility, so the client only carries the role metadata.
async function readAcceptedAdminBusinessRows(userId) {
  const { data: adminRows, error } = await supabase
    .from("marketplace_business_admins")
    .select("business_id, responsibilities, business_name")
    .eq("user_id", userId)
    .eq("status", "accepted");

  if (error || !adminRows?.length) return [];

  const businessIds = [...new Set(adminRows.map((row) => row.business_id).filter(Boolean))];
  const { data: businessRows, error: businessError } = await supabase
    .from("marketplace_businesses")
    .select("*")
    .in("id", businessIds);

  if (businessError) return [];

  const responsibilitiesById = new Map(adminRows.map((row) => [row.business_id, row.responsibilities || {}]));
  return (businessRows || []).map((row) => ({
    row,
    responsibilities: responsibilitiesById.get(row.id) || {},
  }));
}

export async function readRegisteredBusinesses() {
  const userId = await getCurrentUserId();
  const [{ data: rows, error }, adminBusinesses] = await Promise.all([
    supabase
      .from("marketplace_businesses")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    readAcceptedAdminBusinessRows(userId).catch(() => []),
  ]);

  if (error) throw new Error(error.message);

  const ownedIds = new Set((rows || []).map((row) => row.id));
  const entries = [
    ...(rows || []).map((row) => ({ row, role: "owner", responsibilities: null })),
    ...adminBusinesses
      .filter((entry) => !ownedIds.has(entry.row.id))
      .map((entry) => ({ row: entry.row, role: "admin", responsibilities: entry.responsibilities })),
  ];

  const businesses = await Promise.all(entries.map(async ({ row, role, responsibilities }) => {
    const [{ data: categories }, { data: payoutMethod }, { data: documents }, locations] = await Promise.all([
      supabase.from("marketplace_business_categories").select("category").eq("business_id", row.id),
      supabase.from("marketplace_payout_methods").select("*").eq("business_id", row.id).maybeSingle(),
      supabase.from("marketplace_business_documents").select("*").eq("business_id", row.id),
      readBusinessLocations(row.id),
    ]);
    const business = normalizeBusiness(row, categories || [], payoutMethod || null, documents || [], locations);
    business.role = role;
    business.adminResponsibilities = role === "admin"
      ? {
          addProducts: Boolean(responsibilities?.addProducts),
          messageReplies: Boolean(responsibilities?.messageReplies),
          dashboardAccess: responsibilities?.dashboardAccess !== false,
        }
      : null;
    return business;
  }));

  return businesses;
}

export async function readUsedBusinessKinds() {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("marketplace_businesses")
    .select("id, business_kind")
    .eq("user_id", userId);

  if (error) return [];
  return (data || []).map((row) => ({ id: row.id, kind: row.business_kind || "retail" }));
}

export async function deleteRegisteredBusiness(businessId) {
  const userId = await getCurrentUserId();
  if (!businessId) throw new Error("Choose a business to delete.");

  const { error } = await supabase.rpc("delete_my_marketplace_business", {
    target_business_id: businessId,
  });

  if (error) {
    throw new Error("KunThai could not delete this business right now. Please try again.");
  }

  const activeKey = activeBusinessStorageKey(userId);
  if (localStorage.getItem(activeKey) === businessId) {
    localStorage.removeItem(activeKey);
  }
  window.dispatchEvent(new CustomEvent(MARKETPLACE_BUSINESS_CHANGED_EVENT, { detail: { businessId: null } }));
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
  const documentRequirements = getUrMallDocumentRequirements({
    country: registration.location.country,
    countryCode: registration.location.countryIso || countryProfile.iso2,
  });
  const readinessScore = calculateReadinessScore(registration);
  const [logoUrl, bannerUrl, documentUploads] = await Promise.all([
    uploadBusinessFile(userId, registration.identity.logoFile, "logos"),
    uploadBusinessFile(userId, registration.identity.bannerFile, "banners"),
    uploadBusinessDocumentRequirements(userId, registration.trustPayout, documentRequirements),
  ]);

  const submittedDocuments = documentUploads.some((document) => document.fileUrl);
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
    verification_status: submittedDocuments ? "submitted" : "not_verified",
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

  await saveBusinessLocations(business.id, registration);

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

  const documentRows = buildBusinessDocumentRows(business.id, documentUploads);

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
  const countryProfile = getActiveCountryProfile(registration.location.country || registration.location.countryIso);
  const documentRequirements = getUrMallDocumentRequirements({
    country: registration.location.country,
    countryCode: registration.location.countryIso || countryProfile.iso2,
  });
  const [logoUrl, bannerUrl, documentUploads] = await Promise.all([
    uploadBusinessFile(userId, registration.identity.logoFile, "logos"),
    uploadBusinessFile(userId, registration.identity.bannerFile, "banners"),
    uploadBusinessDocumentRequirements(userId, registration.trustPayout, documentRequirements),
  ]);

  const businessPayload = {
    business_kind: registration.identity.businessKind || currentBusiness.businessKind || "retail",
    business_name: registration.identity.businessName.trim(),
    description: registration.identity.description.trim(),
    country: registration.location.country.trim(),
    country_iso: countryProfile.iso2,
    currency: countryProfile.currency.code,
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

  await saveBusinessLocations(currentBusiness.id, registration);

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

  const documentRows = buildBusinessDocumentRows(currentBusiness.id, documentUploads);

  if (documentRows.length) {
    const { error: documentError } = await supabase.from("marketplace_business_documents").insert(documentRows);
    if (documentError) throw new Error(documentError.message);
  }

  return readRegisteredBusiness();
}

function readinessItem(key, label, complete) {
  return { key, label, complete: Boolean(complete) };
}

export function getReadinessChecklist(registration = INITIAL_REGISTRATION) {
  const identity = registration.identity || INITIAL_REGISTRATION.identity;
  const location = registration.location || INITIAL_REGISTRATION.location;
  const operations = registration.operations || INITIAL_REGISTRATION.operations;
  const trustPayout = registration.trustPayout || INITIAL_REGISTRATION.trustPayout;
  const categories = Array.isArray(identity.categories) ? identity.categories : [];
  const usesCategories = identity.businessKind === "retail";
  const usesFulfillment = ["retail", "restaurant"].includes(identity.businessKind);
  const documentChecks = getUrMallDocumentRequirements({
    country: location.country,
    countryCode: location.countryIso,
  }).map((requirement) => readinessItem(
    `document-${requirement.key}`,
    `${formatDocumentRequirementLabel(requirement)} document`,
    trustPayout[requirement.fileField] || trustPayout[requirement.nameField],
  ));

  return [
    readinessItem("business-name", "Business name", identity.businessName),
    readinessItem("categories", "Retail categories", !usesCategories || categories.length > 0),
    readinessItem("description", "Business description", identity.description),
    readinessItem("logo", "Business logo", identity.logoFile || identity.logoUrl || identity.logoName),
    readinessItem("country", "Country", location.country),
    readinessItem("city", "City or district", location.city),
    readinessItem("address", "Street address or landmark", location.address),
    readinessItem("phone", "Business phone number", location.phone),
    readinessItem("email", "Business email", location.email),
    readinessItem("website", "Website or public page", location.website),
    readinessItem("coordinates", "Map location pin", location.coordinates),
    readinessItem("business-type", "Business type", operations.businessType),
    readinessItem(
      "fulfillment",
      "Delivery or pickup option",
      !usesFulfillment || operations.deliveryEnabled || operations.pickupEnabled,
    ),
    readinessItem("open-time", "Opening time", operations.openTime),
    readinessItem("close-time", "Closing time", operations.closeTime),
    ...documentChecks,
  ];
}

export function calculateReadinessScore(registration) {
  const checks = getReadinessChecklist(registration);

  const complete = checks.filter((item) => item.complete).length;
  return Math.round((complete / checks.length) * 100);
}
