import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

function withTimeout(promise, message, timeoutMs = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
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

  const products = (data || []).map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    price: Number(product.price || 0),
    discountPrice: product.discount_price === null ? null : Number(product.discount_price || 0),
    status: product.status,
    stock: product.stock,
    mainImageUrl: product.main_image_url,
    views: product.views,
    sales: product.sales,
    revenue: Number(product.revenue || 0),
    trend: product.sales > 0 ? "Selling" : "No sales yet",
  }));

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

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    throw new Error("You must be signed in to add products.");
  }
  return data.user.id;
}

async function uploadProductFile(userId, file, folder) {
  if (!file) return "";

  const extension = file.name.split(".").pop() || "bin";
  const path = `${userId}/products/${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await withTimeout(
    supabase.storage.from("marketplace-business-media").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    }),
    `Upload timed out for ${file.name}. Check the storage bucket policy or try a smaller file.`,
  );

  if (error) throw new Error(error.message || "Unable to upload product file.");

  const { data } = supabase.storage.from("marketplace-business-media").getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchProductFormOptions() {
  const business = await readRegisteredBusiness();
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
    defaultLocation: [business.location.city, business.location.country].filter(Boolean).join(", "),
    deliveryAvailable: business.operations.deliveryEnabled,
    pickupAvailable: business.operations.pickupEnabled,
  };
}

export async function submitSellerProduct(form, onProgress) {
  onProgress?.("Checking your seller business...");
  const [business, userId] = await Promise.all([readRegisteredBusiness(), getCurrentUserId()]);
  if (!business) throw new Error("Register a business before adding products.");

  onProgress?.("Uploading cover image...");
  const coverUrl = await uploadProductFile(userId, form.media.coverImageFile, "covers");

  onProgress?.("Uploading extra images...");
  const extraImageUrls = await Promise.all(
    form.media.extraImageFiles.map((file) => uploadProductFile(userId, file, "gallery")),
  );

  onProgress?.("Uploading product video...");
  const videoUrl = await uploadProductFile(userId, form.media.videoFile, "videos");

  const status = form.pricing.publishStatus;
  onProgress?.("Saving product details...");
  const { data, error } = await withTimeout(
    supabase
      .from("marketplace_products")
      .insert({
        business_id: business.id,
        name: form.basics.name.trim(),
        description: form.basics.description.trim(),
        category: form.basics.category,
        condition: form.basics.condition,
        brand: form.basics.brand.trim(),
        model: form.basics.model.trim(),
        price: Number(form.pricing.price || 0),
        discount_price: form.pricing.discountPrice ? Number(form.pricing.discountPrice) : null,
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
        published_at: status === "active" ? new Date().toISOString() : null,
      })
      .select()
      .maybeSingle(),
    "Product save timed out. Check that the marketplace_products table and policies exist.",
  );

  if (error) throw new Error(error.message);

  onProgress?.("Updating activity timeline...");
  withTimeout(
    supabase.from("marketplace_activities").insert({
      business_id: business.id,
      activity_type: "product",
      title: status === "draft" ? "Product saved as draft" : "Product added",
      description: `${form.basics.name.trim()} was ${status === "draft" ? "saved as a draft" : "added to your catalog"}.`,
      status: status === "draft" ? "active" : "completed",
      meta: form.basics.category,
      action_label: "View product",
    }),
    "Activity logging timed out.",
    8000,
  ).catch(() => {});

  return data;
}
