import supabase from "../../lib/supabaseClient";
import { calculateReadinessScore, readRegisteredBusiness } from "./sellerRegistrationService";

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "KT";
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function moneyTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
}

export async function fetchSellerOverview() {
  const registeredBusiness = await readRegisteredBusiness();

  if (!registeredBusiness) {
    return null;
  }

  const score = calculateReadinessScore(registeredBusiness);
  const verified = Boolean(
    registeredBusiness.trustPayout.idDocumentName ||
      registeredBusiness.trustPayout.businessDocumentName,
  );
  const todayStart = startOfDay(new Date());

  const [ordersResult, messagesResult, productsResult] = await Promise.all([
    supabase
      .from("marketplace_orders")
      .select("*")
      .eq("business_id", registeredBusiness.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("marketplace_customer_messages")
      .select("*")
      .eq("business_id", registeredBusiness.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("marketplace_products")
      .select("id,name,status,stock,low_stock_alert,price,category,created_at")
      .eq("business_id", registeredBusiness.id)
      .order("created_at", { ascending: false }),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);

  const orders = ordersResult.data || [];
  const messages = messagesResult.data || [];
  const products = productsResult.data || [];
  const todaysOrders = orders.filter((order) => new Date(order.created_at) >= todayStart);
  const todaysCompletedOrders = todaysOrders.filter((order) => order.status === "completed");
  const unreadMessages = messages.filter(
    (message) => message.unread && (message.sender_role || "buyer") === "buyer",
  );
  const lowStockProducts = products.filter((product) => {
    const stock = Number(product.stock || 0);
    const alertAt = Number(product.low_stock_alert || 0);
    return product.status === "active" && stock > 0 && stock <= alertAt;
  });

  return {
    business: {
      name: registeredBusiness.identity.businessName,
      category: registeredBusiness.identity.categories.join(", "),
      location: [registeredBusiness.location.city, registeredBusiness.location.country].filter(Boolean).join(", "),
      logoInitials: getInitials(registeredBusiness.identity.businessName),
      logoUrl: registeredBusiness.identity.logoUrl,
      bannerUrl: registeredBusiness.identity.bannerUrl,
      verified,
      verificationStatus: registeredBusiness.verificationStatus,
      verificationLabel: verified ? "Verified Seller" : "Verification Pending",
      rating: 0,
      reviewCount: 0,
    },
    storeStatus: {
      open: true,
      deliveryEnabled: registeredBusiness.operations.deliveryEnabled,
      pickupEnabled: registeredBusiness.operations.pickupEnabled,
    },
    health: {
      score,
      label: "Store setup",
      nextStep: score >= 100 ? "Your setup is complete." : "Add the remaining business details to improve trust.",
    },
    today: {
      orders: todaysOrders.length,
      revenue: moneyTotal(todaysCompletedOrders),
      pendingMessages: unreadMessages.length,
      lowStockAlerts: lowStockProducts.length,
      details: {
        orders: todaysOrders.slice(0, 8).map((order) => ({
          id: order.id,
          title: `Order ${String(order.id).slice(0, 8)}`,
          value: Number(order.total_amount || 0),
          status: order.status,
          time: new Date(order.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })),
        revenue: todaysCompletedOrders.slice(0, 8).map((order) => ({
          id: order.id,
          title: `Completed order ${String(order.id).slice(0, 8)}`,
          value: Number(order.total_amount || 0),
          status: order.status,
          time: new Date(order.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })),
        messages: unreadMessages.slice(0, 8).map((message) => ({
          id: message.id,
          title: message.buyer_name || "Buyer message",
          value: message.topic || "New message",
          status: message.message_type,
          time: new Date(message.created_at).toLocaleDateString(),
        })),
        lowStock: lowStockProducts.slice(0, 8).map((product) => ({
          id: product.id,
          title: product.name,
          value: `${product.stock} left`,
          status: product.category || "Product",
          time: `Alert at ${product.low_stock_alert}`,
        })),
      },
    },
  };
}
