import supabase from "../../lib/supabaseClient";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { isMissingColumn } from "../explore/errors";
import { readRegisteredBusiness } from "./sellerRegistrationService";
import { normalizeTierPricing } from "./tierPricingUtils";

function withTimeout(promise, message, timeoutMs = 60000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

const IMAGE_UPLOAD_MAX_WIDTH = 1600;
const IMAGE_UPLOAD_MAX_HEIGHT = 1600;
const IMAGE_UPLOAD_QUALITY = 0.82;

function isCompressibleImage(file) {
  return file?.type?.startsWith("image/") && !["image/gif", "image/svg+xml"].includes(file.type);
}

function getCanvasBlob(canvas, type = "image/jpeg", quality = IMAGE_UPLOAD_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to prepare image for upload."));
      },
      type,
      quality,
    );
  });
}

async function loadImageElement(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function optimizeImageFile(file) {
  if (!isCompressibleImage(file)) return file;

  try {
    const image = await loadImageElement(file);
    const scale = Math.min(1, IMAGE_UPLOAD_MAX_WIDTH / image.naturalWidth, IMAGE_UPLOAD_MAX_HEIGHT / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    const blob = await getCanvasBlob(canvas);
    if (blob.size >= file.size) return file;

    const optimizedName = file.name.replace(/\.[^.]+$/, "") || "product-image";
    return new File([blob], `${optimizedName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
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
      cacheControl: "3600",
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
    };
  }

  return {
    categories: business.identity.categories,
    defaultLocation: [business.location.city || countryProfile.cityPlaceholder, business.location.country || countryProfile.name].filter(Boolean).join(", "),
    deliveryAvailable: business.operations.deliveryEnabled,
    pickupAvailable: business.operations.pickupEnabled,
  };
}

export async function submitSellerProduct(form, onProgress) {
  onProgress?.("prepare");
  const [business, userId] = await Promise.all([readRegisteredBusiness(), getCurrentUserId()]);
  if (!business) throw new Error("Register a business before adding products.");

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

  // "promoted" is a publish choice, not a product status: it publishes the
  // product as active and flags it for the buyer-side advert slider.
  const wantsPromotion = form.pricing.publishStatus === "promoted";
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
    promoted: wantsPromotion,
    promoted_at: wantsPromotion ? new Date().toISOString() : null,
    published_at: status === "active" ? new Date().toISOString() : null,
  };
  const { data, error } = await withTimeout(
    insertProductPayload(payload),
    "Product save timed out. Check that the marketplace_products table and policies exist.",
  );

  if (error) throw new Error(error.message);

  if (wantsPromotion) {
    promoteSellerProduct({ name: form.basics.name.trim() }).catch(() => {});
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

  return { ...data, videoWarning };
}

export async function updateSellerProductListing(product, form, onProgress) {
  onProgress?.("prepare");
  const [business, userId] = await Promise.all([readRegisteredBusiness(), getCurrentUserId()]);
  if (!business) throw new Error("Register a business before editing products.");
  if (!product?.id) throw new Error("Choose a product listing to edit.");

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

  const wantsPromotion = form.pricing.publishStatus === "promoted";
  const status = wantsPromotion ? "active" : form.pricing.publishStatus;
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
    promoted: wantsPromotion,
    promoted_at: wantsPromotion ? product.promotedAt || new Date().toISOString() : null,
    published_at: status === "active" ? product.publishedAt || new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await withTimeout(
    updateProductPayload(product.id, business.id, payload),
    "Product update timed out. Check that the marketplace_products table and policies exist.",
  );

  if (error) throw new Error(error.message);

  if (wantsPromotion && !product.promoted) {
    promoteSellerProduct({ name: form.basics.name.trim() }).catch(() => {});
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

  return { ...data, videoWarning };
}

export async function updateSellerProduct(productId, patch) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before managing products.");

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

export async function promoteSellerProduct(product) {
  const business = await readRegisteredBusiness();
  if (!business) throw new Error("Register a business before promoting products.");

  const { error } = await supabase.from("marketplace_promotions").insert({
    business_id: business.id,
    name: `${product.name} boost`,
    product_name: product.name,
    discount_label: "Visibility boost",
    budget_spent: 0,
    budget_limit: 0,
    views: 0,
    orders: 0,
    revenue: 0,
  });

  if (error) throw new Error(error.message);
}
