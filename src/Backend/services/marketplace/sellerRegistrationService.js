import supabase from "../../lib/supabaseClient";

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

export const INITIAL_REGISTRATION = {
  identity: {
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
    discoverableNearby: true,
    coordinates: null,
  },
  operations: {
    businessType: "both",
    deliveryEnabled: true,
    pickupEnabled: true,
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
    identity: {
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
      city: row.city,
      address: row.address,
      phone: row.phone,
      whatsappEnabled: row.whatsapp_enabled,
      whatsapp: row.whatsapp,
      email: row.email,
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

export async function readRegisteredBusiness() {
  const userId = await getCurrentUserId();
  const { data: business, error } = await supabase
    .from("marketplace_businesses")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!business) return null;

  const [{ data: categories }, { data: payoutMethod }, { data: documents }] = await Promise.all([
    supabase.from("marketplace_business_categories").select("category").eq("business_id", business.id),
    supabase.from("marketplace_payout_methods").select("*").eq("business_id", business.id).maybeSingle(),
    supabase.from("marketplace_business_documents").select("*").eq("business_id", business.id),
  ]);

  return normalizeBusiness(business, categories || [], payoutMethod || null, documents || []);
}

export async function hasRegisteredBusiness() {
  const business = await readRegisteredBusiness();
  return Boolean(business);
}

export async function submitSellerRegistration(registration) {
  const userId = await getCurrentUserId();
  const readinessScore = calculateReadinessScore(registration);
  const [logoUrl, bannerUrl, idDocumentUrl, businessDocumentUrl] = await Promise.all([
    uploadBusinessFile(userId, registration.identity.logoFile, "logos"),
    uploadBusinessFile(userId, registration.identity.bannerFile, "banners"),
    uploadBusinessFile(userId, registration.trustPayout.idDocumentFile, "documents"),
    uploadBusinessFile(userId, registration.trustPayout.businessDocumentFile, "documents"),
  ]);

  const verified = Boolean(idDocumentUrl || businessDocumentUrl);
  const { data: business, error } = await supabase
    .from("marketplace_businesses")
    .upsert(
      {
        user_id: userId,
        business_name: registration.identity.businessName.trim(),
        description: registration.identity.description.trim(),
        country: registration.location.country.trim(),
        city: registration.location.city.trim(),
        address: registration.location.address.trim(),
        phone: registration.location.phone.trim(),
        whatsapp_enabled: registration.location.whatsappEnabled,
        whatsapp: registration.location.whatsapp.trim(),
        email: registration.location.email.trim(),
        discoverable_nearby: registration.location.discoverableNearby,
        latitude: registration.location.coordinates?.latitude ?? null,
        longitude: registration.location.coordinates?.longitude ?? null,
        business_type: registration.operations.businessType,
        delivery_enabled: registration.operations.deliveryEnabled,
        pickup_enabled: registration.operations.pickupEnabled,
        open_time: registration.operations.openTime || null,
        close_time: registration.operations.closeTime || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        verification_status: verified ? "submitted" : "pending",
        readiness_score: readinessScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select()
    .maybeSingle();

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

  return readRegisteredBusiness();
}

export function calculateReadinessScore(registration) {
  const checks = [
    registration.identity.businessName,
    registration.identity.categories.length > 0,
    registration.identity.description,
    registration.identity.logoFile || registration.identity.logoUrl || registration.identity.logoName,
    registration.location.country,
    registration.location.city,
    registration.location.address,
    registration.location.phone,
    registration.location.email,
    registration.location.coordinates,
    registration.operations.businessType,
    registration.operations.deliveryEnabled || registration.operations.pickupEnabled,
    registration.operations.openTime,
    registration.operations.closeTime,
    registration.trustPayout.skipped ||
      registration.trustPayout.connectKunThaiMoney ||
      registration.trustPayout.bankName,
  ];

  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}
