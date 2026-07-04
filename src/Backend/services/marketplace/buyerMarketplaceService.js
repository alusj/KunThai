import supabase from "../../lib/supabaseClient";
import {
  filterCountryScopedItems,
  getCountryCurrencyCode,
  normalizeCountryIso,
} from "../../../data/westAfricanCountryProfiles";

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeNestedBusiness(value) {
  if (Array.isArray(value)) return value[0] || {};
  return value && typeof value === "object" ? value : {};
}

function mapBuyerProduct(product = {}) {
  const business = normalizeNestedBusiness(product.marketplace_businesses);
  const imageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];
  const countryCode = normalizeCountryIso(product.country_iso || product.country || business.country_iso || business.country);
  const currency = product.currency || business.currency || getCountryCurrencyCode(countryCode || business.country);

  return {
    id: product.id,
    businessId: product.business_id,
    name: product.name,
    description: product.description || "",
    price: Number(product.price || 0),
    discountPrice:
      product.discount_price === null || product.discount_price === undefined
        ? null
        : Number(product.discount_price || 0),
    location: product.location || "Location not added",
    category: product.category || "General",
    condition: product.condition || "new",
    brand: product.brand || "",
    model: product.model || "",
    details: product.product_attributes || {},
    imageUrl: product.main_image_url,
    imageUrls: [product.main_image_url, ...imageUrls].filter(Boolean),
    videoUrl: product.video_url || "",
    stock: Number(product.stock || 0),
    views: Number(product.views || 0),
    sales: Number(product.sales || 0),
    createdAt: product.created_at,
    deliveryAvailable: Boolean(product.delivery_available),
    pickupAvailable: Boolean(product.pickup_available),
    deliveryTime: product.delivery_time || "",
    allowNegotiation: Boolean(product.allow_negotiation),
    country: product.country || business.country || "",
    countryCode,
    currency,
    rating: Number(product.rating || 0),
    reviewCount: Number(product.review_count || 0),
    seller: {
      id: business.id || product.business_id,
      name: business.business_name || "UrMall seller",
      description: business.description || "",
      category: product.category || "General Seller",
      address: business.address || "",
      city: business.city || "",
      country: business.country || "",
      countryCode: normalizeCountryIso(business.country_iso || business.country),
      currency: business.currency || currency,
      phone: business.phone || "",
      whatsappEnabled: Boolean(business.whatsapp_enabled),
      whatsapp: business.whatsapp || "",
      email: business.email || "",
      website: business.website_url || "",
      logoUrl: business.logo_url || "",
      bannerUrl: business.banner_url || "",
      latitude: toOptionalNumber(business.latitude),
      longitude: toOptionalNumber(business.longitude),
      businessType: business.business_type || "both",
      deliveryEnabled: Boolean(business.delivery_enabled),
      pickupEnabled: Boolean(business.pickup_enabled),
      operatingDays: Array.isArray(business.operating_days) ? business.operating_days : [],
      openTime: business.open_time || "",
      closeTime: business.close_time || "",
      verificationStatus: business.verification_status || "pending",
      readinessScore: Number(business.readiness_score || 0),
      joinedAt: business.created_at || "",
    },
  };
}

const PRODUCT_SELECT = `
  id,business_id,name,description,price,discount_price,location,category,condition,brand,model,
  main_image_url,image_urls,video_url,stock,views,sales,created_at,delivery_available,pickup_available,
  delivery_time,allow_negotiation,country,country_iso,currency,
  marketplace_businesses (
    id,business_name,description,address,city,country,phone,whatsapp_enabled,whatsapp,email,website_url,
    latitude,longitude,business_type,delivery_enabled,pickup_enabled,open_time,close_time,country_iso,currency,
    logo_url,banner_url,verification_status,readiness_score,created_at
  )
`;

