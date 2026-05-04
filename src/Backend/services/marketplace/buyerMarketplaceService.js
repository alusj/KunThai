import supabase from "../../lib/supabaseClient";

function mapBuyerProduct(product) {
  const business = product.marketplace_businesses || {};
  const imageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];

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
    seller: {
      id: business.id || product.business_id,
      name: business.business_name || "Marketplace seller",
      description: business.description || "",
      city: business.city || "",
      country: business.country || "",
      phone: business.phone || "",
      whatsappEnabled: Boolean(business.whatsapp_enabled),
      whatsapp: business.whatsapp || "",
      email: business.email || "",
      logoUrl: business.logo_url || "",
      bannerUrl: business.banner_url || "",
      verificationStatus: business.verification_status || "pending",
      readinessScore: Number(business.readiness_score || 0),
    },
  };
}

const PRODUCT_SELECT = `
  id,business_id,name,description,price,discount_price,location,category,condition,brand,model,
  main_image_url,image_urls,video_url,stock,views,sales,created_at,delivery_available,pickup_available,
  delivery_time,allow_negotiation,
  marketplace_businesses (
    id,business_name,description,city,country,phone,whatsapp_enabled,whatsapp,email,logo_url,banner_url,
    verification_status,readiness_score
  )
`;

async function getCurrentUserId(message = "Sign in to continue.") {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error(message);
  return data.user.id;
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

export async function fetchBuyerMarketplaceProducts(filters = {}) {
  const query = applyProductFilters(
    supabase
      .from("marketplace_products")
      .select(PRODUCT_SELECT)
      .eq("status", "active")
      .gt("stock", 0),
    filters,
  );

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const products = sortProducts((data || []).map(mapBuyerProduct), filters.sort);

  return {
    newProducts: products,
    discountedProducts: products.filter((product) => product.discountPrice && product.discountPrice < product.price),
    highDemandProducts: [...products]
      .filter((product) => product.views > 0 || product.sales > 0)
      .sort((a, b) => b.sales + b.views - (a.sales + a.views)),
    topRatedProducts: products,
  };
}

export async function fetchBuyerProductDetail(productId) {
  if (!productId) throw new Error("Choose a product to view.");

  const { data, error } = await supabase
    .from("marketplace_products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("status", "active")
    .gt("stock", 0)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("This product is no longer available.");

  supabase.rpc("increment_marketplace_product_view", { product_id: productId }).catch(() => {});

  return mapBuyerProduct(data);
}

export async function fetchBuyerDiscoveryOptions() {
  const { data, error } = await supabase
    .from("marketplace_products")
    .select("category,location")
    .eq("status", "active")
    .gt("stock", 0);

  if (error) throw new Error(error.message);

  return {
    categories: Array.from(new Set((data || []).map((item) => item.category).filter(Boolean))).sort(),
    locations: Array.from(new Set((data || []).map((item) => item.location).filter(Boolean))).sort(),
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

export async function fetchBuyerCart() {
  const buyerId = await getCurrentUserId("Sign in to view your cart.");
  const { data, error } = await supabase
    .from("marketplace_cart_items")
    .select(`id,product_id,business_id,quantity,marketplace_products (${PRODUCT_SELECT})`)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
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

  const nextQty = Number(existing?.quantity || 0) + Number(quantity || 1);
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

export async function fetchSavedBuyerProducts() {
  const buyerId = await getCurrentUserId("Sign in to view saved products.");
  const { data, error } = await supabase
    .from("marketplace_saved_products")
    .select(`id,created_at,marketplace_products (${PRODUCT_SELECT})`)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
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
    const { data, error } = await supabase
      .from("marketplace_orders")
      .insert({
        buyer_id: buyerId,
        business_id: businessId,
        status: "pending",
        total_amount: total,
        item_count: groupItems.reduce((sum, item) => sum + item.qty, 0),
        preview: groupItems.map((item) => `${item.name} x${item.qty}`).join(", "),
        delivery_location: deliveryLocation.trim(),
      })
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    orders.push(data);
  }

  await clearBuyerCart();
  return orders;
}

export async function fetchBuyerOrders() {
  const buyerId = await getCurrentUserId("Sign in to view your orders.");
  const { data, error } = await supabase
    .from("marketplace_orders")
    .select(
      `
        id,business_id,status,total_amount,item_count,preview,delivery_location,created_at,
        marketplace_businesses (id,business_name,city,country,logo_url,verification_status)
      `,
    )
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((order) => {
    const business = order.marketplace_businesses || {};
    return {
      id: order.id,
      businessId: order.business_id,
      sellerName: business.business_name || "Marketplace seller",
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
    const key = message.conversation_key || buildConversationKey(message.business_id, message.product_id, message.topic);
    if (!acc[key]) {
      acc[key] = {
        id: key,
        conversationKey: key,
        businessId: message.business_id,
        productId: message.product_id,
        sellerName: business.business_name || "Marketplace seller",
        sellerLocation: [business.city, business.country].filter(Boolean).join(", "),
        sellerLogoUrl: business.logo_url || "",
        topic: message.topic || message.product_name || "Marketplace message",
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
      createdAt: message.created_at,
    });
    acc[key].unread = acc[key].unread || Boolean(message.unread && message.sender_role === "seller");
    acc[key].supportDispute = acc[key].supportDispute || Boolean(message.support_dispute);
    if (new Date(message.created_at).getTime() >= new Date(acc[key].createdAt).getTime()) {
      acc[key].createdAt = message.created_at;
      acc[key].preview = message.preview || "";
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

export async function sendBuyerMarketplaceMessage({ seller, product, topic, message, messageType = "message" }) {
  const buyerId = await getCurrentUserId("Sign in to message this seller.");
  const businessId = seller?.id || product?.businessId;
  if (!businessId) throw new Error("Choose a seller to message.");
  const conversationTopic = topic?.trim() || product?.name || "Marketplace message";
  const conversationKey = buildConversationKey(businessId, product?.id, conversationTopic);

  const { error } = await supabase.from("marketplace_customer_messages").insert({
    buyer_id: buyerId,
    business_id: businessId,
    product_id: product?.id || null,
    product_name: product?.name || "",
    buyer_name: "Buyer",
    topic: conversationTopic,
    preview: message.trim(),
    message_type: messageType,
    conversation_key: conversationKey,
    sender_role: "buyer",
    unread: true,
  });

  if (error) throw new Error(error.message);
  window.dispatchEvent(new CustomEvent("marketplace-message-sent"));
}

export async function fetchSellerCatalog(businessId) {
  if (!businessId) throw new Error("Choose a seller to view.");

  const { data, error } = await supabase
    .from("marketplace_products")
    .select(PRODUCT_SELECT)
    .eq("business_id", businessId)
    .eq("status", "active")
    .gt("stock", 0)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
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
}

export async function submitMarketplaceReview(seller, rating, comment) {
  const buyerId = await getCurrentUserId("Sign in to review this marketplace.");
  if (!seller?.id) throw new Error("Choose a valid seller.");

  const { error } = await supabase.from("marketplace_reviews").insert({
    buyer_id: buyerId,
    business_id: seller.id,
    product_name: seller.name || "Marketplace",
    review_type: "marketplace",
    rating: Number(rating || 0),
    comment: comment.trim(),
  });

  if (error) throw new Error(error.message);
}
