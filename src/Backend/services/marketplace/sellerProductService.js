import supabase from "../../lib/supabaseClient";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { isMissingColumn } from "../explore/errors";
import {
  assertVisibilityCreditsAvailable,
  MINIMUM_VISIBILITY_CREDITS,
  normalizeVisibilityCreditSpend,
} from "../visibilityCreditService";
import { readRegisteredBusiness } from "./sellerRegistrationService";
import { assertBusinessCapacity } from "../businessSubscriptionService";
import { normalizeTierPricing } from "./tierPricingUtils";
import { optimizeImageFile } from "./imageOptimization";
import { hasBusinessPlans } from "./marketplaceBusinessKinds";

function withTimeout(promise, message, timeoutMs = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function notifySellerNotificationsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("marketplace-seller-notifications-updated"));
}

export const INITIAL_PRODUCT_FORM = {
  basics: {
    name: "",
    category: "",
    description: "",
    condition: "new",
    brand: "",
    model: "",
  },
  details: {
    size: "",
    color: "",
    material: "",
    weight: "",
    dimensions: "",
    warranty: "",
    variants: "",
    specifications: "",
    tierPricing: [],
    sellingUnit: "",
    packSize: "",
    minimumOrderQuantity: "",
    leadTimeDays: "",
    barcode: "",
  },
  media: {
    coverImageFile: null,
    coverImageName: "",
    extraImageFiles: [],
    videoFile: null,
    videoName: "",
  },
  pricing: {
    price: "",
    discountPrice: "",
    stock: "",
    sku: "",
    lowStockAlert: "3",
    allowNegotiation: false,
    publishStatus: "active",
    promotionCreditPackage: "small",
    promotionCredits: String(MINIMUM_VISIBILITY_CREDITS),
    promotionAudience: "countrywide",
  },
  delivery: {
    deliveryAvailable: true,
    pickupAvailable: true,
    deliveryTime: "",
    location: "",
  },
};

function countByStatus(products, status) {
  return products.filter((product) => product.status === status).length;
}

function normalizeSellerProduct(product) {
  if (!product) return null;

  const attributes = product.product_attributes && typeof product.product_attributes === "object"
    ? product.product_attributes
    : {};
  const tierPricing = normalizeTierPricing(product.tier_pricing || attributes.tierPricing);

  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    price: Number(product.price || 0),
    discountPrice: product.discount_price === null ? null : Number(product.discount_price || 0),
    condition: product.condition,
    brand: product.brand,
    model: product.model,
    details: { ...attributes, tierPricing },
    tierPricing,
    status: product.status,
    stock: product.stock,
    sku: product.sku,
    lowStockAlert: product.low_stock_alert,
    allowNegotiation: product.allow_negotiation,
    deliveryAvailable: product.delivery_available,
    pickupAvailable: product.pickup_available,
    deliveryTime: product.delivery_time,
    location: product.location,
    mainImageUrl: product.main_image_url,
    imageUrls: Array.isArray(product.image_urls) ? product.image_urls : [],
    videoUrl: product.video_url,
    promoted: Boolean(product.promoted),
    promotedAt: product.promoted_at || null,
    publishedAt: product.published_at,
    views: product.views,
    sales: product.sales,
    revenue: Number(product.revenue || 0),
    trend: product.sales > 0 ? "Selling" : "No sales yet",
  };
}

export async function fetchSellerProducts() {
  const business = await readRegisteredBusiness();
  if (!business) {
    return { summary: null, products: [], topSellingProducts: [] };
  }

  const { data, error } = await supabase
    .from("marketplace_products")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const products = (data || []).map(normalizeSellerProduct).filter(Boolean);

  return {
    summary: {
      active: countByStatus(products, "active") + countByStatus(products, "low-stock"),
      draft: countByStatus(products, "draft"),
      outOfStock: countByStatus(products, "out-of-stock"),
      lowStock: countByStatus(products, "low-stock"),
      pendingReview: countByStatus(products, "pending-review"),
      noViewsOrSales: products.filter((product) => product.views === 0 && product.sales === 0).length,
    },
    products,
    topSellingProducts: products
      .filter((product) => product.sales > 0)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 3),
  };
}