const PRODUCT_DETAIL_SELECT = `
  id,business_id,name,description,price,discount_price,location,category,condition,brand,model,
  product_attributes,
  main_image_url,image_urls,video_url,stock,views,sales,created_at,delivery_available,pickup_available,
  delivery_time,allow_negotiation,country,country_iso,currency,
  marketplace_businesses (
    id,business_name,description,address,city,country,phone,whatsapp_enabled,whatsapp,email,website_url,
    latitude,longitude,business_type,delivery_enabled,pickup_enabled,open_time,close_time,country_iso,currency,
    logo_url,banner_url,verification_status,readiness_score,created_at
  )
`;

const BASE_PRODUCT_SELECT = `
  id,business_id,name,description,price,discount_price,location,category,condition,brand,model,
  main_image_url,image_urls,video_url,stock,views,sales,created_at,delivery_available,pickup_available,
  delivery_time,allow_negotiation,
  marketplace_businesses (
    id,business_name,description,city,country,phone,whatsapp_enabled,whatsapp,email,
    logo_url,banner_url,verification_status,readiness_score
  )
`;

const MINIMAL_PRODUCT_SELECT = `
  id,business_id,name,description,price,discount_price,location,category,condition,brand,model,
  main_image_url,image_urls,video_url,stock,views,sales,created_at,delivery_available,pickup_available,
  delivery_time,allow_negotiation
`;

const PRODUCT_LIST_SELECTS = [PRODUCT_SELECT, BASE_PRODUCT_SELECT, MINIMAL_PRODUCT_SELECT];
const PRODUCT_DETAIL_SELECTS = [PRODUCT_DETAIL_SELECT, PRODUCT_SELECT, BASE_PRODUCT_SELECT, MINIMAL_PRODUCT_SELECT];

function isRecoverableSelectError(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "42703" ||
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("does not exist") ||
    message.includes("failed to parse select")
  );
}

async function runRecoverableSelects(selectClauses, queryFactory, fallbackMessage) {
  let lastError = null;

  for (const selectClause of selectClauses) {
    const { data, error } = await queryFactory(selectClause);
    if (!error) return data;
    if (!isRecoverableSelectError(error)) throw new Error(error.message || fallbackMessage);
    lastError = error;
  }

  throw new Error(lastError?.message || fallbackMessage);
}

async function runProductListQuery({ filters = {}, businessId = null } = {}) {
  let lastError = null;

  for (const selectClause of PRODUCT_LIST_SELECTS) {
    let query = supabase
      .from("marketplace_products")
      .select(selectClause)
      .eq("status", "active")
      .gt("stock", 0);

    if (businessId) query = query.eq("business_id", businessId);
    query = applyProductFilters(query, filters);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (!error) return data || [];
    if (!isRecoverableSelectError(error)) throw new Error(error.message);
    lastError = error;
  }

  throw new Error(lastError?.message || "Unable to load marketplace products.");
}

async function runProductDetailQuery(productId) {
  let lastError = null;

  for (const selectClause of PRODUCT_DETAIL_SELECTS) {
    const { data, error } = await supabase
      .from("marketplace_products")
      .select(selectClause)
      .eq("id", productId)
      .eq("status", "active")
      .gt("stock", 0)
      .maybeSingle();

    if (!error) return data;
    if (!isRecoverableSelectError(error)) throw new Error(error.message);
    lastError = error;
  }

  throw new Error(lastError?.message || "Unable to load product details.");
}

async function getCurrentUserId(message = "Sign in to continue.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user.id;
}

async function getCurrentBuyer(message = "Sign in to continue.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);

  const meta = data.user.user_metadata || {};
  return {
    id: data.user.id,
    name: meta.full_name || meta.name || meta.username || data.user.email?.split("@")[0] || "Buyer",
  };
}

function applyProductFilters(query, filters = {}) {
  let nextQuery = query;

  if (filters.category && filters.category !== "all") {
    nextQuery = nextQuery.eq("category", filters.category);
  }

  if (filters.location) {
    nextQuery = nextQuery.ilike("location", `%${filters.location}%`);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    nextQuery = nextQuery.or(`name.ilike.${term},description.ilike.${term},category.ilike.${term},location.ilike.${term}`);
  }

  if (filters.delivery === "delivery") nextQuery = nextQuery.eq("delivery_available", true);
  if (filters.delivery === "pickup") nextQuery = nextQuery.eq("pickup_available", true);

  if (filters.minPrice) nextQuery = nextQuery.gte("price", Number(filters.minPrice));
  if (filters.maxPrice) nextQuery = nextQuery.lte("price", Number(filters.maxPrice));

  return nextQuery;
}