export async function fetchSellerProductById(productId) {
  if (!productId) return null;

  const business = await readRegisteredBusiness();
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_products")
    .select("*")
    .eq("business_id", business.id)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeSellerProduct(data);
}

function extractProductNameFromActivity(activity = {}) {
  const description = String(activity.description || "").trim();
  const title = String(activity.title || "").trim();
  const candidates = [
    description.match(/^(.+?)\s+was\s+(?:added|saved)/i)?.[1],
    description.match(/^(.+?)\s+listing details were updated/i)?.[1],
    title.match(/^(.+?)\s+listing$/i)?.[1],
  ];

  return candidates.find(Boolean)?.trim() || "";
}

export async function resolveSellerActivityProduct(activity) {
  if (!activity) return null;

  if (activity.productId) {
    const product = await fetchSellerProductById(activity.productId).catch(() => null);
    if (product) return product;
  }

  const productName = extractProductNameFromActivity(activity).toLowerCase();
  if (!productName) return null;

  const productState = await fetchSellerProducts();
  return productState.products.find((product) => product.name?.trim?.().toLowerCase() === productName) || null;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    throw new Error("You must be signed in to add products.");
  }
  return data.user.id;
}

const MAX_PRODUCT_VIDEO_BYTES = 50 * 1024 * 1024;

async function uploadProductFile(userId, file, folder) {
  if (!file) return "";

  if (folder === "videos" && file.size > MAX_PRODUCT_VIDEO_BYTES) {
    throw new Error(
      `Your video is ${(file.size / (1024 * 1024)).toFixed(1)} MB and we are only accepting a video that is less than 50 MB for now. Trim it and try again.`,
    );
  }

  const uploadFile = await optimizeImageFile(file);
  const extension = uploadFile.name.split(".").pop() || "bin";
  const path = `${userId}/products/${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await withTimeout(
    supabase.storage.from("marketplace-business-media").upload(path, uploadFile, {
      cacheControl: "31536000",
      upsert: true,
    }),
    `Upload timed out for ${file.name}. Your connection may be slow, or the image may still be too large. Try again or choose a smaller image.`,
    folder === "videos" ? 120000 : 60000,
  );

  if (error) throw new Error(error.message || "Unable to upload product file.");

  const { data } = supabase.storage.from("marketplace-business-media").getPublicUrl(path);
  return data.publicUrl;
}

function normalizeProductAttributes(details = {}) {
  const minimumOrderQuantity = Number(details.minimumOrderQuantity);
  const leadTimeDays = Number(details.leadTimeDays);
  return {
    size: String(details.size || "").trim(),
    color: String(details.color || "").trim(),
    material: String(details.material || "").trim(),
    weight: String(details.weight || "").trim(),
    dimensions: String(details.dimensions || "").trim(),
    warranty: String(details.warranty || "").trim(),
    variants: String(details.variants || "").trim(),
    specifications: String(details.specifications || "").trim(),
    tierPricing: normalizeTierPricing(details.tierPricing),
    sellingUnit: String(details.sellingUnit || "").trim(),
    packSize: String(details.packSize || "").trim(),
    minimumOrderQuantity: details.minimumOrderQuantity === "" || details.minimumOrderQuantity == null
      ? ""
      : Number.isFinite(minimumOrderQuantity) ? Math.max(1, Math.floor(minimumOrderQuantity)) : "",
    leadTimeDays: details.leadTimeDays === "" || details.leadTimeDays == null
      ? ""
      : Number.isFinite(leadTimeDays) ? Math.max(0, Math.floor(leadTimeDays)) : "",
    barcode: String(details.barcode || "").trim(),
  };
}

async function insertProductPayload(payload) {
  let { data, error } = await supabase.from("marketplace_products").insert(payload).select().maybeSingle();

  if (error && ["user_id", "product_attributes", "tier_pricing", "country", "country_iso", "currency", "promoted", "promoted_at"].some((column) => isMissingColumn(error, column))) {
    const {
      user_id: _userId,
      product_attributes: _attributes,
      tier_pricing: _tierPricing,
      country: _country,
      country_iso: _countryIso,
      currency: _currency,
      promoted: _promoted,
      promoted_at: _promotedAt,
      ...fallbackPayload
    } = payload;
    const fallback = await supabase.from("marketplace_products").insert(fallbackPayload).select().maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  return { data, error };
}

// After an insert, Postgres RLS can allow the write but return no row from the
// RETURNING clause (the read-after-write policy is stricter than the insert
// policy). The listing is saved and shows up in the dashboard, but its id never
// reaches the client — which used to make "Publish & promote" fail with an
// opaque "choose a product" message. Recover the id by reading the most recent
// matching listing so the promotion can still run.
async function findRecentProductId(businessId, name) {
  if (!businessId) return "";
  try {
    const { data } = await supabase
      .from("marketplace_products")
      .select("id")
      .eq("business_id", businessId)
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.id || "";
  } catch {
    return "";
  }
}

async function updateProductPayload(productId, businessId, payload) {
  let { data, error } = await supabase.from("marketplace_products").update(payload).eq("id", productId).eq("business_id", businessId).select().maybeSingle();

  if (error && ["user_id", "product_attributes", "tier_pricing", "country", "country_iso", "currency", "promoted", "promoted_at"].some((column) => isMissingColumn(error, column))) {
    const {
      user_id: _userId,
      product_attributes: _attributes,
      tier_pricing: _tierPricing,
      country: _country,
      country_iso: _countryIso,
      currency: _currency,
      promoted: _promoted,
      promoted_at: _promotedAt,
      ...fallbackPayload
    } = payload;
    const fallback = await supabase.from("marketplace_products").update(fallbackPayload).eq("id", productId).eq("business_id", businessId).select().maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  return { data, error };
}

async function insertMarketplaceActivity(payload) {
  let { error } = await supabase.from("marketplace_activities").insert(payload);

  if (error && ["product_id", "action_target"].some((column) => isMissingColumn(error, column))) {
    const {
      product_id: _productId,
      action_target: _actionTarget,
      ...fallbackPayload
    } = payload;
    const fallback = await supabase.from("marketplace_activities").insert(fallbackPayload);
    error = fallback.error;
  }

  if (error) throw new Error(error.message);
}

export async function fetchProductFormOptions() {
  const business = await readRegisteredBusiness();
  const countryProfile = getActiveCountryProfile(business?.location?.country);
  if (!business) {
    return {
      categories: [],
      defaultLocation: "",
      deliveryAvailable: true,
      pickupAvailable: true,
      businessKind: "retail",
      vendorDefaults: null,
      vendorQuotationEnabled: false,
    };
  }

  return {
    categories: business.identity.categories,
    defaultLocation: [business.location.city || countryProfile.cityPlaceholder, business.location.country || countryProfile.name].filter(Boolean).join(", "),
    deliveryAvailable: business.operations.deliveryEnabled,
    pickupAvailable: business.operations.pickupEnabled,
    businessKind: business.businessKind || "retail",
    vendorDefaults: business.businessKind === "vendor"
      ? {
          sellingUnit: business.operations.defaultSellingUnit || "item",
          minimumOrderQuantity: String(business.operations.defaultMinOrderQuantity || "1"),
          leadTimeDays: String(business.operations.leadTimeDays ?? "1"),
        }
      : null,
    vendorQuotationEnabled: business.businessKind === "vendor" && business.operations.quotationEnabled !== false,
  };
}

export async function submitSellerProduct(form, onProgress) {
  onProgress?.("prepare");
  const [business, userId] = await Promise.all([readRegisteredBusiness(), getCurrentUserId()]);
  if (!business) throw new Error("Register a business before adding products.");
  const wantsPromotion = form.pricing.publishStatus === "promoted";
  const willBeActive = wantsPromotion || form.pricing.publishStatus === "active";
  const promotionCredits = normalizeVisibilityCreditSpend(
    form.pricing.promotionCredits,
    MINIMUM_VISIBILITY_CREDITS,
  );

  if (willBeActive && hasBusinessPlans(business.businessKind)) {
    await assertBusinessCapacity("urmall", business.id, "products", 1);
  }

  if (wantsPromotion) {
    await assertVisibilityCreditsAvailable(promotionCredits);
  }

  onProgress?.("cover");
  const coverUrl = await uploadProductFile(userId, form.media.coverImageFile, "covers");

  onProgress?.("gallery");
  const extraImageUrls = await Promise.all(
    form.media.extraImageFiles.map((file) => uploadProductFile(userId, file, "gallery")),
  );

  onProgress?.("video");
  let videoUrl = "";
  let videoWarning = "";

  if (form.media.videoFile) {
    try {
      videoUrl = await uploadProductFile(userId, form.media.videoFile, "videos");
    } catch (error) {
      videoWarning = error.message || "Video upload failed. Product was saved without video.";
    }
  }

  const status = wantsPromotion ? "active" : form.pricing.publishStatus;
  const countryProfile = getActiveCountryProfile(business.location.country);
  onProgress?.("save");
  const payload = {
    business_id: business.id,
    user_id: userId,
    name: form.basics.name.trim(),
    description: form.basics.description.trim(),
    category: form.basics.category,
    condition: form.basics.condition,
    brand: form.basics.brand.trim(),
    model: form.basics.model.trim(),
    product_attributes: normalizeProductAttributes(form.details),
    tier_pricing: normalizeTierPricing(form.details.tierPricing),
    price: Number(form.pricing.price || 0),
    discount_price: form.pricing.discountPrice ? Number(form.pricing.discountPrice) : null,
    country: business.location.country || countryProfile.name,
    country_iso: countryProfile.iso2,
    currency: countryProfile.currency.code,
    status,
    stock: Number(form.pricing.stock || 0),
    sku: form.pricing.sku.trim(),
    low_stock_alert: Number(form.pricing.lowStockAlert || 0),
    allow_negotiation: form.pricing.allowNegotiation,
    delivery_available: form.delivery.deliveryAvailable,
    pickup_available: form.delivery.pickupAvailable,
    delivery_time: form.delivery.deliveryTime.trim(),
    location: form.delivery.location.trim(),
    main_image_url: coverUrl || null,
    image_urls: extraImageUrls,
    video_url: videoUrl || null,
    promoted: false,
    promoted_at: null,
    published_at: status === "active" ? new Date().toISOString() : null,
  };
  const { data, error } = await withTimeout(
    insertProductPayload(payload),
    "Product save timed out. Check that the marketplace_products table and policies exist.",
  );

  if (error) throw new Error(error.message);

  // The listing is now saved. Promotion is a separate, best-effort step: if it
  // fails we keep the saved product and surface a specific, traceable reason
  // instead of throwing a generic error that hides what actually happened.
  const productName = form.basics.name.trim();
  let promotedProductId = data?.id || "";
  let promotionWarning = "";

  if (wantsPromotion) {
    if (!promotedProductId) {
      promotedProductId = await findRecentProductId(business.id, productName);
    }

    if (!promotedProductId) {
      promotionWarning =
        `“${productName}” was saved to your catalog, but the Sponsored boost could not start because the new listing's ID was not returned after saving (code: PROMO_NO_ID). Open it in Product Management and tap Promote to boost it.`;
    } else {
      try {
        await promoteSellerProduct(
          { id: promotedProductId, name: productName },
          { credits: promotionCredits, audience: form.pricing.promotionAudience },
        );
      } catch (promotionError) {
        promotionWarning =
          `“${productName}” was saved to your catalog, but the Sponsored boost could not start: ${promotionError.message || "unknown error"} (code: PROMO_FAILED). Open it in Product Management and tap Promote to retry.`;
      }
    }
  }

  withTimeout(
    insertMarketplaceActivity({
      business_id: business.id,
      product_id: data?.id || null,
      activity_type: "product",
      title: status === "draft" ? "Product saved as draft" : "Product added",
      description: `${form.basics.name.trim()} was ${status === "draft" ? "saved as a draft" : "added to your catalog"}.`,
      status: status === "draft" ? "active" : "completed",
      meta: form.basics.category,
      action_label: "View product",
      action_target: "seller-product-detail",
    }),
    "Activity logging timed out.",
    8000,
  ).catch(() => {});
  notifySellerNotificationsUpdated();

  const savedProduct = normalizeSellerProduct(data) || {};
  if (!savedProduct.id && promotedProductId) savedProduct.id = promotedProductId;

  return {
    ...savedProduct,
    promoted: (wantsPromotion && !promotionWarning) || Boolean(data?.promoted),
    videoWarning,
    promotionWarning,
  };
}