function sortProducts(products, sort) {
  const sortable = [...products];

  if (sort === "price-low") return sortable.sort((a, b) => (a.discountPrice || a.price) - (b.discountPrice || b.price));
  if (sort === "price-high") return sortable.sort((a, b) => (b.discountPrice || b.price) - (a.discountPrice || a.price));
  if (sort === "popular") return sortable.sort((a, b) => b.sales + b.views - (a.sales + a.views));
  if (sort === "discount") return sortable.sort((a, b) => (b.price - (b.discountPrice || b.price)) - (a.price - (a.discountPrice || a.price)));

  return sortable.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function mapBuyerDeliveryAddress(row) {
  if (!row) return null;

  return {
    id: row.id || "",
    category: row.category || "Resident",
    customCategory: row.custom_category || "",
    fullName: row.full_name || "",
    phone: row.phone || "",
    street: row.street || "",
    note: row.delivery_note || "",
    frontPictureUrl: row.front_picture_url || "",
    detectedAddress: row.detected_address || "",
    coordinates: row.latitude && row.longitude ? { latitude: Number(row.latitude), longitude: Number(row.longitude) } : null,
  };
}

function buildDeliveryAddressPayload(address, buyerId) {
  return {
    buyer_id: buyerId,
    category: address.category || "Resident",
    custom_category: address.category === "Other" ? String(address.customCategory || "").trim() : "",
    full_name: String(address.fullName || "").trim(),
    phone: String(address.phone || "").trim(),
    street: String(address.street || "").trim(),
    delivery_note: String(address.note || "").trim(),
    front_picture_url: address.frontPictureUrl || "",
    detected_address: address.detectedAddress || "",
    latitude: address.coordinates?.latitude ?? null,
    longitude: address.coordinates?.longitude ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function insertMarketplaceOrder(payload) {
  let { data, error } = await supabase
    .from("marketplace_orders")
    .insert(payload)
    .select()
    .maybeSingle();

  const missingCountryContextColumn = (() => {
    const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
    return ["country", "country_iso", "currency"].some((column) =>
      message.includes(`'${column}'`) ||
      message.includes(`"${column}"`) ||
      message.includes(`${column} column`),
    );
  })();

  if (error && missingCountryContextColumn) {
    const { country: _country, country_iso: _countryIso, currency: _currency, ...fallbackPayload } = payload;
    const fallback = await supabase
      .from("marketplace_orders")
      .insert(fallbackPayload)
      .select()
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  return { data, error };
}

function orderCountryContext(product) {
  return {
    country: product?.country || product?.seller?.country || "",
    country_iso: product?.countryCode || product?.seller?.countryCode || "",
    currency: product?.currency || product?.seller?.currency || getCountryCurrencyCode(product?.countryCode || product?.seller?.countryCode || product?.country || product?.seller?.country),
  };
}

export async function fetchBuyerDeliveryAddress() {
  const buyerId = await getCurrentUserId("Sign in to view your delivery address.");
  const { data, error } = await supabase
    .from("marketplace_buyer_delivery_addresses")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return mapBuyerDeliveryAddress(data);
}

export async function fetchBuyerDeliveryAddresses() {
  const buyerId = await getCurrentUserId("Sign in to view your delivery addresses.");
  const { data, error } = await supabase
    .from("marketplace_buyer_delivery_addresses")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapBuyerDeliveryAddress).filter(Boolean);
}

export async function saveBuyerDeliveryAddress(address) {
  const buyerId = await getCurrentUserId("Sign in to save your delivery address.");
  const payload = buildDeliveryAddressPayload(address, buyerId);
  if (address.id && !String(address.id).startsWith("local-")) payload.id = address.id;

  const { data, error } = await supabase
    .from("marketplace_buyer_delivery_addresses")
    .upsert(payload, { onConflict: "id" })
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return mapBuyerDeliveryAddress(data);
}

export async function deleteBuyerDeliveryAddress(addressId) {
  if (!addressId || String(addressId).startsWith("local-")) return true;

  const buyerId = await getCurrentUserId("Sign in to delete your delivery address.");
  const { error } = await supabase
    .from("marketplace_buyer_delivery_addresses")
    .delete()
    .eq("id", addressId)
    .eq("buyer_id", buyerId);

  if (error) throw new Error(error.message);
  return true;
}

export async function fetchBuyerMarketplaceProducts(filters = {}) {
  const data = await runProductListQuery({ filters });
  const scoped = filterCountryScopedItems(
    (data || []).map(mapBuyerProduct),
    (product) => [product.seller?.country, product.location],
    filters.country || filters.countryCode,
  );
  const products = sortProducts(scoped.items, filters.sort);

  return {
    newProducts: products,
    discountedProducts: products.filter((product) => product.discountPrice && product.discountPrice < product.price),
    highDemandProducts: [...products]
      .filter((product) => product.views > 0 || product.sales > 0)
      .sort((a, b) => b.sales + b.views - (a.sales + a.views)),
    topRatedProducts: products,
    countryScope: scoped.scope,
    country: scoped.country,
    fallbackCountries: scoped.fallbackCountries,
  };
}

export function subscribeBuyerMarketplaceProducts(onChange) {
  const channel = supabase.channel(`marketplace-buyer-products-${crypto.randomUUID()}`);
  ["marketplace_products", "marketplace_businesses"].forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  });
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

export async function fetchBuyerProductDetail(productId) {
  if (!productId) throw new Error("Choose a product to view.");

  const data = await runProductDetailQuery(productId);
  if (!data) throw new Error("This product is no longer available.");

  try {
    await supabase.rpc("increment_marketplace_product_view", { product_id: productId });
  } catch {
    // View counts are nice to have; product details should still open.
  }

  return mapBuyerProduct(data);
}

export async function fetchBuyerDiscoveryOptions() {
  const data = await runProductListQuery();
  const scoped = filterCountryScopedItems(
    (data || []).map(mapBuyerProduct),
    (product) => [product.seller?.country, product.location],
  );
  const products = scoped.items;

  return {
    categories: Array.from(new Set(products.map((item) => item.category).filter(Boolean))).sort(),
    locations: Array.from(new Set(products.map((item) => item.location).filter(Boolean))).sort(),
  };
}

function mapCartItem(item) {
  const product = mapBuyerProduct(item.marketplace_products || {});
  const unitPrice = product.discountPrice && product.discountPrice < product.price ? product.discountPrice : product.price;

  return {
    id: item.id,
    productId: item.product_id,
    businessId: item.business_id,
    qty: Number(item.quantity || 1),
    product,
    name: product.name,
    price: unitPrice,
    imageUrl: product.imageUrl,
    location: product.location,
  };
}

function buildConversationKey(businessId, productId, topic = "") {
  return [businessId, productId || "marketplace", topic || "general"].join(":");
}

function normalizeConversationLabel(label) {
  return String(label || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function fetchBuyerCart() {
  const buyerId = await getCurrentUserId("Sign in to view your cart.");
  const data = await runRecoverableSelects(
    PRODUCT_LIST_SELECTS,
    (selectClause) =>
      supabase
        .from("marketplace_cart_items")
        .select(`id,product_id,business_id,quantity,marketplace_products (${selectClause})`)
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: false }),
    "Unable to load cart.",
  );

  return (data || []).map(mapCartItem);
}

export async function addBuyerCartItem(product, quantity = 1) {
  const buyerId = await getCurrentUserId("Sign in to add products to your cart.");
  if (!product?.id || !product?.businessId) throw new Error("Choose a valid product.");

  const { data: existing, error: existingError } = await supabase
    .from("marketplace_cart_items")
    .select("id,quantity")
    .eq("buyer_id", buyerId)
    .eq("product_id", product.id)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing) {
    window.dispatchEvent(new CustomEvent("marketplace-cart-updated"));
    return { status: "alreadyInCart", quantity: Number(existing.quantity || 1) };
  }

  const nextQty = Math.max(1, Number(quantity || 1));
  const payload = {
    buyer_id: buyerId,
    product_id: product.id,
    business_id: product.businessId,
    quantity: nextQty,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("marketplace_cart_items")
    .upsert(payload, { onConflict: "buyer_id,product_id" });

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-cart-updated"));
  return { status: "added", quantity: nextQty };
}

export async function updateBuyerCartItem(itemId, quantity) {
  const buyerId = await getCurrentUserId("Sign in to update your cart.");
  const qty = Number(quantity || 1);

  if (qty <= 0) return removeBuyerCartItem(itemId);

  const { error } = await supabase
    .from("marketplace_cart_items")
    .update({ quantity: qty, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("buyer_id", buyerId);

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-cart-updated"));
}

export async function removeBuyerCartItem(itemId) {
  const buyerId = await getCurrentUserId("Sign in to update your cart.");
  const { error } = await supabase.from("marketplace_cart_items").delete().eq("id", itemId).eq("buyer_id", buyerId);

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-cart-updated"));
}

export async function clearBuyerCart() {
  const buyerId = await getCurrentUserId("Sign in to update your cart.");
  const { error } = await supabase.from("marketplace_cart_items").delete().eq("buyer_id", buyerId);

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-cart-updated"));
}

export async function fetchSavedBuyerProductIds() {
  const buyerId = await getCurrentUserId("Sign in to view saved products.");
  const { data, error } = await supabase.from("marketplace_saved_products").select("product_id").eq("buyer_id", buyerId);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((item) => item.product_id));
}

export async function fetchSavedBuyerSellerIds() {
  const buyerId = await getCurrentUserId("Sign in to view favorite stores.");
  const { data, error } = await supabase.from("marketplace_saved_sellers").select("business_id").eq("buyer_id", buyerId);

  if (error) throw new Error(error.message);
  return new Set((data || []).map((item) => item.business_id));
}

export async function toggleSavedBuyerProduct(productId, currentlySaved) {
  const buyerId = await getCurrentUserId("Sign in to save products.");

  if (currentlySaved) {
    const { error } = await supabase
      .from("marketplace_saved_products")
      .delete()
      .eq("buyer_id", buyerId)
      .eq("product_id", productId);
    if (error) throw new Error(error.message);
    return false;
  }

  const { error } = await supabase
    .from("marketplace_saved_products")
    .upsert({ buyer_id: buyerId, product_id: productId }, { onConflict: "buyer_id,product_id" });

  if (error) throw new Error(error.message);
  return true;
}

export async function toggleSavedBuyerSeller(businessId, currentlySaved) {
  const buyerId = await getCurrentUserId("Sign in to save stores.");

  if (currentlySaved) {
    const { error } = await supabase
      .from("marketplace_saved_sellers")
      .delete()
      .eq("buyer_id", buyerId)
      .eq("business_id", businessId);
    if (error) throw new Error(error.message);
    return false;
  }

  const { error } = await supabase
    .from("marketplace_saved_sellers")
    .upsert({ buyer_id: buyerId, business_id: businessId }, { onConflict: "buyer_id,business_id" });

  if (error) throw new Error(error.message);
  return true;
}

export async function fetchSavedBuyerProducts() {
  const buyerId = await getCurrentUserId("Sign in to view saved products.");
  const data = await runRecoverableSelects(
    PRODUCT_LIST_SELECTS,
    (selectClause) =>
      supabase
        .from("marketplace_saved_products")
        .select(`id,created_at,marketplace_products (${selectClause})`)
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: false }),
    "Unable to load saved products.",
  );

  return (data || [])
    .map((item) => (item.marketplace_products ? mapBuyerProduct(item.marketplace_products) : null))
    .filter(Boolean);
}

export async function checkoutBuyerCart(deliveryLocation = "") {
  const buyerId = await getCurrentUserId("Sign in to checkout.");
  const items = await fetchBuyerCart();
  if (!items.length) throw new Error("Your cart is empty.");

  const grouped = items.reduce((acc, item) => {
    const key = item.businessId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const orders = [];
  for (const [businessId, groupItems] of Object.entries(grouped)) {
    const total = groupItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const orderContext = orderCountryContext(groupItems[0]?.product);
    const { data, error } = await insertMarketplaceOrder({
        buyer_id: buyerId,
        business_id: businessId,
        product_id: groupItems.length === 1 ? groupItems[0].productId : null,
        status: "pending",
        total_amount: total,
        item_count: groupItems.reduce((sum, item) => sum + item.qty, 0),
        preview: groupItems.map((item) => `${item.name} x${item.qty}`).join(", "),
        delivery_location: deliveryLocation.trim(),
        ...orderContext,
      });

    if (error) throw new Error(error.message);
    orders.push(data);
  }

  await clearBuyerCart();
  window.dispatchEvent(new CustomEvent("marketplace-orders-updated"));
  return orders;
}

export async function createBuyerProductOrder(product, orderInput = {}) {
  const buyer = await getCurrentBuyer("Sign in to order this product.");
  if (!product?.id || !product?.businessId) throw new Error("Choose a valid product.");

  const quantity = Math.max(1, Number(orderInput.quantity || 1));
  const unitPrice = product.discountPrice && product.discountPrice < product.price ? product.discountPrice : product.price;
  const total = Number(unitPrice || 0) * quantity;
  const buyerName = orderInput.buyerName || orderInput.fullName || "";
  const deliveryAddress = orderInput.address || orderInput.street || "";
  const addressCategory = orderInput.addressType || orderInput.category || "";
  const categoryLabel = addressCategory === "Other" && orderInput.customCategory ? orderInput.customCategory : addressCategory;
  const contact = [buyerName, orderInput.phone].filter(Boolean).join(" | ");
  const deliveryDetails = [
    orderInput.fulfillment ? `Fulfillment: ${orderInput.fulfillment}` : "",
    categoryLabel ? `${categoryLabel} address` : "",
    deliveryAddress ? `Address: ${deliveryAddress}` : "",
    contact ? `Contact: ${contact}` : "",
    orderInput.note ? `Note: ${orderInput.note}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const { data, error } = await insertMarketplaceOrder({
      buyer_id: buyer.id,
      buyer_name: buyerName.trim() || buyer.name,
      business_id: product.businessId,
      product_id: product.isVertical ? null : product.id,
      status: "pending",
      total_amount: total,
      item_count: quantity,
      preview: `${product.name} x${quantity}`,
      delivery_location: deliveryDetails,
      ...orderCountryContext(product),
    });

  if (error) throw new Error(error.message);

  window.dispatchEvent(new CustomEvent("marketplace-orders-updated"));
  window.dispatchEvent(new CustomEvent("marketplace-vertical-activity-updated", { detail: { businessId: product.businessId } }));
  return data;
}

export async function fetchBuyerOrders() {
  const buyerId = await getCurrentUserId("Sign in to view your orders.");
  const hiddenResult = await supabase
    .from("marketplace_buyer_hidden_orders")
    .select("order_id")
    .eq("buyer_id", buyerId);

  const hiddenIds = new Set((hiddenResult.data || []).map((item) => item.order_id));

  const data = await runRecoverableSelects(
    PRODUCT_LIST_SELECTS,
    (selectClause) =>
      supabase
        .from("marketplace_orders")
        .select(
          `
        id,business_id,product_id,status,total_amount,item_count,preview,delivery_location,created_at,
        marketplace_products (${selectClause}),
        marketplace_businesses (id,business_name,city,country,logo_url,verification_status)
      `,
        )
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: false }),
    "Unable to load orders.",
  );

  return (data || []).filter((order) => !hiddenIds.has(order.id)).map((order) => {
    const business = order.marketplace_businesses || {};
    const product = order.marketplace_products ? mapBuyerProduct(order.marketplace_products) : null;
    return {
      id: order.id,
      businessId: order.business_id,
      productId: order.product_id || "",
      product,
      sellerName: business.business_name || "UrMall seller",
      sellerLocation: [business.city, business.country].filter(Boolean).join(", "),
      sellerLogoUrl: business.logo_url || "",
      status: order.status,
      totalAmount: Number(order.total_amount || 0),
      itemCount: Number(order.item_count || 0),
      preview: order.preview || "",
      deliveryLocation: order.delivery_location || "",
      createdAt: order.created_at,
    };
  });
}

export async function findBuyerOrderProduct(order) {
  if (order?.product) return order.product;

  const productName = String(order?.preview || "").split(" x")[0]?.trim();
  if (!productName && !order?.businessId) return null;

  for (const selectClause of PRODUCT_LIST_SELECTS) {
    let query = supabase
      .from("marketplace_products")
      .select(selectClause)
      .eq("status", "active")
      .limit(1);

    if (order?.businessId) query = query.eq("business_id", order.businessId);
    if (productName) query = query.ilike("name", productName);

    const { data, error } = await query.maybeSingle();
    if (!error) return data ? mapBuyerProduct(data) : null;
    if (!isRecoverableSelectError(error)) return null;
  }

  return null;
}

export async function hideBuyerOrder(orderId) {
  const buyerId = await getCurrentUserId("Sign in to manage your orders.");
  const { error } = await supabase
    .from("marketplace_buyer_hidden_orders")
    .upsert({ buyer_id: buyerId, order_id: orderId }, { onConflict: "buyer_id,order_id" });

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-orders-updated"));
}

export async function cancelBuyerOrder(orderId) {
  const buyerId = await getCurrentUserId("Sign in to manage your orders.");
  const { error } = await supabase
    .from("marketplace_orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-orders-updated"));
}

export async function fetchBuyerMessages() {
  const buyerId = await getCurrentUserId("Sign in to view your messages.");
  const { data, error } = await supabase
    .from("marketplace_customer_messages")
    .select(
      `
        id,business_id,product_id,buyer_name,topic,preview,product_name,message_type,unread,support_dispute,created_at,
        conversation_key,sender_role,
        marketplace_businesses (id,business_name,city,country,logo_url)
      `,
    )
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const grouped = (data || []).reduce((acc, message) => {
    const business = message.marketplace_businesses || {};
    const sellerName = business.business_name || "UrMall seller";
    const messageConversationKey = message.conversation_key || buildConversationKey(message.business_id, message.product_id, message.topic);
    const key = normalizeConversationLabel(sellerName) || message.business_id || messageConversationKey;
    if (!acc[key]) {
      acc[key] = {
        id: key,
        conversationKey: messageConversationKey,
        businessId: message.business_id,
        productId: message.product_id,
        sellerName,
        sellerLocation: [business.city, business.country].filter(Boolean).join(", "),
        sellerLogoUrl: business.logo_url || "",
        topic: message.topic || message.product_name || "UrMall message",
        productName: message.product_name || "",
        type: message.message_type || "message",
        unread: false,
        supportDispute: false,
        createdAt: message.created_at,
        preview: "",
        messages: [],
      };
    }

    acc[key].messages.push({
      id: message.id,
      from: message.sender_role || "buyer",
      text: message.preview || "",
      topic: message.topic || message.product_name || "UrMall message",
      productName: message.product_name || "",
      createdAt: message.created_at,
    });
    acc[key].unread = acc[key].unread || Boolean(message.unread && message.sender_role === "seller");
    acc[key].supportDispute = acc[key].supportDispute || Boolean(message.support_dispute);
    if (new Date(message.created_at).getTime() >= new Date(acc[key].createdAt).getTime()) {
      acc[key].createdAt = message.created_at;
      acc[key].preview = message.preview || "";
      acc[key].conversationKey = messageConversationKey;
      acc[key].productId = message.product_id;
      acc[key].topic = message.topic || message.product_name || "UrMall message";
      acc[key].productName = message.product_name || "";
      acc[key].type = message.message_type || "message";
    }

    return acc;
  }, {});

  return Object.values(grouped)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function markBuyerMarketplaceConversationRead(conversation) {
  const buyerId = await getCurrentUserId("Sign in to update your messages.");
  const sellerMessageIds = (conversation?.messages || [])
    .filter((message) => message.from === "seller" && message.id)
    .map((message) => message.id);
  if (!sellerMessageIds.length) return;

  const { error } = await supabase
    .from("marketplace_customer_messages")
    .update({ unread: false })
    .eq("buyer_id", buyerId)
    .in("id", sellerMessageIds);

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-seller-messages-updated"));
}

export async function sendBuyerMarketplaceMessage({ seller, product, topic, message, messageType = "message" }) {
  const buyer = await getCurrentBuyer("Sign in to message this seller.");
  const businessId = seller?.id || product?.businessId;
  if (!businessId) throw new Error("Choose a seller to message.");
  const conversationTopic = topic?.trim() || product?.name || "UrMall message";
  const productId = product?.isVertical ? null : product?.id || null;
  const conversationContext = product?.isVertical ? `${product.verticalType || "listing"}:${product.id}` : productId;
  const conversationKey = buildConversationKey(businessId, conversationContext, conversationTopic);

  const { error } = await supabase.from("marketplace_customer_messages").insert({
    buyer_id: buyer.id,
    business_id: businessId,
    product_id: productId,
    product_name: product?.name || "",
    buyer_name: buyer.name,
    topic: conversationTopic,
    preview: message.trim(),
    message_type: messageType,
    conversation_key: conversationKey,
    sender_role: "buyer",
    unread: true,
  });

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-message-sent"));
  window.dispatchEvent(new CustomEvent("marketplace-seller-messages-updated"));
  window.dispatchEvent(new CustomEvent("marketplace-vertical-activity-updated", { detail: { businessId } }));
}

export async function fetchSellerCatalog(businessId) {
  if (!businessId) throw new Error("Choose a seller to view.");

  const data = await runProductListQuery({ businessId });
  return (data || []).map(mapBuyerProduct);
}

function averageRating(reviews) {
  if (!reviews.length) return 0;
  return reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
}

export async function fetchBuyerReviews({ productId, businessId, reviewType }) {
  let query = supabase
    .from("marketplace_reviews")
    .select("id,buyer_name,product_name,rating,comment,review_type,created_at")
    .eq("review_type", reviewType)
    .order("created_at", { ascending: false });

  if (reviewType === "product") query = query.eq("product_id", productId);
  if (reviewType === "marketplace") query = query.eq("business_id", businessId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const reviews = data || [];
  return {
    rating: averageRating(reviews),
    reviewCount: reviews.length,
    reviews: reviews.map((review) => ({
      id: review.id,
      buyerName: review.buyer_name || "Buyer",
      productName: review.product_name || "",
      rating: Number(review.rating || 0),
      comment: review.comment || "",
      createdAt: review.created_at,
    })),
  };
}

export async function submitProductReview(product, rating, comment) {
  const buyerId = await getCurrentUserId("Sign in to review this product.");
  if (!product?.id || !product?.businessId) throw new Error("Choose a valid product.");

  const { error } = await supabase.from("marketplace_reviews").insert({
    buyer_id: buyerId,
    business_id: product.businessId,
    product_id: product.id,
    product_name: product.name,
    review_type: "product",
    rating: Number(rating || 0),
    comment: comment.trim(),
  });

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-vertical-activity-updated", { detail: { businessId: product.businessId } }));
}

export async function submitMarketplaceReview(seller, rating, comment) {
  const buyerId = await getCurrentUserId("Sign in to review this UrMall seller.");
  if (!seller?.id) throw new Error("Choose a valid seller.");

  const { error } = await supabase.from("marketplace_reviews").insert({
    buyer_id: buyerId,
    business_id: seller.id,
    product_name: seller.name || "UrMall",
    review_type: "marketplace",
    rating: Number(rating || 0),
    comment: comment.trim(),
  });

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-vertical-activity-updated", { detail: { businessId: seller.id } }));
}