export async function updateSellerProductListing(product, form, onProgress) {
  onProgress?.("prepare");
  const [business, userId] = await Promise.all([readRegisteredBusiness(), getCurrentUserId()]);
  if (!business) throw new Error("Register a business before editing products.");
  if (!product?.id) throw new Error("Choose a product listing to edit.");
  const wantsPromotion = form.pricing.publishStatus === "promoted";
  const willBeActive = wantsPromotion || form.pricing.publishStatus === "active";
  const promotionCredits = normalizeVisibilityCreditSpend(
    form.pricing.promotionCredits,
    MINIMUM_VISIBILITY_CREDITS,
  );

  if (willBeActive && product.status !== "active" && hasBusinessPlans(business.businessKind)) {
    await assertBusinessCapacity("urmall", business.id, "products", 1);
  }

  if (wantsPromotion && !product.promoted) {
    await assertVisibilityCreditsAvailable(promotionCredits);
  }

  let coverUrl = product.mainImageUrl || null;
  let extraImageUrls = product.imageUrls || [];
  let videoUrl = product.videoUrl || null;
  let videoWarning = "";

  if (form.media.coverImageFile) {
    onProgress?.("cover");
    coverUrl = await uploadProductFile(userId, form.media.coverImageFile, "covers");
  }

  if (form.media.extraImageFiles.length > 0) {
    onProgress?.("gallery");
    extraImageUrls = await Promise.all(
      form.media.extraImageFiles.map((file) => uploadProductFile(userId, file, "gallery")),
    );
  }

  if (form.media.videoFile) {
    onProgress?.("video");
    try {
      videoUrl = await uploadProductFile(userId, form.media.videoFile, "videos");
    } catch (error) {
      videoWarning = error.message || "Video upload failed. Product was saved without a new video.";
    }
  }

  const status = wantsPromotion ? "active" : form.pricing.publishStatus;
  const keepExistingPromotion = Boolean(product.promoted && wantsPromotion);
  const countryProfile = getActiveCountryProfile(business.location.country);
  onProgress?.("save");
  const payload = {
    user_id: userId,
    name: form.basics.name.trim(),
    description: form.basics.description.trim(),
    category: form.basics.category,
    condition: form.basics.condition,
    brand: form.basics.brand.trim(),
    model: form.basics.model.trim(),
    product_attributes: normalizeProductAttributes(form.details),
    tier_pricing: normalizeTierPricing(form.details.tierPricing),
    price: Number(form.pricing.price || 0),
    discount_price: form.pricing.discountPrice ? Number(form.pricing.discountPrice) : null,
    country: business.location.country || countryProfile.name,
    country_iso: countryProfile.iso2,
    currency: countryProfile.currency.code,
    status,
    stock: Number(form.pricing.stock || 0),
    sku: form.pricing.sku.trim(),
    low_stock_alert: Number(form.pricing.lowStockAlert || 0),
    allow_negotiation: form.pricing.allowNegotiation,
    delivery_available: form.delivery.deliveryAvailable,
    pickup_available: form.delivery.pickupAvailable,
    delivery_time: form.delivery.deliveryTime.trim(),
    location: form.delivery.location.trim(),
    main_image_url: coverUrl,
    image_urls: extraImageUrls,
    video_url: videoUrl,
    promoted: keepExistingPromotion,
    promoted_at: keepExistingPromotion ? product.promotedAt || new Date().toISOString() : null,
    published_at: status === "active" ? product.publishedAt || new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await withTimeout(
    updateProductPayload(product.id, business.id, payload),
    "Product update timed out. Check that the marketplace_products table and policies exist.",
  );

  if (error) throw new Error(error.message);

  // Keep the saved update even if the boost cannot start; report the exact
  // reason instead of throwing an opaque error.
  let promotionWarning = "";
  if (wantsPromotion && !product.promoted) {
    try {
      await promoteSellerProduct(
        { id: product.id, name: form.basics.name.trim() },
        { credits: promotionCredits, audience: form.pricing.promotionAudience },
      );
    } catch (promotionError) {
      promotionWarning =
        `“${form.basics.name.trim()}” was updated, but the Sponsored boost could not start: ${promotionError.message || "unknown error"} (code: PROMO_FAILED). Open it in Product Management and tap Promote to retry.`;
    }
  }

  withTimeout(
    insertMarketplaceActivity({
      business_id: business.id,
      product_id: product.id,
      activity_type: "product",
      title: "Product listing updated",
      description: `${form.basics.name.trim()} listing details were updated.`,
      status: "completed",
      meta: form.basics.category,
      action_label: "View product",
      action_target: "seller-product-detail",
    }),
    "Activity logging timed out.",
    8000,
  ).catch(() => {});
  notifySellerNotificationsUpdated();

  return {
    ...(normalizeSellerProduct(data) || {}),
    promoted: (wantsPromotion && !promotionWarning) || Boolean(data?.promoted),
    videoWarning,
    promotionWarning,
  };
}

export async function updateSellerProduct(productId, patch) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before managing products.");

  if (patch.status === "active" && hasBusinessPlans(business.businessKind)) {
    const { data: currentProduct } = await supabase
      .from("marketplace_products")
      .select("status")
      .eq("id", productId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (currentProduct?.status !== "active") {
      await assertBusinessCapacity("urmall", business.id, "products", 1);
    }
  }

  const { data, error } = await supabase
    .from("marketplace_products")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .eq("business_id", business.id)
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  const productName = data?.name || "Product";
  let title = "Product updated";
  let description = `${productName} was updated.`;
  let status = "completed";
  let meta = "Catalog update";

  if (Object.prototype.hasOwnProperty.call(patch, "stock")) {
    title = "Product stock updated";
    description = `${productName} now has ${Number(patch.stock || 0)} unit${Number(patch.stock || 0) === 1 ? "" : "s"} in stock.`;
    meta = "Inventory";
  } else if (Object.prototype.hasOwnProperty.call(patch, "price")) {
    title = "Product price updated";
    description = `${productName} has a new selling price.`;
    meta = "Pricing";
  } else if (patch.status === "paused") {
    title = "Product paused";
    description = `${productName} is hidden from active selling until you resume it.`;
    status = "warning";
    meta = "Listing paused";
  } else if (patch.status === "active" && patch.published_at) {
    title = "Product published";
    description = `${productName} is now live in your catalog.`;
    meta = "Published";
  } else if (patch.status === "active") {
    title = "Product resumed";
    description = `${productName} is active and visible to buyers again.`;
    meta = "Listing active";
  }

  insertMarketplaceActivity({
    business_id: business.id,
    product_id: productId,
    activity_type: "product",
    title,
    description,
    status,
    meta,
    action_label: "View product",
    action_target: "seller-product-detail",
  }).catch(() => {});
  notifySellerNotificationsUpdated();
  return data;
}

export async function deleteSellerProduct(productId) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before managing products.");

  const { error } = await supabase
    .from("marketplace_products")
    .delete()
    .eq("id", productId)
    .eq("business_id", business.id);

  if (error) throw new Error(error.message);
}

export function createSellerProductShareLink(product) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const productId = encodeURIComponent(product?.id || "");
  if (!origin || !productId) return "";
  return `${origin}/#urmall/product/${productId}`;
}

export async function promoteSellerProduct(product, options = {}) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before promoting products. (code: PROMO_NO_BUSINESS)");
  if (!product?.id) throw new Error("Cannot promote: the listing has no saved ID yet. (code: PROMO_NO_ID)");
  const creditBudget = normalizeVisibilityCreditSpend(
    options.credits || product.promotionCredits,
    MINIMUM_VISIBILITY_CREDITS,
  );
  const audienceType = String(options.audience || product.promotionAudience || "countrywide").trim() || "countrywide";

  const { data, error } = await supabase.rpc("create_marketplace_visibility_promotion", {
    p_product_id: product.id,
    p_credit_budget: creditBudget,
    p_audience_type: audienceType,
  });

  if (error) throw new Error(`${error.message} (code: PROMO_RPC)`);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("marketplace-products-updated"));
    window.dispatchEvent(new CustomEvent("marketplace-seller-notifications-updated"));
    window.dispatchEvent(new CustomEvent("kuntai-visibility-credits-updated"));
  }
  return data;
}
